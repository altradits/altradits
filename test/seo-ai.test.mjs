// AI readiness and outreach pages: indexability, structured data, citation,
// served contract, study guides, and legend cards computed from the log.
// Run: node --test test/seo-ai.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REVIEWS } from "../data/reviews.js";
import { buildBillboard } from "../lib/tracker.js";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PUB = eval(read("server.mjs").match(/const PUBLIC = (\/.*\/);/)[1]);
const LIFTED = ["library.html", "bitcoin-core.html", "bitcoin.html", "players.html",
  "tracker.html", "journey.html", "wallet-guide.html", "developer.html",
  "developer-reference.html", "developer-dashboard.html", "donate.html",
  "research.html", "portfolio.html", "friends.html", "plan.html",
  "kazi.html", "njia.html", "trivia.html"];
const NEW = ["cite.html", "bitcoin-core-checklist.html", "lnd-review-guide.html",
  "whitepaper-companion.html"];
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1]));

test("T1: public content pages are indexable, private shells stay noindex", () => {
  for (const f of LIFTED) assert.doesNotMatch(read(f), /noindex/, `${f}: lifted`);
  for (const f of ["admin.html", "404.html", "receipt.html", "contact.html"]) {
    assert.match(read(f), /<meta name="robots" content="noindex">/, `${f}: still noindex`);
  }
  const robots = read("robots.txt");
  for (const d of ["/admin", "/api/", "/k/"]) assert.ok(robots.includes(`Disallow: ${d}`), `robots keeps ${d}`);
  assert.match(robots, /Sitemap: https:\/\/altradits\.com\/sitemap\.xml/);
});

test("T2: llms.txt covers the whole public site with exact fees", () => {
  const llms = read("llms.txt");
  for (const p of ["/ktown", "/yebente", "/wallet-guide", "/developer", "/developer/reference",
      "/developer/dashboard", "/library", "/bitcoin-core", "/bitcoin", "/players",
      "/tracker", "/journey", "/plan", "/research", "/cite", "/contact"]) {
    assert.ok(llms.includes(p), `llms.txt mentions ${p}`);
  }
  assert.ok(llms.includes("CITATION.cff"), "llms.txt mentions CITATION.cff");
  assert.match(llms, /kTown payout fee is 1 percent/, "kTown fee quoted exactly");
  assert.match(llms, /Developer API live use costs 0\.5 percent, prepaid in sats/, "API fee quoted exactly");
  assert.doesNotMatch(llms, /not promoted/, "no not-promoted framing");
  assert.ok(PUB.test("/llms.txt"), "server.mjs PUBLIC serves llms.txt");
});

test("T3: homepage carries Organization plus WebSite data, apps untouched", () => {
  const blocks = ldBlocks(read("index.html"));
  const org = blocks.find((b) => b["@type"] === "Organization");
  assert.equal(org.name, "Altradits");
  assert.equal(org.url, "https://altradits.com/");
  assert.equal(org.logo, "https://altradits.com/assets/logo.png");
  assert.ok(fs.existsSync(path.join(ROOT, "assets/logo.png")), "logo file ships");
  assert.deepEqual(org.sameAs, ["https://github.com/altradits",
    "https://www.linkedin.com/in/stanmobitech/", "https://x.com/altradits",
    "https://www.tiktok.com/@5tan_lee"]);
  assert.equal(org.founder.name, "Stanley Chege Thuita");
  const site = blocks.find((b) => b["@type"] === "WebSite");
  assert.equal(site.name, "Altradits");
  assert.equal(site.url, "https://altradits.com/");
  assert.ok(!("potentialAction" in site) && !JSON.stringify(site).includes("SearchAction"), "no SearchAction");
  assert.equal(blocks.filter((b) => b["@type"] === "SoftwareApplication").length, 2, "both app blocks kept");
  assert.equal(blocks.filter((b) => b["@type"] === "FAQPage").length, 1, "FAQ kept");
});

