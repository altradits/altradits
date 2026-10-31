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
