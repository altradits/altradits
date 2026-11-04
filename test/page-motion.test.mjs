// Site motion: motion is allowed but always guarded by the visitor's settings.
// Run: node --test test/page-motion.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("no page kills all motion outright: the kill rule sits inside prefers-reduced-motion:reduce", () => {
  assert.ok(pages.length > 10, "expected the site's pages");
  for (const f of pages) {
    for (const line of read(f).split("\n")) {
      if (line.includes("animation:none!important") || line.includes("transition:none!important")) {
        assert.ok(line.includes("prefers-reduced-motion:reduce"), `${f}: blanket motion kill outside the reduce guard`);
      }
    }
  }
});

test("every page keeps smooth scrolling and eased hovers for visitors who allow motion", () => {
  for (const f of pages) {
    const html = read(f);
    assert.ok(html.includes("prefers-reduced-motion:no-preference"), `${f}: missing the motion-allowed block`);
    assert.ok(html.includes("scroll-behavior:smooth"), `${f}: missing smooth scrolling`);
    assert.ok(html.includes("transition:"), `${f}: missing eased transitions`);
  }
});

test("every page marks scrolled state so the sticky nav gains its shadow", () => {
  for (const f of pages) {
    if (f === "admin.html") continue; // its script lives in assets/admin.js
    assert.ok(read(f).includes('classList.toggle("scrolled"'), `${f}: missing the scrolled toggle`);
  }
  assert.ok(read("assets/admin.js").includes('classList.toggle("scrolled"'), "assets/admin.js: missing the scrolled toggle");
});

test("the homepage hero carries the one floating coin, and only there", () => {
  assert.ok(read("index.html").includes('class="coin"'), "index.html: missing the hero coin");
  assert.ok(read("index.html").includes("@keyframes floaty"), "index.html: missing the float animation");
  for (const f of pages) {
    if (f === "index.html") continue;
    assert.ok(!read(f).includes("@keyframes floaty"), `${f}: the float animation belongs only on the homepage`);
  }
});
