import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://joqolbaxxqgcyrcytkbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_RGQntYSRRnTiyzamlczY3A_aRDIlp8X";
const APP_URL = "https://v4ygkj9zty-wq.github.io/vereinskassa-theatergruppe-grins/";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let categories = [];
let bankAccounts = [];
let csvRows = [];
let csvHeaders = [];

const financeRoles = ["treasurer", "deputy_treasurer", "admin", "auditor"];
const editRoles = ["treasurer", "deputy_treasurer", "admin"];

function euro(value) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function showAuthMessage(message, isError = false) {
  const el = $("authMessage");
  el.textContent = message;
  el.className = isError ? "hint error-text" : "hint success-text";
}

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.style.background = isError ? "#991b1b" : "#17313a";
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 3500);
}

function roleLabel(role) {
  const labels = {
    member: "Mitglied",
    treasurer: "Kassier",
    deputy_treasurer: "Kassierstellvertreter",
    admin: "Admin / Obmann",
    auditor: "Kassaprüfer"
  };
  return labels[role] || role;
}

function paymentLabel(method) {
  const labels = {
    private_reimbursement: "Privat bezahlt",
    club_card: "Vereinsbankomatkarte",
    cash: "Vereinskassa / Bar"
  };
  return labels[method] || method;
}

function statusBadge(status) {
  const labels = {
    submitted: "wartet auf Freigabe",
    approved: "freigegeben",
    paid: "ausbezahlt",
    rejected: "abgelehnt"
  };
  return '<span class="status ' + escapeHtml(status) + '">' + escapeHtml(labels[status] || status) + "</span>";
}

function receiptNumber(receipt) {
  const source = receipt.receipt_date || receipt.created_at || "";
  const year = source.slice(0, 4) || new Date().getFullYear();
  return "#" + year + "-" + String(receipt.receipt_no || 0).padStart(4, "0");
}

