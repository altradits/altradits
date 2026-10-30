// Ye₿ente wallets: custodial Lightning wallets kept by Altradits on its own node.
// Balances live here, in a ledger, never in the browser. Every change to a
// balance runs under one ledger lock, so two requests can never spend the same
// sats, and every change writes a history entry.
//
//   yw:<id>        wallet { id, handle, pin: {salt, hash}, tokens: [sha256], recovery: sha256,
//                           balance, createdAt, failedPins, lockedUntil }
//   yw:h:<handle>  wallet id
//   yw:r:<sha256>  wallet id (recovery phrase)
//   yw:t:<sha256>  wallet id (device token)
//   ywtx:<id>      list of entry ids (newest first);  ywe:<entryId>  entry
//
// Switched on with YEBENTE_WALLETS=on (off: no wallet can be created).
// Limits (environment, in sats): YEBENTE_MAX_BALANCE_SATS (default 200,000),
// YEBENTE_MAX_PAYMENT_SATS (100,000) and YEBENTE_DAILY_SEND_SATS (200,000).
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock, deleteKeys } from "./store.js";
import { publicFetch } from "./netsafe.js";

const num = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
export const limits = () => ({
  maxBalance: num("YEBENTE_MAX_BALANCE_SATS", 200_000),
  maxPayment: num("YEBENTE_MAX_PAYMENT_SATS", 100_000),
  dailySend: num("YEBENTE_DAILY_SEND_SATS", 200_000),
});
// A switch is on for on / true / yes / 1, in any case, ignoring spaces and quotes.
export const switchOn = (name) => ["on", "true", "yes", "1"].includes(String(process.env[name] || "").trim().replace(/^["']|["']$/g, "").toLowerCase());
export const walletsOn = () => switchOn("YEBENTE_WALLETS");
export const DOMAIN = () => (process.env.SITE_URL || "https://altradits.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString("base64url");
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])$/;
const RESERVED = new Set(["admin", "blink", "altradits", "stan", "stanley", "support", "hello", "finance", "pay", "wallet", "yebente", "root", "help", "info", "orders", "care"]);

// Words for recovery phrases: 12 of 256 words = 96 bits.
const WORDS = "acacia amber anchor apple arrow autumn bamboo banana basil beacon berry birch bison blossom breeze bronze buffalo cactus camel candle canyon cedar cherry cinnamon citrus clover cobalt comet copper coral cotton crane crystal cypress daisy delta desert dolphin dove dune eagle ebony echo ember emerald falcon fern fig flame flint forest fossil fox galaxy garden garnet gazelle ginger glacier granite grape harbor hawk hazel heron hibiscus honey horizon ibis indigo iris island ivory jade jasmine jungle juniper kestrel kiwi koala lagoon lantern lark laurel lava lemon leopard lilac lily lime linen lion lotus lunar lynx magnet mango maple marble marlin meadow melon mesa meteor mint mirror monsoon moss mountain nectar nebula nile nutmeg oak oasis ocean olive onyx orbit orchid otter owl palm panda papaya parrot pearl pebble pepper petal pine planet plum pollen pony poppy prairie quartz quill rain raven reef ridge river robin ruby saffron sage salmon sand sapphire savanna sequoia shadow shell sienna silver sky slate sparrow spice spring spruce star stone storm summit sun swan tamarind tangerine teak thunder tide tiger timber topaz tulip tundra turtle twig umber valley velvet violet volcano walnut wave whale willow wind wolf wren yarrow zebra zenith acorn aloe apricot aspen aurora badger bay bear bee bell bluebell boulder brook butter canary cardamom cashew cave clay cloud cocoa coconut condor cove crow dahlia dawn deer dew elm feather finch fjord frost gecko geyser glade gorge gull heath hill holly hornet hyena iguana jaguar kelp kite lake leaf lichen mallow marsh moon moth newt nimbus oriole osprey pansy peach pond puma quail reed rose rye seal shore sloth snow sorrel swift tern thistle".split(" ").slice(0, 256);
const recoveryPhrase = () => Array.from(crypto.randomBytes(12), (b) => WORDS[b]).join(" ");
const normPhrase = (s) => String(s || "").toLowerCase().trim().split(/\s+/).join(" ");

function pinHash(pin, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex") };
}
const pinOk = (w, pin) => {
  if (!/^\d{6}$/.test(String(pin || ""))) return false;
  const { hash } = pinHash(pin, w.pin.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(w.pin.hash, "hex"));
};

// One ledger lock for every balance change (low volume: simple and safe).
async function withLedger(fn) {
  let release = null;
  for (let i = 0; i < 100 && !release; i++) {
    release = await acquireLock("yw:ledger", 30);
    if (!release) await new Promise((r) => setTimeout(r, 50));
  }
  if (!release) throw Object.assign(new Error("The wallet is busy. Please try again."), { status: 503 });
  try { return await fn(); } finally { await release(); }
}

const err = (message, status = 400) => Object.assign(new Error(message), { status });
export const publicWallet = (w) => ({ id: w.id, handle: w.handle, address: `${w.handle}@${DOMAIN()}`, balance: w.balance, createdAt: w.createdAt, limits: limits(),
  email: w.email || null, emailPending: w.emailPending || null, holdUntil: w.holdUntil && Date.parse(w.holdUntil) > Date.now() ? w.holdUntil : null,
  passkeys: (w.passkeys || []).length });

async function record(walletId, entry) {
  const e = { id: newId(), walletId, at: now(), ...entry };
  await setJSON(`ywe:${e.id}`, e);
  await pushId(`ywtx:${walletId}`, e.id);
  return e;
}

export async function createWallet({ pin, handle, email, site }) {
  if (!walletsOn()) throw err("Ye₿ente wallets are not open yet.", 501);
  choosePin(pin);
  let h = String(handle || "").toLowerCase().trim();
  if (h && (!HANDLE_RE.test(h) || RESERVED.has(h))) throw err("Handle: 3 to 20 letters, digits, dot, dash or underscore.");
  return withLedger(async () => {
    if (h && (await getJSON(`yw:h:${h}`))) throw err("That handle is taken.", 409);
    if (!h) do { h = `${WORDS[crypto.randomInt(256)]}${crypto.randomInt(1000, 9999)}`; } while (await getJSON(`yw:h:${h}`));
    const id = newId(), token = crypto.randomBytes(24).toString("base64url"), phrase = recoveryPhrase();
    const w = { id, handle: h, pin: pinHash(pin), tokens: [sha(token)], recovery: sha(phrase), balance: 0, createdAt: now(), failedPins: 0, lockedUntil: null };
    await setJSON(`yw:${id}`, w);
    await setJSON(`yw:h:${h}`, id);
    await setJSON(`yw:r:${w.recovery}`, id);
    await setJSON(`yw:t:${sha(token)}`, id);
    await pushId("ywallets", id);
    return { w, token, recovery: phrase };
  }).then(async ({ w, token, recovery }) => {
    // An optional recovery email: confirmed by a link before it counts.
    if (email) await setEmail(w, email, site).catch(() => {});
    return { wallet: publicWallet((await getJSON(`yw:${w.id}`)) || w), token, recovery };
  });
}

// A new device: the recovery phrase plus a new PIN gives a fresh device token.
export async function restoreWallet({ recovery, pin }) {
  choosePin(pin);
  const id = await getJSON(`yw:r:${sha(normPhrase(recovery))}`);
  if (!id) throw err("That recovery phrase doesn't match a wallet.", 404);
  return withLedger(async () => {
    const w = await getJSON(`yw:${id}`);
    const token = crypto.randomBytes(24).toString("base64url");
    w.tokens = [...(w.tokens || []).slice(-4), sha(token)];
    w.pin = pinHash(pin);
    w.failedPins = 0; w.lockedUntil = null;
    await setJSON(`yw:${id}`, w);
    await setJSON(`yw:t:${sha(token)}`, id);
    warnOwner(w, `Ye₿ente: ${w.handle} opened on a new device`,
      `Hi,\n\n${w.handle}@${DOMAIN()} was just opened on a new device with its recovery phrase, and a new PIN was set.\n\nWas this you? Nothing to do.\n\nWasn't you? Someone has your recovery phrase: open Ye₿ente, create a new wallet and send your sats to it now.`);
    return { wallet: publicWallet(w), token };
  });
}

export async function walletForToken(token) {
  if (!token || token.length < 20) return null;
  const id = await getJSON(`yw:t:${sha(token)}`);
  const w = id && (await getJSON(`yw:${id}`));
  return w && w.tokens?.includes(sha(token)) ? w : null;
}
export const walletByHandle = async (handle) => {
  const id = await getJSON(`yw:h:${String(handle || "").toLowerCase().trim()}`);
  return id ? getJSON(`yw:${id}`) : null;
};

export async function history(walletId, limit = 100) {
  return getMany("ywe", await listIds(`ywtx:${walletId}`, limit));
}

// Every entry of the last 24 hours (newest first), however many there are: the
// daily caps must not be dodged by burying earlier payments under small ones.
async function lastDay(walletId) {
  const since = Date.now() - 864e5, ids = await listIds(`ywtx:${walletId}`, 100000), out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const page = await getMany("ywe", ids.slice(i, i + 200));
    out.push(...page.filter((e) => Date.parse(e.at) >= since));
    if (page.some((e) => Date.parse(e.at) < since)) break;
  }
  return out;
}

// Sats sent in the last 24 hours (for the daily cap).
async function sentToday(walletId) {
  return (await lastDay(walletId)).filter((e) => e.sats < 0 && e.status !== "failed").reduce((t, e) => t - e.sats - (e.fee || 0), 0);
}

// A new PIN: 6 digits, and not one anyone would try first. PINs already set keep working.
const EASY_PINS = new Set(["112233", "159753", "147258", "102030", "123321", "098765", "135790", "246810", "142536", "010203"]);
function choosePin(pin) {
  pin = String(pin || "");
  if (!/^\d{6}$/.test(pin)) throw err("Choose a 6-digit PIN.");
  const d = [...pin].map(Number), steps = d.slice(1).map((x, i) => x - d[i]);
  if (new Set(d).size <= 2 || steps.every((x) => x === 1) || steps.every((x) => x === -1) || /^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin) || EASY_PINS.has(pin))
    throw err("That PIN is easy to guess. Choose 6 digits that aren't a pattern.");
  return pin;
}

