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
async function challengeInvoice() {
  if (invoicer?.create) return invoicer.create();
  const { createInvoice } = await import("./lightning.js");
  // nodeOnly: the sat must land on Stanley's node, never on a fallback.
  return createInvoice({ sats: 1, memo: `Altradits Developer challenge ${newId()}`, expiry: 3600, nodeOnly: true });
}
async function challengePaid(inv) {
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
    verifiedAt: d.verifiedAt || null, proof: d.verified ? OWNERSHIP_PROOF : null, createdAt: d.createdAt };
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
  const { canonical } = await resolveDestination(address);
  const existing = (await getMany("dev:dest", await listIds(`dev:dests:${accountId}`, 200)))
    .find((d) => d.address === canonical && d.sandbox === Boolean(sandbox));
  if (existing?.verified) throw err("That address is already registered.", "duplicate_destination", 409);
  let inv;
  try {
    inv = await challengeInvoice();
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
  const paid = await challengePaid({ provider: "lnd", paymentHash: d.challenge.paymentHash }).catch(() => null);
  if (paid !== true) throw err("The 1-sat challenge isn't paid yet.", "challenge_unpaid", 409);
  // The address must still resolve to itself at proof time.
  const { canonical } = await resolveDestination(d.address);
  if (canonical !== d.address) throw err("That address doesn't name itself any more.", "address_mismatch", 422);
  d.verified = true;
  d.verifiedAt = now();
  delete d.challenge;
  await setJSON(`dev:dest:${d.id}`, d);
  return { destination: publicDestination(d) };
}

export async function listDestinations(accountId) {
  return (await getMany("dev:dest", await listIds(`dev:dests:${accountId}`, 200))).map(publicDestination);
}