function parseMoney(value) {
  let text = String(value || "").trim().replace(/[^0-9,.-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/[.]/g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  return Number(text);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^([0-9]{1,2})[./-]([0-9]{1,2})[./-]([0-9]{2,4})/);
  if (match) {
    let year = match[3];
    if (year.length === 2) year = "20" + year;
    return year + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0");
  }
  match = text.match(/^(20[0-9]{2})-([0-9]{1,2})-([0-9]{1,2})/);
  if (match) {
    return match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
  }
  return null;
}

async function fingerprint(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function showLoggedOut() {
  $("authView").classList.remove("hidden");
  $("appView").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

function showLoggedIn() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
}

async function loadReferences() {
  const [categoryResult, accountResult] = await Promise.all([
    sb.from("categories").select("*").eq("active", true).order("name"),
    sb.from("bank_accounts").select("*").eq("active", true).order("created_at")
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (accountResult.error) throw accountResult.error;

  categories = categoryResult.data || [];
  bankAccounts = accountResult.data || [];

  $("category").innerHTML = categories
    .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
    .join("");

  $("importAccount").innerHTML = bankAccounts
    .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
    .join("");

  $("dashboardAccount").innerHTML =
    '<option value="">Alle Konten</option>' +
    bankAccounts
      .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
      .join("");
}

function buildNavigation() {
  const items = [
    ["submit", "Beleg einreichen"],
    ["my", "Meine Belege"]
  ];

  if (financeRoles.includes(currentProfile.role)) {
    items.push(["dashboard", "Dashboard"]);
  }
  if (editRoles.includes(currentProfile.role)) {
    items.push(["payouts", "Auszahlungen"]);
    items.push(["bank", "Bank & Import"]);
    items.push(["members", "Mitglieder"]);
  }

  const nav = $("nav");
  nav.innerHTML = "";

  items.forEach(([view, label]) => {
    const button = document.createElement("button");
    button.className = "btn btn-secondary";
    button.textContent = label;
    button.dataset.view = view;
    button.addEventListener("click", () => showView(view));
    nav.appendChild(button);
  });
}

async function showView(viewName) {
  document.querySelectorAll(".app-view").forEach((element) => element.classList.add("hidden"));
  const target = $("view-" + viewName);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll("#nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  if (viewName === "my") await loadMyReceipts();
  if (viewName === "dashboard") await loadDashboard();
  if (viewName === "payouts") await loadPayouts();
  if (viewName === "bank") await loadBank();
  if (viewName === "members") await loadMembers();
}

async function enterApp() {
  showLoggedIn();

  const claimResult = await sb.rpc("claim_approved_treasurer");
  if (claimResult.error) {
    console.warn("Kassierrolle konnte nicht automatisch geprüft werden:", claimResult.error.message);
  }

  const profileResult = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (profileResult.error) {
    toast("Profil konnte nicht geladen werden: " + profileResult.error.message, true);
    return;
  }

  currentProfile = profileResult.data;
  $("helloText").textContent = "Hallo " + currentProfile.display_name;
  $("roleText").textContent = roleLabel(currentProfile.role);

  try {
    await loadReferences();
    buildNavigation();
    await showView("submit");
  } catch (error) {
    toast("Daten konnten nicht geladen werden: " + error.message, true);
  }
}

async function handleLogin() {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    showAuthMessage("Bitte E-Mail-Adresse und Passwort eingeben.", true);
    return;
  }

  $("loginBtn").disabled = true;
  showAuthMessage("Anmeldung läuft …");

  const result = await sb.auth.signInWithPassword({ email, password });

  $("loginBtn").disabled = false;

  if (result.error) {
    showAuthMessage("Anmeldung nicht möglich: " + result.error.message, true);
    return;
  }

  currentUser = result.data.user;
  showAuthMessage("");
  await enterApp();
}

async function handleRegister() {
  const email = $("email").value.trim();
  const password = $("password").value;
  const displayName = $("displayName").value.trim();

  if (!displayName) {
    showAuthMessage("Bitte zuerst deinen Namen eingeben.", true);
    return;
  }
  if (!email) {
    showAuthMessage("Bitte eine E-Mail-Adresse eingeben.", true);
    return;
  }
  if (password.length < 6) {
    showAuthMessage("Das Passwort muss mindestens 6 Zeichen lang sein.", true);
    return;
  }

  $("registerBtn").disabled = true;
  showAuthMessage("Konto wird angelegt …");

  const result = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: APP_URL
    }
  });

  $("registerBtn").disabled = false;

  if (result.error) {
    showAuthMessage("Registrierung nicht möglich: " + result.error.message, true);
    return;
  }

  if (result.data.session) {
    currentUser = result.data.user;
    showAuthMessage("Konto wurde angelegt.");
    await enterApp();
    return;
  }

  showAuthMessage(
    "Konto wurde angelegt. Bitte prüfe dein E-Mail-Postfach und bestätige die Registrierung. Danach hier anmelden."
  );
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showLoggedOut();
}

async function runOCR(file) {
  $("ocrStatus").textContent = "Beleg wird automatisch gelesen …";

  try {
    const Tesseract = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm");
    const result = await Tesseract.recognize(file, "deu");
    const text = result.data.text || "";
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    if (!$("merchant").value && lines.length) {
      $("merchant").value = lines.find((line) => line.length > 2 && line.length < 70) || lines[0];
    }

    const dateMatch = text.match(/\b([0-9]{1,2})[./-]([0-9]{1,2})[./-](20[0-9]{2})\b/);
    if (dateMatch && !$("receiptDate").value) {
      $("receiptDate").value =
        dateMatch[3] +
        "-" +
        dateMatch[2].padStart(2, "0") +
        "-" +
        dateMatch[1].padStart(2, "0");
    }

    const totalLines = lines.filter((line) => /gesamt|summe|total|betrag|zu zahlen/i.test(line));
    const sourceLines = totalLines.length ? totalLines : lines;
    const values = [];

    sourceLines.forEach((line) => {
      const matches = line.match(/[0-9]{1,5}[.,][0-9]{2}/g) || [];
      matches.forEach((match) => {
        const number = parseMoney(match);
        if (number > 0 && number < 100000) values.push(number);
      });
    });

    if (values.length && !$("amount").value) {
      $("amount").value = Math.max(...values).toFixed(2);
    }

    const invoiceMatch = text.match(/(?:rechnung|beleg|bon)[-\s]*(?:nr\.?|nummer)?[:\s#-]*([A-Z0-9/-]{3,})/i);
    if (invoiceMatch && !$("invoiceNumber").value) {
      $("invoiceNumber").value = invoiceMatch[1];
    }

    $("ocrStatus").textContent = "Automatische Erkennung abgeschlossen – bitte Werte kontrollieren.";
  } catch (error) {
    console.error(error);
    $("ocrStatus").textContent = "Automatische Erkennung nicht möglich – bitte Daten manuell eingeben.";
  }
}

async function submitReceipt() {
  const file = $("receiptFile").files[0];
  const amount = Number($("amount").value);
  const purpose = $("purpose").value.trim();

  if (!file) {
    toast("Bitte zuerst ein Foto oder PDF auswählen.", true);
    return;
  }
  if (!amount || amount <= 0) {
    toast("Bitte einen gültigen Betrag eingeben.", true);
    return;
  }
  if (!purpose) {
    toast("Bitte den Verwendungszweck eingeben.", true);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast("Der Beleg ist größer als 10 MB.", true);
    return;
  }

  $("submitReceiptBtn").disabled = true;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = currentUser.id + "/" + Date.now() + "_" + safeName;

  const uploadResult = await sb.storage
    .from("receipt-files")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadResult.error) {
    $("submitReceiptBtn").disabled = false;
    toast("Beleg-Upload fehlgeschlagen: " + uploadResult.error.message, true);
    return;
  }

  const insertResult = await sb
    .from("receipts")
    .insert({
      submitted_by: currentUser.id,
      merchant: $("merchant").value.trim() || null,
      receipt_date: $("receiptDate").value || null,
      invoice_number: $("invoiceNumber").value.trim() || null,
      amount,
      purpose,
      category_id: $("category").value || null,
      payment_method: $("paymentMethod").value,
      status: "submitted"
    })
    .select()
    .single();

  if (insertResult.error) {
    await sb.storage.from("receipt-files").remove([storagePath]);
    $("submitReceiptBtn").disabled = false;
    toast("Beleg konnte nicht gespeichert werden: " + insertResult.error.message, true);
    return;
  }

  const fileLinkResult = await sb.from("receipt_files").insert({
    receipt_id: insertResult.data.id,
    provider: "supabase",
    item_id: storagePath,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size
  });

  if (fileLinkResult.error) {
    console.warn("Dateiverknüpfung:", fileLinkResult.error.message);
  }

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "receipt",
    entity_id: insertResult.data.id,
    action: "submitted",
    details: { payment_method: $("paymentMethod").value }
  });

  ["merchant", "receiptDate", "amount", "invoiceNumber", "purpose"].forEach((id) => {
    $(id).value = "";
  });
  $("receiptFile").value = "";
  $("ocrStatus").textContent = "";
  $("submitReceiptBtn").disabled = false;

  toast("Beleg wurde eingereicht.");
  await showView("my");
}

