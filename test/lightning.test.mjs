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
let inbound = null;   // null = macaroon without offchain:read
let addrCount = 0;
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
      if (req.method === "GET" && req.url === "/v1/balance/channels") {
        if (inbound === null) { res.writeHead(403).end(JSON.stringify({ message: "permission denied" })); return; }
        res.end(JSON.stringify({ remote_balance: { sat: String(inbound) } }));
        return;
      }
      if (req.method === "GET" && req.url.startsWith("/v1/newaddress")) { res.end(JSON.stringify({ address: `bcrt1qfakeaddress${++addrCount}` })); return; }
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
const chain = new Map(); // address -> { confirmed, unconfirmed }
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("mempool.space/api/v1/fees/recommended")) return Response.json({ fastestFee: 5, halfHourFee: 3, hourFee: 2 });
  const a = u.match(/mempool\.space\/api\/address\/(\w+)$/);
  if (a) { const c = chain.get(a[1]) || { confirmed: 0, unconfirmed: 0 }; return Response.json({ chain_stats: { funded_txo_sum: c.confirmed }, mempool_stats: { funded_txo_sum: c.unconfirmed } }); }
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

test("node offline: the client still gets a payable QR from the Lightning address", async () => {
  process.env.LND_REST_URL = "https://localhost:1"; // nothing listening
  process.env.LND_INVOICE_MACAROON = MACAROON;
  try {
    const { p } = await acceptedProposal("offline@example.com");
    const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.invoice.bolt11, /addressinvoice/, "invoice from the Lightning address");
    assert.equal(r.body.invoice.autoConfirm, false, "Stanley confirms this one");
    assert.equal(r.body.invoice.lnurlFixedAmount, false, "address LNURL while the node is down");
    assert.match(r.body.invoice.qr, /^<svg/);
  } finally {
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON;
  }
});

test("any wallet: on-chain address, unified QR, fees shown, on-chain payment confirms", async () => {
  process.env.LND_REST_URL = `https://localhost:${lnd.address().port}`;
  process.env.LND_INVOICE_MACAROON = MACAROON;
  process.env.LND_TLS_CERT = fs.readFileSync("cert.pem").toString("base64");
  ln.resetCapacityCache();
  inbound = 10_000_000;
  try {
    const { lead, p } = await acceptedProposal("chain@example.com");
    const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
    const sats = Math.ceil((749 / 80000) * 1e8);
    const { invoice, onchain, unified, fees } = r.body;
    assert.equal(invoice.provider ?? "lnd", "lnd");
    assert.match(onchain.address, /^bcrt1q/);
    assert.equal(onchain.btc, (sats / 1e8).toFixed(8));
    assert.equal(unified.uri, `bitcoin:${onchain.address}?amount=${onchain.btc}&label=Altradits&lightning=${invoice.bolt11}`, "BIP21 with Lightning fallback");
    assert.match(unified.qr, /^<svg/);
    assert.equal(fees.altradits, 0, "we add no fee");
    assert.deepEqual(fees.onchain.normal, { satPerVb: 3, sats: 423, usd: Math.round(423 * 80000 / 1e8 * 100) / 100 });
    assert.ok(fees.lightning.maxSats > 0);

    // Same address on reload (one per proposal).
    assert.equal((await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token })).body.onchain.address, onchain.address);

    // Partial, then seen in the mempool, then confirmed.
    chain.set(onchain.address, { confirmed: 0, unconfirmed: 1000 });
    assert.equal((await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`)).body.onchainSeen, "partial");
    chain.set(onchain.address, { confirmed: 0, unconfirmed: sats });
    const seen = await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
    assert.equal(seen.body.paid, false);
    assert.equal(seen.body.onchainSeen, true);
    chain.set(onchain.address, { confirmed: sats, unconfirmed: 0 });
    const done = await call(pay.GET, "GET", `/api/pay?id=${p.id}&t=${p.token}`);
    assert.equal(done.body.status, "paid");
    assert.equal((await crm.getProposal(p.id)).payment.method, "Bitcoin (on-chain)");
    assert.equal((await crm.getLead(lead.id)).stage, "active");
  } finally {
    inbound = null;
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON; delete process.env.LND_TLS_CERT;
  }
});

test("amount above channel capacity: Lightning address invoice, LNURL refused, on-chain still offered", async () => {
  const lnurlApi = await import(new URL("api/lnurl.js", root));
  process.env.LND_REST_URL = `https://localhost:${lnd.address().port}`;
  process.env.LND_INVOICE_MACAROON = MACAROON;
  process.env.LND_TLS_CERT = fs.readFileSync("cert.pem").toString("base64");
  ln.resetCapacityCache();
  inbound = 50_000; // far below ~936k sats
  try {
    const { p } = await acceptedProposal("big@example.com");
    const r = await call(pay.POST, "POST", "/api/pay", { id: p.id, t: p.token });
    assert.match(r.body.invoice.bolt11, /addressinvoice/, "custodial address has no capacity limit");
    assert.match(r.body.onchain.address, /^bcrt1q/);
    const meta = await call(lnurlApi.GET, "GET", `/api/lnurl?p=${p.id}&t=${p.token}`);
    assert.equal(meta.body.status, "ERROR");
    assert.match(meta.body.reason, /On-chain/);
  } finally {
    inbound = null;
    ln.resetCapacityCache();
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON; delete process.env.LND_TLS_CERT;
  }
});

test("website order: price button -> QR for the full price -> payment confirms the order and queues the task", async () => {
  const order = await import(new URL("api/order.js", root));
  const chat = await import(new URL("api/chat.js", root));
  const ops = await import(new URL("lib/ops.js", root));
  process.env.LND_REST_URL = `https://localhost:${lnd.address().port}`;
  process.env.LND_INVOICE_MACAROON = MACAROON;
  process.env.LND_TLS_CERT = fs.readFileSync("cert.pem").toString("base64");
  ln.resetCapacityCache();
  try {
    // No talking: the public chat is closed.
    assert.equal((await call(chat.POST, "POST", "/api/chat", { message: "hi" })).status, 410);
    assert.equal((await call(order.POST, "POST", "/api/order", { item: "nope" })).status, 400);

    const o = (await call(order.POST, "POST", "/api/order", { item: "website" })).body;
    assert.equal(o.item.usd, 600, "projects ordered online are paid in full");
    const r = await call(pay.POST, "POST", "/api/pay", { id: o.id, t: o.t });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.invoice.sats, Math.ceil((600 / 80000) * 1e8));
    assert.equal((await call(order.GET, "GET", `/api/order?id=${o.id}&t=${o.t}`)).body.status, "accepted");

    assert.equal((await call(order.POST, "POST", "/api/order", { id: o.id, t: o.t, email: "bad" })).status, 400);
    await call(order.POST, "POST", "/api/order", { id: o.id, t: o.t, email: "Buyer@Example.com", name: "Bo", task: "5 pages for my bakery" });

    const [, onNode] = [...invoices.entries()].at(-1);
    onNode.state = "SETTLED";
    assert.equal((await call(pay.GET, "GET", `/api/pay?id=${o.id}&t=${o.t}`)).body.status, "paid");
    const done = (await call(order.GET, "GET", `/api/order?id=${o.id}&t=${o.t}`)).body;
    assert.equal(done.status, "paid");
    assert.match(done.portal, /portal\.html\?c=/);
    assert.equal(done.emailed, true);

    const p = await crm.getProposal(o.id);
    const lead = await crm.getLead(p.leadId);
    assert.equal(lead.stage, "active");
    assert.equal(lead.email, "buyer@example.com");
    const task = await ops.getTask(p.order.taskId);
    assert.equal(task.title, "Website or landing page");
    assert.equal(task.details, "5 pages for my bakery");
    assert.equal(task.department, "tech");

    // Details added after paying reach the task.
    await call(order.POST, "POST", "/api/order", { id: o.id, t: o.t, task: "5 pages for my bakery, launch by Friday" });
    assert.match((await ops.getTask(p.order.taskId)).details, /Friday/);

    // Monthly plans: first month in full.
    const plan = (await call(order.POST, "POST", "/api/order", { item: "core" })).body;
    assert.equal(plan.item.usd, 749);
    assert.equal((await call(order.GET, "GET", `/api/order?id=${plan.id}&t=wrong`)).status, 404);
  } finally {
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON; delete process.env.LND_TLS_CERT;
  }
});

