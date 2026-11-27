// Contact and donate dead ends: every terminal state offers a way onward.
// A dead contact quote restarts with the typed message kept, the receipt page
// links home on both success and failure, and a paid or expired donation
// offers a fresh invoice. No payment logic changes.
// Run: node --test test/contact-donate-deadends.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const DEAD_QUOTE = "Start a new message for a fresh one.";

test("the server still names a fresh start on used and expired quotes", () => {
  const api = read("api/contact.js");
  assert.ok(api.includes("That invoice was already used. Start a new message for a fresh one."), "used quote names it");
  assert.ok(api.includes("That invoice expired. Start a new message for a fresh one."), "expired quote names it");
});

test("the contact send step offers a fresh start only on a dead quote", () => {
  const html = read("contact.html");
  assert.match(html, /id="freshBtn" hidden>Start a new message</, "button starts hidden with plain words");
  assert.match(html, /if \(\/Start a new message for a fresh one/, "client matches the dead-quote sentence");
  assert.match(html, /freshBtn"\)\.hidden = false/, "dead quote reveals the button");
  assert.match(html, /\$\("#freshBtn"\)\.hidden = true; \$\("#sendBtn"\)\.disabled = true/, "each send hides it again first");
});

test("the fresh start reopens the message with the typed words kept", () => {
  const html = read("contact.html");
  const wire = html.match(/\$\("#freshBtn"\)\.addEventListener\("click", \(\) => \{([^}]*)\}\);/);
  assert.ok(wire, "fresh start is wired");
  assert.match(wire[1], /\$\("#stepSend"\)\.hidden = true/, "send step closes");
  assert.match(wire[1], /\$\("#stepWrite"\)\.hidden = false/, "message step reopens");
  assert.match(wire[1], /\$\("#toPay"\)\.disabled = false/, "payment step can run again");
  assert.doesNotMatch(wire[1], /\.value/, "typed name, email and message are kept");
  assert.match(wire[1], /\$\("#toPay"\)\.focus\(\)/, "focus lands on the payment step, not the void");
  const send = html.slice(html.indexOf('id="stepSend"'), html.indexOf('id="stepSend"') + html.slice(html.indexOf('id="stepSend"')).indexOf("</fieldset>"));
  assert.doesNotMatch(send, /backToWrite|Back to your message/, "paid step stays one-way: restart, not back");
});

test("the receipt error state links home and to the team", () => {
  const html = read("receipt.html");
  assert.match(html, /id="errBack" hidden><a href="\/">Back to the homepage<\/a> · <a href="\/contact">Write to the team<\/a>/, "error ways back");
  assert.match(html, /id="errBack" hidden/, "error links start hidden");
  assert.match(html, /getElementById\("errBack"\)\.hidden = false/, "error reveals the links");
});

test("the receipt success state links home without touching print", () => {
  const html = read("receipt.html");
  assert.match(html, /id="okBack" hidden><a href="\/">Back to the homepage<\/a>/, "success way home");
  assert.match(html, /getElementById\("okBack"\)\.hidden = false/, "success reveals the way home");
  assert.match(html, /class="noprint" id="okBack"/, "way home skips print");
  assert.match(html, /a\{color:var\(--navy\)\}/, "recovery links keep the page palette");
  assert.match(html, /class="noprint" id="errBack"/, "error links skip print");
  assert.match(html, /@media print\{[^}]*\.noprint/, "print still hides them");
});

test("the paid and expired donation states offer a fresh invoice", () => {
  const html = read("donate.html");
  assert.match(html, /id="again" hidden>Make another invoice</, "button starts hidden with plain words");
  assert.match(html, /Received\. Thank you ."; \$\("#again"\)\.hidden = false/, "paid reveals it");
  assert.match(html, /Make a new one\."; \$\("#again"\)\.hidden = false/, "expired reveals it");
  assert.match(html, /\$\("#again"\)\.hidden = true; \$\("#copy"\)\.textContent/, "a new invoice hides it again");
  assert.match(html, /\$\("#copy"\)\.textContent = "Copy invoice"; \$\("#state"\)/, "a new invoice resets the copy label");
});

test("the fresh invoice returns to the amount with the value kept", () => {
  const html = read("donate.html");
  const wire = html.match(/\$\("#again"\)\.addEventListener\("click", \(\) => \{([^}]*)\}\);/);
  assert.ok(wire, "fresh invoice is wired");
  assert.match(wire[1], /\$\("#invoice"\)\.hidden = true/, "old invoice closes");
  assert.match(wire[1], /\$\("#sats"\)\.focus\(\)/, "amount takes focus");
  assert.doesNotMatch(wire[1], /\.value/, "typed amount is kept");
});
