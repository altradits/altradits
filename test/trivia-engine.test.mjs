// Mempool Mayhem rules engine (lib/trivia.js): equal starts, rising
// difficulty, the server timer, server-side answer checks, ties, silent
// players losing a life, and last-one-standing finishes.
// Run: node --test test/trivia-engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

process.env.TRIVIA = "on";
const bankDir = path.join(process.cwd(), "data", "trivia");
const t = await import("../lib/trivia.js");
const bank = t.loadBank(bankDir);

const game = (over = {}) => t.newGame({ id: "game-01", players: ["Asha", "Brian", "Chiku"], ...over });
const T0 = 1_700_000_000_000;

test("off switch: everything refuses except health", () => {
  process.env.TRIVIA = "";
  assert.equal(t.triviaOn(), false);
  assert.equal(t.triviaHealth().ok, true); // health always answers
  assert.equal(t.triviaHealth().on, false);
  assert.throws(() => t.newGame({ id: "game-02", players: ["A", "B"] }), /off/);
  process.env.TRIVIA = "on";
  const g = game();
  const { question } = t.startRound(g, bank, T0);
  assert.ok(question.id);
  process.env.TRIVIA = "off";
  assert.throws(() => t.submitAnswer(g, "p1", 0, T0 + 1), /off/);
  assert.throws(() => t.resolveRound(g, bank, T0 + t.QUESTION_MS + 1), /off/);
  process.env.TRIVIA = "on";
});

test("equal start: same lives, zero score, lobby first", () => {
  const g = game({ totalRounds: 5, lives: 2 });
  assert.equal(g.status, "lobby");
  for (const p of Object.values(g.players)) {
    assert.equal(p.lives, 2);
    assert.equal(p.score, 0);
    assert.equal(p.alive, true);
  }
});

test("new games need two players and a sane shape", () => {
  assert.throws(() => t.newGame({ id: "x", players: ["A", "B"] }), /game id/);
  assert.throws(() => t.newGame({ id: "game-03", players: ["Solo"] }), /At least 2/);
  assert.throws(() => t.newGame({ id: "game-04", players: ["A", "A"] }), /At least 2/);
  assert.throws(() => t.newGame({ id: "game-05", players: ["A", "B"], totalRounds: 0 }), /rounds/);
});

test("rising difficulty: first rounds easy, last rounds expert", () => {
  assert.equal(t.levelForRound(0, 10), "beginner");
  assert.equal(t.levelForRound(9, 10), "expert");
  const seen = Array.from({ length: 10 }, (_, r) => t.levelForRound(r, 10));
  const idx = seen.map((l) => t.LEVELS.indexOf(l));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b)); // never falls
  assert.ok(new Set(seen).size >= 4); // climbs through the bank
});

test("startRound draws the round level and hides the answer", () => {
  const g = game();
  const { question, level } = t.startRound(g, bank, T0, () => 0);
  assert.equal(level, "beginner");
  assert.equal(question.level, "beginner");
  assert.equal(question.choices.length, 4);
  assert.ok(!("answer" in question));
  assert.equal(question.deadlineMs, T0 + t.QUESTION_MS);
});

test("server timer: late answers refuse, early answers keep", () => {
  const g = game();
  t.startRound(g, bank, T0);
  assert.deepEqual(t.submitAnswer(g, "p1", 0, T0 + 1000), { accepted: true });
  assert.throws(() => t.submitAnswer(g, "p1", 1, T0 + 2000), /already in/);
  assert.throws(() => t.submitAnswer(g, "p2", 0, T0 + t.QUESTION_MS + 1), /Time is up/);
  assert.throws(() => t.submitAnswer(g, "p2", 9, T0 + 100), /one of the 4/);
  assert.throws(() => t.submitAnswer(g, "px", 0, T0 + 100), /not in this game/);
});

test("server-side check: correctness lands only at resolve", () => {
  const g = game();
  const { question } = t.startRound(g, bank, T0);
  const real = bank.byId[question.id].answer;
  t.submitAnswer(g, "p1", real, T0 + 100); // right
  t.submitAnswer(g, "p2", (real + 1) % 4, T0 + 100); // wrong
  // p3 stays silent
  const res = t.resolveRound(g, bank, T0 + t.QUESTION_MS + 1);
  assert.equal(res.answer, real);
  assert.equal(res.outcomes.p1.correct, true);
  assert.equal(res.outcomes.p2.correct, false);
  assert.equal(res.outcomes.p3.answered, false);
  assert.ok(g.players.p1.score > 0);
  assert.equal(g.players.p2.lives, t.START_LIVES - 1);
});

test("silence costs a life: disconnects lose the round", () => {
  const g = game({ lives: 1 });
  t.startRound(g, bank, T0);
  t.resolveRound(g, bank, T0 + t.QUESTION_MS + 1); // nobody answers
  for (const p of Object.values(g.players)) assert.equal(p.alive, false);
  assert.equal(g.status, "over"); // mutual wipeout ends the game
  assert.ok(g.winners.length >= 1); // top score still takes it
});

test("rounds refuse to close early", () => {
  const g = game();
  t.startRound(g, bank, T0);
  t.submitAnswer(g, "p1", 0, T0 + 1);
  assert.throws(() => t.resolveRound(g, bank, T0 + 2), /still running/);
});

test("ties share a rank, never a coin flip", () => {
  const g = game();
  g.players.p1.score = 500; g.players.p2.score = 500; g.players.p3.score = 100;
  const rows = t.rankPlayers(g);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1);
  assert.equal(rows[2].rank, 3);
});

test("last one standing wins alone", () => {
  const g = game({ lives: 1, totalRounds: 3 });
  const { question } = t.startRound(g, bank, T0);
  t.submitAnswer(g, "p1", bank.byId[question.id].answer, T0 + 1);
  t.submitAnswer(g, "p2", (bank.byId[question.id].answer + 1) % 4, T0 + 1);
  t.submitAnswer(g, "p3", (bank.byId[question.id].answer + 2) % 4, T0 + 1);
  t.resolveRound(g, bank, T0 + t.QUESTION_MS + 1);
  assert.equal(g.status, "over");
  assert.deepEqual(g.winners, ["p1"]);
});

test("a full game ends on the last round with shared wins on ties", () => {
  const g = game({ totalRounds: 1, lives: 5 });
  const { question } = t.startRound(g, bank, T0);
  const real = bank.byId[question.id].answer;
  for (const pid of ["p1", "p2", "p3"]) t.submitAnswer(g, pid, real, T0 + 1);
  t.resolveRound(g, bank, T0 + t.QUESTION_MS + 1);
  assert.equal(g.status, "over");
  assert.equal(g.winners.length, 3);
  assert.throws(() => t.startRound(g, bank, T0), /over/);
});

test("harder rounds pay more, streaks add a little", () => {
  const g = game({ totalRounds: 5, lives: 9 });
  const scores = [];
  for (let r = 0; r < 2; r++) {
    const { question } = t.startRound(g, bank, T0 + r * 100_000);
    const real = bank.byId[question.id].answer;
    t.submitAnswer(g, "p1", real, T0 + r * 100_000 + 1);
    t.submitAnswer(g, "p2", (real + 1) % 4, T0 + r * 100_000 + 1);
    t.submitAnswer(g, "p3", (real + 1) % 4, T0 + r * 100_000 + 1);
    t.resolveRound(g, bank, T0 + r * 100_000 + t.QUESTION_MS + 1);
    scores.push(g.players.p1.score);
  }
  assert.ok(scores[1] - scores[0] > scores[0]); // round 2 (basic + streak) beats round 1
});
