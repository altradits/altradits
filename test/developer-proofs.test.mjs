// Developer hero: guarantee labels read as quiet kickers, not buttons.
// "Zero custody" and its siblings are dead text; filled pills made
// them look tappable. They keep their ink voice and order,
// without background, padding or radius.
// Run: node --test test/developer-proofs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "developer.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const proofs = (css.match(/\.proofs li\{[^}]*\}/) || [""])[0];

test("guarantee labels carry no button chrome", () => {
  assert.ok(proofs, "developer.html: .proofs li rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!proofs.includes(chrome), `no ${chrome} on .proofs li`);
  }
  assert.ok(proofs.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(proofs.includes("color:var(--ink)"), "ink voice kept");
});

test("guarantees keep their words in order", () => {
  const wants = ["Zero custody", "Free sandbox", "0.5% live only"];
  for (const w of wants) {
    assert.ok(html.includes(`<li>${w}</li>`), `label kept: ${w}`);
  }
  assert.ok(
    html.indexOf(wants[0]) < html.indexOf(wants[1]) &&
      html.indexOf(wants[1]) < html.indexOf(wants[2]),
    "guarantee order kept",
  );
  assert.ok(html.includes('<ul class="proofs" aria-label="Key guarantees">'), "list label kept");
});

test("guarantees stay separated without button chrome", () => {
  const row = (css.match(/\.proofs\{[^}]*\}/) || [""])[0];
  assert.ok(row.includes("gap:.5rem 1.5rem"), "row breathes between items");
  assert.ok(row.includes("border-top:1px solid var(--line)"), "hairline sets the row apart");
  assert.ok(!css.includes("li+li::before"), "no dot separators");
  assert.ok(
    css.includes("@media (max-width:860px){.hero{grid-template-columns:minmax(0,1fr)"),
    "mobile hero cannot overflow",
  );
});
