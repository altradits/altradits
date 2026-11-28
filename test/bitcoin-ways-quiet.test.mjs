// Bitcoin ways list (#718): six welcome labels read as quiet separated
// text, not buttons. The Talk and Donate CTAs below stay real buttons.
// Run: node --test test/bitcoin-ways-quiet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "bitcoin.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const ways = (css.match(/\.ways li\{[^}]*\}/) || [""])[0];
const dot = (css.match(/\.ways li\+li::before\{[^}]*\}/) || [""])[0];
const LABELS = [
  "Sponsors for seminars and workshops",
  "Venues and internet for sessions",
  "Devices for people's first wallets",
  "Translation into local languages",
  "Partners running Bitcoin education",
  "Mentors and code-review practice",
];

test("ways labels carry no button chrome", () => {
  assert.ok(ways, "bitcoin.html: .ways li rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!ways.includes(chrome), `no ${chrome} on .ways li`);
  }
});

test("ways labels stay separated and in order", () => {
  assert.ok(css.includes("gap:.5rem 1rem"), "row breathes between items");
  assert.ok(dot, "separator rule found");
  assert.ok(dot.includes('content:""'), "separator stays silent to screen readers");
  assert.ok(dot.includes("width:4px"), "quiet dot, not a pill");
  let last = -1;
  for (const w of LABELS) {
    const at = html.indexOf(`<li>${w}</li>`);
    assert.ok(at > last, `label kept in order: ${w}`);
    last = at;
  }
});

test("the support CTAs below stay real buttons", () => {
  assert.ok(html.includes('<a class="btn dark" href="/contact?topic=partner">Talk about partnering</a>'), "talk button kept");
  assert.ok(html.includes('<a class="btn" href="/donate">Donate to Bitcoin education</a>'), "donate button kept");
});
