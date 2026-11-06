// Mempool Mayhem: a sats trivia battle about Bitcoin and Lightning.
//
// One game, many players, last one standing. Everyone starts equal (same
// lives, zero score). Questions start easy and rise with the round. The
// server owns the clock and the answers: a reply counts only if it reaches
// the server before the deadline, and correctness is checked on the server
// at resolve time, never in the browser. A player who says nothing before
// the deadline, disconnected or not, loses a life. Equal scores share a
// rank, and a game can end in a shared win.
//
//   data/trivia/level-1..5.json  the question bank (beginner to expert)
//   lib/trivia-ledger.js         the per-game battle-sats ledger
//
// Switched on with TRIVIA=on (off: games refuse; the health read stays up).
import fs from "node:fs";
import path from "node:path";
import { switchOn } from "./ywallet.js";
import { oneLine } from "./http.js";

export const triviaOn = () => switchOn("TRIVIA");
// Staked play waits on its own switch, off unless TRIVIA_STAKES=on. Donor
// mode needs only TRIVIA; staked endpoints need both switches on.
export const stakesOn = () => switchOn("TRIVIA_STAKES");
// Health always answers, on or off, so uptime checks never flap with the switch.
export const triviaHealth = () => ({ ok: true, game: "Mempool Mayhem", on: triviaOn(), stakes: stakesOn(), time: new Date().toISOString() });

export const LEVELS = ["beginner", "basic", "intermediate", "advanced", "expert"];
export const QUESTION_MS = 20_000; // server timer per question
export const START_LIVES = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 50;
export const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

const err = (message, status = 400) => Object.assign(new Error(message), { status });
export const requireTrivia = () => { if (!triviaOn()) throw err("Trivia is off.", 503); };

// Rising difficulty: the first round asks beginner questions, the last round
// expert ones, spread evenly across the game.
export function levelForRound(round, totalRounds) {
  const total = Math.max(1, Math.floor(totalRounds) || 1);
  const r = Math.min(Math.max(0, Math.floor(round) || 0), total - 1);
  const idx = total <= 1 ? LEVELS.length - 1 : Math.min(LEVELS.length - 1, Math.floor((r / (total - 1)) * LEVELS.length));
  return LEVELS[idx];
}

