// The Builder Path: one verified deliverable a day, proven only by Stanley's
// own public GitHub activity. GitHub is mocked here, never the real API.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-builder-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];

const t = await import("../lib/tracker.js");
const bp = await import("../data/builder-path.js");

// Wednesday 2026-11-18, 09:00 UTC: noon in Nairobi, so today is 2026-11-18.
const NOW = Date.parse("2026-11-18T09:00:00Z");
const item = (repo, number, title, extra = {}) => ({ repository_url: `https://api.github.com/repos/${repo}`, number, title,
  html_url: `https://github.com/${repo}/pull/${number}`, created_at: "2026-11-09T12:00:00Z", state: "open", pull_request: {}, ...extra });
const commit = (date, login = "altradits") => ({ author: login ? { login } : null, commit: { author: { date } } });

const tree = [
  "days/2026-11-06.md", "days/2026-11-07.md", "days/2026-11-09.md", "days/2026-11-10.md",
  "days/2026-11-13.md", "days/2026-11-14.md", "days/2026-11-16.md",
].map((p) => ({ path: p, type: "blob" }));
const commits = [
  commit("2026-11-06T10:00:00Z"), commit("2026-11-07T08:00:00Z"), commit("2026-11-09T09:00:00Z"),
  commit("2026-11-10T20:59:00Z"), // 23:59 in Nairobi: still 2026-11-10
  commit("2026-11-11T09:00:00Z"), // no log file: proves nothing
  commit("2026-11-14T09:00:00Z"), commit("2026-11-16T09:00:00Z"),
  commit("2026-11-16T12:00:00Z", "someone-else"), // another author: ignored
  commit("2026-11-16T13:00:00Z", null), // unlinked author: ignored
];

t.setGitHubFetcher(async (p) => {
  if (p.startsWith("/users/")) return [];
  if (p.includes("/git/trees/")) return { truncated: false, tree };
  if (p.includes("/builder-log/commits")) return commits;
  if (p.includes("/pulls/200/reviews")) return [{ user: { login: "altradits" },
    submitted_at: "2026-11-13T14:00:00Z", html_url: "https://github.com/lightningnetwork/lnd/pull/200#pullrequestreview-1" }];
  if (p.includes("/issues/200/comments")) return [];
  if (p.includes("/issues/300/comments")) return [{ user: { login: "altradits" },
    created_at: "2026-11-12T10:00:00Z", html_url: "https://github.com/lightningnetwork/lnd/issues/300#issuecomment-1" }];
  if (p.startsWith("/repos/")) return { private: false, visibility: "public" };
  const q = decodeURIComponent(p.split("q=")[1]);
  if (q.startsWith("author:altradits type:pr")) return { items: [
    item("lightningnetwork/lnd", 100, "fix a typo", { created_at: "2026-11-17T10:00:00Z" }),
    item("minmoto/payment-channels", 52, "Telebirr", { created_at: "2026-11-05T10:00:00Z", state: "closed", pull_request: { merged_at: "2026-11-16T08:00:00Z" } }),
  ] };
  if (q.startsWith("author:altradits type:issue")) return { items: [
    { repository_url: "https://api.github.com/repos/lightningnetwork/lnd", number: 400, title: "a bug",
      html_url: "https://github.com/lightningnetwork/lnd/issues/400", created_at: "2026-11-09T12:00:00Z", state: "open" },
  ] };
  if (q.startsWith("reviewed-by:")) return { items: [item("lightningnetwork/lnd", 200, "someone's change", { created_at: "2026-10-01T00:00:00Z" })] };
  if (q.startsWith("commenter:")) return { items: [
    item("lightningnetwork/lnd", 200, "someone's change", { created_at: "2026-10-01T00:00:00Z" }),
    { repository_url: "https://api.github.com/repos/lightningnetwork/lnd", number: 300, title: "a discussion",
      html_url: "https://github.com/lightningnetwork/lnd/issues/300", created_at: "2026-10-02T00:00:00Z", state: "open" },
    { repository_url: "https://api.github.com/repos/nokia-steward/ntt", number: 629, title: "elsewhere",
      html_url: "https://github.com/nokia-steward/ntt/issues/629", created_at: "2026-10-03T00:00:00Z", state: "open" },
  ] };
  return { items: [] };
});

const verdict = (b, date) => b.calendar.find((c) => c.date === date);

