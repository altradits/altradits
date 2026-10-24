// Lightning channel alerts and advice for the Finance tab.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-channels-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL"]) delete process.env[k];
process.env.EMAIL_APPROVAL = "off";

const { assess, addLesson, lessons, channelReport } = await import("../lib/channels.js");
const ch = (o) => ({ id: "1", peer: "02abcdef0123456789abcdef", capacity: 1_000_000, local: 200_000, remote: 800_000, active: true, reserve: 10_000, ...o });
const need = { month: 300_000, largest: 60_000, count: 5 };

test("healthy channel: no alerts; advice sized from what the website receives", () => {
  const r = assess({ channels: [ch()] }, need, { fast: 5, normal: 3, slow: 2 });
  assert.deepEqual(r.alerts, []);
  assert.equal(r.totals.inbound, 790_000); // minus the reserve
  assert.equal(r.advice.capacity, 600_000); // max(2 × month, 10 × largest, 500k), rounded up
  assert.match(r.advice.fees, /good time/);
  assert.ok(r.advice.avoid.some((x) => /Force closes/.test(x)));
});

test("alerts: low inbound, a full channel, an offline channel, no channel at all", () => {
  const full = assess({ channels: [ch({ local: 950_000, remote: 50_000 })] }, need, { fast: 40, slow: 30 });
  assert.deepEqual(full.alerts.map((a) => [a.key, a.level]), [["inbound", "critical"], ["full:1", "warning"]]); // 40k < largest payment: critical
  assert.match(full.advice.fees, /high/);
  const down = assess({ channels: [ch({ active: false })] }, need, null);
  assert.deepEqual(down.alerts.map((a) => a.key), ["offline", "down:1"]);
  assert.equal(assess({ channels: [] }, need, null).alerts[0].level, "critical");
  assert.match(assess({ channels: [], pending: [{ status: "opening" }] }, need, null).alerts[0].text, /still opening/);
});

test("lessons: the starting ones plus new ones, newest first; the report works with no node", async () => {
  await assert.rejects(addLesson("x"), /Write what happened/);
  await addLesson("Opened a 1M sat channel when fees were 2 sat/vB: cost under $1.");
  const all = await lessons();
  assert.match(all[0].text, /1M sat channel/);
  assert.ok(all.some((l) => /Magma/.test(l.text)));
  const r = await channelReport();
  assert.match(r.alerts[0].text, /Can't read the node/);
  assert.equal(r.advice.capacity, 500_000); // nothing received yet: the minimum
});
