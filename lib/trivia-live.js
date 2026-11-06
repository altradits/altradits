// Mempool Mayhem live play: the server drives every round.
//
// The browser shows questions and collects taps, but the server owns the
// clock, the answers, the scores and the battle sats. Rounds open and close
// on the server clock only. A reply counts only if it reaches the server
// before the deadline, and correctness is checked at resolve time, never in
// the browser. There is no background timer (Passenger may rest a quiet
// app): each read of the game first settles whatever the clock says is due,
// so every visitor sees the same truth however the game is polled.
//
//   trv:engine:<game>  the rules-engine state (lib/trivia.js shape)
//   trv:meta:<game>    the roster, battle sats and winners (lib/trivia-donors.js)
//
// Battle sats move once per settled round. Every player in the round antes a
// little into a pot, and the players who answered right split it. The
// earliest right answer takes any leftover sat, so the total never changes.
// Nobody right means every ante goes back. Play units only: real sats move
// only through the donor pool and winner payouts.
//
// Reads stay up when TRIVIA is off (past games stay readable); starting a
// game and answering need the switch on.
import path from "node:path";
import { getJSON, setJSON, listIds, acquireLock } from "./store.js";
import { oneLine, clean } from "./http.js";
import {
  triviaOn, requireTrivia, ID_RE, MIN_PLAYERS, QUESTION_MS,
  newGame, startRound, submitAnswer as engineAnswer, resolveRound,
  publicQuestion, rankPlayers, winners, loadBank,
} from "./trivia.js";


export const ANTE_SATS = 10; // battle sats each player in a round antes into the pot
export const MIN_ANSWER_MS = 500; // a reply faster than this never read the question
const ROUNDS_DEFAULT = 10;

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const cleanGame = (g) => { if (!ID_RE.test(String(g || ""))) throw err("A game id of 6 to 64 letters, digits, - or _ is needed."); return String(g); };

// The question bank on disk, cached per folder. Production reads
// data/trivia; tests pass their own bank or write one under their folder.
let cached = null;
function bankFor(dir = path.join(process.cwd(), "data", "trivia")) {
  if (!cached || cached.dir !== dir) cached = { dir, bank: loadBank(dir) };
  return cached.bank;
}

async function withGameLock(game, fn) {
  let release = null;
  for (let i = 0; i < 100 && !release; i++) {
    release = await acquireLock(`trv:meta:${game}`, 30);
    if (!release) await new Promise((r) => setTimeout(r, 50));
  }
  if (!release) throw err("That game is busy. Try again.", 503);
  try { return await fn(); } finally { await release(); }
}

export async function engineOf(gameId) {
  return getJSON(`trv:engine:${cleanGame(gameId)}`);
}

async function saveEngine(game, engine) {
  await setJSON(`trv:engine:${game}`, engine);
  return engine;
}

async function saveMeta(meta) {
  await setJSON(`trv:meta:${meta.id}`, meta);
  return meta;
}

// The seat behind an account: meta players are in join order, and the engine
// is built from that same order, so seat i holds engine player p(i+1). The
// name check fails closed if the two ever disagree.
function seatOf(meta, engine, account) {
  const want = clean(account, 40).toLowerCase();
  const at = meta.players.findIndex((p) => p.account === want);
  if (at < 0) throw err("That account has no seat in this game.", 404);
  const pid = `p${at + 1}`;
  if (engine.players[pid]?.name !== meta.players[at].name) throw err("Seat mismatch.", 500);
  return pid;
}

