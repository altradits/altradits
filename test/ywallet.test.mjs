// Ye₿ente custodial wallets: accounts, PIN, transfers, limits and the ledger.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ywallet-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", YEBENTE_MAX_BALANCE_SATS: "10000", YEBENTE_MAX_PAYMENT_SATS: "5000", YEBENTE_DAILY_SEND_SATS: "6000" });

const yw = await import("../lib/ywallet.js");
const { setJSON } = await import("../lib/store.js");
yw.setLnurlFetcher((u, o) => globalThis.fetch(u, o)); // the tests stand in for the outside servers
yw.setPayTimings({ recheckMs: 20 });
const { bolt11PaymentHash } = await import("../lib/lightning.js");
const api = await import("../api/yebente.js");
let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `9.9.9.${++n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));

let amina, juma;
test("create a wallet: a handle, a Lightning address, a device token and a recovery phrase shown once", async () => {
  const r = await (await call("POST", "wallet/create", { pin: "604391", handle: "Amina" })).json();
  assert.equal(r.success, true);
  assert.equal(r.wallet.handle, "amina");
  assert.equal(r.wallet.address, "amina@altradits.test");
  assert.equal(r.wallet.balance, 0);
  assert.equal(r.recovery.split(" ").length, 12);
  amina = r;
  // Stored as hashes only: no PIN, token or phrase in the data file.
  const raw = fs.readFileSync(path.join(".data", "db.json"), "utf8");
  assert.doesNotMatch(raw, new RegExp(r.token));
  assert.doesNotMatch(raw, new RegExp(r.recovery));
  assert.doesNotMatch(raw, /"604391"/);
  // Handle rules and uniqueness.
  assert.equal((await call("POST", "wallet/create", { pin: "604391", handle: "amina" })).status, 409);
  assert.equal((await call("POST", "wallet/create", { pin: "604391", handle: "admin" })).status, 400);
  assert.equal((await call("POST", "wallet/create", { pin: "1234", handle: "bob" })).status, 400);
  const auto = await (await call("POST", "wallet/create", { pin: "568013" })).json();
  assert.match(auto.wallet.handle, /^[a-z]+\d{4}$/);
  juma = await (await call("POST", "wallet/create", { pin: "284731", handle: "juma" })).json();
});

test("signed-in calls need the device token; a recovery phrase restores the wallet on a new phone", async () => {
  assert.equal((await call("GET", "wallet/me")).status, 401);
  assert.equal((await call("GET", "wallet/me", null, "x".repeat(32))).status, 401);
  const me = await (await call("GET", "wallet/me", null, amina.token)).json();
  assert.equal(me.wallet.handle, "amina");
  assert.equal((await call("POST", "wallet/restore", { recovery: "wrong words", pin: "390517" })).status, 404);
  const back = await (await call("POST", "wallet/restore", { recovery: amina.recovery.toUpperCase(), pin: "390517" })).json();
  assert.equal(back.wallet.handle, "amina");
  assert.notEqual(back.token, amina.token);
  amina.token = back.token; // the new PIN is 222222
});

test("transfers between wallets: free and instant, with the PIN; wrong PINs lock spending", async () => {
  await yw.credit({ walletId: amina.wallet.id, sats: 8000, kind: "receive", ref: "hash-1" });
  const dup = await yw.credit({ walletId: amina.wallet.id, sats: 8000, kind: "receive", ref: "hash-1" });
  assert.equal(dup.duplicate, true); // the same payment never credits twice
  let r = await call("POST", "wallet/send", { to: "juma@altradits.test", sats: 1500, pin: "390517", note: "lunch" }, amina.token);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).wallet.balance, 6500);
  const j = await (await call("GET", "wallet/me", null, juma.token)).json();
  assert.equal(j.wallet.balance, 1500);
  const h = await (await call("GET", "wallet/history", null, juma.token)).json();
  assert.equal(h.entries[0].kind, "transfer_in");
  assert.equal(h.entries[0].counterparty, "amina@altradits.test");
  // Unknown handle, self, external addresses (not yet).
  assert.equal((await call("POST", "wallet/send", { to: "nobody", sats: 10, pin: "390517" }, amina.token)).status, 404);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 10, pin: "390517" }, amina.token)).status, 400);
  // Five wrong PINs lock spending, even with the right PIN after.
  for (let i = 0; i < 5; i++) assert.equal((await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "958302" }, amina.token)).status, 403);
  const locked = await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "390517" }, amina.token);
  assert.equal(locked.status, 429);
  assert.match((await locked.json()).error, /15 minutes/);
  // Locked again the same day: longer each time (1 hour, then 24 hours).
  const w = await yw.walletByHandle("amina");
  const relock = async () => {
    await yw._internal.withLedger(async () => { const cur = await yw.walletByHandle("amina"); cur.lockedUntil = null; await setJSON(`yw:${cur.id}`, cur); });
    for (let i = 0; i < 5; i++) await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "958302" }, amina.token);
    return (await (await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "390517" }, amina.token)).json()).error;
  };
  assert.match(await relock(), /60 minutes/);
  assert.match(await relock(), /24 hours/);
  await yw._internal.withLedger(async () => { const cur = await yw.walletByHandle("amina"); Object.assign(cur, { lockedUntil: null, lockCount: 0, lockedAt: null }); await setJSON(`yw:${cur.id}`, cur); });
  assert.equal(w.id, amina.wallet.id);
});

test("new PINs can't be easy patterns; PINs already set keep working", async () => {
  for (const pin of ["111111", "123456", "654321", "121212", "123123", "112233", "000000", "110011"])
    assert.equal((await call("POST", "wallet/create", { pin, handle: `weak${pin}` })).status, 400, pin);
  assert.equal((await call("POST", "wallet/create", { pin: "604391x" })).status, 400);
  assert.equal((await call("POST", "wallet/create", { pin: "730184", handle: "strongpin" })).status, 200);
});

test("limits: per payment, per day, recipient balance; never more than the balance", async () => {
  // Juma: 1,500 sats. Over the balance, over the per-payment cap.
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 2000, pin: "284731" }, juma.token)).status, 402);
  await yw.credit({ walletId: juma.wallet.id, sats: 8000, kind: "receive", ref: "hash-2" });
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 5001, pin: "284731" }, juma.token)).status, 400);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 1.5, pin: "284731" }, juma.token)).status, 400);
  // Amina holds 6,500 of a 10,000 cap: 4,000 more would overfill her wallet.
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 4000, pin: "284731" }, juma.token)).status, 400);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 3000, pin: "284731" }, juma.token)).status, 200);
  // Daily cap 6,000: 3,000 sent, 3,001 more is refused.
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 3001, pin: "284731" }, juma.token)).status, 400);
});

test("ten sends at once can never spend the same sats twice", async () => {
  const w = await (await call("POST", "wallet/create", { pin: "735018", handle: "rush" })).json();
  await yw.credit({ walletId: w.wallet.id, sats: 100, kind: "receive", ref: "hash-3" });
  const results = await Promise.all(Array.from({ length: 10 }, () => call("POST", "wallet/send", { to: "juma", sats: 60, pin: "735018" }, w.token)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const me = await (await call("GET", "wallet/me", null, w.token)).json();
  assert.equal(me.wallet.balance, 40);
  const owed = await yw.liabilities();
  const sum = (await Promise.all([amina, juma, w].map(async (x) => (await (await call("GET", "wallet/me", null, x.token)).json()).wallet.balance))).reduce((a, b) => a + b, 0);
  assert.ok(owed.wallets >= 4);
  assert.equal(owed.sats, sum); // the auto-handle wallet holds 0
});

// ---- step 2: receiving from any Lightning wallet (a fake LND node, HTTPS like a real one)
const MAC = "0201036c6e64";
const lndInvoices = new Map();
const payments = new Map(), payCalls = [];
let payMode = "ok";
let localBalance = 1_000_000;
let channelReserve = 0; // our side's reserve: never spendable
let lnd;
async function fakeLnd() {
  if (lnd) return;
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost", "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
  lnd = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
    if (req.headers["grpc-metadata-macaroon"] !== MAC) { res.writeHead(401).end("{}"); return; }
    let body = ""; req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/invoices") {
        const { value, description_hash } = JSON.parse(body);
        const hash = crypto.randomBytes(32);
        lndInvoices.set(hash.toString("hex"), { state: "OPEN", value, description_hash });
        res.end(JSON.stringify({ r_hash: hash.toString("base64"), payment_request: invoice(Number(value), hash.toString("hex")).pr }));
        return;
      }
      if (req.method === "POST" && req.url === "/v2/router/send") {
        if (req.headers["grpc-metadata-macaroon"] !== MAC) { res.writeHead(401).end("{}"); return; }
        const { payment_request, fee_limit_sat, no_inflight_updates } = JSON.parse(body);
        payCalls.push({ pr: payment_request, feeLimit: Number(fee_limit_sat), quiet: no_inflight_updates });
        const hash = bolt11PaymentHash(payment_request);
        // Streams one JSON object per line, like LND's routerrpc REST gateway.
        if (payMode === "fail") { payments.set(hash, "FAILED"); res.end(JSON.stringify({ result: { payment_hash: hash, status: "FAILED", failure_reason: "FAILURE_REASON_NO_ROUTE" } }) + "\n"); return; }
        if (payMode === "hang") { payments.set(hash, "IN_FLIGHT"); return; } // never answers: the client times out
        // The tunnel answers with a gateway page: the node either never got it, or is paying it.
        if (payMode === "gateway" || payMode === "gateway-paying") { if (payMode === "gateway-paying") payments.set(hash, "IN_FLIGHT"); res.writeHead(502).end("<html>ERR_NGROK_3004</html>"); return; }
        payments.set(hash, "SUCCEEDED");
        res.end(JSON.stringify({ result: { payment_hash: hash, status: "SUCCEEDED", fee_sat: "3", payment_preimage: "aa".repeat(32) } }) + "\n");
        return;
      }
      if (req.method === "GET" && req.url.startsWith("/v1/payments")) {
        res.end(JSON.stringify({ payments: [...payments].map(([h, st]) => ({ payment_hash: h, status: st, fee_sat: "4" })) }));
        return;
      }
      const track = req.url.match(/^\/v2\/router\/track\/([\w-]+)/);
      if (track) {
        const h = Buffer.from(track[1], "base64url").toString("hex");
        if (!payments.has(h)) { res.writeHead(500).end(JSON.stringify({ code: 5, message: "payment isn't initiated" })); return; }
        res.end(JSON.stringify({ result: { payment_hash: h, status: payments.get(h), fee_sat: "4" } }) + "\n");
        return;
      }
      if (req.url.startsWith("/v1/channels/pending")) { res.end("{}"); return; }
      if (req.url.startsWith("/v1/channels")) {
        res.end(JSON.stringify({ channels: [{ chan_id: "1", active: true, capacity: "2943434", local_balance: String(localBalance), remote_balance: "2900000",
          local_constraints: { chan_reserve_sat: String(channelReserve) }, remote_constraints: { chan_reserve_sat: "29434" } }] }));
        return;
      }
      if (req.url === "/v1/balance/channels") { res.end(JSON.stringify({ remote_balance: { sat: "10000000" }, local_balance: { sat: String(localBalance) } })); return; }
      const m = req.url.match(/^\/v1\/invoice\/([0-9a-f]+)$/);
      if (m && lndInvoices.has(m[1])) { res.end(JSON.stringify(lndInvoices.get(m[1]))); return; }
      res.writeHead(404).end("{}");
    });
  });
  await new Promise((r) => lnd.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_INVOICE_MACAROON: MAC, LND_TLS_CERT: fs.readFileSync("cert.pem").toString("base64") });
}

test("receive: an invoice for the wallet is credited once, when the node says it is paid", async () => {
  await fakeLnd();
  const w = await (await call("POST", "wallet/create", { pin: "482915", handle: "wanjiru" })).json();
  const inv = await (await call("POST", "wallet/invoice", { sats: 2500 }, w.token)).json();
  assert.equal(inv.success, true);
  assert.match(inv.invoice, /^lnbc/);
  let st = await (await call("GET", `wallet/invoice/${inv.paymentHash}`, null, w.token)).json();
  assert.equal(st.settled, false);
  // Someone else's wallet can't look at (or claim) this invoice.
  assert.equal((await call("GET", `wallet/invoice/${inv.paymentHash}`, null, juma.token)).status, 404);
  lndInvoices.get(inv.paymentHash).state = "SETTLED";
  st = await (await call("GET", `wallet/invoice/${inv.paymentHash}`, null, w.token)).json();
  assert.equal(st.settled, true);
  await call("GET", `wallet/invoice/${inv.paymentHash}`, null, w.token); // polled again: no second credit
  assert.equal((await (await call("GET", "wallet/me", null, w.token)).json()).wallet.balance, 2500);
  // Over the per-payment cap or the wallet limit: no invoice.
  assert.equal((await call("POST", "wallet/invoice", { sats: 5001 }, w.token)).status, 400);
  // The node not answering (tunnel down): a clear 503 after one retry, never a bare 500.
  const url = process.env.LND_REST_URL;
  process.env.LND_REST_URL = "https://127.0.0.1:9";
  try {
    const r = await call("POST", "wallet/invoice", { sats: 100 }, w.token);
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /isn't answering/);
  } finally { process.env.LND_REST_URL = url; }
});

test("handle@altradits.com is a Lightning address; a payment made while the app is closed is credited by the sweep", async () => {
  const pr = await (await call("GET", "lnurlp/wanjiru")).json();
  assert.equal(pr.tag, "payRequest");
  assert.equal(pr.callback, "https://altradits.test/api/yebente/lnurl/wanjiru");
  assert.equal(pr.minSendable, 1000);
  assert.equal(pr.maxSendable, 5000 * 1000); // per-payment cap (balance 2,500 of 10,000)
  assert.deepEqual(JSON.parse(pr.metadata), [["text/plain", "Pay wanjiru@altradits.test"], ["text/identifier", "wanjiru@altradits.test"]]);
  assert.equal((await (await call("GET", "lnurlp/nobody")).json()).status, "ERROR");
  const bad = await (await api.GET(new Request("https://altradits.test/api/yebente/lnurl/wanjiru?amount=1500"))).json();
  assert.equal(bad.status, "ERROR"); // not whole sats
  const ok = await (await api.GET(new Request("https://altradits.test/api/yebente/lnurl/wanjiru?amount=1000000"))).json();
  assert.match(ok.pr, /^lnbc/);
  // The invoice commits to the metadata (LUD-06): description_hash = sha256(metadata).
  const [hash, rec] = [...lndInvoices.entries()].at(-1);
  assert.equal(Buffer.from(rec.description_hash, "base64").toString("hex"), crypto.createHash("sha256").update(pr.metadata).digest("hex"));
  rec.state = "SETTLED";
  const sweep = await yw.settleOpen();
  assert.ok(sweep.closed >= 1);
  const w = await yw.walletByHandle("wanjiru");
  assert.equal(w.balance, 3500);
  assert.equal(await yw.settleInvoice(hash), "settled");
  assert.equal((await yw.walletByHandle("wanjiru")).balance, 3500); // settled once
});

test("wallets stay off until YEBENTE_WALLETS=on", async () => {
  delete process.env.YEBENTE_WALLETS;
  assert.equal((await call("POST", "wallet/create", { pin: "527864" })).status, 501);
  assert.equal((await call("GET", "lnurlp/wanjiru")).status, 404);
  process.env.YEBENTE_WALLETS = "on";
});

// ---- step 3: sending out of the node (pay macaroon), to invoices and Lightning addresses

// A BOLT11-shaped invoice for `sats` with payment hash `hash` (the reader takes the
// amount and the "p" field; signature and checksum are not checked here).
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function invoice(sats, hash = crypto.randomBytes(32).toString("hex"), descHash = null) {
  const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hash), ...(descHash ? [23, 1, 20, ...w5(descHash)] : []), ...Array(104).fill(0)];
  return { pr: `lnbc${sats * 10}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq", hash };
}

