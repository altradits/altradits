// Address check copy honesty (Closes #665): Copy failed speaks when the
// clipboard write or the execCommand fallback fails. Copied stays for real
// copies only.
// Run: node --test test/address-check-copy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "address-check/index.html"), "utf8");

test("address check: denied clipboard says Copy failed", () => {
  assert.doesNotMatch(html, /writeText\(r\.canonical\)\.then\(done, done\)/, "no blanket success on write results");
  assert.match(html, /writeText\(r\.canonical\)\.then\(done, failed\)/, "denied writes run the failure path");
  assert.match(html, /Copy failed\./, "the failure words exist");
});

test("address check: failed fallback says Copy failed", () => {
  assert.match(html, /ok = document\.execCommand\("copy"\)/, "the fallback result is read");
  assert.match(html, /if \(ok\) done\(\); else failed\(\);/, "a failed fallback runs the failure path");
});

test("address check: real copies still say Copied", () => {
  assert.match(html, /copy\.textContent = "Copied\."/, "success still says Copied");
});