// A security notice to the wallet's confirmed email (none when it has no email).
const warnOwner = (w, subject, text) => {
  if (w.email) mail({ to: w.email, subject, text }).catch(() => {});
};

const waitText = (until) => {
  const min = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60e3));
  return min >= 120 ? `${Math.ceil(min / 60)} hours` : `${min} minutes`;
};
// Repeated lock-outs get longer: 15 minutes, then 1 hour, then 24 hours (within a day).
const LOCK_MINUTES = [15, 60, 24 * 60];
const lockedNow = (w) => Boolean(w.lockedUntil && Date.parse(w.lockedUntil) > Date.now());

// Checks the PIN (inside the ledger lock): 5 wrong tries lock spending, longer each time.
async function checkPin(w, pin) {
  if (lockedNow(w)) throw err(`Too many wrong PINs. Try again in ${waitText(w.lockedUntil)}.`, 429);
  // Approved with the phone's fingerprint or face: good once, for this wallet only.
  if (pin instanceof PasskeyPass) {
    if (pin.walletId !== w.id || pin.used) throw err("Approve the payment again.", 403);
    pin.used = true;
    return;
  }
  if (!pinOk(w, pin)) {
    w.failedPins = (w.failedPins || 0) + 1;
    if (w.failedPins >= 5) {
      const recent = w.lockedAt && Date.parse(w.lockedAt) > Date.now() - 864e5 ? w.lockCount || 0 : 0;
      w.lockCount = recent + 1;
      w.lockedAt = now();
      w.lockedUntil = new Date(Date.now() + LOCK_MINUTES[Math.min(recent, LOCK_MINUTES.length - 1)] * 60e3).toISOString();
      w.failedPins = 0;
      warnOwner(w, `Ye₿ente: ${w.handle} locked after wrong PINs`,
        `Hi,\n\nSomeone entered the wrong PIN for ${w.handle}@${DOMAIN()} 5 times, so payments are locked for ${waitText(w.lockedUntil)}. Your sats are safe.\n\nWasn't you? Someone has your phone or a signed-in device. Recover your wallet by email from another phone: that signs every other device out.`);
    }
    await setJSON(`yw:${w.id}`, w);
    throw err(lockedNow(w) ? `Wrong PIN. Payments are locked for ${waitText(w.lockedUntil)}.` : "Wrong PIN.", 403);
  }
  if (w.failedPins) { w.failedPins = 0; await setJSON(`yw:${w.id}`, w); }
}

