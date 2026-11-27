// Share links: the page and every review share with Stanley's handle
// attached, and WhatsApp shares always carry the site link home.
// Run: node --test test/share.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");

test("page share row links four networks with handle and site", () => {
  assert.match(html, /id="sharePage"/);
  assert.match(html, /x\.com\/intent\/post\?text=[^"]*&url=[^"]*&via=altradits"/);
  assert.match(html, /wa\.me\/\?text=[^"]*%40altradits[^"]*altradits\.com%2Ftracker"/);
  assert.match(html, /t\.me\/share\/url\?url=[^"]*&text=[^"]*"/);
  assert.match(html, /linkedin\.com\/sharing\/share-offsite\/\?url=[^"]*"/);
});

test("every review gets an anchor plus X and WhatsApp share links", () => {
  assert.match(html, /`review-\$\{String\(r\.repo\)[^`]*\$\{r\.number\}`/);
  assert.match(html, /x\.com\/intent\/post\?text=\$\{t\}&url=\$\{u\}&via=altradits/);
  assert.match(html, /wa\.me\/\?text=\$\{t\}%20via%20%40altradits%20\$\{u\}/);
  assert.match(html, /reviewed by @altradits/);
});
