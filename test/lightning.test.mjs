// Lightning: a fake LND node (HTTPS, self-signed, like a real one) and a
// mocked Lightning address. Invoices, the support page and the node dashboard.
// Run: npm test
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
      if (req.method === "GET" && req.url === "/v1/balance/blockchain") { res.end(JSON.stringify({ confirmed_balance: "12000", unconfirmed_balance: "500" })); return; }
      if (req.method === "GET" && req.url === "/v1/fees") { res.end(JSON.stringify({ channel_fees: [{ channel_point: "ab:0", base_fee_msat: "1000", fee_per_mil: "1" }], day_fee_sum: "0", week_fee_sum: "2", month_fee_sum: "7" })); return; }
      if (req.method === "POST" && req.url === "/v1/switch") { res.end(JSON.stringify({ forwarding_events: [{ amt_out: "50000", fee: "3" }, { amt_out: "20000", fee: "2" }] })); return; }
      if (req.method === "GET" && req.url === "/v1/getinfo") { res.end(JSON.stringify({ alias: "altradits", version: "0.21.3-beta commit=v0.21.3", block_height: 921000, synced_to_chain: true, synced_to_graph: true, num_active_channels: 2, num_pending_channels: 0, num_peers: 3, chains: [{ chain: "bitcoin", network: "mainnet" }] })); return; }
      if (req.method === "GET" && req.url.startsWith("/v1/newaddress")) { res.end(JSON.stringify({ address: `bcrt1qfakeaddress${++addrCount}` })); return; }
      const m = req.url.match(/^\/v1\/invoice\/([0-9a-f]+)$/);
      if (req.method === "GET" && m && invoices.has(m[1])) { res.end(JSON.stringify(invoices.get(m[1]))); return; }
      res.writeHead(404).end(JSON.stringify({ message: "not found" }));
    });
  });
  await new Promise((r) => lnd.listen(0, "127.0.0.1", r));
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
  if (u.includes("mempool.space/api/blocks/tip/height")) return new Response("921002");
  if (u.includes("api.coinbase.com")) return Response.json({ data: { amount: "80000.00" } });
  if (u.includes("/.well-known/lnurlp/")) return Response.json({ tag: "payRequest", callback: "https://wallet.test/cb", minSendable: 1000, maxSendable: 1e11, commentAllowed: 255 });
  if (u.startsWith("https://wallet.test/cb")) {
    const msats = Number(new URL(u).searchParams.get("amount"));
    return Response.json({ pr: `lnbc${(lnurlAmountOverride ?? msats) / 100}n1addressinvoice` });
  }
  return realFetch(url, opts);
};

const root = new URL("../", import.meta.url);
const ln = await import(new URL("lib/lightning.js", root));
ln.setProviderFetcher((u, o) => globalThis.fetch(u, o)); // the tests stand in for the Lightning address provider and mempool.space
const tip = await import(new URL("api/tip.js", root));
const admin = await import(new URL("api/admin.js", root));

const req = (method, url, body, auth = "Bearer secret-admin") => new Request(`https://altradits.test${url}`, {
  method, headers: { "Content-Type": "application/json", Authorization: auth, "x-forwarded-for": "203.0.113.7" }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, ...a) => { const r = await fn(req(...a)); return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() }; };
const useNode = () => Object.assign(process.env, { LND_REST_URL: `https://localhost:${lnd.address().port}`, LND_INVOICE_MACAROON: MACAROON, LND_TLS_CERT: fs.readFileSync("cert.pem", "utf8") });
const noNode = () => { for (const k of ["LND_REST_URL", "LND_INVOICE_MACAROON", "LND_TLS_CERT"]) delete process.env[k]; };

test("bolt11 amount parsing", () => {
  assert.equal(ln.bolt11Msats("lnbc10u1p4d4z5e"), 1_000_000);
  assert.equal(ln.bolt11Msats("lnbc9362500n1xyz"), 936_250_000);
  assert.equal(ln.bolt11Msats("lnbc2m1abc"), 200_000_000);
  assert.equal(ln.bolt11Msats("lnbc1pxyz"), null, "amountless invoice");
});

test("Lightning address mode: an exact-amount invoice, which can't be verified", async () => {
  noNode();
  const inv = await ln.createInvoice({ sats: 2100, memo: "x" });
  assert.equal(inv.provider, "address");
  assert.equal(ln.bolt11Msats(inv.bolt11), 2_100_000);
  assert.equal(inv.autoConfirm, false);
  lnurlAmountOverride = 1000;
  await assert.rejects(ln.createInvoice({ sats: 2100, memo: "x" }), /mismatch/);
  lnurlAmountOverride = null;
});

test("LND mode: the invoice is made on the node and settles there", async () => {
  useNode();
  const inv = await ln.createInvoice({ sats: 5000, memo: "x" });
  assert.equal(inv.provider, "lnd");
  assert.equal(inv.autoConfirm, true);
  assert.equal(await ln.invoicePaid(inv), false);
  invoices.get(inv.paymentHash).state = "SETTLED";
  assert.equal(await ln.invoicePaid(inv), true);
  noNode();
});

