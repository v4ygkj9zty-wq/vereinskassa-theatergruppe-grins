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
let dashboardTransactions = [];

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

  const categoryOptions = categories
    .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
    .join("");
  $("category").innerHTML = categoryOptions;
  if ($("incomeCategory")) $("incomeCategory").innerHTML = categoryOptions;

  $("importAccount").innerHTML = bankAccounts
    .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
    .join("");

  const accountOptions =
    '<option value="">Alle Konten</option>' +
    bankAccounts
      .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
      .join("");

  $("dashboardAccount").innerHTML = accountOptions;
  if ($("auditAccount")) $("auditAccount").innerHTML = accountOptions;
  if ($("incomeAccount")) $("incomeAccount").innerHTML = bankAccounts
    .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + "</option>")
    .join("");
}

function buildNavigation() {
  const items = [
    ["submit", "Beleg einreichen"],
    ["my", "Meine Belege"]
  ];

  if (financeRoles.includes(currentProfile.role)) {
    items.push(["income", "Geldeingang"]);
    items.push(["dashboard", "Dashboard"]);
    items.push(["audit", "Kassenprüfung / Export"]);
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

  if (viewName === "income") await loadIncome();
  if (viewName === "my") await loadMyReceipts();
  if (viewName === "dashboard") await loadDashboard();
  if (viewName === "payouts") await loadPayouts();
  if (viewName === "bank") await loadBank();
  if (viewName === "audit") await loadAudit();
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
  renderIbanStatus();

  try {
    await loadReferences();
    buildNavigation();
    await showView("submit");
  } catch (error) {
    toast("Daten konnten nicht geladen werden: " + error.message, true);
  }
}

function formatIban(iban) {
  return String(iban || "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function renderIbanStatus() {
  if (!$("ibanStatus")) return;
  $("ibanStatus").textContent = currentProfile?.iban
    ? "IBAN: " + formatIban(currentProfile.iban)
    : "IBAN noch nicht hinterlegt";
}

async function editOwnIban() {
  const value = window.prompt(
    "Deine IBAN für Rückerstattungen:",
    currentProfile?.iban ? formatIban(currentProfile.iban) : ""
  );
  if (value === null) return;

  const iban = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) {
    return toast("Bitte eine gültige IBAN eingeben.", true);
  }

  const result = await sb.from("profiles").update({ iban: iban || null }).eq("id", currentUser.id).select().single();
  if (result.error) return toast("IBAN konnte nicht gespeichert werden: " + result.error.message, true);

  currentProfile = result.data;
  renderIbanStatus();
  toast("IBAN wurde gespeichert.");
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

function scoreReceiptAmountLine(line, value) {
  const lower = line.toLowerCase();
  let score = 0;
  if (/zu zahlen|zahlbetrag|endbetrag|rechnungsbetrag|gesamtbetrag|gesamt|summe|total|betrag|kartenzahlung|barzahlung/.test(lower)) score += 12;
  if (/eur|€/.test(lower)) score += 3;
  if (/brutto/.test(lower)) score += 2;
  if (/mwst|ust|steuer|netto|gegeben|rückgeld|ruckgeld|wechselgeld|rabatt|ersparnis/.test(lower)) score -= 8;
  if (value > 0) score += Math.min(3, Math.log10(value + 1));
  return score;
}

function detectReceiptAmount(lines) {
  const candidates = [];
  lines.forEach((line, index) => {
    const matches = line.match(/(?:€\s*)?\d{1,6}(?:[.\s]\d{3})*[,.]\d{2}(?:\s*€|\s*EUR)?/gi) || [];
    matches.forEach((raw) => {
      const value = parseMoney(raw.replace(/\s/g, ""));
      if (!Number.isFinite(value) || value <= 0 || value >= 100000) return;
      candidates.push({ value, score: scoreReceiptAmountLine(line, value), index, line });
    });
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.index - a.index || b.value - a.value);
  const best = candidates[0];
  if (best.score >= 4) return best.value;

  // If OCR did not recognise labels, totals are usually among the last monetary
  // values on a receipt. Prefer the largest value in the lower half.
  const lowerHalf = candidates.filter((x) => x.index >= Math.floor(lines.length * 0.45));
  const pool = lowerHalf.length ? lowerHalf : candidates;
  return pool.sort((a, b) => b.value - a.value)[0].value;
}

function detectReceiptDate(text) {
  const patterns = [
    /\b([0-3]?\d)[./-]([01]?\d)[./-](20\d{2})\b/,
    /\b(20\d{2})[./-]([01]?\d)[./-]([0-3]?\d)\b/,
    /\b([0-3]?\d)[./-]([01]?\d)[./-](\d{2})\b/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (!match) continue;
    let year, month, day;
    if (i === 1) {
      year = match[1]; month = match[2]; day = match[3];
    } else {
      day = match[1]; month = match[2]; year = match[3];
      if (year.length === 2) year = "20" + year;
    }
    const iso = year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");
    const date = new Date(iso + "T00:00:00");
    if (!Number.isNaN(date.getTime()) && date <= new Date()) return iso;
  }
  return null;
}

function detectMerchant(lines) {
  const ignore = /^(rechnung|kassenbon|beleg|quittung|rechnung nr|bon nr|datum|ust|uid|tel|telefon|www\.|http|eur|summe|gesamt)/i;
  const candidates = lines.slice(0, Math.min(12, lines.length))
    .map((line, index) => ({ line: line.replace(/\s+/g, " ").trim(), index }))
    .filter((x) => x.line.length >= 3 && x.line.length <= 65 && !ignore.test(x.line))
    .map((x) => {
      let score = 10 - x.index * 0.45;
      if (/[A-Za-zÄÖÜäöüß]{3}/.test(x.line)) score += 4;
      if (/gmbh|kg|og|ag|hotel|gasthof|restaurant|markt|apotheke|hofer|lidl|mpreis|spar|billa|bauhaus/i.test(x.line)) score += 5;
      if (/@|iban|uid|fn\s?\d|straße|strasse|\d{4}\s+[A-Za-z]/i.test(x.line)) score -= 3;
      return { ...x, score };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.line || "";
}

function detectInvoiceNumber(text) {
  const patterns = [
    /(?:rechnung|invoice)\s*(?:nr\.?|nummer|no\.?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
    /(?:beleg|bon)\s*(?:nr\.?|nummer|no\.?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

async function prepareImageForOcr(file) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxWidth = 2200;
    const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.filter = "grayscale(1) contrast(1.35)";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.92));
  } catch {
    return file;
  }
}

async function extractPdfNativeText(file) {
  const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const texts = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 5); pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => item.str || "").join(" "));
  }
  return texts.join("\\n").replace(/\s+/g, " ").trim();
}

async function pdfPagesForOcr(file) {
  const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  const pageCount = Math.min(pdf.numPages, 3);

  for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(2200, Math.max(1500, baseViewport.width * 2));
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Improve contrast for scanned PDF receipts before OCR.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      data[i] = data[i + 1] = data[i + 2] = contrasted;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (blob) pages.push(blob);
  }
  return pages;
}