// The bank on disk: data/trivia/level-<n>.json, each { level, questions: [...] }.
// A question carries { id, level, q, choices[4], answer, source } and, only
// where the Kiswahili is certain, { q_sw, choices_sw }.
export function loadBank(dir = path.join(process.cwd(), "data", "trivia")) {
  const questions = [];
  for (let n = 1; n <= LEVELS.length; n++) {
    const file = path.join(dir, `level-${n}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw.level !== LEVELS[n - 1]) throw new Error(`trivia bank: ${file} says ${raw.level}, want ${LEVELS[n - 1]}`);
    for (const q of raw.questions || []) {
      if (typeof q.id !== "string" || !q.id) throw new Error(`trivia bank: a question in ${file} has no id`);
      if (q.level !== LEVELS[n - 1]) throw new Error(`trivia bank: ${q.id} sits in the wrong level file`);
      if (typeof q.q !== "string" || !q.q.trim()) throw new Error(`trivia bank: ${q.id} has no English question`);
      if (!Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some((c) => typeof c !== "string" || !c.trim()))
        throw new Error(`trivia bank: ${q.id} needs exactly 4 English choices`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) throw new Error(`trivia bank: ${q.id} has a bad answer index`);
      if (typeof q.source !== "string" || !q.source.trim()) throw new Error(`trivia bank: ${q.id} has no source`);
      if (q.choices_sw !== undefined && (!Array.isArray(q.choices_sw) || q.choices_sw.length !== 4)) throw new Error(`trivia bank: ${q.id} has a bad choices_sw`);
      questions.push(q);
    }
  }
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) throw new Error("trivia bank: a question id repeats");
  return { levels: [...LEVELS], questions, byId: Object.fromEntries(questions.map((q) => [q.id, q])) };
}

// What the browser may see: everything but the answer.
export function publicQuestion(q) {
  const out = { id: q.id, level: q.level, q: q.q, choices: [...q.choices], source: q.source };
  if (q.q_sw) out.q_sw = q.q_sw;
  if (q.choices_sw) out.choices_sw = [...q.choices_sw];
  return out;
}

// ---- the game -------------------------------------------------------------
// A game is plain state; every function below takes the server clock (nowMs)
// so tests and the server share one code path and the client clock is nothing.
export function newGame({ id, players, totalRounds = 10, lives = START_LIVES } = {}) {
  requireTrivia();
  if (!ID_RE.test(String(id || ""))) throw err("A game id of 6 to 64 letters, digits, - or _ is needed.");
  const rounds = Math.floor(totalRounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw err("A game runs 1 to 100 rounds.");
  const startLives = Math.floor(lives);
  if (!Number.isInteger(startLives) || startLives < 1 || startLives > 10) throw err("Players start with 1 to 10 lives.");
  const names = [...new Set((players || []).map((p) => oneLine(p, 24)).filter(Boolean))];
  if (names.length < MIN_PLAYERS) throw err(`At least ${MIN_PLAYERS} players make a battle.`);
  if (names.length > MAX_PLAYERS) throw err(`At most ${MAX_PLAYERS} players per game.`);
  const state = { id, status: "lobby", round: 0, totalRounds: rounds, lives: startLives, players: {}, used: [], current: null, lastResult: null, winners: [] };
  names.forEach((name, i) => {
    const pid = `p${i + 1}`;
    state.players[pid] = { id: pid, name, lives: startLives, score: 0, streak: 0, alive: true, answered: 0 };
  });
  return state;
}

export const alivePlayers = (state) => Object.values(state.players).filter((p) => p.alive);

// A random question at the round's level, not asked before in this game. When
// a level runs dry the game reuses that level rather than stopping.
export function startRound(state, bank, nowMs, rand = Math.random) {
  requireTrivia();
  if (state.status === "over") throw err("This game is over.");
  if (state.current) throw err("This round is still open.");
  if (alivePlayers(state).length < 1) throw err("Nobody is left playing.");
  const level = levelForRound(state.round, state.totalRounds);
  const used = new Set(state.used);
  let pool = bank.questions.filter((q) => q.level === level && !used.has(q.id));
  if (!pool.length) pool = bank.questions.filter((q) => q.level === level);
  if (!pool.length) throw err(`No ${level} questions in the bank.`, 500);
  const q = pool[Math.floor(rand() * pool.length) % pool.length];
  state.status = "live";
  state.current = { qid: q.id, level, round: state.round, deadlineMs: nowMs + QUESTION_MS, answers: {} };
  return { question: { ...publicQuestion(q), deadlineMs: state.current.deadlineMs, round: state.round }, level };
}

// An answer counts only when the server receives it in time. Correctness is
// NOT told here: the server checks every answer at resolve time, together.
export function submitAnswer(state, playerId, index, nowMs) {
  requireTrivia();
  const round = state.current;
  if (!round) throw err("No round is open.");
  const player = state.players[playerId];
  if (!player || !player.alive) throw err("That player is not in this game.");
  if (nowMs > round.deadlineMs) throw err("Time is up.", 408);
  if (round.answers[playerId] !== undefined) throw err("That answer is already in.");
  if (!Number.isInteger(index) || index < 0 || index > 3) throw err("Pick one of the 4 answers.");
  round.answers[playerId] = { index, at: nowMs };
  return { accepted: true };
}

// Closing a round: correct answers score (harder rounds pay more, streaks add
// a little), wrong answers cost a life, and silence costs a life too, so a
// dropped connection is a lost round, never a free pass. One or none left
// standing, or the last round played, ends the game; ties share the win.
export function resolveRound(state, bank, nowMs, { force = false } = {}) {
  requireTrivia();
  const round = state.current;
  if (!round) throw err("No round is open.");
  const alive = alivePlayers(state);
  const allIn = alive.every((p) => round.answers[p.id] !== undefined);
  if (!force && nowMs < round.deadlineMs && !allIn) throw err("This round is still running.");
  const q = bank.byId[round.qid];
  if (!q) throw err("That question left the bank.", 500);
  const levelIdx = LEVELS.indexOf(round.level);
  const outcomes = {};
  for (const p of alive) {
    const got = round.answers[p.id];
    if (got === undefined) {
      p.lives -= 1; p.streak = 0; // silent: disconnected, slow, or gone
      outcomes[p.id] = { answered: false, correct: false, lives: p.lives, score: p.score };
    } else if (got.index === q.answer) {
      p.score += 100 * (levelIdx + 1) + p.streak * 25;
      p.streak += 1; p.answered += 1;
      outcomes[p.id] = { answered: true, correct: true, lives: p.lives, score: p.score };
    } else {
      p.lives -= 1; p.streak = 0; p.answered += 1;
      outcomes[p.id] = { answered: true, correct: false, lives: p.lives, score: p.score };
    }
    if (p.lives <= 0) { p.lives = 0; p.alive = false; }
  }
  state.used.push(round.qid);
  state.lastResult = { round: round.round, qid: round.qid, level: round.level, answer: q.answer, outcomes };
  state.current = null;
  state.round += 1;
  const left = alivePlayers(state);
  if (left.length <= 1 || state.round >= state.totalRounds) {
    state.status = "over";
    state.winners = winners(state);
  }
  return state.lastResult;
}

// Equal scores share a rank (1, 1, 3): ties are ties, never coin flips.
export function rankPlayers(state) {
  const rows = Object.values(state.players)
    .map((p) => ({ id: p.id, name: p.name, score: p.score, lives: p.lives, alive: p.alive, answered: p.answered }))
    .sort((a, b) => b.score - a.score || b.lives - a.lives || a.name.localeCompare(b.name));
  let rank = 0, last = null;
  rows.forEach((r, i) => {
    if (last === null || r.score !== last.score || r.lives !== last.lives) rank = i + 1;
    r.rank = rank;
    last = r;
  });
  return rows;
}

// Last one standing wins alone; a mutual wipeout or a level finish goes to
// the top score, shared when tied.
export function winners(state) {
  const left = alivePlayers(state);
  if (left.length === 1) return [left[0].id];
  const ranked = rankPlayers(state);
  const top = ranked.filter((r) => ranked.length && r.rank === 1).map((r) => r.id);
  return top;
}
