// M-Pesa B2C (business to customer) through Safaricom's Daraja API: Ye₿ente
// pays a phone from its own shortcode, so Send Mobile keeps working when a
// payout partner is down (issue #510). Request and callback shapes follow
// Safaricom's B2C and Transaction Status documentation.
//
// Settings (names only; values live in the hosting panel):
//   YEBENTE_B2C=on                 the switch
//   MPESA_ENVIRONMENT              production | sandbox (shared with Buy)
//   MPESA_B2C_CONSUMER_KEY/SECRET  a Daraja app of its own: Safaricom doesn't let one app do C2B and B2C
//   MPESA_B2C_SHORTCODE            the shortcode that disburses (Bulk Disbursement or "one account")
//   MPESA_B2C_INITIATOR            the API operator's username
//   MPESA_B2C_INITIATOR_PASSWORD   that operator's password (encrypted below, never sent plain)
//   MPESA_B2C_CERT                 Safaricom's public certificate: PEM text, base64 of it, or a file path
//   YEBENTE_B2C_CALLBACK_SECRET    the secret path segment Safaricom calls back on
import crypto from "node:crypto";
import fs from "node:fs";

const env = (k) => String(process.env[k] || "").trim().replace(/^["']|["']$/g, "");
const on = (k) => ["on", "true", "yes", "1"].includes(env(k).toLowerCase());
const BASE = () => (env("MPESA_ENVIRONMENT") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const SITE = () => (env("SITE_URL") || "https://altradits.com").replace(/\/$/, "");

const NEEDED = ["MPESA_B2C_CONSUMER_KEY", "MPESA_B2C_CONSUMER_SECRET", "MPESA_B2C_SHORTCODE", "MPESA_B2C_INITIATOR", "MPESA_B2C_INITIATOR_PASSWORD", "MPESA_B2C_CERT", "YEBENTE_B2C_CALLBACK_SECRET"];
export const b2cConfigured = () => NEEDED.every((k) => env(k)) && env("YEBENTE_B2C_CALLBACK_SECRET").length >= 16;
// Sandbox credentials pay nobody: shown only while testing features on purpose.
export const b2cOn = () => on("YEBENTE_B2C") && b2cConfigured() && (env("MPESA_ENVIRONMENT") === "production" || on("YEBENTE_SHOW_TEST_FEATURES"));
export const callbackSecret = () => env("YEBENTE_B2C_CALLBACK_SECRET");

function certPem() {
  const v = env("MPESA_B2C_CERT");
  if (v.includes("BEGIN CERTIFICATE")) return v.replace(/\\n/g, "\n");
  if (/^[A-Za-z0-9+/=\s]+$/.test(v) && v.length > 200) {
    const pem = Buffer.from(v, "base64").toString("utf8");
    if (pem.includes("BEGIN")) return pem;
  }
  return fs.readFileSync(v, "utf8");
}

// The operator's password, RSA-encrypted (PKCS#1 v1.5) with Safaricom's certificate.
export const securityCredential = () =>
  crypto.publicEncrypt({ key: certPem(), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(env("MPESA_B2C_INITIATOR_PASSWORD"))).toString("base64");

let token = null, tokenUntil = 0;
async function auth() {
  if (token && Date.now() < tokenUntil) return token;
  const basic = Buffer.from(`${env("MPESA_B2C_CONSUMER_KEY")}:${env("MPESA_B2C_CONSUMER_SECRET")}`).toString("base64");
  const r = await fetch(`${BASE()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`M-Pesa sign-in failed (${r.status})`);
  const d = await r.json();
  token = d.access_token;
  tokenUntil = Date.now() + Math.max(((parseInt(d.expires_in, 10) || 3599) - 60) * 1000, 60e3);
  return token;
}
export const resetToken = () => { token = null; tokenUntil = 0; }; // tests

async function post(path, body) {
  const r = await fetch(`${BASE()}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${await auth()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || String(j.ResponseCode) !== "0") throw Object.assign(new Error(j.errorMessage || j.ResponseDescription || `M-Pesa answered ${r.status}`), { status: r.status });
  return j;
}

const hook = (kind) => `${SITE()}/api/yebente/b2c/${kind}/${callbackSecret()}`;

// originatorId is unique per payout and reused on any retry: Safaricom uses it
// to avoid paying one request twice. We never retry a payout anyway: an unclear
// answer is settled by asking for its status.
export const payPhone = ({ originatorId, phone, kes }) =>
  post("/mpesa/b2c/v3/paymentrequest", {
    OriginatorConversationID: originatorId,
    InitiatorName: env("MPESA_B2C_INITIATOR"),
    SecurityCredential: securityCredential(),
    CommandID: "BusinessPayment",
    Amount: String(kes),
    PartyA: env("MPESA_B2C_SHORTCODE"),
    PartyB: phone,
    Remarks: "Yebente Send Mobile",
    QueueTimeOutURL: hook("timeout"),
    ResultURL: hook("result"),
    Occassion: "Yebente", // sic: Safaricom's spelling
  });

export const askStatus = ({ originatorId }) =>
  post("/mpesa/transactionstatus/v1/query", {
    Initiator: env("MPESA_B2C_INITIATOR"),
    SecurityCredential: securityCredential(),
    CommandID: "TransactionStatusQuery",
    OriginalConversationID: originatorId,
    PartyA: env("MPESA_B2C_SHORTCODE"),
    IdentifierType: "4",
    ResultURL: hook("status"),
    QueueTimeOutURL: hook("timeout"),
    Remarks: "Yebente status",
    Occasion: "Yebente",
  });

// Both callback shapes, flattened. final: the payout's fate is known (paid or
// not paid); a status answer that says "still processing" is not final.
export function parseResult(body) {
  const r = body?.Result || {};
  const list = r.ResultParameters?.ResultParameter;
  const params = Object.fromEntries((Array.isArray(list) ? list : list ? [list] : []).map((p) => [p.Key, p.Value]));
  const code = Number(r.ResultCode);
  if ("TransactionStatus" in params) {
    // A status answer: the top-level OriginatorConversationID is the query's
    // own; the payout it describes is named inside ResultParameters.
    const st = String(params.TransactionStatus);
    return { originatorId: String(params.OriginatorConversationID || ""), ok: code === 0 && st === "Completed",
      final: code === 0 && ["Completed", "Failed", "Cancelled", "Expired"].includes(st), code, desc: `${r.ResultDesc || ""} (${st})`,
      receipt: params.ReceiptNo ? String(params.ReceiptNo) : null, kes: Number(params.Amount) || null };
  }
  return { originatorId: String(r.OriginatorConversationID || ""), ok: code === 0, final: Number.isFinite(code), code, desc: String(r.ResultDesc || ""),
    receipt: params.TransactionReceipt ? String(params.TransactionReceipt) : (code === 0 ? String(r.TransactionID || "") || null : null),
    kes: Number(params.TransactionAmount) || null,
    utilityKes: params.B2CUtilityAccountAvailableFunds !== undefined ? Number(params.B2CUtilityAccountAvailableFunds) : null };
}

// What the person sees when M-Pesa refuses. Only codes Safaricom documents
// for B2C get their own words; anything else stays honest and generic,
// because a guessed reason would blame the wrong side.
export function refusalText(code) {
  return ({
    1: "M-Pesa payouts are out of float right now. Your sats are back; try later or use another option.",
    2001: "Ye₿ente's M-Pesa link refused this payout. Your sats are back; try later or use another option.",
  })[code] || "M-Pesa didn't complete this payment. Your sats are back.";
}