test("send to an invoice: paid by the node, unused fee reserve refunded; failures refund everything", async () => {
  process.env.YEBENTE_LND_PAY_MACAROON = MAC;
  process.env.JOBS_ALLOW_LOCAL = "1";
  await fakeLnd();
  const w = await (await call("POST", "wallet/create", { pin: "129847", handle: "payer" })).json();
  await yw.credit({ walletId: w.wallet.id, sats: 4000, kind: "receive", ref: "fund-payer" });
  const { pr, hash } = invoice(1000);
  let r = await call("POST", "wallet/send", { to: pr, pin: "129847" }, w.token);
  let d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.status, "completed");
  assert.equal(payCalls.at(-1).feeLimit, 10); // max(10, 1% of 1,000)
  // 4,000 - 1,000 - actual fee 3 (the rest of the 10-sat reserve came back).
  assert.equal(d.wallet.balance, 2997);
  const e = (await (await call("GET", "wallet/history", null, w.token)).json()).entries[0];
  assert.equal(e.status, "completed"); assert.equal(e.fee, 3); assert.equal(e.ref, hash);
  // The same invoice can't be paid twice from Ye₿ente.
  assert.equal((await call("POST", "wallet/send", { to: pr, pin: "129847" }, w.token)).status, 409);
  // A failed route takes nothing.
  payMode = "fail";
  r = await call("POST", "wallet/send", { to: invoice(500).pr, pin: "129847" }, w.token);
  assert.equal(r.status, 502);
  assert.equal((await yw.walletByHandle("payer")).balance, 2997);
  assert.equal((await (await call("GET", "wallet/history", null, w.token)).json()).entries[0].status, "failed");
  payMode = "ok";
  // An amountless invoice, or the wrong amount, is refused before anything is taken.
  assert.equal((await call("POST", "wallet/send", { to: "lnbc1qqqqqq", pin: "129847" }, w.token)).status, 400);
  assert.equal((await call("POST", "wallet/send", { to: invoice(700).pr, sats: 600, pin: "129847" }, w.token)).status, 400);
});