test("T4: CITATION.cff cites traced values only", () => {
  const cff = read("CITATION.cff");
  const pkg = JSON.parse(read("package.json"));
  assert.match(cff, /^cff-version: 1\.2\.0$/m);
  assert.match(cff, /^title: Altradits$/m);
  assert.match(cff, /^version: 0\.1\.0$/m);
  assert.equal(pkg.version, "0.1.0", "version matches package.json");
  assert.ok(cff.includes("Thuita") && cff.includes("Stanley Chege"), "author named");
  assert.ok(cff.includes("MIT") && cff.includes("https://github.com/altradits/altradits")
    && cff.includes("https://altradits.com"), "license, repo, site traced");
  assert.doesNotMatch(cff, /^date-released:/m, "no invented release date (owner fills it)");
});

test("T5: journey Person works for Altradits, research Article is dated from its meta", () => {
  const person = ldBlocks(read("journey.html")).find((b) => b["@type"] === "Person");
  assert.equal(person.name, "Stanley Chege Thuita");
  assert.equal(person.worksFor.name, "Altradits");
  assert.equal(person.worksFor.url, "https://altradits.com/");
  const research = read("research.html");
  const title = research.match(/<title>(.*) \u00b7 Altradits<\/title>/)[1];
  const art = ldBlocks(research).find((b) => b["@type"] === "Article");
  assert.equal(art.headline, title, "headline comes from the title tag");
  assert.equal(art.datePublished, "2026-11-05");
  assert.match(research, /5 Nov 2026/, "date matches the page's own meta wording");
  assert.equal(art.author.name, "Stanley Chege Thuita");
});

test("T6: the cite page renders, is listed, and is routed on both stacks", () => {
  const html = read("cite.html");
  assert.ok(html.includes('id="credit"') && html.includes('id="copycredit"'), "credit line plus copy button");
  assert.ok(html.includes("/contact"), "questions go to /contact");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/cite<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/);
  assert.ok(PUB.test("/cite.html"), "Node allowlists cite.html");
  assert.match(read("server.mjs"), /journey|library|[^)]*cite/, "Node routes /cite");
  assert.match(read(".htaccess"), /cite/, "Apache routes /cite");
});

test("T7: the OpenAPI contract is served as JSON on both stacks", () => {
  const spec = JSON.parse(read("docs/developer-openapi.json"));
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.version, "1.4.0");
  const srv = read("server.mjs");
  assert.ok(PUB.test("/docs/developer-openapi.json"), "Node allowlists the contract");
  assert.ok(srv.includes("const oas = url.pathname.match(") && srv.includes('"/docs/developer-openapi.json"'), "Node maps /developer/openapi.json");
  const ht = read(".htaccess");
  assert.ok(ht.includes("RewriteRule ^developer/openapi") && ht.includes("docs/developer-openapi.json"), "Apache maps it too");
  assert.ok(read("docs/.htaccess").includes("developer-openapi.json"), "docs carve-out serves the file");
  assert.match(read("docs/.htaccess"), /Require all denied/, "the rest of docs stays denied");
  assert.ok(read("llms.txt").includes("/developer/openapi.json"), "llms.txt links the contract");
  assert.ok(read("developer-reference.html").includes('href="/developer/openapi.json"'), "reference links it");
});

test("T8: library stages share by anchor, ticks persist only in the browser", () => {
  const html = read("library.html");
  const stages = [...html.matchAll(/<section id="([a-z]+)" class="stage">/g)].map((m) => m[1]);
  assert.equal(stages.length, 8, "8 stages");
  for (const id of stages) assert.ok(html.includes(`<a href="#${id}">Share this stage</a>`), `#${id} shares`);
  assert.equal((html.match(/<ol class="reads">/g) || []).length, 8);
  assert.ok(html.includes('id="progress"'), "progress line present");
  assert.ok(html.includes("library-done") && html.includes("localStorage"), "ticks persist client-side");
  assert.ok(html.includes("Mark read: "), "checkboxes carry spoken names");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  assert.doesNotMatch(scripts, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/, "no tracking calls");
  assert.ok(html.includes('"@type":"ItemList"'), "ItemList schema kept");
});

test("T9: the Core checklist stays inside the full guide", () => {
  const html = read("bitcoin-core-checklist.html");
  const guide = read("bitcoin-core.html");
  const links = [...html.matchAll(/href="\/bitcoin-core(#[a-z-]+)?"/g)].map((m) => m[1] || "");
  assert.ok(links.length > 10, "every section links back");
  for (const a of new Set(links.filter(Boolean))) {
    assert.ok(guide.includes(`id="${a.slice(1)}"`), `${a} resolves in the full guide`);
  }
  assert.doesNotMatch(html, /"@type":"HowTo"/, "HowTo stays on the full guide only");
  assert.ok(guide.includes('"@type":"HowTo"'), "full guide keeps its HowTo");
  assert.ok(guide.includes('href="/bitcoin-core-checklist"'), "full guide links the checklist");
  assert.match(read("sitemap.xml"), /bitcoin-core-checklist<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/);
});

