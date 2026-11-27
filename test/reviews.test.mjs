// Review log: curated test facts stay valid, and the live GitHub join maps
// each entry to merged/open/closed without new API calls.
// Run: node --test test/reviews.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEWS } from "../data/reviews.js";
import { buildReviews } from "../lib/tracker.js";

test("every review entry is complete and links to GitHub", () => {
  assert.ok(REVIEWS.length > 0, "the log is backfilled");
  for (const r of REVIEWS) {
    assert.match(r.repo, /^[\w-]+\/[\w.-]+$/, "owner/name");
    assert.equal(typeof r.number, "number");
    assert.ok(r.number > 0);
    assert.ok(["review", "research"].includes(r.kind));
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, "Nairobi day");
    assert.ok(r.title.length > 0);
    assert.ok(r.claim.length > 0, "the claim under test");
    assert.match(r.author, /^[\w-]+$/, "idea owner's login");
    assert.ok(r.pain.length > 0, "the pain point");
    assert.ok(r.before.length > 0 && r.after.length > 0, "before and after merge");
    assert.ok(r.followup === null || r.followup.length > 0, "followup or null");
    assert.ok(r.mergedBy === null || /^[\w-]+$/.test(r.mergedBy), "merger login or null");
    assert.ok(Array.isArray(r.ran) && r.ran.length > 0, "at least one run");
    for (const t of r.ran) {
      assert.ok(t.run.length > 0 && t.saw.length > 0, "run and saw");
      assert.ok(t.why.length > 0, "why this command");
    }
    assert.ok(r.lesson.length > 0, "one lesson");
    assert.match(r.comment, /^https:\/\/github\.com\//, "proof link");
    if (r.kind === "review") assert.match(r.commit, /^[0-9a-f]{7,40}$/, "tested commit");
  }
});

test("live state joins by repo and number; newest first", () => {
  const row = (repo, number, extra = {}) => ({ repo, number, ...extra });
  const out = buildReviews({
    reviewed: [row("lightningnetwork/lnd", 11429, { merged: true, mergedAt: "2026-11-27T00:00:00Z", open: false })],
    commented: [row("minmoto/payment-channels", 56, { merged: false, open: true })],
    issues: [],
  });
  const first = out.filter((r) => r.number === 11429);
  assert.equal(first.length, 2, "both 11429 entries join");
  assert.ok(first.every((r) => r.status === "merged" && r.mergedAt === "2026-11-27T00:00:00Z"));
  assert.equal(out.find((r) => r.number === 56).status, "open");
  assert.equal(out.find((r) => r.number === 11591).status, "unknown", "absent rows stay unknown");
  assert.deepEqual(out.map((r) => r.date), [...out.map((r) => r.date)].sort().reverse(), "newest first");
  assert.ok(out.every((r) => Array.isArray(r.ran) && r.comment), "facts survive the join");
});
