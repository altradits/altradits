// Journey: genesis firsts from the chain and the reviewer ladder position.
// Run: node --test test/journey.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEW_RANKS } from "../data/journey.js";
import { buildJourney } from "../lib/tracker.js";

test("ranks ascend from zero with plain titles", () => {
  assert.ok(REVIEW_RANKS.length > 1);
  assert.equal(REVIEW_RANKS[0].at, 0);
  for (const r of REVIEW_RANKS) {
    assert.equal(typeof r.at, "number");
    assert.ok(r.title.length > 0 && r.text.length > 0);
  }
  const ats = REVIEW_RANKS.map((r) => r.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
});

test("firsts pick the oldest block of each kind; gaps stay null", () => {
  const b = (kind, status, at) => ({ kind, status, repo: "x/y", number: 1, title: "t", url: "u", at });
  const j = buildJourney([
    b("review", "mined", "2026-11-26T00:00:00Z"),
    b("pr", "confirmed", "2026-11-20T00:00:00Z"),
    b("review", "mined", "2026-11-25T00:00:00Z"),
  ], 3);
  assert.equal(j.genesis.at, "2026-11-20T00:00:00Z");
  assert.equal(j.firstReview.at, "2026-11-25T00:00:00Z");
  assert.equal(j.firstIssue, null);
  assert.equal(j.firstPr.at, "2026-11-20T00:00:00Z");
  assert.equal(j.firstMerge.at, "2026-11-20T00:00:00Z");
});

test("rank follows the review count with the next rung to go", () => {
  const j = buildJourney([], 13);
  assert.equal(j.rank.title, "Trusted reviewer");
  assert.equal(j.rank.next.title, "Review pillar");
  assert.equal(j.rank.next.toGo, 12);
  assert.equal(buildJourney([], 0).rank.title, "Curious");
  assert.equal(buildJourney([], 99).rank.next, null);
});
