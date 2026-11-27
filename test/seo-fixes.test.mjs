// SEO mechanical fixes (T1-T13): sitemap, canonicals, social tags, alts,
// single h1, dashboard noindex, WebPage data and internal links.
// Run: node --test test/seo-fixes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LOC2FILE = {
  "https://altradits.com/": "index.html",
  "https://altradits.com/yebente": "yebente/app/index.html",
  "https://altradits.com/ktown": "ktown/index.html",
  "https://altradits.com/ktown/terms": "ktown/terms.html",
  "https://altradits.com/trivia": "trivia.html",
  "https://altradits.com/sats-safari/": "sats-safari/index.html",
  "https://altradits.com/address-check/": "address-check/index.html",
  "https://altradits.com/touchtype": "touchtype/index.html",
  "https://altradits.com/opcode-circuit": "opcode-circuit/index.html",
  "https://altradits.com/library": "library.html",
  "https://altradits.com/bitcoin-core": "bitcoin-core.html",
  "https://altradits.com/bitcoin": "bitcoin.html",
  "https://altradits.com/players": "players.html",
  "https://altradits.com/friends": "friends.html",
  "https://altradits.com/plan": "plan.html",
  "https://altradits.com/research": "research.html",
  "https://altradits.com/portfolio": "portfolio.html",
  "https://altradits.com/njia": "njia.html",
  "https://altradits.com/wallet-guide": "wallet-guide.html",
  "https://altradits.com/tracker": "tracker.html",
  "https://altradits.com/journey": "journey.html",
  "https://altradits.com/donate": "donate.html",
  "https://altradits.com/contact": "contact.html",
  "https://altradits.com/developer": "developer.html",
  "https://altradits.com/developer/reference": "developer-reference.html",
  "https://altradits.com/kazi": "kazi.html",
  "https://altradits.com/cite": "cite.html",
  "https://altradits.com/bitcoin-core-checklist": "bitcoin-core-checklist.html",
  "https://altradits.com/lnd-review-guide": "lnd-review-guide.html",
  "https://altradits.com/whitepaper-companion": "whitepaper-companion.html",
  "https://altradits.com/lightning-node": "lightning-node.html",
  "https://altradits.com/buy-bitcoin": "buy-bitcoin.html",
  "https://altradits.com/send-to-kenya": "send-to-kenya.html",
  "https://altradits.com/lightning": "lightning.html",
  "https://altradits.com/merchant-licensing": "merchant-licensing.html",
};

