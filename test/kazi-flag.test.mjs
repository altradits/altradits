// Kazi flag button: an empty reason must not meet a dead button. The
// server refuses empty reasons, so the button starts disabled and only
// enables once the reason has words. Disabled buttons read dimmed.
// Run: node --test test/kazi-flag.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "kazi.html"), "utf8");

test("the flag button starts disabled and wakes on words", () => {
  assert.match(html, /btn\.type = "button";\nbtn\.disabled = true;/,
    "kazi.html: the flag button starts disabled");
  assert.match(html, /input\.addEventListener\("input", \(\) => \{ btn\.disabled = !input\.value\.trim\(\); \}\);/,
    "kazi.html: typing enables it, clearing disables it again");
  assert.match(html, /if \(!input\.value\.trim\(\)\) return;/,
    "kazi.html: the empty-submit guard stays as a backstop");
});

test("disabled buttons read dimmed", () => {
  assert.match(html, /\.btn\[disabled\]\{opacity:\.55;cursor:default\}/,
    "kazi.html: disabled buttons look disabled");
});

test("after a flag the button follows the input, not a blanket enable", () => {
  assert.match(html, /catch \(e\) \{ input\.placeholder = e\.message; \}\nbtn\.disabled = !input\.value\.trim\(\);/,
    "kazi.html: success with cleared input stays disabled, failure with text re-enables");
});
