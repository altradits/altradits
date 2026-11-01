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
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock, deleteKeys, hit } from "./store.js";
import { publicFetch } from "./netsafe.js";
import { deadmanActive } from "./deadman.js";

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
// No amount can exceed every bitcoin that will ever exist (the 2010 value-overflow bug created 184 billion BTC by skipping this check).
const MAX_MONEY = 2_100_000_000_000_000;
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

export async function createWallet({ pin, handle, email, site, device }) {
  if (!walletsOn()) throw err("Ye₿ente wallets are not open yet.", 501);
  choosePin(pin);
  let h = String(handle || "").toLowerCase().trim();
  if (h && (!HANDLE_RE.test(h) || RESERVED.has(h))) throw err("Handle: 3 to 20 letters, digits, dot, dash or underscore.");
  return withLedger(async () => {
    if (h && (await getJSON(`yw:h:${h}`))) throw err("That handle is taken.", 409);
    if (!h) do { h = `${WORDS[crypto.randomInt(256)]}${crypto.randomInt(1000, 9999)}`; } while (await getJSON(`yw:h:${h}`));
    const id = newId(), phrase = recoveryPhrase();
    const w = { id, handle: h, pin: pinHash(pin), tokens: [], recovery: sha(phrase), balance: 0, createdAt: now(), failedPins: 0, lockedUntil: null, epoch: 0, devices: [] };
    // This phone's device key (new app), or an old-style token (an app from before device keys).
    const access = await openOn(w, device);
    logEvent(w, "created", "Wallet created.");
    await setJSON(`yw:${id}`, w);
    await setJSON(`yw:h:${h}`, id);
    await setJSON(`yw:r:${w.recovery}`, id);
    await pushId("ywallets", id);
    return { w, access: await access.finish(), recovery: phrase };
  }).then(async ({ w, access, recovery }) => {
    // An optional recovery email: confirmed by a link before it counts.
    if (email) await setEmail(w, email, site).catch(() => {});
    return { wallet: publicWallet((await getJSON(`yw:${w.id}`)) || w), ...access, recovery };
  });
}

// Lost phone, no email: the recovery words plus a NEW PIN. A PIN reset signs every
// other phone out and starts the 24-hour hold, exactly like email recovery.
export async function restoreWallet({ recovery, pin, device }) {
  choosePin(pin);
  if (device) deviceKey(device);
  const id = await getJSON(`yw:r:${sha(normPhrase(recovery))}`);
  if (!id) throw err("Those recovery words don't match a wallet.", 404);
  return withLedger(async () => {
    const w = await getJSON(`yw:${id}`);
    await resetPin(w, pin, "Recovered with the recovery words: new PIN, other phones signed out, 24-hour hold.");
    const access = await openOn(w, device);
    await setJSON(`yw:${id}`, w);
    const hold = num("YEBENTE_RECOVERY_HOLD_SATS", 1_000).toLocaleString("en-US");
    warnOwner(w, "Ye₿ente: your wallet was recovered with its recovery words",
      `Hi,\n\nYour Ye₿ente wallet was just opened on a new phone with its recovery words, and a new PIN was set. Your other phones were signed out, and for 24 hours at most ${hold} sats in total can be sent.\n\nWasn't you? Someone has your recovery words: recover the wallet with this email straight away, then move your sats to a new wallet.`);
    return { wallet: publicWallet(w), ...(await access.finish()) };
  });
}

