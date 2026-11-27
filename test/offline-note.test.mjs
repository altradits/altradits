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

test("the service worker cache is bumped past the fix", () => {
  const sw = read("ktown/sw.js");
  const m = sw.match(/const CACHE = "ktown-v(\d+)";/);
  assert.ok(m, "a versioned cache constant exists");
  assert.ok(Number(m[1]) > 11, "installed merchants get the fixed shell");
});

test("the offline note reads as a calm status banner", () => {
  const css = read("ktown/style.css");
  assert.ok(css.includes(".offline-note{text-align:center;font-weight:700;font-size:.9rem;margin:0 0 .5rem;padding:.45rem .85rem;border-radius:.75rem;background:rgba(247,147,26,.16);border:1px solid rgba(247,147,26,.55);color:var(--navy)}"), "banner surface kept");
});