// Debit checks shared by every spend: positive whole sats, caps, balance.
async function spendable(w, sats, fee = 0) {
  const L = limits();
  if (!Number.isInteger(sats) || sats <= 0) throw err("Enter a whole number of sats.");
  if (sats > L.maxPayment) throw err(`The most per payment is ${L.maxPayment.toLocaleString("en-US")} sats.`);
  if ((await sentToday(w.id)) + sats + fee > L.dailySend) throw err(`The daily sending limit is ${L.dailySend.toLocaleString("en-US")} sats.`);
  if (w.balance < sats + fee) throw err("Insufficient balance.", 402);
  // After an email recovery, larger payments wait 24 hours (a stolen email can't empty the wallet).
  const hold = num("YEBENTE_RECOVERY_HOLD_SATS", 1_000);
  if (w.holdUntil && Date.parse(w.holdUntil) > Date.now() && sats + fee > hold)
    throw err(`This wallet was recovered recently: payments over ${hold.toLocaleString("en-US")} sats open on ${new Date(w.holdUntil).toUTCString().slice(5, 22)} UTC.`, 423);
}

// Wallet to wallet inside Ye₿ente: instant and free.
export async function transfer({ from, toHandle, sats, pin, note = "" }) {
  sats = Number(sats);
  return withLedger(async () => {
    const w = await getJSON(`yw:${from.id}`);
    await checkPin(w, pin);
    const to = await walletByHandle(toHandle);
    if (!to) throw err("No Ye₿ente wallet has that handle.", 404);
    if (to.id === w.id) throw err("That's your own wallet.");
    await spendable(w, sats);
    if (to.balance + sats > limits().maxBalance) throw err("The recipient's wallet is full.");
    w.balance -= sats; to.balance += sats;
    await setJSON(`yw:${w.id}`, w);
    await setJSON(`yw:${to.id}`, to);
    const ref = `YB-${newId().slice(0, 8).toUpperCase()}`;
    const text = String(note).slice(0, 120);
    await record(w.id, { kind: "transfer_out", sats: -sats, fee: 0, counterparty: `${to.handle}@${DOMAIN()}`, status: "completed", ref, note: text });
    await record(to.id, { kind: "transfer_in", sats, fee: 0, counterparty: `${w.handle}@${DOMAIN()}`, status: "completed", ref, note: text });
    return { wallet: publicWallet(w), ref };
  });
}

// Credits a wallet once per reference (Lightning payment hash, M-Pesa receipt):
// a repeated or concurrent confirmation never pays twice.
export async function credit({ walletId, sats, kind, ref, counterparty = "", meta = {} }) {
  sats = Math.floor(Number(sats));
  if (!(sats > 0) || !ref) throw err("Nothing to credit.");
  return withLedger(async () => {
    if (await getJSON(`ywref:${ref}`)) return { duplicate: true };
    const w = await getJSON(`yw:${walletId}`);
    if (!w) throw err("Wallet not found.", 404);
    w.balance += sats;
    await setJSON(`yw:${w.id}`, w);
    await setJSON(`ywref:${ref}`, { walletId, sats, at: now() });
    await record(w.id, { kind, sats, fee: 0, counterparty, status: "completed", ref, ...meta });
    return { wallet: publicWallet(w) };
  });
}

// Total sats Altradits owes its wallet holders (for the solvency check and the admin).
export async function liabilities() {
  const ws = await getMany("yw", await listIds("ywallets", 100000));
  return { wallets: ws.length, sats: ws.reduce((t, w) => t + (w.balance || 0), 0) };
}

// ---- receiving: invoices on the Altradits node, credited once when settled

