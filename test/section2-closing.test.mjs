// Closing push: calm final section before the footer. Short h2, one line,
// single CTA to /ktown, top hairline, generous padding. No second pitch,
// no wrapper divs, no dark panel.
// Run: node --test test/section2-closing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const section = html.match(/<section class="closing"[\s\S]*?<\/section>/)?.[0] ?? "";
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

test("closing keeps its labelled section with a short h2 and one line", () => {
  assert.ok(section, "missing section.closing");
  assert.match(section, /aria-labelledby="pilot-cta"/);
  const h2 = section.match(/<h2 id="pilot-cta">([^<]*)<\/h2>/)?.[1] ?? "";
  assert.ok(h2, "missing closing h2");
  assert.ok(h2.split(/\s+/).length <= 6, `closing h2 too long: ${h2}`);
  assert.equal((section.match(/<p>/g) ?? []).length, 1, "closing must carry exactly one line");
});

test("closing carries a single CTA with the kept label and destination", () => {
  const links = [...section.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)];
  assert.equal(links.length, 1, "closing must carry exactly one link");
  assert.equal(links[0][1], "/ktown");
  assert.equal(links[0][2], "Get kTown for your shop");
  assert.ok(!section.includes("/portfolio"), "second pitch link is gone");
});

test("closing has no wrapper divs and no second pitch copy", () => {
  assert.ok(!section.includes("<div"), "wrapper divs are gone");
  assert.ok(!section.includes("class=\"ctas\""), "ctas wrapper is gone");
  assert.ok(!section.includes("One QR on the counter"), "second pitch sentence is gone");
});

test("closing styling is calm: top hairline, clamp padding, no dark panel", () => {
  assert.match(css, /\.closing\{[^}]*border-top:1px solid var\(--line\)/);
  assert.match(css, /\.closing\{[^}]*padding:clamp\(/);
  assert.ok(!css.includes(".closing .ctas"), "ctas override is gone");
  assert.ok(!css.includes(".closing .btn.ghost"), "ghost-on-dark override is gone");
  const rules = css.split("@media (min-width:860px)")[0];
  assert.ok(!/\.closing\{[^}]*background:var\(--ink\)/.test(rules), "dark panel is gone");
});

test("closing uses an explicit editorial grid at desktop widths", () => {
  assert.match(css, /@media \(min-width:860px\)\{\.closing\{display:grid;grid-template-columns:minmax\(14rem,19rem\) minmax\(0,1fr\);gap:0 clamp\(2rem,5vw,4rem\)/);
  assert.match(css, /\.closing h2\{[^}]*grid-row:1\/3/);
  assert.match(css, /\.closing \.btn\{grid-column:2;justify-self:start\}/);
});

test("closing rides the shared rail with a balanced head and pill CTA", () => {
  assert.match(css, /\.closing h2\{[^}]*text-wrap:balance/);
  assert.ok(css.includes(".closing .btn{border-radius:99px;min-height:3.2rem;padding:.9rem 1.85rem}"), "closing CTA echoes the hero pill");
});

test("closing adds no motion and no em-dashes", () => {
  assert.ok(!section.includes("—"), "no em-dashes in closing copy");
  for (const line of css.split("\n")) {
    if (line.includes(".closing") && (line.includes(":hover") || line.includes("transition") || line.includes("animation"))) {
      assert.fail(`closing motion/hover must live in the reduced-motion guard: ${line}`);
    }
  }
});
