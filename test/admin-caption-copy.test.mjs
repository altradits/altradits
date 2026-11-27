// Admin caption copy honesty (Closes #679): the marketing post copy toasts
// Caption not copied when the clipboard write and the fallback both fail,
// instead of claiming success or dying silently.
// Run: node --test test/admin-caption-copy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const js = fs.readFileSync(path.join(ROOT, "assets/admin.js"), "utf8");

test("admin: failed caption copies speak", () => {
  assert.match(js, /toast\(ok \? "Caption copied\." : "Caption not copied\."\)/, "the toast follows the copy result");
  assert.match(js, /ok = document\.execCommand\("copy"\)/, "the fallback result is read");
});

test("admin: a throwing fallback cannot kill the click silently", () => {
  assert.doesNotMatch(js, /document\.execCommand\("copy"\); ta\.remove\(\);/, "no unguarded fallback call");
});

test("admin: real caption copies still confirm", () => {
  assert.match(js, /await navigator\.clipboard\.writeText\(p\.caption\); ok = true/, "a good write marks success");
});