async function openReceiptFile(path) {
  const result = await sb.storage.from("receipt-files").createSignedUrl(path, 300);
  if (result.error) {
    toast("Beleg konnte nicht geöffnet werden: " + result.error.message, true);
    return;
  }
  window.open(result.data.signedUrl, "_blank", "noopener");
}

async function loadMyReceipts() {
  const result = await sb
    .from("receipts")
    .select("*,categories(name),receipt_files(*)")
    .order("created_at", { ascending: false });

  if (result.error) {
    toast(result.error.message, true);
    return;
  }

  const rows = result.data || [];
  if (!rows.length) {
    $("myReceipts").innerHTML = '<p class="hint">Noch keine Belege.</p>';
    return;
  }

  $("myReceipts").innerHTML = rows
    .map((receipt) => {
      const file = receipt.receipt_files && receipt.receipt_files[0];
      return (
        '<div class="list-row">' +
        "<div>" +
        "<strong>" +
        escapeHtml(receiptNumber(receipt)) +
        " · " +
        escapeHtml(receipt.merchant || "Ohne Händler") +
        "</strong>" +
        "<div>" +
        statusBadge(receipt.status) +
        " · " +
        escapeHtml(paymentLabel(receipt.payment_method)) +
        "</div>" +
        '<div class="hint">' +
        escapeHtml(receipt.purpose) +
        " · " +
        escapeHtml(receipt.categories?.name || "") +
        "</div>" +
        (receipt.rejection_reason
          ? '<div class="hint error-text">Grund: ' + escapeHtml(receipt.rejection_reason) + "</div>"
          : "") +
        "</div>" +
        '<div class="list-actions">' +
        '<strong class="money">' +
        euro(receipt.amount) +
        "</strong>" +
        (file
          ? '<button class="btn btn-secondary open-file-btn" data-path="' +
            escapeHtml(file.item_id) +
            '">Beleg</button>'
          : "") +
        "</div>" +
        "</div>"
      );
    })
    .join("");

  document.querySelectorAll(".open-file-btn").forEach((button) => {
    button.addEventListener("click", () => openReceiptFile(button.dataset.path));
  });
}

