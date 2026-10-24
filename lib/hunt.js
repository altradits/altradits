// The weekly treasure hunt. Every marketing post carries one letter of the
// week's word; letters are spread across X, LinkedIn, Facebook and TikTok, so
// solving it means visiting all our pages. Solving gives the player a personal
// share link; the coupon unlocks once someone else opens that link (the organic
// marketing action), and it works for exactly one order.
//
// Coupon lifecycle: active -> reserved (on an unpaid order) -> used
//                   (a reservation lapses after 2 hours if that order isn't paid)
import crypto from "node:crypto";
import { getJSON, setJSON, hit } from "./store.js";
import { HUNT } from "../data/marketing.js";
import { safeEqual } from "./http.js";

const WEEK = 7 * 864e5;
const EPOCH = Date.parse("2026-01-05T00:00:00Z"); // a Monday: hunt #1
const now = () => new Date().toISOString();
const ipHash = (ip) => crypto.createHash("sha256").update(`hunt:${ip}`).digest("hex").slice(0, 20);
const pick = (alphabet, n) => Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");

export function huntFor(date = new Date()) {
  const n = Math.floor((date.getTime() - EPOCH) / WEEK) + 1;
  const word = HUNT.words[(n - 1) % HUNT.words.length];
  return { n, word, startsAt: new Date(EPOCH + (n - 1) * WEEK).toISOString(), endsAt: new Date(EPOCH + n * WEEK).toISOString() };
}

// The letter a post carries: seq counts posts through the week, so each day's
// posts across all channels cover the whole word.
export function traceFor(date, seq) {
  const h = huntFor(date);
  const pos = seq % h.word.length;
  return { n: h.n, pos: pos + 1, len: h.word.length, letter: h.word[pos] };
}

// One fixed branded hashtag carries the clue on every platform, every week.
export function traceLine(channelId, t) {
  if (channelId === "x") return `${HUNT.hashtag} letter ${t.pos}/${t.len}: ${t.letter}`;
  return `${HUNT.hashtag} letter ${t.pos} of ${t.len}: ${t.letter}. Collect every letter across our pages, solve the word at altradits.com/hunt and win a one-time coupon.`;
}

// ------------------------------------------------------------- solving
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");

export async function solve(answer, ip) {
  if ((await hit(`rl:hunt:${ipHash(ip)}`, 3600)) > 12) return { error: "Too many tries. Try again in an hour.", status: 429 };
  const guess = norm(answer);
  // This week's word, or last week's for a day after it ends.
  const current = huntFor();
  const last = huntFor(new Date(Date.now() - WEEK));
  const h = guess && guess === current.word ? current : guess && guess === last.word && Date.now() - Date.parse(last.endsAt) < 864e5 ? last : null;
  if (!h) return { error: "Not quite. Check you have every letter in order.", status: 400 };

  const ipKey = `hunt:ip:${h.n}:${ipHash(ip)}`;
  const existing = await getJSON(ipKey);
  if (existing) { const c = await getJSON(`hunt:claim:${existing}`); if (c) return { claim: publicClaim(c) }; }
  const claim = {
    id: crypto.randomBytes(9).toString("base64url"), t: crypto.randomBytes(12).toString("base64url"),
    code: pick("abcdefghjkmnpqrstuvwxyz23456789", 8), hunt: h.n, ip: ipHash(ip), status: "share", createdAt: now(),
  };
  await setJSON(`hunt:claim:${claim.id}`, claim);
  await setJSON(`hunt:share:${claim.code}`, claim.id);
  await setJSON(ipKey, claim.id);
  await bump(h.n, "solved");
  return { claim: publicClaim(claim) };
}

function publicClaim(c, coupon = null) {
  return { id: c.id, t: c.t, hunt: c.hunt, status: c.status, share: `${HUNT.site}/h/${c.code}`, shoutout: c.shoutout || null, shoutDone: Boolean(c.shoutDone), coupon: coupon && { code: coupon.code, pct: coupon.pct, expiresAt: coupon.expiresAt, status: coupon.status } };
}

export async function claimStatus(id, t) {
  const c = await getJSON(`hunt:claim:${String(id).slice(0, 20)}`);
  if (!c || !safeEqual(c.t, String(t || ""))) return null;
  return publicClaim(c, c.coupon ? await getJSON(`coupon:${c.coupon}`) : null);
}

// Someone opened a player's share link. A visit from the player's own
// connection doesn't count.
export async function visit(code, ip) {
  if (!/^[a-z2-9]{8}$/.test(code || "")) return { ok: false };
  const id = await getJSON(`hunt:share:${code}`);
  const c = id && await getJSON(`hunt:claim:${id}`);
  if (!c || c.status !== "share" || c.ip === ipHash(ip)) return { ok: false };
  if ((await hit(`rl:huntvisit:${ipHash(ip)}`, 3600)) > 5) return { ok: false };
  const coupon = await createCoupon({ claimId: c.id, hunt: c.hunt });
  Object.assign(c, { status: "earned", coupon: coupon.code, earnedAt: now() });
  await setJSON(`hunt:claim:${c.id}`, c);
  await bump(c.hunt, "earned");
  if (c.shoutout) await queueShoutout(c);
  return { ok: true };
}

