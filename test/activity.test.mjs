// Ye₿ente activity for rewards: deposits and transactions per wallet, most active first.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-activity-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];

const store = await import("../lib/store.js");
const { walletActivity } = await import("../lib/activity.js");

test("most active wallets first; only completed transactions in the period; handles only", async () => {
  const now = Date.parse("2026-11-01T12:00:00Z"), day = 864e5, at = (d) => new Date(now - d * day).toISOString();
  const wallet = async (id, handle) => { await store.setJSON(`yw:${id}`, { id, handle, email: `${handle}@example.com`, balance: 0, createdAt: at(60) }); await store.pushId("ywallets", id); };
  let n = 0;
  const entry = async (walletId, kind, sats, d, status = "completed") => { const id = `e${++n}`; await store.setJSON(`ywe:${id}`, { id, walletId, kind, sats, status, at: at(d) }); await store.pushId(`ywtx:${walletId}`, id); };
  await wallet("w1", "amina"); await wallet("w2", "brian"); await wallet("w3", "quiet");
  await entry("w1", "receive", 5000, 1); await entry("w1", "send", -2000, 2); await entry("w1", "transfer_out", -100, 3);
  await entry("w2", "buy", 10000, 1); await entry("w2", "send", -500, 1, "failed"); await entry("w2", "receive", 700, 45);
  await entry("w3", "receive", 300, 200);

  const r = await walletActivity({ days: 30, now });
  assert.equal(r.wallets, 3);
  assert.equal(r.active, 2);
  assert.deepEqual(r.top.map((x) => [x.handle, x.transactions]), [["amina", 3], ["brian", 1]]);
  assert.deepEqual([r.top[0].deposits, r.top[0].depositSats, r.top[0].sends, r.top[0].sentSats, r.top[0].transfers], [1, 5000, 1, 2000, 1]);
  assert.equal(r.total.depositSats, 15000);
  assert.ok(!JSON.stringify(r).includes("@example.com"), "no emails");
  assert.equal((await walletActivity({ days: 0, now })).active, 3, "all time");
});

test("profit and loss: buy spread and support count as earned; Ye₿ente users' routing fees aren't the node's cost", async () => {
  const { profitLoss } = await import("../lib/pnl.js");
  const now = Date.parse("2026-11-01T12:00:00Z"), at = (d) => new Date(now - d * 864e5).toISOString();
  await store.setJSON("yw:w9", { id: "w9", handle: "buyer", balance: 9500, createdAt: at(5) }); await store.pushId("ywallets", "w9");
  for (const [id, e] of [["b1", { kind: "buy", sats: 9500, kes: 1000, status: "completed", at: at(1) }], ["s1", { kind: "send", sats: -1000, fee: 3, status: "completed", at: at(1) }]]) {
    await store.setJSON(`ywe:${id}`, { id, walletId: "w9", ...e }); await store.pushId("ywtx:w9", id);
  }
  await store.setJSON("tip:aa", { sats: 2100, paidAt: at(2) });
  await store.setJSON("tip:bb", { sats: 500 }); // made but never paid
  process.env.YEBENTE_BUY_SPREAD_PCT = "5";
  const r = await profitLoss({ days: 30, now });
  delete process.env.YEBENTE_BUY_SPREAD_PCT;
  assert.equal(r.nodeRead, false, "no node in this test");
  // This buy (9,500 sats) and the 10,000-sat buy from the test above: 5% kept on 19,500 sats given.
  assert.equal(r.earned.buys, 2);
  assert.equal(r.earned.spread, Math.round((19500 * 5) / 95));
  assert.equal(r.earned.support, 2100, "only paid support counts");
  assert.equal(r.earned.buyKes, 1000, "the earlier buy recorded no shillings");
  assert.equal(r.spent.routeFees, 0, "users repaid their own routing fees");
  assert.equal(r.net, r.earned.total - r.spent.total);
  assert.ok(r.yours.owed >= 9500);
});

test("wallet balances (largest first) and where payments went, with phone numbers masked and partner receipts kept", async () => {
  const { walletBalances, destinations } = await import("../lib/activity.js");
  const now = Date.parse("2026-11-01T12:00:00Z"), at = (d) => new Date(now - d * 864e5).toISOString();
  await store.setJSON("yw:w7", { id: "w7", handle: "rich", balance: 50000, createdAt: at(9) }); await store.pushId("ywallets", "w7");
  for (const [id, e] of [["m1", { kind: "send", sats: -3000, fee: 30, status: "completed", counterparty: "254707172370@bitcoin.co.ke", receiptUrl: "https://bitcoin.co.ke/api/payment/abc", at: at(2) }],
    ["m2", { kind: "send", sats: -1000, fee: 5, status: "failed", counterparty: "254707172370@bitcoin.co.ke", at: at(1) }],
    ["m3", { kind: "send", sats: -2000, fee: 2, status: "completed", counterparty: "friend@walletofsatoshi.com", receiptUrl: "javascript:alert(1)", at: at(3) }]]) {
    await store.setJSON(`ywe:${id}`, { id, walletId: "w7", ...e }); await store.pushId("ywtx:w7", id);
  }
  const B = await walletBalances({ now });
  assert.equal(B.wallets[0].handle, "rich", "largest balance first");
  assert.ok(!JSON.stringify(B).includes("example.com"), "no emails, only whether one is set");
  const D = await destinations({ days: 30, now });
  const mpesa = D.destinations.find((d) => d.mpesa);
  assert.equal(mpesa.to, "2547…370@bitcoin.co.ke", "phone number masked");
  assert.equal(mpesa.payments, 1, "failed payments don't count");
  assert.deepEqual(mpesa.receipts.map((r) => r.url), ["https://bitcoin.co.ke/api/payment/abc"]);
  assert.deepEqual(D.destinations.find((d) => d.to === "friend@walletofsatoshi.com").receipts, [], "only https receipt links");
});
