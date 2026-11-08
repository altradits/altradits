/* kTown merchant app: the QR screen and Settings. Everything rendered comes
through textContent; innerHTML is only the QR library's SVG and the static
icons below (no scripts, no handlers). Talks only to this site's own API. */
"use strict";
const $ = (id) => document.getElementById(id);
// The Bitcoin QR code template: a level H code in ink inside an orange
// frame, with the Altradits logo centred on it on a white card (40% of the
// code's width, about a sixth of its height). Level H keeps 30% for repairs;
// the logo covers under 7% of the code. The printed card's top carries the
// Bitcoin mark (public domain) and "bitcoin".
const LOGO = "/assets/logo.png";
const BTC_MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#F7931A"/><g transform="rotate(14 32 32)" fill="#fff"><path d="M22 14h4v6h-4zM30 14h4v6h-4zM22 44h4v6h-4zM30 44h4v6h-4z"/><path d="M18 19h17.5c6 0 9.5 3 9.5 7.6 0 3.2-1.8 5.2-4.4 6 3.4.7 5.6 3 5.6 6.8 0 5-3.8 8.6-10.2 8.6H18v-5h3.5V24H18zm9.5 5v7h7c2.4 0 3.8-1.3 3.8-3.5S36.9 24 34.5 24zm0 12v7.3h7.8c2.7 0 4.2-1.4 4.2-3.7s-1.5-3.6-4.2-3.6z"/></g></svg>';
const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/><path d="M9 7h2v2H9zM13 7h2v2h-2zM9 11h2v2H9z"/></svg>';
const INK = "#1d1d1f";

const STR = {
  en: {
    qr: "QR", settings: "Settings", printCard: "Print card", printSheet: "Print sheet", savePng: "Save PNG",
    honest: "kTown holds no money. Our payout partner converts sats to M-Pesa for a 1% fee.",
    register: "Register", phone: "M-Pesa number", shop: "Shop name",
    mpesaName: "M-Pesa name (as M-Pesa shows it)", pin: "6-digit PIN",
    agree1: "I agree to the", agree2: "terms", agreeFirst: "Tick 'I agree' to the terms first.",
    helpIs: "Help",
    registerBtn: "Register this number", havePin: "Already registered? Log in",
    login: "Log in", loginBtn: "Log in", names: "Names", save: "Save",
    prefs: "Display", currency: "Currency", language: "Language",
    newPin: "New PIN", setPin: "Set PIN", history: "History", signout: "Sign out",
    confirmed: "Confirmed M-Pesa name", notConfirmed: "M-Pesa name not yet confirmed",
    secureNote: "The first payment secures this number.",
    verifyHint: "Type it exactly as M-Pesa shows it. The first payment confirms it.",
    saved: "Saved.", histEmpty: "No payments yet.",
    received: "Received", waiting: "Waiting", failed: "Failed",
    payerFee: "Payer covered", pctNote: "(1%)",
    quotedWord: "Quoted", landedWord: "received",
    histWallet: "Paid from a wallet in sats. The payout partner's 1% came out of the shillings.",
    noConn: "No connection. Try again.",
    tryAgain: "Something went wrong. Try again.",
    offlineNote: "Offline. Showing saved data.",
    pngFail: "PNG failed. Try again.",
    forgotPin: "Forgot your PIN? Ask kTown help to reset it.",
  },
  sw: {
    qr: "QR", settings: "Mipangilio", printCard: "Chapisha kadi", printSheet: "Chapisha karatasi", savePng: "Hifadhi PNG",
    honest: "kTown haishiki pesa. Mshirika wetu wa malipo hubadilisha sats kuwa M-Pesa kwa asilimia 1.",
    register: "Jisajili", phone: "Nambari ya M-Pesa", shop: "Jina la duka",
    mpesaName: "Jina la M-Pesa (kama M-Pesa)", pin: "PIN ya tarakimu 6",
    agree1: "Nakubali", agree2: "masharti", agreeFirst: "Weka tiki 'Nakubali' masharti kwanza.",
    helpIs: "Msaada",
    registerBtn: "Sajili nambari hii", havePin: "Umeshajisajili? Ingia",
    login: "Ingia", loginBtn: "Ingia", names: "Majina", save: "Hifadhi",
    prefs: "Muonekano", currency: "Sarafu", language: "Lugha",
    newPin: "PIN mpya", setPin: "Weka PIN", history: "Historia", signout: "Toka",
    confirmed: "Jina la M-Pesa limethibitishwa", notConfirmed: "Jina la M-Pesa halijathibitishwa",
    secureNote: "Malipo ya kwanza yatailinda nambari hii.",
    verifyHint: "Andika kama M-Pesa inavyoonyesha. Malipo ya kwanza yatalithibitisha.",
    saved: "Imehifadhiwa.", histEmpty: "Hakuna malipo bado.",
    received: "Imepokelewa", waiting: "Inasubiri", failed: "Imeshindikana",
    payerFee: "Mlipaji alilipa", pctNote: "(asilimia 1)",
    quotedWord: "Bei", landedWord: "zimefika",
    histWallet: "Imelipwa kutoka pochi kwa sats. Asilimia 1 ya mshirika wa malipo ilitoka kwenye shilingi.",
    noConn: "Hakuna mtandao. Jaribu tena.",
    tryAgain: "Kuna tatizo. Jaribu tena.",
    offlineNote: "Nje ya mtandao. Inaonyesha data iliyohifadhiwa.",
    pngFail: "PNG imeshindikana. Jaribu tena.",
    forgotPin: "Umesahau PIN? Omba msaada wa kTown uiweke upya.",
  },
};
let lang = "en";
const t = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;

