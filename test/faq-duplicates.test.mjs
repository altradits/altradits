// FAQ merge: the homepage owns every wallet question, /bitcoin owns the learning
// program, and neither repeats the other. Each page's FAQPage data matches.
// Run: node --test test/faq-duplicates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const faqs = (html) => [...html.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)]
  .map((m) => ({ q: strip(m[1]), a: strip(m[2]) }));
const ldFaq = (html) => {
  const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/);
  assert.ok(m, "page carries an FAQPage block");
  return JSON.parse(m[1]).mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }));
};

test("the homepage and /bitcoin share no question or answer", () => {
  const home = faqs(read("index.html"));
  const coins = faqs(read("bitcoin.html"));
  assert.equal(home.length, 10, `homepage holds 10 wallet questions, found ${home.length}`);
  assert.equal(coins.length, 5, `/bitcoin holds 5 program questions, found ${coins.length}`);
  for (const h of home) {
    for (const c of coins) {
      assert.notEqual(h.q, c.q, `question lives on both pages: ${h.q}`);
      assert.notEqual(h.a, c.a, `answer lives on both pages (under: ${h.q})`);
    }
  }
});

for (const f of ["index.html", "bitcoin.html"]) {
  test(`${f}: the FAQPage data matches the visible questions`, () => {
    const html = read(f);
    const visible = faqs(html);
    const data = ldFaq(html);
    assert.equal(data.length, visible.length, `${f}: FAQPage lists ${data.length}, page shows ${visible.length}`);
    for (const v of visible) {
      const hit = data.find((d) => d.q === v.q);
      assert.ok(hit, `${f}: missing from FAQPage: ${v.q}`);
      assert.equal(hit.a, v.a, `${f}: FAQPage answer drifted for: ${v.q}`);
    }
  });
}
