// Mempool Mayhem donor pool: free entry, real sats prizes from donors.
//
// Donors fund a game (the whole battle, a team, or one player) with Lightning
// payments on our own node, exactly like donations: an invoice is made, the
// donor pays it, and settling credits the pool once. Entry is free and every
// player starts with the same battle sats. Battle sats are play units: they
// move between players as questions resolve, and they are never withdrawable.
// When the game ends, each winner is paid their share of the real pool over
// Lightning, approved by Stanley.
//
// Money paths, all existing: receiving via lib/lightning.js createInvoice
// (nodeOnly, invoice macaroon) plus invoicePaid settle, credited once to the
// house wallet; paying via lib/ywallet.js payOut only, which enforces the
// Deadman lockdown, spendable caps, outbound precheck and fee reserve. This
// file reads no macaroon itself: never the admin one, which nothing here needs.
//
//   trv:meta:<game>   game record (schedule, players, battle sats, winners, payout, cancel)
//   trv:games          game ids, newest first
//   trv:don:<hash>    donor intent (invoice hash, game, sats, target, message, state)
//   trv:donopen        open intent hashes; trv:dons:<game> intent hashes per game
//   trv:payout:<game>:<winner>  one payout record per winner (idempotent)
//
// Real sats move in lib/trivia-ledger.js (stake in, prize out, refund, carry).
// Donor messages are plain text: short, cleaned, no links, no HTML. Nothing
// here is ever deleted: cancelled and paid games are archived, entries stay.
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, acquireLock, removeFromList } from "./store.js";
import { oneLine, clean, escapeRegExp } from "./http.js";
import { triviaOn, requireTrivia, ID_RE, MAX_PLAYERS } from "./trivia.js";
import { record, entries, totals, verify, archive, isArchived } from "./trivia-ledger.js";
import { deadmanActive } from "./deadman.js";

export { entries as ledgerEntries, totals as ledgerTotals, verify as ledgerVerify, isArchived };

export const DONATE = { min: 10, max: 5_000_000 };
export const MESSAGE_MAX = 140;
export const BATTLE_START = 1000; // equal play units per player, never withdrawable
export const ACCOUNT_RE = /^[a-z0-9][a-z0-9._-]{1,18}[a-z0-9]$/;
export const HASH_RE = /^[0-9a-f]{64}$/;
// Links have no place in a public game message: addresses, short links and invoices alike.
const LINK_RE = /https?:|www\.|lightning:|lnurl|[a-z0-9-]+\.(com|org|io|net|ke|app|me|link|site|xyz)\b/i;

// The cancel rule, in plain words, stored on every cancelled game. Paid sats
// can only move by hand back to donors (Lightning needs each donor's invoice),
// so "return" marks them for Stanley, it never auto-sends.
export const CANCEL_RULES = {
  keep: "Kept for the next game. Paid donor sats move to the next game in the ledger, and every entry stays in this game's archive. Unpaid invoices are cancelled.",
  return: "Returned to donors. Paid donor sats are marked for manual return by Stanley, and every entry stays in this game's archive. Unpaid invoices are cancelled.",
};

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const cleanGame = (g) => { if (!ID_RE.test(String(g || ""))) throw err("A game id of 6 to 64 letters, digits, - or _ is needed."); return String(g); };
const houseHandle = () => clean(process.env.TRIVIA_HOUSE_WALLET, 40).toLowerCase();

// Lightning and the payer, replaceable in tests. Production always uses the
// node invoices and the wallet payout path named above.
let LN = null;
export const setTriviaLightning = (o) => { LN = o; };
const ln = () => LN || import("./lightning.js");
let PAYER = null;
export const setTriviaPayer = (fn) => { PAYER = fn; }; // tests only
const pay = (args) => (PAYER ? PAYER(args) : import("./ywallet.js").then((m) => m.payOut(args)));

async function withGameLock(game, fn) {
  let release = null;
  for (let i = 0; i < 100 && !release; i++) {
    release = await acquireLock(`trv:meta:${game}`, 30);
    if (!release) await new Promise((r) => setTimeout(r, 50));
  }
  if (!release) throw err("That game is busy. Try again.", 503);
  try { return await fn(); } finally { await release(); }
}