async function runOCR(file) {
  $("ocrStatus").textContent = "Beleg wird intelligent analysiert …";

  try {
    const Tesseract = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm");
    let text = "";

    if (file.type.startsWith("image/")) {
      const ocrInput = await prepareImageForOcr(file);
      const result = await Tesseract.recognize(ocrInput, "deu");
      text = result.data.text || "";
    } else if (String(file.type).includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
      $("ocrStatus").textContent = "PDF wird analysiert …";

      // First try the PDF text layer. This is much more accurate for digital invoices.
      text = await extractPdfNativeText(file);

      // Screenshot/scanned PDFs often contain no usable text layer. OCR rendered pages instead.
      if (text.replace(/\s/g, "").length < 40) {
        const pages = await pdfPagesForOcr(file);
        const texts = [];
        for (let i = 0; i < pages.length; i++) {
          $("ocrStatus").textContent = "PDF wird gelesen … Seite " + (i + 1) + " von " + pages.length;
          const result = await Tesseract.recognize(pages[i], "deu");
          texts.push(result.data.text || "");
        }
        text = texts.join("\n");
      }
    } else {
      throw new Error("Nicht unterstütztes Dateiformat");
    }

    text = String(text || "").replace(/\u00a0/g, " ");
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    let merchant = detectMerchant(lines);
    if (/amazon/i.test(text)) merchant = "Amazon";

    let date = detectReceiptDate(text);
    const amazonDate = text.match(/bestellung\s+aufgegeben\s+([0-3]?\d)\.\s*([A-Za-zÄÖÜäöü]+)\s+(20\d{2})/i);
    if (amazonDate) {
      const months = {januar:1,februar:2,märz:3,maerz:3,april:4,mai:5,juni:6,juli:7,august:8,september:9,oktober:10,november:11,dezember:12};
      const month = months[amazonDate[2].toLowerCase()];
      if (month) date = amazonDate[3] + "-" + String(month).padStart(2,"0") + "-" + String(amazonDate[1]).padStart(2,"0");
    }

    let amount = detectReceiptAmount(lines);
    const explicitTotal = text.match(/(?:gesamtsumme|gesamtbetrag|endbetrag|zu zahlen)\s*:?\s*(\d{1,6}[,.]\d{2})\s*€?/i);
    if (explicitTotal) amount = parseMoney(explicitTotal[1]);

    let invoiceNumber = detectInvoiceNumber(text);
    const orderMatch = text.match(/bestell(?:nummer|nr\.?)\s*[:#-]?\s*([0-9-]{8,})/i);
    if (orderMatch) invoiceNumber = orderMatch[1];

    if (!$("merchant").value && merchant) $("merchant").value = merchant;
    if (!$("receiptDate").value && date) $("receiptDate").value = date;
    if (!$("amount").value && amount) $("amount").value = Number(amount).toFixed(2);
    if (!$("invoiceNumber").value && invoiceNumber) $("invoiceNumber").value = invoiceNumber;

    const found = [
      merchant ? "Geschäft" : "",
      date ? "Datum" : "",
      amount ? "Betrag" : "",
      invoiceNumber ? "Beleg-/Bestellnummer" : ""
    ].filter(Boolean);

    $("ocrStatus").textContent = found.length
      ? "Erkannt: " + found.join(", ") + ". Bitte kurz kontrollieren."
      : "Der Beleg konnte nicht sicher erkannt werden. Bitte Angaben manuell ergänzen.";
  } catch (error) {
    console.error(error);
    $("ocrStatus").textContent = "Automatische Erkennung nicht möglich – bitte Daten manuell eingeben.";
  }
}

async function submitReceipt() {
  const file = $("receiptFile").files[0] || $("receiptCameraFile").files[0];
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
      reimbursement_recipient_id: currentUser.id,
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
  $("receiptCameraFile").value = "";
  $("selectedReceiptFile").textContent = "";
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

async function saveIncome() {
  const date = $("incomeDate").value;
  const amount = Number($("incomeAmount").value);
  const sourceName = $("incomeSource").value.trim();
  const purpose = $("incomePurpose").value.trim();
  const paymentChannel = $("incomeChannel").value;
  const accountId = paymentChannel === "bank" ? $("incomeAccount").value : null;
  const file = $("incomeFile").files[0];

  if (!date || !amount || amount <= 0 || !purpose) {
    return toast("Bitte Datum, Betrag und Verwendungszweck eingeben.", true);
  }
  if (paymentChannel === "bank" && !accountId) {
    return toast("Bitte das Bankkonto auswählen.", true);
  }

  $("saveIncomeBtn").disabled = true;
  let filePath = null;

  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      $("saveIncomeBtn").disabled = false;
      return toast("Die Datei ist größer als 10 MB.", true);
    }
    filePath = currentUser.id + "/income_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const upload = await sb.storage.from("receipt-files").upload(filePath, file, {
      contentType: file.type,
      upsert: false
    });
    if (upload.error) {
      $("saveIncomeBtn").disabled = false;
      return toast("Datei konnte nicht hochgeladen werden: " + upload.error.message, true);
    }
  }

  const result = await sb.from("income_entries").insert({
    entry_date: date,
    amount,
    source_name: sourceName || null,
    purpose,
    category_id: $("incomeCategory").value || null,
    payment_channel: paymentChannel,
    bank_account_id: accountId,
    receipt_file_path: filePath,
    created_by: currentUser.id
  }).select().single();

  if (result.error) {
    if (filePath) await sb.storage.from("receipt-files").remove([filePath]);
    $("saveIncomeBtn").disabled = false;
    return toast("Geldeingang konnte nicht gespeichert werden: " + result.error.message, true);
  }

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "income_entry",
    entity_id: result.data.id,
    action: "created",
    details: { amount, payment_channel: paymentChannel }
  });

  $("incomeAmount").value = "";
  $("incomeSource").value = "";
  $("incomePurpose").value = "";
  $("incomeFile").value = "";
  $("saveIncomeBtn").disabled = false;
  toast("Geldeingang wurde gespeichert.");
  await loadIncome();
}

async function loadIncome() {
  if (!$("incomeDate").value) $("incomeDate").value = new Date().toISOString().slice(0, 10);
  $("incomeAccountWrap").classList.toggle("hidden", $("incomeChannel").value !== "bank");

  const result = await sb
    .from("income_entries")
    .select("*,categories(name),bank_accounts(name)")
    .order("entry_date", { ascending: false })
    .limit(200);

  if (result.error) return toast(result.error.message, true);

  const rows = result.data || [];
  $("incomeList").innerHTML = rows.length
    ? rows.map((item) =>
        '<div class="list-row"><div><strong>' +
        escapeHtml(formatDate(item.entry_date)) +
        " · " +
        escapeHtml(item.source_name || "Geldeingang") +
        '</strong><div class="hint">' +
        escapeHtml(item.purpose) +
        " · " +
        escapeHtml(item.categories?.name || "") +
        " · " +
        escapeHtml(item.payment_channel === "bank" ? (item.bank_accounts?.name || "Bank") : "Bar") +
        '</div></div><div class="list-actions"><strong class="money">' +
        euro(item.amount) +
        "</strong>" +
        (item.receipt_file_path
          ? '<button class="btn btn-secondary income-file-btn" data-path="' +
            escapeHtml(item.receipt_file_path) +
            '">Beleg</button>'
          : "") +
        '<button class="btn btn-danger income-delete-btn" data-id="' +
        escapeHtml(item.id) +
        '" data-path="' +
        escapeHtml(item.receipt_file_path || "") +
        '">Löschen</button></div></div>'
      ).join("")
    : '<p class="hint">Noch keine Geldeingänge manuell erfasst.</p>';

  document.querySelectorAll(".income-file-btn").forEach((button) => {
    button.addEventListener("click", () => openReceiptFile(button.dataset.path));
  });
  document.querySelectorAll(".income-delete-btn").forEach((button) => {
    button.addEventListener("click", () => deleteIncome(button.dataset.id, button.dataset.path));
  });
}

