// The Overview cockpit (#519): Ye₿ente per Kenyan day for the last 30 days,
// and the 30 days before for the change. Counts and sums only.
// Run: node --test test/admin-cockpit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-cockpit-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
const store = await import("../lib/store.js");
const { cockpitSeries } = await import("../lib/activity.js");

test("per-day series, the 30 days before, active wallets, failed sends, nothing private", async () => {
  // 20:00 UTC is 23:00 in Kenya: still 15 Nov there.
  const now = Date.parse("2026-11-15T20:00:00Z"), day = 864e5, at = (d, h = 0) => new Date(now - d * day + h * 3600e3).toISOString();
  const wallet = async (id, handle, made, balance) => { await store.setJSON(`yw:${id}`, { id, handle, email: `${handle}@example.com`, balance, createdAt: at(made) }); await store.pushId("ywallets", id); };
  let n = 0;
  const entry = async (w, kind, sats, d, status = "completed", h = 0) => { const id = `c${++n}`; await store.setJSON(`ywe:${id}`, { id, walletId: w, kind, sats, status, at: at(d, h) }); await store.pushId(`ywtx:${w}`, id); };
  await wallet("a", "amina", 2, 4000); await wallet("b", "brian", 40, 1000); await wallet("c", "old", 300, 0);
  await entry("a", "receive", 5000, 0); await entry("a", "send", -1000, 0); await entry("a", "send", -700, 1, "failed");
  await entry("b", "buy", 2000, 35); await entry("b", "transfer_out", -100, 3);
  await entry("c", "receive", 999, 120); // long before both periods
  await entry("a", "receive", 1, 0, "completed", 1); // 00:00 EAT on 16 Nov: not yet, tomorrow in Kenya
  const r = await cockpitSeries({ days: 30, now });
  assert.equal(r.series.length, 30);
  assert.equal(r.series.at(-1).day, "2026-11-15", "the last day is today in Kenya");
  assert.equal(r.wallets, 3); assert.equal(r.heldSats, 5000);
  const today = r.series.at(-1);
  assert.deepEqual([today.deposits, today.depositSats, today.sends, today.sentSats, today.active], [1, 5000, 1, 1000, 1]);
  assert.equal(r.series.at(-2).failedSends, 1, "a failed send counts on its day, and never as money out");
  assert.equal(r.totals.newWallets, 1); assert.equal(r.previous.newWallets, 1, "brian joined in the 30 days before");
  assert.equal(r.totals.active, 2, "amina and brian were active");
  assert.equal(r.previous.active, 1); assert.equal(r.previous.depositSats, 2000);
  assert.equal(r.totals.transfers, 1);
  assert.ok(!JSON.stringify(r).match(/example\.com|amina|brian/), "no handles or emails");
});

test("the dashboard: the cockpit sits first on the Overview and its view is cached", () => {
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../assets/admin.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../api/admin.js", import.meta.url), "utf8");
  const pane = html.slice(html.indexOf('data-pane="overview"'));
  assert.ok(pane.indexOf('id="cockpit"') < pane.indexOf('id="hCheck"'), "the cockpit comes before the checklist");
  assert.match(api, /const CACHED = new Set\(\[[^\]]*"cockpit"/, "answered from the cached copy");
  assert.match(js, /loadCockpit\(\)/);
  for (const part of ["CK.P = P", "CK.L = L", "CK.B = B", "CK.D = D", "CK.shopsLoaded = true"]) assert.ok(js.includes(part), `the cockpit updates when ${part.split(" ")[0]} loads`);
});
