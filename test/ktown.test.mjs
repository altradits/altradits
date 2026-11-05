// kTown server (lib/ktown.js, api/ktown.js): merchants, the LNURL-pay front for
// their Tando address, exact-amount invoices, receipts and name verification.
// Tando is mocked here, never called for real: the mock mirrors the live API
// (payRequest with LUD-21 KES terms, KES/msat invoices, /api/payment receipts).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ktown-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV", "KTOWN", "KTOWN_MAX_MERCHANTS", "KTOWN_HELP", "ADMIN_TOKEN"]) delete process.env[k];
// Room for every sign-up below; the cap test pins the pilot size itself.
Object.assign(process.env, { KTOWN: "on", SITE_URL: "https://altradits.test", KTOWN_MAX_MERCHANTS: "1000", ADMIN_TOKEN: "ktown-test-admin-token" });

const kt = await import("../lib/ktown.js");
const api = await import("../api/ktown.js");
const adminApi = await import("../api/admin.js");
const store = await import("../lib/store.js");

// --- a BOLT11-shaped invoice with an exact amount and payment hash (signature unchecked)
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
const invoice = (msats, hashHex = crypto.randomBytes(32).toString("hex")) => {
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hashHex), ...Array(104).fill(0)];
  return { pr: `lnbc${msats / 100}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq", hash: hashHex };
};

// --- mocked Tando -----------------------------------------------------------
const MULT = 10000; // msat per KES
const tando = {
  mode: "ok", // ok | invoice_error | wrong_converted | wrong_msats | off_host | no_kes | redirect | html
  receipts: new Map(), // hash -> transaction (or "missing")
  receiptCalls: 0, // GETs to /api/payment/ (unknown hashes must never cause one)
  freezeInvoice: false, // answer every invoice call with the last invoice (dedup test)
};
let lastInvoice = null;
const TANDO_META = (phone) => JSON.stringify([["text/plain", `Payment to Kenyan phone ${phone}@bitcoin.co.ke`], ["text/identifier", `${phone}@bitcoin.co.ke`]]);
const tandoPay = (phone) => ({ tag: "payRequest", callback: `https://bitcoin.co.ke/.well-known/lnurlp/${phone}`,
  minSendable: 150000, maxSendable: 500000000, metadata: TANDO_META(phone),
  currency: { code: "KES", name: "Kenyan Shillings", symbol: "KSh", decimals: 0, minSendable: 15, maxSendable: 50000, multiplier: MULT } });
const J = (obj, status = 200, type = "application/json") =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": type } });
const mockTando = async (raw) => {
  const u = new URL(String(raw));
  assert.equal(u.hostname, "bitcoin.co.ke", "kTown only ever calls Tando");
  assert.equal(u.protocol, "https:", "kTown only ever calls over https");
  const pay = u.pathname.match(/^\/\.well-known\/lnurlp\/(\d+)$/);
  if (pay) {
    if (tando.mode === "redirect") return new Response("", { status: 302, headers: { Location: "https://bitcoin.co.ke/x" } });
    if (tando.mode === "html") return new Response("<h1>no</h1>", { status: 200, headers: { "Content-Type": "text/html" } });
    if (!/^254(7\d{8}|11\d{6}|14\d{6})$/.test(pay[1])) return J({ status: "ERROR", reason: "Not a phone number." }, 404);
    if (tando.mode === "no_kes") { const p = tandoPay(pay[1]); delete p.currency; return J(p); }
    if (tando.mode === "off_host") { const p = tandoPay(pay[1]); p.callback = "https://evil.test/cb"; return J(p); }
    const amount = u.searchParams.get("amount"), currency = u.searchParams.get("currency");
    if (amount === null) return J(tandoPay(pay[1]));
    if (tando.mode === "invoice_error") return J({ status: "ERROR", reason: "Till closed." });
    if (tando.freezeInvoice && lastInvoice) return J(lastInvoice);
    const hash = crypto.randomBytes(32).toString("hex");
    if (currency === "KES") {
      const kes = Number(amount);
      const msats = Math.ceil((kes * MULT * 1.01) / 1000) * 1000; // KES value plus the 1%, whole sats
      const { pr } = invoice(tando.mode === "wrong_msats" ? msats + 50000 : msats, hash);
      lastInvoice = { pr, routes: [], converted: tando.mode === "wrong_converted" ? kes + 1 : kes,
        successAction: { tag: "url", description: "View your M-Pesa receipt", url: `https://bitcoin.co.ke/receipt/${hash}` } };
      return J(lastInvoice);
    }
    const { pr } = invoice(tando.mode === "wrong_msats" ? Number(amount) + 1000 : Number(amount), hash);
    lastInvoice = { pr, routes: [],
      successAction: { tag: "url", description: "View your M-Pesa receipt", url: `https://bitcoin.co.ke/receipt/${hash}` } };
    return J(lastInvoice);
  }
  const rc = u.pathname.match(/^\/api\/payment\/([0-9a-f]{64})$/i);
  if (rc) {
    tando.receiptCalls++;
    const tx = tando.receipts.get(rc[1].toLowerCase());
    if (tx === undefined || tx === "missing") return J({ success: false, error: { errorCode: "transaction-not-found", message: "Transaction not found" } }, 404);
    return J({ success: true, transaction: tx });
  }
  return J({ status: "ERROR", reason: "Unknown." }, 404);
};
kt.setKtownFetcher(mockTando);
kt.setKtownRatesFetcher(async () => J({ result: "success", rates: { KES: 1, USD: 0.0077, EUR: 0.0066, UGX: 28.5, TZS: 19.3 } }));
const receiptTx = (over = {}) => ({ status: "completed", isPaid: true, paymentNetworkReceipt: "TIA7QK4M2P",
  payToAccount: "254712345678", merchantName: "JANE W MWANGI", currencyAmount: 100, currencyAmountSent: 100,
  baseCurrency: "KES", satsAmount: 990, tandoFees: 9.9, totalSatsAmount: 999.9, paymentHash: "x".repeat(64),
  dateTime: new Date().toISOString(), completedAt: new Date().toISOString(), ...over });

