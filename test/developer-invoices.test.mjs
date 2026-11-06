// Developer API PR2 (issue #421): invoices, settlement verify, webhooks.
// The destination's LNURL server, the price feed, the node and the webhook
// target are all stubbed: no real network or node is touched here.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-dev2-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "DEVAPI", "DEVAPI_SANDBOX", "ADMIN_TOKEN", "LND_REST_URL", "LND_INVOICE_MACAROON", "LND_READONLY_MACAROON"]) delete process.env[k];
Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on", SITE_URL: "https://altradits.test", ADMIN_TOKEN: "dev-test-admin-token" });

const dev = await import("../lib/devapi.js");
const api = await import("../api/dev.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const repo = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const outbox = [];
email.setMailer({ sendMail: async (m) => { outbox.push(m); return { accepted: [m.to] }; } });
const lastCode = () => outbox.at(-1).text.match(/code is (\d{8})/)[1];
dev.setDevapiRates({ btcUsd: 100000, btcKes: 12900000 });

// --- stub node invoicer: destination challenges only, calls counted -----------
const node = { paidHashes: new Set(), creates: 0 };
dev.setDevapiInvoicer({
  create: async () => {
    node.creates++;
    const h = crypto.randomBytes(32).toString("hex");
    return { provider: "lnd", bolt11: `lnbc10n1challenge${h.slice(0, 8)}`, paymentHash: h,
      expiresAt: new Date(Date.now() + 3600e3).toISOString() };
  },
  paid: async (inv) => node.paidHashes.has(inv.paymentHash),
});

// --- a BOLT11-shaped invoice with exact amount, payment hash and description hash
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
const invoice = (msats, hashHex, dhashHex) => {
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hashHex)];
  if (dhashHex) words.push(23, 1, 20, ...w5(dhashHex));
  words.push(...Array(20).fill(0));
  return `lnbc${msats / 100}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq";
};

// --- stub destination wallet ---------------------------------------------------
const META = (id) => JSON.stringify([["text/plain", `Pay ${id}`], ["text/identifier", id]]);
const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const wallet = { settled: new Map(), lastPr: null, lastComment: null, freeze: false, frozen: null };
dev.setDevapiFetcher(async (raw) => {
  const u = new URL(String(raw));
  if (u.hostname !== "wallet.test") throw new Error(`unexpected host ${u.hostname}`);
  const pay = u.pathname.match(/^\/\.well-known\/lnurlp\/(\w+)$/);
  if (pay && u.searchParams.get("amount") === null) {
    const id = `${pay[1]}@wallet.test`;
    return J({ tag: "payRequest", callback: `https://wallet.test/cb/${pay[1]}`, minSendable: 1000, maxSendable: 100000000,
      metadata: META(id), commentAllowed: 200 });
  }
  const cb = u.pathname.match(/^\/cb\/(\w+)$/);
  if (cb) {
    const msats = Number(u.searchParams.get("amount"));
    const id = `${cb[1]}@wallet.test`;
    wallet.lastComment = u.searchParams.get("comment");
    if (cb[1] === "err") return J({ status: "ERROR", reason: "Till closed." });
    if (wallet.freeze && wallet.frozen) { wallet.lastPr = wallet.frozen.pr; return J(wallet.frozen); }
    const hash = crypto.randomBytes(32).toString("hex");
    const dhash = cb[1] === "wronghash" ? crypto.createHash("sha256").update("something else").digest("hex")
      : crypto.createHash("sha256").update(META(id)).digest("hex");
    const pr = cb[1] === "nohash" ? `lnbc${msats / 100}n1${"q".repeat(200)}` : invoice(cb[1] === "wrongamt" ? msats + 1000 : msats, hash, dhash);
    const out = { pr };
    if (cb[1] !== "noverify") out.verify = `https://wallet.test/verify/${hash}`;
    wallet.settled.set(hash, wallet.settled.get(hash) || false);
    wallet.lastPr = pr;
    if (wallet.freeze) wallet.frozen = out;
    return J(out);
  }
  const v = u.pathname.match(/^\/verify\/([0-9a-f]{64})$/);
  if (v) return J({ settled: wallet.settled.get(v[1]) === true, preimage: wallet.settled.get(v[1]) === true ? "11".repeat(32) : null });
  return J({ status: "ERROR", reason: "No." }, 404);
});