async function deleteIncome(id, filePath) {
  if (!window.confirm("Geldeingang wirklich löschen?")) return;
  const result = await sb.from("income_entries").delete().eq("id", id);
  if (result.error) return toast(result.error.message, true);
  if (filePath) await sb.storage.from("receipt-files").remove([filePath]);
  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "income_entry",
    entity_id: id,
    action: "deleted"
  });
  toast("Geldeingang gelöscht.");
  await loadIncome();
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
        (editRoles.includes(currentProfile.role)
          ? '<button class="btn btn-secondary edit-receipt-btn" data-id="' +
            escapeHtml(receipt.id) +
            '">Bearbeiten</button><button class="btn btn-danger delete-receipt-btn" data-id="' +
            escapeHtml(receipt.id) +
            '">Löschen</button>'
          : "") +
        "</div>" +
        "</div>"
      );
    })
    .join("");

  document.querySelectorAll(".open-file-btn").forEach((button) => {
    button.addEventListener("click", () => openReceiptFile(button.dataset.path));
  });
  document.querySelectorAll(".edit-receipt-btn").forEach((button) => {
    button.addEventListener("click", () => editReceipt(button.dataset.id));
  });
  document.querySelectorAll(".delete-receipt-btn").forEach((button) => {
    button.addEventListener("click", () => deleteReceipt(button.dataset.id));
  });
}

async function editReceipt(id) {
  const result = await sb.from("receipts").select("*").eq("id", id).single();
  if (result.error) return toast(result.error.message, true);
  const receipt = result.data;
  const merchant = window.prompt("Geschäft / Lieferant:", receipt.merchant || "");
  if (merchant === null) return;
  const date = window.prompt("Belegdatum (JJJJ-MM-TT):", receipt.receipt_date || "");
  if (date === null) return;
  const amountText = window.prompt("Betrag (€):", String(receipt.amount || ""));
  if (amountText === null) return;
  const amount = parseMoney(amountText);
  if (!Number.isFinite(amount) || amount <= 0) return toast("Ungültiger Betrag.", true);
  const purpose = window.prompt("Verwendungszweck:", receipt.purpose || "");
  if (purpose === null || !purpose.trim()) return;
  const invoiceNumber = window.prompt("Rechnungs-/Belegnummer:", receipt.invoice_number || "");
  if (invoiceNumber === null) return;

  let reimbursementRecipientId = receipt.reimbursement_recipient_id || receipt.submitted_by;
  let reimbursementRecipientName = "";

  // Only the Kassier can submit/edit a receipt on behalf of another member.
  // Normal members always remain the reimbursement recipient themselves.
  if (currentProfile.role === "treasurer" && receipt.payment_method === "private_reimbursement") {
    const profileResult = await sb.from("profiles")
      .select("id,display_name,active")
      .eq("active", true)
      .order("display_name");
    if (profileResult.error) return toast(profileResult.error.message, true);

    const profiles = profileResult.data || [];
    const currentIndex = Math.max(0, profiles.findIndex((p) => p.id === reimbursementRecipientId));
    const menu = profiles.map((p, index) =>
      (index + 1) + " = " + p.display_name + (p.id === reimbursementRecipientId ? " (aktuell)" : "")
    ).join("\n");

    const answer = window.prompt(
      "Rückerstattung an welches Mitglied?\n\n" + menu + "\n\nNummer eingeben:",
      String(currentIndex + 1)
    );
    if (answer === null) return;
    const selected = profiles[Number(answer) - 1];
    if (!selected) return toast("Bitte ein gültiges Mitglied auswählen.", true);
    reimbursementRecipientId = selected.id;
    reimbursementRecipientName = selected.display_name;
  }

  const update = await sb.from("receipts").update({
    merchant: merchant.trim() || null,
    receipt_date: date || null,
    amount,
    purpose: purpose.trim(),
    invoice_number: invoiceNumber.trim() || null,
    reimbursement_recipient_id: reimbursementRecipientId
  }).eq("id", id);
  if (update.error) return toast("Änderung fehlgeschlagen: " + update.error.message, true);
  await sb.from("audit_log").insert({
    actor_id: currentUser.id, entity_type: "receipt", entity_id: id,
    action: "edited", details: { merchant, date, amount, purpose, invoice_number: invoiceNumber, reimbursement_recipient_id: reimbursementRecipientId, reimbursement_recipient_name: reimbursementRecipientName || null }
  });
  toast("Beleg wurde geändert.");
  await loadMyReceipts();
}

async function deleteReceipt(id) {
  if (!window.confirm("Beleg wirklich löschen? Die Löschung kann nicht rückgängig gemacht werden.")) return;

  const txResult = await sb.from("bank_transactions").select("id").eq("receipt_id", id).limit(1);
  if (txResult.error) return toast(txResult.error.message, true);
  if ((txResult.data || []).length) {
    return toast("Der Beleg ist bereits einer Bankbuchung zugeordnet. Bitte zuerst die Zuordnung lösen.", true);
  }

  const fileResult = await sb.from("receipt_files").select("item_id").eq("receipt_id", id);
  if (fileResult.error) return toast(fileResult.error.message, true);
  const paths = (fileResult.data || []).map((x) => x.item_id).filter(Boolean);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id, entity_type: "receipt", entity_id: id,
    action: "deleted", details: {}
  });

  const del = await sb.from("receipts").delete().eq("id", id);
  if (del.error) return toast("Löschen fehlgeschlagen: " + del.error.message, true);

  if (paths.length) {
    const storageDelete = await sb.storage.from("receipt-files").remove(paths);
    if (storageDelete.error) console.warn(storageDelete.error.message);
  }
  toast("Beleg wurde gelöscht.");
  await loadMyReceipts();
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
  dashboardTransactions = yearTransactions.slice().sort((a, b) =>
    String(b.booking_date).localeCompare(String(a.booking_date))
  );

  const selectedAccounts = selectedAccount
    ? accounts.filter((item) => item.id === selectedAccount)
    : accounts;

  const balance =
    accountTransactions.reduce((sum, item) => sum + Number(item.amount), 0) +
    selectedAccounts.reduce((sum, item) => sum + Number(item.opening_balance || 0), 0);

  const incomeTransactions = selectedAccount
    ? yearTransactions
    : yearTransactions.filter((item) => item.receipt_resolution !== "not_required_transfer");

  const income = incomeTransactions
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
    incomeTransactions
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

  const statisticsTransactions = selectedAccount
    ? yearTransactions
    : yearTransactions.filter((item) => item.receipt_resolution !== "not_required_transfer");

  renderMonthChart(statisticsTransactions, supplementalReceipts);
  renderTransactionDetails();
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

function receiptResolutionLabel(value) {
  const labels = {
    not_required_transfer: "Interne Umbuchung",
    historical_not_in_app: "Historischer Beleg nicht in App",
    bank_document_sufficient: "Bankauszug ist Nachweis",
    no_external_receipt: "Interner Nachweis",
    capital_gains_tax_bank_document: "KESt - Bankauszug",
    bank_fees_bank_document: "Bankspesen - Bankauszug",
    other: "Sonstiger Grund"
  };
  return labels[value] || "";
}