test("send to a Lightning address (phone@bitcoin.co.ke pays M-Pesa); another Ye₿ente wallet's invoice stays in the ledger", async () => {
  const realFetch = globalThis.fetch;
  let lastAmount = null;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    if (u.hostname === "bitcoin.co.ke" && u.pathname === "/.well-known/lnurlp/0712345678") return new Response(JSON.stringify({ tag: "payRequest", callback: "https://bitcoin.co.ke/lnurlp/cb/0712345678", minSendable: 15000, maxSendable: 50000000, metadata: "[]" }));
    if (u.hostname === "bitcoin.co.ke" && u.pathname === "/lnurlp/cb/0712345678") { lastAmount = Number(u.searchParams.get("amount")); return new Response(JSON.stringify({ pr: invoice(lastAmount / 1000).pr, successAction: { tag: "url", url: "https://bitcoin.co.ke/receipt/abc" } })); }
    if (u.hostname === "evil.example") return new Response(JSON.stringify({ tag: "payRequest", callback: "https://evil.example/cb", minSendable: 1000, maxSendable: 1e9, metadata: "[]" }));
    if (u.pathname === "/cb") return new Response(JSON.stringify({ pr: invoice(999).pr })); // a different amount
    return realFetch(url, opts);
  };
  try {
    const w = await yw.walletByHandle("payer");
    const token = (await (await call("POST", "wallet/create", { pin: "316280", handle: "mpesa-user" })).json()).token;
    await yw.credit({ walletId: (await yw.walletByHandle("mpesa-user")).id, sats: 3000, kind: "receive", ref: "fund-mpesa" });
    const r = await (await call("POST", "wallet/send", { to: "0712345678@bitcoin.co.ke", sats: 2000, pin: "316280" }, token)).json();
    assert.equal(r.status, "completed");
    assert.equal(lastAmount, 2_000_000);
    assert.equal(r.receiptUrl, "https://bitcoin.co.ke/receipt/abc");
    assert.equal((await yw.walletByHandle("mpesa-user")).balance, 3000 - 2000 - 3);
    // An address that returns an invoice for another amount is refused, nothing taken.
    assert.equal((await call("POST", "wallet/send", { to: "x@evil.example", sats: 500, pin: "316280" }, token)).status, 400);
    // Paying another Ye₿ente wallet's invoice: a free transfer, no Lightning payment.
    const calls = payCalls.length;
    const inv = await yw.invoiceFor(w, 400);
    const t = await (await call("POST", "wallet/send", { to: inv.invoice, pin: "316280" }, token)).json();
    assert.ok(t.ref);
    assert.equal(payCalls.length, calls);
    assert.equal((await yw.walletByHandle("payer")).balance, 2997 + 400);
  } finally { globalThis.fetch = realFetch; }
});

