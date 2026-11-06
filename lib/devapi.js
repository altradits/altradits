// Altradits Developer API (issue #421): other Bitcoin developers power their
// apps with Altradits' infrastructure: LNURL-pay fronts, exact-amount invoice
// checks, settlement verification, receipts and webhooks.
//
// Custody boundary (hard): a developer's customers pay straight to the
// developer's OWN Lightning address or node. Altradits fetches the invoice
// from their address, checks it, and tracks settlement, but customer money
// never touches Altradits: no receiving, no holding, no forwarding, no cut
// taken in flight. The 0.5% is a service charge to the developer, prepaid in
// sats to Stanley's node as a fee balance (PR3).
//
//   dev:acct:<id>      account { id, email, createdAt, verifiedAt, suspended }
//   dev:email:<sha>    account id
//   dev:code:<sha>     email code { exp } (single use, 10 minutes)
//   dev:sess:<sha>     dashboard session { accountId, exp }
//   dev:key:<sha>      API key { id, accountId, prefix, name, scopes, sandbox, createdAt, revokedAt, lastUsedAt }
//   dev:keys:<acctId>  list of key ids (dev:keyid:<id> -> sha, for lookup by id)
//   dev:keyid:<id>     key sha (so rotate/revoke name the key, never the secret)
//   dev:dest:<id>      destination { id, accountId, address, sandbox, verified, verifiedAt, challenge, createdAt }
//   dev:dests:<acctId> list of destination ids
//
// Switched on with DEVAPI=on (default off; health always answers). Sandbox
// keys and sandbox destinations work under DEVAPI_SANDBOX=on, which may be on
// while mainnet is off. A key's environment is fixed by its prefix
// (ak_live_ / ak_test_): a test key can never touch mainnet, whatever the
// caller asks for.
//
// The site's LND key stays receive-only: the only node calls here are
// creating a 1-sat ownership-challenge invoice and reading its settlement.
// The admin macaroon is never read.
import crypto from "node:crypto";
import net from "node:net";
import { getJSON, setJSON, pushId, listIds, getMany, hit } from "./store.js";
import { publicFetch } from "./netsafe.js";
import { oneLine, clean, EMAIL_RE, emailTypo, typoMessage } from "./http.js";
import { switchOn } from "./ywallet.js";
import { parseLnAddress } from "./lnaddr.js";
import { bolt11Msats, bolt11PaymentHash, bolt11DescriptionHash } from "./lightning.js";

export const devapiOn = () => switchOn("DEVAPI");
export const devSandboxOn = () => switchOn("DEVAPI_SANDBOX");
export const SCOPES = ["invoices:create", "invoices:read", "webhooks"];
// What an ownership challenge proves, honestly: the registrant paid a 1-sat
// invoice we issued (control of a funded Lightning wallet), the address
// resolves over LNURL-pay, and its metadata names the same address. Lightning
// payments carry no sender identity, so this binds the address to someone who
// paid, not cryptographically to the wallet behind the address. The address's
// own operator remains the custodian of everything paid to it.
export const OWNERSHIP_PROOF = "pay-1-sat-challenge";

const err = (message, code = "bad_request", status = 400) => Object.assign(new Error(message), { code, status });
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString("base64url");
export const DEV_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export const LIVE_PREFIX = "ak_live_";
export const TEST_PREFIX = "ak_test_";

export const devApiOpen = () => devapiOn() || devSandboxOn();

// Seams for tests: the LNURL fetcher (fake destination servers) and the
// node invoicer (challenge invoices without a node).
let lnurlFetch = (u, o) => publicFetch(u, o);
export const setDevapiFetcher = (f) => { lnurlFetch = f || ((u, o) => publicFetch(u, o)); };
let invoicer = null;
export const setDevapiInvoicer = (f) => { invoicer = f || null; };
// A receive invoice from Stanley's node (receive-only key, nodeOnly: the sats
// must land on the node, never on a fallback). Used for 1-sat ownership
// challenges and for fee top-ups alike.
async function receiveInvoice(sats, memo) {
  if (invoicer?.create) return invoicer.create({ sats, memo });
  const { createInvoice } = await import("./lightning.js");
  return createInvoice({ sats, memo, expiry: 3600, nodeOnly: true });
}
async function receivePaid(inv) {
  if (invoicer?.paid) return invoicer.paid(inv);
  const { invoicePaid } = await import("./lightning.js");
  return invoicePaid(inv);
}

const normEmail = (v) => clean(v, 254).toLowerCase();

// ---- accounts: an email code verifies the address and creates the account.
// One step, so the signup never reveals whether an address is registered.
export async function requestAccountCode(email, { confirmTypo = false } = {}) {
  if (!devApiOpen()) throw err("The Developer API isn't open yet.", "api_off", 501);
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw err("Please check the email address.", "bad_email");
  const fix = emailTypo(e);
  if (fix && !confirmTypo) throw err(typoMessage(fix), "email_typo", 422);
  if ((await hit(`rl:dev:code:${sha(e)}`, 3600)) > 5) throw err("Too many codes. Try again in an hour.", "rate_limited", 429);
  const code = String(crypto.randomInt(10_000_000, 100_000_000));
  await setJSON(`dev:code:${sha(`${e}|${code}`)}`, { exp: Date.now() + 10 * 60e3 });
  const { sendEmail } = await import("./email.js");
  // The code is in the words (like a wallet login code): the mail log keeps
  // the row, and wallet-kind mail never logs its links.
  await sendEmail({ to: e, kind: "wallet",
    subject: "Your Altradits Developer code",
    text: `Hi,\n\nYour Altradits Developer code is ${code}. It works once, for 10 minutes.\n\nDidn't ask for this? Ignore this email.` });
  return { sent: true };
}

export function publicAccount(a) {
  return { id: a.id, email: a.email, createdAt: a.createdAt, verifiedAt: a.verifiedAt, suspended: Boolean(a.suspended) };
}

export async function verifyAccountCode(email, code) {
  if (!devApiOpen()) throw err("The Developer API isn't open yet.", "api_off", 501);
  const e = normEmail(email);
  // Guessing an 8-digit code is rate-limited per address, not per code: every
  // wrong guess counts, and the code itself stays single-use below.
  const attempts = await hit(`rl:dev:verify:${sha(e)}`, 3600);
  if (attempts > 10) {
    if (attempts === 11) import("./attacks.js").then((a) => a.recordAttack("dev_code_guessing", { where: "Developer signup" })).catch(() => {});
    throw err("Too many wrong tries. Ask for a new code in an hour.", "bad_code", 429);
  }
  const digits = String(code || "").replace(/\D/g, "");
  const key = `dev:code:${sha(`${e}|${digits}`)}`;
  const rec = await getJSON(key);
  if (!rec || rec.exp < Date.now()) throw err("That code is wrong or has expired. Ask for a new one.", "bad_code");
  const { deleteKeys } = await import("./store.js");
  await deleteKeys([key]); // single use
  let id = await getJSON(`dev:email:${sha(e)}`);
  let a = id && (await getJSON(`dev:acct:${id}`));
  if (!a) {
    id = newId();
    a = { id, email: e, createdAt: now(), verifiedAt: now(), suspended: false };
    await setJSON(`dev:acct:${id}`, a);
    await setJSON(`dev:email:${sha(e)}`, id);
    await pushId("dev:accounts", id);
  } else if (!a.verifiedAt) {
    a.verifiedAt = now();
    await setJSON(`dev:acct:${a.id}`, a);
  }
  if (a.suspended) throw err("This account is suspended.", "suspended", 403);
  const token = crypto.randomBytes(24).toString("base64url");
  await setJSON(`dev:sess:${sha(token)}`, { accountId: a.id, exp: Date.now() + 30 * 864e5 });
  return { account: publicAccount(a), session: token };
}