// The server answers in English. The common lines are shown in Kiswahili
// when the app is in Kiswahili; anything else stays as the server said it.
const SW_ERR = {
  "Wrong number or PIN.": "Nambari au PIN si sahihi.",
  "Wrong PIN. Try again in 15 minutes.": "PIN si sahihi. Jaribu tena baada ya dakika 15.",
  "Enter an M-Pesa number, like 07XX XXX XXX.": "Weka nambari ya M-Pesa, kama 07XX XXX XXX.",
  "kTown is full for now.": "kTown imejaa kwa sasa.",
  "The payout service isn't reachable right now. Try again in a minute.": "Huduma ya malipo haipatikani kwa sasa. Jaribu tena baada ya dakika moja.",
  "That number is already registered. Log in on the shop phone.": "Nambari hii imeshasajiliwa. Ingia kwenye simu ya duka.",
  "That number isn't set up for M-Pesa delivery.": "Nambari hii haijawekwa kupokea M-Pesa.",
  "Choose a 6-digit PIN.": "Chagua PIN ya tarakimu 6.",
  "Too many attempts. Try again in an hour.": "Majaribio yamezidi. Jaribu tena baada ya saa moja.",
  "Sign in again on the shop phone.": "Ingia tena kwenye simu ya duka.",
};
function swErr(msg) {
  if (lang !== "sw") return msg;
  if (SW_ERR[msg]) return SW_ERR[msg];
  const wait = /^Too many wrong PINs\. Try again in (\d+) minutes\.$/.exec(msg);
  return wait ? `PIN zisizo sahihi zimezidi. Jaribu tena baada ya dakika ${wait[1]}.` : msg;
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/ktown/sw.js").catch(() => {});
const SYM = { KES: "KSh ", USD: "$", EUR: "€", UGX: "USh ", TZS: "TSh " };
const money = (n, code) => `${SYM[code] || `${code} `}${Number(n).toLocaleString("en-US")}`;

let merchant = null;
let rates = null;

async function api(path, { method = "GET", body = null, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = "Bearer " + (localStorage.getItem("kt.session") || "");
  let r;
  try {
    r = await fetch("/api/ktown/" + path, { method, headers, body: body ? JSON.stringify(body) : null });
  } catch {
    throw new Error(t("noConn"));
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.success === false) {
    const e = new Error((d && d.error) || t("tryAgain"));
    e.status = r.status;
    throw e;
  }
  return d;
}

function showErr(id, e) {
  const el = $(id);
  el.textContent = e && e.message ? swErr(e.message) : t("tryAgain");
  el.hidden = false;
}
const hideErr = (id) => { $(id).hidden = true; };
function showOk(id) {
  const el = $(id);
  el.textContent = t("saved");
  el.hidden = false;
}

function showScreen(which) {
  if (!merchant) which = "settings";
  $("screen-qr").hidden = which !== "qr";
  $("screen-settings").hidden = which !== "settings";
  $("tab-qr").setAttribute("aria-selected", String(which === "qr"));
  $("tab-settings").setAttribute("aria-selected", String(which === "settings"));
  const main = document.querySelector("main");
  if (main) main.scrollTop = 0;
}

// The code in ink on white, with the logo centred on it on a white card.
function framedQr(text) {
  const qr = qrcode(0, "H");
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true }).replace('fill="black"', `fill="${INK}"`);
  return `<div class="tq">${svg}<div class="tq-mid"><img src="${LOGO}" alt="" width="325" height="119"></div></div>`;
}