// bech32 "lnurl1..." the way wallets print it under a QR code (LUD-01).
function lnurlEncode(url) {
  const A = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const poly = (vs) => { let c = 1; for (const v of vs) { const t = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((t >>> i) & 1) c ^= GEN[i]; } return c >>> 0; };
  const words = []; let acc = 0, bits = 0;
  for (const b of Buffer.from(url)) { acc = ((acc << 8) | b) & 0xfff; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); } }
  if (bits) words.push((acc << (5 - bits)) & 31);
  const hrp = [..."lnurl"].map((c) => c.charCodeAt(0));
  const p = poly([...hrp.map((c) => c >> 5), 0, ...hrp.map((c) => c & 31), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = Array.from({ length: 6 }, (_, i) => (p >>> (5 * (5 - i))) & 31);
  return "lnurl1" + [...words, ...chk].map((v) => A[v]).join("");
}

test("send to an LNURL from a QR code; a Ye₿ente wallet's own QR is a free transfer", async () => {
  assert.equal(yw.lnurlToUrl(lnurlEncode("https://bitcoin.co.ke/.well-known/lnurlp/0712345678").toUpperCase()), "https://bitcoin.co.ke/.well-known/lnurlp/0712345678");
  assert.equal(yw.lnurlToUrl("lnurlp://bitcoin.co.ke/lnurlp/Ab"), "https://bitcoin.co.ke/lnurlp/Ab");
  assert.equal(yw.lnurlToUrl(lnurlEncode("https://bitcoin.co.ke/x").slice(0, -1) + "q"), null); // bad checksum
  assert.equal(yw.lnurlToUrl(lnurlEncode("http://bitcoin.co.ke/x")), null); // not https
  const realFetch = globalThis.fetch;
  let lastAmount = null;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    if (u.hostname === "bitcoin.co.ke" && u.pathname === "/.well-known/lnurlp/0712345678") return new Response(JSON.stringify({ tag: "payRequest", callback: "https://bitcoin.co.ke/lnurlp/cb/0712345678", minSendable: 15000, maxSendable: 50000000, metadata: "[]" }));
    if (u.hostname === "bitcoin.co.ke" && u.pathname === "/lnurlp/cb/0712345678") { lastAmount = Number(u.searchParams.get("amount")); return new Response(JSON.stringify({ pr: invoice(lastAmount / 1000).pr })); }
    return realFetch(url, opts);
  };
  try {
    const token = (await (await call("POST", "wallet/create", { pin: "417306", handle: "qr-user" })).json()).token;
    await yw.credit({ walletId: (await yw.walletByHandle("qr-user")).id, sats: 2000, kind: "receive", ref: "fund-qr" });
    const r = await (await call("POST", "wallet/send", { to: `lightning:${lnurlEncode("https://bitcoin.co.ke/.well-known/lnurlp/0712345678").toUpperCase()}`, sats: 500, pin: "417306" }, token)).json();
    assert.equal(r.status, "completed");
    assert.equal(lastAmount, 500_000);
    const before = (await yw.walletByHandle("payer")).balance;
    const calls = payCalls.length;
    const t = await (await call("POST", "wallet/send", { to: lnurlEncode("https://altradits.test/.well-known/lnurlp/payer"), sats: 100, pin: "417306" }, token)).json();
    assert.ok(t.ref);
    assert.equal(payCalls.length, calls);
    assert.equal((await yw.walletByHandle("payer")).balance, before + 100);
  } finally { globalThis.fetch = realFetch; }
});