function renderTransactionDetails() {
  if (!$("transactionDetails")) return;
  const rows = dashboardTransactions;

  const incoming = rows.filter((x) => Number(x.amount) > 0).reduce((s, x) => s + Number(x.amount), 0);
  const outgoing = Math.abs(rows.filter((x) => Number(x.amount) < 0).reduce((s, x) => s + Number(x.amount), 0));
  $("transactionSummary").innerHTML =
    '<strong>' + rows.length + ' Buchungen</strong>' +
    '<span class="hint">Eingänge ' + euro(incoming) + ' · Ausgänge ' + euro(outgoing) + '</span>';

  $("transactionDetails").innerHTML = rows.length
    ? '<table class="transaction-table"><thead><tr><th>Datum</th><th>Buchung</th><th>Gegenpartei</th><th>Referenz</th><th>Belegstatus</th><th class="amount-head">Betrag</th></tr></thead><tbody>' +
      rows.map((item) => {
        const status = item.receipt_id
          ? "Beleg zugeordnet"
          : item.receipt_resolution
            ? receiptResolutionLabel(item.receipt_resolution)
            : (Number(item.amount) < 0 ? "Beleg offen" : "–");
        return '<tr>' +
          '<td>' + escapeHtml(formatDate(item.booking_date)) + '</td>' +
          '<td><strong>' + escapeHtml(item.description || "Buchung") + '</strong></td>' +
          '<td>' + escapeHtml(item.counterparty || "–") + '</td>' +
          '<td>' + escapeHtml(item.external_reference || "–") + '</td>' +
          '<td>' + escapeHtml(status) + '</td>' +
          '<td class="money ' + (Number(item.amount) >= 0 ? "income-amount" : "expense-amount") + '">' + euro(item.amount) + '</td>' +
          '</tr>';
      }).join("") +
      '</tbody></table>'
    : '<p class="hint">Keine Buchungen für diese Auswahl.</p>';
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
    .select("*,reimbursement_profile:profiles!receipts_reimbursement_recipient_id_fkey(display_name,iban)")
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
        escapeHtml(receipt.reimbursement_profile?.display_name || "Mitglied") +
        '</strong><div class="hint">' +
        escapeHtml(receiptNumber(receipt)) +
        " · " +
        escapeHtml(receipt.purpose) +
        '</div><div class="payout-details"><div><span>IBAN</span><strong>' +
        escapeHtml(receipt.reimbursement_profile?.iban ? formatIban(receipt.reimbursement_profile.iban) : "NICHT HINTERLEGT") +
        '</strong></div><div><span>Zahlungsreferenz</span><strong>' +
        escapeHtml(receiptNumber(receipt) + " " + receipt.purpose) +
        '</strong></div></div></div>' +
        '<div class="list-actions"><strong class="money">' +
        euro(receipt.amount) +
        '</strong><button class="btn btn-primary qr-payment-btn" data-name="' +
        escapeHtml(receipt.reimbursement_profile?.display_name || "") +
        '" data-iban="' + escapeHtml(receipt.reimbursement_profile?.iban || "") +
        '" data-amount="' + escapeHtml(String(receipt.amount)) +
        '" data-reference="' + escapeHtml(receiptNumber(receipt) + " " + receipt.purpose) +
        '">QR-Code anzeigen</button><button class="btn btn-secondary copy-payment-btn" data-iban="' +
        escapeHtml(receipt.reimbursement_profile?.iban || "") +
        '" data-reference="' +
        escapeHtml(receiptNumber(receipt) + " " + receipt.purpose) +
        '">Überweisungsdaten kopieren</button><button class="btn btn-primary paid-btn" data-id="' +
        escapeHtml(receipt.id) +
        '">Als ausbezahlt markieren</button></div></div>'
      );
    })
    .join("");

  document.querySelectorAll(".paid-btn").forEach((button) => {
    button.addEventListener("click", () => markPaid(button.dataset.id));
  });
  document.querySelectorAll(".qr-payment-btn").forEach((button) => {
    button.addEventListener("click", () => showPaymentQr({
      name: button.dataset.name,
      iban: button.dataset.iban,
      amount: Number(button.dataset.amount),
      reference: button.dataset.reference
    }));
  });
  document.querySelectorAll(".copy-payment-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!button.dataset.iban) return toast("Bei diesem Mitglied ist noch keine IBAN hinterlegt.", true);
      const text = "IBAN: " + formatIban(button.dataset.iban) + "\nBetrag: " +
        button.closest(".list-row").querySelector(".money").textContent +
        "\nZahlungsreferenz: " + button.dataset.reference;
      try {
        await navigator.clipboard.writeText(text);
        toast("Überweisungsdaten wurden kopiert.");
      } catch {
        window.prompt("Überweisungsdaten:", text);
      }
    });
  });
}

function buildEpcQrPayload(payment) {
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    String(payment.name || "").trim().slice(0, 70),
    String(payment.iban || "").replace(/\s/g, "").toUpperCase(),
    "EUR" + Number(payment.amount).toFixed(2),
    "",
    "",
    String(payment.reference || "").trim().slice(0, 140),
    ""
  ].join("\n");
}

