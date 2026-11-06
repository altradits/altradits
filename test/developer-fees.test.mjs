// Developer API PR3 (issue #421): fee credits and statements. The node and
// the destination wallet are stubbed: no real money moves here.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-dev3-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "DEVAPI", "DEVAPI_SANDBOX", "ADMIN_TOKEN", "LND_REST_URL", "LND_INVOICE_MACAROON"]) delete process.env[k];
Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on", SITE_URL: "https://altradits.test", ADMIN_TOKEN: "dev-test-admin-token" });

const dev = await import("../lib/devapi.js");
const api = await import("../api/dev.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

const outbox = [];
email.setMailer({ sendMail: async (m) => { outbox.push(m); return { accepted: [m.to] }; } });
const lastCode = () => outbox.at(-1).text.match(/code is (\d{8})/)[1];

// --- stub node: receive invoices with the asked amount --------------------------------
const node = { paidHashes: new Set(), offline: false, lastSats: 0 };
dev.setDevapiInvoicer({
  create: async ({ sats }) => {
    if (node.offline) throw new Error("node down");
    node.lastSats = sats;
    const h = crypto.randomBytes(32).toString("hex");
    return { provider: "lnd", bolt11: `lnbc${sats}0n1topup${h.slice(0, 8)}`, paymentHash: h,
      expiresAt: new Date(Date.now() + 3600e3).toISOString() };
  },
  paid: async (inv) => node.paidHashes.has(inv.paymentHash),
});

// --- stub destination wallet ------------------------------------------------------------
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
const META = (id) => JSON.stringify([["text/plain", `Pay ${id}`], ["text/identifier", id]]);
const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const wallet = { settled: new Map() };
dev.setDevapiFetcher(async (raw) => {
  const u = new URL(String(raw));
  const pay = u.pathname.match(/^\/\.well-known\/lnurlp\/(\w+)$/);
  if (pay && u.searchParams.get("amount") === null) {
    const id = `${pay[1]}@wallet.test`;
    return J({ tag: "payRequest", callback: `https://wallet.test/cb/${pay[1]}`, minSendable: 1000, maxSendable: 100000000,
      metadata: META(id), commentAllowed: 0 });
  }
  const cb = u.pathname.match(/^\/cb\/(\w+)$/);
  if (cb) {
    const msats = Number(u.searchParams.get("amount"));
    const hash = crypto.randomBytes(32).toString("hex");
    const dhash = crypto.createHash("sha256").update(META(`${cb[1]}@wallet.test`)).digest("hex");
    const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hash), 23, 1, 20, ...w5(dhash), ...Array(20).fill(0)];
    const pr = `lnbc${msats / 100}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq";
    wallet.settled.set(hash, wallet.settled.get(hash) || false);
    return J({ pr, verify: `https://wallet.test/verify/${hash}` });
  }
  const v = u.pathname.match(/^\/verify\/([0-9a-f]{64})$/);
  if (v) return J({ settled: wallet.settled.get(v[1]) === true });
  return J({ status: "ERROR", reason: "No." }, 404);
});

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
const ctx = async () => {
  n++;
  const mailbox = `fee${n}@example.com`;
  await call("POST", "v1/accounts/request-code", { body: { email: mailbox } });
  const me = (await call("POST", "v1/accounts/verify-code", { body: { email: mailbox, code: lastCode() } })).json;
  const key = (await call("POST", "v1/keys", { token: me.session, body: {} })).json.key;
  const sb = (await call("POST", "v1/keys", { token: me.session, body: { sandbox: true } })).json.key;
  return { ...me, key, sb };
};
const dest = async (c, user, sandbox = false) => {
  const reg = await call("POST", "v1/destinations", { token: c.session, body: { address: `${user}@wallet.test`, sandbox } });
  assert.equal(reg.status, 201, `register ${user}: ${JSON.stringify(reg.json)}`);
  node.paidHashes.add((await store.getJSON(`dev:dest:${reg.json.destination.id}`)).challenge.paymentHash);
  return (await call("POST", `v1/destinations/${reg.json.destination.id}/prove`, { token: c.session })).json.destination;
};
const topup = async (c, sats) => {
  const t = await call("POST", "v1/topups", { token: c.session, body: { sats } });
  assert.equal(t.status, 201, `top up ${sats}: ${JSON.stringify(t.json)}`);
  node.paidHashes.add((await store.getJSON(`dev:top:${t.json.topup.id}`)).paymentHash);
  const credited = await call("GET", `v1/topups/${t.json.topup.id}`, { token: c.session });
  assert.equal(credited.json.topup.status, "credited");
  return credited.json.topup;
};
const balance = async (c) => (await call("GET", "v1/balance", { token: c.session })).json.balance;

