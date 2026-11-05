// Buying sats with M-Pesa or Airtel Money through Bitika: quote plus collect,
// display-only status, and sats credited only by the Lightning payment
// arriving at the wallet. Bitika and the node are local fakes; the real APIs
// are never called. Run: node --test test/bitika.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-bitika-")));
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "DATA_DIR",
  "LND_REST_URL", "NODE_ENV", "PASSENGER_APP_ENV", "JOBS_ALLOW_LOCAL", "MPESA_CONSUMER_KEY"]) delete process.env[k];
const KEY = "bk_test_local_fake_key_1";
const HOOK_PATH = "bitika-hook-path-secret-12345678";
const HOOK_SECRET = "bitika-webhook-secret-12345678";
Object.assign(process.env, { YEBENTE_WALLETS: "on", YEBENTE_BITIKA_BUY: "on", BITIKA_API_KEY: KEY,
  YEBENTE_BITIKA_HOOK_PATH: HOOK_PATH, BITIKA_WEBHOOK_SECRET: HOOK_SECRET,
  SITE_URL: "https://bitika.test", JOBS_ALLOW_LOCAL: "1" });

// Nothing secret may reach the logs: every line is kept and checked at the end.
const logged = [];
const consoleOrig = {};
for (const k of ["log", "error", "warn", "info"]) {
  consoleOrig[k] = console[k];
  console[k] = (...a) => { logged.push(a.map(String).join(" ")); consoleOrig[k](...a); };
}

// ---- the fake Bitika: collections, idempotency, statuses and the rate ----
const bitika = { collects: [], codes: new Map(), bodies: new Map(), issued: 0,
  states: new Map(), force: null, rateMode: "sats", rateSats: 740 };
const bsrv = http.createServer((req, res) => {
  const send = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const u = new URL(req.url, "http://bitika");
    if (req.method === "POST" && u.pathname === "/api/v1/xwift/collect") {
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "bad key" });
      const idem = req.headers["idempotency-key"];
      if (!idem) return send(400, { error: "missing Idempotency-Key" });
      let body = {};
      try { body = JSON.parse(raw); } catch { return send(400, { error: "bad json" }); }
      bitika.collects.push({ idem, body });
      if (bitika.force) return send(bitika.force.status, bitika.force.body);
      if (bitika.codes.has(idem)) {
        if (JSON.stringify(bitika.bodies.get(idem)) !== JSON.stringify(body)) return send(422, { code: "IDEMPOTENCY_KEY_REUSED", original: { charged: true } });
        return send(200, { transaction_code: bitika.codes.get(idem), status: "processing" });
      }
      const code = `SBX-${(++bitika.issued).toString(16).padStart(8, "0").toUpperCase()}`;
      bitika.codes.set(idem, code);
      bitika.bodies.set(idem, body);
      bitika.states.set(code, "processing");
      return send(200, { transaction_code: code, status: "processing" });
    }
    const tx = u.pathname.match(/^\/api\/v1\/transactions\/code\/([\w-]+)$/);
    if (req.method === "GET" && tx) {
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "bad key" });
      return bitika.states.has(tx[1]) ? send(200, { transaction_code: tx[1], status: bitika.states.get(tx[1]) }) : send(404, { error: "unknown code" });
    }
    if (req.method === "GET" && u.pathname === "/api/v1/exchange/rate") {
      if (bitika.rateMode === "sats") return send(200, { sats: bitika.rateSats });
      if (bitika.rateMode === "junk") return send(200, { nope: true });
      return send(500, { error: "down" });
    }
    send(404, { error: "not found" });
  });
});
await new Promise((r) => bsrv.listen(0, "127.0.0.1", r));
process.env.BITIKA_BASE_URL = `http://127.0.0.1:${bsrv.address().port}`;

