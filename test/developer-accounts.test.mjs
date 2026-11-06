// Developer API PR1 (issue #421): accounts, API keys, destinations.
// Email, the destination's LNURL server and the node are all stubbed: no
// real mail, network or node is touched here.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-dev1-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "DEVAPI", "DEVAPI_SANDBOX", "ADMIN_TOKEN"]) delete process.env[k];
Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on", SITE_URL: "https://altradits.test", ADMIN_TOKEN: "dev-test-admin-token" });

const dev = await import("../lib/devapi.js");
const api = await import("../api/dev.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");

const outbox = [];
email.setMailer({ sendMail: async (m) => { outbox.push(m); return { accepted: [m.to] }; } });
const lastCode = () => outbox.at(-1).text.match(/code is (\d{8})/)[1];

// --- stub node invoicer: challenge invoices without a node ------------------
const node = { paidHashes: new Set(), offline: false, pastExpiry: false };
dev.setDevapiInvoicer({
  create: async () => {
    if (node.offline) throw new Error("node down");
    const h = crypto.randomBytes(32).toString("hex");
    return { provider: "lnd", bolt11: `lnbc10n1challenge${h.slice(0, 8)}`, paymentHash: h,
      expiresAt: new Date(Date.now() + (node.pastExpiry ? -10 : 3600) * 1000).toISOString() };
  },
  paid: async (inv) => node.paidHashes.has(inv.paymentHash),
});

// --- stub LNURL server: one good wallet, several broken ones -----------------
const META = (id) => JSON.stringify([["text/plain", `Pay ${id}`], ["text/identifier", id]]);
const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
dev.setDevapiFetcher(async (raw) => {
  const u = new URL(String(raw));
  assert.equal(u.protocol, "https:", "destinations are only fetched over https");
  const m = u.pathname.match(/^\/\.well-known\/lnurlp\/(\w+)$/);
  if (!m) return J({ status: "ERROR", reason: "No such user." }, 404);
  const user = m[1];
  if (user === "down") throw new Error("unreachable");
  if (user === "plain") return J({ tag: "payRequest", callback: "http://wallet.test/cb", minSendable: 1000, maxSendable: 1000000, metadata: META("plain@wallet.test") });
  if (user === "other") return J({ tag: "payRequest", callback: "https://wallet.test/cb", minSendable: 1000, maxSendable: 1000000, metadata: META("someone-else@wallet.test") });
  if (user === "notpay") return J({ tag: "withdrawRequest", callback: "https://wallet.test/cb" });
  if (user === "iplit") return J({ tag: "payRequest", callback: "https://93.184.216.34/cb", minSendable: 1000, maxSendable: 1000000, metadata: META("iplit@wallet.test") });
  return J({ tag: "payRequest", callback: "https://wallet.test/cb", minSendable: 1000, maxSendable: 1000000, metadata: META(`${user}@wallet.test`) });
});

// --- calling the API ----------------------------------------------------------
const call = async (method, p, { body, session } = {}) => {
  const fn = method === "GET" ? api.GET : api.POST;
  const r = await fn(new Request(`https://altradits.test/api/dev/${p}`, {
    method, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  }));
  return { status: r.status, json: await r.json() };
};
const signup = async (mailbox) => {
  await call("POST", "v1/accounts/request-code", { body: { email: mailbox } });
  const r = await call("POST", "v1/accounts/verify-code", { body: { email: mailbox, code: lastCode() } });
  assert.equal(r.status, 200, `signup for ${mailbox}: ${JSON.stringify(r.json)}`);
  return r.json;
};

test("health always answers and names both switches", async () => {
  const r = await call("GET", "v1/health");
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.ok, r.json.version, r.json.api, r.json.sandbox], [true, "v1", "on", "on"]);
  assert.ok(r.json.requestId, "every reply carries a request id");
  delete process.env.DEVAPI;
  delete process.env.DEVAPI_SANDBOX;
  const off = await call("GET", "v1/health");
  assert.equal(off.status, 200);
  assert.deepEqual([off.json.api, off.json.sandbox], ["off", "off"]);
  const noSignup = await call("POST", "v1/accounts/request-code", { body: { email: "nobody@example.com" } });
  assert.equal(noSignup.status, 501);
  assert.equal(noSignup.json.code, "api_off");
  assert.ok(noSignup.json.requestId && noSignup.json.error, "errors carry a code, a sentence and a request id");
  Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on" });
});

test("unknown API versions are refused plainly", async () => {
  const r = await call("GET", "v9/health");
  assert.equal(r.status, 404);
  assert.equal(r.json.code, "bad_version");
});

