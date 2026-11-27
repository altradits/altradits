// New M-Pesa cash-out quotes freeze at Deadman's level 3, exactly like buys,
// while payments already on their way still settle. The doc must say so.
// Run: node --test test/deadman-cashout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const fnBody = (src, name) => {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `lib/ywallet.js: ${name} exists`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
};

test("new cash-out quotes freeze, in-flight payments still settle", () => {
  const yw = read("lib/ywallet.js");
  assert.match(fnBody(yw, "quoteMobile"), /deadmanActive\(\)/, "quoteMobile refuses new quotes during lockdown");
  assert.match(fnBody(yw, "quoteBuy"), /deadmanActive\(\)/, "quoteBuy refuses new quotes during lockdown");
  assert.doesNotMatch(fnBody(yw, "reconcileMobile"), /deadmanActive\(\)/, "reconcileMobile settles in-flight payouts during lockdown");
  assert.doesNotMatch(fnBody(yw, "finishBuy"), /deadmanActive\(\)/, "finishBuy settles in-flight buys during lockdown");
});

test("the deadman doc names cash-outs with the new-quotes-only rule", () => {
  const doc = read("docs/deadman.md");
  assert.match(doc, /M-Pesa buys\nand cash-outs \(new quotes only; payments already on their way still settle\)/, "deadman.md: the frozen list names cash-outs");
});