// ---- the fake node: channels for the payout check, invoices that settle ----
const MAC = "ab".repeat(32);
const lndInvoices = new Map();
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
const lnd = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
  if (req.headers["grpc-metadata-macaroon"] !== MAC) { res.writeHead(401).end("{}"); return; }
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/v1/invoices") {
      const hash = crypto.randomBytes(32).toString("hex");
      lndInvoices.set(hash, { state: "OPEN", value: JSON.parse(body).value });
      res.end(JSON.stringify({ r_hash: Buffer.from(hash, "hex").toString("base64"), payment_request: `lnbc1pvjluezx${hash.slice(0, 20)}` }));
      return;
    }
    if (req.url.startsWith("/v1/channels")) {
      res.end(JSON.stringify({ channels: [{ chan_id: "1", active: true, capacity: "2943434", local_balance: "5000000",
        remote_balance: "2900000", local_constraints: { chan_reserve_sat: "1000" }, remote_constraints: { chan_reserve_sat: "1000" } }] }));
      return;
    }
    if (req.url === "/v1/balance/channels") { res.end(JSON.stringify({ remote_balance: { sat: "10000000" }, local_balance: { sat: "5000000" } })); return; }
    const m = req.url.match(/^\/v1\/invoice\/([0-9a-f]+)$/);
    if (m && lndInvoices.has(m[1])) { res.end(JSON.stringify(lndInvoices.get(m[1]))); return; }
    res.writeHead(404).end("{}");
  });
});
await new Promise((r) => lnd.listen(0, "127.0.0.1", r));
Object.assign(process.env, { LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_INVOICE_MACAROON: MAC,
  YEBENTE_LND_PAY_MACAROON: MAC, LND_TLS_CERT: fs.readFileSync("cert.pem").toString("base64") });

// The price feeds only (Bitika and the node go through their own fakes).
const ok = (body) => ({ ok: true, json: async () => body });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("open.er-api.com")) return ok({ rates: { KES: 129 } });
  if (u.includes("api.coinbase.com")) return ok({ data: { amount: "100000" } });
  throw new Error(`unexpected fetch: ${u}`);
};

const yw = await import("../lib/ywallet.js");
const bk = await import("../lib/bitika.js");
const yb = await import("../api/yebente.js");
const { getJSON } = await import("../lib/store.js");

