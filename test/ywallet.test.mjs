// Ye₿ente custodial wallets: accounts, PIN, transfers, limits and the ledger.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ywallet-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR"]) delete process.env[k];
Object.assign(process.env, { SITE_URL: "https://altradits.test", YEBENTE_MAX_BALANCE_SATS: "10000", YEBENTE_MAX_PAYMENT_SATS: "5000", YEBENTE_DAILY_SEND_SATS: "6000" });

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