// One round's battle sats: ante, split, remainder to the earliest right
// answer. The pile before and after must match to the sat.
export function settleBattle(battle, outcomes, answerAts = {}) {
  const pids = Object.keys(outcomes || {});
  for (const pid of pids) {
    if (!Number.isSafeInteger(battle?.[pid]) || battle[pid] < 0) throw err("Battle sats mismatch.", 500);
  }
  const before = pids.reduce((n, pid) => n + battle[pid], 0);
  const takes = {};
  let pot = 0;
  for (const pid of pids) {
    takes[pid] = Math.min(ANTE_SATS, battle[pid]);
    battle[pid] -= takes[pid];
    pot += takes[pid];
  }
  const correct = pids.filter((pid) => outcomes[pid].correct)
    .sort((a, b) => (answerAts[a] ?? Infinity) - (answerAts[b] ?? Infinity));
  if (!correct.length) {
    for (const pid of pids) battle[pid] += takes[pid]; // nobody right: antes go back
  } else {
    const share = Math.floor(pot / correct.length);
    const rest = pot - share * correct.length;
    correct.forEach((pid, i) => { battle[pid] += share + (i < rest ? 1 : 0); });
  }
  const after = pids.reduce((n, pid) => n + battle[pid], 0);
  if (after !== before) throw err("Battle sats mismatch.", 500);
  return { pot, correct: correct.length, refunded: correct.length === 0 };
}

// Settle every round the clock has closed, then open the next one. Only a
// live game moves: scheduled, cancelled and finished games rest as they are.
function drive(meta, engine, bank, nowMs, rand) {
  if (meta.status !== "live" || !engine || engine.status !== "live" || !engine.current) return false;
  let moved = false;
  for (let guard = 0; guard < 105 && engine.status === "live" && engine.current; guard++) {
    const round = engine.current;
    const alive = Object.values(engine.players).filter((p) => p.alive).map((p) => p.id);
    const allIn = alive.every((pid) => round.answers[pid] !== undefined);
    const past = nowMs >= round.deadlineMs;
    if (!past && !allIn) break;
    const ats = {};
    for (const pid of alive) if (round.answers[pid]) ats[pid] = round.answers[pid].at;
    const result = resolveRound(engine, bank, nowMs, { force: past });
    settleBattle(meta.battle, result.outcomes, ats);
    moved = true;
    if (engine.status === "live") startRound(engine, bank, nowMs, rand);
  }
  if (engine.status === "over" && meta.status === "live") {
    meta.status = "over";
    meta.winners = winners(engine).map((pid) => engine.players[pid].name);
  }
  return moved;
}

// Stanley starts the battle: the roster becomes engine seats and the first
// round opens at once. Names must differ, or seats and scores blur.
export async function startGame(gameId, { totalRounds = ROUNDS_DEFAULT } = {}, nowMs = Date.now(), bank = null, rand = Math.random) {
  requireTrivia();
  const game = cleanGame(gameId);
  const book = bank || bankFor();
  return withGameLock(game, async () => {
    const meta = await getJSON(`trv:meta:${game}`);
    if (!meta) throw err("No such game.", 404);
    if (meta.status !== "scheduled" && meta.status !== "lobby") throw err("Only a scheduled game starts.", 409);
    if (meta.players.length < MIN_PLAYERS) throw err(`At least ${MIN_PLAYERS} players make a battle.`);
    const names = meta.players.map((p) => oneLine(p.name, 24));
    if (new Set(names).size !== names.length) throw err("Player names must differ before the game starts.");
    if (await getJSON(`trv:engine:${game}`)) throw err("This game already started.", 409);
    const engine = newGame({ id: game, players: names, totalRounds });
    startRound(engine, book, nowMs, rand);
    meta.status = "live";
    await saveEngine(game, engine);
    await saveMeta(meta);
    return viewOf(meta, engine, null, nowMs, book);
  });
}

// One player's reply. The server clock stamps it, and anything past the
// deadline or too fast to have read the question is refused.
export async function submitAnswer(gameId, { account, index } = {}, nowMs = Date.now()) {
  requireTrivia();
  const game = cleanGame(gameId);
  return withGameLock(game, async () => {
    const meta = await getJSON(`trv:meta:${game}`);
    if (!meta) throw err("No such game.", 404);
    const engine = await getJSON(`trv:engine:${game}`);
    if (!engine || meta.status !== "live" || engine.status !== "live" || !engine.current) throw err("No round is open.", 409);
    const pid = seatOf(meta, engine, account);
    const openedAt = engine.current.deadlineMs - QUESTION_MS;
    if (nowMs - openedAt < MIN_ANSWER_MS) throw err("Too fast. Read the question first.");
    engineAnswer(engine, pid, index, nowMs);
    await saveEngine(game, engine);
    return { accepted: true };
  });
}

