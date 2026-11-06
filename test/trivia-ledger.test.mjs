// Mempool Mayhem ledger (lib/trivia-ledger.js): append-only entries, one
// record per battle-sat movement, idempotent refs, totals that always add
// up, and archiving that never deletes.
// Run: node --test test/trivia-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-trivia-ledger-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "TRIVIA"]) delete process.env[k];
process.env.TRIVIA = "on";

const led = await import("../lib/trivia-ledger.js");

test("health of the switch: writes refuse when off, reads still answer", async () => {
  const g = "ledger-off-1";
  await led.record(g, { ref: "r1", sats: 100, kind: "stake", playerId: "p1" });
  process.env.TRIVIA = "";
  await assert.rejects(led.record(g, { ref: "r2", sats: 100, kind: "stake" }), /off/);
  await assert.rejects(led.archive(g), /off/);
  const t = await led.totals(g); // reads stay up: past games stay auditable
  assert.equal(t.net, 100);
  process.env.TRIVIA = "on";
});

test("every movement is recorded, in order, with running balances", async () => {
  const g = "ledger-seq-1";
  const a = await led.record(g, { ref: "stake:p1", sats: 1000, kind: "stake", playerId: "p1" });
  const b = await led.record(g, { ref: "prize:p1", sats: -800, kind: "prize", playerId: "p1" });
  const c = await led.record(g, { ref: "fee:game", sats: -50, kind: "fee", note: "host fee" });
  assert.equal(a.seq, 1);
  assert.equal(a.balance, 1000);
  assert.equal(b.seq, 2);
  assert.equal(b.balance, 200);
  assert.equal(c.seq, 3);
  assert.equal(c.balance, 150);
  const rows = await led.entries(g);
  assert.equal(rows.length, 3);
});

test("totals always add up", async () => {
  const g = "ledger-maths-1";
  await led.record(g, { ref: "s1", sats: 500, kind: "stake", playerId: "p1" });
  await led.record(g, { ref: "s2", sats: 500, kind: "stake", playerId: "p2" });
  await led.record(g, { ref: "p1", sats: -700, kind: "prize", playerId: "p1" });
  await led.record(g, { ref: "r1", sats: 200, kind: "refund", playerId: "p2" });
  const t = await led.totals(g);
  assert.equal(t.in, 1200);
  assert.equal(t.out, -700);
  assert.equal(t.net, 500);
  assert.equal(t.count, 4);
  assert.deepEqual({ net: t.stored.net, count: t.stored.count }, { net: 500, count: 4 });
  assert.equal((await led.verify(g)).ok, true);
});

test("a retried ref records once", async () => {
  const g = "ledger-idem-1";
  const first = await led.record(g, { ref: "once", sats: 300, kind: "stake" });
  const second = await led.record(g, { ref: "once", sats: 300, kind: "stake" });
  assert.equal(second.id, first.id);
  assert.equal((await led.totals(g)).count, 1);
  assert.equal((await led.totals(g)).net, 300);
});

test("bad writes refuse with plain reasons", async () => {
  const g = "ledger-bad-1";
  await assert.rejects(led.record("x", { ref: "r", sats: 1, kind: "stake" }), /game id/);
  await assert.rejects(led.record(g, { ref: "bad ref!", sats: 1, kind: "stake" }), /ref/);
  await assert.rejects(led.record(g, { ref: "z", sats: 0, kind: "stake" }), /nonzero/);
  await assert.rejects(led.record(g, { ref: "z", sats: 1.5, kind: "stake" }), /whole/);
  await assert.rejects(led.record(g, { ref: "z", sats: 1, kind: "gift" }), /Kind/);
  await assert.rejects(led.record(g, { ref: "z", sats: 100, kind: "prize" }), /negative/);
  await assert.rejects(led.record(g, { ref: "z", sats: -100, kind: "stake" }), /positive/);
  await assert.rejects(led.record(g, { ref: "z", sats: 100, kind: "adjust" }), /note/);
  assert.equal((await led.totals(g)).count, 0); // nothing half-written
});

test("archive stamps the game and keeps every entry", async () => {
  const g = "ledger-arch-1";
  await led.record(g, { ref: "s1", sats: 400, kind: "stake", playerId: "p1" });
  const before = await led.entries(g);
  assert.equal(await led.isArchived(g), false);
  const stamp = await led.archive(g);
  assert.ok(stamp.archivedAt);
  assert.equal(await led.isArchived(g), true);
  assert.deepEqual(await led.entries(g), before); // nothing touched
  assert.equal((await led.verify(g)).ok, true);
  await assert.rejects(led.record(g, { ref: "late", sats: 1, kind: "stake" }), /archived/);
  assert.ok((await led.archivedGames()).includes(g));
  const again = await led.archive(g); // archiving twice is a no-op
  assert.equal(again.archivedAt, stamp.archivedAt);
});
