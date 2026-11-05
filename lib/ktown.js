// kTown: QR payments in sats that land in the merchant's M-Pesa.
//
// A merchant signs up with an M-Pesa number, prints one QR, and sticks it on
// the counter. A customer with any Lightning wallet scans it and pays in sats.
// kTown never holds money and is not a wallet: it is a thin LNURL-pay front
// for the merchant's Tando address (2547XXXXXXXX@bitcoin.co.ke). The sats go
// straight to Tando, Tando pays KES to the M-Pesa number for a 1% fee.
//
//   kt:<id>           merchant { id, phone, shop, mpesaName, verified, claimed, paidCount,
//                                currency, lang, pin: {salt, hash}, failedPins, lockedUntil, createdAt }
//   kt:phone:<254..>  merchant id
//   kt:tx:<id>        list of entry ids (newest first); kte:<entryId> entry
//   kt:pay:<hash>     entry id (one record per payment hash)
//   kts:<sha256>      session { merchantId, exp }
//
// A history entry carries only the merchant's own payment facts: the amount,
// the shillings expected and received, the payment hash, the M-Pesa code and
// the time. Nothing about who paid is ever stored, because it is never asked
// for and never read.
//
// Switched on with KTOWN=on (off: registration, settings and LNURL all refuse).
//
// Tando's API (checked live with read-only GET, Nov 2026; documented at
// https://bitcoin.co.ke/send-money-to-kenya/docs/developer-api.html):
//   GET /.well-known/lnurlp/<254..> answers payRequest with LUD-21 currency
//   {code KES, minSendable 15, maxSendable 50000, multiplier in msat per KES}.
//   GET <callback>?amount=<KES>&currency=KES returns an invoice that delivers
//   exactly that many shillings (the payer covers the 1% on top); without the
//   currency parameter the amount is millisats and the invoice matches it exactly.
//   GET /api/payment/<hash> answers {success, transaction: {status, isPaid,
//   paymentNetworkReceipt, payToAccount, merchantName, ...}}; a payment counts
//   as settled only when status is completed, isPaid is true and
//   paymentNetworkReceipt (the M-Pesa code) is present. merchantName is the
//   M-Pesa registered name of the recipient.
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock, deleteKeys } from "./store.js";
import { publicFetch } from "./netsafe.js";
import { oneLine } from "./http.js";
import { switchOn } from "./ywallet.js";
import { encodeLnurl } from "./lnurl.js";
import { bolt11Msats, bolt11PaymentHash } from "./lightning.js";

export const ktownOn = () => switchOn("KTOWN");
const TANDO = "bitcoin.co.ke";
export const TANDO_FEE_PCT = 1;
const UNREACHABLE = "Tando isn't reachable right now. Try again in a minute.";
const NOT_MPESA = "That number isn't set up for M-Pesa delivery.";

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString("base64url");
export const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const HASH_RE = /^[0-9a-f]{64}$/i;
export const CURRENCIES = ["KES", "USD", "EUR", "UGX", "TZS"];
export const LANGS = ["en", "sw"];

let tandoFetch = (u, o) => publicFetch(u, o);
export const setKtownFetcher = (f) => { tandoFetch = f || ((u, o) => publicFetch(u, o)); }; // tests

// ---- phone numbers: 07.., +254 7.., 2547.. all become 254 plus 9 digits.
// Only Safaricom ranges resolve at Tando (7xx, 11x, 14x), like lib/rails.js.
export function normalizePhone(input) {
  const bad = "Enter an M-Pesa number, like 0712 345 678.";
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("254")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.length !== 9 || !(d.startsWith("7") || d.startsWith("11") || d.startsWith("14"))) throw err(bad);
  return `254${d}`;
}

const cleanName = (v, what) => {
  const name = oneLine(v, 60);
  if (!name) throw err(`${what} is needed.`);
  return name;
};