// What the browser may see: the open question without its answer, the live
// ranks, the last round's reveal, and the caller's own seat. Reading settles
// whatever the clock has closed first, so the page never shows stale play.
export async function playView(gameId, { account = null } = {}, nowMs = Date.now(), bank = null, rand = Math.random) {
  const game = cleanGame(gameId);
  if (!triviaOn()) {
    const meta = await getJSON(`trv:meta:${game}`);
    if (!meta) throw err("No such game.", 404);
    const engine = await getJSON(`trv:engine:${game}`);
    return viewOf(meta, engine, account, nowMs, engine?.current ? (bank || bankFor()) : null);
  }
  return withGameLock(game, async () => {
    const meta = await getJSON(`trv:meta:${game}`);
    if (!meta) throw err("No such game.", 404);
    const engine = await getJSON(`trv:engine:${game}`);
    const book = bank || (engine?.current ? bankFor() : null);
    if (engine && meta.status === "live" && engine.status === "live" && engine.current) {
      if (drive(meta, engine, book, nowMs, rand)) {
        await saveEngine(game, engine);
        await saveMeta(meta);
      }
    } else if (engine && engine.status === "over" && meta.status === "live") {
      meta.status = "over";
      meta.winners = winners(engine).map((pid) => engine.players[pid].name);
      await saveMeta(meta);
    }
    return viewOf(meta, engine, account, nowMs, book);
  });
}

function viewOf(meta, engine, account, nowMs, bank) {
  let open = null;
  if (engine && meta.status === "live" && engine.status === "live" && engine.current) {
    const q = bank?.byId?.[engine.current.qid];
    if (!q) throw err("That question left the bank.", 500);
    open = { ...publicQuestion(q), deadlineMs: engine.current.deadlineMs, round: engine.current.round };
  }
  const alive = engine ? Object.values(engine.players).filter((p) => p.alive).map((p) => p.id) : [];
  const view = {
    game: meta.id, title: meta.title, status: meta.status, startsAt: meta.startsAt || null,
    round: engine ? engine.round : 0, totalRounds: engine ? engine.totalRounds : ROUNDS_DEFAULT, nowMs,
    question: open ? { ...open, level: engine.current.level,
      answersIn: alive.filter((pid) => engine.current.answers[pid] !== undefined).length, alive: alive.length } : null,
    ranks: engine ? rankPlayers(engine) : [],
    battle: meta.battle || {},
    lastResult: lastPublic(engine),
    winners: meta.winners || [],
    me: null,
  };
  if (account && engine) {
    try {
      const pid = seatOf(meta, engine, account);
      const p = engine.players[pid];
      view.me = { id: pid, name: p.name, lives: p.lives, score: p.score, alive: p.alive,
        battleSats: meta.battle?.[pid] ?? 0,
        answered: Boolean(engine.current && engine.current.answers[pid] !== undefined) };
    } catch { view.me = null; }
  }
  return view;
}

function lastPublic(engine) {
  if (!engine?.lastResult) return null;
  const r = engine.lastResult;
  return { round: r.round, level: r.level, answer: r.answer,
    outcomes: Object.keys(r.outcomes).map((pid) => ({ name: engine.players[pid]?.name || pid, ...r.outcomes[pid] })) };
}

// Recent games, newest first: what the page lists for joining and watching.
export async function gamesList(limit = 20) {
  const ids = await listIds("trv:games", Math.min(Math.max(1, limit || 1), 200));
  const out = [];
  for (const id of ids) {
    const m = await getJSON(`trv:meta:${id}`);
    if (!m) continue;
    out.push({ id: m.id, title: m.title, status: m.status, startsAt: m.startsAt || null,
      players: m.players.length, winners: m.winners || [] });
  }
  return out;
}
