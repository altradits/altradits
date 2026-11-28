// Developer labels: the hero eyebrow and terminal badge read as quiet
// text, not buttons. Both rendered dead text as pills. They keep their
// words and blue/green voices without background, padding, radius or
// border.
// Run: node --test test/developer-labels.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "developer.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

for (const [name, sel] of [["eyebrow", ".eyebrow"], ["terminal badge", ".term-badge"]]) {
  test(`${name} carries no button chrome`, () => {
    const rule = (css.match(new RegExp(sel.replace(".", "\\.") + "\\{[^}]*\\}")) || [""])[0];
    assert.ok(rule, `developer.html: ${sel} rule found`);
    for (const chrome of ["background", "padding", "border-radius", "border:", "inline-flex"]) {
      assert.ok(!rule.includes(chrome), `no ${chrome} on ${sel}`);
    }
  });
}

test("labels keep their words", () => {
  assert.ok(html.includes('<p class="eyebrow">Altradits Developer · Non-custodial Lightning API</p>'), "eyebrow words kept");
  assert.ok(html.includes('<span class="term-badge">201 Created</span>'), "terminal badge words kept");
});
