// Till-points section: three airy open rows, no card chrome, no repetition.
// Run: node --test test/section2-till-points.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sec = home.slice(home.indexOf('<section class="till-points"'), home.indexOf("<h2>Three names"));

test("till-points: one section with the kept h2 and exactly three rows", () => {
  assert.ok(sec.startsWith('<section class="till-points"'), "section opens the block");
  assert.ok(sec.includes('<h2 id="till-h">Clear for everyone at the till</h2>'), "h2 kept");
  assert.equal([...sec.matchAll(/<article>/g)].length, 3, "three rows");
  assert.equal([...sec.matchAll(/<h3>/g)].length, 3, "one h3 per row");
  assert.equal([...sec.matchAll(/<p>/g)].length, 3, "one body line per row");
});

test("till-points: h3s are short and bodies are one-liners under ink leads", () => {
  for (const h3 of [...sec.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1])) {
    assert.ok(h3.split(" ").length <= 4, `short h3: ${h3}`);
  }
  for (const p of [...sec.matchAll(/<p>([^<]*)<\/p>/g)].map((m) => m[1])) {
    assert.ok(p.length <= 120, `one-line body: ${p}`);
    assert.doesNotMatch(p, /—/, "no em-dash in copy");
  }
});

test("till-points: the three meanings survive (any wallet, 1% customer-covers, never-holds plus straight payout)", () => {
  assert.match(sec, /whatever lightning wallet[^.]*works here/i, "any wallet");
  assert.match(sec, /1%[^.]*sits on the customer/i, "1% customer-covers");
  assert.match(sec, /never holds money/i, "never-holds");
  assert.match(sec, /straight to the shop's M-Pesa/i, "straight payout");
});

test("till-points: kickers, intro, card chrome and duplicated sentences are gone", () => {
  for (const gone of ['class="pillars"', 'class="panel"', 'class="tag"', 'class="intro"', "<ul>", "<b>", "Zero custody", "kTown is free."]) {
    assert.ok(!sec.includes(gone), `removed: ${gone}`);
  }
  assert.ok(!home.includes("pillars"), "no .pillars CSS or markup left");
  assert.ok(!home.includes(".panel"), "no .panel CSS left on the homepage");
});

test("till-points: top rule, hairline rows, editorial grid at >=860px", () => {
  assert.match(home, /\.till-points\{[^}]*border-top:1px solid var\(--line\)/, "section opens with a top rule");
  assert.match(home, /\.till-rows article\{[^}]*border-top:1px solid var\(--line\)/, "rows carry hairline tops");
  assert.match(home, /@media \(min-width:860px\)\{\.till-points\{display:grid;grid-template-columns:[^}]*;gap:clamp\([^}]*\)/, "desktop editorial grid with fluid gap");
});

test("till-points: row hover lives inside the reduced-motion guard", () => {
  const motionLine = home.split("\n").find((l) => l.includes("prefers-reduced-motion:no-preference"));
  assert.ok(motionLine.includes(".till-rows article:hover"), "hover rule inside the motion-allowed guard");
  const reduceLine = home.split("\n").find((l) => l.includes("prefers-reduced-motion:reduce"));
  assert.ok(!reduceLine.includes("till-rows"), "nothing till-specific in the kill rule");
});

test("till-points: shared rail spine and no double hairline", () => {
  assert.match(home, /@media \(min-width:860px\)\{\.till-points\{display:grid;grid-template-columns:minmax\(14rem,19rem\) minmax\(0,1fr\);gap:clamp\(2rem,5vw,4rem\)/, "rail locks onto the shared homepage spine");
  assert.ok(home.includes(".till-rows article:first-child{border-top:0;padding-top:0}"), "first row drops its top hairline");
});

test("till-points: neighbors untouched (hero, FAQs, closing CTA)", () => {
  assert.ok(home.includes("<h1>Take bitcoin. <em>Get M-Pesa.</em></h1>"), "6-word hero kept");
  const faq = home.slice(home.indexOf('<div class="faq"'), home.indexOf('<section class="closing"'));
  assert.equal([...faq.matchAll(/<details>/g)].length, 10, "FAQ count pinned at 10");
});