// An invoice for a wallet (the app's Receive, or the handle's Lightning address).
export async function invoiceFor(wallet, sats, { memo, descriptionHash } = {}) {
  sats = Number(sats);
  const L = limits();
  if (!Number.isInteger(sats) || sats <= 0) throw err("Enter a whole number of sats.");
  if (sats > L.maxPayment) throw err(`The most per payment is ${L.maxPayment.toLocaleString("en-US")} sats.`);
  if (wallet.balance + (await incoming(wallet.id)) + sats > L.maxBalance) throw err("This would take the wallet over its limit.");
  const { createInvoice } = await import("./lightning.js");
  const make = () => createInvoice({ sats, memo: memo || `Ye₿ente ${wallet.handle}@${DOMAIN()}`, descriptionHash, nodeOnly: true, expiry: 3600 });
  // The node sits behind a tunnel: one retry rides out a dropped connection.
  const inv = await make().catch(() => new Promise((r) => setTimeout(r, 1500)).then(make)).catch((e) => {
    console.error("yebente invoice:", e.message);
    throw err("The Lightning node isn't answering right now. Try again in a minute.", 503);
  });
  await setJSON(`ywinv:${inv.paymentHash}`, { walletId: wallet.id, sats, at: now(), expiresAt: inv.expiresAt, state: "open" });
  await pushId("ywinvopen", inv.paymentHash);
  return { invoice: inv.bolt11, paymentHash: inv.paymentHash, satsAmount: sats, expiresAt: inv.expiresAt };
}

// Sats that may still arrive: this wallet's open, unexpired invoices and pending buys.
// They count against the balance limit, so several invoices can't pass it together.
async function incoming(walletId) {
  const now = Date.now();
  const inv = (await getMany("ywinv", await listIds("ywinvopen", 500))).filter((i) => i.walletId === walletId && i.state === "open" && Date.parse(i.expiresAt) > now);
  const buys = (await getMany("ywbuy", await listIds("ywbuyopen", 500))).filter((b) => b.walletId === walletId && b.state === "pending" && now - Date.parse(b.at) < 864e5);
  return inv.reduce((t, i) => t + i.sats, 0) + buys.reduce((t, b) => t + b.sats, 0);
}

// Checks one invoice with the node: paid -> credited once; past expiry -> closed.
export async function settleInvoice(hash) {
  const inv = await getJSON(`ywinv:${hash}`);
  if (!inv || inv.state !== "open") return inv?.state || null;
  const { invoicePaid } = await import("./lightning.js");
  const paid = await invoicePaid({ provider: "lnd", paymentHash: hash });
  if (paid === true) {
    await credit({ walletId: inv.walletId, sats: inv.sats, kind: "receive", ref: hash, counterparty: "Lightning" });
    inv.state = "settled";
  } else if (Date.parse(inv.expiresAt) + 60e3 < Date.now()) inv.state = "expired";
  else return "open";
  await setJSON(`ywinv:${hash}`, inv);
  return inv.state;
}

// Every open invoice (background sweep, every few minutes): pays out credits a
// payer made while the app was closed, and drops expired ones from the list.
export async function settleOpen() {
  const { removeFromList } = await import("./store.js");
  const open = await listIds("ywinvopen", 500);
  const done = [];
  for (const h of open) {
    try { const st = await settleInvoice(h); if (st !== "open") done.push(h); } catch { /* node unreachable: next sweep */ }
  }
  await removeFromList("ywinvopen", done);
  return { checked: open.length, closed: done.length };
}

// ---- sending: to any Lightning invoice or address (M-Pesa via phone@bitcoin.co.ke)

// The most a route may cost: reserved before paying, the unused part refunded.
export const feeReserve = (sats) => Math.max(10, Math.ceil(sats * 0.01));
const LN_ADDRESS = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

