// Send Mobile directly (#510): Ye₿ente pays M-Pesa from its own B2C shortcode.
// The sats are taken first; Safaricom's answer either completes the payment or
// gives the sats back, once. Safaricom and the price feeds are scripted below,
// with the request and callback shapes from Safaricom's B2C documentation.
// Run: node --test test/yebente-mpesa-direct.test.mjs
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
  YEBENTE_B2C_CALLBACK_SECRET: SECRET,
});

const yw = await import("../lib/ywallet.js");
const yb = await import("../api/yebente.js");
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
  if (u.includes("open.er-api.com")) return ok({ rates: { KES: 129 } });
  if (u.includes("api.coinbase.com")) return ok({ data: { amount: "100000" } });
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

test("rails list the direct option, and a partner that doesn't answer goes last", async () => {
  rails.setRailFetcher(async (u) => { if (u.includes("bitcoin.co.ke")) throw new Error("down"); return { status: 200 }; });
  const list = (await (await yb.GET(new Request("https://b2c.test/api/yebente/rails"))).json()).rails;
  assert.deepEqual(list.map((r) => r.id), ["mpesa-direct", "mpesa"]);
  assert.equal(list[0].direct, true);
  assert.equal(list[1].down, true);
  assert.equal(list[0].on, undefined, "the switch itself is never sent");
  rails.setRailFetcher(async () => ({ status: 200 }));
  assert.deepEqual((await (await yb.GET(new Request("https://b2c.test/api/yebente/rails"))).json()).rails.map((r) => r.id), ["mpesa", "mpesa-direct"]);
});

test("paid: the sats are taken, Safaricom's answer completes it with the M-Pesa code", async () => {
  const { wallet, token } = await funded("direct_paid");
  const r = await send(token, { phone: "0712 345 678", kes: 1000 });
  assert.equal(r.success, true);
  assert.equal(r.status, "pending");
  // 1,000 KES at 12,900,000 KES per bitcoin, plus 1%, rounded up.
  assert.equal(r.sats, 7830);
  assert.equal(await balance(wallet.id), 50_000 - 7830);
  const req = payRequests.at(-1);
  assert.equal(req.PartyB, "254712345678");
  assert.equal(req.Amount, "1000");
  assert.equal(req.OriginatorConversationID, r.id);
  assert.equal(await hook("result", result(r.id, 0)), 200);
  const v = await (await call("GET", token, `wallet/mobile/${r.id}`)).json();
  assert.equal(v.status, "completed");
  assert.equal(v.receipt, "SKL2ABC123");
  assert.equal(await balance(wallet.id), 50_000 - 7830);
  assert.equal((await getJSON("ywmob:float")).kes, 19000, "the float follows Safaricom's figure");
  // The same answer again (Safaricom retries callbacks) changes nothing.
  await hook("result", result(r.id, 0));
  assert.equal(await balance(wallet.id), 50_000 - 7830);
  const e = (await yw.history(wallet.id)).find((x) => x.kind === "send_mobile");
  assert.equal(e.status, "completed");
  assert.equal(e.kes, 1000);
  assert.match(e.counterparty, /^M-Pesa \+254712\*\*\*78$/, "the full number never sits in the history");
});

test("refused: the sats go straight back, once, with a plain reason", async () => {
  const { wallet, token } = await funded("direct_refused");
  const r = await send(token, { phone: "0712345678", kes: 1000 });
  await hook("result", result(r.id, 1));
  await hook("result", result(r.id, 1));
  assert.equal(await balance(wallet.id), 50_000);
  const v = await (await call("GET", token, `wallet/mobile/${r.id}`)).json();
  assert.equal(v.status, "failed");
  assert.match(v.error, /float|sats are back/i);
});

test("a late success after a refund can't take the sats again", async () => {
  const { wallet, token } = await funded("direct_late");
  const r = await send(token, { phone: "0712345678", kes: 500 });
  await hook("result", result(r.id, 2040));
  await hook("result", result(r.id, 0));
  assert.equal(await balance(wallet.id), 50_000);
  assert.equal((await (await call("GET", token, `wallet/mobile/${r.id}`)).json()).status, "failed");
});

test("a wrong callback secret is refused and changes nothing", async () => {
  const { wallet, token } = await funded("direct_secret");
  const r = await send(token, { phone: "0712345678", kes: 500 });
  const taken = await balance(wallet.id);
  assert.equal(await hook("result", result(r.id, 1), "x".repeat(SECRET.length)), 403);
  assert.equal(await hook("result", result(r.id, 1), "short-but-valid-16"), 403);
  assert.equal(await balance(wallet.id), taken);
  assert.equal((await (await call("GET", token, `wallet/mobile/${r.id}`)).json()).status, "pending");
});

test("answers for payouts this server never started are ignored", async () => {
  assert.equal(await hook("result", result("ymNOTOURS0000", 0)), 200);
  assert.equal(await hook("result", result("../../etc/passwd", 0)), 200);
  assert.equal(await getJSON("ywmob:ymNOTOURS0000"), null);
});