// A new PIN: 6 digits, and not one anyone would try first.
const EASY_PINS = new Set(["112233", "159753", "147258", "102030", "123321", "098765", "135790", "246810", "142536", "010203"]);
function choosePin(pin) {
  pin = String(pin || "");
  if (!/^\d{6}$/.test(pin)) throw err("Choose a 6-digit PIN.");
  const d = [...pin].map(Number), steps = d.slice(1).map((x, i) => x - d[i]);
  if (new Set(d).size <= 2 || steps.every((x) => x === 1) || steps.every((x) => x === -1) || /^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin) || EASY_PINS.has(pin))
    throw err("That PIN is easy to guess. Choose 6 digits that aren't a pattern.");
  return pin;
}
function pinHash(pin, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex") };
}
const pinOk = (m, pin) => {
  if (!/^\d{6}$/.test(String(pin || "")) || !m.pin?.salt) return false;
  const { hash } = pinHash(pin, m.pin.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(m.pin.hash, "hex"));
};

// ---- sessions: one token per shop phone, good for a year. The session is the
// merchant's identity: whoever holds it may change that merchant's settings.
const SESSION_MS = 365 * 864e5;
async function issueSession(merchantId) {
  const token = crypto.randomBytes(24).toString("base64url");
  await setJSON(`kts:${sha(token)}`, { merchantId, exp: Date.now() + SESSION_MS });
  return token;
}
export async function merchantForToken(token) {
  if (!token || token.length < 20) return null;
  const ses = await getJSON(`kts:${sha(token)}`);
  if (!ses || ses.exp < Date.now()) return null;
  const m = await getJSON(`kt:${ses.merchantId}`);
  if (!m) await deleteKeys([`kts:${sha(token)}`]); // its merchant is gone (taken over): the session ends
  return m;
}
// Ends one session (the app signs out): the token stops working at once.
export async function lockSession(token) {
  if (token && token.length >= 20) await deleteKeys([`kts:${sha(token)}`]);
}