async function showPaymentQr(payment) {
  if (!payment.iban) return toast("Bei diesem Mitglied ist noch keine IBAN hinterlegt.", true);
  try {
    const QRCode = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
    const dataUrl = await QRCode.default.toDataURL(buildEpcQrPayload(payment), {
      errorCorrectionLevel: "M",
      width: 520,
      margin: 2
    });
    const overlay = document.createElement("div");
    overlay.className = "qr-overlay";
    overlay.innerHTML =
      '<div class="qr-card"><h2>Überweisung mit George</h2>' +
      '<p class="hint">In George Scan & Pay öffnen und den QR-Code scannen. Am selben Handy kannst du den QR-Code speichern und anschließend in George aus den Bildern/Dateien auswählen.</p>' +
      '<img class="payment-qr" src="' + dataUrl + '" alt="SEPA Überweisungs QR-Code">' +
      '<div class="qr-data"><strong>' + escapeHtml(payment.name) + '</strong>' +
      '<span>' + escapeHtml(formatIban(payment.iban)) + '</span>' +
      '<strong>' + escapeHtml(euro(payment.amount)) + '</strong>' +
      '<span>' + escapeHtml(payment.reference) + '</span></div>' +
      '<div class="button-row"><a class="btn btn-primary qr-download" href="' + dataUrl +
      '" download="Ueberweisung.png">QR-Code speichern</a>' +
      '<button class="btn btn-secondary qr-close">Schließen</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector(".qr-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
  } catch (error) {
    console.error(error);
    toast("QR-Code konnte nicht erstellt werden.", true);
  }
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

  const [transactionResult, receiptResult, incomeResult] = await Promise.all([
    sb.from("bank_transactions").select("*").order("booking_date", { ascending: false }).limit(1000),
    sb.from("receipts").select("*").in("status", ["approved", "paid"]).order("receipt_date", { ascending: false }),
    sb.from("income_entries").select("*").order("entry_date", { ascending: false })
  ]);

  if (transactionResult.error) return toast(transactionResult.error.message, true);
  if (receiptResult.error) return toast(receiptResult.error.message, true);
  if (incomeResult.error) return toast(incomeResult.error.message, true);

  const transactions = transactionResult.data || [];
  const receipts = receiptResult.data || [];
  const incomeEntries = incomeResult.data || [];
  const alreadyLinked = new Set(transactions.map((item) => item.receipt_id).filter(Boolean));

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

  const missing = transactions.filter(
    (item) => Number(item.amount) < 0 && !item.receipt_id && !item.receipt_resolution
  );

  $("missingReceipts").innerHTML = missing.length
    ? missing
        .slice(0, 100)
        .map((item) => {
          const candidates = receipts
            .filter((receipt) => {
              if (alreadyLinked.has(receipt.id)) return false;
              const sameAmount = Math.abs(Math.abs(Number(item.amount)) - Number(receipt.amount)) < 0.01;
              const closeDate = daysApart(receiptAccountingDate(receipt), item.booking_date) <= 14;
              return sameAmount && closeDate;
            })
            .slice(0, 10);

          const select =
            '<select class="bank-match-select" data-tx="' +
            escapeHtml(item.id) +
            '"><option value="">– Beleg auswählen –</option>' +
            candidates
              .map(
                (receipt) =>
                  '<option value="' +
                  escapeHtml(receipt.id) +
                  '">' +
                  escapeHtml(receiptNumber(receipt)) +
                  " · " +
                  escapeHtml(receipt.merchant || "Ohne Händler") +
                  " · " +
                  euro(receipt.amount) +
                  "</option>"
              )
              .join("") +
            "</select>";

          return (
            '<div class="list-row"><div><strong>' +
            escapeHtml(item.description || "Buchung") +
            '</strong><div class="hint">' +
            escapeHtml(item.booking_date) +
            " · " +
            escapeHtml(item.counterparty || "") +
            (item.external_reference
              ? " · Bank-Ref. " + escapeHtml(item.external_reference)
              : "") +
            '</div><div class="bank-match-box">' +
            select +
            '<button class="btn btn-primary bank-link-btn" data-tx="' +
            escapeHtml(item.id) +
            '">Zuordnen</button><button class="btn btn-secondary bank-resolve-btn" data-tx="' + escapeHtml(item.id) + '">Kein Beleg / Ausnahme</button></div></div><strong class="money">' +
            euro(item.amount) +
            "</strong></div>"
          );
        })
        .join("")
    : '<p class="hint">Keine offenen Bankausgaben ohne Beleg.</p>';

  document.querySelectorAll(".bank-link-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const transactionId = button.dataset.tx;
      const select = document.querySelector('.bank-match-select[data-tx="' + transactionId + '"]');
      const receiptId = select?.value || "";
      if (!receiptId) return toast("Bitte zuerst einen Vereinsbeleg auswählen.", true);
      await linkBankTransaction(transactionId, receiptId);
    });
  });
  document.querySelectorAll(".bank-resolve-btn").forEach((button) => {
    button.addEventListener("click", () => resolveWithoutReceipt(button.dataset.tx));
  });

  const linkedIncomeIds = new Set(transactions.map((item) => item.income_entry_id).filter(Boolean));
  const openIncomeTransactions = transactions.filter(
    (item) => Number(item.amount) > 0 &&
      !item.income_entry_id &&
      !item.receipt_resolution
  );

  $("unmatchedIncomeTransactions").innerHTML = openIncomeTransactions.length
    ? openIncomeTransactions.slice(0, 100).map((item) => {
        const candidates = incomeEntries.filter((entry) => {
          if (linkedIncomeIds.has(entry.id)) return false;
          const sameAmount = Math.abs(Number(item.amount) - Number(entry.amount)) < 0.01;
          const closeDate = daysApart(entry.entry_date, item.booking_date) <= 14;
          return sameAmount && closeDate;
        }).slice(0, 10);

        const select =
          '<select class="income-match-select" data-tx="' + escapeHtml(item.id) +
          '"><option value="">- Geldeingang auswaehlen -</option>' +
          candidates.map((entry) =>
            '<option value="' + escapeHtml(entry.id) + '">' +
            escapeHtml(formatDate(entry.entry_date)) + " - " +
            escapeHtml(entry.source_name || entry.purpose || "Geldeingang") + " - " +
            euro(entry.amount) + '</option>'
          ).join("") + '</select>';

        return '<div class="list-row"><div><strong>' +
          escapeHtml(item.description || item.counterparty || "Bankeingang") +
          '</strong><div class="hint">' +
          escapeHtml(formatDate(item.booking_date)) + " - " +
          escapeHtml(item.counterparty || "") +
          '</div><div class="bank-match-box">' + select +
          '<button class="btn btn-primary income-link-btn" data-tx="' +
          escapeHtml(item.id) + '">Verknuepfen</button>' +
          '<button class="btn btn-secondary income-resolve-btn" data-tx="' +
          escapeHtml(item.id) + '">Kein Beleg / Ausnahme</button></div></div>' +
          '<strong class="money income-amount">' + euro(item.amount) + '</strong></div>';
      }).join("")
    : '<p class="hint">Keine offenen Bankeingaenge.</p>';

  document.querySelectorAll(".income-link-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const transactionId = button.dataset.tx;
      const select = document.querySelector('.income-match-select[data-tx="' + transactionId + '"]');
      const incomeId = select?.value || "";
      if (!incomeId) return toast("Bitte zuerst einen Geldeingang auswaehlen.", true);
      await linkIncomeTransaction(transactionId, incomeId);
    });
  });

  document.querySelectorAll(".income-resolve-btn").forEach((button) => {
    button.addEventListener("click", () => resolveIncomeWithoutReceipt(button.dataset.tx));
  });
}

async function linkIncomeTransaction(transactionId, incomeId) {
  const result = await sb.from("bank_transactions").update({
    income_entry_id: incomeId
  }).eq("id", transactionId);
  if (result.error) return toast("Zuordnung fehlgeschlagen: " + result.error.message, true);

  await sb.from("income_entries").update({
    bank_transaction_id: transactionId
  }).eq("id", incomeId);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "bank_transaction",
    entity_id: transactionId,
    action: "linked_income_entry",
    details: { income_entry_id: incomeId }
  });

  toast("Bankeingang und Geldeingang wurden verknuepft.");
  await loadBank();
}

async function resolveIncomeWithoutReceipt(transactionId) {
  const reasons = {
    "1": ["not_required_transfer", "Interne Umbuchung - kein zusaetzlicher Beleg erforderlich"],
    "2": ["historical_not_in_app", "Historischer Eingang - nicht in dieser App erfasst"],
    "3": ["bank_document_sufficient", "Bankauszug / Bankbeleg ist der Nachweis"],
    "4": ["bank_document_sufficient", "Spende ohne separaten Beleg - Bankeingang ist Nachweis"],
    "5": ["no_external_receipt", "Kein separater Eingangsbeleg vorhanden - interner Nachweis"],
    "6": ["other", "Sonstiger Grund"]
  };
  const answer = window.prompt(
    "Eingang ohne separaten Beleg:\\n" +
    "1 = Interne Umbuchung\\n" +
    "2 = Historischer Eingang, nicht in App\\n" +
    "3 = Bankauszug ist Nachweis\\n" +
    "4 = Kein separater Eingangsbeleg vorhanden\\n" +
    "5 = Sonstiger Grund\\n\\nNummer eingeben:"
  );
  if (answer === null) return;
  const selected = reasons[answer.trim()];
  if (!selected) return toast("Bitte 1 bis 6 auswaehlen.", true);

  let note = selected[1];
  if (answer.trim() === "5" || answer.trim() === "6") {
    const entered = window.prompt("Kurze Bemerkung / Begruendung:");
    if (entered === null || !entered.trim()) return toast("Bitte eine kurze Begruendung eintragen.", true);
    note = entered.trim();
  }

  const result = await sb.from("bank_transactions").update({
    receipt_resolution: selected[0],
    receipt_resolution_note: note,
    receipt_resolved_by: currentUser.id,
    receipt_resolved_at: new Date().toISOString()
  }).eq("id", transactionId);

  if (result.error) return toast("Status konnte nicht gespeichert werden: " + result.error.message, true);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "bank_transaction",
    entity_id: transactionId,
    action: "income_exception_set",
    details: { resolution: selected[0], note: note }
  });

  toast("Bankeingang wurde als erledigt markiert.");
  await loadBank();
}