// --- API calls (a fresh network address each time, unless a limit is the test)
let n = 0;
const call = (method, p, body, { ip = null, token = null } = {}) => api[method](new Request(`https://altradits.test/api/ktown/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip || `9.9.${Math.floor(n / 250)}.${(n++ % 250) + 1}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}));
const get = async (p, opts) => { const r = await call("GET", p, null, opts); return { status: r.status, body: await r.json(), headers: r.headers }; };
const post = async (p, body, opts) => { const r = await call("POST", p, body, opts); return { status: r.status, body: await r.json() }; };

test("health names the switch; everything refuses while KTOWN is off", async () => {
  assert.deepEqual((await get("health")).body, { ok: true, on: true, full: false });
  delete process.env.KTOWN;
  try {
    assert.deepEqual((await get("health")).body, { ok: true, on: false, full: false });
    assert.equal((await post("register", { agree: true, phone: "0712345678", shop: "S", mpesaName: "M", pin: "715293" })).status, 501);
    assert.equal((await post("login", { phone: "0712345678", pin: "715293" })).status, 501);
    assert.equal((await get("me", { token: "x".repeat(32) })).status, 501);
    assert.equal((await get("rates")).status, 501);
    assert.equal((await get("receipt/" + "ab".repeat(32))).status, 501);
    assert.equal((await get("help")).body.success, true, "the help contact answers even while off");
    const ln = await get("lnurlp/aaaaaaaaaaaa");
    assert.equal(ln.body.status, "ERROR");
    assert.match(ln.body.reason, /isn't open yet/);
  } finally {
    process.env.KTOWN = "on";
  }
});

test("phone numbers: local, plus and full forms become 254 plus 9 Safaricom digits", () => {
  for (const [in_, want] of [["0712345678", "254712345678"], ["+254712345678", "254712345678"], ["254712345678", "254712345678"],
    ["254111234567", "254111234567"], ["254141234567", "254141234567"], [" 0712 345 678 ", "254712345678"]])
    assert.equal(kt.normalizePhone(in_), want, in_);
  for (const bad of ["", "0712", "2547123456789", "254812345678", "25410123456", "25471234567a", "+2547123456789", "123456789"])
    assert.throws(() => kt.normalizePhone(bad), /M-Pesa number/, bad);
});

let ada, adaId;
test("register: activation proves the number's Tando address works; then login, me, settings", async () => {
  const bad = await post("register", { agree: true, phone: "0712345678", shop: "", mpesaName: "JANE W MWANGI", pin: "715293" });
  assert.equal(bad.status, 400);
  for (const pin of ["123456", "111111", "121212", "123", "abcdef"])
    assert.equal((await post("register", { agree: true, phone: "0712345679", shop: "S", mpesaName: "M", pin })).status, 400, pin);
  tando.mode = "no_kes"; // a number that answers without KES terms (claimed for a BTC wallet)
  try {
    const r = await post("register", { agree: true, phone: "0712345678", shop: "Ada Shop", mpesaName: "JANE W MWANGI", pin: "715293" });
    assert.equal(r.status, 502, JSON.stringify(r.body));
    assert.match(r.body.error, /M-Pesa delivery/);
  } finally {
    tando.mode = "ok"; kt.clearQuoteCache();
  }
  const r = await post("register", { agree: true, phone: "0712345678", shop: "Ada Shop", mpesaName: "JANE W MWANGI", pin: "715293" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.success, true);
  assert.equal(r.body.merchant.shop, "Ada Shop");
  assert.equal(r.body.merchant.verified, false, "typed names wait for the first receipt");
  assert.equal(r.body.merchant.claimed, false, "the number is not proven yet");
  assert.equal(r.body.merchant.currency, "KES");
  assert.match(r.body.merchant.payUrl, /^https:\/\/altradits\.test\/k\/[A-Za-z0-9_-]{12}$/);
  assert.match(r.body.merchant.lnurl, /^LNURL1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]+$/);
  assert.ok(r.body.session.length >= 32);
  ada = r.body;
  adaId = ada.merchant.id;
  // The number is taken now; the secret parts are stored hashed.
  assert.equal((await post("register", { agree: true, phone: "254712345678", shop: "Other", mpesaName: "X", pin: "482916" })).status, 409);
  const raw = fs.readFileSync(path.join(".data", "db.json"), "utf8");
  assert.doesNotMatch(raw, /715293/);
  assert.doesNotMatch(raw, new RegExp(ada.session));
  // Login with the wrong PIN fails like an unknown number; the right one opens.
  assert.equal((await post("login", { phone: "0712345678", pin: "000000" })).status, 403);
  assert.equal((await post("login", { phone: "0799999999", pin: "000000" })).status, 403);
  const login = await post("login", { phone: "+254712345678", pin: "715293" });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.merchant.id, adaId);
  // Signed-in reads and settings.
  assert.equal((await get("me")).status, 401);
  assert.equal((await get("me", { token: ada.session })).body.merchant.shop, "Ada Shop");
  const set = await post("settings", { shop: "Ada Duka", currency: "usd", lang: "sw" }, { token: ada.session });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.merchant.shop, "Ada Duka");
  assert.equal(set.body.merchant.currency, "USD");
  assert.equal(set.body.merchant.lang, "sw");
  assert.equal((await post("settings", { currency: "GBP" }, { token: ada.session })).status, 400);
  assert.equal((await post("settings", { lang: "fr" }, { token: ada.session })).status, 400);
  // A new PIN on the signed-in phone; the old one stops working.
  assert.equal((await post("pin", { pin: "123456" }, { token: ada.session })).status, 400);
  assert.equal((await post("pin", { pin: "482916" }, { token: ada.session })).status, 200);
  assert.equal((await post("login", { phone: "0712345678", pin: "715293" })).status, 403);
  assert.equal((await post("login", { phone: "0712345678", pin: "482916" })).status, 200);
});