function drawQR(text) {
  $("qr").innerHTML = framedQr(text);
}

function renderQR() {
  if (!merchant) return;
  $("qr-shop").textContent = merchant.shop;
  $("qr-mpesa").textContent = merchant.mpesaName;
  const mark = $("qr-mark");
  mark.textContent = merchant.verified ? "✓ " + t("confirmed") : t("notConfirmed");
  mark.className = "mark " + (merchant.verified ? "ok" : "no");
  $("qr-secure").hidden = merchant.claimed;
  if (!merchant.claimed) $("qr-secure").textContent = t("secureNote");
  $("qr").setAttribute("aria-label", "QR: " + merchant.shop);
  drawQR(`${merchant.payUrl}?lightning=${merchant.lnurl}`);
}

function renderSettings() {
  if (!merchant) return;
  if (document.activeElement !== $("s-shop")) $("s-shop").value = merchant.shop;
  if (document.activeElement !== $("s-mpesa")) $("s-mpesa").value = merchant.mpesaName;
  $("s-currency").value = merchant.currency;
  $("s-lang").value = merchant.lang;
  $("verify-hint").textContent = merchant.verified ? "✓ " + t("confirmed") : t("verifyHint");
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(lang === "sw" ? "sw-KE" : "en-KE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function renderHistory(entries) {
  const ul = $("history-list");
  ul.innerHTML = "";
  $("hist-empty").hidden = entries.length > 0;
  if (!entries.length) $("hist-empty").textContent = t("histEmpty");
  for (const e of entries.slice(0, 50)) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    const amt = document.createElement("div");
    amt.className = "amt";
    const kes = e.status === "completed" && e.kesReceived != null ? e.kesReceived : e.kesExpected;
    let line = money(kes, "KES");
    if (merchant.currency !== "KES" && rates && rates[merchant.currency])
      line += `  ≈ ${money(Math.round(kes * rates[merchant.currency] * 100) / 100, merchant.currency)}`;
    amt.textContent = line;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = e.mpesaCode ? `${e.mpesaCode} · ${fmtDate(e.confirmedAt || e.at)}` : fmtDate(e.at);
    left.append(amt, sub);
    // What landed and why: the fee the payer covered, quoted vs received
    // when they differ, or the wallet's own conversion that absorbed the fee.
    if (e.status === "completed" && e.kesReceived != null) {
      const det = document.createElement("div");
      det.className = "sub";
      if (e.mode === "msat") {
        det.textContent = t("histWallet");
      } else if (e.kesReceived < e.kesExpected) {
        det.textContent = `${t("quotedWord")} ${money(e.kesExpected, "KES")}, ${t("landedWord")} ${money(e.kesReceived, "KES")}`;
        det.className = "sub short";
      } else if (e.feeKes != null) {
        det.textContent = `${t("payerFee")} ${money(e.feeKes, "KES")} ${t("pctNote")}`;
      }
      if (det.textContent) left.append(det);
    }
    const st = document.createElement("div");
    st.className = "st " + (e.status === "completed" ? "done" : e.status === "failed" ? "fail" : "wait");
    st.textContent = e.status === "completed" ? t("received") : e.status === "failed" ? t("failed") : t("waiting");
    li.append(left, st);
    ul.append(li);
  }
}

async function loadHistory() {
  try {
    const d = await api("history", { auth: true });
    localStorage.setItem("kt.history", JSON.stringify(d.entries));
    if (merchant.currency !== "KES") {
      try {
        const r = await api("rates");
        rates = r.rates;
      } catch { rates = null; }
    } else rates = null;
    renderHistory(d.entries);
    checkPending();
  } catch {
    try {
      renderHistory(JSON.parse(localStorage.getItem("kt.history") || "[]"));
    } catch { renderHistory([]); }
  }
}