test("T10: the review guide cites only logged reviews with proof", () => {
  const html = read("lnd-review-guide.html");
  assert.ok(html.includes(`${REVIEWS.length} reviews`), "stated count matches the log");
  const dates = REVIEWS.map((r) => r.date).sort();
  assert.ok(html.includes(`${dates[0]} to ${dates[dates.length - 1]}`), "stated span matches the log");
  const byComment = new Map(REVIEWS.map((r) => [r.comment, r]));
  const proofs = [...html.matchAll(/href="(https:\/\/github\.com\/[^"]+#issuecomment-[^"]+)"/g)].map((m) => m[1]);
  assert.equal(proofs.length, REVIEWS.length, "one proof link per logged review");
  for (const u of proofs) assert.ok(byComment.has(u), `proof resolves to the log: ${u}`);
  for (const r of REVIEWS) {
    const anchor = `review-${r.repo.replace(/[^a-z0-9]+/gi, "-")}-${r.number}`;
    assert.ok(html.includes(`tracker#${anchor}`), `entry linked: ${anchor}`);
    assert.ok(html.includes(r.lesson), `lesson quoted: ${r.title}`);
  }
});

test("T11: the VASP timeline dates carry sources", () => {
  const html = read("research.html");
  const keys = html.slice(html.indexOf("<h3>Key dates</h3>"), html.indexOf("<h3>Fees today</h3>"));
  for (const [date, host] of [["4 Nov 2025", "ensafrica.com"], ["22 Jul 2026", "vellum.co.ke"],
      ["4 Nov 2026", "cryptonewsfocus.com"]]) {
    const line = keys.split("\n").find((l) => l.includes(date));
    assert.ok(line && line.includes(host), `${date} links ${host}`);
  }
});

test("T12: the companion links the canonical paper only, plus Kiswahili", () => {
  const html = read("whitepaper-companion.html");
  assert.ok(html.includes("https://bitcoin.org/bitcoin.pdf"), "paper linked canonically");
  assert.ok(html.includes('lang="sw"'), "Kiswahili summaries present");
  assert.ok(html.includes("License note"), "license note present");
  for (const f of [...LIFTED, ...NEW]) {
    assert.doesNotMatch(read(f), /docs\/bitcoin-whitepaper\.pdf/, `${f}: no internal PDF mirror`);
  }
});

test("T13: legend cards link entries plus GitHub and thank with lessons", () => {
  const r = (author, o) => ({ author, status: "open", repo: "x/y", number: 7, title: "t",
    comment: "https://github.com/x/y/pull/7#c", kind: "review", lesson: "L", ...o });
  const b = buildBillboard([r("Roasbeef"), r("ziggie1984", { kind: "research", number: 9,
    repo: "a/b", lesson: "R" })]);
  const first = b.legends.find((l) => l.login === "Roasbeef").titles[0];
  assert.equal(first.anchor, "#review-x-y-7");
  assert.equal(first.pr, "https://github.com/x/y/pull/7");
  assert.equal(first.lesson, "L");
  const res = b.legends.find((l) => l.login === "ziggie1984").titles[0];
  assert.equal(res.pr, "https://github.com/a/b/issues/9");
  const html = read("tracker.html");
  assert.ok(html.includes("t.anchor || t.url"), "cards prefer the review entry");
  assert.ok(html.includes("On GitHub"), "cards link the pull request");
  assert.ok(html.includes("What I learned:"), "thanks quote the lesson");
  const rem = read("data/remembrance.js");
  assert.ok(rem.includes("Hal Finney") && rem.includes("1956-2014"), "remembrance entry unchanged");
});

test("house style: no em-dashes in the new and touched copy", () => {
  for (const f of ["llms.txt", "CITATION.cff", "sitemap.xml", ...NEW]) {
    assert.doesNotMatch(read(f), /\u2014/, `${f}: plain copy, no em-dash`);
  }
});
