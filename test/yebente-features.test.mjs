// Ye₿ente shows only working features: health carries a server-computed
// `features` object, and the app renders only enabled controls. A control is
// shown only when its feature can complete for a real user right now.
// Run: node --test test/yebente-features.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ybfeatures-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "LND_INVOICE_MACAROON",
  "LND_READONLY_MACAROON", "LND_TLS_CERT", "YEBENTE_LND_PAY_MACAROON", "YEBENTE_WALLETS", "YEBENTE_MPESA_BUY",
  "YEBENTE_BITIKA_BUY", "YEBENTE_BUY_PROVIDER", "YEBENTE_CARD_BUY", "YEBENTE_SHOW_TEST_FEATURES",
  "YEBENTE_EXTERNAL_WALLETS", "YEBENTE_TELEBIRR", "YEBENTE_TELEBIRR_HOST", "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_ENVIRONMENT", "YEBENTE_CALLBACK_SECRET",
  "BITIKA_API_KEY", "BITIKA_BASE_URL", "PESAPAL_CONSUMER_KEY", "PESAPAL_CONSUMER_SECRET", "PESAPAL_IPN_ID",
  "PESAPAL_CALLBACK_SECRET", "PESAPAL_ENVIRONMENT", "SITE_URL"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://features.test" });

// ---- the fake node: just enough for the health check (inboundSats reads channels) ----
const MAC = "cd".repeat(32);
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
const lnd = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
  if (req.headers["grpc-metadata-macaroon"] !== MAC) { res.writeHead(401).end("{}"); return; }
  if (req.url === "/v1/balance/channels") { res.end(JSON.stringify({ remote_balance: { sat: "10000000" } })); return; }
  res.writeHead(404).end("{}");
});
await new Promise((r) => lnd.listen(0, "127.0.0.1", r));
Object.assign(process.env, { LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_INVOICE_MACAROON: MAC,
  YEBENTE_LND_PAY_MACAROON: MAC, LND_TLS_CERT: fs.readFileSync("cert.pem").toString("base64") });

const yb = await import("../api/yebente.js");
const { visibleActions, fetchFeatures, CORE_FEATURES } = await import("../yebente/src/services/features.ts");

const health = async () => (await yb.GET(new Request("http://x/api/yebente/health"))).json();

// The app logic first: pure, no server needed.
test("visibleActions: the tiles in display order, only for explicit true", () => {
  assert.deepEqual(visibleActions({ buy: true, cardTopup: true, sendMobile: true, receive: true, send: true, external: true }),
    ["buy", "sendMobile", "receive", "send", "cardTopup"]);
  assert.deepEqual(visibleActions(CORE_FEATURES), ["receive", "send"]);
  assert.deepEqual(visibleActions(null), []);
  assert.deepEqual(visibleActions(undefined), []);
  assert.deepEqual(visibleActions({}), []);
  assert.deepEqual(visibleActions({ buy: true }), ["buy"]);
  assert.deepEqual(visibleActions({ buy: 1, send: "yes", receive: true }), ["receive"], "truthy is not true");
  assert.deepEqual(visibleActions({ receive: true, somethingElse: true }), ["receive"], "unknown keys ignored");
});

test("fetchFeatures: the server's booleans, or the core on any failure", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ json: async () => ({ features: { buy: true, cardTopup: false, sendMobile: true, receive: true, send: true, external: false } }) });
    assert.deepEqual(await fetchFeatures(), { buy: true, cardTopup: false, sendMobile: true, receive: true, send: true, external: false });
    globalThis.fetch = async () => ({ json: async () => ({ features: { receive: true } }) });
    assert.deepEqual(await fetchFeatures(), { buy: false, cardTopup: false, sendMobile: false, receive: true, send: false, external: false },
      "a partial answer: only explicit true enables a control");
    globalThis.fetch = async () => ({ json: async () => ({ status: "ok" }) });
    assert.deepEqual(await fetchFeatures(), CORE_FEATURES, "no features: the core");
    globalThis.fetch = async () => ({ json: async () => { throw new Error("html"); } });
    assert.deepEqual(await fetchFeatures(), CORE_FEATURES, "an error page: the core");
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.deepEqual(await fetchFeatures(), CORE_FEATURES, "offline: the core");
  } finally { globalThis.fetch = realFetch; }
});

// Then the server matrix. The node reads first: inboundSats caches per minute,
// so the node-up rows run before the node-down row (deleting the LND settings
// reads null whatever the cache holds).
test("wallets on and the node connected: core plus Send Mobile, nothing to buy with", async () => {
  const h = await health();
  assert.equal(h.status, "ok");
  assert.equal(h.wallets, true);
  assert.equal(h.node, true);
  assert.equal(h.buyProvider, null);
  assert.deepEqual(h.features, { buy: false, cardTopup: false, sendMobile: true, receive: true, send: true, external: false });
});

