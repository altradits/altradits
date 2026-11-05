/* kTown pay page: any customer with a Lightning wallet. Amount in KES (or the
payer's currency), the exact shillings the merchant receives, the invoice,
then the paid confirmation. Talks only to this site's own API. */
"use strict";
const $ = (id) => document.getElementById(id);

const STR = {
  en: {
    loading: "Loading…", amount: "Amount", pay: "Pay",
    honest: "kTown holds no money. Tando converts sats to M-Pesa for a 1% fee.",
    between: "Between", and: "and", receive: "Merchant receives",
    feeIncl: "Tando's 1% included", scanWith: "Scan with your wallet",
    copy: "Copy", copied: "Copied.", openWallet: "Open in wallet",
    waitingPay: "Waiting for payment…", stillWaiting: "Still waiting.",
    checkAgain: "Check again", newAmount: "New amount",
    paid: "Paid", paidRecv: "Merchant received", failedPay: "Payment failed. Try a new amount.",
    afterPayNote: "After paying, the merchant's M-Pesa message confirms it.",
    unknownQr: "This QR code is unknown.",
    confirmed: "Confirmed M-Pesa name", notConfirmed: "M-Pesa name not yet confirmed",
    noConn: "No connection. Try again.", tryAgain: "Something went wrong. Try again.",
  },
  sw: {
    loading: "Inapakia…", amount: "Kiasi", pay: "Lipa",
    honest: "kTown haishiki pesa. Tando hubadilisha sats kuwa M-Pesa kwa asilimia 1.",
    between: "Kati ya", and: "na", receive: "Muuzaji atapokea",
    feeIncl: "Ada ya Tando asilimia 1 imejumuishwa", scanWith: "Skani na pochi yako",
    copy: "Nakili", copied: "Imenakiliwa.", openWallet: "Fungua kwenye pochi",
    waitingPay: "Inasubiri malipo…", stillWaiting: "Bado inasubiri.",
    checkAgain: "Angalia tena", newAmount: "Kiasi kipya",
    paid: "Imelipwa", paidRecv: "Muuzaji alipokea", failedPay: "Malipo yameshindikana. Jaribu kiasi kipya.",
    afterPayNote: "Baada ya kulipa, ujumbe wa M-Pesa wa muuzaji ndio uthibitisho.",
    unknownQr: "Msimbo huu haujulikani.",
    confirmed: "Jina la M-Pesa limethibitishwa", notConfirmed: "Jina la M-Pesa halijathibitishwa",
    noConn: "Hakuna mtandao. Jaribu tena.", tryAgain: "Kuna tatizo. Jaribu tena.",
  },
};
let lang = localStorage.getItem("kt.paylang") || "en";
const t = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;
const kesFmt = (n) => `KSh ${Number(n).toLocaleString("en-US")}`;

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
  if (!r.ok || !d || d.status === "ERROR" || d.success === false)
    throw new Error((d && (d.reason || d.error)) || t("tryAgain"));
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
  if (kes == null || !terms) {
    $("receive").textContent = "";
    $("sats").textContent = "";
    btn.disabled = true;
    return;
  }
  $("receive").textContent = `${t("receive")} ${kesFmt(kes)}`;
  const sats = Math.round((kes * terms.mult * 1.01) / 1000);
  $("sats").textContent = `≈ ${sats.toLocaleString("en-US")} sats · ${t("feeIncl")}`;
  const ok = kes >= terms.kesMin && kes <= terms.kesMax;
  btn.disabled = !ok;
  if (!ok) {
    const el = $("pay-err");
    el.textContent = `${t("between")} ${kesFmt(terms.kesMin)} ${t("and")} ${kesFmt(terms.kesMax)}.`;
    el.hidden = false;
  }
}

function drawQR(el, text) {
  el.innerHTML = "";
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
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

function showPaid(d) {
  $("view-invoice").hidden = true;
  $("view-paid").hidden = false;
  $("paid-title").textContent = `✓ ${t("paid")}`;
  $("paid-code").textContent = d.mpesaCode || "";
  $("paid-sub").textContent = d.kes != null ? `${t("paidRecv")} ${kesFmt(d.kes)}` : "";
  window.scrollTo(0, 0);
}

function hideErr(id) {
  $(id).hidden = true;
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

  if (!id) {
    fatal(t("unknownQr"));
    applyLang();
    return;
  }
  applyLang();
  let pay;
  try {
    pay = await get(`lnurlp/${encodeURIComponent(id)}`);
  } catch {
    fatal(t("unknownQr"));
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
    fatal(t("unknownQr"));
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
      window.scrollTo(0, 0);
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
    window.scrollTo(0, 0);
  });
}

boot();
