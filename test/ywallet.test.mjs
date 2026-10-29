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
const api = await import("../api/yebente.js");
let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `9.9.9.${++n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));

let amina, juma;
test("create a wallet: a handle, a Lightning address, a device token and a recovery phrase shown once", async () => {
  const r = await (await call("POST", "wallet/create", { pin: "123456", handle: "Amina" })).json();
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
  assert.doesNotMatch(raw, /"123456"/);
  // Handle rules and uniqueness.
  assert.equal((await call("POST", "wallet/create", { pin: "123456", handle: "amina" })).status, 409);
  assert.equal((await call("POST", "wallet/create", { pin: "123456", handle: "admin" })).status, 400);
  assert.equal((await call("POST", "wallet/create", { pin: "1234", handle: "bob" })).status, 400);
  const auto = await (await call("POST", "wallet/create", { pin: "654321" })).json();
  assert.match(auto.wallet.handle, /^[a-z]+\d{4}$/);
  juma = await (await call("POST", "wallet/create", { pin: "111111", handle: "juma" })).json();
});

test("signed-in calls need the device token; a recovery phrase restores the wallet on a new phone", async () => {
  assert.equal((await call("GET", "wallet/me")).status, 401);
  assert.equal((await call("GET", "wallet/me", null, "x".repeat(32))).status, 401);
  const me = await (await call("GET", "wallet/me", null, amina.token)).json();
  assert.equal(me.wallet.handle, "amina");
  assert.equal((await call("POST", "wallet/restore", { recovery: "wrong words", pin: "222222" })).status, 404);
  const back = await (await call("POST", "wallet/restore", { recovery: amina.recovery.toUpperCase(), pin: "222222" })).json();
  assert.equal(back.wallet.handle, "amina");
  assert.notEqual(back.token, amina.token);
  amina.token = back.token; // the new PIN is 222222
});

test("transfers between wallets: free and instant, with the PIN; wrong PINs lock spending", async () => {
  await yw.credit({ walletId: amina.wallet.id, sats: 8000, kind: "receive", ref: "hash-1" });
  const dup = await yw.credit({ walletId: amina.wallet.id, sats: 8000, kind: "receive", ref: "hash-1" });
  assert.equal(dup.duplicate, true); // the same payment never credits twice
  let r = await call("POST", "wallet/send", { to: "juma@altradits.test", sats: 1500, pin: "222222", note: "lunch" }, amina.token);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).wallet.balance, 6500);
  const j = await (await call("GET", "wallet/me", null, juma.token)).json();
  assert.equal(j.wallet.balance, 1500);
  const h = await (await call("GET", "wallet/history", null, juma.token)).json();
  assert.equal(h.entries[0].kind, "transfer_in");
  assert.equal(h.entries[0].counterparty, "amina@altradits.test");
  // Unknown handle, self, external addresses (not yet).
  assert.equal((await call("POST", "wallet/send", { to: "nobody", sats: 10, pin: "222222" }, amina.token)).status, 404);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 10, pin: "222222" }, amina.token)).status, 400);
  assert.equal((await call("POST", "wallet/send", { to: "x@walletofsatoshi.com", sats: 10, pin: "222222" }, amina.token)).status, 400);
  // Five wrong PINs lock spending, even with the right PIN after.
  for (let i = 0; i < 5; i++) assert.equal((await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "999999" }, amina.token)).status, 403);
  assert.equal((await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "222222" }, amina.token)).status, 429);
});

test("limits: per payment, per day, recipient balance; never more than the balance", async () => {
  // Juma: 1,500 sats. Over the balance, over the per-payment cap.
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 2000, pin: "111111" }, juma.token)).status, 402);
  await yw.credit({ walletId: juma.wallet.id, sats: 8000, kind: "receive", ref: "hash-2" });
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 5001, pin: "111111" }, juma.token)).status, 400);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 1.5, pin: "111111" }, juma.token)).status, 400);
  // Amina holds 6,500 of a 10,000 cap: 4,000 more would overfill her wallet.
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 4000, pin: "111111" }, juma.token)).status, 400);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 3000, pin: "111111" }, juma.token)).status, 200);
  // Daily cap 6,000: 3,000 sent, 3,001 more is refused.
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 3001, pin: "111111" }, juma.token)).status, 400);
});

test("ten sends at once can never spend the same sats twice", async () => {
  const w = await (await call("POST", "wallet/create", { pin: "333333", handle: "rush" })).json();
  await yw.credit({ walletId: w.wallet.id, sats: 100, kind: "receive", ref: "hash-3" });
  const results = await Promise.all(Array.from({ length: 10 }, () => call("POST", "wallet/send", { to: "juma", sats: 60, pin: "333333" }, w.token)));
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
let lnd;
async function fakeLnd() {
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
        res.end(JSON.stringify({ r_hash: hash.toString("base64"), payment_request: `lnbc${value}0n1fake` }));
        return;
      }
      if (req.url === "/v1/balance/channels") { res.end(JSON.stringify({ remote_balance: { sat: "10000000" } })); return; }
      const m = req.url.match(/^\/v1\/invoice\/([0-9a-f]+)$/);
      if (m && lndInvoices.has(m[1])) { res.end(JSON.stringify(lndInvoices.get(m[1]))); return; }
      res.writeHead(404).end("{}");
    });
  });
  await new Promise((r) => lnd.listen(0, "localhost", r));
  Object.assign(process.env, { LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_INVOICE_MACAROON: MAC, LND_TLS_CERT: fs.readFileSync("cert.pem").toString("base64") });
}

test("receive: an invoice for the wallet is credited once, when the node says it is paid", async () => {
  await fakeLnd();
  const w = await (await call("POST", "wallet/create", { pin: "444444", handle: "wanjiru" })).json();
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
  lnd.close();
});

test("wallets stay off until YEBENTE_WALLETS=on", async () => {
  delete process.env.YEBENTE_WALLETS;
  assert.equal((await call("POST", "wallet/create", { pin: "555555" })).status, 501);
  assert.equal((await call("GET", "lnurlp/wanjiru")).status, 404);
  process.env.YEBENTE_WALLETS = "on";
});
