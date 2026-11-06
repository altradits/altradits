// FAQ merge: the wallet guide owns every wallet question, the homepage owns the
// kTown questions, /bitcoin owns the learning program, and none repeats the
// other. Each page's FAQPage data matches.
// Run: node --test test/faq-duplicates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const textOf = (s) => {
  let out = "", inTag = false; // drop <...> spans so link text compares with the JSON-LD words
  for (const c of s) {
    if (c === "<") inTag = true;
    else if (c === ">") inTag = false;
    else if (!inTag) out += c;
  }
  return out.replace(/\s+/g, " ").trim();
};
const faqs = (html) => [...html.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)]
  .map((m) => ({ q: textOf(m[1]), a: textOf(m[2]) }));
const ldFaq = (html) => {
  const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/);
  assert.ok(m, "page carries an FAQPage block");
  return JSON.parse(m[1]).mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }));
};

test("the guide, the homepage and /bitcoin share no question or answer", () => {
  const home = faqs(read("index.html"));
  const guide = faqs(read("wallet-guide.html"));
  const coins = faqs(read("bitcoin.html"));
  assert.equal(home.length, 10, `homepage holds 10 kTown questions, found ${home.length}`);
  assert.equal(guide.length, 10, `wallet guide holds 10 wallet questions, found ${guide.length}`);
  assert.equal(coins.length, 5, `/bitcoin holds 5 program questions, found ${coins.length}`);
  for (const [a, an, b, bn] of [[home, "homepage", coins, "/bitcoin"], [guide, "wallet guide", coins, "/bitcoin"], [home, "homepage", guide, "wallet guide"]]) {
    for (const x of a) {
      for (const y of b) {
        assert.notEqual(x.q, y.q, `question lives on both ${an} and ${bn}: ${x.q}`);
        assert.notEqual(x.a, y.a, `answer lives on both ${an} and ${bn} (under: ${x.q})`);
      }
    }
  }
});

for (const f of ["index.html", "wallet-guide.html", "bitcoin.html"]) {
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
