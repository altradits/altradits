// Bitcoin page stays lean (#666): one hero pass, no orphan blocks, only
// motion that real elements use, and every section kept.
// Run: node --test test/bitcoin-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(ROOT, "bitcoin.html"), "utf8");
const css = page.slice(page.indexOf("<style>"), page.indexOf("</style>"));

test("dead blocks stay out of the stylesheet", () => {
  for (const dead of [".help", ".give{", "--ok", "--navy", ".tabs", ".cards .links", ".foot nav", ".pager a"]) {
    assert.ok(!css.includes(dead), `stylesheet carries no ${dead}`);
  }
});

test("the hero is declared once, in the winning pass", () => {
  assert.equal(css.match(/\.hero\{/g).length, 1, "one .hero rule");
  assert.ok(!css.includes("clamp(2.2rem,6.5vw,3.6rem)"), "no first-pass h1 size");
  assert.ok(!css.includes("h1 em{font-style:normal;color:var(--btc-text)}"), "no first-pass h1 accent");
  assert.ok(!css.includes(".lead{font-size:1.15rem;color:var(--muted)"), "no first-pass lead");
  assert.ok(css.includes(".hero h1 em{font-style:normal;color:var(--blue)}"), "winning accent stays");
});

test("kept motion sits inside the motion-allowed guard", () => {
  const guardAt = css.indexOf("@media (prefers-reduced-motion:no-preference)");
  assert.ok(guardAt > 0, "the motion-allowed guard is present");
  for (const rule of [
    ".btn,.topnav a{transition:background-color .18s ease",
    ".more a{display:inline-block",
    ".more a:hover{transform:translateX(4px)}",
    "details{interpolate-size:allow-keywords}",
  ]) {
    assert.ok(css.indexOf(rule) > guardAt, `guarded: ${rule.slice(0, 30)}`);
  }
});

test("every section survives", () => {
  assert.equal(page.match(/<div class="stage">/g).length, 4, "4 stages stay");
  assert.equal(page.match(/<div class="card">/g).length, 3, "3 cards stay");
  assert.equal(page.match(/<details>/g).length, 5, "5 questions stay");
  assert.equal(page.match(/class="friend yb"/g).length, 1, "the friend card stays");
});

test("head and social tags stay put", () => {
  assert.ok(page.includes('theme-color" content="#EEF2F6"'), "theme color kept");
  assert.ok(page.includes('rel="canonical" href="https://altradits.com/bitcoin"'), "canonical kept");
  assert.ok(page.includes('property="og:title"'), "social title kept");
  assert.ok(page.includes('name="twitter:card"'), "social card kept");
});