export async function gameMeta(gameId) {
  return getJSON(`trv:meta:${cleanGame(gameId)}`);
}

async function saveMeta(meta) {
  await setJSON(`trv:meta:${meta.id}`, meta);
  return meta;
}

async function houseWallet() {
  const h = houseHandle();
  if (!h) return null;
  const { walletByHandle } = await import("./ywallet.js");
  return walletByHandle(h);
}

// A public donor message: one line, short, plain text. Links are refused, and
// angle brackets are dropped, so no stored message can become HTML.
export function cleanMessage(value) {
  const text = oneLine(value, MESSAGE_MAX).replace(/[<>\u007f-\u009f]/g, "").trim();
  if (!text) return "";
  if (LINK_RE.test(text)) throw err("Messages cannot carry links or addresses.");
  return text;
}

function cleanTarget(game, target = {}) {
  const kind = String(target.kind || "game").toLowerCase();
  if (!["game", "team", "player"].includes(kind)) throw err("A donation backs the game, a team, or a player.");
  if (kind === "game") {
    if (target.id && String(target.id) !== game) throw err("A game donation needs no target id.");
    return { kind, id: game };
  }
  const id = oneLine(target.id, 64);
  if (!id) throw err("Name the team or player this donation backs.");
  return { kind, id };
}

function cleanPlayers(players = []) {
  const seen = new Set();
  return (players || []).map((p, i) => {
    const name = oneLine(p?.name, 24);
    const account = clean(p?.account, 40).toLowerCase();
    if (!name) throw err(`Player ${i + 1} needs a name.`);
    if (!ACCOUNT_RE.test(account)) throw err(`Player ${i + 1} needs an account of 3 to 20 letters, digits, dot, dash or underscore.`);
    if (seen.has(account)) throw err("That account already joined this game.");
    seen.add(account);
    return { id: `p${i + 1}`, name, account, joinedAt: nowIso() };
  });
}

// Every player starts equal: the same play units, no matter who paid what.
export const allocBattle = (playerIds) => Object.fromEntries((playerIds || []).map((id) => [id, BATTLE_START]));

// Battle sats move between players, never in or out: the total never changes.
export function moveBattle(battle, fromId, toId, sats) {
  if (!Number.isSafeInteger(sats) || sats <= 0) throw err("Battle sats move as a whole positive number.");
  if (typeof battle?.[fromId] !== "number" || typeof battle?.[toId] !== "number") throw err("Both players hold battle sats first.");
  if (fromId === toId) throw err("Battle sats move between two players.");
  if (battle[fromId] < sats) throw err("That player holds fewer battle sats.");
  battle[fromId] -= sats;
  battle[toId] += sats;
  return battle;
}

// ---- games (Stanley creates and schedules; reads stay up when off) ----------

export async function createGame({ id, title, startsAt = null, players = [] } = {}) {
  requireTrivia();
  const game = cleanGame(id || `g${crypto.randomBytes(9).toString("base64url").slice(0, 11)}`);
  const name = oneLine(title, 80);
  if (!name) throw err("Give the game a title.");
  let start = null;
  if (startsAt) {
    start = new Date(startsAt).toISOString();
    if (Number.isNaN(Date.parse(start)) || Date.parse(start) <= Date.now()) throw err("Schedule the game in the future.");
  }
  const roster = cleanPlayers(players);
  if (roster.length > MAX_PLAYERS) throw err(`At most ${MAX_PLAYERS} players per game.`);
  return withGameLock(game, async () => {
    if (await getJSON(`trv:meta:${game}`)) throw err("That game id is taken.", 409);
    const meta = { id: game, title: name, status: "scheduled", createdAt: nowIso(), startsAt: start,
      players: roster, battle: allocBattle(roster.map((p) => p.id)), winners: [], cancel: null };
    await saveMeta(meta);
    await pushId("trv:games", game);
    return meta;
  });
}

export async function scheduleGame(gameId, startsAt) {
  requireTrivia();
  const game = cleanGame(gameId);
  const start = new Date(startsAt).toISOString();
  if (Number.isNaN(Date.parse(start)) || Date.parse(start) <= Date.now()) throw err("Schedule the game in the future.");
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    if (meta.status !== "scheduled") throw err("Only a scheduled game moves.");
    meta.startsAt = start;
    return saveMeta(meta);
  });
}

