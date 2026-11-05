// Periodic job claims: exactly once per period, even when several /healthz
// pings or timers arrive together. Run: node --test test/jobs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-jobs-")));
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;

const { claimDaily, claimHourly } = await import("../lib/jobs.js");

test("one daily run per day, even when pings arrive together", async () => {
  const won = (await Promise.all([claimDaily("2026-11-05"), claimDaily("2026-11-05"), claimDaily("2026-11-05")])).filter(Boolean);
  assert.equal(won.length, 1);
  assert.equal(await claimDaily("2026-11-05"), false);
  assert.equal(await claimDaily("2026-11-06"), true);
});

test("one hourly run per hour, even when pings arrive together", async () => {
  const t = Date.UTC(2026, 10, 5, 12, 0, 0);
  const won = (await Promise.all([claimHourly(t), claimHourly(t), claimHourly(t + 1000)])).filter(Boolean);
  assert.equal(won.length, 1);
  assert.equal(await claimHourly(t + 3599e3), false);
  assert.equal(await claimHourly(t + 3600e3), true);
});
