// kTown spacing rhythm (#694): the log-in line, checkbox, footer notes,
// and empty shop name keep one calm vertical rhythm.
// Run: node --test test/ktown-space.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const css = fs.readFileSync(path.join(ROOT, "ktown/style.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "ktown/index.html"), "utf8");

test("log-in line owns its rhythm, not browser margins", () => {
  const signedOut = (html.match(/<div id="signed-out">[\s\S]*?<\/div>\s*<div id="signed-in"/) || [""])[0];
  assert.ok(signedOut.includes('<p class="switch-line">'), "switch line classed");
  assert.ok(!signedOut.includes("<p style="), "no inline paragraph style left on the screens");
  assert.ok(css.includes("#signed-out .switch-line{text-align:center;margin:.75rem 0 0}"), "base rhythm kept");
  assert.ok(css.includes("#signed-out>.switch-line{margin:.3rem .5rem 0 0}"), "riding link keeps its inset");
});

test("checkbox, footer, and help notes share the scale", () => {
  assert.ok(css.includes(".agree{display:flex;gap:.6rem;align-items:flex-start;font-weight:400;margin-top:1rem}"), "checkbox meets the button rhythm");
  assert.ok(css.includes(".foot{margin:.75rem 0 0;"), "footer gap kept");
  assert.ok(css.includes(".help-line{margin:.75rem 0 0;"), "help gap matches the footer");
});

test("empty shop name leaves no phantom gap", () => {
  assert.ok(css.includes(".mpesa-name:empty{display:none}"), "empty name collapses");
});
