// Portfolio flagship: chips read as quiet kickers, not buttons.
// "Free for shops" and its siblings are dead text; filled pills made
// them look tappable. They keep their ink voice and card order,
// without background, border, padding or radius.
// Run: node --test test/portfolio-chips.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "portfolio.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const chips = (css.match(/\.flagship \.chips span\{[^}]*\}/) || [""])[0];

test("chips carry no button chrome", () => {
  assert.ok(chips, "portfolio.html: .flagship .chips span rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!chips.includes(chrome), `no ${chrome} on chips`);
  }
  assert.ok(chips.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(chips.includes("font-size:.76rem"), "site-wide kicker scale kept");
});

test("chips keep their words in card order", () => {
  const wants = [
    "Free for shops",
    "Zero custody",
    "Full KES price",
    "Opens in 60s",
    "M-Pesa cash-out",
    "PIN + backup",
    "Non-custodial",
    "Free sandbox",
    "0.5% live only",
  ];
  for (const w of wants) {
    assert.ok(html.includes(`<span>${w}</span>`), `chip kept: ${w}`);
  }
  const positions = wants.map((w) => html.indexOf(`<span>${w}</span>`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "chip order kept");
});
