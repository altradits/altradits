// Ye₿ente's API at /api/yebente/*: nothing moves money unless switched on, and
// the M-Pesa callback only counts with the secret.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-yebente-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "YEBENTE_MPESA_BUY", "YEBENTE_NODE_DEPOSITS", "LND_REST_URL", "LND_INVOICE_MACAROON"]) delete process.env[k];
Object.assign(process.env, { MPESA_CONSUMER_KEY: "k", MPESA_CONSUMER_SECRET: "s", MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "p", YEBENTE_CALLBACK_SECRET: "x".repeat(32) });

const api = await import("../api/yebente.js");
const call = (method, p, body) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": "7.7.7.7" }, body: body ? JSON.stringify(body) : undefined }));

test("health says what is on; every payout path refuses", async () => {
  const h = await (await call("GET", "health")).json();
  assert.equal(h.status, "ok");
  assert.equal(h.buy, false);
  assert.equal(h.deposits, false);
  for (const p of ["lightning/disburse", "bitcoin/disburse", "mpesa/payout", "mpesa/b2b", "mpesa/reversal", "mpesa/ratiba", "telebirr/deposit", "telebirr/payout"]) {
    const r = await call("POST", p, { invoice: "lnbc1", address: "bc1q", phone: "0712345678", amount: 100, satsAmount: 1000 });
    assert.equal(r.status, 501, p);
    assert.equal((await r.json()).configured, false, p);
  }
  // Buying and node deposits stay off until switched on.
  assert.equal((await call("POST", "mpesa/stkpush", { phone: "0712345678", amount: 100 })).status, 501);
  assert.equal((await call("POST", "lightning/create-invoice", { satsAmount: 1000 })).status, 501);
  assert.equal((await call("GET", "lightning/invoice-status/" + "a".repeat(64))).status, 501);
});

test("the M-Pesa callback needs the secret, and keeps the result without the phone number", async () => {
  const body = { Body: { stkCallback: { CheckoutRequestID: "ws_CO_1", ResultCode: 0, ResultDesc: "ok",
    CallbackMetadata: { Item: [{ Name: "MpesaReceiptNumber", Value: "QAB12CD34" }, { Name: "PhoneNumber", Value: 254712345678 }] } } } };
  assert.equal((await call("POST", "mpesa/callback/" + "y".repeat(32), body)).status, 403);
  assert.equal((await call("POST", "mpesa/callback/" + "x".repeat(32), body)).status, 200);
  const raw = fs.readFileSync(path.join(".data", "db.json"), "utf8");
  assert.match(raw, /QAB12CD34/);
  assert.doesNotMatch(raw, /254712345678/);
  // Even with buying switched on, nobody can query Daraja without signing in (wallet/buy/<id> instead).
  process.env.YEBENTE_MPESA_BUY = "on";
  assert.equal((await call("POST", "mpesa/query", { checkoutRequestId: "ws_CO_1" })).status, 501);
  delete process.env.YEBENTE_MPESA_BUY;
});

test("routes that use the node or Daraja quota need a signed-in wallet", async () => {
  process.env.YEBENTE_NODE_DEPOSITS = "on";
  assert.equal((await call("POST", "lightning/create-invoice", { satsAmount: 1000 })).status, 501); // off for good, whatever the switch says
  delete process.env.YEBENTE_NODE_DEPOSITS;
  assert.equal((await call("POST", "mpesa/hakikisha/c2b", { shortCode: "174379" })).status, 401);
});