test("signup: bad addresses refused, typos caught, codes single-use", async () => {
  const bad = await call("POST", "v1/accounts/request-code", { body: { email: "not-an-email" } });
  assert.equal(bad.json.code, "bad_email");
  const typo = await call("POST", "v1/accounts/request-code", { body: { email: "dev@gmial.com" } });
  assert.equal(typo.status, 422);
  assert.equal(typo.json.code, "email_typo");
  const accepted = await call("POST", "v1/accounts/request-code", { body: { email: "dev@gmial.com", confirmTypo: true } });
  assert.equal(accepted.json.ok, true);

  const me = await signup("5tan@altradits.com");
  assert.equal(me.account.email, "5tan@altradits.com");
  assert.ok(me.session.length >= 20);
  const who = await call("GET", "v1/accounts/me", { session: me.session });
  assert.equal(who.json.account.id, me.account.id);

  await call("POST", "v1/accounts/request-code", { body: { email: "once@example.com" } });
  const code = lastCode();
  const first = await call("POST", "v1/accounts/verify-code", { body: { email: "once@example.com", code } });
  assert.equal(first.json.ok, true);
  const second = await call("POST", "v1/accounts/verify-code", { body: { email: "once@example.com", code } });
  assert.equal(second.json.code, "bad_code");
  const wrong = await call("POST", "v1/accounts/verify-code", { body: { email: "once@example.com", code: "00000000" } });
  assert.equal(wrong.json.code, "bad_code");
});

test("code request and guess limits, and the Security watch sees guessing", async () => {
  for (let i = 0; i < 6; i++) await call("POST", "v1/accounts/request-code", { body: { email: "flood@example.com" } });
  const limited = await call("POST", "v1/accounts/request-code", { body: { email: "flood@example.com" } });
  assert.equal(limited.status, 429);
  for (let i = 0; i < 11; i++) await call("POST", "v1/accounts/verify-code", { body: { email: "guess@example.com", code: "12345678" } });
  const banned = await call("POST", "v1/accounts/verify-code", { body: { email: "guess@example.com", code: "12345678" } });
  assert.equal(banned.status, 429);
  const { securityView } = await import("../lib/attacks.js");
  const kinds = (await securityView(200)).events.map((e) => e.kind);
  assert.ok(kinds.includes("dev_code_guessing"), "code guessing lands in the Security watch");
});

test("sign-out ends the session at once", async () => {
  const me = await signup("bye@example.com");
  assert.equal((await call("GET", "v1/accounts/me", { session: me.session })).status, 200);
  assert.equal((await call("POST", "v1/accounts/sign-out", { session: me.session })).json.signedOut, true);
  assert.equal((await call("GET", "v1/accounts/me", { session: me.session })).status, 401);
  assert.equal((await call("GET", "v1/accounts/me", { session: "bogus-session-token-here" })).status, 401);
});

test("keys: create, list, rotate, revoke; secrets shown once and stored hashed", async () => {
  const me = await signup("keys@example.com");
  const created = await call("POST", "v1/keys", { session: me.session, body: { name: "shop server" } });
  assert.equal(created.status, 201);
  assert.ok(created.json.key.startsWith("ak_live_"), "live keys carry the live prefix");
  assert.deepEqual(created.json.scopes, ["invoices:create", "invoices:read", "webhooks"]);
  const secret = created.json.key;
  const listed = await call("GET", "v1/keys", { session: me.session });
  assert.equal(listed.json.keys.length, 1);
  assert.ok(!("key" in listed.json.keys[0]) && !("secret" in listed.json.keys[0]), "listing never reveals a secret");
  assert.equal(listed.json.keys[0].prefix, secret.slice(0, 16));

  // Stored hashed: the full secret appears nowhere in the store.
  const h = await store.getJSON(`dev:keyid:${created.json.id}`);
  assert.equal(h, crypto.createHash("sha256").update(secret).digest("hex"));
  const stored = await store.getJSON(`dev:key:${h}`);
  assert.ok(!JSON.stringify(stored).includes(secret.slice(20)), "the store holds the hash, not the secret");

  // The new key authenticates; rotation revokes it and returns a new secret once.
  const authed = await dev.authKey(secret);
  assert.equal(authed.account.id, me.account.id);
  assert.equal(authed.sandbox, false);
  const rot = await call("POST", `v1/keys/${created.json.id}/rotate`, { session: me.session });
  assert.equal(rot.status, 201);
  assert.ok(rot.json.key.startsWith("ak_live_") && rot.json.key !== secret);
  await assert.rejects(() => dev.authKey(secret), (e) => e.code === "key_revoked");
  await assert.rejects(() => dev.authKey("ak_live_bogusssssssssssssssssssssssssss"), (e) => e.code === "invalid_key");
  await assert.rejects(() => dev.authKey("not-a-key"), (e) => e.code === "invalid_key");
  const rev = await call("POST", `v1/keys/${rot.json.id}/revoke`, { session: me.session });
  assert.equal(rev.json.revoked, true);
  await assert.rejects(() => dev.authKey(rot.json.key), (e) => e.code === "key_revoked");
  const gone = await call("POST", "v1/keys/does-not-exist/revoke", { session: me.session });
  assert.equal(gone.status, 404);

  const scoped = await call("POST", "v1/keys", { session: me.session, body: { scopes: ["invoices:read"] } });
  assert.deepEqual(scoped.json.scopes, ["invoices:read"]);
  const badScope = await call("POST", "v1/keys", { session: me.session, body: { scopes: ["spend"] } });
  assert.equal(badScope.json.code, "bad_scope");
  const k = (await dev.authKey(scoped.json.key)).key;
  assert.throws(() => dev.requireScope(k, "invoices:create"), (e) => e.code === "forbidden_scope");
  dev.requireScope(k, "invoices:read");
});