async function resolveWithoutReceipt(transactionId) {
  const reasons = {
    "1": ["not_required_transfer", "Interne Umbuchung - kein zusaetzlicher Beleg erforderlich"],
    "2": ["historical_not_in_app", "Historischer Beleg - nicht in dieser App erfasst"],
    "3": ["bank_document_sufficient", "Bankauszug / Bankbeleg ist der Nachweis"],
    "4": ["no_external_receipt", "Kein Fremdbeleg vorhanden - interner Nachweis"],
    "5": ["capital_gains_tax_bank_document", "KESt / Kapitalertragsteuer - Bankauszug ist Beleg"],
    "6": ["bank_fees_bank_document", "Bankspesen / Kontofuehrung - Bankauszug ist Beleg"],
    "7": ["other", "Sonstiger Grund"]
  };
  const answer = window.prompt("Kein Beleg / Ausnahme:\n1 = Interne Umbuchung\n2 = Historischer Beleg, nicht in App\n3 = Bankauszug ist Nachweis\n4 = Kein Fremdbeleg vorhanden\n5 = KESt / Kapitalertragsteuer - Bankauszug ist Beleg\n6 = Bankspesen / Kontofuehrung - Bankauszug ist Beleg\n7 = Sonstiger Grund\n\nNummer eingeben:");
  if (answer === null) return;
  const selected = reasons[answer.trim()];
  if (!selected) return toast("Bitte 1 bis 7 auswaehlen.", true);
  let note = selected[1];
  if (answer.trim() === "4" || answer.trim() === "7") {
    const entered = window.prompt("Kurze Bemerkung / Begruendung:");
    if (entered === null || !entered.trim()) return toast("Bitte eine kurze Begruendung eintragen.", true);
    note = entered.trim();
  }
  const result = await sb.from("bank_transactions").update({
    receipt_resolution: selected[0],
    receipt_resolution_note: note,
    receipt_resolved_by: currentUser.id,
    receipt_resolved_at: new Date().toISOString()
  }).eq("id", transactionId);
  if (result.error) return toast("Status konnte nicht gespeichert werden: " + result.error.message, true);
  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "bank_transaction",
    entity_id: transactionId,
    action: "receipt_exception_set",
    details: { resolution: selected[0], note: note }
  });
  toast("Buchung wurde als erledigt markiert.");
  await loadBank();
}