export async function walletForToken(token) {
  if (!token || token.length < 20) return null;
  const h = sha(token);
  const ses = await getJSON(`yws:${h}`);
  if (ses) {
    const w = await getJSON(`yw:${ses.walletId}`), t = Date.now();
    if (!w || t > ses.exp || t - ses.last > SESSION_IDLE || (w.epoch || 0) !== ses.epoch || !(w.devices || []).some((d) => d.id === ses.deviceId)) {
      await deleteKeys([`yws:${h}`]);
      return null;
    }
    if (t - ses.last > 60e3) await setJSON(`yws:${h}`, { ...ses, last: t });
    SESSIONS.set(w, { deviceId: ses.deviceId, hash: h });
    return w;
  }
  // Old-style device tokens (apps from before device keys) work until that phone moves to a device key.
  const id = await getJSON(`yw:t:${h}`);
  const w = id && (await getJSON(`yw:${id}`));
  if (!(w && w.tokens?.includes(h))) return null;
  SESSIONS.set(w, { legacy: h });
  return w;
}
export const sessionOf = (w) => SESSIONS.get(w) || null;
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
      logEvent(w, "locked", `5 wrong PINs: locked for ${waitText(w.lockedUntil)}.`);
      import("./attacks.js").then((a) => a.recordAttack("pin_guessing", { where: `wallet ${w.handle}`, detail: `locked for ${waitText(w.lockedUntil)}` })).catch(() => {});
      warnOwner(w, "Ye₿ente: wallet locked after wrong PINs",
        `Hi,\n\nSomeone entered the wrong PIN for your Ye₿ente wallet 5 times, so it is locked for ${waitText(w.lockedUntil)}. Your sats are safe.\n\nWasn't you? Someone has your phone. From another phone, log in with your email and remove the lost phone in Settings.`);
    }
    await setJSON(`yw:${w.id}`, w);
    throw err(lockedNow(w) ? `Wrong PIN. Payments are locked for ${waitText(w.lockedUntil)}.` : "Wrong PIN.", 403);
  }
  if (w.failedPins) { w.failedPins = 0; await setJSON(`yw:${w.id}`, w); }
}

// Debit checks shared by every spend: positive whole sats, caps, balance.
async function spendable(w, sats, fee = 0) {
  const L = limits();
  if (!Number.isSafeInteger(sats) || sats <= 0 || sats > MAX_MONEY) throw err("Enter a whole number of sats.");
  if (!Number.isSafeInteger(w.balance) || w.balance < 0 || w.balance > MAX_MONEY) throw err("This wallet needs checking. Please contact support.", 409); // a corrupted balance never pays out
  if (sats > L.maxPayment) throw err(`The most per payment is ${L.maxPayment.toLocaleString("en-US")} sats.`);
  if ((await sentToday(w.id)) + sats + fee > L.dailySend) throw err(`The daily sending limit is ${L.dailySend.toLocaleString("en-US")} sats.`);
  if (w.balance < sats + fee) throw err("Insufficient balance.", 402);
  // After a PIN reset (email or recovery words), at most YEBENTE_RECOVERY_HOLD_SATS
  // leave in TOTAL for 24 hours: a stolen email or phrase can't empty the wallet,
  // not even with many small payments.
  const hold = num("YEBENTE_RECOVERY_HOLD_SATS", 1_000);
  if (w.holdUntil && Date.parse(w.holdUntil) > Date.now()) {
    const since = Date.parse(w.recoveredAt || 0);
    const spent = (await lastDay(w.id)).filter((e) => e.sats < 0 && e.status !== "failed" && Date.parse(e.at) >= since).reduce((t, e) => t - e.sats + (e.fee || 0), 0);
    if (spent + sats + fee > hold)
      throw err(`This wallet was recovered recently: until ${new Date(w.holdUntil).toUTCString().slice(5, 22)} UTC, at most ${hold.toLocaleString("en-US")} sats in total can be sent (${Math.max(0, hold - spent).toLocaleString("en-US")} left).`, 423);
  }
}

