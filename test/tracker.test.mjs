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
let n = 0;
const item = (repo, title, extra = {}) => ({ repository_url: `https://api.github.com/repos/${repo}`, number: ++n, title, html_url: `https://github.com/${repo}/pull/${n}`, created_at: day(1), state: "open", pull_request: {}, ...extra });
let calls = 0, fail = false;
const review = { repository_url: "https://api.github.com/repos/bitcoin/bitcoin", number: 900, title: "net: something", html_url: "https://github.com/bitcoin/bitcoin/pull/900", created_at: day(1), state: "open", pull_request: {} };
t.setGitHubFetcher(async (p) => {
  calls++;
  if (fail) throw new Error("GitHub 403");
  if (p.startsWith("/users/")) return [
    { type: "PullRequestReviewEvent", repo: { name: "bitcoin/bitcoin" }, created_at: day(0) },
    { type: "IssueCommentEvent", repo: { name: "bitcoin/bitcoin" }, created_at: day(1) },
    { type: "PushEvent", repo: { name: "altradits/altradits" }, created_at: day(2) }, // his own repo: doesn't count
    { type: "PushEvent", repo: { name: "minmoto/payment-channels" }, created_at: day(3) },
  ];
  if (p.includes("/git/trees/")) return { truncated: false, tree: [] };
  if (p.includes("/commits")) return [];
  if (p.includes("/pulls/900/reviews")) return [{ user: { login: "altradits" }, submitted_at: day(1), html_url: "https://github.com/bitcoin/bitcoin/pull/900#pullrequestreview-1" }];
  if (p.includes("/issues/900/comments")) return [];
  if (p.startsWith("/repos/")) return { private: p.includes("private/repo"), visibility: p.includes("private/repo") ? "private" : "public" };
  const q = decodeURIComponent(p.split("q=")[1]);
  assert.match(q, /-user:altradits/, "never his own repositories");
  if (q.startsWith("author:altradits type:pr")) return { items: [
    item("minmoto/payment-channels", "Telebirr", { created_at: day(40), state: "closed", pull_request: { merged_at: day(20) } }),
    item("lightningnetwork/lnd", "docs: fix typo", { created_at: day(2) }),
    item("someone/else", "abandoned idea", { created_at: day(30), state: "closed", pull_request: { merged_at: null } }),
    item("private/repo", "secret work", { created_at: day(5), state: "closed", pull_request: { merged_at: day(4) } })] };
  if (q.startsWith("author:altradits type:issue")) return { items: [item("jamaljsr/polar", "a bug", { created_at: day(35), pull_request: undefined })] };
  if (q.startsWith("reviewed-by:")) return { items: [review] };
  if (q.startsWith("commenter:")) return { items: [review] }; // same PR: counted once
  return { items: [] };
});

test("steps tick from GitHub; the streak counts only tracked projects; the day's task is the least-started project", async () => {
  const r = await t.computeTracker(now);
  const core = r.projects.find((p) => p.repo === "bitcoin/bitcoin"), lnd = r.projects.find((p) => p.repo === "lightningnetwork/lnd");
  assert.deepEqual(core.steps.map((s) => [s.key, s.done, s.count]), [["review", true, 1], ["issue", false, 0], ["pr", false, 0], ["merged", false, 0]]);
  assert.equal(lnd.steps.find((s) => s.key === "pr").done, true);
  assert.equal(r.done[0].steps.find((s) => s.key === "merged").count, 1);
  assert.equal(r.totals.steps, 2);
  assert.equal(r.totals.merged, 1, "merged everywhere outside his own repositories");
  assert.equal(r.totals.mergedProjects, 0, "none on the six projects");
  assert.equal(r.totals.mergedPast, 1, "one in past work");
  assert.equal(r.streak, 4, "today and yesterday on Bitcoin Core, plus the authored pull request and the push");
  assert.equal(r.activeDays30, 4, "his own repository doesn't count; the authored pull request does");
  assert.equal(r.builder.started, false, "the Builder Path starts 2026-11-06, after this test's now");
  assert.equal(r.builder.repoState, "ready");
  assert.equal(r.next.repo, "lightningnetwork/lnd", "the focus project first");
  assert.equal(r.next.focus, true);
  assert.equal(r.next.step.key, "review", "its first step not yet done (it has a pull request, not a review)");
});

test("the blockchain: every contribution mines a block; merged wins the mempool; every block links to GitHub", async () => {
  const C = (await t.computeTracker(now)).chain;
  assert.equal(C.blocks, 5, "3 pull requests, 1 issue, 1 review (counted once); nothing from a private repository");
  assert.ok(!JSON.stringify(C).includes("secret work"), "private titles never published");
  assert.equal(C.height, 4);
  assert.deepEqual(C.list.map((b) => [b.height, b.kind, b.status]).reverse(), [[0, "pr", "confirmed"], [1, "issue", "mined"], [2, "pr", "orphaned"], [3, "pr", "mempool"], [4, "review", "mined"]]);
  assert.ok(C.list.every((b) => /^https:\/\/github\.com\//.test(b.url) && /^[0-9a-f]{64}$/.test(b.hash)), "clickable, with a fixed hash");
  assert.deepEqual([C.confirmed, C.mempool, C.orphaned], [1, 1, 1]);
  const [genesis, first, starter] = C.milestones;
  assert.equal(genesis.block.title, "Telebirr");
  assert.equal(first.reached, true);
  assert.equal(starter.reached, false, "five merges not reached");
  assert.equal(C.fullTime, null, "the 21M day is set by hand when it happens");
});

test("cached for 30 minutes with one shared refresh, and the last result is kept if GitHub can't be reached", async () => {
  calls = 0;
  const a = await t.tracker(now);
  const [b1, b2] = await Promise.all([t.tracker(now + 29 * 60e3), t.tracker(now + 29 * 60e3)]);
  assert.equal(b1.updatedAt, a.updatedAt);
  assert.equal(b2.updatedAt, a.updatedAt);
  assert.equal(calls, 16, "4 searches, the events, 6 repository checks, the learning repo (check, tree, commits) and the review dates, then the cache");
  fail = true;
  const c = await t.tracker(now + 31 * 60e3);
  assert.equal(c.stale, true);
  assert.equal(c.totals.steps, a.totals.steps);
  fail = false;
  const before = calls;
  await Promise.all([t.tracker(now + 40 * 60e3), t.tracker(now + 40 * 60e3), t.tracker(now + 40 * 60e3)]);
  assert.equal(calls - before, 16, "concurrent expired views share one refresh");
});

test("a cached result from older code is refreshed at once, not kept for a day", async () => {
  const store = await import("../lib/store.js");
  await store.setJSON("tracker:cache", { updatedAt: new Date(now).toISOString(), projects: [], totals: { steps: 0, of: 0, merged: 0 } }); // no version, no chain
  assert.equal(await t.trackerCached(), null, "Stan doesn't read it either");
  const r = await t.tracker(now + 60e3);
  assert.ok(r.chain && r.chain.blocks > 0, "recomputed with the chain");
});
