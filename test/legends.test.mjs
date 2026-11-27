// Legend Billboard: reviewed authors, counted from the review log, plus
// Stanley's own row. No invented stats: every number comes from logged
// reviews with live merge state.
// Run: node --test test/legends.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGENDS } from "../data/legends.js";
import { buildBillboard } from "../lib/tracker.js";

test("every legend is a linkable GitHub login", () => {
  assert.ok(LEGENDS.length > 0);
  for (const l of LEGENDS) {
    assert.match(l.login, /^[\w-]+$/);
    assert.ok(l.name === null || l.name.length > 0);
    assert.ok(["lnd", "minmo"].includes(l.project));
    assert.ok(l.x === null || /^[\w]+$/.test(l.x), "verified X handle or null");
  }
});

test("counts come from the joined log, sorted most reviewed first", () => {
  const r = (author, status, n) => ({ author, status, repo: "x/y", number: n, title: "t", comment: "c" });
  const b = buildBillboard([
    r("ziggie1984", "open", 1), r("ziggie1984", "merged", 2), r("Roasbeef", "open", 3),
  ]);
  assert.equal(b.legends[0].login, "ziggie1984");
  assert.equal(b.legends[0].reviews, 2);
  assert.equal(b.legends[0].merged, 1);
  assert.equal(b.legends[0].url, "https://github.com/ziggie1984");
  assert.deepEqual(b.you, { reviews: 3, authors: 2, merged: 1 });
  assert.ok(b.legends.every((l) => l.url.startsWith("https://github.com/")));
  const mp = b.legends.find((l) => l.login === "MPins");
  assert.equal(mp.xUrl, "https://x.com/pins_btc");
  assert.equal(b.legends.find((l) => l.login === "Roasbeef").xUrl, null);
});
