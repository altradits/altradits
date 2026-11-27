// Library stays lean (#637): no doubled tags, no dead CSS rules, one layout
// rule per element, and every stage anchor and read link kept.
// Run: node --test test/library-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(ROOT, "library.html"), "utf8");
const css = page.slice(page.indexOf("<style>"), page.indexOf("</style>"));

test("the hero lead carries no doubled closing tag", () => {
  assert.doesNotMatch(page, /<\/p><\/p>/, "no stray end tag");
  assert.ok(page.includes('<p class="lead">Start at step 1.'), "the lead line stays");
});

test("dead rules stay out of the stylesheet", () => {
  for (const dead of [
    ".ctas{",
    ".btn{",
    ".btn.ghost",
    ".cards{",
    ".cards>li",
    ".cards p{",
    ".cards .links",
    ".tag{",
    "h3{",
    "--ok",
    ".sr-only{",
    ".tabs",
    ".more a",
    ".foot nav",
    ".pager a",
    "details{",
  ]) {
    assert.ok(!css.includes(dead), `stylesheet carries no ${dead}`);
  }
  assert.doesNotMatch(css, /\.reads li\{[^}]*display:flex/, "one layout wins for read rows");
  assert.ok(css.includes("padding:.8rem 1rem;display:grid"), "surface and grid live in one rule");
  assert.doesNotMatch(css, /\.reads li\{display:grid/, "no split grid-only rule remains");
});

test("anchors clear the sticky header and details feel finished", () => {
  assert.ok(css.includes(".stage{scroll-margin-top:5rem}"), "stage headings land below the sticky bar");
  assert.ok(css.includes("text-wrap:balance"), "the hero heading balances");
  assert.ok(css.includes("accent-color:var(--btc-text)"), "ticks wear the brand color");
  const guardAt = css.indexOf("@media (prefers-reduced-motion:no-preference)");
  assert.ok(guardAt > 0, "the motion-allowed guard is present");
  for (const m of css.matchAll(/\.reads li:hover/g)) {
    assert.ok(m.index > guardAt, "no read-row hover escapes the guard");
  }
  assert.ok(css.includes(".reads li:hover{border-color:var(--ink)}"), "hover inks the row edge");
});

test("read links underline on hover", () => {
  assert.ok(css.includes(".reads a:hover{text-decoration:underline}"), "hover affordance kept");
});

test("every stage anchor and read link survives", () => {
  for (const id of ["money", "whitepaper", "how", "keys", "node", "privacy", "lightning", "contribute"]) {
    assert.ok(page.includes(`<section id="${id}"`), `stage #${id} stays`);
  }
  assert.equal(page.match(/<li><a href/g).length, 20, "all 20 reads stay");
});

test("head and social tags stay put", () => {
  assert.ok(page.includes('theme-color" content="#EEF2F6"'), "theme color kept");
  assert.ok(page.includes('rel="canonical" href="https://altradits.com/library"'), "canonical kept");
  assert.ok(page.includes('property="og:title"'), "social title kept");
  assert.ok(page.includes('name="twitter:card"'), "social card kept");
});