test("quick job: $15 order, paid, routed to its department", async () => {
  const order = await import(new URL("api/order.js", root));
  const ops = await import(new URL("lib/ops.js", root));
  const { QUICK_JOBS, findService } = await import(new URL("data/catalog.js", root));
  for (const q of QUICK_JOBS) {
    assert.ok(findService(q.service), `${q.id} has a parent service`);
    assert.ok(q.price >= 9 && q.price <= 50 && q.deliverables.length >= 2 && q.delivery, `${q.id} is small, priced and clear`);
  }
  process.env.LND_REST_URL = `https://localhost:${lnd.address().port}`;
  process.env.LND_INVOICE_MACAROON = MACAROON;
  process.env.LND_TLS_CERT = fs.readFileSync("cert.pem").toString("base64");
  ln.resetCapacityCache();
  try {
    const o = (await call(order.POST, "POST", "/api/order", { item: "q-captions" })).body;
    assert.deepEqual(o.item, { id: "q-captions", name: "10 social media captions", usd: 15 });
    const r = await call(pay.POST, "POST", "/api/pay", { id: o.id, t: o.t });
    assert.equal(r.body.invoice.sats, Math.ceil((15 / 80000) * 1e8));
    await call(order.POST, "POST", "/api/order", { id: o.id, t: o.t, email: "cafe@example.com", task: "Captions for my cafe's new menu" });
    [...invoices.values()].at(-1).state = "SETTLED";
    assert.equal((await call(pay.GET, "GET", `/api/pay?id=${o.id}&t=${o.t}`)).body.status, "paid");
    const p = await crm.getProposal(o.id);
    const task = await ops.getTask(p.order.taskId);
    assert.equal(task.service, "social-management");
    assert.equal(task.department, "social");
    assert.equal(p.totals.dueNow, 15);
  } finally {
    delete process.env.LND_REST_URL; delete process.env.LND_INVOICE_MACAROON; delete process.env.LND_TLS_CERT;
  }
});
