// Developer API PR4 (issue #421): the sandbox simulator. The sandbox path is
// asserted to use no network and no node at all: both fetchers throw if called.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-dev4-")));
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

// The sandbox must never touch the network or the node: both seams explode.
let netCalls = 0, nodeCalls = 0;
dev.setDevapiFetcher(async () => { netCalls++; throw new Error("sandbox used the network"); });
dev.setDevapiInvoicer({ create: async () => { nodeCalls++; throw new Error("sandbox used the node"); }, paid: async () => { nodeCalls++; return false; } });
dev.setDevapiWebhookFetcher(async () => new Response("ok", { status: 200 }));

const call = async (method, p, { body, token } = {}) => {
  const fn = method === "GET" ? api.GET : api.POST;
  const r = await fn(new Request(`https://altradits.test/api/dev/${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  }));
  return { status: r.status, json: await r.json() };
};
let n = 0;
const ctx = async () => {
  n++;
  const mailbox = `sb${n}@example.com`;
  await call("POST", "v1/accounts/request-code", { body: { email: mailbox } });
  const me = (await call("POST", "v1/accounts/verify-code", { body: { email: mailbox, code: lastCode() } })).json;
  const sb = (await call("POST", "v1/keys", { token: me.session, body: { sandbox: true } })).json.key;
  return { ...me, sb };
};

test("the simulator registers verified at once, with no payment and no network", async () => {
  const c = await ctx();
  const before = { net: netCalls, node: nodeCalls };
  const reg = await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.destination.verified, true);
  assert.equal(reg.json.destination.proof, "sandbox-simulator");
  assert.equal(reg.json.challenge, null);
  assert.deepEqual({ net: netCalls, node: nodeCalls }, before);
  const dupe = await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } });
  assert.equal(dupe.status, 409);
});

test("only the simulator lives in the sandbox, and only there", async () => {
  const c = await ctx();
  const live = await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com" } });
  assert.equal(live.json.code, "bad_address");
  const real = await call("POST", "v1/destinations", { token: c.session, body: { address: "shop@wallet.test", sandbox: true } });
  assert.equal(real.status, 422);
  assert.equal(real.json.code, "sandbox_address_only");
});

test("sandbox invoices use signet encoding and settle through the simulator", async () => {
  const c = await ctx();
  const d = (await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } })).json.destination;
  const made = await call("POST", "v1/invoices", { token: c.sb, body: { destinationId: d.id, sats: 2500 } });
  assert.equal(made.status, 201);
  assert.ok(made.json.invoice.bolt11.startsWith("lntb"), "signet encoding, unpayable on mainnet");
  assert.equal(made.json.invoice.sandbox, true);
  const pending = await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.sb });
  assert.equal(pending.json.invoice.status, "pending");
  assert.equal(pending.json.verifySupported, true);
  const done = await call("POST", "v1/sandbox/settle", { token: c.sb, body: { invoiceId: made.json.invoice.id } });
  assert.equal(done.json.invoice.status, "settled");
  assert.ok(done.json.invoice.settledAt);
  assert.ok(done.json.invoice.preimage);
  const again = await call("POST", "v1/sandbox/settle", { token: c.sb, body: { invoiceId: made.json.invoice.id } });
  assert.equal(again.json.invoice.status, "settled", "settling twice settles once");
  // The fee came off the free test balance.
  const bal = (await call("GET", "v1/balance", { token: c.session })).json.balance;
  assert.deepEqual(bal, { live: 0, test: 10000 - dev.feeFor(2500) });
  assert.equal(dev.feeFor(2500), 13);
});

test("the simulator refuses live invoices and live keys", async () => {
  const c = await ctx();
  const liveKey = (await call("POST", "v1/keys", { token: c.session, body: {} })).json.key;
  // A live invoice can't be built without the network, so settle one by id shape:
  // unknown ids 404, and a live key can't reach a sandbox invoice at all.
  const d = (await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } })).json.destination;
  const made = await call("POST", "v1/invoices", { token: c.sb, body: { destinationId: d.id, sats: 10 } });
  assert.equal((await call("POST", "v1/sandbox/settle", { token: liveKey, body: { invoiceId: made.json.invoice.id } })).status, 404);
  assert.equal((await call("POST", "v1/sandbox/settle", { token: c.sb, body: { invoiceId: "no-such-invoice" } })).status, 404);
  // A session (the dashboard) can settle a sandbox invoice.
  assert.equal((await call("POST", "v1/sandbox/settle", { token: c.session, body: { invoiceId: made.json.invoice.id } })).json.invoice.status, "settled");
});

test("sandbox webhooks fire on simulated settlement", async () => {
  const c = await ctx();
  const d = (await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } })).json.destination;
  const wh = await call("POST", "v1/webhooks", { token: c.sb, body: { url: "https://example.com/sb", sandbox: true } });
  assert.equal(wh.status, 201);
  const made = await call("POST", "v1/invoices", { token: c.sb, body: { destinationId: d.id, sats: 15 } });
  await call("POST", "v1/sandbox/settle", { token: c.sb, body: { invoiceId: made.json.invoice.id } });
  const end = Date.now() + 3000;
  for (;;) {
    const log = await dev.listDeliveries(c.account.id, wh.json.webhook.id, {});
    if (log.deliveries.length === 1 && log.deliveries[0].done) break;
    if (Date.now() > end) throw new Error("webhook never fired");
    await new Promise((r) => setTimeout(r, 25));
  }
});

test("the sandbox runs while mainnet is off", async () => {
  delete process.env.DEVAPI;
  try {
    const c = await ctx();
    const d = (await call("POST", "v1/destinations", { token: c.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } })).json.destination;
    assert.equal(d.verified, true);
    const made = await call("POST", "v1/invoices", { token: c.sb, body: { destinationId: d.id, sats: 20 } });
    assert.equal(made.status, 201);
    assert.equal((await call("POST", "v1/sandbox/settle", { token: c.sb, body: { invoiceId: made.json.invoice.id } })).json.invoice.status, "settled");
    const noLive = await call("POST", "v1/keys", { token: c.session, body: {} });
    assert.equal(noLive.json.code, "api_off");
  } finally {
    process.env.DEVAPI = "on";
  }
});

test("the spec covers the simulator", async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "developer-openapi.json"), "utf8"));
  assert.ok(spec.paths["/sandbox/settle"], "spec documents /sandbox/settle");
  assert.match(JSON.stringify(spec.paths["/destinations"].post), /simulator/, "destinations say the sandbox only serves the simulator");
});