export async function accountForSession(token) {
  if (!token || token.length < 20 || String(token).startsWith("ak_")) return null;
  const ses = await getJSON(`dev:sess:${sha(token)}`);
  if (!ses || ses.exp < Date.now()) return null;
  const a = await getJSON(`dev:acct:${ses.accountId}`);
  return a && !a.suspended ? a : null;
}

// ---- API keys: shown once, stored hashed, scoped, environment-fixed.
export function publicKey(k) {
  return { id: k.id, prefix: k.prefix, name: k.name, scopes: k.scopes, sandbox: k.sandbox,
    createdAt: k.createdAt, revokedAt: k.revokedAt || null, lastUsedAt: k.lastUsedAt || null };
}

function checkedScopes(scopes) {
  const list = Array.isArray(scopes) && scopes.length ? scopes : [...SCOPES];
  for (const s of list) if (!SCOPES.includes(s)) throw err(`Unknown scope "${String(s).slice(0, 40)}". Scopes: ${SCOPES.join(", ")}.`, "bad_scope");
  return [...new Set(list)];
}

export async function createKey(accountId, { name, scopes, sandbox = false } = {}) {
  const a = await getJSON(`dev:acct:${accountId}`);
  if (!a || a.suspended) throw err("Sign in again.", "unauthorized", 401);
  if (sandbox && !devSandboxOn()) throw err("The sandbox isn't switched on.", "sandbox_off", 501);
  if (!sandbox && !devapiOn()) throw err("The Developer API isn't open yet.", "api_off", 501);
  if ((await hit(`rl:dev:key:${accountId}`, 86400)) > 20) throw err("Too many keys created today.", "rate_limited", 429);
  const cleanName = oneLine(name, 60) || "Unnamed key";
  const secret = (sandbox ? TEST_PREFIX : LIVE_PREFIX) + crypto.randomBytes(24).toString("base64url");
  const k = { id: newId(), accountId, prefix: secret.slice(0, 16), name: cleanName,
    scopes: checkedScopes(scopes), sandbox: Boolean(sandbox), createdAt: now(), revokedAt: null, lastUsedAt: null };
  await setJSON(`dev:key:${sha(secret)}`, k);
  await setJSON(`dev:keyid:${k.id}`, sha(secret));
  await pushId(`dev:keys:${accountId}`, k.id);
  return { key: secret, ...publicKey(k) };
}

export async function listKeys(accountId) {
  // Only the public halves: the secret half never leaves the store.
  const found = await Promise.all((await listIds(`dev:keys:${accountId}`, 200)).map(async (id) => {
    const h = await getJSON(`dev:keyid:${id}`);
    return h && (await getJSON(`dev:key:${h}`));
  }));
  return found.filter(Boolean).map(publicKey);
}

async function keyById(accountId, keyId) {
  if (!DEV_ID_RE.test(String(keyId || ""))) throw err("Unknown key.", "unknown_key", 404);
  const h = await getJSON(`dev:keyid:${keyId}`);
  const k = h && (await getJSON(`dev:key:${h}`));
  if (!k || k.accountId !== accountId) throw err("Unknown key.", "unknown_key", 404);
  return { key: k, hash: h };
}

export async function rotateKey(accountId, keyId) {
  const { key: k, hash } = await keyById(accountId, keyId);
  if (k.revokedAt) throw err("That key is already revoked.", "key_revoked", 410);
  k.revokedAt = now();
  await setJSON(`dev:key:${hash}`, k);
  return createKey(accountId, { name: k.name, scopes: k.scopes, sandbox: k.sandbox });
}

export async function revokeKey(accountId, keyId) {
  const { key: k, hash } = await keyById(accountId, keyId);
  if (!k.revokedAt) {
    k.revokedAt = now();
    await setJSON(`dev:key:${hash}`, k);
  }
  return { revoked: true };
}

// Authenticates an API key for one environment. The prefix fixes the key's
// environment: a test key authenticates only when the sandbox is on, a live
// key only when the API is on, so neither can ever cross to the other side.
export async function authKey(secret) {
  const s = String(secret || "");
  const sandbox = s.startsWith(TEST_PREFIX) ? true : s.startsWith(LIVE_PREFIX) ? false : null;
  if (sandbox === null || s.length < 40) throw err("Unknown API key.", "invalid_key", 401);
  if (sandbox && !devSandboxOn()) throw err("The sandbox isn't switched on.", "sandbox_off", 501);
  if (!sandbox && !devapiOn()) throw err("The Developer API isn't open yet.", "api_off", 501);
  const k = await getJSON(`dev:key:${sha(s)}`);
  if (!k || k.sandbox !== sandbox) throw err("Unknown API key.", "invalid_key", 401);
  if (k.revokedAt) throw err("That API key is revoked.", "key_revoked", 401);
  const a = await getJSON(`dev:acct:${k.accountId}`);
  if (!a || a.suspended) throw err("This account is suspended.", "suspended", 403);
  k.lastUsedAt = now();
  await setJSON(`dev:key:${sha(s)}`, k);
  return { key: k, account: a, sandbox };
}

export function requireScope(key, scope) {
  if (!key.scopes.includes(scope)) throw err(`This key needs the "${scope}" scope.`, "forbidden_scope", 403);
}

// ---- destinations: the developer's own Lightning address. Customer money
// goes straight there; Altradits only fronts it (LNURL proxy, checks, verify).
export function publicDestination(d) {
  return { id: d.id, address: d.address, sandbox: d.sandbox, verified: Boolean(d.verified),
    verifiedAt: d.verifiedAt || null, proof: d.verified ? (d.proof || OWNERSHIP_PROOF) : null, createdAt: d.createdAt };
}

// ---- sandbox simulator: a built-in destination for free testing.
//
// The sandbox only ever serves SANDBOX_ADDRESS, simulated in-process: no
// network, no node, no real money anywhere in the sandbox path. Registering
// any other address with sandbox=true is refused, and the simulator address
// can't be registered live, so test keys can never touch mainnet. Simulator
// invoices use signet encoding (lntb...): a real mainnet wallet refuses them,
// so a pasted test invoice can't move real money by accident.
//
//   dev:sim:<hash>  simulator invoice { hash, msats, settled, preimage }
export const SANDBOX_ADDRESS = "dev@sandbox.altradits.com";
export const SIMULATOR_PROOF = "sandbox-simulator";
const SIM_META = () => JSON.stringify([["text/plain", "Altradits sandbox simulator"], ["text/identifier", SANDBOX_ADDRESS]]);

const BECH32SIM = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function simInvoice(msats) {
  const hash = crypto.randomBytes(32).toString("hex");
  const dhash = sha(SIM_META());
  const words5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
  const words = [...Array(7).fill(0), 1, 1, 20, ...words5(hash), 23, 1, 20, ...words5(dhash), ...Array(20).fill(0)];
  return { hash, pr: `lntb${msats / 100}n1` + words.map((w) => BECH32SIM[w]).join("") + "qqqqqq" };
}

async function lnurlJson(url) {
  const r = await lnurlFetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, maxBytes: 65536 })
    .catch(() => { throw err("That Lightning address isn't reachable.", "address_unreachable", 502); });
  if (r.status >= 300 && r.status < 400) throw err("That Lightning address isn't reachable.", "address_unreachable", 502);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw err("That Lightning address isn't reachable.", "address_unreachable", 502);
  const d = await r.json().catch(() => null);
  if (!d || typeof d !== "object" || Array.isArray(d)) throw err("That Lightning address isn't reachable.", "address_unreachable", 502);
  return { ok: r.ok, body: d };
}

