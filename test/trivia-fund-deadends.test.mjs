// Trivia fund dead ends (Closes #627): a paid or expired invoice must offer a
// way back, dead invoice actions must go quiet, and copy failure must speak.
// Run: node --test test/trivia-fund-deadends.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(ROOT, "trivia.html"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "assets/trivia.js"), "utf8");

test("trivia: a hidden Fund another button waits inside the invoice", () => {
  assert.match(page, /<button type="button" class="btn" id="fund-again" hidden>Fund another<\/button>/, "Fund another button is hidden at first");
  const invoice = page.indexOf('<div class="quiz" id="fund-invoice" hidden>');
  assert.ok(invoice !== -1 && invoice < page.indexOf('id="fund-again"'), "Fund another lives inside the invoice block");
});

test("trivia: paid and expired states reveal and focus Fund another", () => {
  assert.match(js, /\$\("fund-again"\)\.hidden = false; \$\("fund-again"\)\.focus\(\)/, "endDonor reveals and focuses Fund another");
  assert.match(js, /endDonor\("Received\. Thank you\."\); loadPool\(\)/, "paid invoices end through endDonor and refresh the pool");
  assert.match(js, /endDonor\("This invoice expired\."\)/, "expired invoices end through endDonor");
});

test("trivia: paid and expired states quiet the invoice actions", () => {
  assert.doesNotMatch(js, /if \(expired\)/, "no expired-only guard: both terminal states quiet");
  assert.match(js, /\$\("fund-copy"\)\.disabled = true/, "terminal states disable Copy");
  assert.match(js, /\$\("fund-open"\)\.removeAttribute\("href"\)/, "terminal states remove the wallet link target");
  assert.match(page, /#fund-copy:disabled,#fund-open\[aria-disabled\]/, "dead actions look dead");
});

test("trivia: a new invoice resets copy, actions, and Fund another", () => {
  assert.match(js, /\$\("fund-copy"\)\.textContent = "Copy invoice"/, "new invoice resets the Copy label");
  assert.match(js, /\$\("fund-open"\)\.removeAttribute\("aria-disabled"\); \$\("fund-copy"\)\.disabled = false/, "new invoice re-enables actions");
  assert.match(js, /\$\("fund-invoice"\)\.hidden = false; \$\("fund-again"\)\.hidden = true/, "new invoice hides Fund another");
});

test("trivia: denied clipboard says so", () => {
  assert.match(js, /\$\("fund-copy"\)\.textContent = "Copy failed"/, "copy failure sets Copy failed");
  assert.match(js, /else \$\("fund-copy"\)\.textContent = "Copy failed";/, "missing clipboard API also sets Copy failed");
});

test("trivia: Fund another clears the stale invoice and returns to the amount", () => {
  assert.match(js, /\$\("fund-invoice"\)\.hidden = true; \$\("fund-again"\)\.hidden = true/, "Fund another hides invoice and itself");
  assert.match(js, /\$\("fund-qr"\)\.innerHTML = ""; \$\("fund-bolt"\)\.value = ""/, "Fund another clears the stale QR and invoice text");
  assert.match(js, /\$\("fund-sats"\)\.focus\(\)/, "Fund another focuses the amount field");
});
