// kTown has no dead ends: the QR tab hides until a merchant exists, and the
// paid confirmation offers a way back to a new payment, announced to
// screen readers. Run: node --test test/ktown-deadends.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the QR tab hides until a merchant is set", () => {
  assert.match(read("ktown/app.js"), /\$\("tab-qr"\)\.hidden = !merchant/, "showScreen hides the dead tab");
  assert.match(read("ktown/index.html"), /<nav class="tabs"[^>]*hidden/, "the tab bar starts hidden: no flash, no lonely tab");
  assert.match(read("ktown/app.js"), /document\.querySelector\("\.tabs"\)\.hidden = !merchant/, "showScreen reveals the bar with the merchant");
  assert.match(read("ktown/sw.js"), /const CACHE = "ktown-v\d+"/, "the worker cache stays versioned");
});

test("the paid view offers a new payment and announces itself", () => {
  const html = read("ktown/pay.html");
  assert.match(html, /id="view-paid"[^>]*role="status"/, "the confirmation is announced");
  assert.match(html, /id="link-paid-new" data-i18n="newPayment"/, "a new-payment way back exists");
  const js = read("ktown/pay.js");
  assert.match(js, /newPayment: "New payment"/, "the way back reads plain in English");
  assert.match(js, /newPayment: "Malipo mapya"/, "the way back reads plain in Kiswahili");
  assert.match(js, /\$\("link-paid-new"\)\.addEventListener\("click"/, "the way back is wired");
  const wire = js.slice(js.indexOf('$("link-paid-new").addEventListener'));
  assert.match(wire, /payHash = ""/, "stale payment state is cleared");
  assert.match(wire, /\$\("amount"\)\.value = ""/, "the old amount is cleared");
  assert.match(wire, /hideErr\("pay-err"\)/, "old errors are cleared");
  assert.match(wire, /\$\("amount"\)\.focus\(\)/, "focus returns to the amount");
  assert.match(html, /class="btn ghost small" id="link-paid-new"/, "the way back is a pill button");
  const paid = html.slice(html.indexOf('id="view-paid"'));
  assert.ok(paid.indexOf('id="link-paid-new"') < paid.indexOf('class="foot"'), "the pill sits above the disclaimer");
});
