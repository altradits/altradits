// Review #604: the pilot section below the hero keeps its editorial grid,
// row hierarchy, distinct copy, guarded hover and tight pacing.
// Run: node --test test/review-604.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const pilotCss = home.slice(home.indexOf(".pilot{"), home.indexOf(".steps{"));

test("1. desktop grid: two columns at 860px, narrow heading, full-width rows", () => {
  assert.ok(pilotCss.includes("@media (min-width:860px){.pilot{display:grid;grid-template-columns:.78fr 1.22fr"), "pilot goes .78fr/1.22fr at 860px");
  assert.ok(pilotCss.includes(".pilot h2{margin:0 0 clamp(2rem,4.5vw,3rem);max-width:13ch}"), "heading holds 13ch");
  assert.ok(pilotCss.includes(".pilot ol{list-style:none;margin:0;padding:0;max-width:none}"), "rows span the right column");
});

test("5. pacing: the section opens with a rule and tighter padding", () => {
  assert.ok(pilotCss.includes(".pilot{padding:clamp(3.25rem,6.5vw,5rem) 0;border-top:1.5px solid var(--line)}"), "border-top plus clamp(3.25rem,6.5vw,5rem) padding");
});

test("2. row hierarchy: detail muted, headline ink", () => {
  assert.ok(pilotCss.includes(".pilot p{margin:0;color:var(--muted)}"), "detail reads muted");
  assert.match(pilotCss, /\.pilot p b\{[^}]*color:var\(--ink\)/, "headline reads ink");
});

test("3. copy: each row says one new thing in short sentences", () => {
  for (const row of [
    "<b>Open now in Kisumu.</b> Limited places. Nothing to buy or install.",
    "<b>Keep your full price.</b> The customer covers the 1% fee.",
    "<b>Straight to M-Pesa.</b> kTown never holds money. No BTC exposure.",
  ]) {
    assert.ok(home.includes(row), `pilot keeps: ${row}`);
  }
  const pilotHtml = home.slice(home.indexOf('<section class="pilot"'), home.indexOf("</section>", home.indexOf('<section class="pilot"')));
  assert.ok(!pilotHtml.includes("—"), "pilot copy carries no em-dashes");
  assert.ok(!/Register, print one QR/i.test(pilotHtml), "pilot no longer repeats the three-steps section");
});

test("4. hover: tint, ink rule and index nudge, only where motion is allowed", () => {
  const guard = "@media (prefers-reduced-motion:no-preference){.pilot li{transition:background-color .18s ease,border-color .18s ease}";
  assert.ok(pilotCss.includes(guard), "hover transitions sit inside the motion-allowed guard");
  assert.ok(pilotCss.includes(".pilot li:hover{background-color:rgba(15,27,45,.04);border-top-color:var(--ink)}"), "hover tints the row and inks its rule");
  assert.ok(pilotCss.includes(".pilot li:hover .i{transform:translateX(4px)}"), "hover nudges the index");
  const guardAt = pilotCss.indexOf("@media (prefers-reduced-motion:no-preference)");
  assert.ok(guardAt > 0, "the motion-allowed guard is present");
  for (const m of pilotCss.matchAll(/\.pilot li:hover/g)) {
    assert.ok(m.index > guardAt, "no pilot hover rule escapes the guard");
  }
});

test("house rules kept: title, theme, motion and scrolled behavior", () => {
  for (const w of ["wallet", "bitcoin", "free"]) {
    assert.match(home, new RegExp(`<title>[^<]*${w}`, "i"), `title names ${w}`);
  }
  assert.ok(home.includes('theme-color" content="#EEF2F6"'), "theme color kept");
  assert.ok(home.includes("scroll-behavior:smooth"), "smooth scrolling kept");
  assert.ok(home.includes('classList.toggle("scrolled"'), "scrolled toggle kept");
  assert.equal((home.match(/<details><summary>/g) || []).length, 10, "FAQ count stays pinned at 10");
});