// LNURL from a QR code: bech32 "lnurl1..." (LUD-01) or "lnurlp://host/path" (LUD-17).
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
export function lnurlToUrl(s) {
  s = String(s || "").trim();
  if (/^lnurlp:\/\//i.test(s)) return `https://${s.slice(9)}`;
  s = s.toLowerCase();
  if (!/^lnurl1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{6,}$/.test(s)) return null;
  const data = [...s.slice(6)].map((c) => BECH32.indexOf(c));
  const hrp = [..."lnurl"].map((c) => c.charCodeAt(0));
  if (bech32Polymod([...hrp.map((c) => c >> 5), 0, ...hrp.map((c) => c & 31), ...data]) !== 1) return null;
  let acc = 0, bits = 0;
  const bytes = [];
  for (const v of data.slice(0, -6)) {
    acc = ((acc << 5) | v) & 0xfff; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
  }
  const url = Buffer.from(bytes).toString("utf8");
  return /^https:\/\//i.test(url) ? url : null;
}

let lnurlFetch = (u, o) => publicFetch(u, o);
export const setLnurlFetcher = (f) => { lnurlFetch = f; }; // tests

// LNURL-pay (a Lightning address or an LNURL): asks the receiver for an invoice of exactly `sats`.
async function payRequestInvoice(payUrl, sats, label) {
  const { bolt11Msats, bolt11PaymentHash } = await import("./lightning.js");
  const { safeUrl } = await import("./jobs.js");
  const getJson = async (u) => {
    const url = await safeUrl(u);
    if (url.protocol !== "https:") throw err("That Lightning address isn't reachable.");
    // Public addresses only, checked on the IP actually connected to; no redirects, 64 kB at most.
    const r = await lnurlFetch(url.href, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" }, maxBytes: 65536 }).catch(() => { throw err("That Lightning address isn't reachable."); });
    if (r.status >= 300 && r.status < 400) throw err("That Lightning address isn't reachable.");
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.status === "ERROR") throw err(d.reason || "That Lightning address isn't reachable.");
    return d;
  };
  const pay = await getJson(payUrl);
  if (pay.tag !== "payRequest" || !pay.callback) throw err("That Lightning address isn't reachable.");
  const msats = sats * 1000;
  if (msats < Number(pay.minSendable) || msats > Number(pay.maxSendable)) throw err(`This address accepts ${Math.ceil(pay.minSendable / 1000).toLocaleString("en-US")} to ${Math.floor(pay.maxSendable / 1000).toLocaleString("en-US")} sats.`);
  const cb = new URL(pay.callback);
  cb.searchParams.set("amount", String(msats));
  const inv = await getJson(cb.toString());
  const pr = String(inv.pr || "").toLowerCase();
  if (bolt11Msats(pr) !== msats) throw err("The address returned an invoice for a different amount.");
  const hash = bolt11PaymentHash(pr);
  if (!hash) throw err("That invoice can't be read.");
  const ours = await getJSON(`ywinv:${hash}`);
  if (ours) return { kind: "own_invoice", hash, sats, walletId: ours.walletId };
  return { kind: "invoice", pr, sats, hash, label, receiptUrl: inv.successAction?.url || null };
}

// Where a payment goes: another Ye₿ente wallet (free, in the ledger) or out of the node.
export async function resolveDestination(to, sats) {
  const raw = String(to || "").trim().replace(/^lightning:/i, "");
  const lower = raw.toLowerCase();
  const own = lower.match(new RegExp(`^([a-z0-9._-]+)(?:@${DOMAIN().replace(/\./g, "\\.")})?$`));
  if (own && HANDLE_RE.test(own[1]) && !lower.startsWith("lnbc")) return { kind: "handle", handle: own[1] };
  const { bolt11Msats, bolt11PaymentHash } = await import("./lightning.js");
  if (/^ln(bc|tb|bcrt)/.test(lower)) {
    const msats = bolt11Msats(lower), hash = bolt11PaymentHash(lower);
    if (!msats || msats % 1000) throw err("This invoice has no amount in whole sats. Ask for an invoice with an amount.");
    if (!hash) throw err("That invoice can't be read.");
    if (sats && Number(sats) !== msats / 1000) throw err(`This invoice is for ${(msats / 1000).toLocaleString("en-US")} sats.`);
    const ours = await getJSON(`ywinv:${hash}`);
    if (ours) return { kind: "own_invoice", hash, sats: ours.sats, walletId: ours.walletId };
    return { kind: "invoice", pr: lower, sats: msats / 1000, hash, label: "Lightning invoice" };
  }
  const lnurl = lnurlToUrl(raw);
  // Another Ye₿ente wallet's QR code: a free transfer inside the ledger.
  const mine = lnurl?.match(new RegExp(`^https://${DOMAIN().replace(/\./g, "\\.")}/\\.well-known/lnurlp/([a-z0-9._-]+)$`, "i"));
  if (mine && HANDLE_RE.test(mine[1].toLowerCase())) return { kind: "handle", handle: mine[1].toLowerCase() };
  if (LN_ADDRESS.test(lower) || lnurl) {
    sats = Number(sats);
    if (!Number.isInteger(sats) || sats <= 0) throw err("Enter a whole number of sats.");
    const [user, domain] = lower.split("@");
    return payRequestInvoice(lnurl || `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`, sats, lnurl ? "LNURL" : lower);
  }
  throw err("Enter a Ye₿ente handle, a Lightning address, an LNURL or an invoice.");
}

const entryUpdate = async (id, patch) => { const e = await getJSON(`ywe:${id}`); if (e) await setJSON(`ywe:${id}`, { ...e, ...patch }); };

// Settles an outgoing payment once: refunds the unused fee reserve, or everything if it failed.
async function finishPayment(hash, res) {
  if (res.status !== "succeeded" && res.status !== "failed") return "pending";
  return withLedger(async () => {
    const p = await getJSON(`ywpay:${hash}`);
    if (!p || p.done) return p?.result || null;
    const w = await getJSON(`yw:${p.walletId}`);
    if (res.status === "succeeded") {
      const fee = Math.min(p.fee, Math.max(0, Number(res.feeSats) || 0));
      w.balance += p.fee - fee;
      await entryUpdate(p.entryId, { status: "completed", fee, preimage: res.preimage || undefined });
    } else {
      w.balance += p.sats + p.fee;
      await entryUpdate(p.entryId, { status: "failed", fee: 0, error: res.error || "The payment failed." });
    }
    await setJSON(`yw:${w.id}`, w);
    await setJSON(`ywpay:${hash}`, { ...p, done: true, result: res.status, finishedAt: now() });
    return res.status;
  });
}

// Payments whose result wasn't known in time (node slow): asked again every few minutes.
// A payment younger than 3 minutes may still be on its way to the node (its send
// call can take 70 seconds), so it is left alone: asking now could refund it while it pays.
let SETTLE_AFTER = 3 * 60e3;
export async function reconcilePayments() {
  const { removeFromList } = await import("./store.js");
  const { paymentStatus } = await import("./lightning.js");
  const open = await listIds("ywpayopen", 200), done = [];
  for (const h of open) {
    const p = await getJSON(`ywpay:${h}`);
    if (!p || p.done) { done.push(h); continue; }
    if (Date.now() - Date.parse(p.at) < SETTLE_AFTER) continue;
    try { const st = await finishPayment(h, await paymentStatus(h)); if (st !== "pending") done.push(h); } catch { /* node unreachable: next round */ }
  }
  await removeFromList("ywpayopen", done);
  return { checked: open.length, closed: done.length };
}

let PAY_RECHECK_MS = 5000;
export const setPayTimings = ({ recheckMs = PAY_RECHECK_MS, settleAfterMs = SETTLE_AFTER } = {}) => { PAY_RECHECK_MS = recheckMs; SETTLE_AFTER = settleAfterMs; }; // tests

export async function payOut({ from, to, sats, pin }) {
  const dest = await resolveDestination(to, sats);
  if (dest.kind === "handle") return transfer({ from, toHandle: dest.handle, sats, pin });
  if (dest.kind === "own_invoice") {
    // Another Ye₿ente wallet's invoice: settled inside the ledger, never sent over Lightning.
    const target = await getJSON(`yw:${dest.walletId}`);
    const r = await transfer({ from, toHandle: target.handle, sats: dest.sats, pin });
    await setJSON(`ywinv:${dest.hash}`, { ...(await getJSON(`ywinv:${dest.hash}`)), state: "settled" });
    return r;
  }
  const { canPay, payInvoice } = await import("./lightning.js");
  if (!canPay()) throw err("Sending to other Lightning wallets isn't switched on yet.", 501);
  const fee = feeReserve(dest.sats);
  const entry = await withLedger(async () => {
    const w = await getJSON(`yw:${from.id}`);
    await checkPin(w, pin);
    if (await getJSON(`ywpay:${dest.hash}`)) throw err("This invoice was already paid from a Ye₿ente wallet.", 409);
    await spendable(w, dest.sats, fee);
    w.balance -= dest.sats + fee;
    await setJSON(`yw:${w.id}`, w);
    const e = await record(w.id, { kind: "send", sats: -dest.sats, fee, counterparty: dest.label, status: "pending", ref: dest.hash, receiptUrl: dest.receiptUrl || undefined });
    await setJSON(`ywpay:${dest.hash}`, { walletId: w.id, entryId: e.id, sats: dest.sats, fee, at: now(), done: false });
    await pushId("ywpayopen", dest.hash);
    return e;
  });
  const first = await payInvoice(dest.pr, fee);
  let status = await finishPayment(dest.hash, first);
  if (status === "pending") {
    // No clear answer: the node is asked about this payment a few seconds later.
    // Refunded only if the node says it never started it; otherwise it stays
    // pending and the background check settles it.
    await new Promise((r) => setTimeout(r, PAY_RECHECK_MS));
    const { paymentStatus } = await import("./lightning.js");
    const st = await paymentStatus(dest.hash).catch(() => ({ status: "in_flight" }));
    status = await finishPayment(dest.hash, st.status === "failed" ? { ...st, error: first.error } : st);
  }
  const w = await getJSON(`yw:${from.id}`);
  const e = await getJSON(`ywe:${entry.id}`);
  if (status === "failed") throw err(e.error || "The payment failed. Nothing was taken.", 502);
  return { wallet: publicWallet(w), ref: dest.hash, status: status === "succeeded" ? "completed" : "pending", fee: e.fee, receiptUrl: dest.receiptUrl || null };
}

// ---- buying sats with M-Pesa (STK Push), credited to the wallet once Safaricom confirms

const buyLimits = () => ({
  minKes: 10,
  maxKes: num("YEBENTE_BUY_MAX_KES", 5_000),
  dailyKes: num("YEBENTE_DAILY_BUY_KES", 10_000),
  spreadPct: Math.min(20, Math.max(0, Number(process.env.YEBENTE_BUY_SPREAD_PCT ?? 0))),
});

// A quote, and every check before a payment prompt is sent: wallet limit, daily
// buys, and that the node can actually pay out what wallets would then hold.
export async function quoteBuy(wallet, kes) {
  kes = Number(kes);
  const B = buyLimits();
  if (!Number.isInteger(kes) || kes < B.minKes || kes > B.maxKes) throw err(`Buy between ${B.minKes} and ${B.maxKes.toLocaleString("en-US")} KES.`);
  const { btcKes, outboundSats } = await import("./lightning.js");
  const rate = await btcKes();
  const sats = Math.floor((kes / rate) * 1e8 * (1 - B.spreadPct / 100));
  if (sats < 1) throw err("That amount is too small.");
  if (wallet.balance + (await incoming(wallet.id)) + sats > limits().maxBalance) throw err("This would take the wallet over its limit.");
  const pending = (await getMany("ywbuy", await listIds("ywbuyopen", 500))).filter((b) => b.walletId === wallet.id && b.state === "pending" && Date.now() - Date.parse(b.at) < 864e5);
  const bought = (await lastDay(wallet.id)).filter((e) => e.kind === "buy").reduce((t, e) => t + (e.kes || 0), 0) + pending.reduce((t, b) => t + (b.kes || 0), 0);
  if (bought + kes > B.dailyKes) throw err(`The daily buying limit is ${B.dailyKes.toLocaleString("en-US")} KES.`);
  const outbound = await outboundSats();
  const owed = (await liabilities()).sats + (await pendingBuySats());
  if (outbound === null || owed + sats > outbound * 0.9) throw err("Buying is paused for now. Please try again later.", 503);
  return { kes, sats, rate: Math.round(rate), spreadPct: B.spreadPct };
}

async function pendingBuySats() {
  const open = await getMany("ywbuy", await listIds("ywbuyopen", 500));
  return open.filter((b) => b.state === "pending" && Date.now() - Date.parse(b.at) < 864e5).reduce((t, b) => t + b.sats, 0);
}

export async function startBuy(wallet, quote, checkoutRequestId) {
  await setJSON(`ywbuy:${checkoutRequestId}`, { walletId: wallet.id, ...quote, at: now(), state: "pending" });
  await pushId("ywbuyopen", checkoutRequestId);
}

// Safaricom's result for a buy: paid -> the sats are credited once (keyed by the
// M-Pesa receipt); cancelled or failed -> closed, nothing credited.
export async function finishBuy(checkoutRequestId, { resultCode, receipt }) {
  const b = await getJSON(`ywbuy:${checkoutRequestId}`);
  if (!b || b.state !== "pending") return b?.state || null;
  if (String(resultCode) === "0") {
    await credit({ walletId: b.walletId, sats: b.sats, kind: "buy", ref: `MPESA-${receipt || checkoutRequestId}`, counterparty: "M-Pesa", meta: { kes: b.kes } });
    b.state = "paid"; b.receipt = receipt || null;
  } else if (String(resultCode) !== "49") b.state = "failed";
  else return "pending";
  b.finishedAt = now();
  await setJSON(`ywbuy:${checkoutRequestId}`, b);
  const { removeFromList } = await import("./store.js");
  await removeFromList("ywbuyopen", [checkoutRequestId]);
  return b.state;
}

// ---- recovery by email: a confirmed address gets a one-time link (30 minutes)

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;
const normEmail = (s) => String(s || "").trim().toLowerCase();
const mail = async (args) => (await import("./email.js")).sendEmail({ kind: "delivery", dept: "tech", ...args });

// Sets (or changes) the recovery email: pending until the link in the email is opened.
export async function setEmail(w, email, site) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 200) throw err("Please check the email address.");
  const token = crypto.randomBytes(24).toString("base64url");
  await setJSON(`ywec:${sha(token)}`, { walletId: w.id, email: e, expiresAt: new Date(Date.now() + 48 * 3600e3).toISOString() });
  const fresh = await getJSON(`yw:${w.id}`);
  await setJSON(`yw:${w.id}`, { ...fresh, emailPending: e });
  await mail({ to: e, subject: "Confirm your Ye₿ente recovery email",
    text: `Hi,\n\nConfirm this address to recover your Ye₿ente wallet ${w.handle}@${DOMAIN()} if you lose your phone. The link works for 48 hours.\n\nDidn't ask for this? Ignore this email.`,
    cta: { label: "Confirm my email", url: `${site}/api/yebente/wallet/email-confirm?t=${token}` } });
  return { emailPending: e };
}

