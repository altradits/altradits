// Buying sats with M-Pesa or Airtel Money through Bitika (bitika.xyz), the
// Kenyan partner that charges the buyer's phone and pays sats over Lightning.
// Used until Safaricom Daraja production access lands. Altradits never touches
// shillings and never sells its own sats.
//
// Switched on with YEBENTE_BITIKA_BUY=on plus BITIKA_API_KEY (bk_test_ for the
// sandbox, bk_live_ after Bitika approves). Every request carries a fresh UUID
// Idempotency-Key, kept with the buy record, so a retry never charges twice.
//
// Sats are credited ONLY by the Lightning payment actually arriving at the
// wallet through the existing receive path: Bitika pays the buyer's own
// handle@altradits.com Lightning address (the LNURL-pay path), the node says
// paid, and the invoice settles. A Bitika answer or webhook only updates the
// display status, never a balance.
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, removeFromList } from "./store.js";
import { publicFetch, localAllowed } from "./netsafe.js";

const env = (k) => String(process.env[k] || "").trim();
const switchOn = (k) => ["on", "true", "yes", "1"].includes(env(k).replace(/^["']|["']$/g, "").toLowerCase());
export const bitikaOn = () => switchOn("YEBENTE_BITIKA_BUY") && Boolean(env("BITIKA_API_KEY"));
export const bitikaSandbox = () => env("BITIKA_API_KEY").startsWith("bk_test_");
// A real provider: switched on with a live key. A test key only counts while testing.
export const bitikaLive = () => switchOn("YEBENTE_BITIKA_BUY") && env("BITIKA_API_KEY").startsWith("bk_live_");

// Bitika's per-payment range and flat fee (docs: https://bitika.xyz/developers/docs).
export const MIN_KES = 10;
export const MAX_KES = 10_000;
export const FEE_PCT = 3;
export const feeKes = (kes) => Math.round(Number(kes) * FEE_PCT) / 100;

const err = (message, status = 400) => Object.assign(new Error(message), { status });

// The one host ever called: https only (plain http only for the local fake in tests).
export function bitikaBase() {
  const raw = (env("BITIKA_BASE_URL") || "https://bitikaserver.up.railway.app").trim().replace(/\/+$/, "");
  let u;
  try { u = new URL(raw); } catch { throw err("Bitika isn't configured correctly.", 503); }
  if (u.username || u.password || !["https:", "http:"].includes(u.protocol)) throw err("Bitika isn't configured correctly.", 503);
  if (u.protocol !== "https:" && !localAllowed()) throw err("Bitika isn't configured correctly.", 503);
  return `${u.protocol}//${u.host}`;
}

// Every Bitika error in plain words. Definitive answers (the payment did not
// start) carry definitive: true; anything else may still be on its way, so a
// retry reuses the stored Idempotency-Key and can never charge twice.
export function bitikaError(status, data = {}) {
  const reason = String(data.reason || data.error || data.code || "");
  if (status === 400) return Object.assign(err("Bitika could not start this payment. Check the amount and number, then try again."), { definitive: true });
  if (status === 401 || status === 403) return Object.assign(err("Buying is paused for now. Please try again later.", 503), { definitive: true });
  if (status === 409) return err("The payment is still starting. Wait a moment, then check again.", 409);
  if (status === 422) return Object.assign(err("That payment was already started. Check its status instead of starting again.", 502), { definitive: true });
  if (status === 429) return err("Too many requests. Try again in a minute.", 429);
  if (status === 503 && /liquidity/i.test(reason)) return err("Bitika is out of sats for a moment. Try again shortly.", 503);
  if (status === 503) return err("Bitika didn't answer. Try again in a minute.", 503);
  return err("Bitika didn't answer clearly. Try again in a minute.", 502);
}

async function bitikaFetch(path, { method = "GET", body, idem } = {}) {
  if (!bitikaOn()) throw err("Buying with M-Pesa is paused right now.", 501);
  const url = `${bitikaBase()}${path}`; // a bad base is a setup error, not a Bitika outage
  const headers = { Authorization: `Bearer ${env("BITIKA_API_KEY")}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idem) headers["Idempotency-Key"] = idem;
  let res;
  try {
    res = await publicFetch(url, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), timeout: 12000, maxBytes: 100_000 });
  } catch {
    throw err("Bitika didn't answer. Try again in a minute.", 503);
  }
  let data = {};
  try { const text = await res.text(); data = text ? JSON.parse(text) : {}; }
  catch { throw err("Bitika didn't answer clearly. Try again in a minute.", 502); }
  if (!res.ok) throw bitikaError(res.status, data);
  return data;
}

// Starts a collection: Bitika charges the phone and pays the Lightning
// address. Answers with the transaction code, still processing.
export async function collect({ kes, phone, lightningAddress, idem }) {
  const payload = { amount: String(kes), phone: String(phone), lightningAddress: String(lightningAddress) };
  const send = () => bitikaFetch("/api/v1/xwift/collect", { method: "POST", body: payload, idem });
  let d;
  try { d = await send(); }
  catch (e) {
    // Still starting under our own key: one wait and one retry with the same
    // key, which Bitika answers from the first request (never a second charge).
    if (e.status !== 409) throw e;
    await new Promise((r) => setTimeout(r, 2500));
    d = await send();
  }
  const code = String(d?.transaction_code || "").trim();
  if (!/^[\w-]{3,80}$/.test(code)) throw err("Bitika didn't answer clearly. Try again in a minute.", 502);
  return { code, status: String(d?.status || "processing") };
}

// The current status of one transaction, by its code.
export async function txStatus(code) {
  const d = await bitikaFetch(`/api/v1/transactions/code/${encodeURIComponent(code)}`);
  return { status: String(d?.status || d?.data?.status || ""), sats: Number(d?.sats ?? d?.data?.sats) || null };
}

// Sats for a KES amount, best effort: the docs name the endpoint but not its
// parameters, so anything unexpected falls back to the wallet's own quote.
export async function quoteSats(kes) {
  try {
    const d = await bitikaFetch(`/api/v1/exchange/rate?amount=${encodeURIComponent(String(kes))}&currency=KES`);
    const flat = [d, d?.data, d?.quote].filter((x) => x && typeof x === "object");
    for (const o of flat) {
      for (const k of ["sats", "sats_amount", "amount_sats", "satoshis"]) {
        const n = Math.floor(Number(o[k]));
        if (Number.isSafeInteger(n) && n > 0 && n <= Number(kes) * 1e6) return n;
      }
    }
  } catch { /* the wallet's own quote stands in */ }
  return null;
}

// ---- webhook signatures (docs: X-Bitika-Signature: t=<ts>,v1=<hex hmac of "<ts>.<raw body>">)

// True only for a fresh (5 minutes), correctly signed delivery. Constant-time
// compare, against the raw body before any JSON parsing.
export function verifyWebhook(rawBody, header, secret, nowSec = Date.now() / 1000) {
  if (!secret) return false;
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/i.exec(String(header || "").trim());
  if (!m || Math.abs(nowSec - Number(m[1])) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${m[1]}.${rawBody}`).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(m[2], "hex"));
}

// A webhook event to a display status: the payload's status when it names one
// we know, else the event's own meaning. Unknown events change nothing.
const KNOWN = new Set(["processing", "processing_payment", "fulfilled", "failed", "payment_failed"]);
export function webhookStatus(body) {
  const s = String(body?.data?.status || "");
  if (KNOWN.has(s)) return s;
  if (body?.event === "transaction.updated") return "processing_payment";
  if (body?.event === "payment.completed") return "fulfilled";
  if (body?.event === "payment.failed") return "failed";
  return null;
}

// ---- buy records (display only; the balance moves only through invoices)
//
//   ywbit:<id>       { walletId, code?, kes, sats, feeKes, phoneHash, idem, at, state }
//   ywbitc:<code>    id (webhook and status lookups)
//   ywbitopen        ids still on their way (starting, processing, processing_payment)
//   ywbitw:<wallet>  that wallet's ids (daily-limit counting, newest first)

const now = () => new Date().toISOString();
const TERMINAL = new Set(["fulfilled", "failed", "payment_failed"]);
const OPEN = new Set(["starting", "processing", "processing_payment"]);
export const isOpenState = (s) => OPEN.has(s);
export const isTerminalState = (s) => TERMINAL.has(s);

export async function getRecord(id) { return getJSON(`ywbit:${id}`); }
export async function recordByCode(code) {
  const id = await getJSON(`ywbitc:${String(code || "").slice(0, 80)}`);
  return id ? getRecord(id) : null;
}

// A double tap must not charge twice: a matching open buy (same wallet, amount
// and number) is reused with its own Idempotency-Key: with a code, from the
// last 2 minutes; still starting, from the last 24 hours (a retry after a
// crash answers from the first request, never a second charge). Anything
// older, or already finished, starts a fresh buy with a fresh key.
export async function claimOrCreate({ walletId, kes, sats, feeKes: fee, phoneHash }) {
  const ids = await listIds(`ywbitw:${walletId}`, 200);
  for (const b of (await getMany("ywbit", ids)).filter(Boolean)) {
    const reuseFor = b.code ? 120e3 : 864e5;
    if (b.walletId === walletId && b.kes === kes && b.phoneHash === phoneHash && isOpenState(b.state) && Date.now() - Date.parse(b.at) < reuseFor) return b;
  }
  const id = crypto.randomBytes(12).toString("base64url");
  const rec = { id, walletId, code: null, kes, sats, feeKes: fee, phoneHash, idem: crypto.randomUUID(), at: now(), state: "starting" };
  await setJSON(`ywbit:${id}`, rec);
  await pushId("ywbitopen", id);
  await pushId(`ywbitw:${walletId}`, id);
  return rec;
}

export async function attachCode(id, code, status) {
  const b = await getRecord(id);
  if (!b || b.code) return b;
  b.code = code;
  await setJSON(`ywbit:${id}`, b);
  await setJSON(`ywbitc:${code}`, id);
  if (KNOWN.has(status) && status !== "starting") await setStatus(id, status); // usually processing; a fast terminal answer stands
  return getRecord(id);
}

// Display status only. Terminal states leave the open list; a state never moves
// backward (a stale poll can't undo a webhook), and nothing here ever touches
// a balance.
const RANK = { starting: 0, processing: 1, processing_payment: 2, fulfilled: 3, failed: 3, payment_failed: 3 };
export async function setStatus(id, state) {
  if (!KNOWN.has(state)) return null;
  const b = await getRecord(id);
  if (!b || isTerminalState(b.state)) return b?.state || null;
  if (RANK[state] < RANK[b.state]) return b.state;
  b.state = state;
  b.finishedAt = isTerminalState(state) ? now() : b.finishedAt;
  await setJSON(`ywbit:${id}`, b);
  if (isTerminalState(state)) await removeFromList("ywbitopen", [id]);
  return state;
}

// A remote status for a code: unknown codes and finished buys are ignored.
export async function applyRemoteStatus(code, state) {
  if (!KNOWN.has(state)) return null;
  const b = await recordByCode(code);
  if (!b) return null;
  return setStatus(b.id, state);
}

// Shillings this wallet moved through Bitika in the last 24 hours (declined
// payments moved nothing, so they don't count): part of the daily buy limit.
export async function recentBitikaKes(walletId) {
  const ids = await listIds(`ywbitw:${walletId}`, 200);
  return (await getMany("ywbit", ids)).filter((b) =>
    b && b.state !== "failed" && Date.now() - Date.parse(b.at) < 864e5).reduce((t, b) => t + (b.kes || 0), 0);
}

// Sats still on their way in through Bitika (for the node's payout check).
export async function openBitikaSats() {
  return (await getMany("ywbit", await listIds("ywbitopen", 500)))
    .filter((b) => b && isOpenState(b.state) && Date.now() - Date.parse(b.at) < 864e5).reduce((t, b) => t + (b.sats || 0), 0);
}

// Plain words for each display state.
export function stateMessage(state, code) {
  if (state === "processing") return "Check your phone for the M-Pesa prompt.";
  if (state === "processing_payment") return "Payment confirmed. Your sats are on their way.";
  if (state === "fulfilled") return "Paid. Waiting for your sats to arrive.";
  if (state === "failed") return "The M-Pesa payment was declined. No sats were sent.";
  if (state === "payment_failed") return `Bitika will refund or retry: contact them with code ${code}.`;
  return "The payment is still starting.";
}
