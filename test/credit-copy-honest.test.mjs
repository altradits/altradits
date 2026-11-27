// Credit-line copy honesty (27 Nov 2026, #673): cite's live copy button
// names a denied copy instead of failing silently, and the three pages
// whose copy script never ran (no button, no paragraph) no longer ship it.
// Run: node --test test/credit-copy-honest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const cite = read("cite.html");

test("cite's copy button names a denied copy on both paths", () => {
  assert.match(cite, /\.then\(done,failed\)/, "a denied clipboard reaches failed");
  assert.match(cite, /Copy failed: select the text/, "the failure says what to do");
  assert.match(cite, /id="copycredit" aria-live="polite"/, "the swap is announced");
  assert.doesNotMatch(cite, /\.then\(done,function\(\)\{\}\)/, "no empty rejection handler");
  assert.match(cite, /if\(ok\)\{done\(\);\}/, "the old-browser path trusts only a true copy");
});

test("pages without the button ship no copy script", () => {
  for (const f of ["buy-bitcoin.html", "send-to-kenya.html", "lightning-node.html"]) {
    const src = read(f);
    assert.doesNotMatch(src, /copycredit/, `${f} has no copy hooks`);
    assert.doesNotMatch(src, /Copy the credit line/, `${f} has no copy block`);
    assert.doesNotMatch(src, /execCommand\("copy"\)/, `${f} has no copy fallback`);
  }
});

test("the removed blocks took no live code with them", () => {
  for (const f of ["buy-bitcoin.html", "send-to-kenya.html", "lightning-node.html", "cite.html"]) {
    const src = read(f);
    assert.match(src, /Not shown inside a frame/, `${f} keeps the frame buster`);
    assert.match(src, /classList\.toggle\("scrolled"/, `${f} keeps the nav shadow`);
  }
});
