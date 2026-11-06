// Mempool Mayhem staked play: every player locks the same own stake.
//
// Off unless TRIVIA_STAKES=on (and TRIVIA=on). When off, everything here
// refuses with one plain message, and donor-funded play (free entry, donor
// pool, winner payouts) runs exactly as before. Nothing staked is ever shown
// on the public page while off.
//
// How it works when on. Stanley sets one equal stake per game. Each seated
// player locks exactly that stake from their own wallet through a Lightning
// hold invoice (LND AddHoldInvoice): the sats lock when paid and stay locked
// until the game ends. A staked game starts only when every seat is locked.
// At the end Stanley settles the locks (LND SettleInvoice): the stakes join
// the pool in the ledger and the house wallet, and winners are paid with the
// normal payout approval (PIN, spendable caps, outbound precheck, fee
// reserve, lockdown gate). Cancelling (LND CancelInvoice) refunds every lock
// from the node itself. Expired locks refund themselves the same way, so a
// forgotten lock never strands a player's sats.
//
// Money paths, all existing: receiving via lib/lightning.js hold invoices
// (invoice macaroon, never admin); paying via lib/ywallet.js payOut only,
// through the donor payout approval. This file reads no macaroon itself.
// Settling collects, so it needs no lockdown gate (the Deadman's Switch
// freezes sends, never receives). While locked the node holds the funds, so
// the ledger records a stake only at settle time.
//
//   trv:stakes:<game>  one equal stake { sats, setAt } (its presence marks a staked game)
//   trv:sk:<hash>      one stake lock (hash, game, account, sats, state, preimage, times)
//   trv:skopen         open or locked hashes; trv:sks:<game> hashes per game
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock, removeFromList } from "./store.js";
import { clean } from "./http.js";
import { requireTrivia, stakesOn, ID_RE } from "./trivia.js";
import { record } from "./trivia-ledger.js";
import { ACCOUNT_RE, gameMeta } from "./trivia-donors.js";

export const STAKE = { min: 100, max: 100_000 };
export const STAKE_EXPIRY = 86400; // a day: a staked game must end inside the lock window
export const HASH_RE = /^[0-9a-f]{64}$/;
const LIVE_STATES = new Set(["open", "locked"]);

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const cleanGame = (g) => { if (!ID_RE.test(String(g || ""))) throw err("A game id of 6 to 64 letters, digits, - or _ is needed."); return String(g); };
const houseHandle = () => clean(process.env.TRIVIA_HOUSE_WALLET, 40).toLowerCase();

// Staked endpoints need both switches. Donor mode needs only TRIVIA, so it
// stays live while this refuses.
export function requireStakes() {
  requireTrivia();
  if (!stakesOn()) throw err("Staked play is off.", 503);
}

// Hold invoices and the node, replaceable in tests. Production always uses
// the LND hold calls in lib/lightning.js (invoice macaroon, never admin).
let LN = null;
export const setTriviaStakesLightning = (o) => { LN = o; };
const ln = () => LN || import("./lightning.js");

async function withGameLock(game, fn) {
  let release = null;
  for (let i = 0; i < 100 && !release; i++) {
    release = await acquireLock(`trv:meta:${game}`, 30);
    if (!release) await new Promise((r) => setTimeout(r, 50));
  }
  if (!release) throw err("That game is busy. Try again.", 503);
  try { return await fn(); } finally { await release(); }
}

async function houseWallet() {
  const h = houseHandle();
  if (!h) return null;
  const { walletByHandle } = await import("./ywallet.js");
  return walletByHandle(h);
}

async function intentsOf(game) {
  return getMany("trv:sk", await listIds(`trv:sks:${cleanGame(game)}`, 2000));
}

