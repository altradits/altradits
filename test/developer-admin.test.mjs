// Developer API PR6 (issue #421): the admin Developer section. The node and
// the destination wallet are stubbed.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-dev6-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "DEVAPI", "DEVAPI_SANDBOX", "LND_REST_URL", "LND_INVOICE_MACAROON"]) delete process.env[k];
Object.assign(process.env, { DEVAPI: "on", DEVAPI_SANDBOX: "on", SITE_URL: "https://altradits.test", ADMIN_TOKEN: "dev-test-admin-token" });

const dev = await import("../lib/devapi.js");
const api = await import("../api/dev.js");
const admin = await import("../api/admin.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

const outbox = [];
email.setMailer({ sendMail: async (m) => { outbox.push(m); return { accepted: [m.to] }; } });
const lastCode = () => outbox.at(-1).text.match(/code is (\d{8})/)[1];
dev.setDevapiRates({ btcUsd: 100000, btcKes: 12900000 });

const node = { paidHashes: new Set() };
dev.setDevapiInvoicer({
  create: async () => {
    const h = crypto.randomBytes(32).toString("hex");
    return { provider: "lnd", bolt11: `lnbc10n1x${h.slice(0, 8)}`, paymentHash: h, expiresAt: new Date(Date.now() + 3600e3).toISOString() };
  },
  paid: async (inv) => node.paidHashes.has(inv.paymentHash),
});
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
    return J({ tag: "payRequest", callback: `https://wallet.test/cb/${pay[1]}`, minSendable: 1000, maxSendable: 100000000, metadata: META(id), commentAllowed: 0 });
  }
  const cb = u.pathname.match(/^\/cb\/(\w+)$/);
  if (cb) {
    const msats = Number(u.searchParams.get("amount"));
    const hash = crypto.randomBytes(32).toString("hex");
    const dhash = crypto.createHash("sha256").update(META(`${cb[1]}@wallet.test`)).digest("hex");
    const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hash), 23, 1, 20, ...w5(dhash), ...Array(20).fill(0)];
    wallet.settled.set(hash, wallet.settled.get(hash) || false);
    return J({ pr: `lnbc${msats / 100}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq", verify: `https://wallet.test/verify/${hash}` });
  }
  const v = u.pathname.match(/^\/verify\/([0-9a-f]{64})$/);
  if (v) return J({ settled: wallet.settled.get(v[1]) === true });
  return J({ status: "ERROR", reason: "No." }, 404);
});

const call = async (method, p, { body, token } = {}) => {
  const fn = method === "GET" ? api.GET : api.POST;
  const r = await fn(new Request(`https://altradits.test/api/dev/${p}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  }));
  return { status: r.status, json: await r.json() };
};
const adminCall = async (method, query, { body, token = "dev-test-admin-token" } = {}) => {
  const fn = method === "GET" ? admin.GET : admin.POST;
  const r = await fn(new Request(`https://altradits.test/api/admin${query}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  }));
  return { status: r.status, json: await r.json() };
};
let n = 0;
const ctx = async () => {
  n++;
  const mailbox = `adm${n}@example.com`;
  await call("POST", "v1/accounts/request-code", { body: { email: mailbox } });
  const me = (await call("POST", "v1/accounts/verify-code", { body: { email: mailbox, code: lastCode() } })).json;
  const key = (await call("POST", "v1/keys", { token: me.session, body: {} })).json;
  return { ...me, key: key.key, keyId: key.id };
};
const dest = async (c, user) => {
  const reg = await call("POST", "v1/destinations", { token: c.session, body: { address: `${user}@wallet.test` } });
  node.paidHashes.add((await store.getJSON(`dev:dest:${reg.json.destination.id}`)).challenge.paymentHash);
  return (await call("POST", `v1/destinations/${reg.json.destination.id}/prove`, { token: c.session })).json.destination;
};
const fund = async (c, sats) => {
  const t = await call("POST", "v1/topups", { token: c.session, body: { sats } });
  node.paidHashes.add((await store.getJSON(`dev:top:${t.json.topup.id}`)).paymentHash);
  await call("GET", `v1/topups/${t.json.topup.id}`, { token: c.session });
};
const settle = async (c, destId, sats) => {
  const made = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: destId, sats } });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  wallet.settled.set(made.json.invoice.paymentHash, true);
  await call("GET", `v1/invoices/${made.json.invoice.id}`, { token: c.key });
  return made.json.invoice;
};