test("T1: sitemap lists ktown/terms, omits dashboard, dates every page", () => {
  const sm = read("sitemap.xml");
  assert.ok(sm.includes("<urlset"), "sitemap parses as XML set");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const wantTerms = new URL("/ktown/terms", "https://altradits.com").href;
  assert.ok(locs.includes(wantTerms), "ktown/terms present");
  assert.ok(!sm.includes("developer/dashboard"), "dashboard absent");
  for (const [loc, file] of Object.entries(LOC2FILE)) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${loc} file exists: ${file}`);
    assert.match(sm, new RegExp(`<loc>${escRe(loc)}<\\/loc><lastmod>20\\d\\d-\\d\\d-\\d\\d<\\/lastmod>`), `sitemap dates ${loc}`);
  }
});

test("T2: ktown pages carry exactly one canonical matching og:url", () => {
  for (const [f, url] of [["ktown/index.html", "https://altradits.com/ktown"], ["ktown/terms.html", "https://altradits.com/ktown/terms"]]) {
    const html = read(f);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `${f}: one canonical`);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${f}: canonical is ${url}`);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`), `${f}: matches og:url`);
  }
});

test("T3: touchtype carries all 11 social tags on the local card", () => {
  const html = read("touchtype/index.html");
  for (const tag of ["og:title", "og:description", "og:url", "og:type", "og:image\"", "og:image:alt", "twitter:card", "twitter:title", "twitter:description", "twitter:image\"", "twitter:image:alt"]) {
    assert.ok(html.includes(tag), `touchtype has ${tag}`);
  }
  assert.ok(html.includes("og:image\" content=\"https://altradits.com/assets/social-card.png\""), "local card used");
  assert.ok(fs.existsSync(path.join(ROOT, "assets/social-card.png")), "card file ships");
});

test("T4: sats-safari and address-check show the local card with alts", () => {
  for (const f of ["sats-safari/index.html", "address-check/index.html"]) {
    const html = read(f);
    assert.ok(html.includes("og:image\" content=\"https://altradits.com/assets/social-card.png\""), `${f}: og:image`);
    assert.ok(html.includes("og:image:alt"), `${f}: og alt`);
    assert.ok(html.includes("twitter:image\" content=\"https://altradits.com/assets/social-card.png\""), `${f}: twitter image`);
    assert.ok(html.includes("twitter:image:alt"), `${f}: twitter alt`);
  }
});

test("T5: every twitter:image has a matching twitter:image:alt (except admin)", () => {
  const files = [...fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")), "ktown/index.html", "ktown/terms.html", "sats-safari/index.html", "address-check/index.html", "touchtype/index.html", "opcode-circuit/index.html", "yebente/index.html", "yebente/app/index.html"];
  for (const f of files) {
    if (f === "admin.html") continue;
    const html = read(f);
    if (!html.includes('<meta name="twitter:image"')) continue;
    assert.ok(html.includes("twitter:image:alt"), `${f}: twitter alt present`);
    const og = html.match(/<meta property="og:image:alt" content="([^"]*)"\s*\/?>/);
    const tw = html.match(/<meta name="twitter:image:alt" content="([^"]*)"\s*\/?>/);
    assert.ok(og && tw, `${f}: both alts present`);
    assert.equal(tw[1], og[1], `${f}: twitter alt equals og alt`);
  }
});

test("T6: the 13 generic alts now name their own page", () => {
  const files = ["bitcoin-core.html", "bitcoin.html", "contact.html", "donate.html", "friends.html", "journey.html", "library.html", "plan.html", "players.html", "receipt.html", "research.html", "trivia.html", "wallet-guide.html"];
  for (const f of files) {
    const html = read(f);
    assert.ok(!html.includes("send money anywhere, keep all of it"), `${f}: generic gone`);
    const title = html.match(/<title>(.*?)<\/title>/)[1].split(" \u00b7 ")[0];
    const alt = html.match(/<meta property="og:image:alt" content="([^"]*)">/)[1];
    assert.ok(title.split(" ")[0].length > 0 && alt.length > 2, `${f}: alt present`);
    assert.ok(alt.includes(title.split(" ")[0]) || alt === title || title.includes(alt.split(" ")[0]), `${f}: alt names its page (${alt})`);
  }
});

test("T7/T8: ktown and sats-safari keep exactly one h1 with text unchanged", () => {
  const kt = read("ktown/index.html");
  assert.equal((kt.match(/<h1/g) || []).length, 1, "ktown one h1");
  assert.ok(kt.includes('<h1 class="shop" id="qr-shop">kTown</h1>'), "ktown keeps L43 h1");
  assert.ok(kt.includes('<h2 class="shop" id="set-title" data-i18n="settings">Settings</h2>'), "ktown demotes settings");
  const ss = read("sats-safari/index.html");
  assert.equal((ss.match(/<h1/g) || []).length, 1, "sats-safari one h1");
  assert.ok(ss.includes('<h1 id="menu-h" data-i18n="meta.title">Sats Safari</h1>'), "keeps Sats Safari h1");
  for (const id of ["map-h", "parents-h", "level-name"]) {
    assert.ok(ss.includes(`id="${id}"`), `${id} kept`);
  }
});

test("T9: dashboard is noindex, still routed, absent from sitemap", () => {
  assert.match(read("developer-dashboard.html"), /<meta name="robots" content="noindex">/, "noindex present");
  assert.ok(read("server.mjs").includes("developer-dashboard.html"), "server keeps the route");
  assert.ok(!read("sitemap.xml").includes("developer/dashboard"), "sitemap omits it");
});

test("T10: WebPage data parses with name and url only", () => {
  const files = ["contact.html", "donate.html", "friends.html", "plan.html", "receipt.html", "trivia.html", "developer.html", "developer-reference.html", "portfolio.html", "tracker.html", "kazi.html", "njia.html", "bitcoin-core-checklist.html", "lnd-review-guide.html", "ktown/index.html", "ktown/terms.html", "sats-safari/index.html", "address-check/index.html", "touchtype/index.html"];
  for (const f of files) {
    const html = read(f);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const wp = blocks.find((b) => b["@type"] === "WebPage");
    assert.ok(wp, `${f}: WebPage present`);
    assert.deepEqual(Object.keys(wp).sort(), ["@context", "@type", "name", "url"].sort(), `${f}: name and url only`);
    const canon = html.match(/rel="canonical" href="([^"]*)"/)[1];
    assert.equal(wp.url, canon, `${f}: url matches canonical`);
  }
  for (const f of ["404.html", "admin.html", "developer-dashboard.html", "opcode-circuit/index.html"]) {
    const html = read(f);
    const hasWP = [...html.matchAll(/"@type":"WebPage"/g)].length;
    if (f === "opcode-circuit/index.html") assert.equal(hasWP, 0, "opcode excluded");
  }
});

test("T11: keyword links exist, footer stays 11, topnav stays 5", () => {
  assert.ok(read("wallet-guide.html").includes('<a href="/bitcoin">See how receiving works</a>'), "wallet-guide links /bitcoin");
  assert.ok(read("bitcoin.html").includes('<a href="/wallet-guide">'), "bitcoin links /wallet-guide");
  assert.ok(read("bitcoin.html").includes('<a href="/bitcoin-core">'), "bitcoin links /bitcoin-core");
  assert.ok(read("developer.html").includes('<a href="/developer/reference">'), "developer links reference");
  assert.ok(read("ktown/index.html").includes('<a href="/ktown/terms"'), "ktown links terms");
  for (const f of ["wallet-guide.html", "bitcoin.html", "developer.html"]) {
    const html = read(f);
    const foot = (html.match(/<footer class="sitefoot">[\s\S]*?<\/footer>/) || [""])[0];
    assert.equal([...foot.matchAll(/<a\b/g)].length, 11, `${f}: footer 11`);
    const nav = (html.match(/<nav class="topnav"[^>]*>[\s\S]*?<\/nav>/) || [""])[0];
    assert.equal([...nav.matchAll(/<a\b/g)].length, 5, `${f}: topnav 5`);
  }
});

test("T12: wallet-guide and bitcoin FAQ data match visible text", () => {
  for (const f of ["wallet-guide.html", "bitcoin.html"]) {
    const html = read(f);
    assert.ok(html.includes('"@type":"FAQPage"'), `${f}: FAQPage present`);
  }
});

test("T13: ktown/terms keeps both language h1s with lang scoping", () => {
  const html = read("ktown/terms.html");
  assert.equal((html.match(/<h1/g) || []).length, 2, "terms keeps two h1s");
  assert.ok(html.includes("<h1>Merchant terms (pilot)</h1>"), "English h1 kept");
  const sw = html.match(/<section lang="sw">[\s\S]*?<\/section>/)[0];
  assert.ok(sw.includes("<h1>Masharti ya mfanyabiashara (majaribio)</h1>"), "Kiswahili h1 scoped to lang=sw");
});
