// Practice terminal: retype a review command to reveal its recorded output.
// Core logic plus the tracker page wiring. The shipped module is loaded the
// same way the touchtype core is: in a sandbox with a module object.
// Run: node --test test/practice.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const sandbox = { window: {}, module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(read("assets/practice.js"), sandbox, { filename: "assets/practice.js" });
const { createSession, leadingCorrect, attempt, hint } = sandbox.module.exports;
assert.ok(createSession, "the shipped module exports its core");

test("sessions solve only on an exact match and count tries", () => {
  const s = createSession("go test ./feature .");
  assert.equal(attempt(s, "go test ./feature"), false);
  assert.equal(s.solved, false);
  assert.equal(s.runs, 1);
  assert.equal(attempt(s, "go test ./feature ."), true);
  assert.equal(s.solved, true);
  assert.equal(s.runs, 2);
});

test("hints report leading characters without revealing the rest", () => {
  assert.equal(leadingCorrect("abc", "abd"), 2);
  assert.equal(leadingCorrect("abc", ""), 0);
  assert.equal(leadingCorrect("abc", "abcd"), 3);
  const s = createSession("make lint-native");
  assert.match(hint(s, "make x"), /^5 of 16 characters right, try 1\.$/);
  assert.doesNotMatch(hint(s, "make x"), /lint-native/);
});

test("the tracker page ships and mounts the practice terminal", () => {
  const html = read("tracker.html");
  assert.match(html, /<script src="\/assets\/practice\.js" defer><\/script>/, "page loads the module deferred");
  assert.match(html, /PracticeTerminal\.mount\(el, t\)/, "every logged command gets a terminal");
  assert.match(read("assets/practice.js"), /recorded output/, "honest label: rehearsal, not execution");
});

test("mounted controls are named and results announce", () => {
  const src = read("assets/practice.js");
  assert.match(src, /setAttribute\("aria-label", `Run: /, "Run button named per command");
  assert.match(src, /setAttribute\("aria-describedby"/, "instruction associated");
  assert.match(src, /setAttribute\("role", "status"\)/, "status announced");
});