test("a payment whose result isn't known in time stays pending until the node answers", async () => {
  const w = await yw.walletByHandle("payer");
  const token = (await (await call("POST", "wallet/restore", { recovery: (await (await call("POST", "wallet/create", { pin: "417306", handle: "slow" })).json()).recovery, pin: "417306" })).json()).token;
  await yw.credit({ walletId: (await yw.walletByHandle("slow")).id, sats: 2000, kind: "receive", ref: "fund-slow" });
  payMode = "hang";
  const { pr, hash } = invoice(1000);
  const lightning = await import("../lib/lightning.js");
  // Instead of waiting 65 s for the timeout, settle the in-flight state the way the app would see it.
  const p = call("POST", "wallet/send", { to: pr, pin: "417306" }, token);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await yw.walletByHandle("slow")).balance, 2000 - 1000 - 10); // reserved while in flight
  payments.set(hash, "SUCCEEDED");
  assert.deepEqual(await lightning.paymentStatus(hash), { status: "succeeded", feeSats: 4 });
  yw.setPayTimings({ settleAfterMs: 0 });
  await yw.reconcilePayments();
  yw.setPayTimings({ settleAfterMs: 3 * 60e3 });
  assert.equal((await yw.walletByHandle("slow")).balance, 2000 - 1000 - 4);
  payMode = "ok";
  void p; void w;
});

test("an address whose invoice commits to someone else's description is refused, nothing taken", async () => {
  const realFetch = globalThis.fetch;
  const meta = JSON.stringify([["text/plain", "Pay shop@desc.example"]]);
  const good = crypto.createHash("sha256").update(meta).digest("hex");
  let wrong = true;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    if (u.hostname === "desc.example" && u.pathname === "/.well-known/lnurlp/shop") return Response.json({ tag: "payRequest", callback: "https://desc.example/cb", minSendable: 1000, maxSendable: 1e9, metadata: meta });
    if (u.hostname === "desc.example" && u.pathname === "/cb") return Response.json({ pr: invoice(Number(u.searchParams.get("amount")) / 1000, undefined, wrong ? "ab".repeat(32) : good).pr });
    return realFetch(url, opts);
  };
  try {
    const token = (await (await call("POST", "wallet/create", { pin: "730184", handle: "desc-check" })).json()).token;
    await yw.credit({ walletId: (await yw.walletByHandle("desc-check")).id, sats: 3000, kind: "receive", ref: "fund-desc" });
    const r = await call("POST", "wallet/send", { to: "shop@desc.example", sats: 500, pin: "730184" }, token);
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /something else/);
    assert.equal((await yw.walletByHandle("desc-check")).balance, 3000);
    wrong = false; // the right description: paid
    assert.equal((await (await call("POST", "wallet/send", { to: "shop@desc.example", sats: 500, pin: "730184" }, token)).json()).status, "completed");
  } finally { globalThis.fetch = realFetch; }
});

test("an unclear answer from the node (tunnel error page) never refunds a payment the node may still be sending", async () => {
  const token = (await (await call("POST", "wallet/create", { pin: "730184", handle: "tunnel" })).json()).token;
  const id = (await yw.walletByHandle("tunnel")).id;
  await yw.credit({ walletId: id, sats: 5000, kind: "receive", ref: "fund-tunnel" });
  // The node never got it: it says so when asked, and only then is everything refunded.
  payMode = "gateway";
  let r = await call("POST", "wallet/send", { to: invoice(1000).pr, pin: "730184" }, token);
  assert.equal(r.status, 502);
  assert.equal((await yw.walletByHandle("tunnel")).balance, 5000);
  // The node got it and is paying: it stays pending with the sats held, whatever the error page said.
  payMode = "gateway-paying";
  const { pr, hash } = invoice(1000);
  r = await call("POST", "wallet/send", { to: pr, pin: "730184" }, token);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "pending");
  assert.equal((await yw.walletByHandle("tunnel")).balance, 5000 - 1000 - 10);
  // The background check leaves a payment this young alone, then settles it from the node's record.
  payments.delete(hash);
  await yw.reconcilePayments();
  assert.equal((await yw.walletByHandle("tunnel")).balance, 5000 - 1000 - 10, "too young to judge: no refund");
  payments.set(hash, "SUCCEEDED");
  yw.setPayTimings({ settleAfterMs: 0 });
  await yw.reconcilePayments();
  yw.setPayTimings({ settleAfterMs: 3 * 60e3 });
  assert.equal((await yw.walletByHandle("tunnel")).balance, 5000 - 1000 - 4);
  payMode = "ok";
});

test("the daily sending cap counts the whole day, however many small entries follow", async () => {
  await call("POST", "wallet/create", { pin: "730184", handle: "busy" });
  const w = await yw.walletByHandle("busy");
  await yw._internal.record(w.id, { kind: "send", sats: -199_500, fee: 0, status: "completed", ref: "big-one" });
  for (let i = 0; i < 260; i++) await yw._internal.record(w.id, { kind: "receive", sats: 1, fee: 0, status: "completed", ref: `tiny-${i}` });
  await assert.rejects(yw._internal.spendable({ ...w, balance: 10_000 }, 1000), /daily sending limit/);
});

test("several open invoices can't take a wallet past its balance limit together", async () => {
  const was = process.env.YEBENTE_MAX_BALANCE_SATS;
  process.env.YEBENTE_MAX_BALANCE_SATS = "8000";
  try {
    await call("POST", "wallet/create", { pin: "730184", handle: "capped" });
    const w = await yw.walletByHandle("capped");
    await yw.invoiceFor(w, 3000);
    await yw.invoiceFor(w, 3000);
    await assert.rejects(yw.invoiceFor(w, 3000), /over its limit/);
    assert.ok(await yw.invoiceFor(w, 2000));
  } finally { if (was === undefined) delete process.env.YEBENTE_MAX_BALANCE_SATS; else process.env.YEBENTE_MAX_BALANCE_SATS = was; }
});

