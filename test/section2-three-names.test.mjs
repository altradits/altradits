// Three names, one project: airy definition list with divided rows, not cards.
// The h2 plus name list on the homepage. Names stay bold, each row links
// onward to its pinned destination, and row hover lives in the motion guard.
// Run: node --test test/section2-three-names.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const section = (home.match(/<section class="names"[\s\S]*?<\/section>/) || [""])[0];

test("the section keeps its h2 and all three names as bold leads", () => {
  assert.ok(section, "homepage carries the names section");
  assert.ok(section.includes('<h2 id="names-h">Three names, one project</h2>'), "h2 kept");
  for (const name of ["Altradits", "Ye₿ente", "kTown"]) {
    assert.ok(section.includes(`<b>${name}</b>`), `names ${name}`);
  }
});

test("each name links onward to its pinned destination, one link per row", () => {
  const rows = [...section.matchAll(/<div class="names-row">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.equal(rows.length, 3, `three rows, found ${rows.length}`);
  for (const [row, name, href, label] of [
    [rows[0], "Altradits", "/portfolio", "See all apps"],
    [rows[1], "Ye₿ente", "/wallet-guide", "Ye₿ente guide"],
    [rows[2], "kTown", "/ktown", "Get kTown"],
  ]) {
    assert.ok(row.includes(`<b>${name}</b>`), `${name} leads its row`);
    assert.equal((row.match(/<a /g) || []).length, 1, `${name}: one link in the row`);
    assert.ok(row.includes(`<a href="${href}">${label}</a>`), `${name} links ${href} as "${label}"`);
  }
});

test("repeated destinations keep identical labels", () => {
  assert.ok(home.includes('<a href="/portfolio">See all apps</a>'), "Altradits row label kept (the closing carries no second pitch)");
  assert.ok(home.includes('<a href="/wallet-guide">Ye₿ente guide</a>'), "footer matches the Ye₿ente row label");
  assert.ok(home.includes('<h1>Take bitcoin. <em>Get M-Pesa.</em></h1>'), "hero untouched");
  assert.ok(home.includes('<a class="btn" href="/ktown">Get kTown</a>'), "hero CTA matches the kTown row label");
});

test("rows are a definition list with muted detail under ink leads", () => {
  assert.ok(section.includes('<dl class="names-list">'), "definition list kept");
  assert.equal((section.match(/<dt class="names-term">/g) || []).length, 3, "three terms");
  assert.equal((section.match(/<dd class="names-detail">/g) || []).length, 3, "three detail lines");
  assert.ok(home.includes(".names-term b{font:800"), "names set in Bricolage 800");
  assert.ok(home.includes(".names-detail{"), "detail line styled");
  assert.match(home, /\.names-detail\{[^}]*color:var\(--muted\)/, "detail is muted under the ink lead");
});

test("card chrome is gone: no family cards, no card lift on rows", () => {
  assert.ok(!home.includes('class="family"'), "family card list removed");
  assert.ok(!home.includes(".family"), "family card styles removed");
  assert.ok(!home.includes(".names-row:hover{transform"), "rows never lift like cards");
});

test("desktop gets an editorial grid, the section opens with a rule", () => {
  assert.match(
    home,
    /@media \(min-width:860px\)\{\.names\{display:grid;grid-template-columns:[^}]*;gap:clamp\(/,
    "narrow rail plus wide content with a fluid gap at >=860px",
  );
  assert.match(home, /\.names\{border-top:[^}]*padding-top:clamp\(/, "top rule with tight clamp padding");
  assert.match(home, /\.names-row\{[^}]*border-top:/, "divided rows");
});

test("row hover lives inside the reduced-motion guard only", () => {
  const guard = (home.match(/@media \(prefers-reduced-motion:no-preference\)\{.*/) || [""])[0];
  assert.ok(guard.includes(".names-row:hover"), "row hover in the motion-allowed block");
  const outside = home.replace(guard, "");
  assert.ok(!outside.includes(".names-row:hover"), "no row hover outside the guard");
});

test("rail matches the page spine, mobile links fill the touch target", () => {
  assert.ok(
    home.includes(".names{display:grid;grid-template-columns:minmax(14rem,19rem)"),
    "rail column shares the page spine",
  );
  assert.ok(home.includes(".names-link a{display:inline-block;padding:.45rem 0"), "mobile links fill the tap target");
  assert.ok(home.includes(".names-link a{padding:0}"), "padding resets on desktop rows");
  const guard = (home.match(/@media \(prefers-reduced-motion:no-preference\)\{.*/) || [""])[0];
  assert.ok(guard.includes(".names-link a:hover{color:var(--ink)}"), "link hover matches in the motion-allowed block");
});

test("section copy stays short with no em-dashes", () => {
  assert.ok(!section.includes("—"), "no em-dashes in the section");
  for (const d of [...section.matchAll(/<dd class="names-detail">(.*?)<\/dd>/g)].map((m) => m[1])) {
    for (const s of d.split(". ")) assert.ok(s.split(" ").length <= 10, `short sentence: ${s}`);
  }
});
