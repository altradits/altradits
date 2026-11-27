// Plan checklist: every verdict mark is spoken and explained. The ✓/◐
// glyphs alone tell assistive tech nothing, and no key says what they
// mean. Each glyph hides from assistive tech, speaks its verdict, and a
// one-line key above the list explains both marks.
// Run: node --test test/plan-checklist.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "plan.html"), "utf8");

test("the key above the list explains both marks", () => {
  const at = html.indexOf("The funder's checklist, answered</h2>");
  const key = html.indexOf("✓ means yes. ◐ means partial.", at);
  const list = html.indexOf('<ul class="check">', at);
  assert.ok(key > at && key < list, "plan.html: the key sits between the heading and the list");
});

test("every mark hides its glyph and speaks its verdict", () => {
  const yes = [...html.matchAll(/<span class="m y" aria-hidden="true">✓<\/span><span class="sr-only">Yes\.<\/span>/g)];
  const partial = [...html.matchAll(/<span class="m p" aria-hidden="true">◐<\/span><span class="sr-only">Partial\.<\/span>/g)];
  assert.equal(yes.length, 5, "plan.html: five spoken yes marks");
  assert.equal(partial.length, 2, "plan.html: two spoken partial marks");
  assert.doesNotMatch(html, /<span class="m [yp]">[✓◐]/, "plan.html: no bare mark remains");
});
