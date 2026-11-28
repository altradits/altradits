// Wallet guide quiet hero (#714): the eyebrow and the hero proofs read as
// quiet kickers, not buttons. The learning-path pills keep their frames:
// real links stay tappable, pinned by test/wallet-guide-calm.test.mjs.
// Run: node --test test/guide-quiet-hero.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "wallet-guide.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
const brow = (css.match(/\.eyebrow\{[^}]*\}/) || [""])[0];
const heroProofs = (css.match(/\.hero \.proofs li\{[^}]*\}/) || [""])[0];
const heroGap = (css.match(/\.hero \.proofs\{[^}]*\}/) || [""])[0];
const dot = (css.match(/\.hero \.proofs li\+li::before\{[^}]*\}/) || [""])[0];

test("hero eyebrow carries no button chrome", () => {
  assert.ok(brow, "wallet-guide.html: .eyebrow rule found");
  for (const chrome of ["background", "padding", "border-radius", "border:"]) {
    assert.ok(!brow.includes(chrome), `no ${chrome} on .eyebrow`);
  }
  assert.ok(brow.includes("color:#5B2A86"), "plum voice kept");
  assert.ok(brow.includes("text-transform:uppercase"), "kicker voice kept");
  assert.ok(html.includes('<p class="eyebrow">Ye₿ente · Starter Bitcoin wallet</p>'), "words kept");
  assert.ok(html.indexOf('class="eyebrow"') < html.indexOf("<h1>"), "label still introduces the hero");
});

test("hero proofs read as quiet kickers with dot separators", () => {
  assert.ok(heroProofs, "wallet-guide.html: .hero .proofs li rule found");
  for (const gone of ["1.5px", "99px", "var(--paper)", "padding:.28rem"]) {
    assert.ok(!heroProofs.includes(gone), `no ${gone} on hero proofs`);
  }
  assert.ok(heroProofs.includes("text-transform:uppercase"), "quiet kicker voice");
  assert.ok(heroProofs.includes("font-weight:700"), "kicker weight");
  assert.ok(heroGap.includes("gap:.45rem .9rem"), "row breathes between items");
  assert.ok(dot, "separator rule found");
  assert.ok(dot.includes('content:""'), "separator stays silent to screen readers");
  assert.ok(dot.includes("width:4px"), "quiet dot, not a pill");
  for (const w of ["Start with a few cents", "One 6-digit PIN", "Cash out to M-Pesa"]) {
    assert.ok(html.includes(`<li>${w}</li>`), `label kept: ${w}`);
  }
  assert.ok(html.includes('<ul class="proofs" aria-label="Highlights">'), "list label kept");
});

test("learning-path pills keep their button frames", () => {
  assert.ok(html.includes(".proofs.paths li{padding:0;border-color:var(--ink)}"), "paths override intact");
  assert.ok(html.includes(".proofs li{font-size:.86rem;font-weight:600;color:var(--ink);background:var(--paper);border:1.5px solid var(--line);border-radius:99px;padding:.28rem .75rem}"), "base frame still feeds the paths");
});