test("paid for a different amount than asked: never marked paid", async () => {
  const { token } = await funded("direct_mismatch");
  const r = await send(token, { phone: "0712345678", kes: 700 });
  await hook("result", result(r.id, 0)); // says 1,000 KES
  assert.equal((await (await call("GET", token, `wallet/mobile/${r.id}`)).json()).status, "pending");
});

test("Safaricom refuses the request itself (4xx): refunded at once", async () => {
  const { wallet, token } = await funded("direct_400");
  payMode = "http400";
  try {
    const r = await send(token, { phone: "0712345678", kes: 300 });
    assert.equal(r.status, "failed");
  } finally { payMode = "ok"; }
  assert.equal(await balance(wallet.id), 50_000);
});

test("no clear answer: it stays pending and is settled by a status query, never paid twice", async () => {
  const { wallet, token } = await funded("direct_unclear");
  payMode = "network";
  let r;
  try { r = await send(token, { phone: "0712345678", kes: 1000 }); } finally { payMode = "ok"; }
  assert.equal(r.status, "pending");
  const requestsBefore = payRequests.length;
  yw.setMobileTimings({ askAfterMs: 0 });
  await yw.reconcileMobile();
  assert.equal(payRequests.length, requestsBefore, "reconciling never sends a second payment");
  // Other tests' payouts are still waiting too, so pick this payout's query.
  const q = statusQueries.find((x) => x.OriginalConversationID === r.id);
  assert.ok(q, "M-Pesa was asked about this payout");
  assert.ok(q.ResultURL.endsWith(`/api/yebente/b2c/status/${SECRET}`));
  // The status answer names the payout inside ResultParameters, not at the top.
  await hook("status", { Result: { ResultCode: 0, ResultDesc: "The service request is processed successfully.", OriginatorConversationID: "the-query-id",
    ResultParameters: { ResultParameter: [{ Key: "OriginatorConversationID", Value: r.id }, { Key: "TransactionStatus", Value: "Completed" }, { Key: "ReceiptNo", Value: "SKL2STATUS1" }, { Key: "Amount", Value: "1000" }] } } });
  const v = await (await call("GET", token, `wallet/mobile/${r.id}`)).json();
  assert.equal(v.status, "completed");
  assert.equal(v.receipt, "SKL2STATUS1");
  assert.equal(await balance(wallet.id), 50_000 - 7830);
  yw.setMobileTimings({ askAfterMs: 60e3 });
});

test("quotes stay inside the float, counting payouts still waiting", async () => {
  const { setJSON } = await import("../lib/store.js");
  await setJSON("ywmob:float", { kes: 1500, at: new Date().toISOString() });
  const { token } = await funded("direct_float");
  const reserved = (await getJSON("ywmob:float")).kes;
  const r = await send(token, { phone: "0712345678", kes: reserved + 1 });
  assert.equal(r.status, 503);
  assert.match(r.error, /low on float/i);
  await setJSON("ywmob:float", { kes: 20000, at: new Date().toISOString() });
});

test("two sends at the same moment can't both use the last of the float", async () => {
  const { setJSON } = await import("../lib/store.js");
  const { removeFromList } = await import("../lib/store.js");
  await removeFromList("ywmobopen", await (await import("../lib/store.js")).listIds("ywmobopen", 500)); // earlier tests' open payouts
  await setJSON("ywmob:float", { kes: 1500, at: new Date().toISOString() });
  const a = await funded("direct_race_a"), b = await funded("direct_race_b");
  const [ra, rb] = await Promise.all([send(a.token, { phone: "0712345678", kes: 1000 }), send(b.token, { phone: "0712345678", kes: 1000 })]);
  assert.deepEqual([ra.success, rb.success].sort(), [false, true], "exactly one fits");
  await setJSON("ywmob:float", { kes: 20000, at: new Date().toISOString() });
});

test("bad numbers, text amounts, wrong PINs and a switched-off rail are refused before anything is taken", async () => {
  const { wallet, token } = await funded("direct_checks");
  for (const body of [{ phone: "020 123 4567", kes: 100 }, { phone: "0712345678", kes: "100" }, { phone: "0712345678", kes: 9 }, { phone: "0712345678", kes: 10.5 }]) {
    const r = await send(token, body);
    assert.equal(r.success, false, JSON.stringify(body));
  }
  const wrongPin = await call("POST", token, "wallet/mobile", { phone: "0712345678", kes: 100, pin: "000000" });
  assert.equal(wrongPin.status, 403);
  assert.equal(await balance(wallet.id), 50_000);
  process.env.YEBENTE_B2C = "off";
  try {
    const r = await send(token, { phone: "0712345678", kes: 100 });
    assert.equal(r.status, 501);
  } finally { process.env.YEBENTE_B2C = "on"; }
  assert.equal(await balance(wallet.id), 50_000);
  assert.equal((await call("POST", null, "wallet/mobile", { phone: "0712345678", kes: 100, pin: "482910" })).status, 401);
});

test("another wallet can't read someone's payout", async () => {
  const a = await funded("direct_owner");
  const b = await funded("direct_other");
  const r = await send(a.token, { phone: "0712345678", kes: 100 });
  assert.equal((await call("GET", b.token, `wallet/mobile/${r.id}`)).status, 404);
});
