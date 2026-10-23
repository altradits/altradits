// Lightning scan-to-pay: a fake LND node (HTTPS, self-signed, like a real one)
// and a mocked Lightning address. Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ln-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL", "LND_INVOICE_MACAROON"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";
process.env.SITE_URL = "https://altradits.test";

// --- fake LND ----------------------------------------------------------
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost", "-keyout", "key.pem", "-out", "cert.pem"], { stdio: "ignore" });
const MACAROON = "0201036c6e64";
const invoices = new Map();
let lnd;
before(async () => {
  lnd = https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
    if (req.headers["grpc-metadata-macaroon"] !== MACAROON) { res.writeHead(401).end(JSON.stringify({ message: "bad macaroon" })); return; }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/invoices") {
        const { value, memo, description_hash } = JSON.parse(body);
        const hash = Buffer.from(String(invoices.size + 1).padStart(32, "0"));
        invoices.set(hash.toString("hex"), { state: "OPEN", value, memo, description_hash });
        res.end(JSON.stringify({ r_hash: hash.toString("base64"), payment_request: `lnbc${value}0n1fake${invoices.size}` }));
        return;
      }
      const m = req.url.match(/^\/v1\/invoice\/([0-9a-f]+)$/);
      if (req.method === "GET" && m && invoices.has(m[1])) { res.end(JSON.stringify(invoices.get(m[1]))); return; }
      res.writeHead(404).end(JSON.stringify({ message: "not found" }));
    });
  });
  await new Promise((r) => lnd.listen(0, "localhost", r));
});
after(() => lnd.close());

// --- mocked internet: price feed + Lightning address ----------------------
const realFetch = globalThis.fetch;
let lnurlAmountOverride = null;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("api.coinbase.com")) return Response.json({ data: { amount: "80000.00" } });
  if (u.includes("/.well-known/lnurlp/")) return Response.json({ tag: "payRequest", callback: "https://wallet.test/cb", minSendable: 1000, maxSendable: 1e11, commentAllowed: 255 });
  if (u.startsWith("https://wallet.test/cb")) {
    const msats = Number(new URL(u).searchParams.get("amount"));
    return Response.json({ pr: `lnbc${(lnurlAmountOverride ?? msats) / 100}n1addressinvoice` });
  }
  return realFetch(url, opts);
};

const root = new URL("../", import.meta.url);
const crm = await import(new URL("lib/crm.js", root));
const pay = await import(new URL("api/pay.js", root));
const proposalApi = await import(new URL("api/proposal.js", root));
const admin = await import(new URL("api/admin.js", root));
const ln = await import(new URL("lib/lightning.js", root));

const req = (method, url, body) => new Request(`https://altradits.test${url}`, {
  method, headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, ...a) => { const r = await fn(req(...a)); return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() }; };

async function acceptedProposal(email) {
  const lead = await crm.createLead({ email, name: "Ana" });
  const { proposal } = crm.priceProposal(lead, { executive_summary: "x", items: [{ package_id: "core" }] });
  await crm.publishProposal("https://altradits.test", lead, proposal);
  lead.proposalId = proposal.id;
  await crm.saveLead(lead);
  const r = await call(proposalApi.POST, "POST", "/api/proposal", { id: proposal.id, t: proposal.token, action: "accept", name: "Ana", agree: true });
  assert.equal(r.body.proposal.status, "accepted");
  return { lead, p: proposal };
}

test("bolt11 amount parsing", () => {
  assert.equal(ln.bolt11Msats("lnbc10u1p4d4z5e"), 1_000_000);
  assert.equal(ln.bolt11Msats("lnbc9362500n1xyz"), 936_250_000);
  assert.equal(ln.bolt11Msats("lnbc2m1abc"), 200_000_000);
  assert.equal(ln.bolt11Msats("lnbc1pxyz"), null, "amountless invoice");
});

test("Lightning address mode: exact-amount QR, manual confirmation", async () => {
  const { p } = await acceptedProposal("addr@example.com");
  const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.invoice.sats, Math.ceil((749 / 80000) * 1e8), "$749 at $80k");
  assert.equal(r.body.invoice.autoConfirm, false);
  assert.match(r.body.invoice.qr, /^<svg/);
  const again = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
  assert.equal(again.body.invoice.bolt11, r.body.invoice.bolt11, "unexpired invoice is reused");
  const check = await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
  assert.equal(check.body.paid, false);
  assert.equal(check.body.verifiable, false, "address mode can't verify, Stanley confirms");

  const qr = await call(pay.GET, "GET", "/api/pay?qr=address");
  assert.match(qr.body, /^<svg/);
});

test("Lightning address returning a wrong amount is refused", async () => {
  const { p } = await acceptedProposal("wrong@example.com");
  lnurlAmountOverride = 1000;
  const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
  lnurlAmountOverride = null;
  assert.equal(r.status, 502);
});

