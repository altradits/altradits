// Ye₿ente (https://github.com/altradits/yebente), served at /yebente. Its API lives
// here at /api/yebente/<path> (server.mjs passes the path on).
//
// What runs depends on the environment, so nothing moves money until Stanley
// switches it on:
//   GET  health                      always
//   POST mpesa/hakikisha/c2b         with Daraja credentials, signed in to a wallet (a read-only name lookup)
//   POST mpesa/stkpush               off: it took shillings and delivered nothing (buy into a wallet instead)
//   POST mpesa/query                  off: buys are checked through wallet/buy/<id> (signed in)
//   POST mpesa/callback/<secret>     Safaricom's STK result (secret: YEBENTE_CALLBACK_SECRET)
//   POST lightning/create-invoice    off: anyone could fill the node with invoices; wallet/invoice instead
//   GET  lightning/invoice-status/x  off (same)
// Ye₿ente wallets (custodial, on the Altradits node; lib/ywallet.js):
//   POST wallet/create {pin, handle?}     -> {wallet, token, recovery} (shown once)
//   POST wallet/restore {recovery, pin}   -> {wallet, token}
//   GET  wallet/me, wallet/history        (Authorization: Bearer <token>)
//   POST wallet/send {to, sats, pin}      a Ye₿ente handle (free), a Lightning address
//                                          (incl. phone@bitcoin.co.ke = M-Pesa) or an invoice
//   POST wallet/invoice {sats}            an invoice on the node for this wallet
//   POST wallet/passkey/options|add|off   fingerprint / face approval instead of the PIN (send {passkey})
//   GET  wallet/invoice/<hash>            credited once paid
//   POST wallet/email {email, pin}       a recovery email (confirmed by a link)
//   GET  wallet/email-confirm?t=          the link in that email
//   POST wallet/recover-email {email}     a one-time recovery link to each wallet confirmed with it
//   POST wallet/recover-email/finish {token, pin}  new PIN, other devices signed out, 24 h hold
//   POST wallet/buy {kes, phone}          M-Pesa STK Push for sats into this wallet (YEBENTE_MPESA_BUY=on)
//   GET  wallet/buy/<checkoutRequestId>   credited once Safaricom confirms
//   GET  lnurlp/<handle> (= /.well-known/lnurlp/<handle>) and lnurl/<handle>?amount=
//                                          handle@altradits.com as a Lightning address
// Every payout path (Lightning or on-chain disbursement, M-Pesa B2C/B2B,
// reversals, standing orders, Telebirr) answers 501: the app keeps its balance in
// the visitor's browser, so a server that paid on request could be emptied by
// anyone. The visitor pays from their own wallet (WebLN) instead.
import { json, readBody, clientIp, proxyShape } from "../lib/http.js";
import { getJSON, setJSON, hit, listIds } from "../lib/store.js";
import crypto from "node:crypto";