// --- stub webhook target: captures deliveries, fails on demand -----------------
const hooks = { calls: [], mode: "ok" }; // ok | fail
dev.setDevapiWebhookFetcher(async (raw, opts = {}) => {
  hooks.calls.push({ url: String(raw), headers: opts.headers || {}, body: String(opts.body || "") });
  if (hooks.mode === "fail") return new Response("no", { status: 500 });
  return new Response("ok", { status: 200 });
});

// --- calling the API ------------------------------------------------------------
const call = async (method, p, { body, token, idem } = {}) => {
  const fn = method === "GET" ? api.GET : api.POST;
  const r = await fn(new Request(`https://altradits.test/api/dev/${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  }));
  return { status: r.status, json: await r.json() };
};
let n = 0;
const ctx = async (scopes = ["invoices:create", "invoices:read", "webhooks"]) => {
  n++;
  const mailbox = `dev${n}@example.com`;
  await call("POST", "v1/accounts/request-code", { body: { email: mailbox } });
  const me = (await call("POST", "v1/accounts/verify-code", { body: { email: mailbox, code: lastCode() } })).json;
  const key = (await call("POST", "v1/keys", { token: me.session, body: { scopes } })).json.key;
  // Live invoices need fee credit: fund the account through a top-up.
  const top = (await call("POST", "v1/topups", { token: me.session, body: { sats: 50000 } })).json;
  assert.equal(top.topup.status, "pending");
  node.paidHashes.add((await store.getJSON(`dev:top:${top.topup.id}`)).paymentHash);
  assert.equal((await call("GET", `v1/topups/${top.topup.id}`, { token: me.session })).json.topup.status, "credited");
  return { ...me, key };
};
const dest = async (c, user, sandbox = false) => {
  const reg = await call("POST", "v1/destinations", { token: c.session, body: { address: `${user}@wallet.test`, sandbox } });
  assert.equal(reg.status, 201, `register ${user}: ${JSON.stringify(reg.json)}`);
  const rec = await store.getJSON(`dev:dest:${reg.json.destination.id}`);
  node.paidHashes.add(rec.challenge.paymentHash);
  const proven = await call("POST", `v1/destinations/${reg.json.destination.id}/prove`, { token: c.session });
  assert.equal(proven.json.destination.verified, true);
  return proven.json.destination;
};
const sim = async (c) => {
  const reg = await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } });
  assert.equal(reg.status, 201, `register simulator: ${JSON.stringify(reg.json)}`);
  assert.equal(reg.json.destination.verified, true);
  return reg.json.destination;
};
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
};

test("create, get, list and pagination", async () => {
  const c = await ctx();
  const d = await dest(c, "shop");
  const one = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 5000, memo: "order 7" } });
  assert.equal(one.status, 201);
  assert.equal(one.json.invoice.sats, 5000);
  assert.equal(one.json.invoice.address, "shop@wallet.test");
  assert.equal(one.json.invoice.status, "pending");
  assert.equal(one.json.invoice.memo, "order 7");
  assert.equal(one.json.invoice.verifySupported, true);
  assert.equal(one.json.invoice.bolt11, wallet.lastPr, "the invoice is the destination's own reply, passed through");
  assert.equal(wallet.lastComment, "order 7", "the memo goes as the LNURL comment");

  const got = await call("GET", `v1/invoices/${one.json.invoice.id}`, { token: c.key });
  assert.equal(got.json.invoice.id, one.json.invoice.id);

  await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 10 } });
  await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 20 } });
  const p1 = await call("GET", "v1/invoices?limit=2", { token: c.key });
  assert.equal(p1.json.invoices.length, 2);
  assert.ok(p1.json.nextCursor);
  const p2 = await call("GET", `v1/invoices?limit=2&cursor=${p1.json.nextCursor}`, { token: c.key });
  assert.equal(p2.json.invoices.length, 1);
  assert.equal(p2.json.nextCursor, null);
  const ids = [...p1.json.invoices, ...p2.json.invoices].map((i) => i.id);
  assert.equal(new Set(ids).size, 3, "every invoice exactly once across pages");

  assert.equal((await call("GET", "v1/invoices/does-not-exist", { token: c.key })).status, 404);
});

test("amounts: sats, fiat, bounds and the destination's limits", async () => {
  const c = await ctx();
  const d = await dest(c, "amounts");
  const usd = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, fiat: { amount: 10, currency: "USD" } } });
  assert.equal(usd.json.invoice.sats, 10000);
  assert.deepEqual(usd.json.invoice.fiat, { amount: 10, currency: "USD", btcRate: 100000 });
  const kes = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, fiat: { amount: 1290, currency: "KES" } } });
  assert.equal(kes.json.invoice.sats, 10000);
  for (const [body, code] of [
    [{ destinationId: d.id }, "bad_amount"],
    [{ destinationId: d.id, sats: 0 }, "bad_amount"],
    [{ destinationId: d.id, sats: 100000001 }, "bad_amount"],
    [{ destinationId: d.id, sats: 5, fiat: { amount: 1, currency: "USD" } }, "bad_amount"],
    [{ destinationId: d.id, fiat: { amount: 1, currency: "EUR" } }, "bad_currency"],
    [{ destinationId: d.id, sats: 200000 }, "amount_out_of_range"],
  ]) {
    const r = await call("POST", "v1/invoices", { token: c.key, body });
    assert.equal(r.json.code, code, `${JSON.stringify(body)} refused as ${code}, got ${r.json.code}`);
  }
  const missing = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: "no-such-dest", sats: 5 } });
  assert.equal(missing.status, 404);
});

test("a destination that answers wrong is refused and reported", async () => {
  const c = await ctx();
  for (const [user, code] of [["wrongamt", "invoice_mismatch"], ["wronghash", "invoice_mismatch"],
    ["nohash", "invoice_untracked"], ["err", "address_unreachable"]]) {
    const d = await dest(c, user);
    const r = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 50 } });
    assert.equal(r.json.code, code, `${user} refused as ${code}, got ${r.json.code}`);
  }
  const { securityView } = await import("../lib/attacks.js");
  const kinds = (await securityView(500)).events.map((e) => e.kind);
  assert.ok(kinds.includes("invoice_substitution"), "substitution lands in the Security watch");
});

test("idempotency replays, conflicts loudly, and repeated invoices dedupe", async () => {
  const c = await ctx();
  const d = await dest(c, "idem");
  const a = await call("POST", "v1/invoices", { token: c.key, idem: "order-1", body: { destinationId: d.id, sats: 77 } });
  const b = await call("POST", "v1/invoices", { token: c.key, idem: "order-1", body: { destinationId: d.id, sats: 77 } });
  assert.equal(b.status, 200);
  assert.equal(b.json.deduplicated, true);
  assert.equal(b.json.invoice.id, a.json.invoice.id);
  const clash = await call("POST", "v1/invoices", { token: c.key, idem: "order-1", body: { destinationId: d.id, sats: 78 } });
  assert.equal(clash.json.code, "idempotency_conflict");
  const list = await call("GET", "v1/invoices", { token: c.key });
  assert.equal(list.json.invoices.length, 1, "one invoice, not three");

  wallet.freeze = true;
  const f1 = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 91 } });
  const f2 = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 91 } });
  wallet.freeze = false;
  wallet.frozen = null;
  assert.equal(f1.json.invoice.id, f2.json.invoice.id, "the same payment hash reuses its record");
});

test("settlement: verify settles, silence stays pending, hashes verify", async () => {
  const c = await ctx();
  const d = await dest(c, "settle");
  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 300 } });
  const id = made.json.invoice.id, hash = made.json.invoice.paymentHash;
  assert.equal((await call("GET", `v1/invoices/${id}`, { token: c.key })).json.invoice.status, "pending");
  wallet.settled.set(hash, true);
  const done = await call("GET", `v1/invoices/${id}`, { token: c.key });
  assert.equal(done.json.invoice.status, "settled");
  assert.ok(done.json.invoice.settledAt);
  assert.equal(done.json.invoice.preimage, "11".repeat(32));
  const byHash = await call("GET", `v1/verify/${hash}`, { token: c.key });
  assert.equal(byHash.json.invoice.status, "settled");
  assert.equal((await call("GET", `v1/verify/${"ab".repeat(32)}`, { token: c.key })).status, 404);
  assert.equal((await call("GET", "v1/verify/zzz", { token: c.key })).status, 404);

  const quiet = await dest(c, "noverify");
  const q = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: quiet.id, sats: 300 } });
  const qs = await call("GET", `v1/invoices/${q.json.invoice.id}`, { token: c.key });
  assert.equal(qs.json.verifySupported, false);
  assert.equal(qs.json.invoice.status, "pending");
  assert.match(qs.json.note, /Confirm in your wallet/, "the silence is stated plainly");
});

test("lockdown freezes new invoices; reads still work", async () => {
  const c = await ctx();
  const d = await dest(c, "lock");
  const before = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 40 } });
  assert.equal(before.status, 201);
  const deadman = await import("../lib/deadman.js");
  await deadman.tripDeadman({ trigger: "manual", reason: "Developer API test" });
  try {
    const frozen = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 40 } });
    assert.equal(frozen.status, 503);
    assert.equal(frozen.json.code, "lockdown_freeze");
    assert.equal((await call("GET", `v1/invoices/${before.json.invoice.id}`, { token: c.key })).status, 200);
  } finally {
    await deadman.liftDeadman({ by: "stanley", force: "force", note: "Developer API test over" });
  }
  const after = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 40 } });
  assert.equal(after.status, 201);
});

test("webhooks: register, signed delivery, retries with backoff, then dead", async () => {
  const c = await ctx();
  const d = await dest(c, "hooks");
  for (const url of ["http://example.com/h", "https://user@example.com/h", "https://93.184.216.34/h", "https://nodot/h", "not-a-url"]) {
    const r = await call("POST", "v1/webhooks", { token: c.key, body: { url } });
    assert.equal(r.json.code, "bad_webhook_url", `${url} refused`);
  }
  const reg = await call("POST", "v1/webhooks", { token: c.key, body: { url: "https://example.com/hooks/invoices" } });
  assert.equal(reg.status, 201);
  const secret = reg.json.secret;
  assert.ok(secret && secret.length >= 32);
  const listed = await call("GET", "v1/webhooks", { token: c.key });
  assert.ok(!("secret" in listed.json.webhooks[0]), "listing never reveals a secret");

  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 600 } });
  hooks.calls.length = 0;
  wallet.settled.set(made.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.key });
  await waitFor(() => hooks.calls.length === 1);
  const sent = hooks.calls[0];
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sent.headers["X-Dev-Signature"]);
  assert.ok(m, "Stripe-style signature header");
  assert.ok(Math.abs(Date.now() / 1000 - Number(m[1])) < 300, "timestamp within the replay window");
  assert.equal(m[2], crypto.createHmac("sha256", secret).update(`${m[1]}.${sent.body}`).digest("hex"), "signature verifies");
  assert.equal(JSON.parse(sent.body).event, "invoice.settled");

  // Retries: fail every attempt, watch the backoff, then death.
  hooks.mode = "fail";
  const made2 = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 601 } });
  wallet.settled.set(made2.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made2.json.invoice.id}`, { token: c.key });
  const log = await waitFor(async () => {
    const l = await dev.listDeliveries(c.account.id, reg.json.webhook.id, {});
    return l.deliveries.find((x) => x.invoiceId === made2.json.invoice.id && x.attempts.length >= 1) || null;
  });
  for (const [i, want] of [60, 300, 1800, 7200, 43200].entries()) {
    const cur = (await dev.listDeliveries(c.account.id, reg.json.webhook.id, {})).deliveries.find((x) => x.id === log.id);
    const wait = Math.round((Date.parse(cur.nextAt) - Date.parse(cur.attempts.at(-1).at)) / 1000);
    assert.ok(Math.abs(wait - want) <= 2, `retry ${i + 1} waits about ${want}s, got ${wait}s`);
    await dev.attemptDelivery(log.id);
  }
  const dl = (await dev.listDeliveries(c.account.id, reg.json.webhook.id, {})).deliveries.find((x) => x.id === log.id);
  assert.equal(dl.attempts.length, 6, "first try plus five retries");
  assert.equal(dl.done, true);
  assert.equal(dl.dead, true);
  assert.equal(dl.nextAt, null);
  hooks.mode = "ok";

  // Disabling stops new deliveries; the log stays.
  await call("POST", `v1/webhooks/${reg.json.webhook.id}/disable`, { token: c.key });
  const made3 = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 602 } });
  wallet.settled.set(made3.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made3.json.invoice.id}`, { token: c.key });
  await new Promise((r) => setTimeout(r, 300));
  const after = await dev.listDeliveries(c.account.id, reg.json.webhook.id, {});
  assert.ok(!after.deliveries.some((x) => x.invoiceId === made3.json.invoice.id), "disabled endpoints get nothing new");
  assert.ok(after.deliveries.length >= 2, "the old deliveries stay in the log");
});

test("the retry pump runs due deliveries and skips the rest", async () => {
  const c = await ctx();
  const d = await dest(c, "pump");
  hooks.mode = "fail";
  const reg = await call("POST", "v1/webhooks", { token: c.key, body: { url: "https://example.com/h2" } });
  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 700 } });
  wallet.settled.set(made.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.key });
  const one = await waitFor(async () => {
    const l = await dev.listDeliveries(c.account.id, reg.json.webhook.id, {});
    return l.deliveries.find((x) => x.attempts.length >= 1) || null;
  });
  assert.equal(one.done, false);
  // Not due yet: the pump leaves it alone.
  assert.equal((await dev.pumpWebhooks()).attempted, 0);
  // Due: the pump tries again (and fails again, still failing).
  const rec = await store.getJSON(`dev:whe:${one.id}`);
  rec.nextAt = new Date(Date.now() - 1000).toISOString();
  await store.setJSON(`dev:whe:${one.id}`, rec);
  hooks.mode = "ok";
  assert.equal((await dev.pumpWebhooks()).attempted, 1);
  const two = (await dev.listDeliveries(c.account.id, reg.json.webhook.id, {})).deliveries.find((x) => x.id === one.id);
  assert.equal(two.done, true);
  assert.equal(two.dead, false);
  // Both switches off: the pump waits.
  delete process.env.DEVAPI;
  delete process.env.DEVAPI_SANDBOX;
  assert.equal((await dev.pumpWebhooks()).ran, false);
  Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on" });
});

test("keys, scopes and environments stay separated", async () => {
  const c = await ctx(["invoices:read"]);
  const live = await call("POST", "v1/keys", { token: c.session, body: { scopes: ["invoices:create", "invoices:read", "webhooks"] } });
  const sb = await call("POST", "v1/keys", { token: c.session, body: { sandbox: true } });
  const dLive = await dest(c, "seplive");
  const dSb = await sim(c);

  const scoped = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: dLive.id, sats: 5 } });
  assert.equal(scoped.status, 403);
  assert.equal(scoped.json.code, "forbidden_scope");
  const cross = await call("POST", "v1/invoices", { token: sb.json.key, body: { destinationId: dLive.id, sats: 5 } });
  assert.equal(cross.status, 404);
  const made = await call("POST", "v1/invoices", { token: live.json.key, body: { destinationId: dLive.id, sats: 5 } });
  assert.equal((await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: sb.json.key })).status, 404);
  const madeSb = await call("POST", "v1/invoices", { token: sb.json.key, body: { destinationId: dSb.id, sats: 5 } });
  assert.equal(madeSb.status, 201);

  // Webhooks fire only in their own environment.
  const wl = await call("POST", "v1/webhooks", { token: live.json.key, body: { url: "https://example.com/live" } });
  const ws = await call("POST", "v1/webhooks", { token: sb.json.key, body: { url: "https://example.com/sb", sandbox: true } });
  await call("POST", "v1/sandbox/settle", { token: sb.json.key, body: { invoiceId: madeSb.json.invoice.id } });
  await waitFor(async () => (await dev.listDeliveries(c.account.id, ws.json.webhook.id, {})).deliveries.length === 1);
  assert.equal((await dev.listDeliveries(c.account.id, wl.json.webhook.id, {})).deliveries.length, 0);
  // A key sees only its environment's endpoints; a session sees all.
  assert.equal((await call("GET", "v1/webhooks", { token: sb.json.key })).json.webhooks.length, 1);
  assert.equal((await call("GET", "v1/webhooks", { token: c.session })).json.webhooks.length, 2);

  // Sessions don't work on key routes; unknown keys are logged as guessing.
  assert.equal((await call("POST", "v1/invoices", { token: c.session, body: {} })).status, 401);
  const bad = await call("POST", "v1/invoices", { token: "ak_live_bogusssssssssssssssssssssssssss", body: {} });
  assert.equal(bad.status, 401);
  const { securityView } = await import("../lib/attacks.js");
  assert.ok((await securityView(500)).events.some((e) => e.kind === "dev_key_guess"), "key guessing lands in the Security watch");
});

test("dashboard sessions read invoices in both environments but create nothing", async () => {
  const c = await ctx();
  const live = (await call("POST", "v1/keys", { token: c.session, body: {} })).json.key;
  const sb = (await call("POST", "v1/keys", { token: c.session, body: { sandbox: true } })).json.key;
  const dLive = await dest(c, "sesslive");
  const dSb = await sim(c);
  const a = await call("POST", "v1/invoices", { token: live, body: { destinationId: dLive.id, sats: 11 } });
  const b = await call("POST", "v1/invoices", { token: sb, body: { destinationId: dSb.id, sats: 12 } });
  const list = await call("GET", "v1/invoices", { token: c.session });
  assert.equal(list.json.invoices.length, 2, "a session sees both environments, flagged");
  assert.deepEqual(list.json.invoices.map((i) => i.sandbox).sort(), [false, true]);
  assert.equal((await call("GET", `v1/invoices/${a.json.invoice.id}`, { token: c.session })).json.invoice.id, a.json.invoice.id);
  assert.equal((await call("GET", `v1/verify/${b.json.invoice.paymentHash}`, { token: c.session })).json.invoice.id, b.json.invoice.id);
  assert.equal((await call("POST", "v1/invoices", { token: c.session, body: { destinationId: dLive.id, sats: 5 } })).status, 401);
});

test("invoice rate limits hold per key", async () => {
  const c = await ctx();
  const d = await dest(c, "flood");
  let limited = 0;
  for (let i = 0; i < 101; i++) {
    const r = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 5 } });
    if (r.status === 429) limited++;
  }
  assert.equal(limited, 1, "the 101st invoice in an hour is refused");
});

test("the node is never written to and customer money never lands on Altradits", async () => {
  const c = await ctx();
  const d = await dest(c, "clean");
  const createsBefore = node.creates;
  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 800 } });
  assert.equal(made.status, 201);
  wallet.settled.set(made.json.invoice.paymentHash, true);
  assert.equal((await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.key })).json.invoice.status, "settled");
  assert.equal(node.creates, createsBefore, "no node invoice was created for a customer payment");
  const src = repo("lib/devapi.js");
  for (const write of ["payInvoice", "router/send", "SendPayment", "/v1/transactions", "newaddress"])
    assert.ok(!src.includes(write), `devapi.js never calls the node write path ${write}`);
});

test("the retry pump is wired to the health pings and the spec covers v1", async () => {
  assert.match(repo("server.mjs"), /pumpWebhooks/, "server.mjs dueJobs pumps webhook retries");
  const spec = JSON.parse(repo("docs/developer-openapi.json"));
  assert.equal(spec.openapi, "3.1.0");
  for (const p of ["/invoices", "/invoices/{id}", "/verify/{hash}", "/webhooks", "/webhooks/{id}/disable", "/webhooks/{id}/deliveries"])
    assert.ok(spec.paths[p], `spec documents ${p}`);
});
