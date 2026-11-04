// Card and bank deposits through Pesapal (API 3.0). The buyer pays on Pesapal's
// own page, so card and bank details never touch this server. Every credit comes
// only from a server-to-server status answer of Completed for the exact order,
// for the exact shillings quoted: anything else stays pending or fails closed.
//
// Switched on with YEBENTE_CARD_BUY=on plus PESAPAL_CONSUMER_KEY,
// PESAPAL_CONSUMER_SECRET and PESAPAL_IPN_ID (register the IPN address at
// SITE_URL + /api/yebente/card/ipn/PESAPAL_CALLBACK_SECRET in Pesapal first).
// PESAPAL_ENVIRONMENT=sandbox talks to the test provider, production to the live one.
import { EMAIL_RE } from "./http.js";
import crypto from "node:crypto";

const env = (k) => String(process.env[k] || "").trim();
const BASE = () => (env("PESAPAL_ENVIRONMENT") === "production" ? "https://pay.pesapal.com/v3" : "https://cybqa.pesapal.com/pesapalv3");
const switchOn = (k) => ["on", "true", "yes", "1"].includes(env(k).replace(/^["']|["']$/g, "").toLowerCase());
export const pesapalOn = () => switchOn("YEBENTE_CARD_BUY") && Boolean(env("PESAPAL_CONSUMER_KEY") && env("PESAPAL_CONSUMER_SECRET") && env("PESAPAL_IPN_ID") && env("PESAPAL_CALLBACK_SECRET"));

// Tests script the provider by replacing global fetch for its three addresses.
const silent = async (r) => {
  if (!r.ok) throw new Error("The card provider didn't answer. Try again in a minute.");
  return r.json();
};

// The provider's sign-in (about 5 minutes): asked once and reused while fresh.
let token = null, tokenUntil = 0;
export async function pesapalToken() {
  if (token && Date.now() < tokenUntil) return token;
  const d = await silent(await fetch(`${BASE()}/api/Auth/RequestToken`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: env("PESAPAL_CONSUMER_KEY"), consumer_secret: env("PESAPAL_CONSUMER_SECRET") }),
    signal: AbortSignal.timeout(20000),
  }));
  if (!d?.token) throw new Error("The card provider didn't answer. Try again in a minute.");
  token = d.token;
  const exp = Date.parse(d.expiryDate || "");
  tokenUntil = Date.now() + (Number.isFinite(exp) ? Math.max(exp - Date.now() - 30e3, 30e3) : 240e3);
  return token;
}

// Starts a card or bank payment: the merchant reference is ours and random, the
// amount is the quoted shillings (never the buyer's words), and the buyer comes
// back to our return page either way. Answers with the provider's checkout page.
export async function submitOrder({ kes, email, handle, site }) {
  const e = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 200) throw Object.assign(new Error("Please check the email address for the card receipt."), { status: 400 });
  const ref = `YB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const base = (site || env("SITE_URL") || "https://altradits.com").replace(/\/$/, "");
  const d = await silent(await fetch(`${BASE()}/api/Transactions/SubmitOrderRequest`, {
    method: "POST", headers: { Authorization: `Bearer ${await pesapalToken()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id: ref, currency: "KES", amount: kes, description: "Ye₿ente wallet top-up",
      callback_url: `${base}/api/yebente/wallet/card/return`, cancellation_url: `${base}/api/yebente/wallet/card/return`,
      notification_id: env("PESAPAL_IPN_ID"),
      billing_address: { email_address: e, first_name: "Ye₿ente", last_name: String(handle || "Wallet").slice(0, 50) } }),
    signal: AbortSignal.timeout(20000),
  }));
  if (!d?.redirect_url || !d?.order_tracking_id) throw new Error("The card provider didn't start the payment. Try again in a minute.");
  return { redirectUrl: d.redirect_url, trackingId: d.order_tracking_id, merchantRef: d.merchant_reference || ref };
}

// What the provider says about an order: paid only on its explicit Completed,
// failed only on Failed. Anything else, and silence, stays pending: an unclear
// answer never credits and never closes, so it can be asked again.
export async function orderStatus(trackingId) {
  const d = await silent(await fetch(`${BASE()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`, {
    headers: { Authorization: `Bearer ${await pesapalToken()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  }));
  const desc = String(d?.payment_status_description || "");
  const kes = Number(d?.amount);
  if (desc === "Completed") return { state: "paid", kes: Number.isFinite(kes) ? kes : null };
  if (desc === "Failed") return { state: "failed", kes: null };
  return { state: "pending", kes: null };
}