// One account per player per game: the same account can never hold two seats,
// and a seat never changes hands. Joins close when the game starts.
export async function joinGame(gameId, { name, account } = {}, nowMs = Date.now()) {
  requireTrivia();
  const game = cleanGame(gameId);
  const cleanName = oneLine(name, 24);
  const cleanAccount = clean(account, 40).toLowerCase();
  if (!cleanName) throw err("Give your player a name.");
  if (!ACCOUNT_RE.test(cleanAccount)) throw err("An account of 3 to 20 letters, digits, dot, dash or underscore is needed.");
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    if (meta.status !== "scheduled" && meta.status !== "lobby") throw err("This game is closed to joins.");
    if (meta.startsAt && Date.parse(meta.startsAt) <= nowMs) throw err("This game already started.");
    if (meta.players.some((p) => p.account === cleanAccount)) throw err("That account already joined this game.", 409);
    if (meta.players.length >= MAX_PLAYERS) throw err(`At most ${MAX_PLAYERS} players per game.`);
    const player = { id: `p${meta.players.length + 1}`, name: cleanName, account: cleanAccount, joinedAt: new Date(nowMs).toISOString() };
    meta.players.push(player);
    meta.battle[player.id] = BATTLE_START;
    await saveMeta(meta);
    return player;
  });
}

// ---- donor funding ----------------------------------------------------------

const ACCEPTING = new Set(["scheduled", "lobby", "live"]);

export async function fundGame(gameId, { sats, target, message } = {}) {
  requireTrivia();
  const game = cleanGame(gameId);
  const meta = await gameMeta(game);
  if (!meta) throw err("No such game.", 404);
  if (!ACCEPTING.has(meta.status)) throw err("This game no longer takes donations.");
  const amount = Number(sats);
  if (!Number.isInteger(amount) || amount < DONATE.min || amount > DONATE.max)
    throw err(`Donate a whole number of sats from ${DONATE.min} to ${DONATE.max.toLocaleString("en-US")}.`);
  const to = cleanTarget(game, target);
  const text = message === undefined || message === null || message === "" ? "" : cleanMessage(message);
  // Donations open once Stanley points the pool at a Ye₿ente wallet: settling
  // credits that wallet, and payouts leave from it, so every cap is enforced.
  const house = await houseWallet();
  if (!house) throw err("Donor funding is not open yet.", 503);
  const { limits, incoming } = await import("./ywallet.js");
  const open = await getMany("trv:don", await listIds("trv:donopen", 2000));
  const openSats = open.filter((i) => i?.state === "open").reduce((t, i) => t + (i.sats || 0), 0);
  if (house.balance + (await incoming(house.id)) + openSats + amount > limits().maxBalance)
    throw err("This game pool is full. Try a smaller amount.");
  const { createInvoice, qrSvg } = await ln();
  let inv;
  try { inv = await createInvoice({ sats: amount, memo: `Mempool Mayhem donor pool ${game}`, nodeOnly: true }); }
  catch { throw err("The node is offline. Try again in a minute.", 503); }
  const intent = { hash: inv.paymentHash, game, sats: amount, target: to, message: text, state: "open", at: nowIso(), expiresAt: inv.expiresAt };
  await setJSON(`trv:don:${intent.hash}`, intent);
  await pushId("trv:donopen", intent.hash);
  await pushId(`trv:dons:${game}`, intent.hash);
  return { bolt11: inv.bolt11, qr: await qrSvg(`lightning:${inv.bolt11}`.toUpperCase()), hash: intent.hash, sats: amount, expiresAt: inv.expiresAt };
}

