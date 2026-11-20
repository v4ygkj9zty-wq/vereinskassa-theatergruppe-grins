import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const jsonHeaders = { "Content-Type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function getSecretKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) return JSON.parse(keys).default as string;
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, getSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

  let receiptId = "";
  try {
    receiptId = String((await request.json()).receiptId ?? "");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return json({ error: "Invalid receiptId" }, 400);

  const [{ data: receipt, error: receiptError }, { data: callerProfile }] = await Promise.all([
    admin.from("receipts").select("id,receipt_no,receipt_date,created_at,amount,submitted_by,status").eq("id", receiptId).single(),
    admin.from("profiles").select("role").eq("id", userData.user.id).single()
  ]);
  if (receiptError || !receipt) return json({ error: "Receipt not found" }, 404);
  const canSend = receipt.submitted_by === userData.user.id || ["treasurer", "admin"].includes(callerProfile?.role);
  if (!canSend) return json({ error: "Forbidden" }, 403);

  const [{ data: queue }, { count: fileCount }] = await Promise.all([
    admin.from("receipt_push_queue").select("receipt_id").eq("receipt_id", receiptId).maybeSingle(),
    admin.from("receipt_files").select("id", { count: "exact", head: true }).eq("receipt_id", receiptId)
  ]);
  if (!queue || !fileCount) return json({ error: "Receipt upload is not complete" }, 409);

  const [{ data: submitter }, { data: treasurers }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", receipt.submitted_by).single(),
    admin.from("profiles").select("id").eq("role", "treasurer").eq("active", true)
  ]);
  const treasurerIds = (treasurers ?? []).map((profile) => profile.id);
  if (!treasurerIds.length) return json({ sent: 0, reason: "No active treasurer" });

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .in("user_id", treasurerIds)
    .eq("active", true);
  if (subscriptionError) return json({ error: subscriptionError.message }, 500);
  if (!subscriptions?.length) return json({ sent: 0, reason: "No active subscriptions" });

  await admin.from("receipt_push_deliveries").upsert(
    subscriptions.map((subscription) => ({ receipt_id: receiptId, subscription_id: subscription.id })),
    { onConflict: "receipt_id,subscription_id", ignoreDuplicates: true }
  );

  const { data: claimed } = await admin
    .from("receipt_push_deliveries")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("receipt_id", receiptId)
    .in("status", ["pending", "failed"])
    .select("subscription_id");
  const claimedIds = new Set((claimed ?? []).map((item) => item.subscription_id));

  const { data: privateKeyData, error: privateKeyError } = await admin.rpc("get_push_vapid_private_key");
  if (privateKeyError || !privateKeyData) return json({ error: "VAPID key is not configured" }, 500);
  const publicKey = "BIKs9c5HMGdN9rmZpB-WWdnB1HlM7_zx15_THnlHkN90roDUb3bhca7Ymdq8cqsPyxGTkPnn5I3hjcnLQIB9Smk";
  webpush.setVapidDetails("https://v4ygkj9zty-wq.github.io/vereinskassa-theatergruppe-grins/", publicKey, privateKeyData);

  const year = String(receipt.receipt_date ?? receipt.created_at ?? "").slice(0, 4) || String(new Date().getFullYear());
  const number = `#${year}-${String(receipt.receipt_no).padStart(4, "0")}`;
  const amount = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(receipt.amount));
  const payload = JSON.stringify({
    title: `Neuer Beleg ${number}`,
    body: `${submitter?.display_name ?? "Ein Mitglied"} hat einen Beleg über ${amount} hochgeladen.`,
    url: `https://v4ygkj9zty-wq.github.io/vereinskassa-theatergruppe-grins/?receipt=${receipt.id}`,
    tag: `receipt-${receipt.id}`
  });

  let sent = 0;
  for (const subscription of subscriptions) {
    if (!claimedIds.has(subscription.id)) continue;
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload, { TTL: 3600, urgency: "high" });
      sent += 1;
      await admin.from("receipt_push_deliveries").update({
        status: "sent", attempts: 1, sent_at: new Date().toISOString(), last_error: null
      }).eq("receipt_id", receiptId).eq("subscription_id", subscription.id);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
      const stale = statusCode === 404 || statusCode === 410;
      if (stale) {
        await admin.from("push_subscriptions").update({ active: false }).eq("id", subscription.id);
      }
      await admin.from("receipt_push_deliveries").update({
        status: stale ? "stale" : "failed",
        attempts: 1,
        last_error: String((error as Error).message).slice(0, 500)
      }).eq("receipt_id", receiptId).eq("subscription_id", subscription.id);
    }
  }

  const { count: remaining } = await admin.from("receipt_push_deliveries")
    .select("subscription_id", { count: "exact", head: true })
    .eq("receipt_id", receiptId).in("status", ["pending", "sending", "failed"]);
  if (!remaining) await admin.from("receipt_push_queue").update({ completed_at: new Date().toISOString() }).eq("receipt_id", receiptId);
  return json({ sent });
});

