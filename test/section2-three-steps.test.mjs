// Three-steps section: open editorial rows, no boxed cards, no repeated phrasing.
// Run: node --test test/section2-three-steps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync("index.html", "utf8");
const style = home.slice(home.indexOf("<style>"), home.indexOf("</style>"));
const secStart = home.indexOf('<section class="how"');
const sec = home.slice(secStart, home.indexOf("</section>", secStart));

test("all three steps keep their titles and meanings", () => {
  for (const t of ["Register your M-Pesa number.", "Print your QR.", "Get paid in shillings."]) {
    assert.ok(home.includes(`<b>${t}</b>`), `step keeps its title: ${t}`);
  }
  assert.ok(home.includes("a 6-digit PIN"), "step 1 keeps the PIN detail");
  assert.ok(home.includes("It takes a few minutes."), "step 1 keeps the time detail");
  assert.ok(home.includes("Only one on display."), "step 2 keeps the single-code detail");
  assert.ok(home.includes("save the picture to your phone"), "step 2 keeps the save detail");
  assert.ok(home.includes("with its code"), "step 3 keeps the M-Pesa code detail");
  assert.ok(home.includes("Your history shows them all."), "step 3 keeps the history detail");
  assert.equal((home.match(/<ol class="steps">/g) || []).length, 1, "one steps list");
});

test("the heading and its intro stay put", () => {
  assert.ok(home.includes('<h2 id="how-h">For the shop: three steps</h2>'), "h2 text unchanged");
  assert.ok(home.includes("No app store, no special device, no crypto training for your staff."), "intro unchanged");
  assert.ok(home.includes('<section class="how" aria-labelledby="how-h">'), "section labels itself from the h2");
});

test("boxed-card chrome is gone", () => {
  assert.ok(!home.includes('class="head"'), "no .head row chrome");
  assert.ok(!home.includes('class="pace"'), "no .pace kickers");
  assert.ok(!style.includes(".steps .head"), "no .head CSS");
  assert.ok(!style.includes(".steps .pace"), "no .pace CSS");
  assert.ok(!style.includes(".steps li{background"), "rows carry no card background");
});

test("rows are open with hairline dividers and large numerals", () => {
  assert.ok(style.includes(".steps li{display:grid"), "rows lay out as open grids");
  assert.ok(style.includes("border-top:1px solid var(--line)"), "hairline dividers between rows");
  assert.ok(style.includes(".steps li:last-child{border-bottom:1px solid var(--line)}"), "the last row closes the list");
  assert.match(style, /\.steps \.n\{font:800 clamp\(2rem,4vw,2\.75rem\)/, "large Bricolage numerals");
  assert.ok(home.includes('<span class="n" aria-hidden="true">'), "numerals hide from readers (the list already counts)");
});

test("ink leads sit over muted detail with a capped measure", () => {
  assert.match(style, /\.steps p\{[^}]*color:var\(--muted\)/, "detail text is muted");
  assert.match(style, /\.steps p\{[^}]*max-width:34rem/, "Detail measure is capped");
  assert.match(style, /\.steps p b\{[^}]*color:var\(--ink\)/, "Titles are ink");
});

test("desktop gets an explicit editorial grid, small screens compact", () => {
  assert.ok(style.includes("@media (min-width:860px){.how{display:grid"), "rail plus content grid at 860px and up");
  assert.match(style, /grid-template-columns:minmax\(13rem,20rem\) minmax\(0,1fr\)/, "narrow rail, wide content");
  assert.match(style, /gap:clamp\(2rem,5vw,4rem\)/, "fluid gap between rail and rows");
  assert.ok(style.includes("@media (max-width:859px){.steps li{padding:1.15rem 0"), "small-screen compaction rule");
});

test("the section opens with a top rule and tight clamp padding", () => {
  assert.match(style, /\.how\{border-top:1px solid var\(--line\)/, "top rule");
  assert.match(style, /\.how\{[^}]*padding-top:clamp\(1\.25rem,3vw,2rem\)/, "tight clamp padding under the rule");
});

test("row hover lives inside the reduced-motion guard", () => {
  const guard = style.slice(style.indexOf("@media (prefers-reduced-motion:no-preference)"));
  assert.ok(guard.includes(".steps li:hover .n{color:var(--ink)}"), "hover shifts the numeral, guarded");
  assert.ok(guard.includes(".steps .n{transition:color .18s ease}"), "the shift eases, guarded");
  assert.ok(!guard.includes(".steps li:hover{transform"), "rows never lift like cards");
});

test("no repeated phrasing inside the section", () => {
  assert.equal((sec.match(/few minutes/g) || []).length, 1, "'a few minutes' said once");
  assert.equal((sec.match(/M-Pesa/g) || []).length, 2, "M-Pesa named twice, never padded");
  assert.ok(!sec.includes("One QR on the counter"), "step 2 no longer repeats the closing line verbatim");
  assert.equal((sec.match(/Print/g) || []).length, 1, "Print said once");
  assert.equal((sec.match(/QR/g) || []).length, 1, "QR said once");
  assert.equal((sec.match(/\bpayment\b/gi) || []).length, 0, "no payment padding in step 3");
  assert.equal((sec.match(/\beach\b/gi) || []).length, 0, "no Each left in step 3");
  assert.equal((sec.match(/\bevery\b/gi) || []).length, 0, "no every left in step 3");
  assert.equal((sec.match(/code/g) || []).length, 1, "code said once, one referent");
  assert.ok(!sec.includes("counter"), "counter stays with the closing line");
});

test("section copy uses short sentences and no em-dashes", () => {
  assert.ok(!sec.includes("\u2014"), "no em-dashes in the section");
  const text = sec.replace(/<\/(p|h2|li)>/g, ". ").replace(/<[^>]+>/g, " ");
  for (const s of text.split(/[.!?]/).map((x) => x.trim()).filter(Boolean)) {
    assert.ok(s.split(/\s+/).length <= 12, `short sentence: ${s}`);
  }
});