test("Daraja sandbox: no real prompt reaches a phone, so Buy stays hidden unless testing", async () => {
  Object.assign(process.env, { YEBENTE_MPESA_BUY: "on", MPESA_CONSUMER_KEY: "k", MPESA_CONSUMER_SECRET: "s",
    MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "p", YEBENTE_CALLBACK_SECRET: "x".repeat(32) });
  try {
    assert.equal((await health()).features.buy, false);
    assert.equal((await health()).buyProvider, "mpesa", "the legacy field still names the provider");
    process.env.YEBENTE_SHOW_TEST_FEATURES = "on";
    try { assert.equal((await health()).features.buy, true, "Stanley can test the sandbox flow"); }
    finally { delete process.env.YEBENTE_SHOW_TEST_FEATURES; }
    process.env.MPESA_ENVIRONMENT = "production";
    try { assert.equal((await health()).features.buy, true, "production Daraja is real"); }
    finally { delete process.env.MPESA_ENVIRONMENT; }
  } finally {
    for (const k of ["YEBENTE_MPESA_BUY", "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "YEBENTE_CALLBACK_SECRET"]) delete process.env[k];
  }
});

test("Bitika: a live key buys, a test key only with the test override", async () => {
  process.env.YEBENTE_BITIKA_BUY = "on";
  try {
    process.env.BITIKA_API_KEY = "bk_test_local_fake_key_1";
    assert.equal((await health()).features.buy, false);
    assert.equal((await health()).buyProvider, "bitika");
    process.env.YEBENTE_SHOW_TEST_FEATURES = "on";
    try { assert.equal((await health()).features.buy, true, "Stanley can test with a bk_test_ key"); }
    finally { delete process.env.YEBENTE_SHOW_TEST_FEATURES; }
    process.env.BITIKA_API_KEY = "bk_live_local_fake_key_2";
    assert.equal((await health()).features.buy, true, "a bk_live_ key is real");
    assert.equal((await health()).bitikaSandbox, false);
  } finally { delete process.env.YEBENTE_BITIKA_BUY; delete process.env.BITIKA_API_KEY; }
});

test("card top-up: production Pesapal only, unless testing", async () => {
  Object.assign(process.env, { YEBENTE_CARD_BUY: "on", PESAPAL_CONSUMER_KEY: "k", PESAPAL_CONSUMER_SECRET: "s",
    PESAPAL_IPN_ID: "ipn", PESAPAL_CALLBACK_SECRET: "c".repeat(32) });
  try {
    assert.equal((await health()).features.cardTopup, false, "sandbox provider: hidden");
    process.env.PESAPAL_ENVIRONMENT = "production";
    assert.equal((await health()).features.cardTopup, true, "production provider: shown");
    delete process.env.PESAPAL_ENVIRONMENT;
    process.env.YEBENTE_SHOW_TEST_FEATURES = "on";
    try { assert.equal((await health()).features.cardTopup, true, "Stanley can test the sandbox flow"); }
    finally { delete process.env.YEBENTE_SHOW_TEST_FEATURES; }
    delete process.env.YEBENTE_CARD_BUY;
    process.env.YEBENTE_SHOW_TEST_FEATURES = "on";
    try { assert.equal((await health()).features.cardTopup, false, "the override never skips the switch"); }
    finally { delete process.env.YEBENTE_SHOW_TEST_FEATURES; }
  } finally {
    for (const k of ["YEBENTE_CARD_BUY", "PESAPAL_CONSUMER_KEY", "PESAPAL_CONSUMER_SECRET", "PESAPAL_IPN_ID", "PESAPAL_CALLBACK_SECRET"]) delete process.env[k];
  }
});

test("external wallets stay hidden until switched on", async () => {
  assert.equal((await health()).features.external, false);
  process.env.YEBENTE_EXTERNAL_WALLETS = "on";
  try { assert.equal((await health()).features.external, true); }
  finally { delete process.env.YEBENTE_EXTERNAL_WALLETS; }
});

test("wallets off: Receive and Send hide too", async () => {
  delete process.env.YEBENTE_WALLETS;
  try {
    assert.deepEqual((await health()).features, { buy: false, cardTopup: false, sendMobile: true, receive: false, send: false, external: false });
  } finally { process.env.YEBENTE_WALLETS = "on"; }
});

test("health names no secrets, only booleans", async () => {
  Object.assign(process.env, { MPESA_CONSUMER_KEY: "mpesa-fake-key", MPESA_CONSUMER_SECRET: "mpesa-fake-secret",
    MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "mpesa-fake-passkey", YEBENTE_CALLBACK_SECRET: "cb-fake-secret-1234567890123456",
    BITIKA_API_KEY: "bk_live_fake_key_3", PESAPAL_CONSUMER_KEY: "pp-fake-key", PESAPAL_CONSUMER_SECRET: "pp-fake-secret" });
  try {
    const raw = JSON.stringify(await health());
    for (const s of ["mpesa-fake-key", "mpesa-fake-secret", "mpesa-fake-passkey", "cb-fake-secret", "bk_live_fake_key_3", "pp-fake-key", "pp-fake-secret"])
      assert.doesNotMatch(raw, new RegExp(s), "a secret leaked into health");
    for (const [k, v] of Object.entries((await health()).features)) assert.equal(typeof v, "boolean", k);
  } finally {
    for (const k of ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "YEBENTE_CALLBACK_SECRET",
      "BITIKA_API_KEY", "PESAPAL_CONSUMER_KEY", "PESAPAL_CONSUMER_SECRET"]) delete process.env[k];
  }
});

test("node down: Receive, Send and Send Mobile hide; the rest is untouched", async () => {
  lnd.close();
  for (const k of ["LND_REST_URL", "LND_INVOICE_MACAROON", "YEBENTE_LND_PAY_MACAROON", "LND_TLS_CERT"]) delete process.env[k];
  const h = await health();
  assert.equal(h.node, null);
  assert.deepEqual(h.features, { buy: false, cardTopup: false, sendMobile: false, receive: false, send: false, external: false });
  process.env.YEBENTE_BITIKA_BUY = "on";
  process.env.BITIKA_API_KEY = "bk_live_local_fake_key_2";
  try { assert.equal((await health()).features.buy, true, "buying needs no node to be offered"); }
  finally { delete process.env.YEBENTE_BITIKA_BUY; delete process.env.BITIKA_API_KEY; }
});