// Resolves the address and binds it: the metadata must name the same address,
// so a typo'd address can't be registered for someone else's wallet.
async function resolveDestination(address) {
  let parsed;
  try {
    parsed = parseLnAddress(address);
  } catch (e) {
    throw err("Enter a Lightning address like name@wallet.com.", "bad_address");
  }
  const canonical = `${parsed.user}@${parsed.domain}`;
  const { ok, body: pay } = await lnurlJson(`https://${parsed.domain}/.well-known/lnurlp/${encodeURIComponent(parsed.user)}`);
  if (!ok || pay.status === "ERROR") throw err(String(pay.reason || "That Lightning address isn't reachable.").slice(0, 200), "address_unreachable", 502);
  if (pay.tag !== "payRequest" || typeof pay.callback !== "string" || !pay.callback) throw err("That address isn't an LNURL-pay address.", "bad_address", 502);
  let cb;
  try { cb = new URL(pay.callback); } catch { cb = null; }
  // Plain https, no userinfo, never a bare IP literal (like lib/lnaddr.js):
  // a hostile host is still stopped at connect time, on its resolved IP.
  if (!cb || cb.protocol !== "https:" || cb.username || cb.password || !cb.hostname || net.isIP(cb.hostname.replace(/^\[|\]$/g, ""))) throw err("That Lightning address isn't reachable.", "address_unreachable", 502);
  let names = false;
  try {
    const meta = typeof pay.metadata === "string" ? JSON.parse(pay.metadata) : pay.metadata;
    const id = Array.isArray(meta) ? meta.find((m) => Array.isArray(m) && m[0] === "text/identifier")?.[1] : null;
    if (typeof id === "string") {
      try {
        const p = parseLnAddress(id);
        names = `${p.user}@${p.domain}` === canonical;
      } catch { /* not an address: treated as unnamed below */ }
    }
  } catch { /* unreadable metadata: treated as unnamed below */ }
  if (!names) throw err("That address doesn't name itself, so it can't be registered.", "address_mismatch", 422);
  return { canonical, pay };
}

export async function registerDestination(accountId, { address, sandbox = false } = {}) {
  const a = await getJSON(`dev:acct:${accountId}`);
  if (!a || a.suspended) throw err("Sign in again.", "unauthorized", 401);
  if (sandbox && !devSandboxOn()) throw err("The sandbox isn't switched on.", "sandbox_off", 501);
  if (!sandbox && !devapiOn()) throw err("The Developer API isn't open yet.", "api_off", 501);
  if ((await hit(`rl:dev:dest:${accountId}`, 86400)) > 10) throw err("Too many destinations registered today.", "rate_limited", 429);
  let shape;
  try {
    shape = parseLnAddress(address);
  } catch {
    throw err("Enter a Lightning address like name@wallet.com.", "bad_address");
  }
  const wantSim = `${shape.user}@${shape.domain}` === SANDBOX_ADDRESS;
  if (sandbox && !wantSim) throw err(`The sandbox only serves its built-in simulator, ${SANDBOX_ADDRESS}.`, "sandbox_address_only", 422);
  if (!sandbox && wantSim) throw err(`The simulator address is sandbox-only. Register it with sandbox: true.`, "bad_address", 422);
  if (wantSim) {
    // The simulator is Altradits' own: verified at once, nothing to pay, no network.
    const prior = (await getMany("dev:dest", await listIds(`dev:dests:${accountId}`, 200)))
      .find((d) => d.address === SANDBOX_ADDRESS && d.sandbox === true);
    if (prior?.verified) throw err("That address is already registered.", "duplicate_destination", 409);
    const d = prior || { id: newId(), accountId, address: SANDBOX_ADDRESS, sandbox: true, createdAt: now() };
    d.verified = true;
    d.verifiedAt = now();
    d.proof = SIMULATOR_PROOF;
    await setJSON(`dev:dest:${d.id}`, d);
    if (!prior) await pushId(`dev:dests:${accountId}`, d.id);
    return { destination: publicDestination(d), challenge: null,
      note: "The simulator is verified at once: nothing to pay. Create sandbox invoices to it and settle them with POST /sandbox/settle." };
  }
  const { canonical } = await resolveDestination(address);
  const existing = (await getMany("dev:dest", await listIds(`dev:dests:${accountId}`, 200)))
    .find((d) => d.address === canonical && d.sandbox === Boolean(sandbox));
  if (existing?.verified) throw err("That address is already registered.", "duplicate_destination", 409);
  let inv;
  try {
    inv = await receiveInvoice(1, `Altradits Developer challenge ${newId()}`);
  } catch (e) {
    throw err("Stanley's node isn't reachable, so ownership can't be proven right now. Try again later.", "node_offline", 503);
  }
  const d = existing || { id: newId(), accountId, address: canonical, sandbox: Boolean(sandbox),
    verified: false, verifiedAt: null, createdAt: now() };
  d.challenge = { bolt11: inv.bolt11, paymentHash: inv.paymentHash, expiresAt: inv.expiresAt, createdAt: now() };
  await setJSON(`dev:dest:${d.id}`, d);
  if (!existing) await pushId(`dev:dests:${accountId}`, d.id);
  return { destination: publicDestination(d),
    challenge: { bolt11: inv.bolt11, expiresAt: inv.expiresAt,
      note: "Pay this 1-sat invoice from the wallet behind the address within an hour, then call prove." } };
}

export async function proveDestination(accountId, destId) {
  const a = await getJSON(`dev:acct:${accountId}`);
  if (!a || a.suspended) throw err("Sign in again.", "unauthorized", 401);
  if (!DEV_ID_RE.test(String(destId || ""))) throw err("Unknown destination.", "unknown_destination", 404);
  const d = await getJSON(`dev:dest:${destId}`);
  if (!d || d.accountId !== accountId) throw err("Unknown destination.", "unknown_destination", 404);
  if (d.verified) return { destination: publicDestination(d) };
  if (d.sandbox && !devSandboxOn()) throw err("The sandbox isn't switched on.", "sandbox_off", 501);
  if (!d.sandbox && !devapiOn()) throw err("The Developer API isn't open yet.", "api_off", 501);
  if (!d.challenge || Date.parse(d.challenge.expiresAt) < Date.now())
    throw err("The challenge invoice expired. Register the address again for a fresh one.", "challenge_expired", 410);
  const paid = await receivePaid({ provider: "lnd", paymentHash: d.challenge.paymentHash }).catch(() => null);
  if (paid !== true) throw err("The 1-sat challenge isn't paid yet.", "challenge_unpaid", 409);
  // The address must still resolve to itself at proof time.
  const { canonical } = await resolveDestination(d.address);
  if (canonical !== d.address) throw err("That address doesn't name itself any more.", "address_mismatch", 422);
  d.verified = true;
  d.verifiedAt = now();
  d.proof = OWNERSHIP_PROOF;
  delete d.challenge;
  await setJSON(`dev:dest:${d.id}`, d);
  return { destination: publicDestination(d) };
}

export async function listDestinations(accountId) {
  return (await getMany("dev:dest", await listIds(`dev:dests:${accountId}`, 200))).map(publicDestination);
}

// ---- invoices: fetched from the developer's own destination, checked, tracked.
// The invoice is the destination's own reply, passed through unchanged: the
// customer's payment goes straight to the developer's address. Altradits never
// issues these invoices and never holds what they pay.
//
//   dev:inv:<id>         invoice { id, accountId, sandbox, destinationId, address, sats, msats,
//                                fiat, memo, bolt11, paymentHash, verifyUrl, preimage,
//                                status, createdAt, settledAt }
//   dev:invs:<acctId>    list of invoice ids (newest first)
//   dev:invh:<acct>:<h>  invoice id (verify by payment hash, scoped to the account)
//   dev:idem:<sha>       idempotent reply { reqHash, status, body, exp }
//
// Settlement: LUD-21 verify when the destination answers one; without it the
// invoice stays pending and the developer confirms in their own wallet.
export const WEBHOOK_EVENTS = ["invoice.settled"];
// Retry waits after each failed webhook attempt: 1m, 5m, 30m, 2h, 12h. Then dead.
export const WEBHOOK_BACKOFF = [60, 300, 1800, 7200, 43200];
const HASH_RE = /^[0-9a-f]{64}$/i;