function receiptAccountingDate(receipt) {
  return receipt.receipt_date || String(receipt.created_at || "").slice(0, 10);
}

function daysApart(dateA, dateB) {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 9999;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

function hasLikelyBankMatch(receipt, transactions) {
  if (receipt.payment_method === "cash") return false;
  const receiptDate = receiptAccountingDate(receipt);
  const amount = Number(receipt.amount);

  return transactions.some((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (transaction.receipt_id && transaction.receipt_id !== receipt.id) return false;

    const sameAmount = Math.abs(Math.abs(Number(transaction.amount)) - amount) < 0.01;
    const closeDate = daysApart(receiptDate, transaction.booking_date) <= 7;
    return sameAmount && closeDate;
  });
}

async function loadDashboard() {
  const [receiptResult, transactionResult, accountResult] = await Promise.all([
    sb.from("receipts").select("*"),
    sb.from("bank_transactions").select("*"),
    sb.from("bank_accounts").select("*").eq("active", true)
  ]);

  if (receiptResult.error) return toast(receiptResult.error.message, true);
  if (transactionResult.error) return toast(transactionResult.error.message, true);
  if (accountResult.error) return toast(accountResult.error.message, true);

  const receipts = receiptResult.data || [];
  const transactions = transactionResult.data || [];
  const accounts = accountResult.data || [];

  const years = new Set([new Date().getFullYear()]);
  transactions.forEach((item) => years.add(Number(item.booking_date.slice(0, 4))));
  receipts.forEach((item) => {
    const date = receiptAccountingDate(item);
    if (date) years.add(Number(date.slice(0, 4)));
  });

  const selectedYear = Number($("dashboardYear").value || Math.max(...years));
  $("dashboardYear").innerHTML = Array.from(years)
    .sort((a, b) => b - a)
    .map((year) => '<option value="' + year + '"' + (year === selectedYear ? " selected" : "") + ">" + year + "</option>")
    .join("");

  const selectedAccount = $("dashboardAccount").value || "";
  const accountTransactions = selectedAccount
    ? transactions.filter((item) => item.bank_account_id === selectedAccount)
    : transactions;

  const yearTransactions = accountTransactions.filter(
    (item) => Number(item.booking_date.slice(0, 4)) === selectedYear
  );

  const selectedAccounts = selectedAccount
    ? accounts.filter((item) => item.id === selectedAccount)
    : accounts;

  const balance =
    accountTransactions.reduce((sum, item) => sum + Number(item.amount), 0) +
    selectedAccounts.reduce((sum, item) => sum + Number(item.opening_balance || 0), 0);

  const income = yearTransactions
    .filter((item) => Number(item.amount) > 0)
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const approvedReceiptsForYear = receipts.filter((item) => {
    if (!["approved", "paid"].includes(item.status)) return false;
    const date = receiptAccountingDate(item);
    return date && Number(date.slice(0, 4)) === selectedYear;
  });

  const linkedReceiptIds = new Set(
    yearTransactions
      .map((item) => item.receipt_id)
      .filter(Boolean)
  );

  const supplementalReceipts = selectedAccount
    ? []
    : approvedReceiptsForYear.filter((receipt) => {
        if (linkedReceiptIds.has(receipt.id)) return false;
        return !hasLikelyBankMatch(receipt, yearTransactions);
      });

  const bankExpense = Math.abs(
    yearTransactions
      .filter((item) => Number(item.amount) < 0)
      .reduce((sum, item) => sum + Number(item.amount), 0)
  );

  const receiptExpense = supplementalReceipts.reduce(
    (sum, receipt) => sum + Number(receipt.amount),
    0
  );

  const expense = bankExpense + receiptExpense;

  const payout = receipts
    .filter((item) => item.status === "approved" && item.payment_method === "private_reimbursement")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  $("statBalance").textContent = euro(balance);
  $("statIncome").textContent = euro(income);
  $("statExpense").textContent = euro(expense);
  $("statPayout").textContent = euro(payout);

  renderMonthChart(yearTransactions, supplementalReceipts);
  renderApprovalList(receipts.filter((item) => item.status === "submitted"));
}

function renderMonthChart(transactions, supplementalReceipts = []) {
  const months = Array.from({ length: 12 }, (_, index) => ({ index, income: 0, expense: 0 }));

  transactions.forEach((item) => {
    const month = Number(item.booking_date.slice(5, 7)) - 1;
    if (month < 0 || month > 11) return;
    if (Number(item.amount) >= 0) months[month].income += Number(item.amount);
    else months[month].expense += Math.abs(Number(item.amount));
  });

  supplementalReceipts.forEach((receipt) => {
    const date = receiptAccountingDate(receipt);
    const month = date ? Number(date.slice(5, 7)) - 1 : -1;
    if (month < 0 || month > 11) return;
    months[month].expense += Number(receipt.amount);
  });

  const maximum = Math.max(
    1,
    ...months.flatMap((item) => [item.income, item.expense])
  );

  $("monthChart").innerHTML = months
    .map((item) => {
      return (
        '<div class="month-row">' +
        '<div class="month-label">' +
        String(item.index + 1).padStart(2, "0") +
        "</div>" +
        '<div class="month-value"><span>+' +
        euro(item.income) +
        '</span><div class="bar"><i style="width:' +
        (item.income / maximum) * 100 +
        '%"></i></div></div>' +
        '<div class="month-value"><span>-' +
        euro(item.expense) +
        '</span><div class="bar"><i class="expense-bar" style="width:' +
        (item.expense / maximum) * 100 +
        '%"></i></div></div></div>'
      );
    })
    .join("");
}

function renderApprovalList(receipts) {
  if (!receipts.length) {
    $("approvalList").innerHTML = '<p class="hint">Keine offenen Belege.</p>';
    return;
  }

  $("approvalList").innerHTML = receipts
    .map((receipt) => {
      return (
        '<div class="list-row">' +
        "<div><strong>" +
        escapeHtml(receiptNumber(receipt)) +
        " · " +
        escapeHtml(receipt.merchant || "Ohne Händler") +
        '</strong><div class="hint">' +
        escapeHtml(receipt.purpose) +
        " · " +
        escapeHtml(paymentLabel(receipt.payment_method)) +
        "</div></div>" +
        '<div class="list-actions"><strong class="money">' +
        euro(receipt.amount) +
        '</strong><button class="btn btn-primary approve-btn" data-id="' +
        escapeHtml(receipt.id) +
        '">Freigeben</button>' +
        '<button class="btn btn-danger reject-btn" data-id="' +
        escapeHtml(receipt.id) +
        '">Ablehnen</button></div></div>'
      );
    })
    .join("");

  document.querySelectorAll(".approve-btn").forEach((button) => {
    button.addEventListener("click", () => approveReceipt(button.dataset.id));
  });

  document.querySelectorAll(".reject-btn").forEach((button) => {
    button.addEventListener("click", () => rejectReceipt(button.dataset.id));
  });
}

async function approveReceipt(id) {
  const result = await sb
    .from("receipts")
    .update({
      status: "approved",
      approved_by: currentUser.id,
      approved_at: new Date().toISOString(),
      rejection_reason: null
    })
    .eq("id", id);

  if (result.error) return toast(result.error.message, true);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "receipt",
    entity_id: id,
    action: "approved"
  });

  toast("Beleg freigegeben.");
  await loadDashboard();
}