export async function confirmEmail(token) {
  const key = `ywec:${sha(token)}`, rec = await getJSON(key);
  if (!rec || Date.parse(rec.expiresAt) < Date.now()) return false;
  const w = await getJSON(`yw:${rec.walletId}`);
  if (!w) return false;
  if (w.email && w.email !== rec.email) {
    const old = (await getJSON(`yw:e:${sha(w.email)}`)) || [];
    await setJSON(`yw:e:${sha(w.email)}`, old.filter((id) => id !== w.id));
  }
  const ids = (await getJSON(`yw:e:${sha(rec.email)}`)) || [];
  await setJSON(`yw:e:${sha(rec.email)}`, [...new Set([...ids, w.id])].slice(-10));
  await setJSON(`yw:${w.id}`, { ...w, email: rec.email, emailPending: null, emailConfirmedAt: now() });
  await deleteKeys([key]);
  return true;
}

// Sends a one-time recovery link for every wallet confirmed with this email.
// Always answers the same, so it can't tell anyone whether an email has a wallet.
export async function requestEmailRecovery(email, site) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw err("Please check the email address.");
  const ws = (await getMany("yw", (await getJSON(`yw:e:${sha(e)}`)) || [])).filter((w) => w.email === e);
  for (const w of ws) {
    const token = crypto.randomBytes(24).toString("base64url");
    await setJSON(`ywrt:${sha(token)}`, { walletId: w.id, expiresAt: new Date(Date.now() + 30 * 60e3).toISOString() });
    await mail({ to: e, subject: `Recover your Ye₿ente wallet ${w.handle}`,
      text: `Hi,\n\nOpen this link on your new phone to recover ${w.handle}@${DOMAIN()} and choose a new PIN. It works once, for 30 minutes. Your other devices will be signed out, and payments over ${num("YEBENTE_RECOVERY_HOLD_SATS", 1_000).toLocaleString("en-US")} sats wait 24 hours.\n\nDidn't ask for this? Ignore this email: nothing changes.`,
      cta: { label: "Recover my wallet", url: `${site}/yebente?recover=${token}` } });
  }
  return { sent: true };
}

