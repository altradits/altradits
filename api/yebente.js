// Ye₿ente (https://github.com/altradits/yebente), served at /yebente. Its API lives
// here at /api/yebente/<path> (server.mjs passes the path on).
//
// What runs depends on the environment, so nothing moves money until Stanley
// switches it on:
//   GET  health                      always
//   POST mpesa/hakikisha/c2b         with Daraja credentials (a read-only name lookup)
//   POST mpesa/stkpush, mpesa/query  with Daraja credentials and YEBENTE_MPESA_BUY=on
//   POST mpesa/callback/<secret>     Safaricom's STK result (secret: YEBENTE_CALLBACK_SECRET)
//   POST lightning/create-invoice    with YEBENTE_NODE_DEPOSITS=on (invoices on the Altradits node)
//   GET  lightning/invoice-status/x  same
// Every payout path (Lightning or on-chain disbursement, M-Pesa B2C/B2B,
// reversals, standing orders, Telebirr) answers 501: the app keeps its balance in
// the visitor's browser, so a server that paid on request could be emptied by
// anyone. The visitor pays from their own wallet (WebLN) instead.
import { json, readBody, clientIp } from "../lib/http.js";
import { getJSON, setJSON, hit } from "../lib/store.js";
import crypto from "node:crypto";

const env = (k) => String(process.env[k] || "").trim();
const DARAJA = () => (env("MPESA_ENVIRONMENT") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const darajaReady = () => Boolean(env("MPESA_CONSUMER_KEY") && env("MPESA_CONSUMER_SECRET"));
const buyOn = () => env("YEBENTE_MPESA_BUY") === "on" && darajaReady() && Boolean(env("MPESA_SHORTCODE") && env("MPESA_PASSKEY") && env("YEBENTE_CALLBACK_SECRET"));
const depositsOn = () => env("YEBENTE_NODE_DEPOSITS") === "on" && Boolean(env("LND_REST_URL") && env("LND_INVOICE_MACAROON"));
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

async function stkPush(request) {
  if (!buyOn()) return off(NOT_CONFIGURED);
  const { phone, amount, accountReference, transactionDesc } = await readBody(request);
  if (!phone || !amount || Number(amount) <= 0) return json({ success: false, error: "Valid phone and amount are required." }, 400);
  const formatted = formatKenyanPhone(phone);
  if (!/^254[71]\d{8}$/.test(formatted)) return json({ success: false, error: "Valid phone and amount are required." }, 400);
  // A payment prompt lands on someone's phone: at most 5 an hour from one connection.
  const ipKey = crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);
  if ((await hit(`rl:yb:stk:${ipKey}`, 3600)) > 5) return json({ success: false, error: "Failed to trigger STK Push." }, 429);
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
  }
  return json({ ResultCode: 0, ResultDesc: "Accepted" });
}

async function hakikisha(request) {
  if (!darajaReady()) return json({ success: false, verified: false, error: NOT_CONFIGURED }, 501);
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

async function createDepositInvoice(request) {
  if (!depositsOn()) return off("No Lightning node is configured.");
  const { satsAmount, memo } = await readBody(request);
  const sats = Math.round(Number(satsAmount));
  if (!(sats > 0) || sats > 1_000_000) return json({ success: false, error: "A positive satsAmount is required to generate a Lightning invoice." }, 400);
  const { createInvoice } = await import("../lib/lightning.js");
  const inv = await createInvoice({ sats, memo: String(memo || "Ye₿ente Sats Deposit").slice(0, 120), nodeOnly: true });
  await setJSON(`yb:inv:${inv.paymentHash}`, { sats, at: inv.createdAt });
  return json({ success: true, invoice: inv.bolt11, paymentHash: inv.paymentHash, satsAmount: sats });
}

async function invoiceStatus(hash) {
  if (!depositsOn()) return off("Lightning node not configured for status check.");
  const h = String(hash || "").toLowerCase();
  const known = /^[0-9a-f]{64}$/.test(h) && (await getJSON(`yb:inv:${h}`));
  if (!known) return json({ success: false, error: "Failed to query invoice status from LND." }, 404); // only invoices made here
  const { invoicePaid } = await import("../lib/lightning.js");
  const paid = await invoicePaid({ provider: "lnd", paymentHash: h });
  return json({ success: true, settled: paid === true, paid: paid === true, satsAmount: known.sats });
}

const PAYOUTS = /^(lightning\/disburse|bitcoin\/disburse|mpesa\/(payout|b2b|reversal|ratiba|balance|transaction-status|kyc|c2b\/register|hakikisha\/b2b)|telebirr\/(deposit|payout|query\/[\w-]+))$/;
const sub = (request) => decodeURIComponent(new URL(request.url).pathname.replace(/^\/api\/yebente\//, ""));

export async function GET(request) {
  const path = sub(request);
  if (path === "health") return json({ status: "ok", service: "yebente", environment: env("MPESA_ENVIRONMENT") === "production" ? "production" : "sandbox", configured: darajaReady(), buy: buyOn(), deposits: depositsOn(), timestamp: Date.now() });
  const inv = path.match(/^lightning\/invoice-status\/([\w-]+)$/);
  if (inv) return invoiceStatus(inv[1]);
  if (PAYOUTS.test(path)) return off(NO_NODE);
  return json({ success: false, error: "Not found" }, 404);
}

export async function POST(request) {
  const path = sub(request);
  try {
    if (path === "mpesa/stkpush") return await stkPush(request);
    if (path === "mpesa/query") return await stkQuery(request);
    if (path === "mpesa/hakikisha/c2b") return await hakikisha(request);
    if (path === "lightning/create-invoice") return await createDepositInvoice(request);
    const cb = path.match(/^mpesa\/callback\/([\w-]{16,128})$/);
    if (cb) return await callback(request, cb[1]);
    if (path.startsWith("lightning/") || path.startsWith("bitcoin/")) return off(NO_NODE);
    if (PAYOUTS.test(path)) return off(NOT_CONFIGURED);
    return json({ success: false, error: "Not found" }, 404);
  } catch (err) {
    console.error("yebente", path, err.message);
    return json({ success: false, error: err.message || "Internal server error." }, 500);
  }
}