// What the merchant's app may see: no phone number, no hashes, no counters.
export function publicMerchant(m, site) {
  const host = String(site || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return {
    id: m.id, shop: m.shop, mpesaName: m.mpesaName, verified: Boolean(m.verified), claimed: Boolean(m.claimed),
    currency: m.currency, lang: m.lang,
    payUrl: `${site}/k/${m.id}`,
    lnurl: encodeLnurl(`${site}/.well-known/lnurlp/k-${m.id}`),
    address: `k-${m.id}@${host}`,
  };
}

// ---- registration and login
export async function registerMerchant({ phone, shop, mpesaName, pin }) {
  if (!ktownOn()) throw err("kTown isn't open yet.", 501);
  const full = normalizePhone(phone);
  const cleanShop = cleanName(shop, "The shop name");
  const cleanMpesa = cleanName(mpesaName, "The M-Pesa name");
  choosePin(pin);
  // One sign-up per number at a time: two taps racing each other must not
  // both pass the check below and leave an orphaned merchant behind. The
  // loser waits for the winner, then hears the number is taken.
  let release = null;
  for (let i = 0; i < 40 && !release; i++) {
    release = await acquireLock(`kt:reg:${full}`, 60);
    if (!release) await new Promise((r) => setTimeout(r, 50));
  }
  if (!release) throw err("Many people are joining right now. Try again in a minute.", 503);
  try {
    const taken = await getJSON(`kt:phone:${full}`);
    if (taken) {
      const old = await getJSON(`kt:${taken}`);
      if (old && !takeoverEligible(old)) throw err("That number is already registered. Log in on the shop phone.", 409);
      // Takeover: a stale squat with no paid receipt gives way. The old record
      // goes (its sessions and QR end with it); its payment entries stay, kept.
      if (old) await deleteKeys([`kt:${old.id}`]);
    }
    // Activation proves the number works: its Tando address must answer with KES terms.
    await tandoQuote(full, { fresh: true });
    const id = newId();
    const m = { id, phone: full, shop: cleanShop, mpesaName: cleanMpesa, verified: false, claimed: false, paidCount: 0,
      currency: "KES", lang: "en", pin: pinHash(pin), failedPins: 0, lockedUntil: null, createdAt: now() };
    await setJSON(`kt:${id}`, m);
    await setJSON(`kt:phone:${full}`, id);
    await pushId("ktowns", id);
    return { merchant: m, session: await issueSession(id) };
  } finally {
    await release();
  }
}

// A registration may be taken over by a new sign-up for the same number when
// it never proved itself (unclaimed), is older than 48 hours, and has no paid
// receipt: a squat, or an abandoned try. Anything liveness shows (a claim, or
// money that landed) holds the number. Why this shape: docs/ktown.md.
const TAKEOVER_MS = 48 * 3600e3;
function takeoverEligible(m) {
  if (!m || m.claimed) return false;
  if (!(Date.now() - Date.parse(m.createdAt || 0) > TAKEOVER_MS)) return false;
  return (m.paidCount || 0) === 0;
}

const waitText = (until) => {
  const min = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60e3));
  return `${min} minutes`;
};
export async function loginMerchant({ phone, pin }) {
  if (!ktownOn()) throw err("kTown isn't open yet.", 501);
  const full = normalizePhone(phone);
  const id = await getJSON(`kt:phone:${full}`);
  const m = id && (await getJSON(`kt:${id}`));
  // Unknown numbers answer like a wrong PIN, after the same work, so the reply
  // does not say which numbers are registered.
  if (!m) { pinHash("000000", "0".repeat(32)); throw err("Wrong number or PIN.", 403); }
  if (m.lockedUntil && Date.parse(m.lockedUntil) > Date.now())
    throw err(`Too many wrong PINs. Try again in ${waitText(m.lockedUntil)}.`, 429);
  if (!pinOk(m, pin)) {
    m.failedPins = (m.failedPins || 0) + 1;
    if (m.failedPins >= 5) {
      m.lockedUntil = new Date(Date.now() + 15 * 60e3).toISOString();
      m.failedPins = 0;
      import("./attacks.js").then((a) => a.recordAttack("pin_guessing", { where: "kTown login", detail: "locked for 15 minutes" })).catch(() => {});
    }
    await setJSON(`kt:${m.id}`, m);
    const locked = m.lockedUntil && Date.parse(m.lockedUntil) > Date.now();
    throw err(locked ? "Wrong PIN. Try again in 15 minutes." : "Wrong number or PIN.", locked ? 429 : 403);
  }
  m.failedPins = 0; m.lockedUntil = null;
  await setJSON(`kt:${m.id}`, m);
  return { merchant: m, session: await issueSession(m.id) };
}

export async function updateSettings(m, patch) {
  if (!ktownOn()) throw err("kTown isn't open yet.", 501);
  const cur = await getJSON(`kt:${m.id}`);
  if (!cur) throw err("Sign in again.", 401);
  if (patch.shop !== undefined) cur.shop = cleanName(patch.shop, "The shop name");
  if (patch.mpesaName !== undefined) {
    const next = cleanName(patch.mpesaName, "The M-Pesa name");
    if (next !== cur.mpesaName) { cur.mpesaName = next; cur.verified = false; } // a new name is checked by the next receipt
  }
  if (patch.currency !== undefined) {
    const c = String(patch.currency || "").toUpperCase();
    if (!CURRENCIES.includes(c)) throw err("That currency isn't offered.");
    cur.currency = c;
  }
  if (patch.lang !== undefined) {
    const l = String(patch.lang || "").toLowerCase();
    if (!LANGS.includes(l)) throw err("That language isn't offered.");
    cur.lang = l;
  }
  await setJSON(`kt:${cur.id}`, cur);
  return cur;
}

