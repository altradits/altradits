// A pay key baked without offchain:read can pay but can't read the node's
// channels or payments. Those reads fall back to the read-only key, so a send
// is never refused while the node is fine, and a slow payment still settles.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { execFileSync } from "node:child_process";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-paykey-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "SMTP_HOST", "RESEND_API_KEY", "EMAIL_TRANSPORT", "LND_INVOICE_MACAROON"]) delete process.env[k];
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
const PAY = "aa".repeat(32), RO = "bb".repeat(32);
const node = { paid: new Map(), sendAnswer: "SUCCEEDED", reads: { pay: 0, ro: 0 } };
const lnd = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
  const mac = req.headers["grpc-metadata-macaroon"];
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    if (req.method === "GET") {
      // The pay key may not read; the read-only key may.
      if (mac === PAY) { node.reads.pay++; res.writeHead(403).end(JSON.stringify({ message: "permission denied" })); return; }
      if (mac !== RO) { res.writeHead(401).end("{}"); return; }
      node.reads.ro++;
      if (req.url.startsWith("/v1/channels")) { res.end(JSON.stringify({ channels: [{ active: true, local_balance: "100000", local_constraints: { chan_reserve_sat: "1000" } }] })); return; }
      if (req.url.startsWith("/v1/payments")) { res.end(JSON.stringify({ payments: [...node.paid.entries()].map(([h, st]) => ({ payment_hash: h, status: st, fee_sat: "2" })) })); return; }
      res.writeHead(404).end("{}"); return;
    }
    if (req.url === "/v2/router/send" && mac === PAY) {
      const pr = JSON.parse(body).payment_request;
      const hash = invoiceHash.get(pr);
      if (node.sendAnswer === "SUCCEEDED") { node.paid.set(hash, "SUCCEEDED"); res.end(JSON.stringify({ result: { status: "SUCCEEDED", fee_sat: "2" } }) + "\n"); return; }
      node.paid.set(hash, "IN_FLIGHT"); // the tunnel drops mid-call: no answer, but the node keeps paying
      res.writeHead(502).end("<html>bad gateway</html>"); return;
    }
    res.writeHead(403).end("{}");
  });
});
await new Promise((r) => lnd.listen(0, "127.0.0.1", r));
lnd.unref();
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", YEBENTE_MAX_BALANCE_SATS: "100000", YEBENTE_MAX_PAYMENT_SATS: "50000",
  LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_TLS_CERT: fs.readFileSync("cert.pem").toString("base64"),
  YEBENTE_LND_PAY_MACAROON: PAY, LND_READONLY_MACAROON: RO });

const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
(await import("../lib/email.js")).setMailer({ sendMail: async () => {} });
yw.setPayTimings({ recheckMs: 20, settleAfterMs: 0 });
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const invoiceHash = new Map();
function invoice(sats) {
  const hash = crypto.randomBytes(32).toString("hex");
  const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hash), ...Array(104).fill(0)];
  const pr = `lnbc${sats * 10}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq";
  invoiceHash.set(pr, hash);
  return pr;
}
const create = async (handle, pin) => (await api.POST(new Request("https://altradits.test/api/yebente/wallet/create", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `7.6.5.${handle.length}` }, body: JSON.stringify({ pin, handle }) }))).json();
const send = (token, body) => api.POST(new Request("https://altradits.test/api/yebente/wallet/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));

test("the pay key can't read: the send still goes, read through the read-only key", async () => {
  const a = await create("paykeyok", "604311");
  await yw.credit({ walletId: a.wallet.id, sats: 5000, kind: "receive", ref: "fund-paykeyok" });
  const r = await send(a.token, { to: invoice(500), pin: "604311" });
  const body = await r.json();
  assert.equal(r.status, 200, body.error);
  assert.equal(body.status, "completed");
  assert.ok(node.reads.ro > 0, "the read-only key answered the reads");
  const w = await yw.walletByHandle("paykeyok");
  assert.equal(w.balance, 5000 - 500 - 2, "500 sent, the 2-sat fee kept, the rest of the reserve refunded");
});

test("a payment whose answer was lost settles from the node's own record, read with the read-only key", async () => {
  const a = await create("paykeyslow", "604312");
  await yw.credit({ walletId: a.wallet.id, sats: 5000, kind: "receive", ref: "fund-paykeyslow" });
  node.sendAnswer = "LOST";
  try {
    const r = await send(a.token, { to: invoice(700), pin: "604312" });
    const body = await r.json();
    assert.equal(r.status, 200, body.error);
    assert.equal(body.status, "pending", "no answer yet: shown as not confirmed");
    for (const [h, st] of node.paid) if (st === "IN_FLIGHT") node.paid.set(h, "SUCCEEDED"); // the node finishes it
    await yw.reconcilePayments();
    const w = await yw.walletByHandle("paykeyslow");
    assert.equal((await yw.history(w.id))[0].status, "completed", "settled without anyone stepping in");
  } finally { node.sendAnswer = "SUCCEEDED"; }
});
