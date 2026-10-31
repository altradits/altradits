// The one-time move of the agency's records, the daily clean-up, and backups.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-cleanup-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];

const store = await import("../lib/store.js");
const { retireAgency, autoClean } = await import("../lib/cleanup.js");
const has = async (k) => (await store.getJSON(k)) != null;

test("the agency's records (test orders included) are archived, then removed, once; Ye₿ente and the logs stay", async () => {
  await store.setJSON("proposal:p1", { id: "p1", status: "paid", donation: true });
  await store.pushId("proposals", "p1");
  for (const k of ["lead:l1", "task:t1", "sub:s1", "mkt:settings", "job:j1", "learn:traj:x", "stan:instr:i1", "coupon:ABC"]) await store.setJSON(k, { k });
  for (const k of ["yw:w1", "ywe:e1", "ywinv:h1", "email:m1", "secw:events", "ln:lessons"]) await store.setJSON(k, { k });
  await store.pushId("emails", "m1");

  const r = await retireAgency(new Date("2026-11-01T00:00:00Z"));
  assert.equal(r.removed, 9);
  for (const k of ["proposal:p1", "lead:l1", "task:t1", "sub:s1", "mkt:settings", "job:j1", "learn:traj:x", "stan:instr:i1", "coupon:ABC"]) assert.equal(await has(k), false, `${k} removed`);
  for (const k of ["yw:w1", "ywe:e1", "ywinv:h1", "email:m1", "secw:events", "ln:lessons"]) assert.equal(await has(k), true, `${k} kept`);
  assert.deepEqual(await store.listIds("proposals"), []);
  assert.deepEqual(await store.listIds("emails"), ["m1"]);

  // Archived first, owner-only, with every record.
  const file = path.join(store.ARCHIVE(), r.archive);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).kv["proposal:p1"].status, "paid");

  // Never twice: records made later are left alone.
  await store.setJSON("lead:l2", { k: 1 });
  assert.deepEqual(await retireAgency(), { already: true });
  assert.equal(await has("lead:l2"), true);
});

test("daily clean-up: spent rate-limit counters and archive files older than 90 days", async () => {
  fs.mkdirSync(store.ARCHIVE(), { recursive: true });
  const stale = path.join(store.ARCHIVE(), "fresh-2026-01-01T00-00-00-000Z.json");
  fs.writeFileSync(stale, "{}");
  const t = new Date("2026-01-01T00:00:00Z"); fs.utimesSync(stale, t, t);
  await store.hit("rl:test", 1);
  const r = await autoClean(Date.now() + 5000);
  assert.ok(r.archives >= 1 && r.counters >= 1);
  assert.equal(fs.existsSync(stale), false);
});

test("daily backup: compressed, encrypted with BACKUP_KEY, owner-only, rotated, and restores exactly", async () => {
  const fs = await import("node:fs"), path = await import("node:path");
  const backup = await import("../lib/backup.js");
  process.env.BACKUP_DIR = path.join(process.cwd(), "bk");
  process.env.BACKUP_KEY = "correct horse battery staple";
  await store.setJSON("proposal:keepme", { id: "keepme", status: "paid" });
  const r = await backup.backupNow(new Date("2026-10-20T03:00:00Z"));
  assert.equal(r.encrypted, true);
  const file = path.join(process.env.BACKUP_DIR, r.file);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(!fs.readFileSync(file).includes("keepme")); // not readable without the key
  assert.equal(backup.readBackup(file).kv["proposal:keepme"].status, "paid");
  assert.throws(() => backup.readBackup(file, "wrong key"));
  for (let d = 0; d < 20; d++) await backup.backupNow(new Date(Date.UTC(2026, 8, 1 + d, 3)));
  const left = fs.readdirSync(process.env.BACKUP_DIR);
  assert.ok(left.filter((f) => !f.includes("weekly")).length <= 14 && left.filter((f) => f.includes("weekly")).length <= 8);
  delete process.env.BACKUP_KEY;
});