test("the Developer view aggregates accounts, volume and live fees", async () => {
  const a = await ctx();
  const d = await dest(a, "shop");
  await fund(a, 1000);
  await settle(a, d.id, 1000); // fee 5
  const b = await ctx(); // quiet account, sandbox only
  await call("POST", "v1/destinations", { token: b.session, body: { address: "dev@sandbox.altradits.com", sandbox: true } });

  const v = await adminCall("GET", "?view=developer");
  assert.equal(v.status, 200);
  assert.deepEqual(v.json.switches, { api: true, sandbox: true });
  assert.equal(v.json.accountCount, 2);
  assert.equal(v.json.feesEarnedLive, 5);
  assert.equal(v.json.settledVolumeLive, 1000);
  assert.equal(v.json.totals.live.settledCount, 1);
  const got = v.json.accounts.find((x) => x.email === "adm1@example.com");
  assert.deepEqual(got.balance, { live: 995, test: 0 });
  assert.equal(got.keys.length, 1);
  assert.equal(got.activeKeys, 1);
  assert.equal(got.verifiedDestinations, 1);
  assert.equal(v.json.guessing.key.today, 0);
});

test("shortfalls and suspensions are flagged", async () => {
  const c = await ctx();
  const d = await dest(c, "race");
  await fund(c, 100);
  const i1 = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 200 } });
  const i2 = await call("POST", "v1/invoices", { token: c.key, body: { destinationId: d.id, sats: 20000 } });
  wallet.settled.set(i1.json.invoice.paymentHash, true);
  wallet.settled.set(i2.json.invoice.paymentHash, true);
  await Promise.all([
    call("GET", `v1/invoices/${i1.json.invoice.id}`, { token: c.key }),
    call("GET", `v1/invoices/${i2.json.invoice.id}`, { token: c.key }),
  ]);
  const id = await store.getJSON(`dev:email:${crypto.createHash("sha256").update("adm3@example.com").digest("hex")}`);
  const acct = await store.getJSON(`dev:acct:${id}`);
  acct.suspended = true;
  await store.setJSON(`dev:acct:${id}`, acct);

  const v = await adminCall("GET", "?view=developer");
  const kinds = v.json.flags.map((f) => f.kind).sort();
  assert.ok(kinds.includes("shortfall"), "the shortfall account is flagged");
  assert.ok(kinds.includes("suspended"), "the suspended account is flagged");
  const short = v.json.flags.find((f) => f.kind === "shortfall");
  assert.match(short.detail, /1 sats? of fees settled short/);
});

test("Stanley suspends a key; it stops at once", async () => {
  const c = await ctx();
  assert.equal((await dev.authKey(c.key)).account.email, "adm4@example.com");
  const r = await adminCall("POST", "", { body: { action: "dev_suspend_key", keyId: c.keyId } });
  assert.equal(r.status, 200);
  assert.ok(r.json.key.revokedAt);
  await assert.rejects(() => dev.authKey(c.key), (e) => e.code === "key_revoked");
  const again = await adminCall("POST", "", { body: { action: "dev_suspend_key", keyId: c.keyId } });
  assert.equal(again.status, 200, "suspending twice stays suspended");
  const unknown = await adminCall("POST", "", { body: { action: "dev_suspend_key", keyId: "no-such-key" } });
  assert.equal(unknown.status, 404);
  const denied = await adminCall("GET", "?view=developer", { token: "wrong" });
  assert.equal(denied.status, 401);
});

test("the admin page carries the Developer tab, pane and loader", async () => {
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "assets", "admin.js"), "utf8");
  assert.ok(html.includes('data-tab="developer"'), "tab button");
  assert.ok(html.includes('data-pane="developer"'), "pane");
  for (const id of ["devKpis", "devSwitches", "devFlags", "devAccounts"]) assert.ok(html.includes(`id="${id}"`), `pane has #${id}`);
  assert.ok(js.includes("loadDeveloper()"), "loader");
  assert.ok(js.includes("dev_suspend_key"), "suspend action");
});
