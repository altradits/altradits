// Mempool Mayhem ledger: every battle-sat movement, per game, in order.
//
// Each game keeps its own append-only ledger on the shared store. Every
// movement of battle sats is one entry: staked in, paid out as prize,
// refunded, or a fee. Entries are never changed and never deleted; a game
// ends by archiving, which only stamps the time and keeps every entry.
// Totals always add up: the stored running total must equal the sum of the
// entries, and verify() proves it. Writes carry a caller ref so a retry
// records once, and run under one lock per game so two writes never share
// a sequence number.
//
//   trv:ledger:<game>  list of entry ids (newest first); trv:e:<id> entry
//   trv:ref:<game>:<ref>  entry id (idempotent refs)
//   trv:total:<game>  running total { net, count }
//   trv:game:<game>  { archivedAt } once archived
//   trv:archived  list of archived game ids
//
// Switched on with TRIVIA=on (off: writes refuse; reads still answer, so
// past games stay auditable while new battles are paused).
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock } from "./store.js";
import { triviaOn } from "./trivia.js";
import { oneLine } from "./http.js";

export const KINDS = ["stake", "prize", "refund", "fee", "adjust"];
const GAME_RE = /^[A-Za-z0-9_-]{6,64}$/;
const REF_RE = /^[A-Za-z0-9:_.~-]{1,80}$/;
const MAX_MONEY = 2_100_000_000_000_000; // no amount above every sat that will ever exist

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString("base64url");
const cleanGame = (g) => { if (!GAME_RE.test(String(g || ""))) throw err("A game id of 6 to 64 letters, digits, - or _ is needed."); return String(g); };

async function withGameLock(game, fn) {
  let release = null;
  for (let i = 0; i < 100 && !release; i++) {
    release = await acquireLock(`trv:ledger:${game}`, 30);
    if (!release) await new Promise((r) => setTimeout(r, 50));
  }
  if (!release) throw err("The ledger is busy. Try again.", 503);
  try { return await fn(); } finally { await release(); }
}

// One movement. Stakes and refunds in are positive sats, prizes and fees out
// are negative; adjust takes either sign and needs a note saying why. The
// same ref answers with the first entry, so a retried request records once.
export async function record(gameId, { ref, sats, kind, playerId = null, note = "" } = {}) {
  if (!triviaOn()) throw err("Trivia is off.", 503);
  const game = cleanGame(gameId);
  if (!REF_RE.test(String(ref || ""))) throw err("A ref of letters, digits and : _ . ~ - is needed.");
  if (!Number.isSafeInteger(sats) || sats === 0 || Math.abs(sats) > MAX_MONEY) throw err("Sats must be a whole nonzero number.");
  if (!KINDS.includes(kind)) throw err(`Kind is one of: ${KINDS.join(", ")}.`);
  const player = playerId === null ? null : oneLine(playerId, 64) || null;
  if (playerId !== null && !player) throw err("A player id or nothing is needed.");
  const why = oneLine(note, 120);
  if (kind === "adjust" && !why) throw err("An adjustment needs a note saying why.");
  if (sats > 0 && (kind === "prize" || kind === "fee")) throw err(`${kind} pays out, so its sats are negative.`);
  if (sats < 0 && kind === "stake") throw err("A stake comes in, so its sats are positive.");

  return withGameLock(game, async () => {
    const seen = await getJSON(`trv:ref:${game}:${ref}`);
    if (seen) return getJSON(`trv:e:${seen}`); // a retry: the first entry stands
    if (await getJSON(`trv:game:${game}`)) throw err("That game is archived.", 409);
    const total = (await getJSON(`trv:total:${game}`)) || { net: 0, count: 0 };
    const entry = { id: newId(), game, ref: String(ref), sats, kind, playerId: player, note: why, at: now(), seq: total.count + 1, balance: total.net + sats };
    await setJSON(`trv:e:${entry.id}`, entry);
    await setJSON(`trv:ref:${game}:${ref}`, entry.id);
    await setJSON(`trv:total:${game}`, { net: entry.balance, count: entry.seq });
    await pushId(`trv:ledger:${game}`, entry.id);
    return entry;
  });
}

export async function entries(gameId, limit = 500) {
  const game = cleanGame(gameId);
  const ids = await listIds(`trv:ledger:${game}`, Math.min(Math.max(1, limit || 1), 2000));
  return getMany("trv:e", ids);
}

// In, out, net and count, recomputed from the entries and checked against
// the stored running total. The two must agree.
export async function totals(gameId) {
  const game = cleanGame(gameId);
  const rows = await entries(game, 2000);
  let walked = 0, count = 0;
  for (const e of rows) { walked += e.sats; count += 1; }
  const stored = (await getJSON(`trv:total:${game}`)) || { net: 0, count: 0 };
  return { in: rows.filter((e) => e.sats > 0).reduce((n, e) => n + e.sats, 0), out: rows.filter((e) => e.sats < 0).reduce((n, e) => n + e.sats, 0), net: walked, count, stored };
}

export async function verify(gameId) {
  const t = await totals(gameId);
  const ok = t.net === t.stored.net && t.count === t.stored.count;
  return { ok, ...t };
}

// Archiving ends a game: it stamps the time and lists the game as done. No
// entry is touched, none is ever deleted; the ledger reads the same after.
export async function archive(gameId) {
  if (!triviaOn()) throw err("Trivia is off.", 503);
  const game = cleanGame(gameId);
  return withGameLock(game, async () => {
    if (await getJSON(`trv:game:${game}`)) return getJSON(`trv:game:${game}`);
    const stamp = { game, archivedAt: now() };
    await setJSON(`trv:game:${game}`, stamp);
    await pushId("trv:archived", game);
    return stamp;
  });
}

export async function isArchived(gameId) {
  return Boolean(await getJSON(`trv:game:${cleanGame(gameId)}`));
}

export async function archivedGames(limit = 200) {
  return listIds("trv:archived", Math.min(Math.max(1, limit || 1), 2000));
}