async function rejectReceipt(id) {
  const reason = window.prompt("Grund der Ablehnung:");
  if (reason === null) return;

  const result = await sb
    .from("receipts")
    .update({
      status: "rejected",
      rejection_reason: reason,
      approved_by: currentUser.id,
      approved_at: new Date().toISOString()
    })
    .eq("id", id);

  if (result.error) return toast(result.error.message, true);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "receipt",
    entity_id: id,
    action: "rejected",
    details: { reason }
  });

  toast("Beleg abgelehnt.");
  await loadDashboard();
}

async function loadPayouts() {
  const result = await sb
    .from("receipts")
    .select("*,profiles!receipts_submitted_by_fkey(display_name)")
    .eq("status", "approved")
    .eq("payment_method", "private_reimbursement")
    .order("approved_at");

  if (result.error) return toast(result.error.message, true);

  const rows = result.data || [];
  if (!rows.length) {
    $("payoutList").innerHTML = '<p class="hint">Keine offenen Rückerstattungen.</p>';
    return;
  }

  $("payoutList").innerHTML = rows
    .map((receipt) => {
      return (
        '<div class="list-row">' +
        "<div><strong>" +
        escapeHtml(receipt.profiles?.display_name || "Mitglied") +
        '</strong><div class="hint">' +
        escapeHtml(receiptNumber(receipt)) +
        " · " +
        escapeHtml(receipt.purpose) +
        "</div></div>" +
        '<div class="list-actions"><strong class="money">' +
        euro(receipt.amount) +
        '</strong><button class="btn btn-primary paid-btn" data-id="' +
        escapeHtml(receipt.id) +
        '">Als ausbezahlt markieren</button></div></div>'
      );
    })
    .join("");

  document.querySelectorAll(".paid-btn").forEach((button) => {
    button.addEventListener("click", () => markPaid(button.dataset.id));
  });
}