const mkWallet = (handle) => yw.createWallet({ pin: "482910", handle });
const authed = (token, url, opts = {}) => new Request(url, { ...opts,
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
const buy = (token, kes, phone) => yb.POST(authed(token, "http://x/api/yebente/wallet/buy/bitika",
  { method: "POST", body: JSON.stringify({ kes, phone }) }));
const statusOf = (token, code) => yb.GET(authed(token, `http://x/api/yebente/wallet/buy/bitika/${code}`));
const hook = (raw, sig, path = HOOK_PATH) => yb.POST(new Request(`http://x/api/yebente/bitika/webhook/${path}`,
  { method: "POST", headers: sig ? { "X-Bitika-Signature": sig } : {}, body: raw }));
const sign = (raw, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${crypto.createHmac("sha256", HOOK_SECRET).update(`${t}.${raw}`).digest("hex")}`;
const seen = []; // every API answer, checked for leaked secrets at the end
const answered = async (r) => { const t = await r.text(); seen.push(t); return { status: r.status, json: JSON.parse(t) }; };
let phoneN = 0;
const phone = () => `2547${String(10000000 + (++phoneN)).slice(0, 8)}`;
const buyer = {};

test("buy starts: quote plus collect, and the phone gets the prompt", async () => {
  const { wallet, token } = await mkWallet("bitika_buyer");
  Object.assign(buyer, { wallet, token });
  const p = phone();
  const r = await answered(await buy(token, 100, p));
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^SBX-[0-9A-F]{8}$/);
  assert.equal(r.json.sats, 740); // Bitika's own figure, from the rate endpoint
  assert.equal(r.json.feeKes, 3);
  assert.equal(r.json.kes, 100);
  buyer.code = r.json.code;
  const c = bitika.collects.at(-1);
  assert.equal(c.body.amount, "100");
  assert.equal(c.body.phone, p);
  assert.equal(c.body.lightningAddress, "bitika_buyer@bitika.test"); // the buyer's own address
  assert.match(c.idem, /^[0-9a-f-]{36}$/); // one fresh UUID per buy
});

test("status is display only: fulfilled never moves the balance", async () => {
  const s = await answered(await statusOf(buyer.token, buyer.code));
  assert.equal(s.json.state, "processing");
  assert.match(s.json.message, /check your phone/i);
  assert.equal(s.json.inProgress, true);
  bitika.states.set(buyer.code, "processing_payment");
  const s2 = await answered(await statusOf(buyer.token, buyer.code));
  assert.equal(s2.json.state, "processing_payment");
  bitika.states.set(buyer.code, "fulfilled");
  const s3 = await answered(await statusOf(buyer.token, buyer.code));
  assert.equal(s3.json.state, "fulfilled");
  assert.equal(s3.json.inProgress, false);
  assert.equal((await getJSON(`yw:${buyer.wallet.id}`)).balance, 0); // nothing credited
  assert.deepEqual(await yw.history(buyer.wallet.id), []); // no history entry either
});

test("every Bitika error comes back in plain words", async () => {
  const cases = [
    [400, {}, /could not start this payment/],
    [401, {}, /paused for now/],
    [403, {}, /paused for now/],
    [422, { code: "IDEMPOTENCY_KEY_REUSED" }, /already started/],
    [429, {}, /too many requests/i],
    [503, { reason: "liquidity" }, /out of sats for a moment/],
    [503, {}, /didn't answer/],
    [500, {}, /didn't answer clearly/],
  ];
  for (const [i, [status, body, words]] of cases.entries()) {
    const { token } = await mkWallet(`bkerr${status}x${i}`);
    bitika.force = { status, body };
    try {
      const r = await answered(await buy(token, 100, phone()));
      assert.match(r.json.error, words, `HTTP ${status}`);
      assert.ok(r.status >= 400 && r.status < 600, `HTTP ${status} -> ${r.status}`);
    } finally { bitika.force = null; }
  }
});

test("when Bitika is unreachable the buy fails plainly", async () => {
  const { token } = await mkWallet("bitika_down");
  const base = process.env.BITIKA_BASE_URL;
  process.env.BITIKA_BASE_URL = "http://127.0.0.1:9"; // nothing listens here
  try {
    const r = await answered(await buy(token, 100, phone()));
    assert.equal(r.status, 503);
    assert.match(r.json.error, /didn't answer/);
  } finally { process.env.BITIKA_BASE_URL = base; }
});

test("a double tap charges once: one code, one Idempotency-Key", async () => {
  const { token } = await mkWallet("bitika_doubletap");
  const p = phone(), before = bitika.issued, calls = bitika.collects.length;
  const [a, b] = await Promise.all([buy(token, 100, p).then(answered), buy(token, 100, p).then(answered)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.json.code, b.json.code);
  assert.equal(bitika.issued, before + 1); // the fake issued a single transaction
  const keys = new Set(bitika.collects.slice(calls).map((c) => c.idem));
  assert.equal(keys.size, 1); // every attempt reused the one stored key
});

test("two buys claimed at once share the one record and key", async () => {
  const { wallet } = await mkWallet("bitika_race");
  const params = { walletId: wallet.id, kes: 100, sats: 740, feeKes: 3, phoneHash: "race-hash" };
  const [a, b] = await Promise.all([
    yw._internal.withLedger(() => bk.claimOrCreate(params)),
    yw._internal.withLedger(() => bk.claimOrCreate(params)),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.idem, b.idem);
});

test("a retry while still starting reuses the stored key, then succeeds", async () => {
  const { token } = await mkWallet("bitika_retry");
  const p = phone(), before = bitika.issued;
  bitika.force = { status: 409, body: { code: "IDEMPOTENCY_IN_PROGRESS" } };
  const first = await answered(await buy(token, 100, p)); // one wait and one retry inside
  bitika.force = null;
  assert.equal(first.status, 409);
  assert.match(first.json.error, /still starting/);
  assert.equal(first.json.starting, true);
  const keys1 = bitika.collects.slice(-2).map((c) => c.idem);
  assert.equal(new Set(keys1).size, 1); // the retry kept the same key
  const second = await answered(await buy(token, 100, p));
  assert.equal(second.status, 200);
  assert.equal(bitika.issued, before + 1);
  assert.equal(bitika.collects.at(-1).idem, keys1[0]); // the later tap reused it too
});

test("another wallet can't read your code, and unknown codes stay hidden", async () => {
  const { token } = await mkWallet("bitika_stranger");
  assert.equal((await statusOf(token, buyer.code)).status, 404);
  assert.equal((await statusOf(buyer.token, "SBX-NOSUCH01")).status, 404);
});

test("a signed webhook moves the display status, never the balance", async () => {
  const { wallet, token } = await mkWallet("bitika_hook");
  const started = await answered(await buy(token, 100, phone()));
  const code = started.json.code;
  const event = (status, name) => JSON.stringify({ id: `evt_${status}`, event: name, created: new Date().toISOString(),
    data: { transaction_code: code, status, amount_kes: 100, sats: 740 } });
  const raw = event("processing_payment", "transaction.updated");
  assert.equal((await hook(raw, sign(raw))).status, 200);
  assert.equal((await answered(await statusOf(token, code))).json.state, "processing_payment");
  const done = event("fulfilled", "payment.completed");
  assert.equal((await hook(done, sign(done))).status, 200);
  assert.equal((await answered(await statusOf(token, code))).json.state, "fulfilled");
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
  const failRaw = event("payment_failed", "payment.failed");
  bitika.states.set(code, "payment_failed"); // the later status check must not regress a finished buy
  assert.equal((await hook(failRaw, sign(failRaw))).status, 200); // a finished buy never moves back
  assert.equal((await answered(await statusOf(token, code))).json.state, "fulfilled");
});

test("forged, old, unsigned and misaddressed webhooks are rejected", async () => {
  const raw = JSON.stringify({ event: "payment.completed", data: { transaction_code: buyer.code, status: "fulfilled" } });
  assert.equal((await hook(raw, sign(raw.replace("fulfilled", "failed")))).status, 403); // signed for other bytes
  assert.equal((await hook(raw, sign(raw, Math.floor(Date.now() / 1000) - 400))).status, 403); // older than 5 minutes
  assert.equal((await hook(raw, sign(raw, Math.floor(Date.now() / 1000) + 400))).status, 403); // from the future
  assert.equal((await hook(raw, null)).status, 403); // unsigned
  assert.equal((await hook(raw, "t=abc,v1=zzz")).status, 403); // malformed
  assert.equal((await hook(raw, sign(raw), "wrong-hook-path-secret-1234567890")).status, 403); // wrong path secret
  const path = process.env.YEBENTE_BITIKA_HOOK_PATH;
  delete process.env.YEBENTE_BITIKA_HOOK_PATH;
  try { assert.equal((await hook(raw, sign(raw))).status, 403); } // hook not set: nothing accepted
  finally { process.env.YEBENTE_BITIKA_HOOK_PATH = path; }
  const strange = JSON.stringify({ event: "payment.completed", data: { transaction_code: "SBX-NOSUCH02", status: "fulfilled" } });
  assert.equal((await hook(strange, sign(strange))).status, 200); // unknown codes: accepted, ignored
});

test("the balance moves only through the Lightning receive path", async () => {
  const inv = await answered(await yb.POST(authed(buyer.token, "http://x/api/yebente/wallet/invoice",
    { method: "POST", body: JSON.stringify({ sats: 2500 }) })));
  assert.equal(inv.status, 200);
  assert.equal((await answered(await yb.GET(authed(buyer.token, `http://x/api/yebente/wallet/invoice/${inv.json.paymentHash}`)))).json.settled, false);
  lndInvoices.get(inv.json.paymentHash).state = "SETTLED"; // the payer paid; the node says so
  const st = await answered(await yb.GET(authed(buyer.token, `http://x/api/yebente/wallet/invoice/${inv.json.paymentHash}`)));
  assert.equal(st.json.settled, true);
  assert.equal((await getJSON(`yw:${buyer.wallet.id}`)).balance, 2500);
  const entries = await yw.history(buyer.wallet.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "receive"); // the settled invoice, not the Bitika buy
});

test("limits hold: Bitika's range, the wallet settings and the daily cap", async () => {
  const { token } = await mkWallet("bitika_limits");
  for (const kes of [9, 10001, 100.5]) {
    const r = await answered(await buy(token, kes, phone()));
    assert.equal(r.status, 400);
    assert.match(r.json.error, /between 10 and 10,000/);
  }
  const bad = await answered(await buy(token, 100, "0712345"));
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /M-Pesa or Airtel Money/);
  process.env.YEBENTE_BUY_MAX_KES = "500";
  try {
    const r = await answered(await buy(token, 600, phone()));
    assert.equal(r.status, 400);
    assert.match(r.json.error, /between 10 and 500/);
  } finally { delete process.env.YEBENTE_BUY_MAX_KES; }
  process.env.YEBENTE_DAILY_BUY_KES = "1000";
  try {
    assert.equal((await answered(await buy(token, 600, phone()))).status, 200);
    const over = await answered(await buy(token, 600, phone()));
    assert.equal(over.status, 400);
    assert.match(over.json.error, /daily buying limit/);
  } finally { delete process.env.YEBENTE_DAILY_BUY_KES; }
});

