// The admin dashboard answers fast (#519): heavy read-only views come from a
// recent copy, an older copy is answered at once while a fresh one is made,
// Refresh (?fresh=1) makes a new one, and any admin action clears the copies.
// Run: node --test test/admin-cache.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-admincache-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "RESEND_API_KEY", "SMTP_HOST"]) delete process.env[k];
Object.assign(process.env, { ADMIN_TOKEN: "cache-test-token", SITE_URL: "https://cache.test", EMAIL_APPROVAL: "off" });

const admin = await import("../api/admin.js");
const { setJSON, pushId } = await import("../lib/store.js");
const get = async (q, token = "cache-test-token") => {
  const r = await admin.GET(new Request(`https://cache.test/api/admin${q}`, { headers: { Authorization: `Bearer ${token}` } }));
  return { status: r.status, ...(await r.json()) };
};
let n = 0;
const addEmail = async () => { const id = `e${++n}`; await setJSON(`email:${id}`, { id, to: "x@cache.test", subject: `s${n}`, at: new Date().toISOString(), status: "sent" }); await pushId("emails", id); };

test("a repeat visit answers from the copy, with when it was made", async () => {
  await addEmail();
  const a = await get("?view=emails");
  assert.ok(a._at, "carries _at");
  await addEmail();
  const b = await get("?view=emails");
  assert.equal(b._at, a._at, "same copy");
  assert.equal(b.emails.length, a.emails.length, "the new record isn't in the copy yet");
});

test("Refresh (?fresh=1) makes a new copy now", async () => {
  const before = await get("?view=emails&fresh=1");
  await addEmail();
  const f = await get("?view=emails&fresh=1");
  assert.equal(f.emails.length, before.emails.length + 1);
  assert.ok(!f._stale);
});

test("an older copy is answered at once and marked stale while a fresh one is made", async () => {
  admin.setAdminCacheTimings({ fresh: 0 });
  try {
    const old = await get("?view=emails");
    await addEmail();
    const s = await get("?view=emails");
    assert.equal(s._stale, true);
    assert.equal(s.emails.length, old.emails.length, "the old copy, at once");
    await new Promise((r) => setTimeout(r, 50));
    admin.setAdminCacheTimings({ fresh: 60e3 });
    const next = await get("?view=emails");
    assert.equal(next.emails.length, old.emails.length + 1, "the background refresh landed");
  } finally { admin.setAdminCacheTimings({ fresh: 60e3 }); }
});

test("any admin action clears the copies", async () => {
  const a = await get("?view=emails");
  await addEmail();
  await admin.POST(new Request("https://cache.test/api/admin", { method: "POST", headers: { Authorization: "Bearer cache-test-token", "Content-Type": "application/json" }, body: JSON.stringify({ action: "nothing_real" }) }));
  const b = await get("?view=emails");
  assert.equal(b.emails.length, a.emails.length + 1);
});

test("the copy is never served without the admin token", async () => {
  await get("?view=emails");
  assert.equal((await admin.GET(new Request("https://cache.test/api/admin?view=emails"))).status, 401);
  assert.equal((await admin.GET(new Request("https://cache.test/api/admin?view=emails", { headers: { Authorization: "Bearer wrong" } }))).status, 401);
});

test("views that change on every read are never cached", async () => {
  const r = await get("?view=b2c");
  assert.equal(r._at, undefined);
});
