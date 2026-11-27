// #606: an invoice made on the saved outside address carries no payment hash,
// so the invoice screen must say it cannot watch it and offer Done instead of
// spinning forever. Every security PIN input and per-device Remove button
// carries a spoken name. Run: node --test test/wallet-track-names.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (f) => fs.readFileSync(path.join(import.meta.dirname, "..", "yebente", "src", "components", f), "utf8");

test("untracked invoices get a plain note and Done, tracked ones keep the spinner", () => {
  const r = src("ReceiveBtcModal.tsx");
  assert.match(r, /const \[trackedHash, setTrackedHash\] = useState<string \| null>\(null\)/, "the watched hash lives in state");
  assert.match(r, /setTrackedHash\(res\.paymentHash \|\| null\)/, "a hash-less invoice records null");
  assert.match(r, /if \(res\.paymentHash\)/, "polling starts only with a hash");
  assert.match(r, /\{trackedHash \? \(/, "the invoice screen branches on tracked or not");
  assert.match(r, /Ye₿ente cannot watch this invoice\. It will not flip to paid by itself\. Press Done to close\./, "the plain note");
  assert.match(r, /aria-label="Waiting for payment"/, "tracked invoices keep the spinner");
  const untracked = r.match(/\{trackedHash \? \([\s\S]*?onClick=\{onClose\}[\s\S]*?>\s*Done\s*</);
  assert.ok(untracked, "the untracked branch ends in a Done button that closes");
  assert.ok(!untracked[0].includes("onSuccess"), "Done never fabricates a receive");
});

test("every security PIN input has a spoken name", () => {
  const s = src("PhonesAndSecurity.tsx");
  const inputs = [...s.matchAll(/<input\b[^>]*>/g)];
  assert.equal(inputs.length, 5, "five PIN inputs, no more");
  for (const [i, m] of inputs.entries()) assert.ok(m[0].includes("aria-label="), `PIN input ${i + 1} is named`);
  for (const label of ["PIN to cancel the recovery", "Old PIN", "New PIN", "Repeat the new PIN", "PIN to remove the phone"]) {
    assert.ok(s.includes(`aria-label="${label}"`), `the "${label}" input keeps its name`);
  }
});

test("every per-device Remove button names its phone", () => {
  const s = src("PhonesAndSecurity.tsx");
  assert.match(s, /aria-label=\{d\.current \? 'Remove this phone' : `Remove the phone added \$\{when\(d\.at\)\}`\}/, "each Remove names its phone");
  assert.match(s, />Remove<\/button>/, "the visible Remove text stays");
});