// Sats promised but not yet collected, across every game: donor invoices plus
// stake locks. Both settle into the same house wallet, so both count against
// its cap before a new lock is made.
async function pendingSats() {
  const [dons, sks] = await Promise.all([
    getMany("trv:don", await listIds("trv:donopen", 2000)),
    getMany("trv:sk", await listIds("trv:skopen", 2000)),
  ]);
  const donOpen = dons.filter((i) => i?.state === "open").reduce((t, i) => t + (i.sats || 0), 0);
  const skLive = sks.filter((i) => i && LIVE_STATES.has(i.state)).reduce((t, i) => t + (i.sats || 0), 0);
  return donOpen + skLive;
}

// What the browser may see: everything but the preimage, which only the
// server may hold (whoever holds it can collect the lock).
function publicStake(it) {
  const out = { hash: it.hash, game: it.game, account: it.account, sats: it.sats, state: it.state, at: it.at, expiresAt: it.expiresAt };
  if (it.lockedAt) out.lockedAt = it.lockedAt;
  if (it.settledAt) out.settledAt = it.settledAt;
  if (it.cancelledAt) out.cancelledAt = it.cancelledAt;
  return out;
}

// One lock collected: the stake joins the ledger and the house wallet. Both
// writes carry the invoice hash, so a retry books once.
async function bookStake(intent) {
  await record(intent.game, { ref: `stake:${intent.hash}`, sats: intent.sats, kind: "stake", playerId: intent.account, note: "Staked play, locked until the end" });
  const house = await houseWallet();
  if (house) {
    const { credit } = await import("./ywallet.js");
    await credit({ walletId: house.id, sats: intent.sats, kind: "receive", ref: `trv-stake:${intent.hash}`, counterparty: "Trivia stakes" });
  }
}

// ---- the equal stake (Stanley sets it before play) --------------------------

export async function setStake(gameId, sats) {
  requireStakes();
  const game = cleanGame(gameId);
  const amount = Number(sats);
  if (!Number.isInteger(amount) || amount < STAKE.min || amount > STAKE.max)
    throw err(`One stake of ${STAKE.min} to ${STAKE.max.toLocaleString("en-US")} sats per player.`);
  const house = await houseWallet();
  if (!house) throw err("Staked play is not open yet.", 503);
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    if (meta.status !== "scheduled" && meta.status !== "lobby") throw err("Stakes are set before the game starts.");
    if ((await intentsOf(game)).length) throw err("Stakes are already locking for this game.");
    const rec = { game, sats: amount, setAt: nowIso() };
    await setJSON(`trv:stakes:${game}`, rec);
    return rec;
  });
}

export async function stakeOf(gameId) {
  return getJSON(`trv:stakes:${cleanGame(gameId)}`);
}

// ---- locking one own stake --------------------------------------------------

// A seated player locks exactly the game's stake from their own wallet. One
// live lock per account per game: a second lock while one is open or locked
// is refused, and an expired or cancelled lock must come first.
export async function stakeSeat(gameId, account) {
  requireStakes();
  const game = cleanGame(gameId);
  const who = clean(account, 40).toLowerCase();
  if (!ACCOUNT_RE.test(who)) throw err("An account of 3 to 20 letters, digits, dot, dash or underscore is needed.");
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    const rec = await getJSON(`trv:stakes:${game}`);
    if (!rec) throw err("This game takes no stake. Play is free.", 409);
    if (meta.status !== "scheduled" && meta.status !== "lobby") throw err("This game is closed to stakes.");
    if (!meta.players.some((p) => p.account === who)) throw err("That account has no seat in this game.", 404);
    const mine = (await intentsOf(game)).filter((i) => i.account === who && LIVE_STATES.has(i.state));
    if (mine.length) throw err("That stake is already locking.", 409);
    const house = await houseWallet();
    if (!house) throw err("Staked play is not open yet.", 503);
    const { limits, incoming } = await import("./ywallet.js");
    if (house.balance + (await incoming(house.id)) + (await pendingSats()) + rec.sats > limits().maxBalance)
      throw err("This game pool is full. Stakes open again after the next payout.");
    const { createHoldInvoice, qrSvg } = await ln();
    let hold;
    try { hold = await createHoldInvoice({ sats: rec.sats, memo: `Mempool Mayhem stake ${game}`, expiry: STAKE_EXPIRY }); }
    catch { throw err("The node is offline. Try again in a minute.", 503); }
    const intent = { hash: hold.paymentHash, game, account: who, sats: rec.sats, state: "open", preimage: hold.preimage, at: nowIso(), expiresAt: hold.expiresAt };
    await setJSON(`trv:sk:${intent.hash}`, intent);
    await pushId("trv:skopen", intent.hash);
    await pushId(`trv:sks:${game}`, intent.hash);
    return { bolt11: hold.bolt11, qr: await qrSvg(`lightning:${hold.bolt11}`.toUpperCase()), hash: intent.hash, sats: rec.sats, expiresAt: intent.expiresAt };
  });
}