// Wallet to wallet inside Ye₿ente: instant and free.
export async function transfer({ from, toHandle, sats, pin, note = "" }) {
  sats = Number(sats);
  return withLedger(async () => {
    const w = await getJSON(`yw:${from.id}`);
    await checkPin(w, pin);
    if (deadmanActive()) throw err("Ye₿ente outbound payments and transfers are temporarily paused for a security check. Your sats are safe.", 503);
    const to = await walletByHandle(toHandle);
    if (!to) throw err("No Ye₿ente wallet has that handle.", 404);
    if (to.id === w.id) throw err("That's your own wallet.");
    await spendable(w, sats);
    if (to.balance + sats > limits().maxBalance) throw err("This payment can't be delivered to that wallet right now."); // never says why: no probing other balances
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
  if (!Number.isSafeInteger(sats) || sats > MAX_MONEY) throw err("That amount isn't possible."); // 2010 overflow lesson
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
  const sats = ws.reduce((t, w) => t + (w.balance || 0), 0);
  return { wallets: ws.length, sats, sane: Number.isSafeInteger(sats) && sats >= 0 && sats <= MAX_MONEY && ws.every((w) => Number.isSafeInteger(w.balance || 0) && (w.balance || 0) >= 0) };
}

// ---- receiving: invoices on the Altradits node, credited once when settled

// An invoice for a wallet (the app's Receive, or the handle's Lightning address).
export async function invoiceFor(wallet, sats, { memo, descriptionHash, expiry = 3600, via } = {}) {
  sats = Number(sats);
  const L = limits();
  if (!Number.isInteger(sats) || sats <= 0) throw err("Enter a whole number of sats.");
  if (sats > L.maxPayment) throw err(`The most per payment is ${L.maxPayment.toLocaleString("en-US")} sats.`);
  if (wallet.balance + (await incoming(wallet.id)) + sats > L.maxBalance) throw err("This would take the wallet over its limit.");
  const { createInvoice } = await import("./lightning.js");
  // A generic memo: the invoice a payer sees never names the wallet.
  const make = () => createInvoice({ sats, memo: memo || "Ye₿ente payment", descriptionHash, nodeOnly: true, expiry });
  // The node sits behind a tunnel: one retry rides out a dropped connection.
  const inv = await make().catch(() => new Promise((r) => setTimeout(r, 1500)).then(make)).catch((e) => {
    console.error("yebente invoice:", e.message);
    throw err("The Lightning node isn't answering right now. Try again in a minute.", 503);
  });
  await setJSON(`ywinv:${inv.paymentHash}`, { walletId: wallet.id, sats, at: now(), expiresAt: inv.expiresAt, state: "open", ...(via ? { via } : {}) });
  await pushId("ywinvopen", inv.paymentHash);
  return { invoice: inv.bolt11, paymentHash: inv.paymentHash, satsAmount: sats, expiresAt: inv.expiresAt };
}

// Sats that may still arrive: the owner's open, unexpired invoices and pending buys.
// They count against the balance limit, so several invoices can't pass it together.
// Invoices handed out by the public Lightning address don't count: otherwise anyone
// could block a wallet from receiving just by asking for invoices.
export async function incoming(walletId) {
  const now = Date.now();
  const inv = (await getMany("ywinv", await listIds("ywinvopen", 500))).filter((i) => i.walletId === walletId && i.state === "open" && i.via !== "lnurl" && Date.parse(i.expiresAt) > now);
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
  const { bolt11Msats, bolt11PaymentHash, bolt11DescriptionHash } = await import("./lightning.js");
  const { safeUrl } = await import("./netsafe.js");
  const getJson = async (u) => {
    // A Send Mobile partner whose option is switched off (lib/rails.js) is never paid or even asked.
    const { railHostOff } = await import("./rails.js");
    if (railHostOff(new URL(u).hostname)) throw err("Payments to that mobile-money service aren't switched on yet.", 403);
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
  if (bolt11Msats(pr) !== msats) {
    import("./attacks.js").then((a) => a.recordAttack("invoice_substitution", { where: cb.hostname, detail: `asked ${msats} msat, got ${bolt11Msats(pr)}` })).catch(() => {});
    throw err("The address returned an invoice for a different amount.");
  }
  // An invoice that commits to a description must commit to this address's metadata (LUD-06).
  const dh = bolt11DescriptionHash(pr);
  if (dh && typeof pay.metadata === "string" && dh !== crypto.createHash("sha256").update(pay.metadata).digest("hex")) {
    import("./attacks.js").then((a) => a.recordAttack("invoice_substitution", { where: cb.hostname, detail: "description hash doesn't match the address's metadata" })).catch(() => {});
    throw err("The address returned an invoice for something else.");
  }
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
  if (deadmanActive()) throw err("Ye₿ente outbound payments and transfers are temporarily paused for a security check. Your sats are safe.", 503);
  const { canPay, payInvoice, outboundSats } = await import("./lightning.js");
  if (!canPay()) throw err("Sending to other Lightning wallets isn't switched on yet.", 501);
  const fee = feeReserve(dest.sats);
  // Before anything is taken: can the node send this at all? (Its channels' reserves can never be spent.)
  const canSend = await outboundSats();
  if (canSend !== null && canSend < dest.sats + fee) {
    import("./attacks.js").then((a) => a.checkSolvency()).catch(() => {});
    throw err(canSend < 1000 ? "Sending out of Ye₿ente is paused: the node needs more Lightning balance. Your sats are safe; payments to other Ye₿ente wallets still work." : `The node can send up to ${Math.max(0, canSend - feeReserve(canSend)).toLocaleString("en-US")} sats right now. Try a smaller amount.`, 503);
  }
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
  if (deadmanActive()) throw err("Buying sats is temporarily paused for a security check. Your sats are safe.", 503);
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
  if (deadmanActive()) throw err("Buying sats is temporarily paused for a security check. Your sats are safe.", 503);
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
// Wallet mail goes to its owner only (no copies, links never logged: kind "wallet") and
// never names the handle or an amount: a mail scanner must not be able to tie this
// address to a public Lightning address, or learn what the wallet holds.
const mail = async (args) => (await import("./email.js")).sendEmail({ kind: "wallet", dept: "tech", ...args });

// Sets (or changes) the recovery email: pending until the link in the email is opened.
export async function setEmail(w, email, site) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 200) throw err("Please check the email address.");
  const token = crypto.randomBytes(24).toString("base64url");
  await setJSON(`ywec:${sha(token)}`, { walletId: w.id, email: e, expiresAt: new Date(Date.now() + 48 * 3600e3).toISOString() });
  const fresh = await getJSON(`yw:${w.id}`);
  if (fresh.holdUntil && Date.parse(fresh.holdUntil) > Date.now()) throw err("The email can't change during the 24 hours after a recovery.", 423);
  if (fresh.email && fresh.email !== e) mail({ to: fresh.email, subject: "Ye₿ente: someone asked to change your email",
    text: "Hi,\n\nSomeone with your phone and PIN asked to replace this email on your Ye₿ente wallet. Nothing changes unless the new address is confirmed.\n\nWasn't you? Open Ye₿ente, Settings: remove any phone you don't recognise." }).catch(() => {});
  logEvent(fresh, "email", "A new email was requested (not yet confirmed).");
  await setJSON(`yw:${w.id}`, { ...fresh, emailPending: e });
  await mail({ to: e, subject: "Confirm your Ye₿ente email",
    text: "Hi,\n\nConfirm this address so you can log in to your Ye₿ente wallet on a new phone, or recover it if you lose yours. The link works for 48 hours.\n\nDidn't ask for this? Ignore this email.",
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
  logEvent(w, "email", "Email confirmed.");
  await setJSON(`yw:${w.id}`, { ...w, email: rec.email, emailPending: null, emailConfirmedAt: now() });
  await deleteKeys([key]);
  return true;
}

// Sends a one-time recovery link for every wallet confirmed with this email.
// Always answers the same, without waiting on the mail, so neither the reply nor its
// timing tells anyone whether an email has a wallet. The link's key travels after "#",
// so it never reaches any server log.
export async function requestEmailRecovery(email, site) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw err("Please check the email address.");
  const ws = (await getMany("yw", (await getJSON(`yw:e:${sha(e)}`)) || [])).filter((w) => w.email === e);
  const hold = num("YEBENTE_RECOVERY_HOLD_SATS", 1_000).toLocaleString("en-US");
  for (const w of ws) {
    const token = crypto.randomBytes(24).toString("base64url");
    await setJSON(`ywrt:${sha(token)}`, { walletId: w.id, expiresAt: new Date(Date.now() + 30 * 60e3).toISOString() });
    mail({ to: e, subject: "Recover your Ye₿ente wallet",
      text: `Hi,\n\nOpen this link on your new phone to recover your Ye₿ente wallet and choose a new PIN. It works once, for 30 minutes. Your other phones will be signed out, and for 24 hours at most ${hold} sats in total can be sent.\n\nForgot only your PIN? This is the way back. Just want to use a new phone and still know your PIN? Choose "Log in" in the app instead: nothing gets reset.\n\nDidn't ask for this? Ignore this email: nothing changes.`,
      cta: { label: "Recover my wallet", url: `${site}/yebente#recover=${token}` } }).catch(() => {});
  }
  return { sent: true };
}

export async function finishEmailRecovery({ token, pin, device }) {
  choosePin(pin);
  if (device) deviceKey(device);
  const key = `ywrt:${sha(token)}`;
  return withLedger(async () => {
    const rec = await getJSON(key);
    if (!rec || Date.parse(rec.expiresAt) < Date.now()) throw err("This recovery link has expired or was already used. Ask for a new one.", 410);
    await deleteKeys([key]); // one use
    const w = await getJSON(`yw:${rec.walletId}`);
    await resetPin(w, pin, "Recovered by email: new PIN, other phones signed out, 24-hour hold.");
    const access = await openOn(w, device);
    await setJSON(`yw:${w.id}`, w);
    return { w, access: await access.finish() };
  }).then(async ({ w, access }) => {
    if (w.email) mail({ to: w.email, subject: "Your Ye₿ente wallet was recovered",
      text: "Hi,\n\nYour Ye₿ente wallet was just recovered on a new phone with this email, and a new PIN was set. Your other phones were signed out.\n\nIf this wasn't you, reply to this email straight away." }).catch(() => {});
    return { wallet: publicWallet(w), ...access };
  });
}

// ---- staying signed in on your own phone, safely
// Each phone that opens a wallet keeps a device key its browser can't export
// (WebCrypto ECDSA P-256 in IndexedDB); the server keeps only the public half.
// A session lasts 15 minutes of use (12 hours at most) and only while that phone
// is still on the wallet. Reopening the app needs the PIN (or fingerprint) AND the
// device key's signature over a one-time, 60-second challenge, so a copied token
// or a guessed PIN alone gets nowhere. Logging out only locks: the phone stays
// trusted. (Whitepaper section 2: what you own is proven by a signature.)
const SESSION_IDLE = 15 * 60e3, SESSION_MAX = 12 * 3600e3, MAX_DEVICES = 5;
const SESSIONS = new WeakMap(); // the wallet object loaded for a request -> its session
const DEVICE_ID = /^[\w-]{8,40}$/;

function deviceKey(spki) {
  let key;
  try { key = crypto.createPublicKey({ key: unb64u(spki), format: "der", type: "spki" }); } catch { throw err("This phone's security key isn't supported. Update your browser."); }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw err("This phone's security key isn't supported. Update your browser.");
  return key;
}
// The owner's own security log (Settings): logins, phones, lock-outs, recoveries, email changes.
const logEvent = (w, kind, text) => { w.log = [{ at: now(), kind, text }, ...(w.log || [])].slice(0, 50); };

async function addDevice(w, spki) {
  deviceKey(spki);
  const id = newId(), devices = [...(w.devices || []), { id, spki: String(spki), at: now(), lastSeen: now() }];
  const dropped = devices.length > MAX_DEVICES ? devices.splice(0, devices.length - MAX_DEVICES) : [];
  w.devices = devices;
  await setJSON(`ywd:${id}`, w.id);
  if (dropped.length) await deleteKeys(dropped.map((d) => `ywd:${d.id}`));
  return id;
}
async function newSession(w, deviceId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await setJSON(`yws:${sha(token)}`, { walletId: w.id, deviceId, epoch: w.epoch || 0, exp: Date.now() + SESSION_MAX, last: Date.now() });
  return token;
}
// Access for the phone opening the wallet: a device key and session (this app), or an
// old-style token (an app from before device keys). finish() runs once the wallet is saved.
async function openOn(w, device) {
  if (device) {
    const deviceId = await addDevice(w, device);
    return { finish: async () => ({ session: await newSession(w, deviceId), deviceId }) };
  }
  const token = crypto.randomBytes(24).toString("base64url");
  w.tokens = [...(w.tokens || []).slice(-4), sha(token)];
  return { finish: async () => { await setJSON(`yw:t:${sha(token)}`, w.id); return { token }; } };
}
// A PIN reset (email or recovery words): every phone, session, old token and fingerprint
// key goes, and for 24 hours only YEBENTE_RECOVERY_HOLD_SATS can leave in total.
async function resetPin(w, pin, why) {
  await deleteKeys([...(w.tokens || []).map((t) => `yw:t:${t}`), ...(w.devices || []).map((d) => `ywd:${d.id}`)]);
  w.tokens = []; w.devices = []; w.passkeys = [];
  w.epoch = (w.epoch || 0) + 1; // every session ends
  w.pin = pinHash(pin);
  w.failedPins = 0; w.lockedUntil = null;
  w.holdUntil = new Date(Date.now() + 24 * 3600e3).toISOString();
  w.recoveredAt = now();
  logEvent(w, "recovered", why);
}

// Unlock on a phone this wallet already trusts: a one-time challenge for its device key.
export async function unlockOptions(deviceId) {
  const walletId = DEVICE_ID.test(String(deviceId)) && (await getJSON(`ywd:${deviceId}`));
  const w = walletId && (await getJSON(`yw:${walletId}`));
  if (!w || !(w.devices || []).some((d) => d.id === deviceId)) throw err("This phone isn't signed in any more. Log in again.", 404);
  const challenge = crypto.randomBytes(32).toString("base64url");
  await setJSON(`ywuc:${deviceId}`, { challenge, exp: Date.now() + 60e3 });
  return { challenge, rpId: RP_ID(), credentials: (w.passkeys || []).map((p) => p.id) };
}
export const unlockMessage = (deviceId, challenge) => `yebente-unlock:${deviceId}:${challenge}`;

export async function unlock({ deviceId, signature, pin, passkey }) {
  const walletId = DEVICE_ID.test(String(deviceId)) && (await getJSON(`ywd:${deviceId}`));
  const c = walletId && (await getJSON(`ywuc:${deviceId}`));
  if (c) await deleteKeys([`ywuc:${deviceId}`]); // one use, whatever happens next
  if (!c || c.exp < Date.now()) throw err("That took too long. Try again.", 400);
  const w0 = await getJSON(`yw:${walletId}`), d0 = (w0?.devices || []).find((x) => x.id === deviceId);
  if (!d0) throw err("This phone isn't signed in any more. Log in again.", 404);
  let ok = false;
  try { ok = crypto.verify("sha256", Buffer.from(unlockMessage(deviceId, c.challenge)), { key: deviceKey(d0.spki), dsaEncoding: "ieee-p1363" }, unb64u(signature)); } catch { ok = false; }
  if (!ok) {
    import("./attacks.js").then((a) => a.recordAttack("passkey_forgery", { where: "wallet unlock", detail: "device signature didn't match" })).catch(() => {});
    throw err("This phone's security key didn't match. Log in again.", 403);
  }
  if (passkey) await checkPasskey(w0, passkey, c.challenge); // fingerprint instead of the PIN
  return withLedger(async () => {
    const w = await getJSON(`yw:${walletId}`), d = (w.devices || []).find((x) => x.id === deviceId);
    if (!d) throw err("This phone isn't signed in any more. Log in again.", 404);
    if (!passkey) await checkPin(w, pin); // the usual lock-outs apply
    d.lastSeen = now();
    await setJSON(`yw:${w.id}`, w);
    return { wallet: publicWallet(w), session: await newSession(w, d.id) };
  });
}

// An app from before device keys: its old token plus the PIN moves this phone to a device key.
export async function moveToDeviceKey(w, legacyHash, { pin, device }) {
  deviceKey(device);
  return withLedger(async () => {
    const cur = await getJSON(`yw:${w.id}`);
    if (!(cur.tokens || []).includes(legacyHash)) throw err("Log in again.", 401);
    await checkPin(cur, pin);
    const deviceId = await addDevice(cur, device);
    cur.tokens = cur.tokens.filter((t) => t !== legacyHash);
    await deleteKeys([`yw:t:${legacyHash}`]);
    logEvent(cur, "device", "This phone now stays signed in with its own security key.");
    await setJSON(`yw:${cur.id}`, cur);
    return { wallet: publicWallet(cur), session: await newSession(cur, deviceId), deviceId };
  });
}

export const lockSession = (hash) => deleteKeys([`yws:${hash}`]);

export async function removeDevice(w, deviceId, pin, currentDeviceId) {
  return withLedger(async () => {
    const cur = await getJSON(`yw:${w.id}`);
    await checkPin(cur, pin);
    if (!(cur.devices || []).some((d) => d.id === deviceId)) throw err("That phone isn't on this wallet.", 404);
    cur.devices = cur.devices.filter((d) => d.id !== deviceId);
    await deleteKeys([`ywd:${deviceId}`]);
    logEvent(cur, "device_removed", deviceId === currentDeviceId ? "This phone was removed." : "Another phone was removed.");
    await setJSON(`yw:${cur.id}`, cur);
    return { devices: cur.devices.length };
  });
}

export const securityInfo = (w, currentDeviceId) => ({
  devices: (w.devices || []).map(({ id, at, lastSeen }) => ({ id, at, lastSeen, current: id === currentDeviceId })),
  olderDevices: (w.tokens || []).length, log: w.log || [],
});

// ---- logging in on a new phone: a one-time code by email FIRST, then the current PIN.
// The PIN is only checked once a valid code is presented, so nobody can guess PINs
// against the public Lightning handles; failures count against the code (3 tries),
// never against the owner, so a stranger can't lock anyone out. No PIN reset and no
// hold: whoever gets in holds both the email and the PIN.
export async function startLogin(email) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw err("Please check the email address.");
  const ws = (await getMany("yw", (await getJSON(`yw:e:${sha(e)}`)) || [])).filter((w) => w.email === e);
  for (const w of ws) {
    if ((await hit(`rl:yb:lc:${w.id}`, 86400)) > 10) continue; // at most 10 codes a day per wallet
    const code = String(crypto.randomInt(10_000_000, 100_000_000));
    await setJSON(`ywlc:${sha(`${e}|${code}`)}`, { walletId: w.id, exp: Date.now() + 10 * 60e3, tries: 0 });
    mail({ to: e, subject: "Your Ye₿ente login code",
      text: `Hi,\n\nYour Ye₿ente login code is ${code}. Enter it with your PIN on the new phone. It works once, for 10 minutes.\n\nDidn't ask for this? Ignore this email: nobody can log in without your PIN as well.` }).catch(() => {});
  }
  return { sent: true };
}

export async function finishLogin({ email, code, pin, device }) {
  deviceKey(device);
  const key = `ywlc:${sha(`${normEmail(email)}|${String(code || "").replace(/\D/g, "")}`)}`;
  const rec = await getJSON(key);
  if (!rec || rec.exp < Date.now()) throw err("That code is wrong or has expired. Ask for a new one.", 400);
  return withLedger(async () => {
    const w = await getJSON(`yw:${rec.walletId}`);
    if (!w || !pinOk(w, pin)) {
      rec.tries += 1;
      if (rec.tries >= 3) await deleteKeys([key]); else await setJSON(key, rec);
      import("./attacks.js").then((a) => a.recordAttack("pin_guessing", { where: "new-phone login", detail: `wrong PIN with a valid code (${rec.tries} of 3)` })).catch(() => {});
      throw err(rec.tries >= 3 ? "Wrong PIN. That code no longer works; ask for a new one." : "Wrong PIN.", 403);
    }
    await deleteKeys([key]); // one use
    const deviceId = await addDevice(w, device);
    logEvent(w, "login", "Logged in on a new phone with an email code and the PIN.");
    await setJSON(`yw:${w.id}`, w);
    warnOwner(w, "Ye₿ente: a new phone logged in",
      "Hi,\n\nA new phone just logged in to your Ye₿ente wallet with a code from this email and your PIN.\n\nWasn't you? On your own phone, open Settings and remove the phone you don't recognise.");
    return { wallet: publicWallet(w), session: await newSession(w, deviceId), deviceId };
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
    warnOwner(cur, "Ye₿ente: fingerprint approval turned on",
      "Hi,\n\nFingerprint / face approval was just turned on for your Ye₿ente wallet on a phone.\n\nWasn't you? Open Ye₿ente, Settings: turn it off with your PIN, and remove any phone you don't recognise.");
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
// A failed signature, origin or counter check is recorded for the Security watch.
export async function passkeyPass(w, a) {
  try { return await checkPasskey(w, a, await takeChallenge(w)); } catch (e) {
    if (e.status === 403 && /fingerprint check failed/.test(e.message)) import("./attacks.js").then((m) => m.recordAttack("passkey_forgery", { where: `wallet ${w.handle}` })).catch(() => {});
    throw e;
  }
}
async function checkPasskey(w, a, challenge) {
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