test("sending power: the channel reserve is never counted, and a send the node can't make is refused before anything is taken", async () => {
  const lightning = await import("../lib/lightning.js");
  // The live node on 30 Oct 2026: 20,143 sats on our side, 29,434 locked as reserve.
  localBalance = 20_143; channelReserve = 29_434;
  try {
    assert.equal(await lightning.outboundSats(), 0);
    const token = (await (await call("POST", "wallet/create", { pin: "730184", handle: "no-power" })).json()).token;
    await yw.credit({ walletId: (await yw.walletByHandle("no-power")).id, sats: 5000, kind: "receive", ref: "fund-no-power" });
    const calls = payCalls.length;
    const r = await call("POST", "wallet/send", { to: invoice(500).pr, pin: "730184" }, token);
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /paused: the node needs more Lightning balance/);
    assert.equal(payCalls.length, calls, "the node was never asked to pay");
    assert.equal((await yw.walletByHandle("no-power")).balance, 5000, "nothing taken");
    // Some power, but less than asked: the message says how much is possible.
    localBalance = 29_434 + 3_000;
    const r2 = await (await call("POST", "wallet/send", { to: invoice(5000).pr, pin: "730184" }, token)).json();
    assert.match(r2.error, /can send up to 2,970 sats/);
    // Handles still work: they never leave the ledger.
    assert.equal((await call("POST", "wallet/send", { to: "payer", sats: 100, pin: "730184" }, token)).status, 200);
  } finally { localBalance = 1_000_000; channelReserve = 0; }
});