test("fee maths: 0.5% rounded up, minimum 1 sat", async () => {
  for (const [sats, fee] of [[1, 1], [100, 1], [199, 1], [200, 1], [201, 2], [300, 2], [1000, 5], [100000, 500], [100000000, 500000]])
    assert.equal(dev.feeFor(sats), fee, `${sats} sats costs ${fee}`);
});

test("top-ups: invoice, credit once, bounds and failures", async () => {
  const c = await ctx();
  assert.deepEqual(await balance(c), { live: 0, test: 0 });
  const t = await call("POST", "v1/topups", { token: c.session, body: { sats: 1000 } });
  assert.equal(t.status, 201);
  assert.equal(t.json.topup.status, "pending");
  assert.equal(node.lastSats, 1000, "the node invoice is for the top-up amount");
  assert.equal((await call("GET", `v1/topups/${t.json.topup.id}`, { token: c.session })).json.topup.status, "pending");
  node.paidHashes.add((await store.getJSON(`dev:top:${t.json.topup.id}`)).paymentHash);
  assert.equal((await call("GET", `v1/topups/${t.json.topup.id}`, { token: c.session })).json.topup.status, "credited");
  assert.deepEqual(await balance(c), { live: 1000, test: 0 });
  // A second check credits nothing twice.
  await call("GET", `v1/topups/${t.json.topup.id}`, { token: c.session });
  assert.deepEqual(await balance(c), { live: 1000, test: 0 });
  assert.equal((await call("GET", "v1/topups", { token: c.session })).json.topups.length, 1);

  assert.equal((await call("POST", "v1/topups", { token: c.session, body: { sats: 99 } })).json.code, "bad_amount");
  node.offline = true;
  assert.equal((await call("POST", "v1/topups", { token: c.session, body: { sats: 100 } })).json.code, "node_offline");
  node.offline = false;
  const deadman = await import("../lib/deadman.js");
  await deadman.tripDeadman({ trigger: "manual", reason: "Developer API test" });
  try {
    assert.equal((await call("POST", "v1/topups", { token: c.session, body: { sats: 100 } })).json.code, "lockdown_freeze");
  } finally {
    await deadman.liftDeadman({ by: "stanley", force: "force", note: "Developer API test over" });
  }
});

test("an empty balance refuses new invoices; settling deducts the fee", async () => {
  const c = await ctx();
  const d = await dest(c, "gate");
  const broke = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 300 } });
  assert.equal(broke.status, 402);
  assert.equal(broke.json.code, "insufficient_credits");
  await topup(c, 1000);
  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 300 } });
  assert.equal(made.status, 201);
  assert.deepEqual(await balance(c), { live: 1000, test: 0 }, "creating deducts nothing; settling does");
  wallet.settled.set(made.json.invoice.paymentHash, true);
  assert.equal((await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.key })).json.invoice.status, "settled");
  assert.deepEqual(await balance(c), { live: 998, test: 0 }, "0.5% of 300 sats is 2 sats");
  // A fee bigger than the balance refuses, and says what is missing.
  const big = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 1000000 } });
  assert.equal(big.json.code, "insufficient_credits");
  assert.match(big.json.error, /5000 sats/);
});

