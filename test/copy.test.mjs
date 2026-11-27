// One-tap copy: every logged command carries a copy button wired to the
// clipboard, with a fallback for older browsers.
// Run: node --test test/copy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");

test("each logged command renders a copy button with a log reference", () => {
  assert.match(html, /<button type="button" data-copy="\$\{ri\}:\$\{ti\}">Copy<\/button>/);
});

test("the handler copies by reference with clipboard and fallback paths", () => {
  assert.match(html, /button\[data-copy\]/);
  assert.match(html, /navigator\.clipboard\.writeText\(t\.run\)/);
  assert.match(html, /document\.execCommand\("copy"\)/);
  assert.match(html, /T\.reviews\[ri\] && T\.reviews\[ri\]\.ran\[ti\]/);
});