// One invoice, one credit: paid marks the intent, records the stake, and
// credits the house wallet under the invoice hash, so a retry pays once.
export async function settleDonor(hash) {
  const h = clean(hash, 64);
  if (!HASH_RE.test(h)) throw err("Unknown invoice.", 404);
  const it = await getJSON(`trv:don:${h}`);
  if (!it) throw err("Unknown invoice.", 404);
  if (it.state !== "open") return it.state;
  const { invoicePaid } = await ln();
  const paid = await invoicePaid({ provider: "lnd", paymentHash: h }).catch(() => null);
  if (paid === true) {
    await withGameLock(it.game, async () => {
      const fresh = await getJSON(`trv:don:${h}`);
      if (!fresh || fresh.state !== "open") return;
      fresh.state = "paid";
      fresh.paidAt = nowIso();
      await setJSON(`trv:don:${h}`, fresh);
      const label = fresh.target.kind === "game" ? "the game" : `${fresh.target.kind} ${fresh.target.id}`;
      await record(it.game, { ref: `donor:${h}`, sats: fresh.sats, kind: "stake", note: `Donor pool for ${label}`.slice(0, 120) });
      const house = await houseWallet();
      if (house) {
        const { credit } = await import("./ywallet.js");
        await credit({ walletId: house.id, sats: fresh.sats, kind: "receive", ref: `trv-don:${h}`, counterparty: "Trivia donors" });
      }
      await removeFromList("trv:donopen", [h]);
    });
    return "paid";
  }
  if (Date.parse(it.expiresAt) + 60e3 < Date.now()) {
    it.state = "expired";
    await setJSON(`trv:don:${h}`, it);
    await removeFromList("trv:donopen", [h]);
    return "expired";
  }
  return "open";
}

export async function donorStatus(hash) {
  const h = clean(hash, 64);
  if (!HASH_RE.test(h)) throw err("Unknown invoice.", 404);
  const it = await getJSON(`trv:don:${h}`);
  if (!it) throw err("Unknown invoice.", 404);
  const state = it.state === "open" ? await settleDonor(h) : it.state;
  const fresh = await getJSON(`trv:don:${h}`);
  return { hash: h, game: fresh.game, sats: fresh.sats, state, target: fresh.target, message: fresh.message, expiresAt: fresh.expiresAt };
}

async function intentsOf(game) {
  return getMany("trv:don", await listIds(`trv:dons:${cleanGame(game)}`, 2000));
}

export async function poolView(gameId) {
  const game = cleanGame(gameId);
  const meta = await gameMeta(game);
  if (!meta) throw err("No such game.", 404);
  const intents = await intentsOf(game);
  const paid = intents.filter((i) => i.state === "paid");
  const t = await totals(game);
  const house = await houseWallet();
  return {
    game, title: meta.title, status: meta.status,
    poolSats: t.net, // real sats in the pool: donations in, prizes and returns out
    donorsPaid: paid.length, donorsOpen: intents.filter((i) => i.state === "open").length,
    donatedSats: paid.reduce((n, i) => n + i.sats, 0),
    messages: paid.filter((i) => i.message).sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || "")).slice(0, 50)
      .map((i) => ({ target: i.target, message: i.message, sats: i.sats, at: i.paidAt })),
    battle: meta.battle,
    players: meta.players.length, winners: meta.winners,
    house: house ? { handle: house.handle, balance: house.balance } : null,
    ledger: { net: t.net, count: t.count },
  };
}

export async function publicGame(gameId) {
  const meta = await gameMeta(cleanGame(gameId));
  if (!meta) throw err("No such game.", 404);
  return { id: meta.id, title: meta.title, status: meta.status, startsAt: meta.startsAt,
    players: meta.players.map((p) => ({ id: p.id, name: p.name })), winners: meta.winners,
    cancel: meta.cancel ? { rule: meta.cancel.rule, ruleText: meta.cancel.ruleText, at: meta.cancel.at } : null };
}

// ---- cancel (Stanley; the written rule is stored on the game) ----------------

