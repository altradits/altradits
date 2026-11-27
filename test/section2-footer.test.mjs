// Homepage footer: three scannable groups in an editorial rail + content grid.
// The credit line, the labelled nav and the social icon row keep every link,
// icon, href, aria-label and order; flex gaps replace the old middot row.
// Run: node --test test/section2-footer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const foot = (html.match(/<footer class="sitefoot">[\s\S]*?<\/footer>/) || [""])[0];
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

test("footer keeps all 11 links, icons and order", () => {
  assert.ok(foot.length > 100, "footer markup found");
  assert.equal([...foot.matchAll(/<a\b/g)].length, 11, "whitepaper + 6 core links + 4 social icons");
  assert.deepEqual(
    [...foot.matchAll(/href="([^"]*)"/g)].map((m) => m[1]),
    ["https://bitcoin.org/bitcoin.pdf", "/ktown", "/ktown/terms", "/yebente", "/wallet-guide",
      "/developer", "/contact", "https://github.com/altradits",
      "https://www.linkedin.com/in/stanmobitech/", "https://x.com/altradits",
      "https://www.tiktok.com/@5tan_lee"],
  );
  for (const label of ["GitHub profile", "LinkedIn profile", "X profile", "TikTok profile"])
    assert.ok(foot.includes(`aria-label="${label}"`), `social keeps its label: ${label}`);
  assert.equal((foot.match(/<svg/g) || []).length, 4, "four icon svgs, no text names");
  assert.ok(html.includes('<a href="/yebente">Ye₿ente wallet</a>'), "wallet anchor byte-identical");
  assert.ok(html.includes('<a href="/wallet-guide">Ye₿ente guide</a>'), "guide anchor byte-identical");
});

test("footer reads as three groups: credit line, labelled nav, social row", () => {
  assert.ok(foot.includes('<div class="credit">'), "credit group");
  assert.ok(foot.includes("© Altradits"), "credit line kept");
  assert.ok(foot.includes('<nav class="footnav" aria-label="Footer">'), "labelled nav");
  assert.ok(foot.includes('<div class="socials">'), "social icon row");
  assert.ok(!foot.includes("·"), "no middot separators: flex gaps do the spacing");
  assert.ok(foot.indexOf("© Altradits") < foot.indexOf("bitcoin.org/bitcoin.pdf"), "ink lead first, muted credit under it");
});

test("desktop gets the editorial grid, small screens stack through one query", () => {
  assert.ok(css.includes(".sitefoot .footgrid{display:grid;grid-template-columns:1fr;gap:clamp(1.75rem,4vw,3.5rem);align-items:start}"),
    "mobile-first single column with a fluid gap");
  assert.ok(css.includes("@media (min-width:860px){.sitefoot .footgrid{grid-template-columns:minmax(14rem,19rem) minmax(0,1fr);column-gap:clamp(2rem,5vw,4rem)}}"),
    "desktop rail locks onto the shared spine with the shared gap");
  assert.equal((css.match(/@media \(max-width:859px\)/g) || []).length, 1, "one small-screen query");
  assert.ok(!/@media \(max-width:859px\)[^@]*sitefoot/.test(css), "footer needs no max-width override");
  assert.ok(css.includes(".sitefoot .socials{display:flex;flex-wrap:wrap;gap:.6rem;margin-left:-.75rem}"),
    "social glyphs align flush with the nav above");
});

test("tap targets are padded and the section opens with a rule", () => {
  assert.ok(css.includes(".sitefoot .footnav a{") && css.includes("padding:.65rem .1rem"), "nav links padded");
  assert.ok(css.includes("min-width:2.75rem;min-height:2.75rem"), "44px social targets");
  assert.ok(css.includes(".sitefoot{padding:clamp(2rem,4vw,3rem) 0 clamp(2.5rem,5vw,3.5rem);"),
    "clamp padding under the top rule");
  assert.ok(css.includes("border-top:1px solid var(--line)"), "top rule kept");
});

test("footer hover and transitions live inside the motion-allowed guard", () => {
  const lines = css.split("\n");
  const guarded = lines.filter((l) => l.startsWith("@media (prefers-reduced-motion:no-preference)")).join("\n");
  const unguarded = lines.filter((l) => !l.startsWith("@media (prefers-reduced-motion")).join("\n");
  assert.ok(guarded.includes(".sitefoot a{transition:color .18s ease}"), "eased footer links for motion-allowed visitors");
  assert.ok(guarded.includes("a.soc:hover"), "social hover guarded");
  assert.ok(guarded.includes(".sitefoot .footnav a:hover"), "nav hover guarded");
  assert.ok(!unguarded.includes(".sitefoot") || !/\.sitefoot[^{]*:hover/.test(unguarded), "no footer hover outside the guard");
  assert.ok(!/\.sitefoot[^{]*\{[^}]*transition:/.test(unguarded), "no footer transition outside the guard");
});