// A signed-in shop phone sets a new PIN without the old one: holding the
// session is the ownership proof. A lost phone with a forgotten PIN needs
// Stanley (docs/ktown.md); kTown holds no money, so nothing is at risk meanwhile.
export async function changePin(m, pin) {
  if (!ktownOn()) throw err("kTown isn't open yet.", 501);
  const cur = await getJSON(`kt:${m.id}`);
  if (!cur) throw err("Sign in again.", 401);
  cur.pin = pinHash(choosePin(pin));
  cur.failedPins = 0; cur.lockedUntil = null;
  await setJSON(`kt:${cur.id}`, cur);
  return cur;
}

// ---- Tando: limits and rate (cached a minute), invoices, receipts.
// Every call goes through the public-address guard: https only, no redirects,
// public IPs only, 64 kB at most, JSON only.
async function tandoJson(url) {
  const r = await tandoFetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, maxBytes: 65536 })
    .catch(() => { throw err(UNREACHABLE, 502); });
  if (r.status >= 300 && r.status < 400) throw err(UNREACHABLE, 502);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw err(UNREACHABLE, 502);
  const d = await r.json().catch(() => null);
  if (!d || typeof d !== "object" || Array.isArray(d)) throw err(UNREACHABLE, 502);
  return { status: r.status, ok: r.ok, body: d };
}

const quoteCache = new Map(); // phone -> { at, quote }
const QUOTE_TTL = 60e3;
export function clearQuoteCache() { quoteCache.clear(); } // tests
export async function tandoQuote(phone, { fresh = false } = {}) {
  const hit = quoteCache.get(phone);
  if (!fresh && hit && Date.now() - hit.at < QUOTE_TTL) return hit.quote;
  const { ok, body: pay } = await tandoJson(`https://${TANDO}/.well-known/lnurlp/${phone}`);
  if (!ok || pay.status === "ERROR") throw err(String(pay.reason || NOT_MPESA).slice(0, 200), 502);
  if (pay.tag !== "payRequest" || typeof pay.callback !== "string" || !pay.callback) throw err(UNREACHABLE, 502);
  let cb;
  try { cb = new URL(pay.callback); } catch { cb = null; }
  // The callback must stay on Tando: a reply pointing elsewhere is not followed.
  if (!cb || cb.protocol !== "https:" || cb.username || cb.password || cb.hostname.toLowerCase() !== TANDO) throw err(UNREACHABLE, 502);
  const c = pay.currency;
  const bad = () => { throw err(NOT_MPESA, 502); };
  if (!c || c.code !== "KES") bad(); // a claimed number points at a BTC wallet, not M-Pesa
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  const quote = { callback: cb.href, minMsat: num(pay.minSendable), maxMsat: num(pay.maxSendable),
    kesMin: num(c.minSendable), kesMax: num(c.maxSendable), multiplier: num(c.multiplier) };
  if (![quote.minMsat, quote.maxMsat, quote.kesMin, quote.kesMax, quote.multiplier].every((n) => Number.isFinite(n) && n >= 0)
    || !(quote.multiplier > 0) || !(quote.maxMsat >= quote.minMsat) || !(quote.kesMax >= quote.kesMin)) bad();
  if (quoteCache.size > 500) quoteCache.clear();
  quoteCache.set(phone, { at: Date.now(), quote });
  return quote;
}