// A customer who scans the printed QR straight from a wallet never opens the
// pay page, so nothing else asks Tando whether that payment landed. While the
// app is open and on screen, it asks for this shop's own newest pending
// payments (the server picks them, at most 5) and History updates in place.
const CHECK_EVERY = 20e3;
const RECENT_MS = 3 * 864e5; // the server only asks about the last three days
let checking = false;
function hasPending() {
  try {
    return JSON.parse(localStorage.getItem("kt.history") || "[]")
      .some((e) => e && e.status === "pending" && Date.now() - Date.parse(e.at) < RECENT_MS);
  } catch { return false; }
}
async function checkPending() {
  if (checking || !merchant || !localStorage.getItem("kt.session")) return;
  if (document.visibilityState !== "visible" || !navigator.onLine || !hasPending()) return;
  checking = true;
  try {
    const d = await api("check", { method: "POST", auth: true });
    localStorage.setItem("kt.history", JSON.stringify(d.entries));
    renderHistory(d.entries);
    if (d.merchant && (d.merchant.verified !== merchant.verified || d.merchant.claimed !== merchant.claimed)) {
      merchant = d.merchant;
      localStorage.setItem("kt.merchant", JSON.stringify(merchant));
      renderQR();
      renderSettings();
    }
  } catch (e) {
    if (e.status === 401) signOut();
  } finally {
    checking = false;
  }
}
setInterval(checkPending, CHECK_EVERY);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkPending(); });

function setMerchant(m) {
  merchant = m;
  if (m) {
    localStorage.setItem("kt.merchant", JSON.stringify(m));
    lang = m.lang || "en";
    $("signed-out").hidden = true;
    $("signed-in").hidden = false;
  } else {
    localStorage.removeItem("kt.merchant");
    localStorage.removeItem("kt.history");
    $("signed-out").hidden = false;
    $("signed-in").hidden = true;
  }
  applyLang();
  document.body.classList.toggle("signed-out", !m);
  if (m) {
    renderQR();
    renderSettings();
    loadHistory();
  }
  showScreen(m ? "qr" : "settings");
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("lang-toggle").hidden = Boolean(merchant);
  $("lang-en").setAttribute("aria-pressed", String(lang === "en"));
  $("lang-sw").setAttribute("aria-pressed", String(lang === "sw"));
  if (merchant) {
    renderQR();
    renderSettings();
    try {
      renderHistory(JSON.parse(localStorage.getItem("kt.history") || "[]"));
    } catch { /* history loads separately */ }
  }
}

function setBusy(btn, busy) {
  btn.disabled = busy;
}