export async function cancelGame(gameId, { rule, note = "", nextGame = null } = {}) {
  requireTrivia();
  const game = cleanGame(gameId);
  if (!CANCEL_RULES[rule]) throw err("Cancel with a rule: keep for the next game, or return to donors.");
  const why = oneLine(note, 200);
  const next = nextGame ? cleanGame(nextGame) : null;
  if (rule === "keep" && !next) throw err("Name the scheduled game that keeps these sats.");
  if (rule === "keep" && next === game) throw err("The next game must be another game.");
  return withGameLock(game, async () => {
    const meta = await gameMeta(game);
    if (!meta) throw err("No such game.", 404);
    if (meta.status === "over" || meta.status === "cancelled") throw err("This game already ended.");
    if (rule === "keep") {
      const other = await gameMeta(next);
      if (!other) throw err("No such next game.", 404);
      if (other.status !== "scheduled") throw err("Only a scheduled game can keep these sats.");
    }
    const intents = await intentsOf(game);
    const t = await totals(game);
    for (const it of intents.filter((i) => i.state === "open")) {
      it.state = "cancelled";
      await setJSON(`trv:don:${it.hash}`, it);
      await removeFromList("trv:donopen", [it.hash]);
    }
    if (rule === "keep") {
      if (t.net > 0) {
        await record(game, { ref: `carry-out:${next}`, sats: -t.net, kind: "adjust", note: `Carried to game ${next}` });
        await record(next, { ref: `carry-in:${game}`, sats: t.net, kind: "stake", note: `Carried from game ${game}` });
      }
      for (const it of intents.filter((i) => i.state === "paid")) {
        it.carriedTo = next;
        await setJSON(`trv:don:${it.hash}`, it);
      }
      meta.cancel = { rule, ruleText: `${CANCEL_RULES.keep} Next game: ${next}.`, at: nowIso(), note: why, nextGame: next, poolSats: t.net };
    } else {
      for (const it of intents.filter((i) => i.state === "paid")) {
        it.state = "return_pending";
        await setJSON(`trv:don:${it.hash}`, it);
        await record(game, { ref: `return:${it.hash}`, sats: -it.sats, kind: "refund", note: "Marked for manual return by Stanley" });
      }
      meta.cancel = { rule, ruleText: CANCEL_RULES.return, at: nowIso(), note: why, poolSats: t.net };
    }
    meta.status = "cancelled";
    await saveMeta(meta);
    await archive(game); // entries stay readable; nothing is deleted
    return meta.cancel;
  });
}

// ---- payouts (Stanley approves; winners are paid over Lightning) --------------

// Each winner's share of what is left: the pool divided by the winners still
// unpaid. The last winner takes the remainder, dust included.
export function shareOf(poolSats, winnersLeft) {
  if (!Number.isSafeInteger(poolSats) || poolSats <= 0) throw err("The pool is empty.", 409);
  if (!Number.isInteger(winnersLeft) || winnersLeft < 1) throw err("No winner waits for a payout.", 409);
  return Math.floor(poolSats / winnersLeft);
}

// What one winner is paid, by destination. A Ye₿ente handle settles inside the
// ledger, free; an invoice or address travels over Lightning, so the share
// keeps a routing fee reserve and the winner is paid the net amount. Invoices
// name their own amount: above the net share they are refused, below it the
// rest stays in the pool.
export async function payoutQuote(to, part) {
  const { feeReserve, HANDLE_RE, DOMAIN, lnurlToUrl } = await import("./ywallet.js");
  const raw = String(to || "").trim().replace(/^lightning:/i, "");
  const lower = raw.toLowerCase();
  if (!raw) throw err("Pay to a Lightning invoice, address, or Ye₿ente handle.");
  if (/^ln(bc|tb|bcrt)/.test(lower)) {
    const { bolt11Msats } = await ln();
    const msats = bolt11Msats(lower);
    if (!msats || msats % 1000) throw err("That invoice has no amount in whole sats.");
    const amount = msats / 1000;
    const fee = feeReserve(amount);
    if (amount + fee > part) throw err(`That invoice is above this winner's share after the Lightning fee. Ask for at most ${(part - feeReserve(part)).toLocaleString("en-US")} sats.`);
    return { kind: "invoice", sats: amount, fee };
  }
  const own = lower.match(new RegExp(`^([a-z0-9._-]+)(?:@${escapeRegExp(DOMAIN())})?$`));
  const mine = lnurlToUrl(raw)?.match(new RegExp(`^https://${escapeRegExp(DOMAIN())}/\\.well-known/lnurlp/([a-z0-9._-]+)$`, "i"));
  if ((own && HANDLE_RE.test(own[1])) || (mine && HANDLE_RE.test(mine[1].toLowerCase()))) return { kind: "handle", sats: part, fee: 0 };
  const fee = feeReserve(part);
  if (part - fee < DONATE.min) throw err("The pool is too small to pay out over Lightning.");
  return { kind: "address", sats: part - fee, fee };
}