test("log days: the dated file plus a commit on that Nairobi day, neither alone", async () => {
  const b = (await t.computeTracker(NOW)).builder;
  assert.equal(b.repoState, "ready");
  assert.deepEqual([verdict(b, "2026-11-06").status, verdict(b, "2026-11-06").provedAs], ["done", "log"]);
  assert.equal(verdict(b, "2026-11-06").proof.url, "https://github.com/altradits/builder-log/blob/HEAD/days/2026-11-06.md");
  assert.equal(verdict(b, "2026-11-07").status, "done");
  assert.equal(verdict(b, "2026-11-11").status, "missed", "a commit without the dated file proves nothing");
  assert.equal(verdict(b, "2026-11-12").status, "missed", "nothing at all");
  assert.equal(b.today, "2026-11-18", "Nairobi day, not UTC");
});

test("the Nairobi boundary: 23:59 EAT counts for that day", async () => {
  assert.equal(t.nairobiDay("2026-11-10T20:59:00Z"), "2026-11-10");
  assert.equal(t.nairobiDay("2026-11-10T21:01:00Z"), "2026-11-11");
  assert.equal(t.nairobiDay("not a date"), null);
  const b = (await t.computeTracker(NOW)).builder;
  assert.equal(verdict(b, "2026-11-10").status, "done", "committed 23:59 Nairobi time");
});

test("upstream days: review, issue, pr and merged each prove their day", async () => {
  const b = (await t.computeTracker(NOW)).builder;
  assert.deepEqual([verdict(b, "2026-11-13").status, verdict(b, "2026-11-13").provedAs], ["done", "review"]);
  assert.equal(verdict(b, "2026-11-13").proof.url, "https://github.com/lightningnetwork/lnd/pull/200#pullrequestreview-1");
  assert.deepEqual([verdict(b, "2026-11-09").status, verdict(b, "2026-11-09").provedAs], ["done", "issue"]);
  assert.deepEqual([verdict(b, "2026-11-17").status, verdict(b, "2026-11-17").provedAs], ["done", "pr"]);
  assert.deepEqual([verdict(b, "2026-11-16").status, verdict(b, "2026-11-16").provedAs], ["done", "merged"]);
});

test("real upstream work is never punished: stronger evidence satisfies a weaker day", async () => {
  const b = (await t.computeTracker(NOW)).builder;
  // 2026-11-13 is a log day with the file but no commit: the review still passes it.
  assert.equal(bp.dayAt("2026-11-13").type, "log");
  assert.equal(verdict(b, "2026-11-13").status, "done");
  // 2026-11-16 is a log day with both file and commit: the merge wins as proof.
  assert.equal(verdict(b, "2026-11-16").provedAs, "merged");
});

test("issue comments and untracked repos never satisfy a review day", async () => {
  const b = (await t.computeTracker(NOW)).builder;
  assert.equal(verdict(b, "2026-11-12").status, "missed", "an issue comment is not pull request review");
  assert.equal(b.reviews.all, 1, "only the pull request review counts");
  assert.equal(b.reviews.week, 1);
  assert.equal(b.reviews.links[0].url, "https://github.com/lightningnetwork/lnd/pull/200#pullrequestreview-1");
});

test("rest days need no proof; the streak skips them and today never ends it", async () => {
  const b = (await t.computeTracker(NOW)).builder;
  assert.equal(verdict(b, "2026-11-08").status, "rest");
  assert.equal(verdict(b, "2026-11-15").status, "rest");
  assert.equal(verdict(b, "2026-11-18").status, "open", "today has no evidence yet but is not missed");
  assert.equal(b.streak, 4, "Nov 13, 14, 16, 17: the rest day keeps it, Nov 12 ends it");
  assert.deepEqual(b.yesterday, { date: "2026-11-17", title: bp.dayAt("2026-11-17").title, verdict: "done",
    proof: { title: "fix a typo", url: "https://github.com/lightningnetwork/lnd/pull/100" } });
});

test("today's deliverable, the phase and the distance to the Btrust bar", async () => {
  const b = (await t.computeTracker(NOW)).builder;
  assert.equal(b.deliverable.title, "Mastering Bitcoin 2: how it works");
  assert.ok(b.deliverable.what.length > 20 && b.deliverable.resources.length > 0 && b.deliverable.verify.includes("2026-11-18"));
  assert.equal(b.phase.name, "Foundations");
  assert.ok(b.phase.goal.length > 0 && b.phase.exit.length > 0);
  assert.deepEqual(b.bar, { merged: 0, need: 5, listing: "https://btrust.homerun.co/starter-grants/en",
    project: "lightningnetwork/lnd", short: "LND" }, "past-work merges never move the focus bar");
  assert.equal(b.dayNo, 13);
  assert.equal(b.first.title, "Create the learning repo");
});

