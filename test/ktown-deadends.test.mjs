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
});