export async function payoutOf(game, winner) {
  return getJSON(`trv:payout:${cleanGame(game)}:${oneLine(winner, 64)}`);
}

// One payout per winner, approved by Stanley. Guards, in order: the switch,
// the lockdown, the finished game, the share, the house wallet, then the
// wallet's own checks (PIN, spendable caps, outbound, fee reserve). Mid-game
// withdrawals are impossible: only an ended game with named winners pays.
export async function approvePayout(gameId, { winner, to, pin } = {}) {
  requireTrivia();
  if (deadmanActive()) throw err("The Deadman's Switch is active: payouts are paused until Stanley lifts the lockdown.", 503);
  const game = cleanGame(gameId);
  const who = oneLine(winner, 64);
  if (!who) throw err("Name the winning player.");
  if (!String(pin || "")) throw err("The house wallet PIN approves this payout.");
  const dest = clean(to, 2000);
  if (!dest) throw err("Pay to a Lightning invoice, address, or Ye₿ente handle.");
  const meta = await gameMeta(game);
  if (!meta) throw err("No such game.", 404);
  if (meta.status !== "over") throw err("Payouts open when the game ends. Battle sats never leave mid-game.", 409);
  if (!meta.winners.includes(who)) throw err("That player is not a winner of this game.", 404);
  const house = await houseWallet();
  if (!house) throw err("Set TRIVIA_HOUSE_WALLET to the pool wallet first.", 503);

  const key = `trv:payout:${game}:${who}`;
  const pending = await withGameLock(game, async () => {
    const done = await getJSON(key);
    if (done?.state === "done") return { done: true, record: done };
    if (done?.state === "pending" && Date.now() - Date.parse(done.at) < 10 * 60e3) throw err("That payout is already going out.", 409);
    const t = await totals(game);
    const left = [];
    for (const w of meta.winners) {
      const r = await getJSON(`trv:payout:${game}:${w}`);
      if (r?.state !== "done") left.push(w);
    }
    if (!left.includes(who)) throw err("That winner is already paid.", 409);
    const part = shareOf(t.net, left.length);
    const quote = await payoutQuote(dest, part);
    const mark = { game, winner: who, to: dest, sats: quote.sats, fee: quote.fee, kind: quote.kind, state: "pending", at: nowIso() };
    await setJSON(key, mark);
    return { done: false, record: mark };
  });
  if (pending.done) return pending.record;

  let paid;
  try {
    paid = await pay({ from: house, to: dest, sats: pending.record.sats, pin: String(pin) });
  } catch (e) {
    await withGameLock(game, async () => {
      await setJSON(key, { ...pending.record, state: "failed", error: String(e.message || "The payment failed.").slice(0, 200), at: nowIso() });
    });
    throw e;
  }
  return withGameLock(game, async () => {
    await record(game, { ref: `payout:${game}:${who}`, sats: -pending.record.sats, kind: "prize", playerId: who, note: `Winner payout, ${pending.record.kind}` });
    // A finished Lightning payment names its real routing fee: the pool books
    // it, so the next winner's share counts real sats. A pending payment keeps
    // its reserve in the house wallet, and the wallet's own checks backstop it.
    const actualFee = paid?.status === "completed" ? Math.floor(Number(paid.fee)) || 0 : 0;
    if (actualFee > 0) await record(game, { ref: `payout-fee:${game}:${who}`, sats: -actualFee, kind: "fee", playerId: who, note: "Lightning routing fee" });
    const final = { ...pending.record, state: "done", ref: paid?.ref || null, feePaid: actualFee, at: nowIso() };
    await setJSON(key, final);
    return final;
  });
}

export async function payoutsOf(gameId) {
  const meta = await gameMeta(cleanGame(gameId));
  if (!meta) throw err("No such game.", 404);
  const out = [];
  for (const w of meta.winners || []) out.push((await getJSON(`trv:payout:${meta.id}:${w}`)) || { game: meta.id, winner: w, state: "unpaid" });
  return out;
}
