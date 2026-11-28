// Portfolio flagship: status labels read as quiet kickers, not buttons.
// "For shops" and its siblings are dead text; filled pills made
// them look tappable. They match the gallery's quiet style now,
// keeping their product voices and card order.
// Run: node --test test/portfolio-status.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "portfolio.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const flagship = (css.match(/\.flagship \.status\{[^}]*\}/) || [""])[0];

test("flagship statuses carry no button chrome", () => {
  assert.ok(flagship, "portfolio.html: .flagship .status rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!flagship.includes(chrome), `no ${chrome} on .flagship .status`);
  }
  assert.ok(flagship.includes("text-transform:uppercase"), "quiet kicker voice kept");
  assert.ok(flagship.includes("font-weight:700"), "matches the gallery, no faux bold");
  assert.ok(!flagship.includes("font-weight:800"), "no faux-bold weight on the flagship rule");
  assert.ok(!css.includes("font-weight:800"), "no faux-bold weight anywhere on the page");
  for (const [rule, voice] of [
    [".is-ktown .status", "color:var(--btc-text)"],
    [".is-yebente .status", "color:#5B2A86"],
    [".is-dev .status", "color:var(--blue)"],
  ]) {
    const r = (css.match(new RegExp(rule.replaceAll(".", "\\.") + "\\{[^}]*\\}")) || [""])[0];
    assert.ok(r, `${rule} rule found`);
    assert.ok(!r.includes("background"), `no background on ${rule}`);
    assert.ok(!r.includes("border:"), `no border on ${rule}`);
    assert.ok(r.includes(voice), `voice kept on ${rule}`);
  }
});

test("statuses keep their words and flagship order", () => {
  for (const w of [
    "For shops · Pilot in Kisumu",
    "For everyday people · Early access",
    "For builders · Sandbox free",
  ]) {
    assert.ok(html.includes(`<span class="status">${w}</span>`), `label kept: ${w}`);
  }
  assert.ok(
    html.indexOf("For shops") < html.indexOf("For everyday people") &&
      html.indexOf("For everyday people") < html.indexOf("For builders"),
    "flagship order kept",
  );
  assert.ok(
    (html.match(/<span class="status">/g) || []).length >= 9,
    "gallery statuses untouched",
  );
});