test("a merged pull request on the focus project moves the Btrust bar", async () => {
  t.setGitHubFetcher(async (p) => {
    if (p.startsWith("/users/")) return [];
    if (p.startsWith("/repos/")) return { private: false, visibility: "public" };
    const q = decodeURIComponent(p.split("q=")[1] || "");
    if (q.startsWith("author:altradits type:pr")) return { items: [
      item("lightningnetwork/lnd", 101, "an lnd fix", { created_at: "2026-11-16T10:00:00Z", state: "closed",
        pull_request: { merged_at: "2026-11-17T10:00:00Z" } }),
    ] };
    return { items: [] };
  });
  const b = (await t.computeTracker(NOW)).builder;
  assert.equal(b.bar.merged, 1);
  assert.equal(b.bar.project, "lightningnetwork/lnd");
});

test("late work counts for the day it happened on, never the day it was due", async () => {
  t.setGitHubFetcher(async (p) => {
    if (p.startsWith("/users/")) return [];
    if (p.includes("/git/trees/")) return { truncated: false, tree: [{ path: "days/2026-11-18.md", type: "blob" }, { path: "days/2026-11-19.md", type: "blob" }] };
    if (p.includes("/builder-log/commits")) return [commit("2026-11-19T10:00:00Z")];
    if (p.includes("/pulls/200/reviews")) return [{ user: { login: "altradits" },
      submitted_at: "2026-11-19T15:00:00Z", html_url: "https://github.com/lightningnetwork/lnd/pull/200#pullrequestreview-2" }];
    if (p.startsWith("/repos/")) return { private: false, visibility: "public" };
    const q = decodeURIComponent(p.split("q=")[1] || "");
    if (q.startsWith("reviewed-by:")) return { items: [item("lightningnetwork/lnd", 200, "someone's change", { created_at: "2026-10-01T00:00:00Z" })] };
    return { items: [] };
  });
  const b = (await t.computeTracker(Date.parse("2026-11-20T09:00:00Z"))).builder;
  assert.equal(verdict(b, "2026-11-18").status, "missed", "the file sat uncommitted on its day");
  assert.deepEqual([verdict(b, "2026-11-19").status, verdict(b, "2026-11-19").provedAs], ["done", "review"]);
  assert.equal(b.streak, 1, "only Nov 19 is done behind the open today");
});

test("a private or missing learning repo fails log days and leaks nothing", async () => {
  for (const meta of [{ private: true, visibility: "private" }, null]) {
    t.setGitHubFetcher(async (p) => {
      if (p === `/repos/${bp.LEARNING_REPO}`) return meta;
      if (p.startsWith("/users/")) return [];
      if (p.startsWith("/repos/")) return { private: false, visibility: "public" };
      return { items: [] };
    });
    const b = (await t.computeTracker(NOW)).builder;
    assert.equal(b.repoState, meta ? "private" : "missing");
    assert.equal(verdict(b, "2026-11-09").status, "missed");
    assert.ok(b.calendar.every((c) => c.proof === null), "no proof from a repo nobody can read");
    assert.doesNotMatch(JSON.stringify(b), /blob\/HEAD/, "no file links from a repo nobody can read");
  }
});

