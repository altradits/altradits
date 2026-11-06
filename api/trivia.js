// Mempool Mayhem public API: health, donor funding, joins, and open books.
//
//   GET  /api/trivia                       -> health (always answers, on or off)
//   GET  /api/trivia?view=pool&game=       -> pool, paid messages, battle sats, ledger totals
//   GET  /api/trivia?view=ledger&game=     -> ledger entries and totals (open books)
//   GET  /api/trivia?view=donor&hash=      -> one donor invoice: open, paid, or expired
//   GET  /api/trivia?view=game&game=       -> public game info (names, never accounts)
//   GET  /api/trivia?view=games            -> recent games for joining and watching
//   GET  /api/trivia?view=play&game=&account? -> live play: open question, ranks, your seat
//   POST /api/trivia { action: "fund", game, sats, target, message } -> donor invoice
//   POST /api/trivia { action: "join", game, name, account }         -> take a seat
//   POST /api/trivia { action: "answer", game, account, index }      -> answer the open round
//
// Bot resistance is honest: rate limits, one account per player per game, a
// per-game join lock, and join timing (joins close at the start). No third
// party captcha, no fingerprinting. Live play adds an answer speed check: a
// reply too fast to have read the question is refused. No cookies anywhere,
// so no CSRF to forge: state changes carry no ambient credentials.
// The server owns live play: it settles closed rounds on every read, stamps
// every reply on its own clock, and checks correctness at resolve time.
import { json, readBody, clean, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { triviaHealth } from "../lib/trivia.js";

const fail = (e) => json({ error: e.message || "Something went wrong." }, e.status || 400);
const hour = () => new Date().toISOString().slice(0, 13);

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const view = q.get("view") || "health";
  if (view === "health") return json(triviaHealth());
  const ip = clientIp(request);
  if ((await hit(`rl:trv:read:${ip}`, 60)) > 120) return json({ error: "Too many reads. Slow down a little." }, 429);
  if ((await hit(`rl:trv:read:all:${hour()}`, 3600)) > 20000) return json({ error: "Busy right now. Try again in a minute." }, 429);
  try {
    const dn = await import("../lib/trivia-donors.js");
    if (view === "pool") return json(await dn.poolView(q.get("game")));
    if (view === "game") return json(await dn.publicGame(q.get("game")));
    if (view === "ledger") {
      const game = q.get("game");
      const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 200));
      return json({ game, entries: await dn.ledgerEntries(game, limit), totals: await dn.ledgerTotals(game) });
    }
    if (view === "donor") {
      if ((await hit(`rl:trv:donor:${ip}`, 600)) > 300) return json({ error: "Too many checks." }, 429);
      return json(await dn.donorStatus(q.get("hash")));
    }
    if (view === "games") {
      const live = await import("../lib/trivia-live.js");
      return json({ games: await live.gamesList() });
    }
    if (view === "play") {
      const live = await import("../lib/trivia-live.js");
      return json(await live.playView(q.get("game"), { account: q.get("account") || null }));
    }
    return json({ error: "Unknown view." }, 404);
  } catch (e) { return fail(e); }
}

export async function POST(request) {
  const body = await readBody(request);
  const ip = clientIp(request);
  try {
    const dn = await import("../lib/trivia-donors.js");
    if (body.action === "fund") {
      if ((await hit(`rl:trv:fund:${ip}`, 3600)) > 20) return json({ error: "Too many invoices. Try again in an hour." }, 429);
      if ((await hit(`rl:trv:fund:all:${hour()}`, 3600)) > 200) return json({ error: "Busy right now. Try again in a few minutes." }, 429);
      return json(await dn.fundGame(clean(body.game, 64), { sats: body.sats, target: body.target, message: body.message }));
    }
    if (body.action === "join") {
      if ((await hit(`rl:trv:join:${ip}`, 3600)) > 10) return json({ error: "Too many joins. Try again in an hour." }, 429);
      if ((await hit(`rl:trv:join:all:${hour()}`, 3600)) > 500) return json({ error: "Busy right now. Try again in a few minutes." }, 429);
      return json({ ok: true, player: await dn.joinGame(clean(body.game, 64), { name: body.name, account: body.account }) });
    }
    if (body.action === "answer") {
      if ((await hit(`rl:trv:ans:${ip}`, 3600)) > 300) return json({ error: "Too many answers. Try again in an hour." }, 429);
      if ((await hit(`rl:trv:ans:all:${hour()}`, 3600)) > 20000) return json({ error: "Busy right now. Try again in a few minutes." }, 429);
      const live = await import("../lib/trivia-live.js");
      return json(await live.submitAnswer(clean(body.game, 64), { account: body.account, index: body.index }));
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) { return fail(e); }
}