// One lock, settled against the node: locked when paid, booked when settled,
// cancelled when refunded. Past expiry an unpaid lock is cancelled, so the
// payer is refunded and the seat can lock again.
export async function stakeStatus(hash) {
  requireStakes();
  const h = clean(hash, 64);
  if (!HASH_RE.test(h)) throw err("Unknown stake.", 404);
  const it = await getJSON(`trv:sk:${h}`);
  if (!it) throw err("Unknown stake.", 404);
  if (!LIVE_STATES.has(it.state)) return publicStake(it);
  const { holdInvoiceState, cancelHoldInvoice } = await ln();
  let node = "unknown";
  try { node = await holdInvoiceState(h); } catch { node = "unknown"; }
  if (node === "accepted" && it.state === "open") {
    it.state = "locked";
    it.lockedAt = nowIso();
    await setJSON(`trv:sk:${h}`, it);
  } else if (node === "settled") {
    await bookStake(it);
    it.state = "settled";
    it.settledAt = it.settledAt || nowIso();
    await setJSON(`trv:sk:${h}`, it);
    await removeFromList("trv:skopen", [h]);
  } else if (node === "cancelled") {
    it.state = "cancelled";
    it.cancelledAt = nowIso();
    await setJSON(`trv:sk:${h}`, it);
    await removeFromList("trv:skopen", [h]);
  } else if (node === "open" && Date.parse(it.expiresAt) < Date.now()) {
    try { await cancelHoldInvoice(h); } catch { /* expiry cancels itself on the node */ }
    it.state = "expired";
    it.cancelledAt = nowIso();
    await setJSON(`trv:sk:${h}`, it);
    await removeFromList("trv:skopen", [h]);
  }
  return publicStake(await getJSON(`trv:sk:${h}`));
}

// ---- the game view ----------------------------------------------------------

export async function stakesOf(gameId) {
  requireStakes();
  const game = cleanGame(gameId);
  const meta = await gameMeta(game);
  if (!meta) throw err("No such game.", 404);
  const rec = await getJSON(`trv:stakes:${game}`);
  if (!rec) return { game, staked: false };
  const intents = await intentsOf(game);
  const players = {};
  for (const p of meta.players) {
    const mine = intents.filter((i) => i.account === p.account && (LIVE_STATES.has(i.state) || i.state === "settled")).at(-1) || null;
    players[p.account] = { name: p.name, state: mine?.state || "none", hash: mine?.hash || null };
  }
  const locked = Object.values(players).filter((s) => s.state === "locked" || s.state === "settled").length;
  return { game, staked: true, sats: rec.sats, setAt: rec.setAt, seats: meta.players.length, locked,
    ready: meta.players.length > 0 && locked === meta.players.length, players };
}

// Every seat locked, for the start guard. A game with no stake is ready by
// definition: donor mode starts as before.
export async function stakesReady(gameId) {
  const v = await stakesOf(gameId);
  return { ok: !v.staked || v.ready === true, locked: v.locked || 0, seats: v.seats || 0 };
}

// ---- settling at the end (Stanley, when the game is over) -------------------

