// The offline note speaks wherever the user stands: it sits above both kTown
// screens, and failed saves reveal it. Run: node --test test/offline-note.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the offline note lives above both screens", () => {
  const html = read("ktown/index.html");
  assert.ok(
    html.indexOf('id="offline-note"') < html.indexOf('id="screen-qr"'),
    "the note shows on settings too, not just QR",
  );
  assert.equal((html.match(/id="offline-note"/g) || []).length, 1, "exactly one note exists");
});

test("failed saves reveal the note instead of failing silently", () => {
  const js = read("ktown/app.js");
  const fn = js.slice(js.indexOf("const savePref"), js.indexOf("const savePref") + 600);
  assert.ok(fn.includes('$("offline-note").hidden = false'), "a failed save speaks");
});
