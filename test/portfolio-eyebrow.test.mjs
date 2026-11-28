// Portfolio eyebrow: the hero label reads as quiet text, not a button.
// "Built in Kisumu, open to try today" is dead text; a bordered pill made
// it look tappable. It keeps its words without background, padding,
// radius or border.
// Run: node --test test/portfolio-eyebrow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "portfolio.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const brow = (css.match(/\.eyebrow\{[^}]*\}/) || [""])[0];

test("eyebrow carries no button chrome", () => {
  assert.ok(brow, "portfolio.html: .eyebrow rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:", "inline-flex"]) {
    assert.ok(!brow.includes(chrome), `no ${chrome} on .eyebrow`);
  }
  assert.ok(brow.includes("text-transform:uppercase"), "quiet kicker voice kept");
});

test("eyebrow keeps its words above the h1", () => {
  assert.ok(html.includes('<p class="eyebrow">Built in Kisumu · Open to try today</p>'), "words kept");
  assert.ok(html.indexOf('class="eyebrow"') < html.indexOf("<h1>"), "label still introduces the hero");
});
