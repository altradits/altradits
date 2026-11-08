/* kTown pay page: any customer with a Lightning wallet. Amount in KES (or the
payer's currency), the exact shillings the merchant receives, the invoice,
then the paid confirmation. Talks only to this site's own API. */
"use strict";
const $ = (id) => document.getElementById(id);

const STR = {
  en: {
    loading: "Loading…", amount: "Amount", pay: "Pay",
    honest: "kTown holds no money. Our payout partner converts sats to M-Pesa for a 1% fee.",
    helpIs: "Help",
    between: "Between", and: "and", receive: "Merchant receives",
    scanWith: "Scan with your wallet",
    copy: "Copy", copied: "Copied.", openWallet: "Open in wallet",
    waitingPay: "Waiting for payment…", stillWaiting: "Still waiting.",
    checkAgain: "Check again", newAmount: "New amount",
    paid: "Paid", paidRecv: "Merchant received", failedPay: "Payment failed. Try a new amount.",
    tandoFee: "Conversion fee", about: "about", pctNote: "(1%)",
    youPaid: "You paid", satsUnit: "sats",
    afterPayNote: "After paying, the merchant's M-Pesa message confirms it.",
    unknownQr: "This QR code is unknown.",
    tryLater: "Try again in a minute.",
    confirmed: "Confirmed M-Pesa name", notConfirmed: "M-Pesa name not yet confirmed",
    noConn: "No connection. Try again.", tryAgain: "Something went wrong. Try again.",
  },
  sw: {
    loading: "Inapakia…", amount: "Kiasi", pay: "Lipa",
    honest: "kTown haishiki pesa. Mshirika wetu wa malipo hubadilisha sats kuwa M-Pesa kwa asilimia 1.",
    helpIs: "Msaada",
    between: "Kati ya", and: "na", receive: "Muuzaji atapokea",
    scanWith: "Skani na pochi yako",
    copy: "Nakili", copied: "Imenakiliwa.", openWallet: "Fungua kwenye pochi",
    waitingPay: "Inasubiri malipo…", stillWaiting: "Bado inasubiri.",
    checkAgain: "Angalia tena", newAmount: "Kiasi kipya",
    paid: "Imelipwa", paidRecv: "Muuzaji alipokea", failedPay: "Malipo yameshindikana. Jaribu kiasi kipya.",
    tandoFee: "Ada ya kubadilisha", about: "takriban", pctNote: "(asilimia 1)",
    youPaid: "Umelipa", satsUnit: "sats",
    afterPayNote: "Baada ya kulipa, ujumbe wa M-Pesa wa muuzaji ndio uthibitisho.",
    unknownQr: "Msimbo huu haujulikani.",
    tryLater: "Jaribu tena baada ya dakika moja.",
    confirmed: "Jina la M-Pesa limethibitishwa", notConfirmed: "Jina la M-Pesa halijathibitishwa",
    noConn: "Hakuna mtandao. Jaribu tena.", tryAgain: "Kuna tatizo. Jaribu tena.",
  },
};
let lang = localStorage.getItem("kt.paylang") || "en";
const t = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;
const kesFmt = (n) => `KSh ${Number(n).toLocaleString("en-US")}`;
// An about figure with at most two decimals, zeros trimmed: 20.2, not 20.20.
const kesApprox = (n) => `KSh ${Number(Number(n).toFixed(2)).toLocaleString("en-US")}`;

const id = (location.pathname.match(/\/k\/([A-Za-z0-9_-]{1,80})/) || [])[1] || "";
let terms = null; // { shop, mpesa, verified, kesMin, kesMax, mult }
let rates = null;
let pollTimer = null;
let pollCount = 0;
let payHash = null;

