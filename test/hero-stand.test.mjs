// Homepage hero stand (#688): the hero reveals the real kTown shop stand
// artwork rendered from assets/altradits-shop-kTown.pdf, linked to /ktown.
// Run: node --test test/hero-stand.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

test("hero reveals the shop stand and links it to kTown", () => {
  const hero = (html.match(/<header class="hero">[\s\S]*?<\/header>/) || [""])[0];
  assert.ok(hero.length > 100, "hero present");
  assert.ok(hero.includes('<a href="/ktown" aria-label="Get kTown for your shop">'), "stand links to kTown");
  assert.ok(hero.includes('<img src="/assets/ktown-stand.png"'), "stand artwork shown");
  assert.ok(hero.includes('width="895" height="1260"'), "intrinsic dimensions kept");
  assert.ok(!hero.includes("card-ktown.svg"), "generic illustration gone from the hero");
});

test("stand assets exist and are real files", () => {
  for (const f of ["assets/ktown-stand.png", "assets/altradits-shop-kTown.pdf"]) {
    const st = fs.statSync(path.join(ROOT, f));
    assert.ok(st.size > 10000, `${f} is a real file (${st.size} bytes)`);
  }
  const png = fs.readFileSync(path.join(ROOT, "assets/ktown-stand.png"));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "valid PNG magic");
  const pdf = fs.readFileSync(path.join(ROOT, "assets/altradits-shop-kTown.pdf"), "utf8");
  assert.ok(pdf.startsWith("%PDF-"), "valid PDF magic");
});

test("hero stand link shows a focus ring", () => {
  assert.ok(html.includes(".stage:focus-within{outline:3px solid var(--blue);outline-offset:2px}"), "focus ring survives the clipped figure");
});

test("headline and CTA stay untouched", () => {
  assert.ok(html.includes("<h1>Take bitcoin. <em>Get M-Pesa.</em></h1>"), "h1 kept");
  assert.ok(html.includes('<a class="btn" href="/ktown">Get kTown</a>'), "CTA kept");
});