test("LND mode: invoice on the node, settles, client activated automatically", async () => {
  process.env.LND_REST_URL = `https://localhost:${lnd.address().port}`;
  process.env.LND_INVOICE_MACAROON = MACAROON;
  process.env.LND_TLS_CERT = fs.readFileSync("cert.pem").toString("base64");
  try {
    const { lead, p } = await acceptedProposal("lnd@example.com");
    assert.equal((await call(pay.POST, "POST", "/api/pay", { id: "nope", t: "x" })).status, 404, "token required");
    const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.invoice.autoConfirm, true);
    const [hash, inv] = [...invoices.entries()].at(-1);
    assert.equal(Number(inv.value), r.body.invoice.sats);
    assert.match(inv.memo, new RegExp(p.id));

    let check = await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
    assert.equal(check.body.paid, false);

    invoices.get(hash).state = "SETTLED";
    check = await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
    assert.equal(check.body.status, "paid");
    assert.equal((await crm.getLead(lead.id)).stage, "active");
    assert.equal((await crm.getProposal(p.id)).payment.method, "Bitcoin (Lightning)");

    // A second poll must not re-send emails.
    await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
    const o = (await call(admin.GET, "GET", "/api/admin")).body;
    const mine = o.emails.filter((e) => e.leadId === lead.id || /lnd@example/.test(e.text));
    assert.equal(mine.filter((e) => /Payment received/.test(e.subject)).length, 1, "one kick-off email");
    assert.equal(o.emails.filter((e) => e.kind === "owner" && /Paid ⚡/.test(e.subject)).length, 1, "one owner email");
    assert.match(o.system.lightning, /LND/);
  } finally {
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON; delete process.env.LND_TLS_CERT;
  }
});

test("LNURL encoding matches the LUD-01 test vector", async () => {
  const { encodeLnurl } = await import(new URL("lib/lnurl.js", root));
  assert.equal(encodeLnurl("https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df"),
    "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS");
});

test("instant QR + fixed-amount LNURL; paying via the LNURL confirms the proposal", async () => {
  const crypto = await import("node:crypto");
  const { encodeLnurl } = await import(new URL("lib/lnurl.js", root));
  const lnurlApi = await import(new URL("api/lnurl.js", root));
  process.env.LND_REST_URL = `https://localhost:${lnd.address().port}`;
  process.env.LND_INVOICE_MACAROON = MACAROON;
  process.env.LND_TLS_CERT = fs.readFileSync("cert.pem").toString("base64");
  try {
    const { lead, p } = await acceptedProposal("lnurl@example.com");
    const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
    const inv = r.body.invoice;
    assert.match(inv.qr, /^<svg/, "QR for the exact amount");
    assert.equal(inv.lnurlFixedAmount, true);
    assert.equal(inv.lnurl, encodeLnurl(`https://altradits.test/api/lnurl?p=${p.id}&t=${p.token}`));

    // Wallet step 1: pay request with the quoted amount (±2% for price moves).
    const meta = await call(lnurlApi.GET, "GET", `/api/lnurl?p=${p.id}&t=${p.token}`);
    assert.equal(meta.body.tag, "payRequest");
    const sats = Math.ceil((749 / 80000) * 1e8);
    assert.ok(meta.body.minSendable <= sats * 1000 && meta.body.maxSendable >= sats * 1000);
    assert.equal((await call(lnurlApi.GET, "GET", `/api/lnurl?p=${p.id}&t=wrong`)).body.status, "ERROR");

    // Wallet step 2: callback with the amount -> invoice from our node, committed to the metadata.
    const bad = await call(lnurlApi.GET, "GET", `/api/lnurl?p=${p.id}&t=${p.token}&amount=1000`);
    assert.equal(bad.body.status, "ERROR", "wrong amount refused");
    const cb = await call(lnurlApi.GET, "GET", `/api/lnurl?p=${p.id}&t=${p.token}&amount=${sats * 1000}`);
    assert.match(cb.body.pr, /^lnbc/);
    const [hash, onNode] = [...invoices.entries()].at(-1);
    assert.equal(Number(onNode.value), sats);
    assert.equal(onNode.description_hash, crypto.createHash("sha256").update(meta.body.metadata).digest().toString("base64"), "description hash = sha256(metadata)");

    // Paid through the LNURL invoice (not the QR one): still auto-confirmed.
    onNode.state = "SETTLED";
    const check = await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
    assert.equal(check.body.status, "paid");
    assert.equal((await crm.getLead(lead.id)).stage, "active");
    assert.equal((await call(lnurlApi.GET, "GET", `/api/lnurl?p=${p.id}&t=${p.token}`)).body.reason, "This proposal is already paid.");
  } finally {
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON; delete process.env.LND_TLS_CERT;
  }
});
