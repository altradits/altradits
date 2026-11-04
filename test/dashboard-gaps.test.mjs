// Dashboard gaps: backup freshness, node banner, peer-offline, earnings trend, alert history.
// Run: node --test test/dashboard-gaps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-gaps-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
const src = fs.readFileSync(path.join(ROOT, "assets/admin.js"), "utf8");
const page = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");

const { compareBackupPoints, markBackup, backupStatus } = await import(path.join(ROOT, "lib/scb.js"));
const { bucketForwardingFees } = await import(path.join(ROOT, "lib/lightning.js"));

// Run the shipped dashboard renderers against fixtures (same pattern as pnl-display.test.mjs).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const ago = (iso) => "some time ago";
function shipped(name, params, helpers = {}) {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`// end ${name}`);
  assert.ok(start > 0 && end > start, `${name} is shipped in assets/admin.js`);
  const hkeys = Object.keys(helpers);
  return (...args) => new Function(...params, ...hkeys, `${src.slice(start, end)}\nreturn ${name}(${params.join(",")});`)(...args, ...hkeys.map((k) => helpers[k]));
}

test("backup: opens and closes since the marked copy make it stale", async () => {
  assert.deepEqual(compareBackupPoints(["a:0"], ["a:0", "b:1"]), { opened: ["b:1"], closed: [] });
  assert.deepEqual(compareBackupPoints(["a:0", "c:2"], ["a:0"]), { opened: [], closed: ["c:2"] });
  await markBackup(["a:0"]);
  let s = await backupStatus(["a:0"]);
  assert.equal(s.stale, false);
  assert.equal(s.current, 1);
  s = await backupStatus(["a:0", "b:1"]);
  assert.equal(s.stale, true);
  assert.deepEqual(s.opened, ["b:1"]);
});

test("backup panel states: unknown, unmarked, stale, fresh", () => {
  const backupHtml = shipped("backupHtml", ["B"], { esc, ago, num });
  assert.match(backupHtml(null), /no copy was ever marked/);
  assert.match(backupHtml({ markedAt: null, nodeRead: true }), /No copy marked yet/);
  const stale = backupHtml({ markedAt: "2026-11-01T00:00:00Z", stale: true, opened: ["b:1"], closed: [], current: 2 });
  assert.match(stale, /Stale/);
  assert.match(stale, /1 opened/);
  assert.match(backupHtml({ markedAt: "2026-11-01T00:00:00Z", stale: false, opened: [], closed: [], current: 1 }), /Fresh/);
});

test("trend: buckets seconds, millis and nanos; skips out-of-range and bad rows", () => {
  const since = Date.parse("2026-12-01T00:00:00Z");
  const out = bucketForwardingFees([
    { timestamp: String(since / 1000 + 10), fee: 5 },
    { timestamp: String(since + 864e5), fee: 7 },
    { timestamp: String((since + 2 * 864e5) * 1e6), fee: 3 },
    { timestamp: String(since / 1000 - 10), fee: 99 },
    { timestamp: "junk", fee: 99 },
    { fee: 99 },
  ], since, 3);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { day: "2026-12-01", fees: 5, count: 1 });
  assert.deepEqual(out[1], { day: "2026-12-02", fees: 7, count: 1 });
  assert.deepEqual(out[2], { day: "2026-12-03", fees: 3, count: 1 });
});

test("trend bars render one bar per day with totals", () => {
  const trendHtml = shipped("trendHtml", ["trend"], { esc, num });
  assert.match(trendHtml(null), /could not be read/);
  const html = trendHtml([{ day: "2026-12-01", fees: 5, count: 1 }, { day: "2026-12-02", fees: 0, count: 0 }]);
  assert.equal((html.match(/title="2026-12/g) || []).length, 2);
  assert.match(html, /5 sats over 2 days/);
});

test("offline: inactive channels and peers missing from the peer list", () => {
  const offlineChannels = shipped("offlineChannels", ["channels", "peers"]);
  const chans = [
    { point: "a:0", alias: "Up", active: true, pubkey: "p1" },
    { point: "b:1", alias: "Down", active: true, pubkey: "p2" },
    { point: "c:2", alias: "Flagged", active: false, pubkey: "p3" },
    { point: "d:3", alias: "Legacy", active: true, pubkey: "" },
  ];
  const off = offlineChannels(chans, [{ pubkey: "p1" }, { pubkey: "p3" }]);
  assert.deepEqual(off.map((c) => c.point), ["b:1", "c:2"]);
});

test("banner shows the node error; history lists alerts newest first", () => {
  const nodeBannerHtml = shipped("nodeBannerHtml", ["err"], { esc });
  assert.match(nodeBannerHtml("timeout"), /timeout/);
  assert.match(nodeBannerHtml("timeout"), /stale or missing/);
  const stanHistoryHtml = shipped("stanHistoryHtml", ["alerts"], { esc, ago });
  assert.match(stanHistoryHtml([]), /No alerts/);
  const html = stanHistoryHtml([
    { at: "2026-11-02T00:00:00Z", subject: "Stan: 1 thing needs you", status: "sent" },
    { at: "2026-11-01T00:00:00Z", subject: "Stan: all quiet", status: "suppressed-quiet" },
  ]);
  assert.ok(html.indexOf("needs you") < html.indexOf("all quiet"));
  assert.match(html, /Sent/);
  assert.match(html, /suppressed-quiet/);
});

test("new UI hooks exist in page and script", () => {
  for (const id of ["nodeBanner", "nodeAge", "chainAge", "pnlAge", "exAge", "hBackup", "backupBody", "backupMark", "backupErr", "pnlTrend", "stanHistory"]) {
    assert.ok(page.includes(`id="${id}"`), `admin.html has #${id}`);
  }
  for (const fn of ["nodeBannerHtml", "stanHistoryHtml", "backupHtml", "offlineChannels", "trendHtml", "renderBanner", "renderBackup", "stamp"]) {
    assert.ok(src.includes(`function ${fn}(`), `admin.js defines ${fn}`);
  }
  assert.ok(src.includes('"backup_marked"'), "mark button posts backup_marked");
});
