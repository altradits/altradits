// Page views counted on our own server, and the admin summary.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-visits-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR"]) delete process.env[k];

const { recordVisit, visitSummary } = await import("../lib/visits.js");
const url = (u) => new URL(u, "https://altradits.com");
const req = (ua, referer) => ({ method: "GET", headers: { "user-agent": ua, ...(referer && { referer }) } });
const settle = () => new Promise((r) => setTimeout(r, 50));

test("counts public pages with their source, never bots, admin pages or personal data", async () => {
  const ua = "Mozilla/5.0 (iPhone)";
  recordVisit(req(ua, "https://www.google.com/search"), url("/"), "/index.html");
  recordVisit(req(ua), url("/library?utm_source=LinkedIn"), "/library.html");
  recordVisit(req(ua, "https://altradits.com/"), url("/library"), "/library.html");
  recordVisit(req("Googlebot/2.1"), url("/"), "/index.html");
  recordVisit(req(ua), url("/admin"), "/admin.html");
  recordVisit({ ...req(ua), method: "HEAD" }, url("/"), "/index.html");
  await settle();

  const s = visitSummary();
  assert.equal(s.d7, 3);
  assert.deepEqual(s.byPage, { home: { d7: 1, d30: 1 }, library: { d7: 2, d30: 2 } });
  assert.deepEqual(Object.fromEntries(s.sources.map((x) => [x.source, x.views])), { "google.com": 1, linkedin: 1, direct: 1 });
  assert.equal(s.daily.length, 14);
  assert.equal(s.daily.at(-1).views, 3);

  const day = new Date().toISOString().slice(0, 10);
  const raw = fs.readFileSync(path.join(".data", "visits", `${day}.jsonl`), "utf8");
  assert.doesNotMatch(raw, /iPhone|Mozilla|\d+\.\d+\.\d+\.\d+/);
});

test("the trivia game page is counted like any public page", async () => {
  const ua = "Mozilla/5.0 (Linux; Android 10)";
  recordVisit(req(ua), url("/trivia"), "/trivia.html");
  await settle();
  const s = visitSummary();
  assert.deepEqual(s.byPage["trivia"], { d7: 1, d30: 1 });
});
