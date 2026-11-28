// Developer reference: status labels read as quiet kickers, not buttons.
// "Live" and its sibling are dead text; filled pills made
// them look tappable. They keep their status voices and row order,
// without background, padding or radius.
// Run: node --test test/reference-pills.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "developer-reference.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const pill = (css.match(/\.pill\{[^}]*\}/) || [""])[0];

test("status labels carry no button chrome", () => {
  assert.ok(pill, "developer-reference.html: .pill rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!pill.includes(chrome), `no ${chrome} on .pill`);
  }
  assert.ok(pill.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(pill.includes("color:var(--ok)"), "live voice kept");
  assert.ok(css.includes(".pill.sandbox{color:var(--blue)}"), "sandbox voice kept");
});

test("statuses keep their words", () => {
  const rows = [...html.matchAll(/<span class="pill[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.equal(rows.length, 26, "all status labels kept");
  assert.equal(rows.filter((w) => w === "Live").length, 25, "live count kept");
  assert.ok(rows.includes("Sandbox only"), "sandbox label kept");
});
