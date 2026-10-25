// Dashboard clear buttons and the daily automatic clean-up.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-cleanup-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];

const store = await import("../lib/store.js");
const { autoClean, clearGroups, cleanupView } = await import("../lib/cleanup.js");
const put = async (prefix, list, rec) => { await store.setJSON(`${prefix}:${rec.id}`, rec); if (list) await store.pushId(list, rec.id); };
const old = new Date(Date.now() - 400 * 864e5).toISOString();
const has = async (k) => (await store.getJSON(k)) != null;

test("daily clean-up removes what's past retention and never a payment, live work or the team", async () => {
  await put("lead", "leads", { id: "anon", email: "", createdAt: old, updatedAt: old });
  await put("proposal", "proposals", { id: "cart", leadId: "anon", status: "accepted", order: { name: "x" }, createdAt: old });
  await put("lead", "leads", { id: "payer", email: "jo@x.co", createdAt: old, updatedAt: old });
  await put("proposal", "proposals", { id: "paid", leadId: "payer", status: "paid", payment: { confirmedAt: old }, createdAt: old });
  await store.setJSON("portal:tok", "payer");
  await put("email", "emails", { id: "e-old", kind: "client", status: "sent", at: old });
  await put("email", "emails", { id: "e-pay", kind: "payment", status: "sent", at: old, leadId: "payer" });
  await put("email", "emails", { id: "e-wait", kind: "client", status: "awaiting approval", at: old });
  await put("approval", "approvals", { id: "a-done", status: "approved", createdAt: old, resolvedAt: old });
  await put("approval", "approvals", { id: "a-open", status: "pending", createdAt: old });
  await put("task", "tasks", { id: "t-paid", leadId: "payer", status: "done", closedAt: old });
  await put("sub", "subs", { id: "gone", unsubscribed: true, unsubscribedAt: old });
  await put("sub", "subs", { id: "reader", unsubscribed: false, createdAt: old });
  await store.setJSON("coupon:HUNT-OLD", { code: "HUNT-OLD", status: "active", expiresAt: old });
  await store.setJSON("coupon:HUNT-NEW", { code: "HUNT-NEW", status: "active", expiresAt: new Date(Date.now() + 864e5).toISOString() });
  await store.setJSON("member:m1", { id: "m1" }); await store.setJSON("finance:seq", 7); await store.setJSON("mkt:settings", { paused: false });
  await store.hit("rl:test", 1);
  const r = await autoClean(Date.now() + 5000);
  for (const k of ["proposal:cart", "lead:anon", "email:e-old", "approval:a-done", "sub:gone", "coupon:HUNT-OLD"]) assert.equal(await has(k), false, `${k} removed`);
  for (const k of ["proposal:paid", "lead:payer", "portal:tok", "email:e-pay", "email:e-wait", "approval:a-open", "task:t-paid", "sub:reader", "coupon:HUNT-NEW", "member:m1", "finance:seq", "mkt:settings"]) assert.equal(await has(k), true, `${k} kept`);
  assert.deepEqual(await store.listIds("proposals"), ["paid"]);
  assert.deepEqual(new Set(await store.listIds("emails")), new Set(["e-pay", "e-wait"]));
  assert.equal(r.counts.counters, 1);
  assert.equal(r.counts.checkouts, 2);
  assert.equal(r.removed, 7);
  const view = await cleanupView();
  assert.equal(view.last.removed, r.removed);
  assert.ok(view.retention.some((x) => x.id === "emails" && x.days === 90));
});

test("a dashboard's clear button: only its own records, minus anything protected", async () => {
  await put("sub", "subs", { id: "s2", unsubscribed: false });
  const r = await clearGroups(["subscribers"], { keep: false });
  assert.equal(r.cleared, 2); // reader and s2
  assert.equal((await store.listIds("subs")).length, 0);
  assert.equal(await has("lead:payer"), true); // other dashboards untouched
  const t = await clearGroups(["tasks"]);
  assert.equal(t.cleared, 0); // the paid client's task is kept
  assert.equal(t.kept, 1);
  await assert.rejects(clearGroups(["members"]), /Choose/); // the team can't be cleared
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