let rateOverride = null;
export const setDevapiRates = (r) => { rateOverride = r || null; }; // tests: { btcUsd, btcKes }
let webhookFetch = (u, o) => publicFetch(u, o);
export const setDevapiWebhookFetcher = (f) => { webhookFetch = f || ((u, o) => publicFetch(u, o)); }; // tests

export function publicInvoice(inv) {
  return { id: inv.id, destinationId: inv.destinationId, address: inv.address, sandbox: inv.sandbox,
    sats: inv.sats, fiat: inv.fiat || null, memo: inv.memo || null, bolt11: inv.bolt11,
    paymentHash: inv.paymentHash, status: inv.status, verifySupported: Boolean(inv.verifyUrl),
    preimage: inv.preimage || null, createdAt: inv.createdAt, settledAt: inv.settledAt || null };
}

async function checkLockdown() {
  const { deadmanActive } = await import("./deadman.js");
  if (deadmanActive()) throw err("New invoices are frozen during the security lockdown.", "lockdown_freeze", 503);
}

// At most 1 BTC per invoice: far above what LNURL-pay wallets accept, and
// small enough that millisats stay exact integers everywhere downstream.
export const MAX_INVOICE_SATS = 100_000_000;
async function amountInSats({ sats, fiat }) {
  if (sats != null && fiat != null) throw err("Give sats or fiat, not both.", "bad_amount");
  if (sats != null) {
    const n = Number(sats);
    if (!Number.isSafeInteger(n) || n < 1) throw err("Enter a whole number of sats.", "bad_amount");
    if (n > MAX_INVOICE_SATS) throw err(`At most ${MAX_INVOICE_SATS.toLocaleString("en-US")} sats per invoice.`, "bad_amount");
    return { sats: n, fiat: null };
  }
  if (fiat == null) throw err("Give an amount in sats or fiat.", "bad_amount");
  const cur = String(fiat.currency || "").toUpperCase();
  if (cur !== "USD" && cur !== "KES") throw err("Fiat is priced in USD or KES.", "bad_currency");
  const n = Number(fiat.amount);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw err("Enter a fiat amount above zero.", "bad_amount");
  let rate;
  try {
    if (rateOverride) {
      rate = cur === "USD" ? rateOverride.btcUsd : rateOverride.btcKes;
    } else {
      const { btcUsd, btcKes } = await import("./lightning.js");
      rate = cur === "USD" ? await btcUsd() : await btcKes();
    }
  } catch {
    throw err("The price feed didn't answer. Try again in a minute.", "rate_unavailable", 503);
  }
  if (!Number.isFinite(rate) || rate <= 0) throw err("The price feed didn't answer. Try again in a minute.", "rate_unavailable", 503);
  const out = Math.ceil((n / rate) * 1e8);
  if (out < 1 || !Number.isSafeInteger(out)) throw err("That amount isn't possible.", "bad_amount");
  if (out > MAX_INVOICE_SATS) throw err(`At most ${MAX_INVOICE_SATS.toLocaleString("en-US")} sats per invoice.`, "bad_amount");
  return { sats: out, fiat: { amount: n, currency: cur, btcRate: rate } };
}

async function destinationFor(auth, destinationId) {
  if (!DEV_ID_RE.test(String(destinationId || ""))) throw err("Unknown destination.", "unknown_destination", 404);
  const d = await getJSON(`dev:dest:${destinationId}`);
  if (!d || d.accountId !== auth.account.id || d.sandbox !== auth.sandbox) throw err("Unknown destination.", "unknown_destination", 404);
  if (!d.verified) throw err("That destination isn't verified yet. Pay its challenge invoice and prove it first.", "destination_unverified", 409);
  return d;
}

const substitution = (where, detail) => {
  import("./attacks.js").then((a) => a.recordAttack("invoice_substitution", { where, detail: String(detail).slice(0, 200) })).catch(() => {});
};

// The destination's own invoice for exactly `msats`, checked like lib/lnaddr.js:
// exact amount, and the description hash must commit to the address's metadata.
async function destinationInvoice(dest, msats, memo) {
  // The simulator answers in-process: amount and description hash are still
  // checked below, exactly like a real destination's reply.
  if (dest.sandbox && dest.address === SANDBOX_ADDRESS) {
    if (msats < 1000 || msats > MAX_INVOICE_SATS * 1000)
      throw err(`The simulator accepts 1 to ${MAX_INVOICE_SATS.toLocaleString("en-US")} sats.`, "amount_out_of_range", 422);
    const sim = simInvoice(msats);
    await setJSON(`dev:sim:${sim.hash}`, { hash: sim.hash, msats, settled: false, preimage: null });
    const pr = sim.pr;
    if (bolt11Msats(pr) !== msats || bolt11PaymentHash(pr) !== sim.hash || bolt11DescriptionHash(pr) !== sha(SIM_META()))
      throw err("The simulator misbuilt its invoice.", "server_error", 500);
    return { pr, hash: sim.hash, verify: "simulator" };
  }
  // One fresh payRequest: it re-binds the address (still itself?) and gives
  // the live limits, callback and metadata for the checks below.
  const { canonical, pay } = await resolveDestination(dest.address).catch((e) => {
    throw err(e.code === "address_mismatch" ? "That destination doesn't name itself any more." : "That destination isn't reachable right now.", e.code === "address_mismatch" ? "address_mismatch" : "address_unreachable", e.status || 502);
  });
  if (canonical !== dest.address) throw err("That destination doesn't name itself any more.", "address_mismatch", 422);
  const lo = Number(pay.minSendable), hi = Number(pay.maxSendable);
  const min = Number.isFinite(lo) ? Math.max(0, lo) : 1000, max = Number.isFinite(hi) ? Math.max(0, hi) : 100000000000;
  if (msats < min || msats > max)
    throw err(`This destination accepts ${Math.ceil(min / 1000).toLocaleString("en-US")} to ${Math.floor(max / 1000).toLocaleString("en-US")} sats.`, "amount_out_of_range", 422);
  let cb;
  try { cb = new URL(pay.callback); } catch { cb = null; }
  if (!cb || cb.protocol !== "https:" || cb.username || cb.password || !cb.hostname || net.isIP(cb.hostname.replace(/^\[|\]$/g, "")))
    throw err("That destination isn't reachable right now.", "address_unreachable", 502);
  cb.searchParams.set("amount", String(msats));
  const allowed = Math.floor(Number(pay.commentAllowed) || 0);
  if (memo && allowed > 0) cb.searchParams.set("comment", memo.slice(0, Math.min(allowed, 500)));
  const got = await lnurlJson(cb.href);
  if (!got.ok || got.body.status === "ERROR") throw err(String(got.body.reason || "That destination isn't reachable right now.").slice(0, 200), "address_unreachable", 502);
  const inv = got.body;
  const pr = String(inv.pr || "");
  const host = cb.hostname;
  if (!pr || bolt11Msats(pr) !== msats) {
    substitution(host, `asked ${msats} msat, got ${bolt11Msats(pr)}`);
    throw err("The destination returned an invoice for a different amount.", "invoice_mismatch", 502);
  }
  const dh = bolt11DescriptionHash(pr);
  if (dh && typeof pay.metadata === "string" && dh !== sha(pay.metadata)) {
    substitution(host, "description hash doesn't match the destination's metadata");
    throw err("The destination returned an invoice for something else.", "invoice_mismatch", 502);
  }
  const hash = bolt11PaymentHash(pr);
  if (!hash) throw err("The destination returned an invoice that can't be tracked.", "invoice_untracked", 502);
  const verify = typeof inv.verify === "string" && inv.verify.startsWith("https://") ? inv.verify.slice(0, 500) : null;
  return { pr, hash, verify };
}

