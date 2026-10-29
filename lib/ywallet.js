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
// Limits (environment, in sats): YEBENTE_MAX_BALANCE_SATS (default 200,000),
// YEBENTE_MAX_PAYMENT_SATS (100,000) and YEBENTE_DAILY_SEND_SATS (200,000).
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock } from "./store.js";

const num = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
export const limits = () => ({
  maxBalance: num("YEBENTE_MAX_BALANCE_SATS", 200_000),
  maxPayment: num("YEBENTE_MAX_PAYMENT_SATS", 100_000),
  dailySend: num("YEBENTE_DAILY_SEND_SATS", 200_000),
});
export const DOMAIN = () => (process.env.SITE_URL || "https://altradits.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString("base64url");
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])$/;
const RESERVED = new Set(["admin", "altradits", "stan", "stanley", "support", "hello", "finance", "pay", "wallet", "yebente", "root", "help", "info", "orders", "care"]);

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
export const publicWallet = (w) => ({ id: w.id, handle: w.handle, address: `${w.handle}@${DOMAIN()}`, balance: w.balance, createdAt: w.createdAt, limits: limits() });

async function record(walletId, entry) {
  const e = { id: newId(), walletId, at: now(), ...entry };
  await setJSON(`ywe:${e.id}`, e);
  await pushId(`ywtx:${walletId}`, e.id);
  return e;
}

export async function createWallet({ pin, handle }) {
  if (!/^\d{6}$/.test(String(pin || ""))) throw err("Choose a 6-digit PIN.");
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
    return { wallet: publicWallet(w), token, recovery: phrase };
  });
}

// A new device: the recovery phrase plus a new PIN gives a fresh device token.
export async function restoreWallet({ recovery, pin }) {
  if (!/^\d{6}$/.test(String(pin || ""))) throw err("Choose a 6-digit PIN.");
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

// Sats sent in the last 24 hours (for the daily cap).
async function sentToday(walletId) {
  const since = Date.now() - 864e5;
  return (await history(walletId, 200)).filter((e) => e.sats < 0 && e.status !== "failed" && Date.parse(e.at) >= since).reduce((t, e) => t - e.sats - (e.fee || 0), 0);
}

// Checks the PIN (inside the ledger lock): 5 wrong tries lock spending for 15 minutes.
async function checkPin(w, pin) {
  if (w.lockedUntil && Date.parse(w.lockedUntil) > Date.now()) throw err("Too many wrong PINs. Try again in 15 minutes.", 429);
  if (!pinOk(w, pin)) {
    w.failedPins = (w.failedPins || 0) + 1;
    if (w.failedPins >= 5) { w.lockedUntil = new Date(Date.now() + 15 * 60e3).toISOString(); w.failedPins = 0; }
    await setJSON(`yw:${w.id}`, w);
    throw err("Wrong PIN.", 403);
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

export const _internal = { withLedger, checkPin, spendable, record, sha, publicWallet };
