/* kTown merchant app: the QR screen and Settings. Everything rendered comes
through textContent; innerHTML is only the QR library's SVG and one static
bolt icon (no scripts, no handlers). Talks only to this site's own API. */
"use strict";
const $ = (id) => document.getElementById(id);
const BOLT = '<svg class="bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8L20 9h-7l1-7z" fill="currentColor"/></svg>';

const STR = {
  en: {
    qr: "QR", settings: "Settings", printCard: "Print card", printSheet: "Print sheet", savePng: "Save PNG",
    honest: "kTown holds no money. Tando converts sats to M-Pesa for a 1% fee.",
    register: "Register", phone: "M-Pesa number", shop: "Shop name",
    mpesaName: "M-Pesa name, exactly as M-Pesa shows it", pin: "6-digit PIN",
    agree1: "I agree to the", agree2: "terms", agreeFirst: "Tick 'I agree' to the terms first.",
    poweredBy: "Powered by Tando (1% fee)", helpIs: "Help",
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
    histWallet: "Paid from a wallet in sats. Tando's 1% came out of the shillings.",
    noConn: "No connection. Try again.",
    tryAgain: "Something went wrong. Try again.",
    offlineNote: "Offline. Showing saved data.",
    pngFail: "PNG failed. Try again.",
  },
  sw: {
    qr: "QR", settings: "Mipangilio", printCard: "Chapisha kadi", printSheet: "Chapisha karatasi", savePng: "Hifadhi PNG",
    honest: "kTown haishiki pesa. Tando hubadilisha sats kuwa M-Pesa kwa asilimia 1.",
    register: "Jisajili", phone: "Nambari ya M-Pesa", shop: "Jina la duka",
    mpesaName: "Jina la M-Pesa, kama M-Pesa inavyoonyesha", pin: "PIN ya tarakimu 6",
    agree1: "Nakubali", agree2: "masharti", agreeFirst: "Weka tiki 'Nakubali' masharti kwanza.",
    poweredBy: "Inaendeshwa na Tando (ada 1%)", helpIs: "Msaada",
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
    histWallet: "Imelipwa kutoka pochi kwa sats. Asilimia 1 ya Tando ilitoka kwenye shilingi.",
    noConn: "Hakuna mtandao. Jaribu tena.",
    tryAgain: "Kuna tatizo. Jaribu tena.",
    offlineNote: "Nje ya mtandao. Inaonyesha data iliyohifadhiwa.",
    pngFail: "PNG imeshindikana. Jaribu tena.",
  },
};
let lang = "en";
const t = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/ktown/sw.js").catch(() => {});
const SYM = { KES: "KSh ", USD: "$", EUR: "€", UGX: "USh ", TZS: "TSh " };
const money = (n, code) => `${SYM[code] || `${code} `}${Number(n).toLocaleString("en-US")}`;

let merchant = null;
let rates = null;

// The post that brought the merchant (?ref=, utm tags on our own address),
// stored with the registration so it can be matched to its lead.
function pageSource() {
  const q = new URLSearchParams(location.search);
  return { ref: q.get("ref"), utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"), utm_campaign: q.get("utm_campaign") };
}
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
  el.textContent = e && e.message ? e.message : t("tryAgain");
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

function drawQR(text) {
  const el = $("qr");
  el.innerHTML = "";
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
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
  } catch {
    try {
      renderHistory(JSON.parse(localStorage.getItem("kt.history") || "[]"));
    } catch { renderHistory([]); }
  }
}

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
    document.body.dataset.print = "a6";
    setTimeout(() => window.print(), 50);
  });
  $("btn-print-sheet").addEventListener("click", () => {
    showScreen("qr");
    buildSheet();
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
  $("link-login").addEventListener("click", () => { $("f-login").hidden = false; $("link-login").hidden = true; });
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
        phone: $("r-phone").value, shop: $("r-shop").value, mpesaName: $("r-mpesa").value, pin: $("r-pin").value, agree: true, source: pageSource(),
      } });
      localStorage.setItem("kt.session", d.session);
      setMerchant(d.merchant);
    } catch (e) { showErr("reg-err", e); }
    setBusy($("btn-register"), false);
  });

  $("f-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideErr("login-err");
    setBusy($("btn-login"), true);
    try {
      const d = await api("login", { method: "POST", body: { phone: $("l-phone").value, pin: $("l-pin").value } });
      localStorage.setItem("kt.session", d.session);
      setMerchant(d.merchant);
    } catch (e) { showErr("login-err", e); }
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

  // Static pages carry no outside addresses; the credit link is set here.
  document.querySelectorAll(".powered a").forEach((a) => { a.href = "https://bitcoin.co.ke/"; });
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

// The A4 sheet: the card four times (A6 is a quarter of A4), cut along the
// dashed guides. Built on demand for printing, removed afterwards.
function buildSheet() {
  const sheet = $("print-sheet");
  sheet.innerHTML = "";
  if (!merchant) return;
  const svg = $("qr").querySelector("svg");
  for (let i = 0; i < 4; i++) {
    const card = document.createElement("div");
    card.className = "sheet-card";
    const shop = document.createElement("div");
    shop.className = "shop";
    shop.textContent = merchant.shop;
    const mp = document.createElement("div");
    mp.className = "mpesa-name";
    mp.textContent = merchant.mpesaName;
    const box = document.createElement("div");
    box.className = "qr-card";
    if (svg) box.append(svg.cloneNode(true));
    const line = document.createElement("p");
    line.className = "print-line";
    line.textContent = "Pay with Bitcoin Lightning ";
    const bolt = document.createElement("b");
    bolt.innerHTML = BOLT;
    line.append(bolt);
    const foot = document.createElement("p");
    foot.className = "print-foot";
    foot.textContent = "Powered by Tando (1% fee)";
    card.append(shop, mp, box, line, foot);
    sheet.append(card);
  }
  sheet.hidden = false;
}

// The QR as a PNG file, rendered locally: no network, nothing uploaded.
async function savePng() {
  const svg = $("qr").querySelector("svg");
  const err = $("qr-err");
  err.hidden = true;
  if (!svg || !merchant) return;
  const btn = $("btn-png");
  btn.disabled = true;
  try {
    const S = 2048, Q = 1600, M = (S - Q) / 2; // wide quiet margin, crisp in print
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", String(Q));
    clone.setAttribute("height", String(Q));
    const img = new Image();
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, S, S);
    cx.drawImage(img, M, M, Q, Q);
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