async function get(path) {
  let r;
  try {
    r = await fetch("/api/ktown/" + path, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error(t("noConn"));
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.status === "ERROR" || d.success === false) {
    const said = d && (d.reason || d.error);
    throw Object.assign(new Error(said || t("tryAgain")), { status: r.status, said: typeof said === "string" ? said : "" });
  }
  return d;
}

function fatal(msg) {
  $("loading").hidden = true;
  const el = $("fatal");
  el.textContent = msg;
  el.hidden = false;
}

function kesOfInput() {
  // "1,000" is a thousand, "10,50" is ten and a half: a comma beside a dot,
  // or with three digits after it, groups thousands; otherwise it is decimal.
  let v = $("amount").value.replace(/\s/g, "");
  v = v.includes(".") || /,\d{3}([^0-9]|$)/.test(v) ? v.replace(/,/g, "") : v.replace(/,/g, ".");
  const val = Number(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(val) || val <= 0) return null;
  const cur = $("pay-currency").value;
  if (cur === "KES" || !rates || !rates[cur]) return Math.round(val);
  return Math.round(val / rates[cur]);
}

function refreshReceive() {
  hideErr("pay-err");
  const kes = kesOfInput();
  const btn = $("btn-pay");
  // Before paying, the payer sees only what the merchant will receive: no
  // sats figure, no fee line. The breakdown shows after the payment lands.
  if (kes == null || !terms) {
    $("receive").textContent = "";
    btn.disabled = true;
    return;
  }
  $("receive").textContent = `${t("receive")} ${kesFmt(kes)}`;
  const ok = kes >= terms.kesMin && kes <= terms.kesMax;
  btn.disabled = !ok;
  if (!ok) {
    const el = $("pay-err");
    el.textContent = `${t("between")} ${kesFmt(terms.kesMin)} ${t("and")} ${kesFmt(terms.kesMax)}.`;
    el.hidden = false;
  }
}

// The invoice in the Bitcoin QR code template, as on the shop's own QR: a
// level H code in ink (30% kept for repairs) with the Altradits logo
// centred on it on a white card, inside the orange frame.
function drawQR(el, text) {
  const qr = qrcode(0, "H");
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true }).replace('fill="black"', 'fill="#1d1d1f"');
  el.innerHTML = `<div class="tq">${svg}<div class="tq-mid"><img src="/assets/logo.png" alt="" width="325" height="119"></div></div>`;
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function pollOnce() {
  pollCount++;
  try {
    const d = await get(`receipt/${payHash}`);
    if (d.paid) {
      stopPoll();
      showPaid(d);
      return true;
    }
    if (d.status === "failed") {
      stopPoll();
      const el = $("inv-err");
      el.textContent = t("failedPay");
      el.hidden = false;
      return true;
    }
  } catch {
    /* keep waiting through blips */
  }
  if (pollCount >= 100) {
    stopPoll();
    $("wait-text").textContent = t("stillWaiting");
    const again = document.createElement("button");
    again.type = "button";
    again.className = "link";
    again.textContent = t("checkAgain");
    again.addEventListener("click", () => {
      again.remove();
      pollCount = 0;
      $("wait-text").textContent = t("waitingPay");
      pollTimer = setInterval(pollOnce, 3000);
    });
    $("inv-wait").append(again);
    return true;
  }
  return false;
}

function setLine(id, text) {
  $(id).textContent = text || "";
  $(id).parentElement.hidden = !text;
}

function showPaid(d) {
  $("view-invoice").hidden = true;
  $("view-paid").hidden = false;
  $("paid-title").textContent = `✓ ${t("paid")}`;
  $("paid-code").textContent = d.mpesaCode || "";
  setLine("paid-sub", d.kes != null ? `${t("paidRecv")} ${kesFmt(d.kes)}` : "");
  setLine("paid-fee", d.kes != null && d.feeKes != null
    ? `${t("tandoFee")} ${t("about")} ${kesApprox(d.feeKes)} ${t("pctNote")}` : "");
  setLine("paid-sats", d.kes != null && d.feeKes != null && d.sats != null
    ? `${t("youPaid")} ${Number(d.sats).toLocaleString("en-US")} ${t("satsUnit")} (${t("about")} ${kesApprox(d.kes + d.feeKes)})` : "");
  toTop();
}

function hideErr(id) {
  $(id).hidden = true;
}

// The content area scrolls, never the page: a new view starts at the top.
function toTop() {
  const main = document.querySelector("main");
  if (main) main.scrollTop = 0;
}