// Our LNURL-pay answer: the merchant's names, Tando's limits and rate.
// `verified` is an extra field wallets ignore; the pay page reads it to show
// whether the M-Pesa name is confirmed.
export function payRequestJson(site, merchant, quote) {
  const domain = String(site || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return {
    tag: "payRequest",
    callback: `${site}/api/ktown/lnurlp/${merchant.id}/cb`,
    minSendable: Math.floor(quote.minMsat),
    maxSendable: Math.floor(quote.maxMsat),
    metadata: JSON.stringify([["text/plain", `${merchant.mpesaName}\n${merchant.shop}`], ["text/identifier", `k-${merchant.id}@${domain}`]]),
    commentAllowed: 0,
    currency: { code: "KES", minSendable: Math.floor(quote.kesMin), maxSendable: Math.floor(quote.kesMax), multiplier: quote.multiplier },
    verified: Boolean(merchant.verified),
  };
}

const substitution = (detail) => {
  import("./attacks.js").then((a) => a.recordAttack("invoice_substitution", { where: TANDO, detail: String(detail).slice(0, 200) })).catch(() => {});
};

const urlHash = (u) => {
  const last = String(u || "").split("/").pop() || "";
  return HASH_RE.test(last) ? last.toLowerCase() : null;
};

// An invoice for exactly the asked amount, from Tando's callback. In KES mode
// (a wallet that speaks LUD-21) the merchant receives exactly those shillings.
// In msat mode the invoice matches the millisats exactly and the merchant
// receives their KES value minus the 1%. Tando's reply is returned unchanged,
// so the sats go straight to Tando and on to M-Pesa.
export async function tandoInvoice(merchant, { amount, currency }) {
  const quote = await tandoQuote(merchant.phone, { fresh: true }); // the live rate, not a cached one
  const mode = String(currency || "").trim().toUpperCase();
  if (mode !== "" && mode !== "KES") throw err("Only KES amounts.", 400);
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1) throw err(mode === "KES" ? `Send between ${quote.kesMin} and ${quote.kesMax.toLocaleString("en-US")} KES.` : "Send a whole number of sats.", 400);
  let kesExpected, msatLo, msatHi;
  const cb = new URL(quote.callback);
  if (mode === "KES") {
    if (n < quote.kesMin || n > quote.kesMax) throw err(`Send between ${quote.kesMin} and ${quote.kesMax.toLocaleString("en-US")} KES.`, 400);
    cb.searchParams.set("amount", String(n));
    cb.searchParams.set("currency", "KES");
    kesExpected = n;
    // The invoice is the KES value in sats plus the 1% on top, at Tando's live
    // rate. The band allows the 1%, rounding up to whole sats, and the rate
    // moving in the seconds between our two calls.
    msatLo = Math.floor(n * quote.multiplier * 0.97);
    msatHi = Math.ceil(n * quote.multiplier * 1.05) + 1000;
  } else {
    if (n < quote.minMsat || n > quote.maxMsat) throw err(`Send between ${Math.ceil(quote.minMsat / 1000).toLocaleString("en-US")} and ${Math.floor(quote.maxMsat / 1000).toLocaleString("en-US")} sats.`, 400);
    cb.searchParams.set("amount", String(n));
    kesExpected = Math.floor((n / quote.multiplier) * (1 - TANDO_FEE_PCT / 100));
  }
  const { ok, body: inv } = await tandoJson(cb.href);
  if (!ok || inv.status === "ERROR") throw err(String(inv.reason || UNREACHABLE).slice(0, 200), 502);
  const pr = String(inv.pr || "").toLowerCase();
  const msats = bolt11Msats(pr);
  if (!pr || msats === null) { substitution(`unreadable invoice for ${mode === "KES" ? `${n} KES` : `${n} msat`}`); throw err(UNREACHABLE, 502); }
  if (mode === "KES") {
    // Tando echoes the priced shillings in `converted`: when present, it must be what we asked for.
    if (inv.converted != null && Number(inv.converted) !== n) {
      substitution(`asked ${n} KES, converted says ${inv.converted}`);
      throw err("Tando's invoice is for a different amount.", 502);
    }
    if (msats < msatLo || msats > msatHi) {
      substitution(`asked ${n} KES, invoice is ${msats} msat`);
      throw err("Tando's invoice is for a different amount.", 502);
    }
  } else if (msats !== n) {
    substitution(`asked ${n} msat, got ${msats}`);
    throw err("Tando's invoice is for a different amount.", 502);
  }
  const hash = bolt11PaymentHash(pr) || urlHash(inv.successAction?.url);
  if (!hash) throw err("Tando's invoice can't be tracked.", 502);
  // One record per payment hash: a repeated invoice reuses its first record.
  const seen = await getJSON(`kt:pay:${hash}`);
  const entry = (seen && (await getJSON(`kte:${seen}`))) || { id: newId(), merchantId: merchant.id, at: now(), status: "pending",
    hash, msats, sats: Math.round((msats / 1000) * 100) / 100, kesExpected,
    kesReceived: null, mpesaCode: null, merchantName: null, confirmedAt: null };
  if (!seen) {
    await setJSON(`kte:${entry.id}`, entry);
    await setJSON(`kt:pay:${hash}`, entry.id);
    await pushId(`kt:tx:${merchant.id}`, entry.id);
  }
  const out = { pr: inv.pr, routes: Array.isArray(inv.routes) ? inv.routes : [] };
  const sa = inv.successAction;
  if (sa && typeof sa === "object" && typeof sa.url === "string" && sa.url.startsWith("https://") && sa.url.length <= 500)
    out.successAction = { tag: String(sa.tag || "url").slice(0, 20), description: String(sa.description || "").slice(0, 200), url: sa.url };
  return { invoice: out, entry };
}