async function boot() {
  lang = localStorage.getItem("kt.lang") || "en";
  $("tab-qr").addEventListener("click", () => showScreen("qr"));
  $("tab-settings").addEventListener("click", () => showScreen("settings"));
  $("btn-print-card").addEventListener("click", () => {
    showScreen("qr");
    buildSheet(1);
    document.body.dataset.print = "a6";
    setTimeout(() => window.print(), 50);
  });
  $("btn-print-sheet").addEventListener("click", () => {
    showScreen("qr");
    buildSheet(4);
    document.body.dataset.print = "a4";
    setTimeout(() => window.print(), 50);
  });
  window.addEventListener("afterprint", () => {
    delete document.body.dataset.print;
    const sheet = $("print-sheet");
    sheet.innerHTML = "";
    sheet.hidden = true;
  });
  $("btn-png").addEventListener("click", savePng);
  $("link-login").addEventListener("click", () => {
    $("f-login").hidden = false;
    $("link-login").hidden = true;
    $("f-login").scrollIntoView({ block: "nearest" });
  });
  const setLang = (l) => {
    lang = l;
    localStorage.setItem("kt.lang", l);
    applyLang();
  };
  $("lang-en").addEventListener("click", () => setLang("en"));
  $("lang-sw").addEventListener("click", () => setLang("sw"));

  $("f-register").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideErr("reg-err");
    if (!$("r-agree").checked) {
      showErr("reg-err", { message: t("agreeFirst") });
      return;
    }
    setBusy($("btn-register"), true);
    try {
      const d = await api("register", { method: "POST", body: {
        phone: $("r-phone").value, shop: $("r-shop").value, mpesaName: $("r-mpesa").value, pin: $("r-pin").value, agree: true, lang,
      } });
      localStorage.setItem("kt.session", d.session);
      setMerchant(d.merchant);
    } catch (e) { showErr("reg-err", e); }
    setBusy($("btn-register"), false);
  });

  $("f-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideErr("login-err");
    $("forgot-pin").hidden = true;
    setBusy($("btn-login"), true);
    try {
      const d = await api("login", { method: "POST", body: { phone: $("l-phone").value, pin: $("l-pin").value } });
      localStorage.setItem("kt.session", d.session);
      setMerchant(d.merchant);
    } catch (e) {
      showErr("login-err", e);
      // Under the error: how to get a forgotten PIN reset, with the help contact when set.
      $("forgot-contact").textContent = localStorage.getItem("kt.help") || "";
      $("forgot-pin").hidden = false;
    }
    setBusy($("btn-login"), false);
  });

  $("f-names").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideErr("set-err");
    $("set-ok").hidden = true;
    setBusy($("btn-save"), true);
    try {
      const d = await api("settings", { method: "POST", auth: true,
        body: { shop: $("s-shop").value, mpesaName: $("s-mpesa").value } });
      setMerchant(d.merchant);
      showOk("set-ok");
    } catch (e) {
      if (e.status === 401) return signOut();
      showErr("set-err", e);
    }
    setBusy($("btn-save"), false);
  });

  const savePref = async (patch) => {
    try {
      const d = await api("settings", { method: "POST", auth: true, body: patch });
      setMerchant(d.merchant);
    } catch (e) {
      if (e.status === 401) return signOut();
      $("offline-note").hidden = false;
      renderSettings();
    }
  };
  $("s-currency").addEventListener("change", () => savePref({ currency: $("s-currency").value }));
  $("s-lang").addEventListener("change", () => savePref({ lang: $("s-lang").value }));

  $("f-pin").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideErr("pin-err");
    $("pin-ok").hidden = true;
    setBusy($("btn-pin"), true);
    try {
      await api("pin", { method: "POST", auth: true, body: { pin: $("p-new").value } });
      $("p-new").value = "";
      showOk("pin-ok");
    } catch (e) {
      if (e.status === 401) return signOut();
      showErr("pin-err", e);
    }
    setBusy($("btn-pin"), false);
  });

  $("btn-signout").addEventListener("click", async () => {
    try {
      await api("lock", { method: "POST", auth: true });
    } catch { /* the local session ends either way */ }
    signOut();
  });

  window.addEventListener("online", () => refresh());
  window.addEventListener("offline", () => { $("offline-note").hidden = false; });

  // With the keyboard open the content area scrolls, never the page: keep
  // the focused field (and the submit below it) in view.
  document.addEventListener("focusin", (ev) => {
    const el = ev.target;
    if (el && el.matches && el.matches("input,select")) el.scrollIntoView({ block: "nearest" });
  });
  loadHelp();
  applyLang();
  if (!localStorage.getItem("kt.session")) {
    document.body.classList.add("signed-out");
    showScreen("settings");
    return;
  }
  if (!navigator.onLine) return bootOffline();
  try {
    const d = await api("me", { auth: true });
    setMerchant(d.merchant);
  } catch (e) {
    if (e.status === 401) return signOut();
    bootOffline(); // the network failed, not the session: run on saved data
  }
}

// No internet, no SIM: the QR and the card render locally from the saved
// account, history comes from its cache. Payments still land, because the
// customer's wallet and the M-Pesa SMS do the work.
function bootOffline() {
  try {
    const m = JSON.parse(localStorage.getItem("kt.merchant") || "null");
    if (!m) return signOut();
    setMerchant(m);
    $("offline-note").hidden = false;
  } catch {
    signOut();
  }
}

async function refresh() {
  $("offline-note").hidden = true;
  if (!localStorage.getItem("kt.session")) return;
  try {
    const d = await api("me", { auth: true });
    setMerchant(d.merchant);
  } catch {
    $("offline-note").hidden = false;
  }
}

// The pilot help contact (KTOWN_HELP), as plain text, cached for offline
// days. Nothing shows when Stanley has not set one.
async function loadHelp() {
  try {
    const d = await api("help");
    const contact = d && typeof d.help === "string" && d.help ? d.help : null;
    if (contact) {
      localStorage.setItem("kt.help", contact);
      showHelp(contact);
    } else {
      localStorage.removeItem("kt.help"); // Stanley removed it: forget it everywhere
    }
  } catch {
    showHelp(localStorage.getItem("kt.help")); // offline: the last known contact, if any
  }
}
function showHelp(contact) {
  if (!contact) return;
  $("help-app-contact").textContent = contact;
  $("help-app").hidden = false;
}