test("five wrong PINs lock logins for 15 minutes", async () => {
  const r = await post("register", { agree: true, phone: "0722000001", shop: "Lock Shop", mpesaName: "LOCK TEST", pin: "604391" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (let i = 0; i < 4; i++)
    assert.equal((await post("login", { phone: "0722000001", pin: "000000" }, { ip: "8.8.8.8" })).status, 403, `try ${i}`);
  const locked = await post("login", { phone: "0722000001", pin: "000000" }, { ip: "8.8.8.8" });
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /15 minutes/);
  assert.equal((await post("login", { phone: "0722000001", pin: "604391" }, { ip: "8.8.8.9" })).status, 429, "the right PIN waits too");
});

test("a merchant can only read and change their own settings and history", async () => {
  const b = await post("register", { agree: true, phone: "0733000002", shop: "B Shop", mpesaName: "B NAME", pin: "284731" });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const changed = await post("settings", { shop: "B Shop New" }, { token: b.body.session });
  assert.equal(changed.body.merchant.shop, "B Shop New");
  assert.equal((await get("me", { token: ada.session })).body.merchant.shop, "Ada Duka", "Ada's shop is untouched");
  assert.deepEqual((await get("history", { token: ada.session })).body.entries, [], "no entries yet");
  assert.equal((await get("history")).status, 401);
});

test("LNURL payRequest: the merchant's names, Tando's limits and rate", async () => {
  const r = await get(`lnurlp/${adaId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const b = r.body;
  assert.equal(b.tag, "payRequest");
  assert.equal(b.callback, `https://altradits.test/api/ktown/lnurlp/${adaId}/cb`);
  assert.equal(b.minSendable, 150000);
  assert.equal(b.maxSendable, 500000000);
  assert.equal(b.commentAllowed, 0);
  assert.deepEqual(b.currency, { code: "KES", minSendable: 15, maxSendable: 50000, multiplier: MULT });
  assert.equal(b.verified, false, "the pay page reads the verified mark from here");
  const meta = JSON.parse(b.metadata);
  assert.equal(meta.find((m) => m[0] === "text/plain")[1], "JANE W MWANGI\nAda Duka", "M-Pesa name, newline, shop name");
  assert.ok(meta.find((m) => m[0] === "text/plain")[1].includes("JANE W MWANGI"), "the M-Pesa name, exactly as typed");
  assert.ok(meta.find((m) => m[0] === "text/plain")[1].includes("Ada Duka"), "and the shop name");
  assert.equal(meta.find((m) => m[0] === "text/identifier")[1], `k-${adaId}@altradits.test`);
  const unknown = await get("lnurlp/zzzzzzzzzzzz");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.status, "ERROR");
  const bad = await get("lnurlp/!!");
  assert.equal(bad.status, 404);
});

test("callback in KES mode: Tando's invoice unchanged, merchant receives exactly the KES", async () => {
  const r = await get(`lnurlp/${adaId}/cb?amount=100&currency=KES`, { ip: "203.0.113.9" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.pr.startsWith("lnbc"), "a BOLT11 invoice");
  assert.deepEqual(r.body.routes, []);
  assert.match(r.body.successAction.url, /^https:\/\/bitcoin\.co\.ke\/receipt\/[0-9a-f]{64}$/);
  // The record: the merchant's own facts only, nothing about who paid.
  const hist = (await get("history", { token: ada.session })).body.entries;
  assert.equal(hist.length, 1);
  assert.equal(hist[0].status, "pending");
  assert.equal(hist[0].kesExpected, 100);
  assert.equal(hist[0].kesReceived, null);
  assert.ok(hist[0].sats > 1000 && hist[0].sats < 1100, `${hist[0].sats} sats for KES 100 plus 1%`);
  const ids = await store.listIds(`kt:tx:${adaId}`, 10);
  const entry = await store.getJSON(`kte:${ids[0]}`);
  assert.deepEqual(Object.keys(entry).sort(), ["at", "confirmedAt", "hash", "id", "kesExpected", "kesReceived",
    "merchantId", "merchantName", "mpesaCode", "msats", "sats", "status"]);
  assert.ok(!fs.readFileSync(path.join(".data", "db.json"), "utf8").includes("203.0.113.9"), "no network address is stored");
  assert.equal((await get(`lnurlp/${adaId}/cb?amount=5&currency=KES`)).body.reason, "Send between 15 and 50,000 KES.");
  assert.equal((await get(`lnurlp/${adaId}/cb?amount=60000&currency=KES`)).status, 200);
  assert.match((await get(`lnurlp/${adaId}/cb?amount=60000&currency=KES`)).body.reason, /50,000 KES/);
  assert.equal((await get(`lnurlp/${adaId}/cb?amount=100&currency=USD`)).body.reason, "Only KES amounts.");
});

test("callback in msat mode: the invoice must match the millisats exactly", async () => {
  const r = await get(`lnurlp/${adaId}/cb?amount=500000`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const { bolt11Msats } = await import("../lib/lightning.js");
  assert.equal(bolt11Msats(r.body.pr), 500000);
  const hist = (await get("history", { token: ada.session })).body.entries;
  assert.equal(hist[0].kesExpected, Math.floor((500000 / MULT) * 0.99), "KES value of the sats minus the 1%");
  tando.mode = "wrong_msats";
  try {
    const bad = await get(`lnurlp/${adaId}/cb?amount=500000`);
    assert.equal(bad.body.status, "ERROR");
    assert.match(bad.body.reason, /different amount/);
    assert.equal((await get("history", { token: ada.session })).body.entries.length, 2, "no record for a refused invoice");
  } finally {
    tando.mode = "ok"; kt.clearQuoteCache();
  }
});

test("callback in KES mode refuses a wrong converted figure or sats outside the band", async () => {
  tando.mode = "wrong_converted";
  try {
    const bad = await get(`lnurlp/${adaId}/cb?amount=100&currency=KES`);
    assert.equal(bad.body.status, "ERROR");
    assert.match(bad.body.reason, /different amount/);
  } finally {
    tando.mode = "ok"; kt.clearQuoteCache();
  }
  tando.mode = "wrong_msats";
  try {
    const bad = await get(`lnurlp/${adaId}/cb?amount=100&currency=KES`);
    assert.equal(bad.body.status, "ERROR");
    assert.match(bad.body.reason, /different amount/);
  } finally {
    tando.mode = "ok"; kt.clearQuoteCache();
  }
  tando.mode = "invoice_error";
  try {
    const down = await get(`lnurlp/${adaId}/cb?amount=100&currency=KES`);
    assert.equal(down.body.status, "ERROR");
    assert.equal(down.body.reason, "Till closed.");
  } finally {
    tando.mode = "ok"; kt.clearQuoteCache();
  }
});

test("receipt: a completed payment lands in history and verifies the typed M-Pesa name", async () => {
  const inv = await get(`lnurlp/${adaId}/cb?amount=100&currency=KES`);
  const hash = inv.body.successAction.url.split("/").pop();
  tando.receipts.set(hash, receiptTx({ payToAccount: "254712345678", merchantName: "JANE W MWANGI", currencyAmountSent: 100 }));
  const rc = await get(`receipt/${hash}`);
  assert.equal(rc.status, 200, JSON.stringify(rc.body));
  assert.deepEqual(rc.body, { success: true, status: "completed", paid: true, kes: 100,
    mpesaCode: "TIA7QK4M2P", merchantName: "JANE W MWANGI" });
  const hist = (await get("history", { token: ada.session })).body.entries;
  const done = hist.find((e) => e.mpesaCode === "TIA7QK4M2P");
  assert.equal(done.status, "completed");
  assert.equal(done.kesReceived, 100);
  assert.ok(done.confirmedAt);
  assert.equal((await get("me", { token: ada.session })).body.merchant.verified, true, "Tando's registered name matches the typed one");
  assert.equal((await get("me", { token: ada.session })).body.merchant.claimed, true, "the first matched receipt proves the number");
  assert.equal((await get(`lnurlp/${adaId}`)).body.verified, true, "wallets ignore the extra field, the pay page reads it");
  // A second confirmation changes nothing (one record per payment hash).
  await get(`receipt/${hash}`);
  assert.equal((await get("history", { token: ada.session })).body.entries.filter((e) => e.mpesaCode === "TIA7QK4M2P").length, 1);
  // Renaming the shop name keeps the verified mark; renaming the M-Pesa name drops it.
  await post("settings", { shop: "Ada Duka New" }, { token: ada.session });
  assert.equal((await get("me", { token: ada.session })).body.merchant.verified, true);
  await post("settings", { mpesaName: "JANE MWANGI" }, { token: ada.session });
  assert.equal((await get("me", { token: ada.session })).body.merchant.verified, false);
  assert.equal((await get("me", { token: ada.session })).body.merchant.claimed, true, "a rename unchecks the name, never the proven number");
  await post("settings", { mpesaName: "JANE W MWANGI" }, { token: ada.session });
});

test("receipt: a name that does not match stays unverified, and a failed payout shows as failed", async () => {
  const c = await post("register", { agree: true, phone: "0744000003", shop: "C Shop", mpesaName: "WRONG NAME", pin: "390517" });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const inv = await get(`lnurlp/${c.body.merchant.id}/cb?amount=50&currency=KES`);
  const hash = inv.body.successAction.url.split("/").pop();
  tando.receipts.set(hash, receiptTx({ payToAccount: "254744000003", merchantName: "RIGHT NAME", currencyAmountSent: 50 }));
  const rc = await get(`receipt/${hash}`);
  assert.equal(rc.body.paid, true);
  assert.equal(rc.body.merchantName, null, "the true registered name is not revealed to a wrong guess");
  assert.equal((await get("me", { token: c.body.session })).body.merchant.verified, false, "WRONG NAME is not what M-Pesa shows");
  const inv2 = await get(`lnurlp/${c.body.merchant.id}/cb?amount=60&currency=KES`);
  const hash2 = inv2.body.successAction.url.split("/").pop();
  tando.receipts.set(hash2, receiptTx({ status: "failed", isPaid: false, paymentNetworkReceipt: null,
    payToAccount: "254744000003", merchantName: "RIGHT NAME", currencyAmountSent: null, failureReason: "declined" }));
  const rc2 = await get(`receipt/${hash2}`);
  assert.equal(rc2.body.paid, false);
  assert.equal(rc2.body.status, "failed");
  const hist = (await get("history", { token: c.body.session })).body.entries;
  assert.equal(hist.find((e) => e.kesExpected === 60).status, "failed");
  assert.equal(hist.find((e) => e.kesExpected === 50).merchantName, null, "history keeps no name the merchant did not already type");
});

test("receipt: only hashes kTown recorded are answered, and Tando is never asked otherwise", async () => {
  const before = tando.receiptCalls;
  const missing = await get(`receipt/${"00".repeat(32)}`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "That payment isn't known.");
  assert.equal((await get("receipt/notahash")).status, 404);
  assert.equal(tando.receiptCalls, before, "no lookup of anyone else's payment happens");
});

test("receipt: a receipt for another number moves nothing and names no name", async () => {
  const inv = await get(`lnurlp/${adaId}/cb?amount=70&currency=KES`);
  const hash = inv.body.successAction.url.split("/").pop();
  tando.receipts.set(hash, receiptTx({ payToAccount: "254799999999", merchantName: "SOMEONE ELSE", currencyAmountSent: 70 }));
  const rc = await get(`receipt/${hash}`);
  assert.equal(rc.body.paid, true, "our own payment's status is answered");
  assert.equal(rc.body.merchantName, null, "a name that is not the merchant's is not returned");
  const hist = (await get("history", { token: ada.session })).body.entries;
  assert.equal(hist.find((e) => e.kesExpected === 70).status, "pending", "but our record does not move");
});

test("Tando's odd answers fail closed: off-host callback, redirect, HTML, no KES terms", async () => {
  for (const mode of ["off_host", "redirect", "html"]) {
    tando.mode = mode;
    try {
      const r = await get(`lnurlp/${adaId}/cb?amount=100&currency=KES`);
      assert.equal(r.body.status, "ERROR", mode);
      assert.match(r.body.reason, /reachable/, mode);
    } finally {
      tando.mode = "ok"; kt.clearQuoteCache();
    }
  }
  tando.mode = "no_kes";
  try {
    const r = await get(`lnurlp/${adaId}`);
    assert.equal(r.body.status, "ERROR");
    assert.match(r.body.reason, /M-Pesa delivery/);
  } finally {
    tando.mode = "ok"; kt.clearQuoteCache();
  }
});

test("SSRF: the default Tando path refuses private addresses before connecting", async () => {
  // The real publicFetch, no mock, in a child with no proxy in its
  // environment: Node snapshots proxy settings at startup, so only a fresh
  // process proves the guarded lookup runs on the default path.
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
  fs.writeFileSync("ssrf-child.mjs", `const netsafe = await import(${JSON.stringify(path.join(root, "lib", "netsafe.js"))});
const kt = await import(${JSON.stringify(path.join(root, "lib", "ktown.js"))});
let lookups = 0;
netsafe.setDnsLookup((host, opts, cb) => { lookups++; cb(null, [{ address: "10.9.9.9", family: 4 }]); });
try {
  await kt.tandoQuote("254712345678", { fresh: true });
  console.log("RESOLVED (bad) lookups=" + lookups);
  process.exit(1);
} catch (e) {
  console.log("error=" + e.message + " lookups=" + lookups);
  process.exit(/isn't reachable/.test(e.message) && lookups === 1 ? 0 : 2);
}`);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/proxy/i.test(k)) delete env[k];
  for (const k of ["JOBS_ALLOW_LOCAL", "PASSENGER_APP_ENV", "NODE_ENV"] ) delete env[k];
  const { execFileSync } = await import("node:child_process");
  let out;
  try {
    out = execFileSync(process.execPath, ["ssrf-child.mjs"], { env, timeout: 30000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    assert.fail(`the guarded Tando path did not refuse a private address: ${(e.stdout || "") + (e.stderr || "")}`.slice(0, 500));
  }
  assert.match(out, /lookups=1/, "refused on the one resolution, before connecting");
});

test("lock signs one phone out; a stranger's token signs nothing out", async () => {
  const login = await post("login", { phone: "0712345678", pin: "482916" });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal((await post("lock", {}, { token: login.body.session })).status, 200);
  assert.equal((await get("me", { token: login.body.session })).status, 401, "the token stopped working");
  assert.equal((await get("me", { token: ada.session })).status, 200, "other phones stay signed in");
  assert.equal((await post("lock", {}, { token: "z".repeat(32) })).status, 401);
});

test("a repeated invoice reuses its first record; history carries the payment hash", async () => {
  const before = (await get("history", { token: ada.session })).body.entries.length;
  const first = await get(`lnurlp/${adaId}/cb?amount=80&currency=KES`);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  tando.freezeInvoice = true;
  try {
    const again = await get(`lnurlp/${adaId}/cb?amount=80&currency=KES`);
    assert.equal(again.body.pr, first.body.pr, "Tando answered the same invoice twice");
  } finally {
    tando.freezeInvoice = false;
  }
  const hist = (await get("history", { token: ada.session })).body.entries;
  assert.equal(hist.length, before + 1, "one record for the one payment hash");
  assert.match(hist[0].hash, /^[0-9a-f]{64}$/);
  assert.equal(hist[0].hash, first.body.successAction.url.split("/").pop());
});

test("two sign-ups racing for one number: one wins, the other hears it is taken", async () => {
  const [a, b] = await Promise.all([
    post("register", { agree: true, phone: "0766000011", shop: "Race A", mpesaName: "RACE", pin: "715293" }, { ip: "7.7.7.1" }),
    post("register", { agree: true, phone: "0766000011", shop: "Race B", mpesaName: "RACE", pin: "715293" }, { ip: "7.7.7.2" }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = a.status === 200 ? a.body : b.body;
  assert.equal((await get("me", { token: winner.session })).status, 200);
});

test("takeover: a stale unclaimed number with no paid receipt goes to the new sign-up", async () => {
  // A squatter registers someone else's number.
  const sq = await post("register", { agree: true, phone: "0777000077", shop: "Squat Shop", mpesaName: "SQUATTER", pin: "715293" });
  assert.equal(sq.status, 200, JSON.stringify(sq.body));
  const squat = sq.body;
  assert.equal(squat.merchant.claimed, false);
  // A payment started on the old QR is still in flight.
  const sqInv = await get(`lnurlp/${squat.merchant.id}/cb?amount=90&currency=KES`);
  const sqHash = sqInv.body.successAction.url.split("/").pop();
  // A fresh registration holds: the owner hears it is taken.
  assert.equal((await post("register", { agree: true, phone: "0777000077", shop: "Real Duka", mpesaName: "REAL OWNER", pin: "482916" })).status, 409);
  // 48 hours pass with no paid receipt. The owner signs up again and takes it over.
  const rec = await store.getJSON(`kt:${squat.merchant.id}`);
  rec.createdAt = new Date(Date.now() - 3 * 864e5).toISOString();
  await store.setJSON(`kt:${squat.merchant.id}`, rec);
  const own = await post("register", { agree: true, phone: "0777000077", shop: "Real Duka", mpesaName: "REAL OWNER", pin: "482916" });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.notEqual(own.body.merchant.id, squat.merchant.id);
  assert.equal((await get("me", { token: squat.session })).status, 401, "the old sessions ended");
  assert.equal((await get(`lnurlp/${squat.merchant.id}`)).status, 404, "the old QR is dead");
  assert.equal(await store.getJSON(`kt:${squat.merchant.id}`), null, "the old record is gone");
  assert.equal((await store.listIds(`kt:tx:${squat.merchant.id}`, 10)).length, 1, "but its payment record is kept, not deleted");
  // The in-flight payment still reports its status, but names no name.
  tando.receipts.set(sqHash, receiptTx({ payToAccount: "254777000077", merchantName: "REAL OWNER", currencyAmountSent: 90 }));
  const late = await get(`receipt/${sqHash}`);
  assert.equal(late.body.paid, true);
  assert.equal(late.body.merchantName, null, "no merchant stands behind this record any more");
  // The new owner claims the number with a first real payment.
  const inv = await get(`lnurlp/${own.body.merchant.id}/cb?amount=100&currency=KES`);
  const hash = inv.body.successAction.url.split("/").pop();
  tando.receipts.set(hash, receiptTx({ payToAccount: "254777000077", merchantName: "REAL OWNER", currencyAmountSent: 100 }));
  await get(`receipt/${hash}`);
  assert.equal((await get("me", { token: own.body.session })).body.merchant.claimed, true);
});

test("takeover: a claimed number, or one with a paid receipt, cannot be taken", async () => {
  // Claimed: a matched receipt proves it, however old it gets.
  const a = await post("register", { agree: true, phone: "0788000088", shop: "A Shop", mpesaName: "ALICE A", pin: "715293" });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const inv = await get(`lnurlp/${a.body.merchant.id}/cb?amount=100&currency=KES`);
  const hash = inv.body.successAction.url.split("/").pop();
  tando.receipts.set(hash, receiptTx({ payToAccount: "254788000088", merchantName: "ALICE A", currencyAmountSent: 100 }));
  await get(`receipt/${hash}`);
  const recA = await store.getJSON(`kt:${a.body.merchant.id}`);
  recA.createdAt = new Date(Date.now() - 30 * 864e5).toISOString();
  await store.setJSON(`kt:${a.body.merchant.id}`, recA);
  assert.equal((await post("register", { agree: true, phone: "0788000088", shop: "Intruder", mpesaName: "X", pin: "482916" })).status, 409);
  // Unclaimed but paid (the name never matched): a working till is not disturbed.
  const b = await post("register", { agree: true, phone: "0799000099", shop: "B Shop", mpesaName: "WRONG B", pin: "715293" });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const invB = await get(`lnurlp/${b.body.merchant.id}/cb?amount=100&currency=KES`);
  const hashB = invB.body.successAction.url.split("/").pop();
  tando.receipts.set(hashB, receiptTx({ payToAccount: "254799000099", merchantName: "RIGHT B", currencyAmountSent: 100 }));
  await get(`receipt/${hashB}`);
  const recB = await store.getJSON(`kt:${b.body.merchant.id}`);
  recB.createdAt = new Date(Date.now() - 30 * 864e5).toISOString();
  await store.setJSON(`kt:${b.body.merchant.id}`, recB);
  assert.equal((await post("register", { agree: true, phone: "0799000099", shop: "Intruder", mpesaName: "X", pin: "482916" })).status, 409);
});

test("rates: KES into display currencies, cached an hour, stale when the feed fails", async () => {
  let calls = 0;
  kt.setKtownRatesFetcher(async () => { calls++; return J({ result: "success", rates: { USD: 0.0077, EUR: 0.0066, UGX: 28.5, TZS: 19.3 } }); });
  kt.clearRatesCache();
  const r = await get("rates");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.rates, { KES: 1, USD: 0.0077, EUR: 0.0066, UGX: 28.5, TZS: 19.3 });
  assert.equal(r.body.base, "KES");
  assert.equal(r.body.stale, false);
  assert.ok(Date.parse(r.body.at) <= Date.now());
  await get("rates");
  assert.equal(calls, 1, "asked once, then cached");
  kt.setKtownRatesFetcher(async () => { calls++; throw new Error("feed down"); });
  const stale = await kt.fiatRates(Date.now() + 2 * 3600e3);
  assert.equal(stale.stale, true, "the last good answer still serves");
  assert.deepEqual(stale.rates, { KES: 1, USD: 0.0077, EUR: 0.0066, UGX: 28.5, TZS: 19.3 });
  kt.clearRatesCache();
  assert.equal((await get("rates")).status, 502, "nothing cached and the feed down: an honest error");
  kt.setKtownRatesFetcher(async () => J({ result: "success", rates: { KES: 1, USD: 0.0077, EUR: 0.0066, UGX: 28.5, TZS: 19.3 } }));
  kt.clearRatesCache();
});

test("rate limits: registration and LNURL per network and per merchant", async () => {
  for (let i = 0; i < 10; i++) {
    const r = await post("register", { agree: true, phone: `07550000${10 + i}`, shop: `S${i}`, mpesaName: "N", pin: "715293" }, { ip: "6.6.6.6" });
    assert.equal(r.status, 200, `signup ${i}: ${JSON.stringify(r.body)}`);
  }
  const capped = await post("register", { agree: true, phone: "0755000099", shop: "SX", mpesaName: "N", pin: "715293" }, { ip: "6.6.6.6" });
  assert.equal(capped.status, 429);
  for (let i = 0; i < 60; i++) {
    const r = await get(`lnurlp/${adaId}`, { ip: "6.6.6.7" });
    assert.equal(r.status, 200, `lnurl ${i}`);
  }
  const cappedLn = await get(`lnurlp/${adaId}`, { ip: "6.6.6.7" });
  assert.equal(cappedLn.status, 200);
  assert.match(cappedLn.body.reason, /Too many requests/);
});

// --- pre-launch: terms, help, cap, blocklist --------------------------------

const ADMIN = "ktown-test-admin-token";
const apost = async (body, token = ADMIN) => {
  const r = await adminApi.POST(new Request("https://altradits.test/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));
  return { status: r.status, body: await r.json() };
};

test("terms: registration needs a ticked 'I agree', stored with version and time", async () => {
  for (const agree of [undefined, false, "yes", 1]) {
    const r = await post("register", { agree, phone: "0711000101", shop: "T Shop", mpesaName: "T NAME", pin: "715293" });
    assert.equal(r.status, 400, `agree=${agree}`);
    assert.match(r.body.error, /I agree/);
  }
  const r = await post("register", { agree: true, phone: "0711000101", shop: "T Shop", mpesaName: "T NAME", pin: "715293" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = await store.getJSON(`kt:${r.body.merchant.id}`);
  assert.deepEqual(Object.keys(m.agreedTerms).sort(), ["at", "version"]);
  assert.equal(m.agreedTerms.version, kt.KTOWN_TERMS_VERSION);
  assert.ok(Date.parse(m.agreedTerms.at) <= Date.now());
});

test("help: KTOWN_HELP is answered as plain text, null when unset", async () => {
  delete process.env.KTOWN_HELP;
  assert.deepEqual((await get("help")).body, { success: true, help: null });
  process.env.KTOWN_HELP = "  help@example.com  ";
  assert.equal((await get("help")).body.help, "help@example.com");
  process.env.KTOWN_HELP = "+254700111222";
  assert.equal((await get("help")).body.help, "+254700111222");
  delete process.env.KTOWN_HELP;
});

test("pilot cap: past KTOWN_MAX_MERCHANTS registration is refused, health names full", async () => {
  const base = await kt.merchantCount();
  assert.deepEqual(Object.keys((await get("health")).body).sort(), ["full", "ok", "on"], "health names only on/off and full");
  process.env.KTOWN_MAX_MERCHANTS = String(base + 1);
  try {
    const a = await post("register", { agree: true, phone: "0711000202", shop: "Cap A", mpesaName: "CAP A", pin: "715293" });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal((await get("health")).body.full, true);
    const b = await post("register", { agree: true, phone: "0711000303", shop: "Cap B", mpesaName: "CAP B", pin: "482916" });
    assert.equal(b.status, 503);
    assert.equal(b.body.error, "kTown is full for now.");
    // A takeover replaces its record, so a full pilot still lets it through.
    const rec = await store.getJSON(`kt:${a.body.merchant.id}`);
    rec.createdAt = new Date(Date.now() - 3 * 864e5).toISOString();
    await store.setJSON(`kt:${a.body.merchant.id}`, rec);
    const own = await post("register", { agree: true, phone: "0711000202", shop: "Cap Owner", mpesaName: "CAP OWNER", pin: "604391" });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(await kt.merchantCount(), base + 1, "the takeover replaced, not added");
    assert.equal((await store.listIds("ktowns", 2000)).length, base + 1, "the merchant list holds live records only");
  } finally {
    process.env.KTOWN_MAX_MERCHANTS = "1000";
  }
  assert.equal((await get("health")).body.full, false);
  for (const bad of ["", "abc", "0", "-5"]) {
    process.env.KTOWN_MAX_MERCHANTS = bad;
    assert.equal(kt.maxMerchants(), 10, `KTOWN_MAX_MERCHANTS=${bad || "(unset)"} falls back to 10`);
  }
  process.env.KTOWN_MAX_MERCHANTS = "1000";
});

test("squatter blocklist: a blocked number cannot register; unblock lifts it", async () => {
  assert.equal((await apost({ action: "ktown_block", phone: "0711000404" }, "wrong-token")).status, 401);
  assert.equal((await apost({ action: "ktown_block", phone: "0711000404" }, null)).status, 401);
  const blocked = await apost({ action: "ktown_block", phone: "0711000404" });
  assert.equal(blocked.status, 200, JSON.stringify(blocked.body));
  assert.deepEqual(blocked.body, { ok: true, phone: "254711000404" });
  const r = await post("register", { agree: true, phone: "0711000404", shop: "Sq", mpesaName: "SQ", pin: "715293" });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /blocked/);
  // A block stops registering only: a signed-up shop keeps working.
  const s = await post("register", { agree: true, phone: "0711000505", shop: "Stay Shop", mpesaName: "STAY", pin: "715293" });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await apost({ action: "ktown_block", phone: "0711000505" })).status, 200);
  assert.equal((await post("login", { phone: "0711000505", pin: "715293" })).status, 200);
  assert.equal((await apost({ action: "ktown_block", phone: "not a number" })).status, 400);
  const lifted = await apost({ action: "ktown_unblock", phone: "0711000404" });
  assert.deepEqual(lifted.body, { ok: true, phone: "254711000404" });
  assert.equal((await apost({ action: "ktown_unblock", phone: "0711000404" })).status, 404);
  const retry = await post("register", { agree: true, phone: "0711000404", shop: "Free Shop", mpesaName: "FREE", pin: "482916" });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
});

test("release frees a number: sessions and QR die, payment records stay", async () => {
  assert.equal((await apost({ action: "ktown_release", phone: "0711000606" }, "wrong-token")).status, 401);
  const s = await post("register", { agree: true, phone: "0711000606", shop: "Gone Shop", mpesaName: "GONE", pin: "715293" });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const id = s.body.merchant.id, session = s.body.session;
  const inv = await get(`lnurlp/${id}/cb?amount=100&currency=KES`);
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const before = await kt.merchantCount();
  const rel = await apost({ action: "ktown_release", phone: "0711000606" });
  assert.equal(rel.status, 200, JSON.stringify(rel.body));
  assert.equal(rel.body.shop, "Gone Shop");
  assert.equal(await store.getJSON(`kt:${id}`), null, "the record is gone");
  assert.equal(await store.getJSON("kt:phone:254711000606"), null, "the number is free");
  assert.equal(await kt.merchantCount(), before - 1);
  assert.equal((await get("me", { token: session })).status, 401, "the sessions ended");
  assert.equal((await get(`lnurlp/${id}`)).status, 404, "the QR is dead");
  assert.equal((await store.listIds(`kt:tx:${id}`, 10)).length, 1, "its payment record is kept, not deleted");
  assert.equal((await apost({ action: "ktown_release", phone: "0711000606" })).status, 404);
  const again = await post("register", { agree: true, phone: "0711000606", shop: "Back Shop", mpesaName: "BACK", pin: "482916" });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.notEqual(again.body.merchant.id, id);
});

test("takeovers, blocks and releases are logged in the Security watch", async () => {
  const { securityView, TECHNIQUES } = await import("../lib/attacks.js");
  assert.equal(TECHNIQUES.ktown_number.severity, "low", "logged for Stanley, never emailed");
  const events = (await securityView()).events.filter((e) => e.kind === "ktown_number");
  const wheres = events.map((e) => e.where);
  assert.ok(wheres.includes("kTown takeover 254777000077"), "the earlier takeover is logged");
  assert.ok(wheres.includes("kTown block 254711000404"), "the block is logged");
  assert.ok(wheres.includes("kTown unblock 254711000404"), "the unblock is logged");
  assert.ok(wheres.includes("kTown release 254711000606"), "the release is logged");
  assert.ok(events.every((e) => e.detail && e.at), "every event carries words and a time");
});