// ---- receipts: Tando's public payment status, polled by the pay page and the app.
export async function fetchReceipt(hash) {
  if (!HASH_RE.test(String(hash || ""))) throw err("That payment isn't known.", 404);
  const h = String(hash).toLowerCase();
  const r = await tandoFetch(`https://${TANDO}/api/payment/${h}`, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, maxBytes: 65536 })
    .catch(() => { throw err(UNREACHABLE, 502); });
  if (r.status === 404) return { found: false };
  if (r.status >= 300 && r.status < 400) throw err(UNREACHABLE, 502);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw err(UNREACHABLE, 502);
  const d = await r.json().catch(() => null);
  const tx = d && typeof d === "object" && !Array.isArray(d) ? d.transaction : null;
  if (!r.ok || !tx || typeof tx !== "object") throw err(UNREACHABLE, 502);
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  return {
    found: true,
    status: String(tx.status || "pending").slice(0, 20),
    isPaid: tx.isPaid === true,
    mpesaCode: typeof tx.paymentNetworkReceipt === "string" && tx.paymentNetworkReceipt ? tx.paymentNetworkReceipt.slice(0, 20) : null,
    merchantName: typeof tx.merchantName === "string" && tx.merchantName ? oneLine(tx.merchantName, 60) : null,
    kesReceived: num(tx.currencyAmountSent ?? tx.currencyAmount),
    payToAccount: typeof tx.payToAccount === "string" ? tx.payToAccount.slice(0, 20) : null,
    sats: num(tx.totalSatsAmount ?? tx.satsAmount),
  };
}

const sameName = (a, b) => String(a || "").toUpperCase().replace(/\s+/g, " ").trim()
  === String(b || "").toUpperCase().replace(/\s+/g, " ").trim();