test("an unclear rate answer falls back to the wallet's own quote", async () => {
  const { token } = await mkWallet("bitika_rate");
  bitika.rateMode = "junk";
  try {
    const r = await answered(await buy(token, 100, phone()));
    assert.equal(r.status, 200);
    assert.equal(r.json.sats, 775); // 100 KES at 12,900,000 KES/BTC, no spread
  } finally { bitika.rateMode = "sats"; }
});

test("health names the Buy provider and the sandbox, never the key", async () => {
  const health = async () => answered(await yb.GET(new Request("http://x/api/yebente/health")));
  const h = await health();
  assert.equal(h.json.buyProvider, "bitika"); // on and default
  assert.equal(h.json.bitikaSandbox, true); // a bk_test_ key
  process.env.YEBENTE_BUY_PROVIDER = "mpesa";
  try { assert.equal((await health()).json.buyProvider, null); } // Daraja isn't configured here
  finally { delete process.env.YEBENTE_BUY_PROVIDER; }
  process.env.BITIKA_API_KEY = "bk_live_local_fake_key_2";
  try { assert.equal((await health()).json.bitikaSandbox, false); }
  finally { process.env.BITIKA_API_KEY = KEY; }
  process.env.YEBENTE_BITIKA_BUY = "";
  try {
    assert.equal((await health()).json.buyProvider, null);
    const r = await answered(await buy(buyer.token, 100, phone()));
    assert.equal(r.status, 501);
  } finally { process.env.YEBENTE_BITIKA_BUY = "on"; }
});

