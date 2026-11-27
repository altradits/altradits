// Wallet guide calm pass (#611): one hero CTA, no duplicate funding block,
// learning pills instead of a fourth 3-card grid, QR-only closing.
// Run: node --test test/wallet-guide-calm.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync(path.join(process.cwd(), "wallet-guide.html"), "utf8");

test("hero carries exactly one call to action", () => {
  const hero = (html.match(/<header class="hero">[\s\S]*?<\/header>/) || [""])[0];
  assert.ok(hero.length > 100, "hero present");
  assert.equal([...hero.matchAll(/<a class="btn/g)].length, 1, "hero keeps a single .btn");
  assert.ok(!hero.includes("btn ghost"), "hero ghost link gone");
  assert.ok(!html.includes("btn ghost"), "no ghost button left on the page");
  assert.ok(html.includes(".hero .btn{min-height:3.4rem;padding:1rem 2.2rem;border-radius:99px;font-size:1.1rem}"), "hero CTA is a generous pill like the homepage");
});

test("duplicate funding block is gone, one /bitcoin link stays", () => {
  assert.ok(!html.includes("<h2>Put money in</h2>"), "Put money in block removed");
  assert.ok(!html.includes("Get some from a person"), "duplicate funding card removed");
  assert.ok(html.includes('<a href="/bitcoin">See how receiving works</a>'), "steps keep the /bitcoin link");
});

test("keep learning is a pill row, not another 3-card grid", () => {
  const paths = (html.match(/<ul class="proofs paths"[\s\S]*?<\/ul>/) || [""])[0];
  assert.ok(paths.includes('aria-label="Learning paths"'), "labeled pill row present");
  for (const href of ["/library#money", "/library#keys", "/library#privacy"]) {
    assert.ok(paths.includes(`href="${href}"`), `pill links ${href}`);
  }
  assert.equal([...html.matchAll(/<ul class="cards/g)].length, 4, "four card grids left");
  assert.ok(html.includes(".proofs.paths li{padding:0;border-color:var(--ink)}"), "pill chrome sits on the link");
  assert.ok(html.includes(".proofs.paths a{display:inline-flex;align-items:center;gap:.4rem;min-height:2.75rem;padding:.5rem 1.05rem;text-decoration:none;color:var(--ink);font-weight:700}"), "whole pills tap at 44px");
  assert.ok(html.includes(".proofs.paths a:hover{background:rgba(15,27,45,.06);transform:translateY(-1px)}"), "pills lift on hover");
  assert.equal([...paths.matchAll(/→<\/a>/g)].length, 3, "every pill carries an arrow cue");
});

test("closing keeps the scan QR and drops the third wallet button", () => {
  const closing = (html.match(/<section class="closing"[\s\S]*?<\/section>/) || [""])[0];
  assert.ok(closing.length > 100, "closing present");
  assert.equal([...closing.matchAll(/<a class="btn/g)].length, 1, "closing keeps one tap CTA");
  assert.ok(closing.includes('src="/assets/yebente-open-qr.png"'), "scan QR kept");
  assert.ok(closing.includes("Open it on your phone."), "closing names the phone handoff");
  assert.ok(html.includes("@media (max-width:859px){.closing .scan{display:none}}"), "phones see the button, not the QR");
  assert.ok(html.includes("@media (min-width:860px){.closing .ctas{display:none}}"), "desktops see the QR, not the button");
});

test("phone stage is flat color, not a purple gradient", () => {
  assert.ok(!html.includes("radial-gradient"), "no radial gradient left");
  assert.ok(html.includes(".phone-stage{margin:0;background:var(--plum);border:1.5px solid var(--line);"), "calm flat stage");
  assert.ok(!html.includes("stage-tags"), "stage tag pills gone with the heavy shadow");
});

test("first section below the hero breathes behind a hairline", () => {
  assert.ok(html.includes('<h2 class="ruled">Why everyday people try Ye₿ente</h2>'), "ruled heading present");
  assert.ok(html.includes(".ruled{border-top:1px solid var(--line);padding-top:clamp(2.5rem,5vw,4rem)}"), "hairline rule kept");
});

test("pinned page facts still hold", () => {
  assert.equal([...html.matchAll(/<details>/g)].length, 10, "10 FAQs stay");
  const nav = (html.match(/<nav class="topnav"[^>]*>[\s\S]*?<\/nav>/) || [""])[0];
  assert.equal([...nav.matchAll(/<a\b/g)].length, 5, "topnav stays 5");
  const foot = (html.match(/<footer class="sitefoot">[\s\S]*?<\/footer>/) || [""])[0];
  assert.equal([...foot.matchAll(/<a\b/g)].length, 11, "footer stays 11");
  assert.ok(!html.includes("\u2014"), "no em-dashes in copy");
});