export async function createInvoice(auth, { destinationId, sats, fiat, memo, idempotencyKey } = {}) {
  requireScope(auth.key, "invoices:create");
  await checkLockdown();
  const dest = await destinationFor(auth, destinationId);
  const { sats: n, fiat: priced } = await amountInSats({ sats, fiat });
  const cleanMemo = oneLine(memo, 200) || null;
  const reqHash = sha(JSON.stringify([destinationId, n, priced, cleanMemo]));
  const { keyHash, replay } = await idemReplay(auth.account.id, idempotencyKey, reqHash);
  if (replay) return replay;
  await feeGate(auth, n);
  if ((await hit(`rl:dev:inv:${auth.key.id}`, 3600)) > 100) throw err("Too many invoices. Try again in an hour.", "rate_limited", 429);
  if ((await hit(`rl:dev:inva:${auth.account.id}`, 86400)) > 2000) throw err("Too many invoices today.", "rate_limited", 429);
  const { pr, hash, verify } = await destinationInvoice(dest, n * 1000, cleanMemo);
  // One record per payment hash and account: a repeated invoice reuses its first record.
  const seen = await getJSON(`dev:invh:${auth.account.id}:${hash}`);
  let inv = seen && (await getJSON(`dev:inv:${seen}`));
  if (!inv) {
    inv = { id: newId(), accountId: auth.account.id, sandbox: auth.sandbox, destinationId: dest.id,
      address: dest.address, sats: n, msats: n * 1000, fiat: priced, memo: cleanMemo, bolt11: pr,
      paymentHash: hash, verifyUrl: verify, preimage: null, status: "pending", createdAt: now(), settledAt: null };
    await setJSON(`dev:inv:${inv.id}`, inv);
    await setJSON(`dev:invh:${auth.account.id}:${hash}`, inv.id);
    await pushId(`dev:invs:${auth.account.id}`, inv.id);
  }
  const body = { invoice: publicInvoice(inv) };
  await idemStore(keyHash, reqHash, body);
  return body;
}

// A new invoice needs its fee covered: live, the balance must hold it;
// sandbox, testing is free, so a dry test balance refills itself first.
async function feeGate(auth, sats) {
  const need = feeFor(sats);
  const b = await getBalance(auth.account.id);
  if (!auth.sandbox) {
    if (b.live < need)
      throw err(`This invoice needs ${need} sats of fee credit and the balance holds ${b.live}. Top up first.`, "insufficient_credits", 402);
    return;
  }
  if (b.test >= need) return;
  await withAccountLock(auth.account.id, async () => {
    const fresh = await getBalance(auth.account.id);
    if (fresh.test >= need) return;
    const after = fresh.test + SANDBOX_GRANT_SATS;
    await setJSON(`dev:bal:${auth.account.id}`, { live: fresh.live, test: after, updatedAt: now() });
    await addLedger(auth.account.id, { env: "test", type: "grant", sats: SANDBOX_GRANT_SATS, balanceAfter: after,
      memo: "Free sandbox testing credit" });
  });
}

async function invoiceFor(auth, id) {
  if (!DEV_ID_RE.test(String(id || ""))) throw err("Unknown invoice.", "unknown_invoice", 404);
  const inv = await getJSON(`dev:inv:${id}`);
  // A key sees only its own environment; a dashboard session sees both, flagged.
  if (!inv || inv.accountId !== auth.account.id || (auth.sandbox !== undefined && inv.sandbox !== auth.sandbox))
    throw err("Unknown invoice.", "unknown_invoice", 404);
  return inv;
}

export async function getInvoice(auth, id) {
  if (auth.key) requireScope(auth.key, "invoices:read");
  const inv = await invoiceFor(auth, id);
  if ((await hit(`rl:dev:invh:${inv.id}`, 600)) > 100) throw err("Too many checks. Try again later.", "rate_limited", 429);
  return checkSettlement(inv);
}

export async function listInvoices(auth, { limit = 50, cursor } = {}) {
  if (auth.key) requireScope(auth.key, "invoices:read");
  const n = Math.min(200, Math.max(1, Number(limit) || 50));
  const ids = await listIds(`dev:invs:${auth.account.id}`, 2000);
  let start = 0;
  if (cursor) {
    const at = ids.indexOf(String(cursor));
    start = at < 0 ? ids.length : at + 1;
  }
  const page = [];
  let i = start;
  for (; i < ids.length && page.length < n; i++) {
    const inv = await getJSON(`dev:inv:${ids[i]}`);
    if (inv && (auth.sandbox === undefined || inv.sandbox === auth.sandbox)) page.push(publicInvoice(inv));
  }
  // The next page starts after the last id consumed, whether it matched this
  // environment or was skipped, so no invoice is ever shown twice or skipped.
  return { invoices: page, nextCursor: i < ids.length && page.length ? ids[i - 1] : null };
}

// A live settlement check. Without a LUD-21 verify URL the invoice stays
// pending here: the developer confirms in their own wallet, which holds the money.
export async function checkSettlement(inv) {
  if (inv.status === "settled") return { invoice: publicInvoice(inv), verifySupported: Boolean(inv.verifyUrl) };
  // The simulator always answers settlement from its own state: no network.
  if (inv.sandbox) {
    const sim = await getJSON(`dev:sim:${inv.paymentHash}`);
    if (sim?.settled) return { invoice: publicInvoice(await settleInvoice(inv, { preimage: sim.preimage })), verifySupported: true };
    return { invoice: publicInvoice(inv), verifySupported: true,
      note: "Not paid yet. Settle it with POST /sandbox/settle." };
  }
  if (!inv.verifyUrl) return { invoice: publicInvoice(inv), verifySupported: false,
    note: "This destination doesn't report settlement, so the invoice stays pending here. Confirm in your wallet." };
  let u;
  try { u = new URL(inv.verifyUrl); } catch { u = null; }
  if (!u || u.protocol !== "https:" || u.username || u.password) throw err("The destination's settlement check is misconfigured.", "verify_unreachable", 502);
  const r = await lnurlFetch(u.href, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, maxBytes: 65536 })
    .catch(() => { throw err("The destination didn't answer the settlement check.", "verify_unreachable", 502); });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || typeof d !== "object") throw err("The destination didn't answer the settlement check.", "verify_unreachable", 502);
  if (d.settled === true) {
    const preimage = typeof d.preimage === "string" && HASH_RE.test(d.preimage) ? d.preimage.toLowerCase() : null;
    return { invoice: publicInvoice(await settleInvoice(inv, { preimage })), verifySupported: true };
  }
  return { invoice: publicInvoice(inv), verifySupported: true };
}

// The settle simulator: plays the customer paying a sandbox invoice. Test key
// or dashboard session; live invoices are refused outright.
export async function settleSandboxInvoice(accountId, invoiceId, sandbox = undefined) {
  if (!DEV_ID_RE.test(String(invoiceId || ""))) throw err("Unknown invoice.", "unknown_invoice", 404);
  const inv = await getJSON(`dev:inv:${invoiceId}`);
  if (!inv || inv.accountId !== accountId) throw err("Unknown invoice.", "unknown_invoice", 404);
  if (sandbox !== undefined && inv.sandbox !== sandbox) throw err("Unknown invoice.", "unknown_invoice", 404);
  if (!devSandboxOn()) throw err("The sandbox isn't switched on.", "sandbox_off", 501);
  if (!inv.sandbox) throw err("Only sandbox invoices can be settled here. Live invoices settle when your customer pays.", "sandbox_only", 422);
  if (inv.status !== "settled") {
    const preimage = crypto.randomBytes(32).toString("hex");
    const sim = (await getJSON(`dev:sim:${inv.paymentHash}`)) || { hash: inv.paymentHash, msats: inv.msats };
    await setJSON(`dev:sim:${inv.paymentHash}`, { ...sim, settled: true, preimage });
  }
  return checkSettlement(inv);
}

