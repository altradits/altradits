// Site simplicity guard (Part of #577): every inner page shares one 4-pillar
// top nav (kTown, Ye₿ente, Developer, Library) and every public page shares
// one concise mission footer without switched-off clutter.
// Run: node --test test/site-simplicity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SKIP = new Set(["index.html", "admin.html", "receipt.html", "404.html"]);
const INNER = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && !SKIP.has(f)).sort();

test("every inner page uses the unified 4-pillar top nav", () => {
  assert.ok(INNER.length >= 15, "inner pages found");
  for (const f of INNER) {
    const html = read(f);
    const nav = (html.match(/<nav class="topnav"[^>]*>[\s\S]*?<\/nav>/) || [""])[0];
    for (const href of ["/ktown", "/wallet-guide", "/developer", "/library"]) {
      assert.ok(nav.includes(`href="${href}"`), `${f}: topnav links ${href}`);
    }
    const links = [...nav.matchAll(/<a\b/g)].length;
    assert.equal(links, 5, `${f}: topnav stays focused at 4 pillars + 1 primary CTA`);
  }
});

test("every public page shares one concise mission footer without switched-off clutter", () => {
  for (const f of ["index.html", ...INNER]) {
    const html = read(f);
    const foot = (html.match(/<footer class="sitefoot">[\s\S]*?<\/footer>/) || [""])[0];
    for (const href of ["/ktown", "/ktown/terms", "/yebente", "/wallet-guide", "/developer", "/contact"]) {
      assert.ok(foot.includes(`href="${href}"`), `${f}: footer links ${href}`);
    }
    for (const href of ["https://github.com/altradits", "https://x.com/altradits", "https://www.tiktok.com/@5tan_lee", "https://www.linkedin.com/in/stanmobitech/"]) {
      assert.ok(foot.includes(`href="${href}"`), `${f}: footer links social ${href}`);
    }
    for (const off of ["/kazi", "/trivia", "/njia"]) {
      assert.ok(!foot.includes(`href="${off}"`), `${f}: footer omits switched-off ${off}`);
    }
    const links = [...foot.matchAll(/<a\b/g)].length;
    assert.equal(links, 11, `${f}: footer stays concise (whitepaper + 6 core links + 4 social icons)`);
  }
});

test("sitemap ranks kTown and home first, and demotes switched-off features", () => {
  const sm = read("sitemap.xml");
  assert.match(sm, /<loc>https:\/\/altradits\.com\/<\/loc><lastmod>[^<]+<\/lastmod><priority>1\.0<\/priority>/);
  assert.match(sm, /<loc>https:\/\/altradits\.com\/ktown<\/loc><lastmod>[^<]+<\/lastmod><priority>1\.0<\/priority>/);
  for (const off of ["kazi", "njia", "trivia"]) {
    assert.match(sm, new RegExp(`<loc>https://altradits\\.com/${off}</loc><lastmod>[^<]+</lastmod><priority>0\\.2</priority>`), `sitemap: switched-off /${off} stays at 0.2`);
  }
});

test("portfolio leads with the three core products and folds experiments into details", () => {
  const html = read("portfolio.html");
  const split = html.indexOf('<details class="more-apps">');
  assert.ok(split > 0, "portfolio.html: secondary apps fold inside details");
  const top = html.slice(0, split);
  for (const href of ["/ktown", "/yebente", "/developer"]) {
    assert.ok(top.includes(`href="${href}"`), `portfolio.html: core grid features ${href}`);
  }
  const topCards = [...top.matchAll(/<a class="card"/g)].length;
  assert.equal(topCards, 3, "portfolio.html: top grid stays focused at the 3 core products");
  for (const cls of ["is-ktown", "is-yebente", "is-dev"]) {
    assert.ok(top.includes(cls), `portfolio.html: flagship card carries ${cls} mood styling`);
  }
  for (const guide of ['href="/"', 'href="/wallet-guide"', 'href="/developer/reference"']) {
    assert.ok(top.includes(guide), `portfolio.html: flagship subbar links ${guide}`);
  }
  assert.ok(top.includes('/assets/yebente-home.png'), "portfolio.html: Ye₿ente card showcases the live home screen");
});
