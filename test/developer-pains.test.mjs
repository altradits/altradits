// Developer cards: problem labels read as quiet kickers, not buttons.
// "No node upkeep" and its siblings are dead text; filled pills made
// them look tappable. They keep their sky voice and problem-to-solution
// order, without background, padding or radius.
// Run: node --test test/developer-pains.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "developer.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const pain = (css.match(/\.cards \.pain\{[^}]*\}/) || [""])[0];

test("pain labels carry no button chrome", () => {
  assert.ok(pain, "developer.html: .cards .pain rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!pain.includes(chrome), `no ${chrome} on .cards .pain`);
  }
  assert.ok(pain.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(pain.includes("color:var(--blue)"), "sky problem voice kept");
});

test("problems keep their words and come before their solutions", () => {
  for (const [problem, solution] of [
    ["No node upkeep", "Keep your own wallet"],
    ["No custody risk", "Paid straight to you"],
    ["Zero risk to test", "Build in the free sandbox"],
  ]) {
    assert.ok(html.includes(`<span class="pain">${problem}</span>`), `label kept: ${problem}`);
    assert.ok(
      html.indexOf(problem) < html.indexOf(solution),
      `${problem} introduces ${solution}`,
    );
  }
});
