// The overview doc and the admin page must match the priced and mailed truth:
// contact costs $1, the Developer API takes 0.5%, and only high-severity
// security watch entries email Stanley.
// Run: node --test test/docs-accuracy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { feeFor } from "../lib/devapi.js";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the overview prices match the code: $1 contact, 0.5% developer charge", () => {
  const contact = read("api/contact.js");
  const price = contact.match(/CONTACT\s*=\s*\{\s*usd:\s*(\d+)/);
  assert.ok(price, "api/contact.js: CONTACT.usd is set");
  assert.equal(price[1], "1", "api/contact.js: contact costs $1");
  assert.equal(feeFor(200), 1, "lib/devapi.js: 0.5% of 200 sats is 1 sat");
  assert.equal(feeFor(201), 2, "lib/devapi.js: the charge rounds up");
  assert.equal(feeFor(1), 1, "lib/devapi.js: the minimum charge is 1 sat");
  const doc = read("docs/system-overview.md");
  assert.doesNotMatch(doc, /Nothing is sold/, "overview: no blanket nothing-sold claim");
  assert.match(doc, /\$1/, "overview: the $1 contact price is stated");
  assert.match(doc, /0\.5%/, "overview: the 0.5% developer charge is stated");
});

test("Stan mails high severity only, in code, docs and admin", () => {
  const attacks = read("lib/attacks.js");
  assert.match(attacks, /t\.severity === "high"/, "lib/attacks.js: mail is gated on high severity");
  assert.match(attacks, /secw:mail:/, "lib/attacks.js: mailed techniques are throttled per hour");
  const doc = read("docs/system-overview.md");
  assert.doesNotMatch(doc, /every alert/, "overview: no blanket every-alert claim");
  assert.match(doc, /high-severity alerts \(at most once an hour per technique\)/, "overview: the high severity rule and throttle are stated");
  const admin = read("admin.html");
  assert.doesNotMatch(admin, /every alert/, "admin.html: no blanket every-alert claim");
  assert.match(admin, /high-severity alerts \(at most once an hour per technique\)/, "admin.html: the high severity rule and throttle are stated");
});
