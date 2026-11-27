// Merchant licensing lean pass (#646): dead script and CSS removed,
// questions lifted to h2 with identical text.
// Run: node --test test/merchant-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync(path.join(process.cwd(), "merchant-licensing.html"), "utf8");

test("dead copy script is gone", () => {
  assert.ok(!html.includes("copycredit"), "no copycredit reference");
  assert.ok(!html.includes("Copy credit line"), "no copy-credit strings");
  assert.ok(html.includes('classList.toggle("scrolled"'), "scroll shadow kept");
});

test("dead CSS rules are gone", () => {
  for (const rule of [".ctas{", ".btn{", ".btn.ghost", ".cards{", ".cards>li", ".tag{",
    ".sr-only{", ".sm{", ".proof{", ".months{", ".check{", "ul.proof", "ol.check",
    "pre{background", "p code", "table{", "th,td", "button{", "button:hover",
    "details{border-bottom", "summary{font-weight", ".intro{", "a[aria-current]",
    "h3{font:800", ".tabs", ".more a", ".foot nav", ".pager a",
    "details::details-content", "--ok:", ".noprint"]) {
    assert.ok(!html.includes(rule), `dead rule gone: ${rule}`);
  }
});

test("motion line keeps only live selectors, note and headline tightened", () => {
  assert.ok(html.includes("@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}.top{transition:box-shadow .25s ease}body.scrolled .top{box-shadow:0 8px 22px -12px rgba(15,27,45,.45)}.topnav a{transition:background-color .18s ease,color .18s ease,box-shadow .18s ease}}"), "trimmed motion line kept");
  assert.ok(html.includes(".note p{margin:0}"), "note paragraph margins reset");
  assert.ok(html.includes("max-width:46rem;text-wrap:balance}"), "headline balanced");
});

test("one h2 rule styles the three headings", () => {
  assert.equal([...html.matchAll(/^h2\{/gm)].length, 1, "single h2 rule");
  assert.equal([...html.matchAll(/<h2/g)].length, 3, "three h2 headings");
  assert.equal([...html.matchAll(/<h3/g)].length, 0, "no h3 left");
  assert.ok(html.includes("<h2>Do I need a licence to accept bitcoin at my shop?</h2>"), "question 1 text kept");
  assert.ok(html.includes("<h2>Where is this tracked?</h2>"), "question 2 text kept");
  assert.ok(html.includes("ul.links{margin:.6rem 0;padding-left:1.2rem;max-width:44rem;color:var(--muted)}"), "sources list styled");
});

test("pinned page facts still hold", () => {
  assert.ok(html.includes('"@type":"FAQPage"'), "FAQPage data kept");
  assert.ok(!html.includes("noindex"), "stays indexable");
  const nav = (html.match(/<nav class="topnav"[^>]*>[\s\S]*?<\/nav>/) || [""])[0];
  assert.equal([...nav.matchAll(/<a\b/g)].length, 5, "topnav stays 5");
  const foot = (html.match(/<footer class="sitefoot">[\s\S]*?<\/footer>/) || [""])[0];
  assert.equal([...foot.matchAll(/<a\b/g)].length, 11, "footer stays 11");
  assert.ok(!html.includes("\u2014"), "no em-dashes in copy");
});