const env = (k) => String(process.env[k] || "").trim();
const DARAJA = () => (env("MPESA_ENVIRONMENT") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const darajaReady = () => Boolean(env("MPESA_CONSUMER_KEY") && env("MPESA_CONSUMER_SECRET"));
const switchOn = (k) => ["on", "true", "yes", "1"].includes(env(k).replace(/^["']|["']$/g, "").toLowerCase());
const buyOn = () => switchOn("YEBENTE_MPESA_BUY") && darajaReady() && Boolean(env("MPESA_SHORTCODE") && env("MPESA_PASSKEY") && env("YEBENTE_CALLBACK_SECRET"));
const site = () => (env("SITE_URL") || "https://altradits.com").replace(/\/$/, "");

const NOT_CONFIGURED = "M-Pesa credentials not configured. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.";
const NO_NODE = "Lightning disbursement node is not configured.";
const off = (error) => json({ success: false, settled: false, configured: false, error }, 501);

function formatKenyanPhone(phone) {
  const clean = String(phone).replace(/[^0-9]/g, "");
  if (clean.startsWith("254") && clean.length === 12) return clean;
  if (clean.startsWith("0") && clean.length === 10) return `254${clean.slice(1)}`;
  if (clean.length === 9) return `254${clean}`;
  return clean;
}

// YYYYMMDDHHmmss in East Africa Time (UTC+3), as Daraja expects.
function timestamp() {
  const d = new Date(Date.now() + 3 * 3600e3);
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

let token = null, tokenUntil = 0;
async function darajaToken() {
  if (token && Date.now() < tokenUntil) return token;
  if (!darajaReady()) throw new Error(NOT_CONFIGURED);
  const basic = Buffer.from(`${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`).toString("base64");
  const r = await fetch(`${DARAJA()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Failed to obtain M-Pesa access token: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  token = d.access_token;
  tokenUntil = Date.now() + Math.max(((parseInt(d.expires_in, 10) || 3599) - 60) * 1000, 60e3);
  return token;
}
async function daraja(path, payload) {
  const r = await fetch(`${DARAJA()}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${await darajaToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { errorMessage: text.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, data };
}
const stkPassword = (ts) => Buffer.from(`${env("MPESA_SHORTCODE")}${env("MPESA_PASSKEY")}${ts}`).toString("base64");
const safeId = (s) => String(s || "").replace(/[^\w-]/g, "").slice(0, 80);

// Sends the STK prompt. Only for a wallet purchase (walletBuy below).
async function stkPush(request, body) {
  if (!buyOn()) return off(NOT_CONFIGURED);
  const { phone, amount, accountReference, transactionDesc } = body;
  if (!phone || !amount || Number(amount) <= 0) return json({ success: false, error: "Valid phone and amount are required." }, 400);
  const formatted = formatKenyanPhone(phone);
  if (!/^254[71]\d{8}$/.test(formatted)) return json({ success: false, error: "Valid phone and amount are required." }, 400);
  // A payment prompt lands on someone's phone: at most 5 an hour to one number, and a
  // generous cap per connection (many people share one: an office, Safaricom's mobile addresses).
  const ipKey = crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);
  if ((await hit(`rl:yb:stkp:${formatted}`, 3600)) > 5) return json({ success: false, error: "Too many M-Pesa prompts to this number. Try again in an hour." }, 429);
  if ((await hit(`rl:yb:stk:${ipKey}`, 3600)) > 60) return json({ success: false, error: "Too many M-Pesa prompts from this network. Try again later." }, 429);
  const ts = timestamp();
  const { ok, data } = await daraja("/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: env("MPESA_SHORTCODE"), Password: stkPassword(ts), Timestamp: ts, TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(Number(amount)), PartyA: formatted, PartyB: env("MPESA_SHORTCODE"), PhoneNumber: formatted,
    CallBackURL: `${site()}/api/yebente/mpesa/callback/${env("YEBENTE_CALLBACK_SECRET")}`,
    AccountReference: String(accountReference || "yebente").slice(0, 12), TransactionDesc: String(transactionDesc || "Bitcoin Settlement").slice(0, 13),
  });
  if (!ok || data.ResponseCode !== "0") return json({ success: false, error: data.errorMessage || data.ResponseDescription || "Failed to trigger STK Push." }, 400);
  return json({ success: true, merchantRequestId: data.MerchantRequestID, checkoutRequestId: data.CheckoutRequestID, responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription, customerMessage: data.CustomerMessage });
}

async function stkQuery(request) {
  if (!buyOn()) return off(NOT_CONFIGURED);
  const checkoutRequestId = safeId((await readBody(request)).checkoutRequestId);
  if (!checkoutRequestId) return json({ success: false, error: "checkoutRequestId is required." }, 400);
  const cb = await getJSON(`yb:cb:${checkoutRequestId}`);
  if (cb) return json({ success: true, source: "callback", responseCode: "0", resultCode: cb.resultCode, resultDesc: cb.resultDesc, mpesaReceiptNumber: cb.mpesaReceiptNumber || null, checkoutRequestId });
  const ts = timestamp();
  const { ok, data } = await daraja("/mpesa/stkpushquery/v1/query", { BusinessShortCode: env("MPESA_SHORTCODE"), Password: stkPassword(ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId });
  const processing = String(data.ResultCode) === "49" || data.errorCode === "500.001.1001" || /being processed/i.test(`${data.errorMessage || ""} ${data.ResultDesc || ""}`);
  if (processing) return json({ success: true, inProgress: true, source: "daraja_query", resultCode: 49, resultDesc: "The payment prompt is pending on your phone. Please enter your PIN.", checkoutRequestId });
  if (String(data.ResultCode) === "0") return json({ success: true, source: "daraja_query", responseCode: data.ResponseCode || "0", resultCode: 0, resultDesc: data.ResultDesc || "The service request is processed successfully.", checkoutRequestId, mpesaReceiptNumber: data.MpesaReceiptNumber || null });
  return json({ success: ok, source: "daraja_query", responseCode: data.ResponseCode, resultCode: data.ResultCode, resultDesc: data.ResultDesc || data.errorMessage || "Transaction verification in progress.", checkoutRequestId });
}

// Safaricom posts the STK result here. Only the result is kept (no phone number),
// and only when the secret in the path matches, so nobody can fake a payment.
async function callback(request, secret) {
  const want = env("YEBENTE_CALLBACK_SECRET");
  if (!want || secret.length !== want.length || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(want))) return json({ ResultCode: 1, ResultDesc: "Rejected" }, 403);
  const stk = (await readBody(request))?.Body?.stkCallback;
  const id = safeId(stk?.CheckoutRequestID);
  if (id) {
    const receipt = (stk.CallbackMetadata?.Item || []).find((i) => i?.Name === "MpesaReceiptNumber")?.Value;
    await setJSON(`yb:cb:${id}`, { resultCode: stk.ResultCode, resultDesc: String(stk.ResultDesc || "").slice(0, 200), mpesaReceiptNumber: receipt ? String(receipt) : null, at: new Date().toISOString() });
    const { finishBuy } = await import("../lib/ywallet.js");
    await finishBuy(id, { resultCode: stk.ResultCode, receipt: receipt ? String(receipt) : null });
  }
  return json({ ResultCode: 0, ResultDesc: "Accepted" });
}

async function hakikisha(request) {
  if (!darajaReady()) return json({ success: false, verified: false, error: NOT_CONFIGURED }, 501);
  const w = await me(request); // each lookup uses the Daraja quota: wallet holders only
  if ((await hit(`rl:yb:hakw:${w.id}`, 3600)) > 20) return json({ success: false, verified: false, error: "Too many lookups. Try again in an hour." }, 429);
  const { shortCode, accountNumber, phone } = await readBody(request);
  const code = String(shortCode || "").trim();
  if (!/^\d{5,7}$/.test(code)) return json({ success: false, verified: false, error: "ShortCode is required." }, 400);
  // Each lookup uses the Daraja quota: at most 30 an hour from one connection.
  const ipKey = crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);
  if ((await hit(`rl:yb:hak:${ipKey}`, 3600)) > 30) return json({ success: false, verified: false, error: `Safaricom C2B Hakikisha lookup failed for ShortCode ${code}.` }, 429);
  const url = env("MPESA_ENVIRONMENT") === "production" ? "https://api.safaricom.co.ke/c2b_hakikisha/v1/notify" : "https://sandbox.safaricom.co.ke/c2b_hakikisha/v1/notify";
  const { ok, data } = await daraja(url.replace(DARAJA(), ""), { ShortCode: code, AccountNumber: accountNumber ? String(accountNumber).trim() : "", PhoneNumber: phone ? formatKenyanPhone(phone) : "" });
  const name = data?.OrgName || data?.BusinessName || data?.name;
  if (!ok) return json({ success: false, verified: false, error: data.errorMessage || data.ResponseDescription || `Safaricom C2B Hakikisha lookup failed for ShortCode ${code}.` }, 400);
  if (!name) return json({ success: false, verified: false, error: `Safaricom merchant not found for ShortCode ${code}. Ensure the shortcode is active on Safaricom Daraja.` }, 404);
  return json({ success: true, verified: true, shortCode: code, name, accountNumber: accountNumber || "", provider: "Safaricom M-Pesa C2B Hakikisha", upstreamVerified: true });
}

// Whether the server reaches the node (cached a minute): null when no node is set.
async function nodeUp() {
  const { lightningMode, inboundSats } = await import("../lib/lightning.js");
  return lightningMode() === "lnd" ? (await inboundSats()) !== null : null;
}

// ---- handle@altradits.com: LNURL-pay (LUD-06/16), invoices from the node for that wallet
const lnurlReply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
async function lnurlPay(request, handle, callback) {
  const yw = await import("../lib/ywallet.js");
  const w = yw.walletsOn() && (await yw.walletByHandle(handle));
  if (!w) return lnurlReply({ status: "ERROR", reason: "Unknown Lightning address." }, 404);
  const address = `${w.handle}@${yw.DOMAIN()}`;
  const metadata = JSON.stringify([["text/plain", `Pay ${address}`], ["text/identifier", address]]);
  const room = Math.min(yw.limits().maxPayment, yw.limits().maxBalance - w.balance);
  if (room < 1) return lnurlReply({ status: "ERROR", reason: "This wallet can't receive more right now." });
  if (!callback) return lnurlReply({ tag: "payRequest", callback: `${site()}/api/yebente/lnurl/${w.handle}`, minSendable: 1000, maxSendable: room * 1000, metadata, commentAllowed: 0 });
  if ((await hit(`rl:yb:lnurl:${w.id}`, 600)) > 60) return lnurlReply({ status: "ERROR", reason: "Too many requests." });
  const msats = Number(new URL(request.url).searchParams.get("amount"));
  if (!Number.isInteger(msats) || msats < 1000 || msats % 1000 || msats > room * 1000) return lnurlReply({ status: "ERROR", reason: `Send between 1 and ${room.toLocaleString("en-US")} sats.` });
  try {
    const descriptionHash = crypto.createHash("sha256").update(metadata).digest("hex");
    const inv = await yw.invoiceFor(w, msats / 1000, { descriptionHash });
    return lnurlReply({ pr: inv.invoice, routes: [] });
  } catch (e) {
    return lnurlReply({ status: "ERROR", reason: e.status ? e.message : "Lightning is temporarily unavailable." });
  }
}

// ---- wallets
const bearer = (request) => String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
async function me(request) {
  const { walletForToken } = await import("../lib/ywallet.js");
  const w = await walletForToken(bearer(request));
  if (!w) throw Object.assign(new Error("Sign in to your wallet again."), { status: 401 });
  return w;
}
const ipKey = (request) => crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);
async function walletPost(request, action) {
  const yw = await import("../lib/ywallet.js");
  const body = await readBody(request);
  if (action === "create") {
    // Per network, generous (an office or a mobile network shares one address), and an overall cap.
    if ((await hit(`rl:yb:create:${ipKey(request)}`, 3600)) > 40) return json({ success: false, error: "Too many new wallets from this network. Try again in an hour." }, 429);
    if ((await hit(`rl:yb:create:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 500) return json({ success: false, error: "Many people are joining right now. Try again in a few minutes." }, 429);
    return json({ success: true, ...(await yw.createWallet({ pin: body.pin, handle: body.handle, email: body.email, site: site() })) });
  }
  if (action === "restore") {
    if ((await hit(`rl:yb:restore:${ipKey(request)}`, 3600)) > 40) return json({ success: false, error: "Too many attempts. Try again in an hour." }, 429);
    return json({ success: true, ...(await yw.restoreWallet({ recovery: body.recovery, pin: body.pin })) });
  }
  if (action === "email") {
    const w = await me(request);
    await yw._internal.withLedger(() => yw._internal.checkPin(w, body.pin));
    if ((await hit(`rl:yb:email:${w.id}`, 3600)) > 5) return json({ success: false, error: "Too many attempts. Try again in an hour." }, 429);
    return json({ success: true, ...(await yw.setEmail(w, body.email, site())) });
  }
  if (action === "recover-email") {
    const email = String(body.email || "").trim().toLowerCase();
    if ((await hit(`rl:yb:rec:${ipKey(request)}`, 3600)) > 20 || (await hit(`rl:yb:rece:${crypto.createHash("sha256").update(email).digest("hex").slice(0, 16)}`, 3600)) > 3)
      return json({ success: false, error: "Too many attempts. Try again in an hour." }, 429);
    await yw.requestEmailRecovery(email, site());
    return json({ success: true, message: "If that email is confirmed for a Ye₿ente wallet, a recovery link is on its way." });
  }
  if (action === "recover-email/finish") {
    if ((await hit(`rl:yb:recf:${ipKey(request)}`, 3600)) > 30) return json({ success: false, error: "Too many attempts. Try again in an hour." }, 429);
    return json({ success: true, ...(await yw.finishEmailRecovery({ token: String(body.token || ""), pin: body.pin })) });
  }
  if (action === "buy") {
    const w = await me(request);
    if (!buyOn()) return off(NOT_CONFIGURED);
    const quote = await yw.quoteBuy(w, body.kes);
    const r = await stkPush(request, { phone: body.phone, amount: quote.kes, accountReference: "YEBENTE", transactionDesc: "Buy Sats" });
    const d = await r.json();
    if (!d.success) return json(d, r.status);
    await yw.startBuy(w, quote, d.checkoutRequestId);
    return json({ ...d, satsAmount: quote.sats, kes: quote.kes, rate: quote.rate });
  }
  if (action === "invoice") {
    const w = await me(request);
    if ((await hit(`rl:yb:inv:${w.id}`, 3600)) > 60) return json({ success: false, error: "Too many invoices. Try again later." }, 429);
    return json({ success: true, ...(await yw.invoiceFor(w, body.sats)) });
  }
  if (action === "send") {
    const w = await me(request);
    if ((await hit(`rl:yb:send:${w.id}`, 3600)) > 60) return json({ success: false, error: "Too many payments. Try again later." }, 429);
    // A handle (free, in the ledger), a Lightning address or an invoice (paid by the node).
    const pin = body.passkey ? await yw.passkeyPass(w, body.passkey) : body.pin;
    return json({ success: true, ...(await yw.payOut({ from: w, to: body.to, sats: body.sats, pin })) });
  }
  if (action.startsWith("passkey/")) {
    // Fingerprint / face approval: turned on with the PIN, per phone.
    const w = await me(request);
    if ((await hit(`rl:yb:pk:${w.id}`, 3600)) > 120) return json({ success: false, error: "Too many attempts. Try again later." }, 429);
    if (action === "passkey/options") return json({ success: true, ...(await yw.passkeyOptions(w)) });
    if (action === "passkey/add") return json({ success: true, ...(await yw.addPasskey(w, body)) });
    if (action === "passkey/off") return json({ success: true, ...(await yw.removePasskeys(w, body.pin)) });
  }
  return json({ success: false, error: "Not found" }, 404);
}
async function walletGet(request, action) {
  const yw = await import("../lib/ywallet.js");
  const w = await me(request);
  if (action === "me") {
    // Credit anything paid while the app was closed before showing the balance.
    for (const h of await listIds("ywinvopen", 200)) { const inv = await getJSON(`ywinv:${h}`); if (inv?.walletId === w.id) await yw.settleInvoice(h).catch(() => {}); }
    return json({ success: true, wallet: yw.publicWallet((await yw.walletForToken(bearer(request))) || w) });
  }
  const buy = action.match(/^buy\/([\w-]{6,80})$/);
  if (buy) {
    const rec = await getJSON(`ywbuy:${buy[1]}`);
    if (!rec || rec.walletId !== w.id) return json({ success: false, error: "Not found" }, 404);
    // Each check asks Daraja: a few a minute per wallet is plenty.
    if (rec.state === "pending" && buyOn() && (await hit(`rl:yb:bq:${w.id}`, 600)) <= 60) {
      // Safaricom's callback may not have arrived: ask Daraja directly.
      const q = await (await stkQuery(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkoutRequestId: buy[1] }) }))).json();
      if (q.success && q.resultCode !== undefined) await yw.finishBuy(buy[1], { resultCode: q.resultCode, receipt: q.mpesaReceiptNumber });
    }
    const now = await getJSON(`ywbuy:${buy[1]}`);
    return json({ success: true, state: now.state, resultCode: now.state === "paid" ? 0 : now.state === "failed" ? 1 : 49, mpesaReceiptNumber: now.receipt || null, satsAmount: now.sats, inProgress: now.state === "pending" });
  }
  const inv = action.match(/^invoice\/([0-9a-f]{64})$/);
  if (inv) {
    const rec = await getJSON(`ywinv:${inv[1]}`);
    if (!rec || rec.walletId !== w.id) return json({ success: false, error: "Not found" }, 404);
    const state = await yw.settleInvoice(inv[1]);
    return json({ success: true, settled: state === "settled", paid: state === "settled", state, satsAmount: rec.sats });
  }
  if (action === "history") return json({ success: true, entries: await yw.history(w.id) });
  return json({ success: false, error: "Not found" }, 404);
}

const PAYOUTS = /^(lightning\/disburse|bitcoin\/disburse|mpesa\/(payout|b2b|reversal|ratiba|balance|transaction-status|kyc|c2b\/register|hakikisha\/b2b)|telebirr\/(deposit|payout|query\/[\w-]+))$/;
const sub = (request) => decodeURIComponent(new URL(request.url).pathname.replace(/^\/api\/yebente\//, ""));

export async function GET(request) {
  const path = sub(request);
  if (path === "health") return json({ status: "ok", service: "yebente", wallets: switchOn("YEBENTE_WALLETS"), environment: env("MPESA_ENVIRONMENT") === "production" ? "production" : "sandbox", configured: darajaReady(), buy: buyOn(), deposits: false, node: await nodeUp(), proxy: proxyShape(request), timestamp: Date.now() });
  if (path.startsWith("lightning/invoice-status/")) return off("Create a Ye₿ente wallet first.");
  if (path === "wallet/email-confirm") {
    const { confirmEmail } = await import("../lib/ywallet.js");
    const ok = await confirmEmail(String(new URL(request.url).searchParams.get("t") || ""));
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ye₿ente</title><body style="font:17px/1.6 system-ui,sans-serif;background:#141117;color:#F3ECF2;margin:0;display:grid;place-items:center;min-height:100vh"><main style="background:#221E27;border:1px solid #3F3846;border-radius:24px;padding:2rem;max-width:26rem;margin:1rem"><h1 style="margin:0 0 .5rem;font-size:1.4rem">${ok ? "Email confirmed" : "Link not recognised"}</h1><p style="margin:0 0 1rem;color:#CBC2CF">${ok ? "You can now recover your wallet with this email." : "This link has expired or was already used. Add the email again in Settings."}</p><a href="/yebente" style="color:#DDB8FF">Open Ye₿ente</a></main>`,
      { status: ok ? 200 : 410, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const lp = path.match(/^lnurlp\/([a-z0-9._-]{3,20})$/) || path.match(/^lnurl\/([a-z0-9._-]{3,20})$/);
  if (lp) return lnurlPay(request, lp[1], path.startsWith("lnurl/"));
  const wg = path.match(/^wallet\/(me|history|invoice\/[0-9a-f]{64}|buy\/[\w-]{6,80})$/);
  if (wg) { try { return await walletGet(request, wg[1]); } catch (e) { return json({ success: false, error: e.message }, e.status || 500); } }
  if (PAYOUTS.test(path)) return off(NO_NODE);
  return json({ success: false, error: "Not found" }, 404);
}

export async function POST(request) {
  const path = sub(request);
  try {
    if (path === "mpesa/stkpush") return off("Create a Ye₿ente wallet first.");
    if (path === "mpesa/query") return off("Check a purchase from your wallet.");
    if (path === "mpesa/hakikisha/c2b") return await hakikisha(request);
    if (path === "lightning/create-invoice") return off("Create a Ye₿ente wallet first.");
    const wp = path.match(/^wallet\/(create|restore|send|invoice|buy|email|recover-email|recover-email\/finish|passkey\/(?:options|add|off))$/);
    if (wp) return await walletPost(request, wp[1]);
    const cb = path.match(/^mpesa\/callback\/([\w-]{16,128})$/);
    if (cb) return await callback(request, cb[1]);
    if (path.startsWith("lightning/") || path.startsWith("bitcoin/")) return off(NO_NODE);
    if (PAYOUTS.test(path)) return off(NOT_CONFIGURED);
    return json({ success: false, error: "Not found" }, 404);
  } catch (err) {
    if (err.status) return json({ success: false, error: err.message }, err.status);
    console.error("yebente", path, err.message);
    return json({ success: false, error: "Internal server error." }, 500);
  }
}
