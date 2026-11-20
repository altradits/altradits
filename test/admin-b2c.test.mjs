// The admin panel for direct M-Pesa payouts (#513): the float, open payouts,
// and settling a payout Safaricom never answered on, safely and only once.
// Safaricom and the price feeds are scripted as in yebente-mpesa-direct.test.mjs.
// Run: node --test test/admin-b2c.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-b2c-"));
process.chdir(dir);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "DATA_DIR", "LND_REST_URL"]) delete process.env[k];
// A throwaway key pair stands in for Safaricom's: the "server" below decrypts the credential with it.
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/b2c.key`, "-out", `${dir}/b2c.cer`, "-days", "1", "-subj", "/CN=b2c-test"], { stdio: "ignore" });
const SECRET = "b2c-callback-secret-0123456789";
Object.assign(process.env, {
  YEBENTE_WALLETS: "on", SITE_URL: "https://b2c.test", EMAIL_APPROVAL: "off",
  YEBENTE_B2C: "on", MPESA_ENVIRONMENT: "production", YEBENTE_B2C_FLOAT_KES: "20000",
  MPESA_B2C_CONSUMER_KEY: "ck", MPESA_B2C_CONSUMER_SECRET: "cs", MPESA_B2C_SHORTCODE: "600000",
  MPESA_B2C_INITIATOR: "apiop", MPESA_B2C_INITIATOR_PASSWORD: "Op#2026pass", MPESA_B2C_CERT: `${dir}/b2c.cer`,
  YEBENTE_B2C_CALLBACK_SECRET: SECRET, ADMIN_TOKEN: "admin-b2c-test-token",
});

const yw = await import("../lib/ywallet.js");
const yb = await import("../api/yebente.js");
const admin = await import("../api/admin.js");
const email = await import("../lib/email.js");
const sent = [];
email.setMailer({ sendMail: async (m) => { sent.push(m); } });
const rails = await import("../lib/rails.js");
const { getJSON } = await import("../lib/store.js");
rails.setRailFetcher(async () => ({ status: 200 }));

// ---- scripted Safaricom: every payment request and status query is recorded
const priv = fs.readFileSync(`${dir}/b2c.key`);
let payMode = "ok"; // ok | http400 | network
const payRequests = [], statusQueries = [];
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const host = new URL(u).hostname; // exact host, never a substring
  if (host === "open.er-api.com") return ok({ rates: { KES: 129 } });
  if (host === "api.coinbase.com") return ok({ data: { amount: "100000" } });
  if (u.endsWith("/oauth/v1/generate?grant_type=client_credentials")) {
    assert.equal(opts.headers.Authorization, `Basic ${Buffer.from("ck:cs").toString("base64")}`);
    return ok({ access_token: "tok", expires_in: "3599" });
  }
  if (u === "https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest") {
    const b = JSON.parse(opts.body);
    // The operator's password arrives encrypted with the certificate, never plain.
    assert.equal(crypto.privateDecrypt({ key: priv, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(b.SecurityCredential, "base64")).toString(), "Op#2026pass");
    assert.ok(b.ResultURL.endsWith(`/api/yebente/b2c/result/${SECRET}`));
    payRequests.push(b);
    if (payMode === "network") throw new Error("socket hang up");
    if (payMode === "http400") return { ok: false, status: 400, json: async () => ({ errorMessage: "Bad Request - Invalid PartyB" }) };
    return ok({ ConversationID: "AG_1", OriginatorConversationID: b.OriginatorConversationID, ResponseCode: "0", ResponseDescription: "Accept the service request successfully." });
  }
  if (u === "https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query") {
    statusQueries.push(JSON.parse(opts.body));
    return ok({ ResponseCode: "0" });
  }
  throw new Error(`unexpected fetch: ${u}`);
};

const device = () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" }).toString("base64url");
async function funded(handle, sats = 50_000) {
  const r = await yw.createWallet({ pin: "482910", handle, device: device() });
  await yw.credit({ walletId: r.wallet.id, sats, kind: "receive", ref: `fund-${handle}` });
  return { wallet: r.wallet, token: r.session || r.token };
}
const call = (method, token, p, body) => yb[method](new Request(`https://b2c.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-forwarded-for": "7.7.7.7" },
  body: body ? JSON.stringify(body) : undefined,
}));
const send = async (token, body) => { const r = await call("POST", token, "wallet/mobile", { pin: "482910", ...body }); return { status: r.status, ...(await r.json()) }; };
const result = (originatorId, code, extra = []) => ({ Result: { ResultType: 0, ResultCode: code, ResultDesc: code ? "The balance is insufficient for the transaction." : "The service request is processed successfully.",
  OriginatorConversationID: originatorId, ConversationID: "AG_1", TransactionID: "TX1",
  ...(code === 0 ? { ResultParameters: { ResultParameter: [{ Key: "TransactionAmount", Value: 1000 }, { Key: "TransactionReceipt", Value: "SKL2ABC123" }, { Key: "B2CUtilityAccountAvailableFunds", Value: 19000 }, ...extra] } } : {}) } });