export async function verifyByHash(auth, hash) {
  if (auth.key) requireScope(auth.key, "invoices:read");
  const h = String(hash || "").toLowerCase();
  if (!HASH_RE.test(h)) throw err("Unknown invoice.", "unknown_invoice", 404);
  const id = await getJSON(`dev:invh:${auth.account.id}:${h}`);
  const inv = id && (await getJSON(`dev:inv:${id}`));
  if (!inv || (auth.sandbox !== undefined && inv.sandbox !== auth.sandbox)) throw err("Unknown invoice.", "unknown_invoice", 404);
  if ((await hit(`rl:dev:invh:${inv.id}`, 600)) > 100) throw err("Too many checks. Try again later.", "rate_limited", 429);
  return checkSettlement(inv);
}

// Marks an invoice settled, once: deducts the 0.5% fee from the prepaid
// balance, records it, and queues the webhooks. Locked per invoice, then per
// account: simultaneous checks settle once, deduct once, and queue once. When
// simultaneous settlements cost more than the balance holds, the balance floors
// at zero and the shortfall is written on the ledger entry for Stanley to see.
export async function settleInvoice(inv, { preimage = null } = {}) {
  const { acquireLock } = await import("./store.js");
  const release = await acquireLock(`dev:settle:${inv.id}`, 30);
  if (!release) return getJSON(`dev:inv:${inv.id}`);
  try {
    const cur = await getJSON(`dev:inv:${inv.id}`);
    if (!cur || cur.status === "settled") return cur;
    cur.status = "settled";
    cur.settledAt = now();
    if (preimage) cur.preimage = preimage;
    await setJSON(`dev:inv:${cur.id}`, cur);
    const fee = feeFor(cur.sats);
    const env = cur.sandbox ? "test" : "live";
    await withAccountLock(cur.accountId, async () => {
      const b = await getBalance(cur.accountId);
      const have = env === "live" ? b.live : b.test;
      const deduct = Math.min(fee, have);
      const after = have - deduct;
      await setJSON(`dev:bal:${cur.accountId}`, env === "live" ? { live: after, test: b.test, updatedAt: now() } : { live: b.live, test: after, updatedAt: now() });
      await addLedger(cur.accountId, { env, type: "fee", sats: -deduct, balanceAfter: after, invoiceId: cur.id,
        shortfall: fee - deduct, memo: `0.5% of ${cur.sats} settled sats` });
      await bumpTotals(cur.accountId, env, { feesPaid: deduct, settledVolume: cur.sats, settledCount: 1, shortfall: fee - deduct });
    });
    await queueSettledWebhooks(cur);
    return cur;
  } finally {
    await release();
  }
}

// ---- webhooks: signed POSTs when an invoice settles.
//
//   dev:wh:<id>          endpoint { id, accountId, sandbox, url, secret, events, enabled, createdAt }
//   dev:whs:<acctId>     list of endpoint ids
//   dev:whe:<id>         delivery { id, webhookId, accountId, sandbox, invoiceId, event, body,
//                                  attempts, nextAt, done, dead, createdAt }
//   dev:wheld:<whId>     list of delivery ids (the delivery log, kept)
//   dev:whdue            delivery ids awaiting an attempt
//
// Signature (Stripe-style): X-Dev-Signature: t=<unix seconds>,v1=<hex> where
// v1 = HMAC-SHA256(secret, "<t>.<raw body>"). Receivers must check the
// timestamp is within 5 minutes (replay window) and compare in constant time.
export function publicWebhook(w) {
  return { id: w.id, url: w.url, sandbox: w.sandbox, events: w.events, enabled: w.enabled, createdAt: w.createdAt };
}

export function publicDelivery(d) {
  return { id: d.id, webhookId: d.webhookId, invoiceId: d.invoiceId, event: d.event, createdAt: d.createdAt,
    attempts: d.attempts, done: d.done, dead: d.dead, nextAt: d.nextAt };
}

function checkedWebhookUrl(raw) {
  const s = clean(raw, 500);
  let u;
  try { u = new URL(s); } catch { u = null; }
  if (!u || u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") || net.isIP(u.hostname.replace(/^\[|\]$/g, "")))
    throw err("Give an https URL on a public host, like https://example.com/hooks/invoices.", "bad_webhook_url");
  return u.href;
}

export async function registerWebhook(accountId, { url, events, sandbox = false } = {}) {
  const list = events === undefined ? [...WEBHOOK_EVENTS] : events;
  if (!Array.isArray(list) || !list.length || !list.every((e) => WEBHOOK_EVENTS.includes(e)))
    throw err(`Events: ${WEBHOOK_EVENTS.join(", ")}.`, "bad_webhook_events");
  const w = { id: newId(), accountId, sandbox: Boolean(sandbox), url: checkedWebhookUrl(url),
    secret: crypto.randomBytes(24).toString("hex"), events: [...new Set(list)], enabled: true, createdAt: now() };
  await setJSON(`dev:wh:${w.id}`, w);
  await pushId(`dev:whs:${accountId}`, w.id);
  return { webhook: publicWebhook(w), secret: w.secret,
    note: "Copy the secret now: it signs every delivery and is shown once. Verify t= within 5 minutes." };
}

export async function listWebhooks(accountId, { sandbox } = {}) {
  const all = await getMany("dev:wh", await listIds(`dev:whs:${accountId}`, 200));
  return all.filter((w) => sandbox === undefined || w.sandbox === sandbox).map(publicWebhook);
}

export async function disableWebhook(accountId, webhookId) {
  if (!DEV_ID_RE.test(String(webhookId || ""))) throw err("Unknown webhook.", "unknown_webhook", 404);
  const w = await getJSON(`dev:wh:${webhookId}`);
  if (!w || w.accountId !== accountId) throw err("Unknown webhook.", "unknown_webhook", 404);
  w.enabled = false;
  await setJSON(`dev:wh:${w.id}`, w);
  return { webhook: publicWebhook(w) };
}

async function queueSettledWebhooks(inv) {
  const hooks = (await getMany("dev:wh", await listIds(`dev:whs:${inv.accountId}`, 200)))
    .filter((w) => w.enabled && w.sandbox === inv.sandbox && w.events.includes("invoice.settled"));
  for (const w of hooks) {
    const d = { id: newId(), webhookId: w.id, accountId: inv.accountId, sandbox: inv.sandbox,
      invoiceId: inv.id, event: "invoice.settled", attempts: [], nextAt: new Date().toISOString(), done: false, dead: false, createdAt: now() };
    await setJSON(`dev:whe:${d.id}`, d);
    await pushId(`dev:wheld:${w.id}`, d.id);
    await pushId("dev:whdue", d.id);
    // The request that settled the invoice doesn't wait for the delivery:
    // the record above means a crash still leaves it queued for the pump.
    attemptDelivery(d.id).catch(() => {});
  }
}

export async function attemptDelivery(deliveryId) {
  const { acquireLock } = await import("./store.js");
  const release = await acquireLock(`dev:whd:${deliveryId}`, 30);
  if (!release) return null;
  try {
    const d = await getJSON(`dev:whe:${deliveryId}`);
    if (!d || d.done) return d;
    const w = await getJSON(`dev:wh:${d.webhookId}`);
    const inv = await getJSON(`dev:inv:${d.invoiceId}`);
    if (!w || !inv) { d.done = true; d.dead = true; await setJSON(`dev:whe:${d.id}`, d); return d; }
    const body = JSON.stringify({ event: d.event, invoice: publicInvoice(inv), deliveredAt: now() });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", w.secret).update(`${t}.${body}`).digest("hex");
    let code = 0;
    try {
      const r = await webhookFetch(w.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Signature": `t=${t},v1=${sig}`, "X-Dev-Timestamp": String(t) },
        body, signal: AbortSignal.timeout(8000), maxBytes: 65536 });
      code = r.status;
    } catch { code = 0; }
    const at = now();
    if (code >= 200 && code < 300) {
      d.attempts.push({ at, ok: true, code });
      d.done = true;
      d.nextAt = null;
    } else {
      d.attempts.push({ at, ok: false, code });
      const wait = WEBHOOK_BACKOFF[d.attempts.length - 1];
      if (wait === undefined) {
        d.done = true;
        d.dead = true;
        d.nextAt = null;
      } else {
        d.nextAt = new Date(Date.now() + wait * 1000).toISOString();
        await pushId("dev:whdue", d.id);
      }
    }
    await setJSON(`dev:whe:${d.id}`, d);
    return d;
  } finally {
    await release();
  }
}

