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

test("the agency's records (test orders included) and the old email log are archived, then removed, once; Ye₿ente and the security log stay", async () => {
  await store.setJSON("proposal:p1", { id: "p1", status: "paid", donation: true, payment: { sats: 2100, confirmedAt: "2026-10-20T10:00:00Z" } });
  await store.pushId("proposals", "p1");
  for (const k of ["lead:l1", "task:t1", "sub:s1", "mkt:settings", "job:j1", "learn:traj:x", "stan:instr:i1", "coupon:ABC"]) await store.setJSON(k, { k });
  for (const k of ["yw:w1", "ywe:e1", "ywinv:h1", "secw:events", "ln:lessons"]) await store.setJSON(k, { k });
  await store.setJSON("email:m1", { k: "old" });
  await store.pushId("emails", "m1");
  // Visits: removed pages (va, products) are dropped; pages that still exist stay.
  const vdir = path.join(store.dataDir(), "visits");
  fs.mkdirSync(vdir, { recursive: true });
  fs.writeFileSync(path.join(vdir, "2026-10-30.jsonl"), ['{"p":"home","r":"","s":""}', '{"p":"va","r":"","s":""}', '{"p":"products","r":"","s":""}', '{"p":"library","r":"","s":""}'].join("\n") + "\n");

  const r = await retireAgency(new Date("2026-11-01T00:00:00Z"));
  assert.equal(r.removed, 10);
  for (const k of ["proposal:p1", "lead:l1", "task:t1", "sub:s1", "mkt:settings", "job:j1", "learn:traj:x", "stan:instr:i1", "coupon:ABC", "email:m1"]) assert.equal(await has(k), false, `${k} removed`);
  for (const k of ["yw:w1", "ywe:e1", "ywinv:h1", "secw:events", "ln:lessons"]) assert.equal(await has(k), true, `${k} kept`);
  assert.deepEqual(await store.listIds("proposals"), []);
  assert.deepEqual(await store.listIds("emails"), []);
  assert.equal(r.visitsDropped, 2);
  assert.deepEqual(fs.readFileSync(path.join(vdir, "2026-10-30.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).p), ["home", "library"]);

  // Archived first, owner-only, with every record.
  const file = path.join(store.ARCHIVE(), r.archive);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).kv["proposal:p1"].status, "paid");

  // Payments are never lost: the paid donation stays on the statement, even once the archive is deleted.
  const { statement } = await import("../lib/statement.js");
  let s = await statement();
  assert.equal(s.donations.count, 1);
  store.deleteArchive(r.archive);
  s = await statement();
  assert.equal(s.donations.count, 1, "kept in the permanent ledger");

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

test("erase a person: messages anonymized with the books kept, replies and notes deleted, receipts kept", async () => {
  const { erasePerson } = await import("../lib/cleanup.js");
  await store.setJSON("contact:msg:e1", { id: "e1", at: "2026-11-01T10:00:00.000Z", paidAt: "2026-11-01T10:00:00.000Z",
    name: "Nia", email: "nia@example.com", topic: "other", label: "Other", dept: "office", sats: 1000, hash: "c".repeat(64),
    receipt: "ALT-2026-0001", handled: true, message: "Hello there." });
  await store.pushId("contact:inbox", "e1");
  await store.setJSON("reply:r1", { id: "r1", at: "2026-11-02T10:00:00.000Z", from: "nia@example.com", dept: "office", text: "Thanks!", handled: false });
  await store.pushId("reply:inbox", "r1");
  await store.setJSON("email:rcpt", { id: "rcpt", to: "nia@example.com", from: "Altradits", subject: "Receipt ALT-2026-0001: thank you", kind: "wallet", status: "logged" });
  await store.pushId("emails", "rcpt");
  await store.setJSON("email:note", { id: "note", to: "nia@example.com", from: "Altradits", subject: "Re: hello", text: "Hello there.", kind: "wallet", status: "logged" });
  await store.pushId("emails", "note");
  const r = await erasePerson("Nia@Example.COM");
  assert.deepEqual(r, { anonymized: 1, deleted: 2, kept: 1 });
  const m = await store.getJSON("contact:msg:e1");
  assert.equal(m.name, "[erased]");
  assert.equal(m.email, "");
  assert.equal(m.message, "[erased on request]");
  assert.equal(m.receipt, "ALT-2026-0001"); // the books keep the payment
  assert.equal(m.sats, 1000);
  assert.equal(await has("reply:r1"), false);
  assert.ok(!(await store.listIds("reply:inbox", 10)).includes("r1"));
  assert.equal(await has("email:rcpt"), true); // receipt email kept for the books
  assert.equal(await has("email:note"), false);
  assert.ok(!(await store.listIds("emails", 10)).includes("note"));
});

test("erase a person: bad address rejected, wallet owners refused", async () => {
  const { erasePerson } = await import("../lib/cleanup.js");
  await assert.rejects(() => erasePerson("not-an-email"), /email address/);
  await store.setJSON("yw:w9", { id: "w9", handle: "nia9", email: "nia@example.com", balance: 0 });
  await assert.rejects(() => erasePerson("nia@example.com"), /wallet/);
  assert.equal((await store.getJSON("contact:msg:e1")).receipt, "ALT-2026-0001"); // nothing half-erased
});