test("node offline: invoices fall back to the Lightning address, never when the node is required", async () => {
  Object.assign(process.env, { LND_REST_URL: "https://localhost:1", LND_INVOICE_MACAROON: MACAROON });
  assert.equal((await ln.createInvoice({ sats: 1000, memo: "x" })).provider, "address");
  await assert.rejects(ln.createInvoice({ sats: 1000, memo: "x", nodeOnly: true }));
  noNode();
});

test("LNURL encoding matches the LUD-01 test vector", async () => {
  const { encodeLnurl } = await import(new URL("lib/lnurl.js", root));
  assert.equal(encodeLnurl("https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df"),
    "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS");
});

test("support page: any amount, invoiced on our own node, and shown as paid once it settles", async () => {
  useNode();
  const r = await call(tip.POST, "POST", "/api/tip", { sats: 21000 });
  assert.equal(r.status, 200);
  assert.equal(r.body.sats, 21000);
  assert.match(r.body.qr, /^<svg/);
  assert.equal((await call(tip.GET, "GET", `/api/tip?hash=${r.body.hash}`)).body.paid, false);
  invoices.get(r.body.hash).state = "SETTLED";
  assert.equal((await call(tip.GET, "GET", `/api/tip?hash=${r.body.hash}`)).body.paid, true);
  noNode();
  // Node offline: no invoice from someone else's wallet; the page shows the public address instead.
  const off = await call(tip.POST, "POST", "/api/tip", { sats: 21000 });
  assert.equal(off.status, 503);
  assert.equal(off.body.offline, true);
  assert.equal((await call(tip.GET, "GET", "/api/tip")).body.address, ln.PAYMENTS.lightningAddress);
});

test("node dashboard: needs the admin token; shows block height against the tip, and the settlement hooks", async () => {
  assert.equal((await call(admin.GET, "GET", "/api/admin", null, "Bearer wrong")).status, 401);
  useNode();
  const d = (await call(admin.GET, "GET", "/api/admin")).body;
  assert.equal(d.node.blockHeight, 921000);
  assert.equal(d.chainTip, 921002);
  assert.equal(d.node.behind, 2);
  assert.equal(d.node.synced, true);
  assert.equal(d.node.version, "0.21.3-beta");
  assert.equal(d.settlement.mode, "LND node");
  assert.equal(d.settlement.lnurlp, "/.well-known/lnurlp/<handle>");
  // What the dashboard teaches from: the on-chain wallet, fee policy and routing.
  assert.deepEqual(d.details.onchain, { confirmed: 12000, unconfirmed: 500 });
  assert.deepEqual(d.details.fees, [{ point: "ab:0", baseMsat: 1000, ppm: 1 }]);
  assert.deepEqual(d.details.forwards, { count: 2, volumeSats: 70000, feeSats: 5 });
  assert.equal(d.details.earned.month, 7);
  assert.deepEqual(d.chainFees, { fast: 5, normal: 3, slow: 2 });
  noNode();
  assert.equal((await call(admin.GET, "GET", "/api/admin")).body.node, null, "no node set: says so");
});

test("Stan: the report says what needs Stanley first, comes from Stan, and the admin can send it on demand", async () => {
  const { stanReportText } = await import(new URL("lib/stan.js", root));
  const quiet = stanReportText({ node: { blockHeight: 921000, behind: 0, synced: true, activeChannels: 2, peers: 3 }, tip: 921000, outbound: 50_000, owed: { wallets: 2, sats: 10_000 }, security: [], emailsFailed: 0 });
  assert.equal(quiet.subject, "Stan: all quiet");
  assert.match(quiet.text, /^Nothing needs you today\./);
  const busy = stanReportText({ node: { blockHeight: 920990, behind: 10, synced: false, activeChannels: 0, peers: 0 }, tip: 921000, outbound: 1_000, owed: { wallets: 2, sats: 10_000 },
    security: [{ kind: "pin_guessing", name: "Wallet PIN guessing", severity: "high", n: 4 }], emailsFailed: 1 });
  assert.match(busy.subject, /^Stan: 5 things need you$/);
  assert.match(busy.text, /behind the chain[\s\S]*No active channel[\s\S]*top up at least 9,000 sats[\s\S]*Wallet PIN guessing[\s\S]*1 email failed/);

  assert.equal((await call(admin.POST, "POST", "/api/admin", { action: "stan_report" }, "Bearer wrong")).status, 401);
  useNode();
  const r = await call(admin.POST, "POST", "/api/admin", { action: "stan_report" });
  assert.equal(r.status, 200);
  assert.match(r.body.subject, /^Stan: /);
  const store = await import(new URL("lib/store.js", root));
  const mail = await store.getJSON(`email:${(await store.listIds("emails", 1))[0]}`);
  assert.match(mail.from, /^Stan · Altradits </);
  assert.equal(mail.kind, "owner");
  assert.equal((await call(admin.GET, "GET", "/api/admin")).body.stan.subject, r.body.subject);
  noNode();
});
