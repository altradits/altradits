// #607: login codes and recovery links go only to the confirmed address
// (api/yebente.js sends codes to a confirmed email, links to wallets
// confirmed with it), so the guide must say confirmed email where it
// promises login and recovery. Run: node --test test/guide-email-truth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const guide = fs.readFileSync(path.join(ROOT, "wallet-guide.html"), "utf8");
const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/)[1]).mainEntity;
const QUESTIONS = ["What if someone takes my phone?", "What if I lose my phone?", "How do I log in on a new phone?"];

test("the step caption tells the reader to confirm the email", () => {
  assert.match(guide, /Pick a PIN, add your email\.<\/b> Confirm it so you can log in later\./, "step 2 names the confirmation tap");
});

test("the three email answers say confirmed email", () => {
  for (const q of QUESTIONS) {
    const start = guide.indexOf(`<summary>${q}</summary><p>`);
    assert.ok(start !== -1, `${q} is on the page`);
    const answer = guide.slice(start).split("</p>")[0];
    assert.ok(answer.includes("confirmed email"), `${q} qualifies the email`);
    assert.ok(!answer.includes("\u2014"), `${q} keeps plain punctuation`);
  }
});

test("the question data mirrors the confirmed wording", () => {
  assert.equal(ld.length, 10, "the guide still holds 10 questions");
  for (const q of QUESTIONS) {
    const hit = ld.find((e) => e.name === q);
    assert.ok(hit, `${q} is in the data`);
    assert.ok(hit.acceptedAnswer.text.includes("confirmed email"), `${q} data qualifies the email`);
  }
});