// Retries due deliveries. Runs off the /healthz pings (server.mjs dueJobs),
// so no request ever waits for it. Skipped while both switches are off:
// queued deliveries wait until the API reopens.
export async function pumpWebhooks(limit = 50) {
  if (!devApiOpen()) return { ran: false };
  const { acquireLock, removeFromList } = await import("./store.js");
  const release = await acquireLock("dev:whpump", 120);
  if (!release) return { ran: false };
  try {
    const ids = await listIds("dev:whdue", limit);
    await removeFromList("dev:whdue", ids);
    let attempted = 0;
    for (const id of ids) {
      const d = await getJSON(`dev:whe:${id}`);
      if (!d || d.done) continue; // delivered or superseded meanwhile
      if (Date.parse(d.nextAt) > Date.now()) { await pushId("dev:whdue", id); continue; } // not due yet
      attempted++;
      await attemptDelivery(id).catch(() => {});
    }
    return { ran: true, attempted };
  } finally {
    await release();
  }
}

// ---- fee balance: the developer prepays the 0.5% service charge in sats to
// Stanley's node. Each settled invoice deducts feeFor(sats) from the balance;
// an empty balance refuses new invoices until topped up. Customer money never
// enters this balance: top-ups are the developer's own payments for the service.
//
//   dev:bal:<acctId>    { live, test, updatedAt }
//   dev:top:<id>        top-up { id, accountId, sats, bolt11, paymentHash, expiresAt,
//                              status, createdAt, creditedAt }
//   dev:tops:<acctId>   list of top-up ids (newest first)
//   dev:le:<id>         ledger entry { id, accountId, env, at, type, sats, balanceAfter,
//                                     invoiceId, topupId, shortfall, memo }
//   dev:ledger:<acctId> list of ledger entry ids (newest first)
//
// Refund rule (written): prepaid credits pay for the API service and are
// non-refundable, except on account close: closing the account pays any unused
// live balance out to a verified destination within 7 days. Test sats are
// play money and refund to nothing.
export const REFUND_RULE = "Prepaid credits are non-refundable, except on account close: any unused live balance is paid out to a verified destination within 7 days.";
// 0.5% of settled sats, rounded up, minimum 1 sat. Integer maths: ceil(n/200).
export const feeFor = (sats) => Math.max(1, Math.floor((Math.ceil(sats) + 199) / 200));
export const MIN_TOPUP_SATS = 100;
export const SANDBOX_GRANT_SATS = 10000;

export async function getBalance(accountId) {
  const b = await getJSON(`dev:bal:${accountId}`);
  return { live: b?.live || 0, test: b?.test || 0 };
}

async function addLedger(accountId, entry) {
  const e = { id: newId(), accountId, at: now(), ...entry };
  await setJSON(`dev:le:${e.id}`, e);
  await pushId(`dev:ledger:${accountId}`, e.id);
  return e;
}

const ZERO_TOTALS = () => ({ toppedUp: 0, feesPaid: 0, settledVolume: 0, settledCount: 0, shortfall: 0 });
// Totals are kept per environment: only live fees are real sats to the node.
async function bumpTotals(accountId, env, patch) {
  const a = await getJSON(`dev:acct:${accountId}`);
  if (!a) return;
  a.totals = a.totals || { live: ZERO_TOTALS(), test: ZERO_TOTALS() };
  a.totals[env] = a.totals[env] || ZERO_TOTALS();
  for (const [k, v] of Object.entries(patch)) a.totals[env][k] = (a.totals[env][k] || 0) + v;
  await setJSON(`dev:acct:${accountId}`, a);
}
export function accountTotals(a) {
  const t = (a && a.totals) || {};
  return { live: { ...ZERO_TOTALS(), ...(t.live || {}) }, test: { ...ZERO_TOTALS(), ...(t.test || {}) } };
}

// Balance, ledger and totals change only under the account lock, waited for
// (never skipped): two simultaneous settlements must see each other's maths.
async function withAccountLock(accountId, fn) {
  const { acquireLock } = await import("./store.js");
  let unlock = null;
  for (let i = 0; i < 100 && !unlock; i++) {
    unlock = await acquireLock(`dev:acctw:${accountId}`, 30);
    if (!unlock) await new Promise((r) => setTimeout(r, 20));
  }
  if (!unlock) throw err("The account is busy. Try again.", "account_busy", 503);
  try {
    return await fn();
  } finally {
    await unlock();
  }
}

// The idempotency check shared by invoice and top-up creation: the same key
// replays the first reply for 24 hours; new details under it are refused.
async function idemReplay(accountId, idempotencyKey, reqHash) {
  if (!idempotencyKey) return { keyHash: null, replay: null };
  const keyHash = sha(`${accountId}|${String(idempotencyKey).slice(0, 200)}`);
  const prior = await getJSON(`dev:idem:${keyHash}`);
  if (prior && prior.exp > Date.now()) {
    if (prior.reqHash !== reqHash) throw err("That idempotency key was used with different details.", "idempotency_conflict", 422);
    return { keyHash, replay: { ...prior.body, deduplicated: true } };
  }
  return { keyHash, replay: null };
}
async function idemStore(keyHash, reqHash, body) {
  if (keyHash) await setJSON(`dev:idem:${keyHash}`, { reqHash, body, exp: Date.now() + 864e5 });
}

export function publicTopup(t) {
  return { id: t.id, sats: t.sats, bolt11: t.bolt11, paymentHash: t.paymentHash, expiresAt: t.expiresAt,
    status: t.status, createdAt: t.createdAt, creditedAt: t.creditedAt || null };
}

// A top-up invoice from Stanley's node (receive-only key, nodeOnly: the sats
// must land on the node, never on a fallback). Live only: test sats are granted.
export async function createTopup(accountId, { sats, idempotencyKey } = {}) {
  const a = await getJSON(`dev:acct:${accountId}`);
  if (!a || a.suspended) throw err("Sign in again.", "unauthorized", 401);
  await checkLockdown();
  const n = Number(sats);
  if (!Number.isSafeInteger(n) || n < MIN_TOPUP_SATS) throw err(`Top up at least ${MIN_TOPUP_SATS} sats.`, "bad_amount");
  if (n > MAX_INVOICE_SATS) throw err(`At most ${MAX_INVOICE_SATS.toLocaleString("en-US")} sats per top-up.`, "bad_amount");
  const reqHash = sha(JSON.stringify(["topup", n]));
  const { keyHash, replay } = await idemReplay(accountId, idempotencyKey, reqHash);
  if (replay) return replay;
  if ((await hit(`rl:dev:top:${accountId}`, 86400)) > 20) throw err("Too many top-ups today.", "rate_limited", 429);
  let top;
  try {
    top = await receiveInvoice(n, "Altradits Developer fee top-up");
  } catch {
    throw err("Stanley's node can't receive right now. Try a smaller amount later.", "node_offline", 503);
  }
  const t = { id: newId(), accountId, sats: n, bolt11: top.bolt11, paymentHash: top.paymentHash,
    expiresAt: top.expiresAt, status: "pending", createdAt: now(), creditedAt: null };
  await setJSON(`dev:top:${t.id}`, t);
  await pushId(`dev:tops:${accountId}`, t.id);
  const body = { topup: publicTopup(t) };
  await idemStore(keyHash, reqHash, body);
  return body;
}