export async function finishEmailRecovery({ token, pin }) {
  choosePin(pin);
  const key = `ywrt:${sha(token)}`;
  return withLedger(async () => {
    const rec = await getJSON(key);
    if (!rec || Date.parse(rec.expiresAt) < Date.now()) throw err("This recovery link has expired or was already used. Ask for a new one.", 410);
    await deleteKeys([key]); // one use
    const w = await getJSON(`yw:${rec.walletId}`);
    // Every other device is signed out.
    await deleteKeys((w.tokens || []).map((t) => `yw:t:${t}`));
    const fresh = crypto.randomBytes(24).toString("base64url");
    w.tokens = [sha(fresh)];
    w.passkeys = []; // the lost phone's fingerprint key goes too
    w.pin = pinHash(pin);
    w.failedPins = 0; w.lockedUntil = null;
    w.holdUntil = new Date(Date.now() + 24 * 3600e3).toISOString();
    w.recoveredAt = now();
    await setJSON(`yw:${w.id}`, w);
    await setJSON(`yw:t:${sha(fresh)}`, w.id);
    return { w, token: fresh };
  }).then(async ({ w, token: t }) => {
    if (w.email) await mail({ to: w.email, subject: `Your Ye₿ente wallet ${w.handle} was recovered`,
      text: `Hi,\n\nYour wallet ${w.handle}@${DOMAIN()} was just recovered on a new device with your email, and a new PIN was set. Your other devices were signed out.\n\nIf this wasn't you, reply to this email straight away.` }).catch(() => {});
    return { wallet: publicWallet(w), token: t };
  });
}