async function markPaid(id) {
  if (!window.confirm("Wurde der Betrag wirklich im Onlinebanking überwiesen?")) return;

  const result = await sb
    .from("receipts")
    .update({
      status: "paid",
      paid_by: currentUser.id,
      paid_at: new Date().toISOString()
    })
    .eq("id", id);

  if (result.error) return toast(result.error.message, true);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "receipt",
    entity_id: id,
    action: "paid"
  });

  toast("Auszahlung als erledigt markiert.");
  await loadPayouts();
}

async function loadBank() {
  await loadReferences();

  const transactionResult = await sb
    .from("bank_transactions")
    .select("*")
    .order("booking_date", { ascending: false })
    .limit(1000);

  if (transactionResult.error) return toast(transactionResult.error.message, true);

  $("bankAccounts").innerHTML = bankAccounts
    .map((account) => {
      return (
        '<div class="list-row"><div><strong>' +
        escapeHtml(account.name) +
        '</strong><div class="hint">Anfangsbestand ' +
        euro(account.opening_balance || 0) +
        '</div></div><button class="btn btn-secondary edit-account-btn" data-id="' +
        escapeHtml(account.id) +
        '">Bearbeiten</button></div>'
      );
    })
    .join("");

  document.querySelectorAll(".edit-account-btn").forEach((button) => {
    button.addEventListener("click", () => editBankAccount(button.dataset.id));
  });

  const missing = (transactionResult.data || []).filter(
    (item) => Number(item.amount) < 0 && !item.receipt_id
  );

  $("missingReceipts").innerHTML = missing.length
    ? missing
        .slice(0, 100)
        .map((item) => {
          return (
            '<div class="list-row"><div><strong>' +
            escapeHtml(item.description || "Buchung") +
            '</strong><div class="hint">' +
            escapeHtml(item.booking_date) +
            " · " +
            escapeHtml(item.counterparty || "") +
            '</div></div><strong class="money">' +
            euro(item.amount) +
            "</strong></div>"
          );
        })
        .join("")
    : '<p class="hint">Keine offenen Bankausgaben ohne Beleg.</p>';
}

