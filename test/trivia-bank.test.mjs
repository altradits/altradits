// Mempool Mayhem question bank (data/trivia/level-*.json): at least 150
// original Bitcoin and Lightning questions over 5 levels, each with 4
// choices, a valid answer and a published source.
// Run: node --test test/trivia-bank.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

process.env.TRIVIA = "on";
const t = await import("../lib/trivia.js");
const bank = t.loadBank(path.join(process.cwd(), "data", "trivia"));

test("bank holds 150 or more questions over 5 levels", () => {
  assert.deepEqual(bank.levels, ["beginner", "basic", "intermediate", "advanced", "expert"]);
  assert.ok(bank.questions.length >= 150, `only ${bank.questions.length} questions`);
  for (const level of bank.levels) {
    const n = bank.questions.filter((q) => q.level === level).length;
    assert.ok(n >= 20, `level ${level} has only ${n}`);
  }
});

test("every question has a unique id, 4 choices, a valid answer, a source", () => {
  const ids = new Set();
  for (const q of bank.questions) {
    assert.ok(q.id && !ids.has(q.id), `bad or repeated id: ${q.id}`);
    ids.add(q.id);
    assert.equal(q.choices.length, 4, `${q.id} needs 4 choices`);
    assert.ok(new Set(q.choices).size === 4, `${q.id} repeats a choice`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${q.id} has a bad answer`);
    assert.ok(q.source && q.source.length >= 4, `${q.id} has no source`);
    assert.ok(q.q.length >= 12, `${q.id} question is too short`);
  }
});

test("answers spread across positions: no always-pick-B bank", () => {
  const counts = [0, 0, 0, 0];
  for (const q of bank.questions) counts[q.answer] += 1;
  for (const [i, n] of counts.entries()) {
    assert.ok(n >= bank.questions.length * 0.15, `answer ${i} only ${n} times`);
  }
});

test("Kiswahili appears only as a careful extra, never half done", () => {
  for (const q of bank.questions) {
    if (q.choices_sw !== undefined) {
      assert.equal(q.choices_sw.length, 4, `${q.id} choices_sw must be 4`);
      assert.ok(q.q_sw, `${q.id} has Swahili choices but no Swahili question`);
    }
  }
});

test("public questions never leak the answer", () => {
  for (const q of bank.questions) {
    const pub = t.publicQuestion(q);
    assert.ok(!("answer" in pub), `${q.id} leaks its answer`);
    assert.equal(pub.id, q.id);
    assert.equal(pub.choices.length, 4);
  }
});

test("sources name published references", () => {
  const KNOWN = ["whitepaper", "BIP-", "BOLT", "bitcoin.org", "lnd docs", "Lightning Labs docs", "Lightning whitepaper", "Genesis block"];
  for (const q of bank.questions) {
    assert.ok(KNOWN.some((k) => q.source.includes(k)), `${q.id} source looks made up: ${q.source}`);
  }
});
