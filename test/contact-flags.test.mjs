// Contact flags: status words read as quiet text, not buttons.
// "Paid" and "Sent" are dead status text; filled green pills made them
// look tappable. They keep their words in bold green, without
// background, padding or radius.
// Run: node --test test/contact-flags.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "contact.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const flag = (css.match(/\.okflag\{[^}]*\}/) || [""])[0];

test("status flags carry no button chrome", () => {
  assert.ok(flag, "contact.html: .okflag rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!flag.includes(chrome), `no ${chrome} on .okflag`);
  }
  assert.ok(flag.includes("color:var(--ok)"), "green status voice kept");
});

test("flags keep their words", () => {
  assert.ok(html.includes('<span class="okflag">Paid</span>'), "Paid kept");
  assert.ok(html.includes('<span class="okflag">Sent</span>'), "Sent kept");
});
