// New guide pages: present, indexable, valid head data, routed both stacks.
// Run: node --test test/content-pages.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const PAGES = {
  "lightning-node.html": "HowTo",
  "buy-bitcoin.html": "HowTo",
  "send-to-kenya.html": "HowTo",
  "lightning.html": "FAQPage",
  "merchant-licensing.html": "FAQPage",
};

test("guide pages exist, indexable, with valid head data", () => {
  for (const [f, type] of Object.entries(PAGES)) {
    const html = read(f);
    assert.doesNotMatch(html, /noindex/, `${f} indexable`);
    assert.match(html, /rel="canonical" href="https:\/\/altradits\.com\//, `${f} canonical`);
    assert.match(html, /og:image:alt" content="[^"]+"/, `${f} og alt`);
    assert.match(html, /twitter:image:alt" content="[^"]+"/, `${f} twitter alt`);
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, `${f} has JSON-LD`);
    assert.equal(JSON.parse(m[1])["@type"], type, `${f} is ${type}`);
    assert.match(html, /<h1>[\s\S]*?<\/h1>/, `${f} has one h1`);
  }
});

test("guide pages are routed, listed, and linked", () => {
  const sm = read("sitemap.xml"), llms = read("llms.txt");
  const server = read("server.mjs"), ht = read(".htaccess");
  for (const f of Object.keys(PAGES)) {
    const slug = f.replace(/\.html$/, "");
    assert.ok(sm.includes(`https://altradits.com/${slug}`), `${slug} in sitemap`);
    assert.ok(llms.includes(`/${slug}`), `${slug} in llms.txt`);
    assert.ok(server.includes(slug), `server routes ${slug}`);
    assert.ok(ht.includes(slug), `apache routes ${slug}`);
  }
});
