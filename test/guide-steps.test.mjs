// Guide steps: step labels read as quiet kickers, not buttons.
// "Step 1" and its siblings are dead text; dark pills made them look
// tappable. They keep their words and order, without background,
// padding or radius.
// Run: node --test test/guide-steps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "wallet-guide.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const badge = (css.match(/\.stepframe \.badge\{[^}]*\}/) || [""])[0];

test("step labels carry no button chrome", () => {
  assert.ok(badge, "wallet-guide.html: .badge rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!badge.includes(chrome), `no ${chrome} on .badge`);
  }
  assert.ok(badge.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(badge.includes("font-weight:700"), "loaded Figtree weight, no faux bold");
  assert.ok(!badge.includes("font-weight:800"), "never 800: Figtree tops out at 700");
});

test("badge sits on the centered axis", () => {
  assert.ok(!badge.includes("align-self"), "badge follows the centered column axis");
});

test("frames are calm with margin in CSS, never inline", () => {
  assert.ok(css.includes(".stepframe{margin:0;"), "figure margin lives in the stylesheet");
  assert.ok(css.includes(".stepframe{margin:0;background:var(--paper);border:1.5px solid var(--line);"), "calm hairline frame, no heavy ink box");
  assert.ok(!html.includes('class="stepframe" style='), "no repeated inline styles on figures");
  assert.equal([...html.matchAll(/<figure class="stepframe">/g)].length, 3, "three step figures kept");
});

test("static figures never jump on hover", () => {
  const guard = (css.match(/@media \(prefers-reduced-motion:no-preference\)\{[\s\S]*/ ) || [""])[0];
  assert.ok(!guard.includes(".stepframe"), "no stepframe motion: figures are not clickable");
});

test("steps keep their labels in order", () => {
  const labels = [...html.matchAll(/<span class="badge">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Step 1", "Step 2", "Step 3"], "step labels kept in order");
});
