// Njia: the node earnings app (/njia, admin Earn tab). It only ever reads the
// node, through njiaRead() in lib/lightning.js (the read-only macaroon, GETs
// plus the /v1/switch read). Leases and marketplace prices are typed in by
// Stanley by hand. Nothing here opens or closes channels, sends, sets fees,
// changes node settings, or calls any outside service.
//
// Store keys (lib/store.js):
//   njia:settings            { identity, numbers, listingUrl, decided, updatedAt }
//   njia:setlog (list)       ids of njia:set:<id> { id, at, by, field, from, to, ip }
//   njia:snap                last admin snapshot { at, ... } (60 s cache)
//   njia:public              public summary, rebuilt hourly { at, on, stage, stops, line, numbers?, identity? }
//   njia:day:<YYYY-MM-DD>    forwarding per day { fees, count, volumeSats, at }
//   njia:reach:<YYYY-MM-DD>  node reachability samples { checks, ok }
//   njia:leases (list)       ids of njia:lease:<id> { id, kind, at, date, sizeSats, feeSats, termDays, market, chainFeeSats, point, buyer, note, voids?, reason? }
//   njia:prices (list)       ids of njia:price:<id> { id, at, date, market, sizeSats, priceSats, ratePct, ppm, termDays, note }
//   rl:njia:*                rate-limit counters (expire)
import { getJSON, setJSON, pushId, listIds, getMany, keysWithPrefix } from "./store.js";
import { switchOn } from "./ywallet.js";
import { clean, oneLine, newId } from "./http.js";
import { njiaRead, njiaPing, njiaNode, bucketForwardingFees, annotatePeerFlaps, onchainFeeRates } from "./lightning.js";
import { backupStatus } from "./scb.js";
import { deadmanActive } from "./deadman.js";

export const njiaOn = () => switchOn("NJIA");
export const RESERVE_FLOOR = 10_000;
export const MARKETS = ["Magma", "Lightning Pool", "direct", "other"];
export const LISTING_HOSTS = ["amboss.space", "magma.amboss.space", "lightning.engineering", "pool.lightning.finance", "1ml.com", "mempool.space"];
const CONFIRM_WORD = { identity: "LINK", numbers: "SHOW" };

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const validDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const whole = (v) => (typeof v === "number" && Number.isSafeInteger(v) ? v : (/^-?\d+$/.test(String(v ?? "").trim()) ? Number(String(v).trim()) : NaN));

// ---- settings (Identity, Numbers, listing link, privacy decision) ----------

export async function getSettings() {
  const s = (await getJSON("njia:settings")) || {};
  return { identity: Boolean(s.identity), numbers: Boolean(s.numbers), listingUrl: s.listingUrl || null,
    decided: Boolean(s.decided), updatedAt: s.updatedAt || null };
}

async function logSetting({ field, from, to, ip }) {
  const id = newId();
  const e = { id, at: new Date().toISOString(), by: "stanley", field, from: from ?? null, to: to ?? null, ip: String(ip || "").slice(0, 64) };
  await setJSON(`njia:set:${id}`, e);
  await pushId("njia:setlog", id);
  return e;
}

export async function setSetting({ field, value, confirm = "", ip = "" } = {}) {
  if (!["identity", "numbers", "decided"].includes(field)) throw err("Unknown setting.");
  const on = value === true;
  const s = await getSettings();
  const from = Boolean(s[field]);
  if (on && (field === "identity" || field === "numbers")) {
    if (confirm !== CONFIRM_WORD[field]) throw err(`Type ${CONFIRM_WORD[field]} to switch ${field} on.`);
    if (deadmanActive()) throw err("Deadman's Switch is active: revealing settings stay off until you lift the lockdown.", 503);
  }
  const next = { ...s, [field]: on, updatedAt: new Date().toISOString() };
  await setJSON("njia:settings", next);
  await logSetting({ field, from, to: on, ip });
  return next;
}

