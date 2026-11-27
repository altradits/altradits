// Docs and metadata say what the product does: no till payouts the rails
// never supported, no daily cap quoted per payment, no stale pilot size.
// Run: node --test test/docs-truth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the guide promises only phone-number cash-out", () => {
  const guide = read("wallet-guide.html");
  assert.ok(guide.includes("cash out to any M-Pesa number"), "the promise names numbers");
  assert.doesNotMatch(guide, /cash out to any M-Pesa number or till/, "tills are never promised");
});

test("no public page promises till payouts", () => {
  for (const f of ["wallet-guide.html", "index.html", "friends.html"]) {
    const html = read(f);
    assert.doesNotMatch(html, /M-Pesa number or till/, `${f}: no till payout promise`);
    assert.doesNotMatch(html, /phone number or till/, `${f}: no till payout promise`);
  }
  assert.ok(read("index.html").includes("cash out to any M-Pesa number,"), "index featureList names numbers");
  assert.ok(read("friends.html").includes("Any Safaricom M-Pesa number"), "friends Tando copy names numbers");
});

test("the wallet docs quote the real buy caps", () => {
  assert.match(read("docs/yebente.md"), /10 to 5,000 KES per payment, 10,000 daily/, "per-payment and daily caps separated");
  const yw = read("lib/ywallet.js");
  assert.match(yw, /YEBENTE_BUY_MAX_KES", 5_000/, "code: per-payment buy cap defaults to 5,000 KES");
  assert.match(yw, /YEBENTE_DAILY_BUY_KES", 10_000/, "code: daily buy cap defaults to 10,000 KES");
});

test("the kTown docs carry no stale pilot size", () => {
  assert.doesNotMatch(read("docs/ktown.md"), /20 shops/, "no stale shop count");
});