async function editBankAccount(id) {
  const account = bankAccounts.find((item) => item.id === id);
  if (!account) return;

  const name = window.prompt("Kontoname:", account.name);
  if (!name) return;

  const balanceText = window.prompt("Anfangsbestand (€):", String(account.opening_balance || 0));
  if (balanceText === null) return;

  const openingBalance = parseMoney(balanceText);
  if (!Number.isFinite(openingBalance)) {
    toast("Ungültiger Anfangsbestand.", true);
    return;
  }

  const result = await sb
    .from("bank_accounts")
    .update({ name, opening_balance: openingBalance })
    .eq("id", id);

  if (result.error) return toast(result.error.message, true);

  toast("Bankkonto gespeichert.");
  await loadBank();
}

async function handleBankFile(file) {
  if (!file) return;

  const Papa = await import("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm");
  const parsed = Papa.default.parse(await file.text(), {
    header: true,
    skipEmptyLines: true
  });

  csvRows = parsed.data || [];
  csvHeaders = parsed.meta.fields || [];

  if (!csvHeaders.length) {
    toast("Keine CSV-Spalten erkannt.", true);
    return;
  }

  const mappingIds = ["mapDate", "mapAmount", "mapDescription", "mapCounterparty"];
  mappingIds.forEach((id) => {
    $(id).innerHTML =
      '<option value="">–</option>' +
      csvHeaders
        .map((header) => '<option value="' + escapeHtml(header) + '">' + escapeHtml(header) + "</option>")
        .join("");
  });

  const findHeader = (regex) => csvHeaders.find((header) => regex.test(header)) || "";
  $("mapDate").value = findHeader(/datum|date|buchung/i);
  $("mapAmount").value = findHeader(/betrag|amount|umsatz|wert/i);
  $("mapDescription").value = findHeader(/verwendung|text|beschreibung|zweck|buchung/i);
  $("mapCounterparty").value = findHeader(/empf|auftrag|gegen|partner|name/i);

  $("mappingBox").classList.remove("hidden");

  $("bankPreview").innerHTML =
    "<table><thead><tr>" +
    csvHeaders.map((header) => "<th>" + escapeHtml(header) + "</th>").join("") +
    "</tr></thead><tbody>" +
    csvRows
      .slice(0, 5)
      .map(
        (row) =>
          "<tr>" +
          csvHeaders.map((header) => "<td>" + escapeHtml(row[header] || "") + "</td>").join("") +
          "</tr>"
      )
      .join("") +
    "</tbody></table>";
}

async function importBankCsv() {
  const accountId = $("importAccount").value;
  const dateColumn = $("mapDate").value;
  const amountColumn = $("mapAmount").value;
  const descriptionColumn = $("mapDescription").value;
  const counterpartyColumn = $("mapCounterparty").value;
  const file = $("bankFile").files[0];

  if (!accountId || !dateColumn || !amountColumn || !file) {
    toast("Bitte Konto, Datumsspalte und Betragsspalte auswählen.", true);
    return;
  }

  $("importBankBtn").disabled = true;

  const sourcePath =
    currentUser.id +
    "/" +
    Date.now() +
    "_" +
    file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadResult = await sb.storage
    .from("bank-files")
    .upload(sourcePath, file, { contentType: file.type || "text/csv", upsert: false });

  if (uploadResult.error) {
    $("importBankBtn").disabled = false;
    return toast(uploadResult.error.message, true);
  }

  const importResult = await sb
    .from("bank_imports")
    .insert({
      bank_account_id: accountId,
      imported_by: currentUser.id,
      source_filename: file.name,
      source_path: sourcePath,
      source_mime_type: file.type || "text/csv",
      historical: true
    })
    .select()
    .single();

  if (importResult.error) {
    $("importBankBtn").disabled = false;
    return toast(importResult.error.message, true);
  }

  const rows = [];

  for (const row of csvRows) {
    const bookingDate = normalizeDate(row[dateColumn]);
    const amount = parseMoney(row[amountColumn]);
    if (!bookingDate || !Number.isFinite(amount)) continue;

    const description = descriptionColumn ? String(row[descriptionColumn] || "").trim() : "";
    const counterparty = counterpartyColumn ? String(row[counterpartyColumn] || "").trim() : "";

    rows.push({
      bank_account_id: accountId,
      import_id: importResult.data.id,
      booking_date: bookingDate,
      amount,
      description,
      counterparty,
      kind: amount >= 0 ? "income" : "expense",
      fingerprint: await fingerprint(
        accountId + "|" + bookingDate + "|" + amount.toFixed(2) + "|" + description + "|" + counterparty
      )
    });
  }

  let added = 0;

  for (let index = 0; index < rows.length; index += 200) {
    const batchResult = await sb
      .from("bank_transactions")
      .upsert(rows.slice(index, index + 200), {
        onConflict: "bank_account_id,fingerprint",
        ignoreDuplicates: true
      })
      .select("id");

    if (batchResult.error) {
      $("importBankBtn").disabled = false;
      return toast(batchResult.error.message, true);
    }

    added += (batchResult.data || []).length;
  }

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "bank_import",
    entity_id: importResult.data.id,
    action: "imported",
    details: { rows: rows.length }
  });

  $("importBankBtn").disabled = false;
  $("mappingBox").classList.add("hidden");
  $("bankFile").value = "";

  toast("Bankimport abgeschlossen: " + added + " neue Buchungen.");
  await loadBank();
}