// One https URL on a trusted marketplace host. Normalized href, or null.
export function validListingUrl(url) {
  let u;
  try { u = new URL(String(url || "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!LISTING_HOSTS.includes(u.hostname.toLowerCase())) return null;
  return u.href;
}

export async function setListing({ url, ip = "" } = {}) {
  const href = validListingUrl(url);
  if (!href) throw err("That isn't a trusted marketplace link. Use https on amboss.space, magma.amboss.space, lightning.engineering, pool.lightning.finance, 1ml.com or mempool.space.");
  const s = await getSettings();
  const from = s.listingUrl;
  const next = { ...s, listingUrl: href, updatedAt: new Date().toISOString() };
  await setJSON("njia:settings", next);
  await logSetting({ field: "listing", from, to: href, ip });
  return next;
}

export async function settingLog(limit = 50) {
  return getMany("njia:set", await listIds("njia:setlog", limit));
}

// ---- lease ledger (append-only; mistakes are voided, never deleted) --------

const POINT_RE = /^[0-9a-f]{64}:\d{1,5}$/i;

export async function addLease({ date, sizeSats, feeSats, termDays, market, chainFeeSats = 0, point = "", buyer = "", note = "", now = Date.now() } = {}) {
  if (!validDay(date)) throw err("Pick the lease date.");
  if (date > dayOf(now)) throw err("The date can't be in the future.");
  const size = whole(sizeSats);
  if (!Number.isSafeInteger(size) || size < 20_000 || size > 100_000_000) throw err("Size must be 20,000 to 100,000,000 sats.");
  const fee = whole(feeSats);
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > size) throw err("Fee must be 0 sats up to the size.");
  const term = whole(termDays);
  if (!Number.isSafeInteger(term) || term < 1 || term > 3650) throw err("Term must be 1 to 3,650 days.");
  if (!MARKETS.includes(market)) throw err("Pick where the lease sold: Magma, Lightning Pool, direct or other.");
  const chainFee = whole(chainFeeSats);
  if (!Number.isSafeInteger(chainFee) || chainFee < 0 || chainFee > 10_000_000) throw err("Chain fee must be 0 sats or more.");
  const p = String(point || "").trim();
  if (p && !POINT_RE.test(p)) throw err("Channel point looks like txid:index (64 hex chars, a colon, the output number).");
  const e = { id: newId(), kind: "lease", at: new Date(now).toISOString(), date, sizeSats: size, feeSats: fee,
    termDays: term, market, chainFeeSats: chainFee, point: p || null,
    buyer: oneLine(buyer, 40) || null, note: clean(note, 200) || null };
  await setJSON(`njia:lease:${e.id}`, e);
  await pushId("njia:leases", e.id);
  return e;
}

export async function voidLease({ id, reason = "", now = Date.now() } = {}) {
  const leases = await listLeases();
  const target = leases.find((l) => l.id === id && l.kind === "lease");
  if (!target) throw err("No such lease.", 404);
  if (leases.some((l) => l.kind === "void" && l.voids === id)) throw err("That lease is already voided.");
  const r = oneLine(reason, 200);
  if (!r) throw err("Say why it is void, so the books stay honest.");
  const e = { id: newId(), kind: "void", at: new Date(now).toISOString(), date: dayOf(now), voids: id, reason: r };
  await setJSON(`njia:lease:${e.id}`, e);
  await pushId("njia:leases", e.id);
  return e;
}

export async function listLeases() {
  return getMany("njia:lease", await listIds("njia:leases", 5000));
}

export function liveLeases(leases) {
  const voided = new Set((leases || []).filter((l) => l.kind === "void").map((l) => l.voids));
  return (leases || []).filter((l) => l.kind === "lease" && !voided.has(l.id));
}

// A lease's yearly rate in percent, from its own figures. Always an estimate.
export const leaseYearlyPct = (l) => (l?.sizeSats > 0 && l?.termDays > 0
  ? Math.round(((Number(l.feeSats) || 0) / l.sizeSats / l.termDays) * 365 * 100 * 10) / 10 : null);

export function leaseTotals(leases, now = Date.now()) {
  const live = liveLeases(leases);
  const sum = (list) => list.reduce((t, l) => t + (Number(l.feeSats) || 0), 0);
  const since = (days) => live.filter((l) => Date.parse(`${l.date}T00:00:00Z`) >= now - days * 864e5);
  return { count: live.length, month: sum(since(30)), m3: sum(since(90)), all: sum(live),
    chainFees: live.reduce((t, l) => t + (Number(l.chainFeeSats) || 0), 0) };
}

const csvCell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v ?? "").replace(/"/g, '""')}"` : String(v ?? ""));
export function ledgerCsv(leases) {
  const live = new Set(liveLeases(leases).map((l) => l.id));
  const rows = [["id", "kind", "date", "size_sats", "fee_sats", "term_days", "market", "chain_fee_sats", "point", "live", "note"]];
  for (const l of leases || []) {
    if (l.kind === "void") { rows.push([l.id, "void", l.at?.slice(0, 10) || "", "", "", "", "", "", "", "", `voids ${l.voids}: ${l.reason || ""}`]); continue; }
    rows.push([l.id, "lease", l.date, l.sizeSats, l.feeSats, l.termDays, l.market, l.chainFeeSats || 0, l.point || "", live.has(l.id) ? "yes" : "no", l.note || ""]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// ---- marketplace prices (typed in by hand; the site fetches none) ----------

export async function addPrice({ date, market, sizeSats, priceSats = null, ratePct = null, ppm = null, termDays = null, note = "", now = Date.now() } = {}) {
  if (!validDay(date)) throw err("Pick the quote date.");
  if (date > dayOf(now)) throw err("The date can't be in the future.");
  const m = oneLine(market, 40);
  if (!m) throw err("Name the marketplace.");
  const size = whole(sizeSats);
  if (!Number.isSafeInteger(size) || size < 20_000 || size > 100_000_000) throw err("Size must be 20,000 to 100,000,000 sats.");
  const price = priceSats === null || priceSats === "" ? null : whole(priceSats);
  const rate = ratePct === null || ratePct === "" ? null : Number(ratePct);
  const parts = ppm === null || ppm === "" ? null : whole(ppm);
  const term = termDays === null || termDays === "" ? null : whole(termDays);
  if (price === null && rate === null && parts === null) throw err("Enter a price in sats, a rate in percent, or ppm.");
  if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > size)) throw err("Price must be 0 sats up to the size.");
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) throw err("Rate must be 0 to 100 percent.");
  if (parts !== null && (!Number.isSafeInteger(parts) || parts < 0 || parts > 1_000_000)) throw err("PPM must be 0 to 1,000,000.");
  if (term !== null && (!Number.isSafeInteger(term) || term < 1 || term > 3650)) throw err("Term must be 1 to 3,650 days.");
  const e = { id: newId(), at: new Date(now).toISOString(), date, market: m, sizeSats: size,
    priceSats: price, ratePct: rate ?? (price !== null ? Math.round((price / size) * 100 * 1000) / 1000 : null),
    ppm: parts, termDays: term, note: clean(note, 200) || null };
  await setJSON(`njia:price:${e.id}`, e);
  await pushId("njia:prices", e.id);
  return e;
}

export async function listPrices() {
  return getMany("njia:price", await listIds("njia:prices", 5000));
}

// From the latest fresh quote: what 1M and 2M channels would earn, and the yearly rate.
export function priceEstimates(prices, now = Date.now()) {
  const fresh = (prices || []).filter((q) => q?.date && now - Date.parse(`${q.date}T00:00:00Z`) < 30 * 864e5);
  fresh.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const q = fresh.find((x) => x.ratePct !== null && x.ratePct !== undefined || x.ppm !== null && x.ppm !== undefined);
  if (!q) return null;
  const rate = q.ratePct ?? (q.ppm / 10000);
  return { fee1M: Math.round(1_000_000 * rate / 100), fee2M: Math.round(2_000_000 * rate / 100),
    yearlyPct: q.termDays ? Math.round((rate / q.termDays) * 365 * 10) / 10 : null, from: q.date, market: q.market };
}

// ---- checklist steps (static text; statuses come from read-only data) ------

export const STEPS = [
  { key: "backup", title: "Step 0. Protect what exists",
    why: "Without a fresh channel.backup off the Mac, closed channels are unrecoverable.",
    cmds: [], checks: ["ln-ro listchannels"],
    how: "Copy channel.backup off the Mac to two places, then press I copied the backup in Money." },
  { key: "reserve", title: "Step 1. Fund the on-chain reserve",
    why: "The reserve pays anchor fees so a force close can never strand funds.",
    cmds: ["lncli --lnddir=$HOME/.lnd-altradits --network=mainnet newaddress p2wkh"], checks: ["ln-ro walletbalance"],
    how: "Make an address on the Mac, paste it into the Address QR tool in Money, and send from your own wallet." },
  { key: "privacy", title: "Step 1b. Decide the privacy option",
    why: "A public channel announces the node alias to the whole network, whatever the page hides.",
    cmds: [], checks: ["ln-ro getinfo"],
    how: "Pick A (linked), B (neutral alias, page hidden) or C (separate node). For B, set alias= in lnd.conf and restart LND, then tick Decided below." },
  { key: "channels", title: "Step 2. Open 2 public channels",
    why: "One private channel cannot route. Routing needs public channels with funds on both sides.",
    cmds: ["lncli --lnddir=$HOME/.lnd-altradits --network=mainnet connect <pubkey>@<host>",
      "lncli --lnddir=$HOME/.lnd-altradits --network=mainnet openchannel --node_key=<pubkey> --local_amt=<sats> --sat_per_vbyte=<n>"],
    checks: ["ln-ro pendingchannels", "ln-ro listchannels --public_only"],
    how: "Record the expected chain fee first (below), then connect and open without --private. Keep the private channel: it holds the website inbound." },
  { key: "fees", title: "Step 3. Set a fair fee policy",
    why: "The LND default (1,000 msat plus 1 ppm) earns almost nothing, even when busy.",
    cmds: ["lncli --lnddir=$HOME/.lnd-altradits --network=mainnet updatechanpolicy --base_fee_msat 1000 --fee_rate_ppm 100 --time_lock_delta 80 --chan_point <point>"],
    checks: ["ln-ro feereport"],
    how: "Start near the network medians (base 500 to 1,000 msat, 50 to 200 ppm, estimates). Raise ppm where a channel drains one way." },
  { key: "uptime", title: "Step 4. Always on",
    why: "Senders route around nodes that sleep or flap.",
    cmds: ["sudo pmset -c sleep 0"], checks: [],
    how: "Keep the Mac awake on power for now. Later, move to an always-on machine with clearnet. That move is never rushed." },
  { key: "lease", title: "Step 5. First lease",
    why: "A first paid channel proves the node can sell.",
    cmds: [], checks: [],
    how: "List an offer on the marketplace by hand. When a buyer matches, record the chain fee, open the channel by hand, then add the lease below with its channel point." },
  { key: "legal", title: "Step 6. Legal check",
    why: "Selling channels and routing hold no customer funds and touch no fiat, so exposure is lower, but the VASP regime is new. Get written advice before charging. This is not legal advice.",
    cmds: [], checks: [], how: "" },
];

// Pure: step statuses from read-only data. Status is done, progress, blocked or unknown.
export function stages(read, { leases = [], reach = null, settings = {}, backup = null } = {}) {
  const channels = read?.channels ?? null, fees = read?.fees ?? null;
  const pub = (channels || []).filter((c) => !c.private);
  const live = liveLeases(leases);
  const steps = [];
  const push = (key, status, numbers = {}) => steps.push({ key, status, numbers });

  if (!backup) push("backup", "unknown");
  else if (!backup.markedAt) push("backup", "blocked");
  else if (backup.nodeRead === false) push("backup", "unknown", { markedAt: backup.markedAt });
  else push("backup", backup.stale ? "blocked" : "done", { markedAt: backup.markedAt, current: backup.current });

  const chain = read?.chain ?? null;
  if (!chain) push("reserve", "unknown");
  else if (chain.confirmed >= RESERVE_FLOOR) push("reserve", "done", { confirmed: chain.confirmed, unconfirmed: chain.unconfirmed, gap: 0 });
  else if (chain.unconfirmed > 0) push("reserve", "progress", { confirmed: chain.confirmed, unconfirmed: chain.unconfirmed, gap: RESERVE_FLOOR - chain.confirmed });
  else push("reserve", "blocked", { confirmed: chain.confirmed, unconfirmed: chain.unconfirmed, gap: RESERVE_FLOOR - chain.confirmed });

  const alias = read?.info?.alias || "";
  const aliasWarn = /altradits|stanley/i.test(alias);
  if (settings.decided) push("privacy", "done", { decided: true, aliasWarn });
  else if (pub.length > 0 && !settings.identity && aliasWarn) push("privacy", "blocked", { decided: false, aliasWarn });
  else push("privacy", "unknown", { decided: false, aliasWarn });

  if (!channels) push("channels", "unknown");
  else {
    const n = pub.filter((c) => c.active).length, announced = read?.graph?.channels ?? null;
    const pending = (read?.pending || []).length;
    if (n >= 2 && (announced === null || announced >= 2)) push("channels", "done", { public: n, announced, pending });
    else if (pending > 0) push("channels", "progress", { public: n, announced, pending });
    else push("channels", "blocked", { public: n, announced, pending });
  }

  if (!channels || !fees) push("fees", "unknown");
  else if (!pub.length) push("fees", "unknown", { note: "open public channels first" });
  else {
    const rows = pub.map((c) => {
      const p = (fees.list || []).find((f) => f.point === c.point);
      if (!p) return { point: c.point, known: false };
      const earn100k = Math.round(p.baseMsat / 1000 + (100_000 * p.ppm) / 1e6);
      const def = p.baseMsat === 1000 && p.ppm === 1;
      const okBand = p.baseMsat >= 0 && p.baseMsat <= 1000 && p.ppm >= 50 && p.ppm <= 2000;
      return { point: c.point, known: true, baseMsat: p.baseMsat, ppm: p.ppm, earn100k, def, ok: !def && okBand };
    });
    if (rows.some((r) => !r.known)) push("fees", "unknown", { rows });
    else push("fees", rows.every((r) => r.ok) ? "done" : "blocked", { rows });
  }

  const samples = reach?.samples ?? 0, pct = reach?.pct ?? null;
  const pubPeers = pub.map((c) => {
    const p = (read?.peers || []).find((x) => x.pubkey === c.peer);
    return { flapsDay: p?.flapsDay ?? null };
  });
  const uptimes = pub.map((c) => (c.lifetime > 0 ? (c.uptime / c.lifetime) * 100 : null)).filter((u) => u !== null);
  const uptimeMin = uptimes.length ? Math.round(Math.min(...uptimes) * 10) / 10 : null;
  if (!channels) push("uptime", "unknown");
  else if (!pub.length) push("uptime", "unknown", { note: "open public channels first" });
  else if (samples < 12) push("uptime", "unknown", { samples, pct, peers: pubPeers, uptimeMin });
  else if (pct === null || pct < 98) push("uptime", "blocked", { samples, pct, peers: pubPeers, uptimeMin });
  else if (pubPeers.some((p) => p.flapsDay === null)) push("uptime", "unknown", { samples, pct, peers: pubPeers, uptimeMin });
  else if (pubPeers.some((p) => p.flapsDay >= 5)) push("uptime", "blocked", { samples, pct, peers: pubPeers, uptimeMin });
  else if (uptimeMin !== null && uptimeMin < 98) push("uptime", "blocked", { samples, pct, peers: pubPeers, uptimeMin });
  else push("uptime", "done", { samples, pct, peers: pubPeers, uptimeMin });

  if (live.length > 0) push("lease", "done", { live: live.length });
  else if (settings.listingUrl) push("lease", "progress", { live: 0 });
  else push("lease", "blocked", { live: 0 });

  push("legal", "unknown");

  const byKey = Object.fromEntries(steps.map((s) => [s.key, s.status]));
  const stops = ["reserve", "channels", "fees", "uptime", "lease"].map((key) => ({ key, done: byKey[key] === "done" }));
  const firstOpen = stops.findIndex((s) => !s.done);
  const monthFees = fees?.month ?? 0;
  const line = firstOpen < 0
    ? (settings.numbers ? "Routing." : "Routing. Earnings are private for now.")
    : `${monthFees > 0 ? "Routing. " : "Not earning yet. "}Step ${firstOpen + 1} of 5.`;
  return { steps, stops, line };
}

// Pure: coarse bands for the public page. Never exact figures.
export function bands(read, leases) {
  const m = read?.fees?.month;
  const routing = m === null || m === undefined ? "unknown" : m === 0 ? "0" : m < 1000 ? "under 1,000 sats" : m <= 10000 ? "1,000 to 10,000 sats" : "over 10,000 sats";
  const n = liveLeases(leases).length;
  const leased = n === 0 ? "none" : n === 1 ? "1" : n <= 5 ? "2 to 5" : "over 5";
  const chans = read?.channels;
  const p = chans ? chans.filter((c) => !c.private).length : null;
  const channels = p === null ? "unknown" : p === 0 ? "none" : p <= 2 ? "1 to 2" : p <= 5 ? "3 to 5" : "over 5";
  return { routing, leases: leased, channels };
}

// Pure: the public summary. Built allowlist-style: only stops, the line,
// coarse bands (Numbers on) and the identity block (Identity on). Lockdown
// hides both blocks and swaps the line. Everything else never leaves.
export function publicView(snap, settings, locked) {
  const stops = (snap?.stops || []).map((s) => ({ key: String(s?.key || ""), done: Boolean(s?.done) }));
  if (locked) return { stops, line: "Paused for a security check." };
  const out = { stops, line: String(snap?.line || "") };
  if (settings?.numbers && snap?.bands) {
    out.numbers = { routing: String(snap.bands.routing || "unknown"), leases: String(snap.bands.leases || "unknown"),
      channels: String(snap.bands.channels || "unknown"), note: "Bands, updated hourly. Exact figures stay private." };
  }
  if (settings?.identity) {
    const info = snap?.read?.info || {};
    const uris = Array.isArray(info.uris) ? info.uris : [];
    out.identity = { alias: String(info.alias || ""), pubkey: String(info.pubkey || ""),
      onion: uris.find((u) => String(u).includes(".onion")) || null,
      listingUrl: settings.listingUrl || null, note: "This links the node to Altradits." };
  }
  return out;
}

// ---- reachability and monthly history --------------------------------------

export async function reachSummary(days = 14, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOf(now - i * 864e5);
    const r = (await getJSON(`njia:reach:${day}`)) || { checks: 0, ok: 0 };
    out.push({ day, checks: Number(r.checks) || 0, ok: Number(r.ok) || 0 });
  }
  const sampled = out.filter((d) => d.checks > 0);
  const checks = sampled.reduce((t, d) => t + d.checks, 0), ok = sampled.reduce((t, d) => t + d.ok, 0);
  return { days: out, samples: sampled.length, pct: checks ? Math.round((ok / checks) * 1000) / 10 : null };
}

export async function monthlyTotals() {
  const days = [];
  for (const k of await keysWithPrefix("njia:day:")) {
    const m = /^njia:day:(\d{4}-\d{2})-\d{2}$/.exec(k);
    if (m) { const d = await getJSON(k); if (d) days.push({ month: m[1], fees: Number(d.fees) || 0, count: Number(d.count) || 0 }); }
  }
  const byMonth = new Map();
  for (const d of days) {
    const e = byMonth.get(d.month) || { month: d.month, fees: 0, count: 0 };
    e.fees += d.fees; e.count += d.count; byMonth.set(d.month, e);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}

// ---- snapshot (admin data, one read-only sweep, cached 60 s) ---------------

let memSnap = null;

export async function snapshot({ force = false, get = null } = {}) {
  if (!force) {
    if (memSnap && Date.now() - Date.parse(memSnap.at) < 60e3) return { ...memSnap, cached: true };
    const stored = await getJSON("njia:snap").catch(() => null);
    if (stored?.at && Date.now() - Date.parse(stored.at) < 60e3) { memSnap = stored; return { ...stored, cached: true }; }
  }
  const read = await njiaRead({ get });
  const peers = read.peers ? await annotatePeerFlaps(read.peers).catch(() => read.peers) : null;
  const withPeers = { ...read, peers };
  const [leases, prices, reach, settings, feeRates] = await Promise.all([
    listLeases(), listPrices(), reachSummary(), getSettings(), onchainFeeRates().catch(() => null),
  ]);
  const marked = await getJSON("backup:scb").catch(() => null);
  const backup = withPeers.channels ? await backupStatus(withPeers.channels.map((c) => c.point))
    : { markedAt: marked?.at || null, stale: null, opened: [], closed: [], current: null, nodeRead: false };
  const { steps, stops, line } = stages(withPeers, { leases, reach, settings, backup });
  const chans = withPeers.channels || [];
  const local = chans.reduce((t, c) => t + c.local, 0), remote = chans.reduce((t, c) => t + c.remote, 0);
  const spendable = chans.reduce((t, c) => t + Math.max(0, c.local - c.localReserve), 0);
  const receivable = chans.reduce((t, c) => t + Math.max(0, c.remote - c.remoteReserve), 0);
  const feeByPoint = Object.fromEntries((withPeers.fees?.list || []).map((f) => [f.point, f]));
  const perChannel = chans.map((c) => {
    const p = feeByPoint[c.point];
    return { point: c.point, active: c.active, private: c.private, capacity: c.capacity,
      localShare: c.capacity ? Math.round((c.local / c.capacity) * 1000) / 10 : 0,
      spendable: Math.max(0, c.local - c.localReserve), receivable: Math.max(0, c.remote - c.remoteReserve),
      uptimePct: c.lifetime > 0 ? Math.round((c.uptime / c.lifetime) * 1000) / 10 : null,
      baseMsat: p?.baseMsat ?? null, ppm: p?.ppm ?? null,
      earn100k: p ? Math.round(p.baseMsat / 1000 + (100_000 * p.ppm) / 1e6) : null };
  });
  const fwd = withPeers.fwd || [];
  const fwdView = withPeers.fwd === null ? null : { count: fwd.length,
    volume: fwd.reduce((t, e) => t + e.sats, 0), fees: fwd.reduce((t, e) => t + e.fee, 0) };
  const dayStart = Date.parse(`${dayOf(Date.now())}T00:00:00Z`);
  const dayEv = fwd.filter((e) => e.timestamp >= dayStart);
  const today = withPeers.fwd === null ? null : { fees: dayEv.reduce((t, e) => t + e.fee, 0), count: dayEv.length,
    volumeSats: dayEv.reduce((t, e) => t + e.sats, 0) };
  const perOut = new Map();
  for (const e of fwd) {
    const o = perOut.get(e.outChan) || { chan: e.outChan, count: 0, fees: 0 };
    o.count++; o.fees += e.fee; perOut.set(e.outChan, o);
  }
  const openPoints = new Set(chans.map((c) => c.point)), closedPoints = new Set((withPeers.closed || []).map((c) => c.point));
  const chanStatus = (point) => (!point ? "unknown" : openPoints.has(point) ? "open" : closedPoints.has(point) ? "closed"
    : withPeers.channels === null ? "unknown" : "not found");
  const live = liveLeases(leases);
  const leaseRows = leases.map((l) => l.kind === "void" ? l
    : { ...l, live: live.some((x) => x.id === l.id), chan: chanStatus(l.point), yearlyPct: leaseYearlyPct(l) });
  const totals = leaseTotals(leases);
  const openCapital = live.filter((l) => chanStatus(l.point) === "open").reduce((t, l) => t + l.sizeSats, 0);
  const staleAfter = Date.now() - 30 * 864e5;
  const priceRows = prices.map((q) => ({ ...q, stale: Date.parse(`${q.date}T00:00:00Z`) < staleAfter }));
  const errs = Object.values(read.errors || {});
  const readable = Boolean(read.info || read.channels || read.chain);
  const readHint = readable ? null : errs.some((m) => /403|permission|denied/i.test(m))
    ? "Set LND_READONLY_MACAROON to see this." : (errs[0] || "The node could not be read.");
  const snap = { at: new Date().toISOString(), cached: false, on: njiaOn(), node: read.node, locked: deadmanActive(),
    readHint, settings, setlog: await settingLog(20), nodeInfo: withPeers.info, today,
    totals: withPeers.channels === null ? null : { channels: chans.length, public: chans.filter((c) => !c.private).length,
      private: chans.filter((c) => c.private).length, active: chans.filter((c) => c.active).length,
      pending: (withPeers.pending || []).length, capacity: chans.reduce((t, c) => t + c.capacity, 0), local, remote, spendable, receivable },
    reserve: withPeers.chain === null ? null : { confirmed: withPeers.chain.confirmed, unconfirmed: withPeers.chain.unconfirmed,
      floor: RESERVE_FLOOR, gap: Math.max(0, RESERVE_FLOOR - withPeers.chain.confirmed) },
    walletTotal: withPeers.chain === null && withPeers.chanbal === null ? null
      : (withPeers.chanbal?.local || 0) + (withPeers.chain?.confirmed || 0),
    perChannel: withPeers.channels === null ? null : perChannel,
    feeSums: withPeers.fees === null ? null : { day: withPeers.fees.day, week: withPeers.fees.week, month: withPeers.fees.month },
    fwd: fwdView, trend: withPeers.fwd === null ? null : bucketForwardingFees(withPeers.fwd, Date.now() - 30 * 864e5, 30),
    monthly: await monthlyTotals(), perOut: [...perOut.values()],
    reach, peers, backup, feeRates,
    leases: leaseRows, income: totals, openCapital,
    prices: priceRows, estimates: priceEstimates(prices),
    steps: STEPS.map((s) => ({ ...s, ...(steps.find((x) => x.key === s.key) || { status: "unknown", numbers: {} }) })),
    stops, line, bands: bands(withPeers, leases) };
  snap.preview = { at: snap.at, on: snap.on, stage: stops.every((s) => s.done) ? "routing" : stops.find((s) => !s.done).key,
    ...publicView({ stops, line, bands: snap.bands, read: withPeers }, settings, snap.locked) };
  memSnap = snap;
  await setJSON("njia:snap", snap).catch(() => {});
  return snap;
}

// ---- hourly summary and 5-minute reachability sample ------------------------

export async function hourly({ get = null, now = Date.now() } = {}) {
  if (!njiaOn()) return { skipped: "off" };
  if (!process.env.LND_REST_URL && !process.env.NJIA_LND_REST_URL) return { skipped: "no-node" };
  const snap = await snapshot({ force: true, get });
  const out = { ok: true, at: snap.at };
  if (snap.today) {
    await setJSON(`njia:day:${dayOf(now)}`, { ...snap.today, at: snap.at });
    out.day = dayOf(now);
  }
  const readable = snap.totals !== null || snap.reserve !== null;
  if (readable) {
    const stops = snap.stops;
    await setJSON("njia:public", { at: snap.at, on: true,
      stage: stops.every((s) => s.done) ? "routing" : stops.find((s) => !s.done).key,
      ...publicView({ stops, line: snap.line, bands: snap.bands, read: { info: snap.nodeInfo } }, snap.settings, snap.locked) });
    out.public = true;
  }
  return out;
}

export async function sample({ get = null, now = Date.now() } = {}) {
  if (!njiaOn()) return { skipped: "off" };
  if (!process.env.LND_REST_URL && !process.env.NJIA_LND_REST_URL) return { skipped: "no-node" };
  const last = await getJSON("njia:reach:claim").catch(() => null);
  if (last && now - Date.parse(last) < 4.5 * 60e3) return { skipped: "claimed" };
  await setJSON("njia:reach:claim", new Date(now).toISOString());
  let okPing = false;
  try { await njiaPing({ get }); okPing = true; } catch { okPing = false; }
  const day = dayOf(now);
  const cur = (await getJSON(`njia:reach:${day}`).catch(() => null)) || { checks: 0, ok: 0 };
  await setJSON(`njia:reach:${day}`, { checks: (Number(cur.checks) || 0) + 1, ok: (Number(cur.ok) || 0) + (okPing ? 1 : 0) });
  return { ok: okPing };
}