export async function getTopup(accountId, id) {
  if (!DEV_ID_RE.test(String(id || ""))) throw err("Unknown top-up.", "unknown_topup", 404);
  const t = await getJSON(`dev:top:${id}`);
  if (!t || t.accountId !== accountId) throw err("Unknown top-up.", "unknown_topup", 404);
  return checkTopup(t);
}

export async function listTopups(accountId, { limit = 50, cursor } = {}) {
  const n = Math.min(200, Math.max(1, Number(limit) || 50));
  const ids = await listIds(`dev:tops:${accountId}`, 2000);
  let start = 0;
  if (cursor) {
    const at = ids.indexOf(String(cursor));
    start = at < 0 ? ids.length : at + 1;
  }
  const page = [];
  let i = start;
  for (; i < ids.length && page.length < n; i++) {
    const t = await getJSON(`dev:top:${ids[i]}`);
    if (t) page.push(publicTopup(t));
  }
  return { topups: page, nextCursor: i < ids.length && page.length ? ids[i - 1] : null };
}

// Credits a settled top-up to the live balance, once. Receiving stays on
// during a lockdown (like Ye₿ente): only creating new top-ups is frozen.
export async function checkTopup(t) {
  if (t.status === "credited") return { topup: publicTopup(t) };
  if (Date.parse(t.expiresAt) < Date.now()) return { topup: publicTopup(t), note: "This top-up invoice expired unpaid." };
  const paid = await receivePaid({ provider: "lnd", paymentHash: t.paymentHash }).catch(() => null);
  if (paid !== true) return { topup: publicTopup(t) };
  const { acquireLock } = await import("./store.js");
  const release = await acquireLock(`dev:topc:${t.id}`, 30);
  if (!release) return { topup: publicTopup((await getJSON(`dev:top:${t.id}`)) || t) };
  try {
    const cur = await getJSON(`dev:top:${t.id}`);
    if (!cur || cur.status === "credited") return { topup: publicTopup(cur || t) };
    cur.status = "credited";
    cur.creditedAt = now();
    await setJSON(`dev:top:${cur.id}`, cur);
    await withAccountLock(cur.accountId, async () => {
      const b = await getBalance(cur.accountId);
      const after = b.live + cur.sats;
      await setJSON(`dev:bal:${cur.accountId}`, { live: after, test: b.test, updatedAt: now() });
      await addLedger(cur.accountId, { env: "live", type: "topup", sats: cur.sats, balanceAfter: after, topupId: cur.id, memo: `Top-up of ${cur.sats} sats` });
      await bumpTotals(cur.accountId, "live", { toppedUp: cur.sats });
    });
    return { topup: publicTopup(cur) };
  } finally {
    await release();
  }
}

export async function getStatement(accountId, { limit = 50, cursor } = {}) {
  const a = await getJSON(`dev:acct:${accountId}`);
  const n = Math.min(200, Math.max(1, Number(limit) || 50));
  const ids = await listIds(`dev:ledger:${accountId}`, 2000);
  let start = 0;
  if (cursor) {
    const at = ids.indexOf(String(cursor));
    start = at < 0 ? ids.length : at + 1;
  }
  const entries = [];
  let i = start;
  for (; i < ids.length && entries.length < n; i++) {
    const e = await getJSON(`dev:le:${ids[i]}`);
    if (e) entries.push({ id: e.id, at: e.at, env: e.env, type: e.type, sats: e.sats, balanceAfter: e.balanceAfter,
      invoiceId: e.invoiceId || null, topupId: e.topupId || null, shortfall: e.shortfall || 0, memo: e.memo || null });
  }
  return { balance: await getBalance(accountId), totals: accountTotals(a),
    entries, nextCursor: i < ids.length && entries.length ? ids[i - 1] : null };
}

// ---- admin: Stanley's Developer section. Accounts, settled volume, fees
// earned to the node (live only), abuse flags, and key suspension.
export async function developerAdminView() {
  const ids = await listIds("dev:accounts", 500);
  const accounts = [];
  const sum = { live: ZERO_TOTALS(), test: ZERO_TOTALS() };
  for (const a of await getMany("dev:acct", ids)) {
    if (!a) continue;
    const t = accountTotals(a);
    for (const env of ["live", "test"]) for (const k of Object.keys(sum[env])) sum[env][k] += t[env][k] || 0;
    const keyIds = await listIds(`dev:keys:${a.id}`, 200);
    let active = 0;
    const keyRows = [];
    for (const kid of keyIds) {
      const h = await getJSON(`dev:keyid:${kid}`);
      const k = h && (await getJSON(`dev:key:${h}`));
      if (!k) continue;
      if (!k.revokedAt) active++;
      keyRows.push({ id: k.id, prefix: k.prefix, name: k.name, sandbox: k.sandbox, scopes: k.scopes,
        createdAt: k.createdAt, revokedAt: k.revokedAt || null, lastUsedAt: k.lastUsedAt || null });
    }
    const dests = await getMany("dev:dest", await listIds(`dev:dests:${a.id}`, 200));
    accounts.push({ id: a.id, email: a.email, createdAt: a.createdAt, suspended: Boolean(a.suspended),
      balance: await getBalance(a.id), totals: t, keys: keyRows, keyCount: keyRows.length, activeKeys: active,
      destinations: dests.filter(Boolean).length, verifiedDestinations: dests.filter((d) => d?.verified).length });
  }
  const flags = [];
  for (const a of accounts) {
    const short = (a.totals.live.shortfall || 0) + (a.totals.test.shortfall || 0);
    if (short > 0) flags.push({ accountId: a.id, email: a.email, kind: "shortfall",
      detail: `${short} sat${short === 1 ? "" : "s"} of fees settled short (simultaneous settlements past the balance)` });
    if (a.suspended) flags.push({ accountId: a.id, email: a.email, kind: "suspended", detail: "Account suspended" });
  }
  const { securityView } = await import("./attacks.js");
  const counts = (await securityView(1)).counts || {};
  return { switches: { api: devapiOn(), sandbox: devSandboxOn() },
    totals: sum, accountCount: accounts.length,
    feesEarnedLive: sum.live.feesPaid, settledVolumeLive: sum.live.settledVolume,
    guessing: { code: counts.dev_code_guessing || { today: 0, week: 0 }, key: counts.dev_key_guess || { today: 0, week: 0 } },
    flags, accounts };
}

export async function adminSuspendKey(keyId) {
  if (!DEV_ID_RE.test(String(keyId || ""))) throw err("Unknown key.", "unknown_key", 404);
  const h = await getJSON(`dev:keyid:${keyId}`);
  const k = h && (await getJSON(`dev:key:${h}`));
  if (!k) throw err("Unknown key.", "unknown_key", 404);
  if (!k.revokedAt) {
    k.revokedAt = now();
    k.suspendedBy = "stanley";
    await setJSON(`dev:key:${h}`, k);
  }
  return { key: publicKey(k) };
}

export async function listDeliveries(accountId, webhookId, { limit = 50, cursor } = {}) {
  if (!DEV_ID_RE.test(String(webhookId || ""))) throw err("Unknown webhook.", "unknown_webhook", 404);
  const w = await getJSON(`dev:wh:${webhookId}`);
  if (!w || w.accountId !== accountId) throw err("Unknown webhook.", "unknown_webhook", 404);
  const n = Math.min(200, Math.max(1, Number(limit) || 50));
  const ids = await listIds(`dev:wheld:${webhookId}`, 2000);
  let start = 0;
  if (cursor) {
    const at = ids.indexOf(String(cursor));
    start = at < 0 ? ids.length : at + 1;
  }
  const page = [];
  let i = start;
  for (; i < ids.length && page.length < n; i++) {
    const d = await getJSON(`dev:whe:${ids[i]}`);
    if (d) page.push(publicDelivery(d));
  }
  return { deliveries: page, nextCursor: i < ids.length && page.length ? ids[i - 1] : null };
}