const hook = async (kind, body, secret = SECRET) => (await call("POST", null, `b2c/${kind}/${secret}`, body)).status;
const balance = async (id) => (await getJSON(`yw:${id}`)).balance;


const A = (method, body, token = "admin-b2c-test-token") => admin[method](new Request(`https://b2c.test/api/admin${method === "GET" ? "?view=b2c" : ""}`, {
  method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }));
const view = async () => (await A("GET")).json();
const act = async (body) => { const r = await A("POST", body); return { status: r.status, ...(await r.json()) }; };
async function stuck(handle, kes = 1000) {
  const { wallet, token } = await funded(handle);
  payMode = "network";
  let r;
  try { r = await send(token, { phone: "0712345678", kes }); } finally { payMode = "ok"; }
  assert.equal(r.status, "pending");
  return { wallet, token, id: r.id };
}
const age = async (id, ms) => { const { setJSON } = await import("../lib/store.js"); const p = await getJSON(`ywmob:${id}`); await setJSON(`ywmob:${id}`, { ...p, at: new Date(Date.now() - ms).toISOString() }); };

test("only the admin token sees or changes payouts", async () => {
  assert.equal((await A("GET", null, null)).status, 401);
  assert.equal((await A("GET", null, "wrong")).status, 401);
  assert.equal((await A("POST", { action: "b2c_float", kes: 1 }, "wrong")).status, 401);
});

test("the panel shows the float, what open payouts promised, and masks phones", async () => {
  const { id } = await stuck("adm_view", 1200);
  const v = await view();
  assert.equal(v.on, true);
  const row = v.open.find((r) => r.id === id);
  assert.ok(row, "the stuck payout is listed");
  assert.equal(row.kes, 1200);
  assert.equal(row.phone, "+254712***78");
  assert.ok(!JSON.stringify(v).includes("254712345678"), "the full number never leaves the server");
  assert.ok(v.reservedKes >= 1200);
  assert.equal(v.roomKes, v.floatKes - v.reservedKes);
});

test("set the float after a refill; nonsense is refused", async () => {
  assert.equal((await act({ action: "b2c_float", kes: 50000 })).floatKes, 50000);
  assert.equal((await view()).floatFrom, "set by you");
  for (const kes of [-1, 1.5, "100", 20_000_000]) assert.equal((await act({ action: "b2c_float", kes })).status, 400, String(kes));
});

test("mark paid needs a real M-Pesa code; it completes once and a late answer changes nothing", async () => {
  const { wallet, token, id } = await stuck("adm_paid");
  const before = await balance(wallet.id);
  assert.equal((await act({ action: "b2c_settle", id, outcome: "paid", receipt: "nope" })).status, 400);
  sent.length = 0;
  const r = await act({ action: "b2c_settle", id, outcome: "paid", receipt: " skl2abc999 " });
  assert.equal(r.result, "paid");
  assert.equal(r.payout.receipt, "SKL2ABC999");
  assert.equal(r.payout.byHand.outcome, "paid");
  assert.equal(await balance(wallet.id), before, "the sats stay spent");
  assert.ok(sent.some((m) => /settled by hand/.test(m.subject)), "the owner is emailed");
  assert.equal((await act({ action: "b2c_settle", id, outcome: "refund", confirm: `REFUND ${id}` })).status, 409);
  await hook("result", result(id, 1)); // Safaricom's late "refused" for a payout already settled
  assert.equal(await balance(wallet.id), before);
  assert.equal((await (await call("GET", token, `wallet/mobile/${id}`)).json()).status, "completed");
  assert.ok((await view()).recent.some((x) => x.id === id && x.byHand));
});

test("refund waits an hour and needs REFUND <id> typed; then the sats go back once", async () => {
  const { wallet, id } = await stuck("adm_refund");
  const before = await balance(wallet.id);
  assert.equal((await act({ action: "b2c_settle", id, outcome: "refund", confirm: `REFUND ${id}` })).status, 409, "too soon");
  await age(id, 2 * 3600e3);
  assert.equal((await act({ action: "b2c_settle", id, outcome: "refund", confirm: "REFUND" })).status, 400);
  assert.equal((await act({ action: "b2c_settle", id, outcome: "refund", confirm: `refund ${id}` })).status, 400, "exact text only");
  const r = await act({ action: "b2c_settle", id, outcome: "refund", confirm: `REFUND ${id}` });
  assert.equal(r.result, "refunded");
  assert.equal(await balance(wallet.id), before + 7830);
  await hook("result", result(id, 0)); // a late "paid" can't take the sats again
  assert.equal(await balance(wallet.id), before + 7830);
});

test("unknown ids and outcomes are refused", async () => {
  assert.equal((await act({ action: "b2c_settle", id: "ymNOPE00000", outcome: "paid", receipt: "SKL2ABC123" })).status, 404);
  assert.equal((await act({ action: "b2c_settle", id: "../etc", outcome: "paid", receipt: "SKL2ABC123" })).status, 404);
  const { id } = await stuck("adm_outcome");
  assert.equal((await act({ action: "b2c_settle", id, outcome: "maybe" })).status, 400);
});