async function signOut() {
  localStorage.removeItem("kt.session");
  lang = localStorage.getItem("kt.lang") || "en";
  // Keep the merchant's words, forget the account.
  setMerchant(null);
  showScreen("settings");
}

// The printed card: a small Bitcoin QR code template. The Bitcoin mark and
// "bitcoin", ACCEPTED HERE, the shop, the framed code with the logo in the
// middle, and an orange SCAN TO PAY band ending in www.altradits.com.
// One card prints on A6; the A4 sheet holds four (A6 is a quarter of A4),
// cut along the dashed guides. Built on demand, removed after printing.
function buildCard() {
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const card = el("section", "tcard");
  card.append(el("div", "burst"));
  const top = el("div", "ttop");
  const brand = el("div", "tbrand");
  brand.innerHTML = BTC_MARK;
  brand.append(el("span", "word", "bitcoin"));
  top.append(brand, el("p", "acc", "Accepted here"), el("p", "tshop", merchant.shop));
  const frame = el("div", "frame");
  const q = $("qr").querySelector(".tq");
  if (q) frame.append(q.cloneNode(true));
  const band = el("div", "band");
  const scan = el("div", "scan");
  scan.innerHTML = PHONE_ICON;
  scan.append("Scan to pay");
  band.append(scan, el("div", "fine", "Tunapokea Bitcoin · Any Lightning wallet · Shop gets M-Pesa"),
    el("div", "site", "www.altradits.com"));
  card.append(top, frame, band);
  return card;
}

function buildSheet(count) {
  const sheet = $("print-sheet");
  sheet.innerHTML = "";
  if (!merchant) return;
  for (let i = 0; i < count; i++) sheet.append(buildCard());
  sheet.hidden = false;
}

// The framed code as a PNG file, rendered locally: no network, nothing
// uploaded. The same template as the screen: orange frame, the code in ink,
// the logo on a white card in the middle, a wide white margin for print.
const PNG = { S: 2048, F: 1760, B: 40, P: 90 }; // canvas, frame, frame line, inner white
function pngSvg(qrSvg) {
  const { S, F, B, P } = PNG;
  const o = (S - F) / 2, Q = F - 2 * B - 2 * P, qx = o + B + P;
  const nest = (svg, x, y, w) => svg.replace("<svg ", `<svg x="${x}" y="${y}" width="${w}" height="${w}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">`
    + `<rect width="${S}" height="${S}" fill="#fff"/>`
    + `<rect x="${o - 44}" y="${o - 44}" width="${F + 88}" height="${F + 88}" rx="${120 + 44}" fill="none" stroke="#F7931A" stroke-opacity=".35" stroke-width="16"/>`
    + `<rect x="${o + B / 2}" y="${o + B / 2}" width="${F - B}" height="${F - B}" rx="100" fill="#fff" stroke="#F7931A" stroke-width="${B}"/>`
    + nest(qrSvg, qx, qx, Q)
    + "</svg>";
}
const loadImg = (src) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = src;
});

async function savePng() {
  const svg = $("qr").querySelector(".tq > svg");
  const err = $("qr-err");
  err.hidden = true;
  if (!svg || !merchant) return;
  const btn = $("btn-png");
  btn.disabled = true;
  try {
    const { S, F, B, P } = PNG;
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pngSvg(new XMLSerializer().serializeToString(svg)));
    const [img, logo] = await Promise.all([loadImg(url), loadImg(LOGO)]);
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, S, S);
    cx.drawImage(img, 0, 0, S, S);
    // The logo card: 40% of the code wide, the logo's height plus padding.
    const Q = F - 2 * B - 2 * P, W = Math.round(Q * 0.4), px = Math.round(Q * 0.02), py = Math.round(Q * 0.016);
    const lw = W - 2 * px, lh = Math.round(lw * logo.naturalHeight / logo.naturalWidth), H = lh + 2 * py;
    const x = (S - W) / 2, y = (S - H) / 2;
    cx.fillStyle = "#fff";
    cx.beginPath();
    if (cx.roundRect) cx.roundRect(x, y, W, H, 24);
    else cx.rect(x, y, W, H);
    cx.fill();
    cx.drawImage(logo, x + px, y + py, lw, lh);
    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    if (!blob) throw new Error("png");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = merchant.shop.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ktown-qr";
    a.download = `${slug}-qr.png`;
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  } catch {
    err.textContent = t("pngFail");
    err.hidden = false;
  }
  btn.disabled = false;
}

boot();
