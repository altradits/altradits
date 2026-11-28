// Guide feelings: problem labels read as quiet kickers, not buttons.
// "High transfer fees" and its siblings are dead text; filled pills made
// them look tappable. They keep their plum voice and problem-to-solution
// order, without background, padding or radius.
// Run: node --test test/guide-feelings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "wallet-guide.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const pain = (css.match(/\.feelings \.pain\{[^}]*\}/) || [""])[0];

test("pain labels carry no button chrome", () => {
  assert.ok(pain, "wallet-guide.html: .pain rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!pain.includes(chrome), `no ${chrome} on .pain`);
  }
  assert.ok(pain.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(pain.includes("color:#5B2A86"), "plum problem voice kept");
});

test("problems keep their words and come before their solutions", () => {
  for (const [problem, solution] of [
    ["High transfer fees", "Keep what you send"],
    ["Confusing jargon", "Plain words, clear shillings"],
    ["Fear of a lost phone", "Safe recovery built in"],
  ]) {
    assert.ok(html.includes(`<span class="pain">${problem}</span>`), `label kept: ${problem}`);
    assert.ok(
      html.indexOf(problem) < html.indexOf(solution),
      `${problem} introduces ${solution}`,
    );
  }
});