test("statuses only move forward, even from a fast collect answer", async () => {
  const { wallet } = await mkWallet("bitika_forward");
  const rec = await bk.claimOrCreate({ walletId: wallet.id, kes: 50, sats: 370, feeKes: 1.5, phoneHash: "forward-hash" });
  await bk.attachCode(rec.id, "SBX-FORWARD1", "processing_payment");
  assert.equal((await bk.getRecord(rec.id)).state, "processing_payment");
  assert.equal(await bk.applyRemoteStatus("SBX-FORWARD1", "processing"), "processing_payment"); // a stale poll can't undo it
  const rec2 = await bk.claimOrCreate({ walletId: wallet.id, kes: 60, sats: 444, feeKes: 1.8, phoneHash: "forward-hash-2" });
  await bk.attachCode(rec2.id, "SBX-FORWARD2", "fulfilled"); // answered already paid
  assert.equal((await bk.getRecord(rec2.id)).state, "fulfilled");
});

test("the key and the webhook secrets never appear in answers or logs", async () => {
  bsrv.close();
  lnd.close();
  Object.assign(console, consoleOrig);
  for (const line of [...seen, ...logged]) {
    assert.doesNotMatch(line, /bk_test_local_fake_key_1/, "API key leaked");
    assert.doesNotMatch(line, /bk_live_local_fake_key_2/, "API key leaked");
    assert.doesNotMatch(line, /bitika-webhook-secret/, "webhook secret leaked");
    assert.doesNotMatch(line, /bitika-hook-path-secret/, "hook path leaked");
  }
});