async function linkBankTransaction(transactionId, receiptId) {
  const result = await sb
    .from("bank_transactions")
    .update({ receipt_id: receiptId })
    .eq("id", transactionId);

  if (result.error) return toast("Zuordnung fehlgeschlagen: " + result.error.message, true);

  await sb.from("audit_log").insert({
    actor_id: currentUser.id,
    entity_type: "bank_transaction",
    entity_id: transactionId,
    action: "linked_receipt",
    details: { receipt_id: receiptId }
  });

  toast("Bankbuchung und Vereinsbeleg wurden zugeordnet.");
  await loadBank();
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

  const mappingIds = ["mapDate", "mapAmount", "mapDescription", "mapCounterparty", "mapReference"];
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
  $("mapReference").value = findHeader(/beleg|referenz|reference|ref\.?|transaktion|umsatz.?id|buchungs.?id/i);

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
  const referenceColumn = $("mapReference").value;
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
    const externalReference = referenceColumn ? String(row[referenceColumn] || "").trim() : "";

    rows.push({
      bank_account_id: accountId,
      import_id: importResult.data.id,
      booking_date: bookingDate,
      amount,
      description,
      counterparty,
      external_reference: externalReference || null,
      kind: amount >= 0 ? "income" : "expense",
      fingerprint: await fingerprint(
        accountId + "|" + bookingDate + "|" + amount.toFixed(2) + "|" + description + "|" + counterparty
      )
    });
  }

  const existingResult = await sb
    .from("bank_transactions")
    .select("booking_date,amount,description,counterparty")
    .eq("bank_account_id", accountId);

  if (existingResult.error) {
    $("importBankBtn").disabled = false;
    return toast("Dublettenprüfung fehlgeschlagen: " + existingResult.error.message, true);
  }

  const normalizeText = (value) => String(value || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  const similarRows = rows.filter((row) =>
    (existingResult.data || []).some((existing) => {
      if (existing.booking_date !== row.booking_date) return false;
      if (Math.abs(Number(existing.amount) - Number(row.amount)) >= 0.01) return false;
      const a = normalizeText(existing.description || existing.counterparty);
      const b = normalizeText(row.description || row.counterparty);
      if (!a || !b) return true;
      return a === b || a.includes(b) || b.includes(a);
    })
  );

  if (similarRows.length) {
    const proceed = window.confirm(
      similarRows.length +
      " Buchung(en) sehen bereits vorhandenen Buchungen sehr ähnlich (gleiches Datum/Betrag und ähnlicher Text). " +
      "Exakte Dubletten werden ohnehin übersprungen. Import trotzdem fortsetzen?"
    );
    if (!proceed) {
      $("importBankBtn").disabled = false;
      return toast("Import wurde abgebrochen. Es wurden keine neuen Buchungen importiert.");
    }
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


let auditRowsCache = [];

async function loadAudit() {
  await loadReferences();

  const [receiptResult, transactionResult] = await Promise.all([
    sb.from("receipts")
      .select("*,categories(name),profiles!receipts_submitted_by_fkey(display_name),receipt_files(*)")
      .in("status", ["approved", "paid"])
      .order("receipt_date", { ascending: false }),
    sb.from("bank_transactions").select("*").order("booking_date", { ascending: false })
  ]);

  if (receiptResult.error) return toast(receiptResult.error.message, true);
  if (transactionResult.error) return toast(transactionResult.error.message, true);

  const receipts = receiptResult.data || [];
  const transactions = transactionResult.data || [];
  const years = new Set([new Date().getFullYear()]);

  receipts.forEach((receipt) => {
    const date = receiptAccountingDate(receipt);
    if (date) years.add(Number(date.slice(0, 4)));
  });
  transactions.forEach((transaction) => {
    if (transaction.booking_date) years.add(Number(transaction.booking_date.slice(0, 4)));
  });

  const selectedYear = Number($("auditYear").value || Math.max(...years));
  $("auditYear").innerHTML = Array.from(years)
    .sort((a, b) => b - a)
    .map((year) => '<option value="' + year + '"' + (year === selectedYear ? " selected" : "") + ">" + year + "</option>")
    .join("");

  const selectedAccount = $("auditAccount").value || "";

  auditRowsCache = receipts
    .filter((receipt) => {
      const date = receiptAccountingDate(receipt);
      return date && Number(date.slice(0, 4)) === selectedYear;
    })
    .map((receipt) => {
      const bankTransaction =
        transactions.find((transaction) => transaction.receipt_id === receipt.id) || null;
      const bankAccount = bankTransaction
        ? bankAccounts.find((account) => account.id === bankTransaction.bank_account_id) || null
        : null;

      return {
        receipt,
        bankTransaction,
        bankAccount
      };
    })
    .filter((row) => {
      if (!selectedAccount) return true;
      return row.bankTransaction?.bank_account_id === selectedAccount;
    })
    .sort((a, b) => {
      const da = receiptAccountingDate(a.receipt);
      const db = receiptAccountingDate(b.receipt);
      return String(da).localeCompare(String(db));
    });

  const total = auditRowsCache.reduce((sum, row) => sum + Number(row.receipt.amount), 0);
  const linked = auditRowsCache.filter((row) => row.bankTransaction).length;
  const unlinked = auditRowsCache.length - linked;

  $("auditSummary").innerHTML =
    '<strong>' +
    auditRowsCache.length +
    " Belege · " +
    euro(total) +
    '</strong><span class="hint">' +
    linked +
    " mit Bankbuchung verknüpft · " +
    unlinked +
    " noch ohne Bankbeleg</span>";

  $("auditTable").innerHTML = auditRowsCache.length
    ? '<table class="audit-table"><thead><tr>' +
      "<th>Datum</th>" +
      "<th>Vereins-Belegnr.</th>" +
      "<th>Händler / Zweck</th>" +
      "<th>Betrag</th>" +
      "<th>Zahlungsart</th>" +
      "<th>Bankdatum</th>" +
      "<th>Bank-Belegnr. / Referenz</th>" +
      "<th>Konto</th>" +
      "<th>Status</th>" +
      "<th>Beleg</th>" +
      "</tr></thead><tbody>" +
      auditRowsCache
        .map((row) => {
          const receipt = row.receipt;
          const bank = row.bankTransaction;
          const file = receipt.receipt_files?.[0];
          return (
            "<tr>" +
            "<td>" +
            escapeHtml(formatDate(receiptAccountingDate(receipt))) +
            "</td>" +
            "<td><strong>" +
            escapeHtml(receiptNumber(receipt)) +
            "</strong></td>" +
            "<td>" +
            escapeHtml(receipt.merchant || "") +
            '<div class="hint">' +
            escapeHtml(receipt.purpose || "") +
            "</div></td>" +
            '<td class="money">' +
            euro(receipt.amount) +
            "</td>" +
            "<td>" +
            escapeHtml(paymentLabel(receipt.payment_method)) +
            "</td>" +
            "<td>" +
            escapeHtml(bank ? formatDate(bank.booking_date) : "–") +
            "</td>" +
            "<td>" +
            escapeHtml(bank?.external_reference || (bank ? bank.description || "–" : "–")) +
            "</td>" +
            "<td>" +
            escapeHtml(row.bankAccount?.name || "–") +
            "</td>" +
            "<td>" +
            statusBadge(receipt.status) +
            "</td>" +
            "<td>" +
            (file
              ? '<button class="btn btn-secondary audit-file-btn" data-path="' +
                escapeHtml(file.item_id) +
                '">Öffnen</button>'
              : "–") +
            "</td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    : '<p class="hint">Für diese Auswahl sind keine freigegebenen Belege vorhanden.</p>';

  document.querySelectorAll(".audit-file-btn").forEach((button) => {
    button.addEventListener("click", () => openReceiptFile(button.dataset.path));
  });
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).slice(0, 10).split("-");
  if (parts.length !== 3) return isoDate;
  return parts[2] + "." + parts[1] + "." + parts[0];
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return '"' + text + '"';
}

function exportAuditCsv() {
  const header = [
    "Datum",
    "Vereins-Belegnummer",
    "Händler",
    "Verwendungszweck",
    "Betrag",
    "Zahlungsart",
    "Bankdatum",
    "Bank-Belegnummer/Referenz",
    "Konto",
    "Status"
  ];

  const lines = [header.map(csvCell).join(";")];

  auditRowsCache.forEach((row) => {
    const receipt = row.receipt;
    const bank = row.bankTransaction;
    lines.push(
      [
        formatDate(receiptAccountingDate(receipt)),
        receiptNumber(receipt),
        receipt.merchant || "",
        receipt.purpose || "",
        Number(receipt.amount).toFixed(2).replace(".", ","),
        paymentLabel(receipt.payment_method),
        bank ? formatDate(bank.booking_date) : "",
        bank?.external_reference || (bank ? bank.description || "" : ""),
        row.bankAccount?.name || "",
        receipt.status
      ]
        .map(csvCell)
        .join(";")
    );
  });

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Theatergruppe_Grins_Kassenpruefung_" + ($("auditYear").value || "alle") + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportReceiptSheets() {
  const rows = auditRowsCache.filter((row) => row.receipt.receipt_files?.[0]);
  if (!rows.length) return toast("Für diese Auswahl sind keine hochgeladenen Belege vorhanden.", true);

  // Open immediately on the user's click. Mobile Safari blocks windows opened only
  // after asynchronous storage requests have finished.
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return toast("Das Belegblatt wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.", true);
  }

  printWindow.document.write(
    '<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>Belegübersicht</title>' +
    '<style>body{font-family:Arial,sans-serif;padding:20px;color:#222}.loading{margin:30px auto;max-width:500px;text-align:center}</style>' +
    '</head><body><div class="loading"><h2>Belegübersicht wird erstellt …</h2><p>Bitte dieses Fenster geöffnet lassen.</p></div></body></html>'
  );
  printWindow.document.close();

  try {
    const cards = [];
    for (const row of rows) {
      const receipt = row.receipt;
      const file = receipt.receipt_files?.[0];
      let imageUrl = "";
      let isPdf = false;

      if (file?.item_id) {
        const signed = await sb.storage.from("receipt-files").createSignedUrl(file.item_id, 900);
        if (!signed.error) {
          imageUrl = signed.data.signedUrl;
          isPdf = String(file.mime_type || "").includes("pdf") ||
            String(file.file_name || "").toLowerCase().endsWith(".pdf");
        }
      }

      cards.push(
        '<article class="receipt-card"><div class="receipt-media">' +
        (imageUrl && !isPdf
          ? '<img src="' + escapeHtml(imageUrl) + '" alt="Beleg">'
          : '<div class="pdf-placeholder">' + (isPdf ? "PDF-BELEG" : "BELEG NICHT VERFÜGBAR") + '</div>') +
        '</div><div class="receipt-caption"><strong>' + escapeHtml(receiptNumber(receipt)) + '</strong>' +
        '<span>' + escapeHtml(receipt.purpose || "") + '</span>' +
        '<b>' + escapeHtml(euro(receipt.amount)) + '</b>' +
        '<small>' + escapeHtml(formatDate(receiptAccountingDate(receipt))) +
        (receipt.merchant ? " - " + escapeHtml(receipt.merchant) : "") + '</small>' +
        (row.bankTransaction
          ? '<small>Bank: ' + escapeHtml(formatDate(row.bankTransaction.booking_date)) +
            ' - ' + escapeHtml(row.bankTransaction.external_reference || row.bankTransaction.description || "") + '</small>'
          : '<small>Bankzuordnung: noch nicht verknüpft</small>') +
        '</div></article>'
      );
    }

    printWindow.document.open();
    printWindow.document.write(
      '<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>Belegübersicht Theatergruppe Grins</title>' +
      '<style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}' +
      '.head{display:flex;justify-content:space-between;gap:20px;margin-bottom:7mm}h1{font-size:18px;margin:0 0 2px}p{font-size:10px;margin:0;color:#555}' +
      '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm}.receipt-card{border:.25mm solid #aaa;padding:2mm;break-inside:avoid;min-height:128mm;display:flex;flex-direction:column}' +
      '.receipt-media{height:96mm;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fafafa}.receipt-media img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center}' +
      '.pdf-placeholder{border:1px dashed #aaa;padding:12mm 4mm;color:#777;font-weight:bold;text-align:center}.receipt-caption{padding-top:2mm;display:grid;gap:1mm;font-size:9px}' +
      '.receipt-caption strong{font-size:10px}.receipt-caption b{font-size:10px}.receipt-caption small{font-size:8px;color:#444}</style></head><body>' +
      '<div class="head"><div><h1>Theatergruppe Grins - Belegübersicht</h1><p>Hochgeladene Belege mit Zuordnung zur VereinsKassa</p></div>' +
      '<div><p>Jahr: ' + escapeHtml($("auditYear").value || "") + '</p><p>Erstellt: ' +
      escapeHtml(new Date().toLocaleDateString("de-AT")) + '</p></div></div><div class="grid">' +
      cards.join("") + '</div></body></html>'
    );
    printWindow.document.close();

    const images = Array.from(printWindow.document.images);
    await Promise.all(images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 5000);
      });
    }));

    images.forEach((img) => {
      const box = img.closest(".receipt-media");
      if (!box || !img.naturalWidth || !img.naturalHeight) return;
      const aspect = img.naturalHeight / img.naturalWidth;

      // Long/narrow receipts need more width so the printed text remains readable.
      // Wide/full-page documents are reduced to avoid oversized text.
      if (aspect >= 2.8) {
        img.style.width = "100%";
        img.style.height = "auto";
        img.style.maxHeight = "none";
      } else if (aspect >= 1.8) {
        img.style.width = "92%";
        img.style.height = "auto";
      } else if (aspect >= 1.15) {
        img.style.width = "82%";
        img.style.height = "auto";
      } else {
        img.style.width = "72%";
        img.style.height = "auto";
      }
    });

    printWindow.focus();
    printWindow.print();
  } catch (error) {
    console.error(error);
    printWindow.close();
    toast("Belegübersicht konnte nicht erstellt werden: " + error.message, true);
  }
}

