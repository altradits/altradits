// Node top-ups: the dashboard shows the balance before and after each deposit.
// Run: node --test test/topup.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-topup-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL", "LND_ADMIN_MACAROON"]) delete process.env[k];

const store = await import("../lib/store.js");
const { topupStatus } = await import("../lib/channels.js");
const H = (c) => c.repeat(64);

test("a paid top-up reports the sending power from before the deposit, so the dashboard can show was and now", async () => {
  await store.setJSON(`topup:${H("a")}`, { hash: H("a"), sats: 60000, state: "paid", paidAt: "2026-11-03T13:00:00Z", spendableBefore: 1184567 });
  const t = await topupStatus(H("a"));
  assert.equal(t.state, "paid");
  assert.equal(t.sats, 60000);
  assert.equal(t.spendableBefore, 1184567);
});

test("an open top-up stays open when the node can't be reached, and still carries the before figure", async () => {
  await store.setJSON(`topup:${H("b")}`, { hash: H("b"), sats: 30000, state: "open", expiresAt: new Date(Date.now() + 3600e3).toISOString(), spendableBefore: 500000 });
  const t = await topupStatus(H("b"));
  assert.equal(t.state, "open");
  assert.equal(t.spendableBefore, 500000);
});

test("an open top-up past its hour reads expired, and an unknown hash reads nothing", async () => {
  await store.setJSON(`topup:${H("c")}`, { hash: H("c"), sats: 30000, state: "open", expiresAt: new Date(Date.now() - 1000).toISOString(), spendableBefore: 500000 });
  assert.equal((await topupStatus(H("c"))).state, "expired");
  assert.equal(await topupStatus(H("d")), null);
  assert.equal(await topupStatus("not-a-hash"), null);
});
