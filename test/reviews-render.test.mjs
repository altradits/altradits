// Review list rendering: newest five first, the rest behind Show every
// review, deep links expand the list, terminals mount on every paint.
// Run: node --test test/reviews-render.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");

test("five first, the rest behind a button, hash links expand", () => {
  assert.match(html, /id="moreReviews" hidden/);
  assert.match(html, /paintReviews\(T\.reviews\.slice\(0, 5\)\)/);
  assert.match(html, /location\.hash\.startsWith\("#review-"\)/);
  assert.match(html, /scrollIntoView/);
});

test("terminals mount after every paint, never twice", () => {
  assert.match(html, /const mountAll = \(\) =>/);
  assert.ok(html.indexOf("const mountAll = () =>") < html.indexOf("const expandReviews = () =>"), "mountAll is initialized before expandReviews can run on a hash deep-link");
  assert.match(html, /getElementById\(location\.hash\.slice\(1\)\)/, "hash lookup uses getElementById instead of querySelector");
  assert.match(html, /querySelector\(`\[data-pract="\$\{t\._k\}"\]:empty`\)/);
  assert.match(html, /expandReviews = \(\) => \{ paintReviews\(T\.reviews\); mountAll\(\);/);
});

test("api failure leaves a message in every live section", () => {
  const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");
  assert.match(html, /\["reviews", "billboard", "journey", "remembered"\]/);
});