export const _internal = { withLedger, checkPin, spendable, record, sha, publicWallet };

// ---- fingerprint / face approval (WebAuthn passkeys kept on the phone)
// The phone signs a one-time challenge after the owner's fingerprint or face;
// the server checks that signature with the key saved when it was turned on
// (with the PIN). Nothing biometric ever leaves the phone.
class PasskeyPass { constructor(walletId) { this.walletId = walletId; this.used = false; } }
const RP_ID = () => DOMAIN().replace(/:\d+$/, "");
const ORIGIN = () => `https://${DOMAIN()}`;
const unb64u = (s) => Buffer.from(String(s || ""), "base64url");
const PASSKEY_ALGS = new Set([-7, -8, -257]); // ES256, Ed25519, RS256

export async function passkeyOptions(w) {
  const challenge = crypto.randomBytes(32).toString("base64url");
  await setJSON(`ywch:${w.id}`, { challenge, exp: Date.now() + 5 * 60e3 });
  return { challenge, rpId: RP_ID(), userId: Buffer.from(w.id).toString("base64url"), userName: `${w.handle}@${DOMAIN()}`, credentials: (w.passkeys || []).map((p) => p.id) };
}

async function takeChallenge(w) {
  const c = await getJSON(`ywch:${w.id}`);
  await deleteKeys([`ywch:${w.id}`]);
  if (!c || c.exp < Date.now()) throw err("The fingerprint request expired. Try again.");
  return c.challenge;
}

function checkClientData(b64, type, challenge) {
  let c;
  try { c = JSON.parse(unb64u(b64).toString("utf8")); } catch { c = null; }
  if (!c || c.type !== type || c.challenge !== challenge || c.origin !== ORIGIN()) throw err("The fingerprint check failed. Use the PIN.", 403);
}

export async function addPasskey(w, { pin, id, publicKey, alg, clientDataJSON }) {
  const challenge = await takeChallenge(w);
  checkClientData(clientDataJSON, "webauthn.create", challenge);
  alg = Number(alg);
  if (!PASSKEY_ALGS.has(alg) || !/^[\w-]{16,400}$/.test(String(id || ""))) throw err("This phone's fingerprint key isn't supported.");
  try { crypto.createPublicKey({ key: unb64u(publicKey), format: "der", type: "spki" }); } catch { throw err("This phone's fingerprint key isn't supported."); }
  return withLedger(async () => {
    const cur = await getJSON(`yw:${w.id}`);
    await checkPin(cur, pin);
    cur.passkeys = [...(cur.passkeys || []).filter((p) => p.id !== id), { id, spki: String(publicKey), alg, count: 0, at: now() }].slice(-5);
    await setJSON(`yw:${cur.id}`, cur);
    warnOwner(cur, `Ye₿ente: fingerprint approval turned on for ${cur.handle}`,
      `Hi,\n\nFingerprint / face approval was turned on for ${cur.handle}@${DOMAIN()} on a device.\n\nWasn't you? Open Ye₿ente, Settings: turn it off with your PIN, and recover your wallet by email to sign other devices out.`);
    return { passkeys: cur.passkeys.length };
  });
}

export async function removePasskeys(w, pin) {
  return withLedger(async () => {
    const cur = await getJSON(`yw:${w.id}`);
    await checkPin(cur, pin);
    cur.passkeys = [];
    await setJSON(`yw:${cur.id}`, cur);
    return { passkeys: 0 };
  });
}

// Checks a signed approval from the phone; the result stands in for the PIN once.
export async function passkeyPass(w, a) {
  const challenge = await takeChallenge(w);
  const pk = (w.passkeys || []).find((p) => p.id === a?.id);
  if (!pk) throw err("Fingerprint isn't set up for this wallet on this phone. Use the PIN.", 403);
  checkClientData(a.clientDataJSON, "webauthn.get", challenge);
  const auth = unb64u(a.authenticatorData);
  const rpHash = crypto.createHash("sha256").update(RP_ID()).digest();
  // Flags: 0x01 the owner was present, 0x04 the owner was verified (fingerprint, face or phone lock).
  if (auth.length < 37 || !auth.subarray(0, 32).equals(rpHash) || !(auth[32] & 0x01) || !(auth[32] & 0x04)) throw err("The fingerprint check failed. Use the PIN.", 403);
  const signed = Buffer.concat([auth, crypto.createHash("sha256").update(unb64u(a.clientDataJSON)).digest()]);
  let ok = false;
  try { ok = crypto.verify(pk.alg === -8 ? null : "sha256", signed, crypto.createPublicKey({ key: unb64u(pk.spki), format: "der", type: "spki" }), unb64u(a.signature)); } catch { ok = false; }
  if (!ok) throw err("The fingerprint check failed. Use the PIN.", 403);
  const count = auth.readUInt32BE(33);
  await withLedger(async () => {
    const cur = await getJSON(`yw:${w.id}`);
    const key = (cur.passkeys || []).find((p) => p.id === pk.id);
    // A counter that goes backwards means a copied key: refuse it.
    if (key && count && key.count && count <= key.count) throw err("The fingerprint check failed. Use the PIN.", 403);
    if (key && count) { key.count = count; await setJSON(`yw:${cur.id}`, cur); }
  });
  return new PasskeyPass(w.id);
}