test("admin top-up: shows sending power after reserves, makes a node invoice, confirms it from the node", async () => {
  process.env.ADMIN_TOKEN = "topup-admin-token-0123456789abcdef";
  const admin = await import("../api/admin.js");
  const req = (q, body, token = process.env.ADMIN_TOKEN) => (body ? admin.POST : admin.GET)(new Request(`https://altradits.test/api/admin${q}`, { method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": "198.51.100.9" }, body: body ? JSON.stringify(body) : undefined }));
  localBalance = 20_143; channelReserve = 29_434;
  const realFetch = globalThis.fetch; // the same fixed rates as the M-Pesa test: no live prices in tests
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("api.coinbase.com")) return new Response(JSON.stringify({ data: { amount: "100000" } }));
    if (u.includes("open.er-api.com")) return new Response(JSON.stringify({ rates: { KES: 130 } }));
    return realFetch(url, opts);
  };
  try {
    assert.equal((await req("?view=liquidity", null, "wrong-token-wrong-token-wrong-tok")).status, 401);
    const v = await (await req("?view=liquidity")).json();
    assert.equal(v.spendable, 0); assert.equal(v.reserve, 29_434); assert.equal(v.local, 20_143);
    assert.ok(v.suggested >= 20_000, "suggests enough to cover the wallets plus a buffer");
    assert.ok(v.presets.includes(10_000) && v.presets.includes(60_000) && v.presets.includes(v.suggested), "ready-made amounts, including the suggested one");
    assert.ok(v.presets.every((n) => n >= v.min && n <= v.max), "every preset can actually be paid in");
    assert.deepEqual(v.presets, [...v.presets].sort((a, b) => a - b));
    assert.equal((await req("", { action: "node_topup", sats: 10 })).status, 400, "below the minimum");
    assert.equal((await req("", { action: "node_topup", sats: 1.5e15 })).status, 400, "above what the channels can take");
    const t = await (await req("", { action: "node_topup", sats: 60_000 })).json();
    assert.match(t.bolt11, /^lnbc/); assert.match(t.qr, /<svg/);
    assert.equal((await (await req(`?view=topup&hash=${t.hash}`)).json()).state, "open");
    lndInvoices.get(t.hash).state = "SETTLED"; // paid from a wallet
    assert.equal((await (await req(`?view=topup&hash=${t.hash}`)).json()).state, "paid");
    assert.equal((await req("?view=topup&hash=../../etc")).status, 404);
  } finally { localBalance = 1_000_000; channelReserve = 0; globalThis.fetch = realFetch; }
});

test("without the pay macaroon, sending out is off (handles still work)", async () => {
  delete process.env.YEBENTE_LND_PAY_MACAROON;
  const token = (await (await call("POST", "wallet/create", { pin: "518274", handle: "nopay" })).json()).token;
  await yw.credit({ walletId: (await yw.walletByHandle("nopay")).id, sats: 500, kind: "receive", ref: "fund-nopay" });
  assert.equal((await call("POST", "wallet/send", { to: invoice(100).pr, pin: "518274" }, token)).status, 501);
  assert.equal((await call("POST", "wallet/send", { to: "payer", sats: 100, pin: "518274" }, token)).status, 200);
  process.env.YEBENTE_LND_PAY_MACAROON = MAC;
});

// ---- step 4: buying sats with M-Pesa (STK Push), Safaricom and the price feeds mocked
test("buy with M-Pesa: the prompt goes out, the sats are credited once when Safaricom confirms", async () => {
  Object.assign(process.env, { YEBENTE_MPESA_BUY: "on", MPESA_CONSUMER_KEY: "k", MPESA_CONSUMER_SECRET: "s", MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "p", YEBENTE_CALLBACK_SECRET: "c".repeat(32), YEBENTE_DAILY_BUY_KES: "3000", YEBENTE_MAX_BALANCE_SATS: "50000" });
  const realFetch = globalThis.fetch;
  const stk = [];
  let queryResult = { ResultCode: "1032", ResultDesc: "Cancelled" };
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("api.coinbase.com")) return new Response(JSON.stringify({ data: { amount: "100000" } }));
    if (u.includes("open.er-api.com")) return new Response(JSON.stringify({ rates: { KES: 130 } }));
    if (u.includes("/oauth/v1/generate")) return new Response(JSON.stringify({ access_token: "t", expires_in: "3599" }));
    if (u.includes("/mpesa/stkpush/v1/processrequest")) { const b = JSON.parse(opts.body); stk.push(b); return new Response(JSON.stringify({ ResponseCode: "0", CheckoutRequestID: `ws_CO_${stk.length}`, MerchantRequestID: "m", CustomerMessage: "ok" })); }
    if (u.includes("/mpesa/stkpushquery/v1/query")) return new Response(JSON.stringify(queryResult));
    return realFetch(url, opts);
  };
  try {
    const w = await (await call("POST", "wallet/create", { pin: "619427", handle: "buyer" })).json();
    // 1 BTC = 100,000 USD x 130 = 13,000,000 KES: 1,000 KES = 7,692 sats (no spread by default).
    let r = await (await call("POST", "wallet/buy", { kes: 1000, phone: "0712345678" }, w.token)).json();
    assert.equal(r.success, true, JSON.stringify(r));
    assert.equal(r.satsAmount, 7692);
    assert.equal(stk.at(-1).Amount, 1000);
    assert.equal(stk.at(-1).PhoneNumber, "254712345678");
    assert.match(stk.at(-1).CallBackURL, /\/api\/yebente\/mpesa\/callback\/c{32}$/);
    const id = r.checkoutRequestId;
    // Not paid yet: nothing credited.
    assert.equal((await yw.walletByHandle("buyer")).balance, 0);
    // Safaricom's callback (with the secret): credited once, even if it comes twice.
    const cb = { Body: { stkCallback: { CheckoutRequestID: id, ResultCode: 0, ResultDesc: "ok", CallbackMetadata: { Item: [{ Name: "MpesaReceiptNumber", Value: "QAB1234567" }, { Name: "PhoneNumber", Value: 254712345678 }] } } } };
    assert.equal((await call("POST", `mpesa/callback/${"c".repeat(32)}`, cb)).status, 200);
    assert.equal((await call("POST", `mpesa/callback/${"c".repeat(32)}`, cb)).status, 200);
    assert.equal((await yw.walletByHandle("buyer")).balance, 7692);
    const st = await (await call("GET", `wallet/buy/${id}`, null, w.token)).json();
    assert.equal(st.state, "paid"); assert.equal(st.resultCode, 0); assert.equal(st.mpesaReceiptNumber, "QAB1234567");
    const e = (await (await call("GET", "wallet/history", null, w.token)).json()).entries[0];
    assert.equal(e.kind, "buy"); assert.equal(e.ref, "MPESA-QAB1234567"); assert.equal(e.kes, 1000);
    // No callback: the status check asks Daraja. Cancelled -> nothing; paid -> credited.
    r = await (await call("POST", "wallet/buy", { kes: 500, phone: "0712345678" }, w.token)).json();
    assert.equal(r.success, true, JSON.stringify(r));
    const cancelled = await (await call("GET", `wallet/buy/${r.checkoutRequestId}`, null, w.token)).json();
    assert.equal(cancelled.state, "failed", JSON.stringify(cancelled));
    assert.equal((await yw.walletByHandle("buyer")).balance, 7692);
    r = await (await call("POST", "wallet/buy", { kes: 500, phone: "0712345678" }, w.token)).json();
    queryResult = { ResultCode: "0", ResultDesc: "ok", MpesaReceiptNumber: "QAB7654321" };
    assert.equal((await (await call("GET", `wallet/buy/${r.checkoutRequestId}`, null, w.token)).json()).state, "paid");
    assert.equal((await yw.walletByHandle("buyer")).balance, 7692 + 3846);
    // Another wallet can't see this purchase.
    assert.equal((await call("GET", `wallet/buy/${r.checkoutRequestId}`, null, juma.token)).status, 404);
    // Daily cap 3,000 KES: 1,500 bought (the cancelled one doesn't count), 1,600 more is refused.
    assert.equal((await call("POST", "wallet/buy", { kes: 1600, phone: "0712345678" }, w.token)).status, 400);
    // Below the minimum, or not whole shillings.
    assert.equal((await call("POST", "wallet/buy", { kes: 5, phone: "0712345678" }, w.token)).status, 400);
    // Solvency: when the node couldn't pay out what wallets would hold, buying pauses.
    localBalance = 1000;
    assert.equal((await call("POST", "wallet/buy", { kes: 100, phone: "0712345678" }, w.token)).status, 503);
    localBalance = 1_000_000;
    // The old anonymous STK (sats credited only in a browser) stays off.
    assert.equal((await call("POST", "mpesa/stkpush", { phone: "0712345678", amount: 100 })).status, 501);
  } finally { globalThis.fetch = realFetch; delete process.env.YEBENTE_MPESA_BUY; lnd.close(); }
});

test("switches accept on / true / yes / 1 in any case, with stray spaces or quotes", async () => {
  for (const v of ["on", "On", "ON ", " true", '"yes"', "1"]) { process.env.YEBENTE_WALLETS = v; assert.equal(yw.walletsOn(), true, v); }
  for (const v of ["", "off", "no", "0", "onn"]) { process.env.YEBENTE_WALLETS = v; assert.equal(yw.walletsOn(), false, v); }
  process.env.YEBENTE_WALLETS = "On ";
  const h = await (await call("GET", "health")).json();
  assert.equal(h.wallets, true);
  process.env.YEBENTE_WALLETS = "on";
});

