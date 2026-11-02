// Admin ops visibility: deployed version, backup freshness, visits, email log.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-adminops-")));
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "DATA_DIR", "LND_REST_URL"]) delete process.env[k];
process.env.ADMIN_TOKEN = "ops-test-token-long-enough-1234";

const admin = await import("../api/admin.js");
const { setJSON, pushId } = await import("../lib/store.js");
const authed = (url, opts = {}) => new Request(url, { ...opts,
  headers: { Authorization: "Bearer ops-test-token-long-enough-1234", ...(opts.headers || {}) } });

test("overview names the deployed commit, backup freshness, and visits", async () => {
  const D = await (await admin.GET(authed("http://x/api/admin"))).json();
  assert.match(D.deploy.commit, /^([0-9a-f]{12}|unknown)$/);
  assert.equal(typeof D.deploy.subject, "string");
  assert.equal(typeof D.backup.ok, "boolean");
  assert.equal(typeof D.backup.encrypted === "boolean" || D.backup.encrypted === null, true);
  assert.equal(typeof D.visits.d7, "number");
  assert.equal(typeof D.visits.d30, "number");
  assert.equal(typeof D.system.email, "string");
});

test("backup freshness reads the newest snapshot, or reports none", async () => {
  const { lastBackup, backupDir } = await import("../lib/backup.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-bk-"));
  process.env.BACKUP_DIR = dir;
  try {
    assert.equal(lastBackup().ok, false); // empty folder: nothing to restore
    fs.writeFileSync(path.join(dir, "db-2026-09-01.json.gz"), "old");
    fs.utimesSync(path.join(dir, "db-2026-09-01.json.gz"), new Date("2026-09-02"), new Date("2026-09-02"));
    assert.equal(lastBackup(Date.parse("2026-11-02T12:00:00Z")).ok, false); // stale: older than 36h
    fs.writeFileSync(path.join(dir, "db-2026-11-02.json.gz.enc"), "new");
    fs.utimesSync(path.join(dir, "db-2026-11-02.json.gz.enc"), new Date("2026-11-02T11:00:00Z"), new Date("2026-11-02T11:00:00Z"));
    const fresh = lastBackup(Date.parse("2026-11-02T12:00:00Z"));
    assert.equal(fresh.ok, true);
    assert.equal(fresh.encrypted, true);
    assert.match(fresh.file, /^db-2026-11-02/);
    assert.equal(backupDir(), dir);
  } finally { delete process.env.BACKUP_DIR; }
});

test("email log lists sends with their status, never the body", async () => {
  await setJSON("email:e1", { id: "e1", to: "owner@example.com", subject: "Morning report", text: "secret-body", at: new Date().toISOString(), status: "sent" });
  await pushId("emails", "e1");
  const E = await (await admin.GET(authed("http://x/api/admin?view=emails"))).json();
  assert.equal(E.emails.length, 1);
  assert.equal(E.emails[0].status, "sent");
  assert.equal(E.emails[0].text, undefined);
});