async function loadMembers() {
  const result = await sb.from("profiles").select("*").order("display_name");

  if (result.error) return toast(result.error.message, true);

  $("membersList").innerHTML = (result.data || [])
    .map((member) => {
      return (
        '<div class="list-row"><div><strong>' +
        escapeHtml(member.display_name) +
        '</strong><div class="hint">' +
        escapeHtml(roleLabel(member.role)) +
        '</div></div><select class="role-select" data-id="' +
        escapeHtml(member.id) +
        '">' +
        '<option value="member"' +
        (member.role === "member" ? " selected" : "") +
        ">Mitglied</option>" +
        '<option value="treasurer"' +
        (member.role === "treasurer" ? " selected" : "") +
        ">Kassier</option>" +
        '<option value="deputy_treasurer"' +
        (member.role === "deputy_treasurer" ? " selected" : "") +
        ">Kassierstellvertreter</option>" +
        '<option value="admin"' +
        (member.role === "admin" ? " selected" : "") +
        ">Admin / Obmann</option>" +
        '<option value="auditor"' +
        (member.role === "auditor" ? " selected" : "") +
        ">Kassaprüfer</option>" +
        "</select></div>"
      );
    })
    .join("");

  document.querySelectorAll(".role-select").forEach((select) => {
    select.addEventListener("change", () => updateRole(select.dataset.id, select.value));
  });
}

async function updateRole(id, role) {
  const result = await sb.from("profiles").update({ role }).eq("id", id);

  if (result.error) {
    toast("Rolle konnte nicht geändert werden: " + result.error.message, true);
    await loadMembers();
    return;
  }

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "profile",
    entity_id: id,
    action: "role_changed",
    details: { role }
  });

  toast("Rolle gespeichert.");
}

$("toggleRegisterBtn").addEventListener("click", () => {
  $("registerBox").classList.toggle("hidden");
});

$("loginBtn").addEventListener("click", handleLogin);
$("registerBtn").addEventListener("click", handleRegister);
$("logoutBtn").addEventListener("click", handleLogout);
$("submitReceiptBtn").addEventListener("click", submitReceipt);

$("receiptFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.type.startsWith("image/")) {
    await runOCR(file);
  } else {
    $("ocrStatus").textContent = "PDF gewählt – Daten bitte kontrollieren und ergänzen.";
  }
});

$("dashboardYear").addEventListener("change", loadDashboard);
$("dashboardAccount").addEventListener("change", loadDashboard);

$("bankFile").addEventListener("change", (event) => {
  handleBankFile(event.target.files[0]);
});

$("importBankBtn").addEventListener("click", importBankCsv);

sb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showLoggedOut();
  }
});

const sessionResult = await sb.auth.getSession();
if (sessionResult.data.session) {
  currentUser = sessionResult.data.session.user;
  await enterApp();
} else {
  showLoggedOut();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service Worker:", error);
    });
  });
}