// Every lock opens only here. Locked locks are settled and join the pool;
// unpaid locks are cancelled and refund nothing (nothing was paid); locks the
// node already settled are booked. The pool wallet must hold every pending
// sat first, so a full wallet settles nothing and every lock waits (worst
// case it expires and refunds). Rerunning is safe: node truth plus idempotent
// refs mean each lock books once.
export async function settleStakes(gameId) {
  requireStakes();
  const game = cleanGame(gameId);
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    const rec = await getJSON(`trv:stakes:${game}`);
    if (!rec) throw err("This game takes no stake.", 409);
    if (meta.status !== "over") throw err("Stakes settle when the game ends. Locks stay locked mid-game.", 409);
    const { holdInvoiceState, settleHoldInvoice, cancelHoldInvoice } = await ln();
    const live = (await intentsOf(game)).filter((i) => LIVE_STATES.has(i.state));
    const states = {};
    for (const it of live) {
      try { states[it.hash] = await holdInvoiceState(it.hash); }
      catch { throw err("The node is offline. Stakes stay locked. Try again in a minute.", 503); }
      if (states[it.hash] === "unknown") throw err("A lock answers unclearly. Stakes stay locked until the node is read.", 503);
    }
    const house = await houseWallet();
    if (!house) throw err("Set TRIVIA_HOUSE_WALLET to the pool wallet first.", 503);
    const { limits, incoming } = await import("./ywallet.js");
    const coming = live.filter((it) => states[it.hash] === "accepted").reduce((t, i) => t + i.sats, 0);
    if (house.balance + (await incoming(house.id)) + (await pendingSats()) > limits().maxBalance + coming)
      throw err("The pool wallet is full. Pay out before settling stakes.", 503);
    let settled = 0, settledSats = 0, cancelled = 0;
    for (const it of live) {
      const node = states[it.hash];
      if (node === "accepted") {
        try { await settleHoldInvoice(it.preimage); }
        catch {
          // A lost answer may still have settled: only the node decides.
          if ((await holdInvoiceState(it.hash).catch(() => "unknown")) !== "settled") throw err("A lock would not settle. Rerun to finish the rest.", 503);
        }
        await bookStake(it);
        it.state = "settled";
        it.settledAt = nowIso();
        await setJSON(`trv:sk:${it.hash}`, it);
        await removeFromList("trv:skopen", [it.hash]);
        settled += 1;
        settledSats += it.sats;
      } else if (node === "settled") {
        await bookStake(it);
        it.state = "settled";
        it.settledAt = it.settledAt || nowIso();
        await setJSON(`trv:sk:${it.hash}`, it);
        await removeFromList("trv:skopen", [it.hash]);
        settled += 1;
        settledSats += it.sats;
      } else {
        try { await cancelHoldInvoice(it.hash); } catch { /* unpaid or already refunded */ }
        it.state = "cancelled";
        it.cancelledAt = nowIso();
        await setJSON(`trv:sk:${it.hash}`, it);
        await removeFromList("trv:skopen", [it.hash]);
        cancelled += 1;
      }
    }
    return { game, settled, settledSats, cancelled };
  });
}

// ---- cancelling (Stanley; every live lock refunds from the node) -------------

// Locks hold nothing of ours, so cancelling books nothing: each live lock is
// cancelled on the node and the payer is refunded. Already settled locks stay
// collected in the pool (settling needs the game over, and an over game is
// never cancelled, so this counts them only).
export async function cancelStakes(gameId) {
  requireStakes();
  const game = cleanGame(gameId);
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    if (!await getJSON(`trv:stakes:${game}`)) throw err("This game takes no stake.", 409);
    const { cancelHoldInvoice } = await ln();
    let cancelled = 0, settledKept = 0;
    for (const it of await intentsOf(game)) {
      if (it.state === "settled") { settledKept += 1; continue; }
      if (!LIVE_STATES.has(it.state)) continue;
      try { await cancelHoldInvoice(it.hash); } catch { /* expiry refunds itself */ }
      it.state = "cancelled";
      it.cancelledAt = nowIso();
      await setJSON(`trv:sk:${it.hash}`, it);
      await removeFromList("trv:skopen", [it.hash]);
      cancelled += 1;
    }
    return { game, cancelled, settledKept };
  });
}