// ---- recovery by email (option 2)
test("email recovery: a confirmed email gets a one-time link; the old devices are signed out and large payments wait 24 h", async () => {
  const store = await import("../lib/store.js");
  const sent = async () => store.getMany("email", await store.listIds("emails", 50));
  const w = await (await call("POST", "wallet/create", { pin: "719263", handle: "zawadi", email: "Zawadi@Example.org" })).json();
  assert.equal(w.wallet.emailPending, "zawadi@example.org");
  assert.equal(w.wallet.email, null);
  const confirm = (await sent()).find((e) => e.subject === "Confirm your Ye₿ente recovery email");
  assert.equal(confirm.status, "logged"); // sent straight away, not held for approval
  // Before confirming, recovery sends nothing.
  await call("POST", "wallet/recover-email", { email: "zawadi@example.org" });
  assert.ok(!(await sent()).some((e) => /^Recover your Ye₿ente wallet/.test(e.subject)));
  const t = new URL(confirm.cta.url).searchParams.get("t");
  assert.equal((await call("GET", `wallet/email-confirm?t=${t}`)).status, 200);
  assert.equal((await call("GET", `wallet/email-confirm?t=${t}`)).status, 410); // once
  assert.equal((await (await call("GET", "wallet/me", null, w.token)).json()).wallet.email, "zawadi@example.org");
  await yw.credit({ walletId: w.wallet.id, sats: 5000, kind: "receive", ref: "fund-zawadi" });

  // Same answer for an unknown email.
  const unknown = await (await call("POST", "wallet/recover-email", { email: "nobody@example.org" })).json();
  const known = await (await call("POST", "wallet/recover-email", { email: "ZAWADI@example.org" })).json();
  assert.deepEqual(unknown, known);
  const link = (await sent()).find((e) => e.subject === "Recover your Ye₿ente wallet zawadi");
  assert.match(link.cta.url, /\/yebente\?recover=/);
  const token = new URL(link.cta.url).searchParams.get("recover");

  const done = await (await call("POST", "wallet/recover-email/finish", { token, pin: "813592" })).json();
  assert.equal(done.success, true);
  assert.ok(done.wallet.holdUntil);
  assert.equal((await call("POST", "wallet/recover-email/finish", { token, pin: "813592" })).status, 410); // one use
  assert.equal((await call("GET", "wallet/me", null, w.token)).status, 401); // the old phone is signed out
  // The 24-hour hold: small payments go, larger ones wait.
  assert.equal((await call("POST", "wallet/send", { to: "juma", sats: 500, pin: "813592" }, done.token)).status, 200);
  assert.equal((await call("POST", "wallet/send", { to: "juma", sats: 2000, pin: "813592" }, done.token)).status, 423);
  assert.ok((await sent()).some((e) => e.subject === "Your Ye₿ente wallet zawadi was recovered" && e.to === "zawadi@example.org"));
  // Changing the email needs the PIN.
  assert.equal((await call("POST", "wallet/email", { email: "new@example.org", pin: "093716" }, done.token)).status, 403);
  assert.equal((await call("POST", "wallet/email", { email: "new@example.org", pin: "813592" }, done.token)).status, 200);
});

// ---- fingerprint / face approval: the test plays the phone's authenticator (ES256)
test("fingerprint approval: turned on with the PIN, then a signed one-time challenge stands in for the PIN", async () => {
  const token = (await (await call("POST", "wallet/create", { pin: "518274", handle: "bio-user" })).json()).token;
  await call("POST", "wallet/create", { pin: "619427", handle: "bio-friend" });
  await yw.credit({ walletId: (await yw.walletByHandle("bio-user")).id, sats: 1000, kind: "receive", ref: "fund-bio" });
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const id = crypto.randomBytes(20).toString("base64url");
  const b64 = (b) => Buffer.from(b).toString("base64url");
  const client = (type, challenge, origin = "https://altradits.test") => b64(JSON.stringify({ type, challenge, origin }));
  let counter = 0;
  const authData = (flags = 0x05, rp = "altradits.test") => { const c = Buffer.alloc(4); c.writeUInt32BE(++counter); return Buffer.concat([crypto.createHash("sha256").update(rp).digest(), Buffer.from([flags]), c]); };
  const assertion = async ({ origin, flags, rp, key = privateKey } = {}) => {
    const { challenge } = await (await call("POST", "wallet/passkey/options", {}, token)).json();
    const cd = client("webauthn.get", challenge, origin), ad = authData(flags, rp);
    const sig = crypto.sign("sha256", Buffer.concat([ad, crypto.createHash("sha256").update(Buffer.from(cd, "base64url")).digest()]), key);
    return { id, clientDataJSON: cd, authenticatorData: b64(ad), signature: b64(sig) };
  };
  const send = (passkey) => call("POST", "wallet/send", { to: "bio-friend", sats: 10, passkey }, token);

  // Not set up yet: refused.
  assert.equal((await send(await assertion())).status, 403);
  // Turning it on needs the PIN.
  const add = async (pin) => {
    const { challenge } = await (await call("POST", "wallet/passkey/options", {}, token)).json();
    return call("POST", "wallet/passkey/add", { pin, id, alg: -7, publicKey: b64(publicKey.export({ type: "spki", format: "der" })), clientDataJSON: client("webauthn.create", challenge) }, token);
  };
  assert.equal((await add("093716")).status, 403);
  assert.equal((await (await add("518274")).json()).passkeys, 1);
  assert.equal((await (await call("GET", "wallet/me", null, token)).json()).wallet.passkeys, 1);

  // A good approval pays; the same approval can't be used twice.
  const a = await assertion();
  assert.equal((await send(a)).status, 200);
  assert.notEqual((await send(a)).status, 200);
  // Another site, no fingerprint (user not verified), another key, or a copied key (counter going back): refused.
  assert.equal((await send(await assertion({ origin: "https://evil.example" }))).status, 403);
  assert.equal((await send(await assertion({ flags: 0x01 }))).status, 403);
  assert.equal((await send(await assertion({ rp: "evil.example" }))).status, 403);
  assert.equal((await send(await assertion({ key: crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey }))).status, 403);
  counter = 0;
  assert.equal((await send(await assertion())).status, 403);
  // A body can't pretend to be an approval.
  assert.equal((await call("POST", "wallet/send", { to: "bio-friend", sats: 10, pin: { walletId: "x", used: false } }, token)).status, 403);
  assert.equal((await yw.walletByHandle("bio-user")).balance, 990);
  // Turned off with the PIN.
  assert.equal((await (await call("POST", "wallet/passkey/off", { pin: "518274" }, token)).json()).passkeys, 0);
  counter = 100;
  assert.equal((await send(await assertion())).status, 403);
});
