// The open-source tracker: progress read from GitHub, cached, and the day's task.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-tracker-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];

const t = await import("../lib/tracker.js");
const { TRACK, DONE } = await import("../data/tracker.js");
const now = Date.parse("2026-11-01T12:00:00Z"), day = (d) => new Date(now - d * 864e5).toISOString();
const item = (repo, title, extra = {}) => ({ repository_url: `https://api.github.com/repos/${repo}`, title, html_url: `https://github.com/${repo}/pull/1`, created_at: day(1), state: "open", ...extra });
let calls = 0, fail = false;
t.setGitHubFetcher(async (p) => {
  calls++;
  if (fail) throw new Error("GitHub 403");
  if (p.startsWith("/users/")) return [
    { type: "PullRequestReviewEvent", repo: { name: "bitcoin/bitcoin" }, created_at: day(0) },
    { type: "IssueCommentEvent", repo: { name: "bitcoin/bitcoin" }, created_at: day(1) },
    { type: "PushEvent", repo: { name: "altradits/altradits" }, created_at: day(2) }, // his own repo: doesn't count
    { type: "PushEvent", repo: { name: "minmoto/payment-channels" }, created_at: day(3) },
  ];
  const q = decodeURIComponent(p.split("q=")[1]);
  assert.ok(TRACK.every((x) => q.includes(`repo:${x.repo}`)) && q.includes(`repo:${DONE[0].repo}`), "every project in one search");
  if (q.startsWith("author:altradits type:pr")) return { items: [item("minmoto/payment-channels", "Telebirr", { pull_request: { merged_at: day(20) } }), item("lightningnetwork/lnd", "docs: fix typo")] };
  if (q.startsWith("reviewed-by:")) return { items: [item("bitcoin/bitcoin", "net: something")] };
  if (q.startsWith("commenter:")) return { items: [item("bitcoin/bitcoin", "net: something")] }; // same PR: counted once
  return { items: [] };
});

test("steps tick from GitHub; the streak counts only tracked projects; the day's task is the least-started project", async () => {
  const r = await t.computeTracker(now);
  const core = r.projects.find((p) => p.repo === "bitcoin/bitcoin"), lnd = r.projects.find((p) => p.repo === "lightningnetwork/lnd");
  assert.deepEqual(core.steps.map((s) => [s.key, s.done, s.count]), [["review", true, 1], ["issue", false, 0], ["pr", false, 0], ["merged", false, 0]]);
  assert.equal(lnd.steps.find((s) => s.key === "pr").done, true);
  assert.equal(r.done[0].steps.find((s) => s.key === "merged").count, 1);
  assert.equal(r.totals.steps, 2);
  assert.equal(r.totals.merged, 1);
  assert.equal(r.streak, 2, "today and yesterday on Bitcoin Core");
  assert.equal(r.activeDays30, 3, "his own repository doesn't count");
  assert.ok(r.next && !["bitcoin/bitcoin", "lightningnetwork/lnd"].includes(r.next.repo), "a project with nothing done yet");
  assert.equal(r.next.step.key, "review");
});

test("cached for 3 hours, and the last result is kept if GitHub can't be reached", async () => {
  calls = 0;
  const a = await t.tracker(now);
  const b = await t.tracker(now + 3600e3);
  assert.equal(calls, 5, "five GitHub calls, then the cache");
  assert.equal(b.updatedAt, a.updatedAt);
  fail = true;
  const c = await t.tracker(now + 4 * 3600e3);
  assert.equal(c.stale, true);
  assert.equal(c.totals.steps, a.totals.steps);
  fail = false;
});