async function boot() {
  const applyLang = () => {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $("lang-en").setAttribute("aria-pressed", String(lang === "en"));
    $("lang-sw").setAttribute("aria-pressed", String(lang === "sw"));
    $("loading").textContent = t("loading");
    if (terms) {
      const mark = $("pay-mark");
      mark.textContent = terms.verified ? "✓ " + t("confirmed") : t("notConfirmed");
      mark.className = "mark " + (terms.verified ? "ok" : "no");
      $("limits").textContent = `${t("between")} ${kesFmt(terms.kesMin)} ${t("and")} ${kesFmt(terms.kesMax)}.`;
      refreshReceive();
    }
  };
  $("lang-en").addEventListener("click", () => { lang = "en"; localStorage.setItem("kt.paylang", lang); applyLang(); });
  $("lang-sw").addEventListener("click", () => { lang = "sw"; localStorage.setItem("kt.paylang", lang); applyLang(); });

  // With the keyboard open the content area scrolls, never the page: keep
  // the focused field in view.
  document.addEventListener("focusin", (ev) => {
    const el = ev.target;
    if (el && el.matches && el.matches("input,select")) el.scrollIntoView({ block: "nearest" });
  });
  get("help").then((d) => {
    if (d && typeof d.help === "string" && d.help) {
      $("help-pay-contact").textContent = d.help;
      $("help-pay").hidden = false;
    }
  }).catch(() => { /* no help contact set, or offline: nothing shows */ });

  if (!id) {
    fatal(t("unknownQr"));
    applyLang();
    return;
  }
  applyLang();
  let pay;
  try {
    pay = await get(`lnurlp/${encodeURIComponent(id)}`);
  } catch (e) {
    // Only a 404 means the QR is unknown. Anything else (Tando down, too many
    // requests, no connection) says what the server said, or to try again soon.
    fatal(e.status === 404 ? t("unknownQr") : e.said || (e.status ? t("tryLater") : e.message || t("tryLater")));
    return;
  }
  try {
    const meta = JSON.parse(pay.metadata || "[]");
    const plain = (meta.find((m) => m[0] === "text/plain") || [])[1] || "";
    const cut = plain.indexOf("\n"); // names never hold a newline (oneLine), so this split is exact
    const mpesa = cut < 0 ? "" : plain.slice(0, cut);
    const shop = cut < 0 ? "" : plain.slice(cut + 1);
    terms = {
      shop: shop || "", mpesa: mpesa || "", verified: pay.verified === true,
      kesMin: pay.currency.minSendable, kesMax: pay.currency.maxSendable, mult: pay.currency.multiplier,
    };
    if (!terms.shop || !(terms.kesMax >= terms.kesMin) || !(terms.mult > 0)) throw new Error("bad terms");
  } catch {
    fatal(t("tryLater")); // a garbled answer is not an unknown QR
    return;
  }
  document.title = `${terms.shop} · Pay`;
  $("pay-shop").textContent = terms.shop;
  $("pay-mpesa").textContent = terms.mpesa;
  applyLang();
  try {
    rates = (await get("rates")).rates;
  } catch {
    rates = null;
    $("pay-currency").value = "KES";
    $("pay-currency").disabled = true;
  }
  $("loading").hidden = true;
  $("view-pay").hidden = false;

  $("amount").addEventListener("input", refreshReceive);
  $("pay-currency").addEventListener("change", refreshReceive);
  refreshReceive();

  $("btn-pay").addEventListener("click", async () => {
    const kes = kesOfInput();
    if (kes == null || kes < terms.kesMin || kes > terms.kesMax) return;
    $("btn-pay").disabled = true;
    hideErr("pay-err");
    try {
      const inv = await get(`lnurlp/${encodeURIComponent(id)}/cb?amount=${kes}&currency=KES`);
      const pr = String(inv.pr || "").toUpperCase();
      if (!pr) throw new Error(t("tryAgain"));
      $("view-pay").hidden = true;
      $("view-invoice").hidden = false;
      drawQR($("inv-qr"), pr);
      $("btn-open").href = "lightning:" + pr;
      $("wait-text").textContent = t("waitingPay");
      $("copied").hidden = true;
      hideErr("inv-err");
      toTop();
      const u = String((inv.successAction && inv.successAction.url) || "");
      const h = (u.split("/").pop() || "").toLowerCase();
      if (/^[0-9a-f]{64}$/.test(h)) {
        payHash = h;
        pollCount = 0;
        stopPoll();
        pollTimer = setInterval(pollOnce, 3000);
      } else {
        $("wait-text").textContent = t("afterPayNote");
      }
      $("btn-copy").onclick = async () => {
        try {
          await navigator.clipboard.writeText(pr);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = pr;
          document.body.append(ta);
          ta.select();
          try { document.execCommand("copy"); } catch { /* older webview */ }
          ta.remove();
        }
        $("copied").textContent = t("copied");
        $("copied").hidden = false;
      };
    } catch (e) {
      const el = $("pay-err");
      el.textContent = e.message || t("tryAgain");
      el.hidden = false;
      $("btn-pay").disabled = false;
    }
  });

  $("link-amount").addEventListener("click", () => {
    stopPoll();
    $("view-invoice").hidden = true;
    $("view-pay").hidden = false;
    refreshReceive();
    toTop();
  });
}

boot();