test("sandbox and mainnet keys can never cross environments", async () => {
  const me = await signup("env@example.com");
  const t = await call("POST", "v1/keys", { session: me.session, body: { sandbox: true } });
  assert.ok(t.json.key.startsWith("ak_test_"));
  const live = await call("POST", "v1/keys", { session: me.session, body: {} });
  assert.equal((await dev.authKey(t.json.key)).sandbox, true);

  delete process.env.DEVAPI_SANDBOX; // live on, sandbox off: test keys refuse, live keys work
  await assert.rejects(() => dev.authKey(t.json.key), (e) => e.code === "sandbox_off");
  assert.equal((await dev.authKey(live.json.key)).sandbox, false);
  const noTest = await call("POST", "v1/keys", { session: me.session, body: { sandbox: true } });
  assert.equal(noTest.json.code, "sandbox_off");

  delete process.env.DEVAPI; // both off: live keys refuse too
  process.env.DEVAPI_SANDBOX = "on";
  await assert.rejects(() => dev.authKey(live.json.key), (e) => e.code === "api_off");
  assert.equal((await dev.authKey(t.json.key)).sandbox, true);
  const noLive = await call("POST", "v1/keys", { session: me.session, body: {} });
  assert.equal(noLive.json.code, "api_off");
  Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on" });
});

test("a suspended account is locked out everywhere", async () => {
  const me = await signup("suspended@example.com");
  const k = await call("POST", "v1/keys", { session: me.session, body: {} });
  const id = (await store.getJSON(`dev:email:${crypto.createHash("sha256").update("suspended@example.com").digest("hex")}`));
  const a = await store.getJSON(`dev:acct:${id}`);
  a.suspended = true;
  await store.setJSON(`dev:acct:${id}`, a);
  assert.equal((await call("GET", "v1/accounts/me", { session: me.session })).status, 401);
  await assert.rejects(() => dev.authKey(k.json.key), (e) => e.code === "suspended");
});

test("destinations: register, challenge, prove; broken addresses refused", async () => {
  const me = await signup("dest@example.com");
  const reg = await call("POST", "v1/destinations", { session: me.session, body: { address: "shop@wallet.test" } });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.destination.address, "shop@wallet.test");
  assert.equal(reg.json.destination.verified, false);
  assert.ok(reg.json.challenge.bolt11, "registration returns the 1-sat challenge invoice");

  const early = await call("POST", `v1/destinations/${reg.json.destination.id}/prove`, { session: me.session });
  assert.equal(early.status, 409);
  assert.equal(early.json.code, "challenge_unpaid");

  const stored = await store.getJSON(`dev:dest:${reg.json.destination.id}`);
  node.paidHashes.add(stored.challenge.paymentHash);
  const proven = await call("POST", `v1/destinations/${reg.json.destination.id}/prove`, { session: me.session });
  assert.equal(proven.json.destination.verified, true);
  assert.equal(proven.json.destination.proof, "pay-1-sat-challenge");
  const dupe = await call("POST", "v1/destinations", { session: me.session, body: { address: "shop@wallet.test" } });
  assert.equal(dupe.status, 409);

  const listed = await call("GET", "v1/destinations", { session: me.session });
  assert.equal(listed.json.destinations.length, 1);

  for (const [address, code] of [["down@wallet.test", "address_unreachable"], ["plain@wallet.test", "address_unreachable"],
    ["iplit@wallet.test", "address_unreachable"], ["other@wallet.test", "address_mismatch"], ["notpay@wallet.test", "bad_address"], ["not-an-address", "bad_address"]]) {
    const r = await call("POST", "v1/destinations", { session: me.session, body: { address } });
    assert.equal(r.json.code, code, `${address} refused as ${code}, got ${r.json.code}`);
  }
});

test("destinations: expired challenges and an offline node fail plainly", async () => {
  const me = await signup("dest2@example.com");
  node.pastExpiry = true;
  const reg = await call("POST", "v1/destinations", { session: me.session, body: { address: "old@wallet.test" } });
  node.pastExpiry = false;
  const gone = await call("POST", `v1/destinations/${reg.json.destination.id}/prove`, { session: me.session });
  assert.equal(gone.status, 410);
  assert.equal(gone.json.code, "challenge_expired");

  node.offline = true;
  const down = await call("POST", "v1/destinations", { session: me.session, body: { address: "new@wallet.test" } });
  node.offline = false;
  assert.equal(down.status, 503);
  assert.equal(down.json.code, "node_offline");
});

test("the OpenAPI file describes exactly this version", async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "docs", "developer-openapi.json"), "utf8"));
  assert.equal(spec.openapi, "3.1.0");
  for (const p of ["/health", "/accounts/request-code", "/accounts/verify-code", "/accounts/me",
    "/accounts/sign-out", "/keys", "/keys/{id}/rotate", "/keys/{id}/revoke", "/destinations", "/destinations/{id}/prove"])
    assert.ok(spec.paths[p], `spec documents ${p}`);
});