// Confirms one payment, and only one of ours: hashes kTown never recorded are
// refused without asking Tando, so no stranger's payment can be looked up
// here. Flips our record when Tando says the shillings moved. The registered
// name is answered only when it matches the merchant, so a wrong guess learns
// nothing; a match also verifies the typed name and claims the number, and a
// rename unchecks the name but never the proven number.
export async function confirmPayment(hash) {
  const h = String(hash || "").toLowerCase();
  const entryId = await getJSON(`kt:pay:${h}`);
  const entry = entryId && (await getJSON(`kte:${entryId}`));
  if (!entryId || !entry) throw err("That payment isn't known.", 404);
  const merchant = await getJSON(`kt:${entry.merchantId}`);
  const rc = await fetchReceipt(h);
  if (!rc.found) return { status: "unknown", paid: false, kes: null, mpesaCode: null, merchantName: null };
  const settled = rc.status === "completed" && rc.isPaid && Boolean(rc.mpesaCode);
  const ours = Boolean(merchant && rc.payToAccount === merchant.phone);
  const nameMatch = Boolean(ours && rc.merchantName && sameName(rc.merchantName, merchant.mpesaName));
  if (ours) {
    let mChanged = false;
    if (nameMatch && !merchant.verified) { merchant.verified = true; mChanged = true; }
    if (nameMatch && !merchant.claimed) { merchant.claimed = true; mChanged = true; }
    if (settled && entry.status !== "completed") {
      entry.status = "completed";
      entry.kesReceived = rc.kesReceived;
      entry.mpesaCode = rc.mpesaCode;
      entry.merchantName = nameMatch ? rc.merchantName : null;
      entry.confirmedAt = now();
      await setJSON(`kte:${entry.id}`, entry);
      merchant.paidCount = (merchant.paidCount || 0) + 1; mChanged = true;
    } else if (rc.status === "failed" && entry.status === "pending") {
      entry.status = "failed";
      entry.confirmedAt = now();
      await setJSON(`kte:${entry.id}`, entry);
    }
    if (mChanged) await setJSON(`kt:${merchant.id}`, merchant);
  }
  return { status: rc.status, paid: settled, kes: rc.kesReceived, mpesaCode: rc.mpesaCode,
    merchantName: nameMatch ? rc.merchantName : null };
}

export async function history(merchantId, limit = 100) {
  const entries = await getMany("kte", await listIds(`kt:tx:${merchantId}`, Math.min(Math.max(Number(limit) || 100, 1), 500)));
  return entries.map((e) => ({ hash: e.hash, kesExpected: e.kesExpected, kesReceived: e.kesReceived, sats: e.sats,
    mpesaCode: e.mpesaCode, merchantName: e.merchantName, status: e.status, at: e.at, confirmedAt: e.confirmedAt }));
}

// ---- display rates: KES into the merchant and payer currencies. Display
// only; the KES figure on an invoice is always the exact one. One fixed
// provider (the same open rates feed lib/lightning.js uses), cached an hour,
// the last good answer served stale when a refresh fails.
const RATES_URL = "https://open.er-api.com/v6/latest/KES";
let ratesFetch = (u, o) => publicFetch(u, o);
export const setKtownRatesFetcher = (f) => { ratesFetch = f || ((u, o) => publicFetch(u, o)); }; // tests
let ratesCache = null; // { atMs, rates }
const RATES_TTL = 3600e3;
export function clearRatesCache() { ratesCache = null; } // tests
export async function fiatRates(now = Date.now()) {
  if (ratesCache && now - ratesCache.atMs < RATES_TTL)
    return { base: "KES", rates: ratesCache.rates, at: new Date(ratesCache.atMs).toISOString(), stale: false };
  try {
    const r = await ratesFetch(RATES_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, maxBytes: 65536 });
    const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!r.ok || type !== "application/json") throw new Error("bad rates");
    const d = await r.json().catch(() => null);
    const got = d && d.result === "success" && d.rates && typeof d.rates === "object" ? d.rates : null;
    const rates = { KES: 1 };
    for (const code of ["USD", "EUR", "UGX", "TZS"]) {
      const v = Number(got?.[code]);
      if (!Number.isFinite(v) || v <= 0) throw new Error("bad rates");
      rates[code] = v;
    }
    ratesCache = { atMs: now, rates };
    return { base: "KES", rates, at: new Date(now).toISOString(), stale: false };
  } catch {
    if (ratesCache) return { base: "KES", rates: ratesCache.rates, at: new Date(ratesCache.atMs).toISOString(), stale: true };
    throw err("Exchange rates aren't reachable right now.", 502);
  }
}