function printAudit() {
  if (!auditRowsCache.length) return toast("Keine Daten zum Drucken vorhanden.", true);

  const total = auditRowsCache.reduce((sum, row) => sum + Number(row.receipt.amount), 0);
  const rows = auditRowsCache
    .map((row) => {
      const receipt = row.receipt;
      const bank = row.bankTransaction;
      return (
        "<tr>" +
        "<td>" + escapeHtml(formatDate(receiptAccountingDate(receipt))) + "</td>" +
        "<td>" + escapeHtml(receiptNumber(receipt)) + "</td>" +
        "<td>" + escapeHtml(receipt.merchant || "") + "<br><small>" + escapeHtml(receipt.purpose || "") + "</small></td>" +
        "<td style=\"text-align:right\">" + escapeHtml(euro(receipt.amount)) + "</td>" +
        "<td>" + escapeHtml(paymentLabel(receipt.payment_method)) + "</td>" +
        "<td>" + escapeHtml(bank ? formatDate(bank.booking_date) : "–") + "</td>" +
        "<td>" + escapeHtml(bank?.external_reference || (bank ? bank.description || "–" : "–")) + "</td>" +
        "<td>" + escapeHtml(row.bankAccount?.name || "–") + "</td>" +
        "</tr>"
      );
    })
    .join("");

  const printWindow = window.open("", "_blank");
  if (!printWindow) return toast("Popup wurde blockiert. Bitte Popups für diese Seite erlauben.", true);

  printWindow.document.write(
    '<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>Kassenprüfung Theatergruppe Grins</title>' +
    "<style>body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin-bottom:4px}p{margin:4px 0 14px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #bbb;padding:5px;vertical-align:top}th{background:#eee}tfoot td{font-weight:bold}small{color:#555}@page{size:landscape;margin:10mm}</style>" +
    "</head><body><h1>Theatergruppe Grins – Kassenprüfung</h1>" +
    "<p>Jahr: " +
    escapeHtml($("auditYear").value || "") +
    " · Erstellt am " +
    escapeHtml(new Date().toLocaleDateString("de-AT")) +
    "</p><table><thead><tr>" +
    "<th>Datum</th><th>Vereins-Belegnr.</th><th>Händler / Zweck</th><th>Betrag</th><th>Zahlungsart</th><th>Bankdatum</th><th>Bank-Belegnr. / Referenz</th><th>Konto</th>" +
    "</tr></thead><tbody>" +
    rows +
    '</tbody><tfoot><tr><td colspan="3">Summe</td><td style="text-align:right">' +
    escapeHtml(euro(total)) +
    '</td><td colspan="4"></td></tr></tfoot></table></body></html>'
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
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
$("editOwnIbanBtn").addEventListener("click", editOwnIban);
$("submitReceiptBtn").addEventListener("click", submitReceipt);
$("saveIncomeBtn").addEventListener("click", saveIncome);
$("incomeChannel").addEventListener("change", () => {
  $("incomeAccountWrap").classList.toggle("hidden", $("incomeChannel").value !== "bank");
});

async function handleSelectedReceiptFile(file, sourceInput) {
  if (!file) return;

  if (sourceInput === "camera") {
    $("receiptFile").value = "";
  } else {
    $("receiptCameraFile").value = "";
  }

  $("selectedReceiptFile").textContent = "Ausgewählt: " + file.name;

  if (file.type.startsWith("image/") || String(file.type).includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
    await runOCR(file);
  } else {
    $("ocrStatus").textContent = "Dieses Dateiformat kann nicht automatisch gelesen werden.";
  }
}

$("takeReceiptPhotoBtn").addEventListener("click", () => $("receiptCameraFile").click());
$("chooseReceiptFileBtn").addEventListener("click", () => $("receiptFile").click());

$("receiptCameraFile").addEventListener("change", async (event) => {
  await handleSelectedReceiptFile(event.target.files[0], "camera");
});

$("receiptFile").addEventListener("change", async (event) => {
  await handleSelectedReceiptFile(event.target.files[0], "file");
});

$("dashboardYear").addEventListener("change", loadDashboard);
$("dashboardAccount").addEventListener("change", loadDashboard);
$("auditYear").addEventListener("change", loadAudit);
$("auditAccount").addEventListener("change", loadAudit);
$("auditCsvBtn").addEventListener("click", exportAuditCsv);
$("auditPrintBtn").addEventListener("click", printAudit);
$("receiptSheetBtn").addEventListener("click", exportReceiptSheets);

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