test("simultaneous settlements floor the balance at zero and record the shortfall", async () => {
  const c = await ctx();
  const d = await dest(c, "race");
  await topup(c, 100);
  const a = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 200 } }); // fee 1
  const b = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 20000 } }); // fee 100
  wallet.settled.set(a.json.invoice.paymentHash, true);
  wallet.settled.set(b.json.invoice.paymentHash, true);
  await Promise.all([
    call("GET", `v1/invoices/${a.json.invoice.id}`, { token: c.key }),
    call("GET", `v1/invoices/${b.json.invoice.id}`, { token: c.key }),
  ]);
  assert.deepEqual(await balance(c), { live: 0, test: 0 });
  const st = await call("GET", "v1/statement", { token: c.session });
  const fees = st.json.entries.filter((e) => e.type === "fee");
  assert.equal(fees.length, 2);
  assert.equal(fees.reduce((t, e) => t - e.sats, 0), 100, "100 sats deducted in total");
  assert.equal(fees.reduce((t, e) => t + e.shortfall, 0), 1, "the 1-sat shortfall is on the record");
});

test("the statement shows the balance, the ledger and the totals", async () => {
  const c = await ctx();
  const d = await dest(c, "books");
  await topup(c, 500);
  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 1000 } });
  wallet.settled.set(made.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.key });
  const st = await call("GET", "v1/statement", { token: c.session });
  assert.deepEqual(st.json.balance, { live: 495, test: 0 });
  assert.deepEqual(st.json.totals, { toppedUp: 500, feesPaid: 5, settledVolume: 1000, settledCount: 1 });
  assert.deepEqual(st.json.entries.map((e) => e.type), ["fee", "topup"], "newest first");
  assert.equal(st.json.entries[0].balanceAfter, 495);
  assert.equal(st.json.entries[1].balanceAfter, 500);
  assert.equal(st.json.entries[0].invoiceId, made.json.invoice.id);
  // A key with read scope sees the same statement.
  assert.equal((await call("GET", "v1/statement", { token: c.key })).json.totals.settledCount, 1);
});

test("sandbox testing is free: a dry test balance refills itself", async () => {
  const c = await ctx();
  const d = await dest(c, "free", true);
  assert.deepEqual(await balance(c), { live: 0, test: 0 });
  const made = await call("POST", "v1/invoices", { token: c.sb, body: { destinationId: d.id, sats: 4000 } });
  assert.equal(made.status, 201);
  assert.deepEqual(await balance(c), { live: 0, test: 10000 }, "the grant landed before the invoice");
  wallet.settled.set(made.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.sb });
  assert.deepEqual(await balance(c), { live: 0, test: 9980 }, "the fee came off the test balance; live untouched");
  const st = await call("GET", "v1/statement", { token: c.session });
  assert.ok(st.json.entries.some((e) => e.type === "grant" && e.sats === 10000), "the grant is on the record");
});

test("concurrent credit checks credit a top-up once", async () => {
  const c = await ctx();
  const t = await call("POST", "v1/topups", { token: c.session, body: { sats: 700 } });
  node.paidHashes.add((await store.getJSON(`dev:top:${t.json.topup.id}`)).paymentHash);
  await Promise.all([
    call("GET", `v1/topups/${t.json.topup.id}`, { token: c.session }),
    call("GET", `v1/topups/${t.json.topup.id}`, { token: c.key }),
  ]);
  assert.deepEqual(await balance(c), { live: 700, test: 0 });
});

test("the spec covers the fee routes and states the refund rule", async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "developer-openapi.json"), "utf8"));
  for (const p of ["/topups", "/topups/{id}", "/balance", "/statement"]) assert.ok(spec.paths[p], `spec documents ${p}`);
  assert.match(JSON.stringify(spec), /non-refundable/, "the refund rule is written in the spec");
  assert.match(dev.REFUND_RULE, /non-refundable/);
});