test("proof links stay on GitHub's own addresses, even if the API carries others", async () => {
  t.setGitHubFetcher(async (p) => {
    if (p.startsWith("/users/")) return [];
    if (p.includes("/pulls/200/reviews")) return [
      { user: { login: "altradits" }, submitted_at: "2026-11-13T14:00:00Z", html_url: "javascript:alert(1)" },
      { user: { login: "altradits" }, submitted_at: "2026-11-13T15:00:00Z", html_url: "https://evil.example.com/x" },
    ];
    if (p.startsWith("/repos/")) return { private: false, visibility: "public" };
    const q = decodeURIComponent(p.split("q=")[1] || "");
    if (q.startsWith("reviewed-by:")) return { items: [item("lightningnetwork/lnd", 200, "someone's change", { created_at: "2026-10-01T00:00:00Z" })] };
    return { items: [] };
  });
  const b = (await t.computeTracker(NOW)).builder;
  for (const c of b.calendar) {
    if (c.proof) assert.match(c.proof.url, /^https:\/\/github\.com\//, c.date);
  }
  assert.equal(verdict(b, "2026-11-13").proof.url, "https://github.com/lightningnetwork/lnd/pull/200");
});

test("nothing is tickable by hand: the API takes no input that changes a verdict", async () => {
  t.setGitHubFetcher(async (p) => {
    if (p.startsWith("/users/")) return [];
    if (p.startsWith("/repos/")) return { private: false, visibility: "public" };
    return { items: [] };
  });
  const api = await import("../api/tracker.js");
  assert.deepEqual(Object.keys(api), ["GET"], "no POST, no PUT, nothing that writes");
  const req = (url) => new Request(url, { headers: { "x-remote-addr": "127.0.0.1" } });
  const plain = await api.GET(req("https://altradits.com/api/tracker")).then((r) => r.json());
  const evil = await api.GET(req("https://altradits.com/api/tracker?date=2026-11-09&status=done&streak=100")).then((r) => r.json());
  assert.deepEqual(evil.builder.calendar, plain.builder.calendar);
  assert.equal(evil.builder.streak, plain.builder.streak);
});

test("the curriculum covers every day to the application window with one deliverable each", () => {
  const days = bp.DAYS;
  const seen = new Set(days.map((d) => d.date));
  let n = 0;
  for (let d = bp.START; d <= bp.END; d = new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)) {
    n++;
    assert.ok(seen.has(d), `every day has its deliverable: ${d}`);
  }
  assert.equal(days.length, n, "exactly one deliverable per day");
  assert.equal(new Set(days.map((d) => d.date)).size, n);
  for (const d of days) {
    assert.ok(d.title && d.what && d.verify, d.date);
    assert.ok(["log", "review", "issue", "pr", "merged", "rest"].includes(d.type), d.date);
    assert.ok(d.resources.length > 0, d.date);
    for (const r of d.resources) assert.match(r.url, /^https:\/\//, `${d.date}: ${r.label}`);
    const sunday = new Date(`${d.date}T12:00:00Z`).getUTCDay() === 0;
    assert.equal(d.type === "rest", sunday, `${d.date}: only Sundays rest`);
    assert.equal(d.phase, bp.phaseAt(d.date).id, d.date);
  }
  assert.doesNotMatch(JSON.stringify(days), /—/, "no em-dashes in the curriculum");
  // A review action every week once Phase 1 starts.
  for (const p of bp.PHASES.filter((p) => p.id >= 1)) {
    const inPhase = days.filter((d) => d.date >= p.start && d.date <= p.end);
    for (let i = 0; i < inPhase.length; i += 7) {
      const week = inPhase.slice(i, i + 7);
      assert.ok(week.some((d) => d.type === "review"), `a review day in the week of ${week[0].date}`);
    }
  }
  assert.equal(bp.dayAt("2026-11-05"), null, "before the start");
  assert.equal(bp.dayAt("2027-07-01"), null, "after the end");
  assert.equal(bp.LEARNING_REPO, "altradits/builder-log");
});

test("the morning report carries the day, yesterday's verdict and the reviews", async () => {
  const { stanReportText } = await import("../lib/stan.js");
  const s = { node: null, lesson: "test lesson",
    openSource: { next: { name: "LND", step: { title: "Review" }, challenge: "Review one.", guide: "https://example.com/g" },
      steps: 0, of: 24, streak: 0,
      builder: { start: bp.START, end: bp.END, dayNo: 13, of: bp.DAYS.length, phase: "Foundations",
        title: "Mastering Bitcoin 2: how it works", verify: "Proven by days/2026-11-18.md.",
        yesterday: { date: "2026-11-17", title: "GitHub: issues", verdict: "done",
          proof: { title: "fix a typo", url: "https://github.com/lightningnetwork/lnd/pull/100" } },
        streak: 4, weekReviews: 1, done: 9, missed: 2 } } };
  const r = stanReportText(s, NOW);
  assert.match(r.text, /Builder Path day 13 of 237 \(Foundations\): Mastering Bitcoin 2/);
  assert.match(r.text, /Yesterday: done\. Proof: fix a typo https:\/\/github\.com\/lightningnetwork\/lnd\/pull\/100/);
  assert.match(r.text, /Builder streak: 4 days\. Reviews this week: 1\./);
  const missed = stanReportText({ ...s, openSource: { ...s.openSource,
    builder: { ...s.openSource.builder, yesterday: { date: "2026-11-17", title: "GitHub: issues", verdict: "missed", proof: null } } } }, NOW);
  assert.match(missed.text, /Yesterday: missed \(GitHub: issues\)\. No proof found on GitHub\./);
});