// ------------------------------------------------------------- shoutouts
// Winners who opt in are congratulated in our next post that goes out. On X
// an @handle tags them; elsewhere the APIs can't tag people, so the handle or
// first name appears as plain text. Only strict formats are accepted, since
// this text is published.
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const NAME = /^[A-Za-z][A-Za-z' -]{0,19}$/;

export async function setShoutout(id, t, { handle = "", name = "" } = {}) {
  const c = await getJSON(`hunt:claim:${String(id).slice(0, 20)}`);
  if (!c || !safeEqual(c.t, String(t || ""))) return { error: "Not found", status: 404 };
  const h = String(handle).trim().replace(/^@/, ""), n = String(name).trim().replace(/\s+/g, " ");
  if (!h && !n) { c.shoutout = null; await setJSON(`hunt:claim:${c.id}`, c); await dropShoutout(c.id); return { ok: true }; }
  if (h && !HANDLE.test(h)) return { error: "That X handle doesn't look right (letters, numbers and _ only, up to 15).", status: 400 };
  if (n && !NAME.test(n)) return { error: "Just a first name, please (letters only, up to 20).", status: 400 };
  c.shoutout = { handle: h, name: n };
  await setJSON(`hunt:claim:${c.id}`, c);
  if (c.status === "earned") await queueShoutout(c);
  return { ok: true };
}

async function queueShoutout(c) {
  const q = ((await getJSON("hunt:shoutq")) || []).filter((w) => w.claimId !== c.id);
  if (c.shoutDone) return;
  q.push({ claimId: c.id, handle: c.shoutout.handle, name: c.shoutout.name, hunt: c.hunt, at: now() });
  await setJSON("hunt:shoutq", q);
}
async function dropShoutout(claimId) {
  await setJSON("hunt:shoutq", ((await getJSON("hunt:shoutq")) || []).filter((w) => w.claimId !== claimId));
}
export const pendingShoutouts = async () => (await getJSON("hunt:shoutq")) || [];
export const removeShoutout = dropShoutout;

// The shoutout line for a post about to go out, using as many waiting winners
// as fit in `room` characters (at most 5). Those winners leave the queue.
export async function takeShoutouts(channelId, room = 500) {
  const q = await pendingShoutouts();
  if (!q.length) return "";
  const who = (w) => (channelId === "x" ? (w.handle ? `@${w.handle}` : w.name) : w.name || `@${w.handle}`);
  const line = (ws) => `🏆 Congrats to our latest ${HUNT.hashtag} winners: ${ws.map(who).join(", ")}!`;
  const used = [];
  for (const w of q) { if (used.length < 5 && line([...used, w]).length <= room) used.push(w); }
  if (!used.length) return "";
  await setJSON("hunt:shoutq", q.filter((w) => !used.includes(w)));
  for (const w of used) { const c = await getJSON(`hunt:claim:${w.claimId}`); if (c) { c.shoutDone = now(); await setJSON(`hunt:claim:${c.id}`, c); } }
  return line(used);
}

async function bump(n, field) {
  const s = (await getJSON(`hunt:stats:${n}`)) || { solved: 0, earned: 0, used: 0 };
  s[field]++;
  await setJSON(`hunt:stats:${n}`, s);
}
export const huntStats = async (n) => (await getJSON(`hunt:stats:${n}`)) || { solved: 0, earned: 0, used: 0 };

// ------------------------------------------------------------- coupons
export async function createCoupon({ claimId = null, hunt = null, pct = HUNT.couponPct } = {}) {
  let code;
  do { code = `HUNT-${pick("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6)}`; } while (await getJSON(`coupon:${code}`));
  const coupon = { code, pct, status: "active", claimId, hunt, createdAt: now(), expiresAt: new Date(Date.now() + HUNT.couponDays * 864e5).toISOString() };
  await setJSON(`coupon:${code}`, coupon);
  return coupon;
}

const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
const lapsed = (c) => c.status === "reserved" && Date.now() - Date.parse(c.reservedAt) > 2 * 3600e3;

// Applies a coupon to an unpaid order (a proposal). Returns the coupon or throws.
export async function reserveCoupon(code, proposalId) {
  const c = await getJSON(`coupon:${normCode(code)}`);
  if (!c) throw new Error("That code isn't valid.");
  if (c.status === "used") throw new Error("That code has already been used.");
  if (Date.parse(c.expiresAt) < Date.now()) throw new Error("That code has expired.");
  if (c.status === "reserved" && c.reservedFor !== proposalId && !lapsed(c)) throw new Error("That code is being used on another order.");
  Object.assign(c, { status: "reserved", reservedFor: proposalId, reservedAt: now() });
  await setJSON(`coupon:${c.code}`, c);
  return c;
}

export async function releaseCoupon(code, proposalId) {
  const c = await getJSON(`coupon:${normCode(code)}`);
  if (c?.status === "reserved" && c.reservedFor === proposalId) { Object.assign(c, { status: "active", reservedFor: null }); await setJSON(`coupon:${c.code}`, c); }
}

// On payment: the code is spent for good.
export async function useCoupon(code, proposalId) {
  const c = await getJSON(`coupon:${normCode(code)}`);
  if (!c || c.status === "used") return null;
  Object.assign(c, { status: "used", usedAt: now(), usedOn: proposalId });
  await setJSON(`coupon:${c.code}`, c);
  if (c.hunt) await bump(c.hunt, "used");
  return c;
}
