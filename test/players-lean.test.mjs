// Players stay lean (#644): dead rules stay out, card motion stays in,
// and all 5 sections with 30 cards survive.
// Run: node --test test/players-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(ROOT, "players.html"), "utf8");
const css = page.slice(page.indexOf("<style>"), page.indexOf("</style>"));

test("dead rules stay out of the stylesheet", () => {
  for (const dead of [
    ".ctas{",
    ".btn{",
    ".btn.ghost",
    ".tag{",
    ".sr-only{",
    "--ok",
    ".tabs",
    ".more a",
    ".foot nav",
    ".pager a",
    "details{",
  ]) {
    assert.ok(!css.includes(dead), `stylesheet carries no ${dead}`);
  }
});

test("card link motion stays inside the motion-allowed guard", () => {
  const guardAt = css.indexOf("@media (prefers-reduced-motion:no-preference)");
  assert.ok(guardAt > 0, "the motion-allowed guard is present");
  const rule = ".cards .links a{transition:color .18s ease}";
  assert.ok(css.includes(rule), "card links keep their transition");
  assert.ok(css.indexOf(rule) > guardAt, "the transition sits inside the guard");
});

test("all 5 sections with 30 cards survive", () => {
  assert.equal(page.match(/<ul class="cards">/g).length, 5, "5 card sections stay");
  assert.equal(page.match(/<li><div class="who">/g).length, 30, "all 30 cards stay");
  assert.equal(page.match(/"@type":"ListItem"/g).length, 30, "structured data keeps 30 items");
});

test("head and social tags stay put", () => {
  assert.ok(page.includes('theme-color" content="#EEF2F6"'), "theme color kept");
  assert.ok(page.includes('rel="canonical" href="https://altradits.com/players"'), "canonical kept");
  assert.ok(page.includes('property="og:title"'), "social title kept");
  assert.ok(page.includes('name="twitter:card"'), "social card kept");
});
