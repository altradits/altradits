// The node's Lightning channels for the admin Node tab: capacity, what we can
// still receive, alerts before payments start failing, advice for the next
// channel, and a lessons log that grows from running the node.
import { lndChannels, onchainFeeRates, spendCheck, createInvoice, invoicePaid, qrSvg, spendableIn } from "./lightning.js";
import { emailOwner } from "./email.js";
import { getJSON, setJSON, pushId, listIds, getMany, keysWithPrefix } from "./store.js";
import { LESSONS, AVOID } from "../data/lightning-lessons.js";

const fmt = (n) => `${Math.round(n).toLocaleString("en-US")} sats`;
const roundUp = (n, step) => Math.ceil(n / step) * step;
const DAY = 864e5;

// What the node actually receives over Lightning: payments into Ye₿ente wallets.
async function demand(now) {
  const ln = (await Promise.all((await keysWithPrefix("ywe:")).map((k) => getJSON(k)))).filter((e) => e?.kind === "receive" && e.sats > 0);
  const month = ln.filter((p) => now - Date.parse(p.at) < 30 * DAY);
  return { month: month.reduce((t, p) => t + p.sats, 0), largest: Math.max(0, ...ln.map((p) => p.sats)), count: month.length };
}

// Pure: alerts and advice from the channels and the demand (tests call this).
export function assess({ channels, pending = [] }, need, fees) {
  const active = channels.filter((c) => c.active);
  const inbound = active.reduce((t, c) => t + Math.max(0, c.remote - (c.reserve || 0)), 0);
  const capacity = channels.reduce((t, c) => t + c.capacity, 0);
  // Room for the next couple of weeks of payments, and at least a few of the largest one.
  const want = Math.max(need.month / 2, need.largest * 3, 100000);
  const alerts = [];
  if (!channels.length) alerts.push({ key: "none", level: "critical", text: pending.some((p) => p.status === "opening") ? "No channel is open yet (one is still opening). Lightning payments go to the Lightning address until it confirms." : "No Lightning channel. The website can't receive on your node; payments go to the Lightning address instead. Open a channel with inbound liquidity." });
  else if (!active.length) alerts.push({ key: "offline", level: "critical", text: "Every channel is offline: the node or its peers aren't reachable. Check the Mac is awake and LND is running." });
  else if (inbound < want) alerts.push({ key: "inbound", level: inbound < need.largest ? "critical" : "warning", text: `Inbound is low: you can receive ${fmt(inbound)}, and the next two weeks may need about ${fmt(want)}. Open a new channel with inbound liquidity, or close a full one and reopen (below).` });
  for (const c of channels) {
    const share = c.capacity ? c.local / c.capacity : 0;
    if (!c.active) alerts.push({ key: `down:${c.id}`, level: "warning", text: `Channel with ${c.alias || `${c.peer.slice(0, 12)}…`} is offline. If the peer stays offline for days, close it so the funds return on-chain (a force close takes about two weeks and costs more).` });
    else if (share >= 0.9) alerts.push({ key: `full:${c.id}`, level: "warning", text: `Channel with ${c.alias || `${c.peer.slice(0, 12)}…`} is ${Math.round(share * 100)}% on your side: it can hardly receive any more. Close it cooperatively (or swap the sats out) and open a fresh channel with inbound.` });
  }
  const suggest = roundUp(Math.max(need.month * 2, need.largest * 10, 500000), 100000);
  return {
    totals: { capacity, inbound, local: channels.reduce((t, c) => t + c.local, 0), active: active.length, channels: channels.length,
      spendable: active.reduce((t, c) => t + Math.max(0, c.local - (c.localReserve || 0)), 0), localReserve: active.reduce((t, c) => t + (c.localReserve || 0), 0) },
    alerts,
    advice: {
      capacity: suggest,
      why: `About two months of what the website receives over Lightning (${fmt(need.month)} in the last 30 days, largest single payment ${fmt(need.largest)}), with room to grow, and never under 500,000 sats so on-chain fees stay a small share.`,
      fees: fees ? `On-chain fees now: ${fees.fast} sat/vB fast, ${fees.slow} sat/vB slow. ${fees.slow > 20 ? "That's high: open or close when fees drop unless payments are failing." : "That's a good time to open or close."}` : null,
      avoid: AVOID,
    },
  };
}

// Lessons: the starting ones (data/lightning-lessons.js) plus what Stanley adds.
export async function lessons() { return [...((await getJSON("ln:lessons")) || []), ...LESSONS]; }
export async function addLesson(text) {
  const t = String(text || "").trim().slice(0, 600);
  if (t.length < 5) throw new Error("Write what happened and what we learned.");
  const list = (await getJSON("ln:lessons")) || [];
  list.unshift({ at: new Date().toISOString().slice(0, 10), text: t });
  await setJSON("ln:lessons", list.slice(0, 200));
  return list[0];
}

export async function channelReport(now = Date.now()) {
  const [need, fees] = await Promise.all([demand(now), onchainFeeRates().catch(() => null)]);
  let node, error = null;
  try { node = await lndChannels(); } catch (err) { node = { channels: [], pending: [] }; error = err.message; }
  const report = error ? { totals: null, alerts: [{ key: "unreachable", level: "warning", text: `Can't read the node: ${error}` }], advice: assess(node, need, fees).advice } : assess(node, need, fees);
  // Sending power: our side below the channel reserve can send nothing (Ye₿ente sends, M-Pesa via Tando).
  if (!error && report.totals && report.totals.spendable < 10_000) report.alerts.unshift({ key: "send", level: report.totals.spendable < 1000 ? "critical" : "warning",
    text: `The node can send only ${fmt(report.totals.spendable)}: ${fmt(report.totals.local)} on our side, ${fmt(report.totals.localReserve)} of it locked as the channel reserve. Ye₿ente sends (including M-Pesa) fail until you top up: admin → Sending power.` });
  // The website's node key must only receive.
  const key = error ? null : await spendCheck().catch(() => null);
  if (key && (key.lightning || key.onchain)) report.alerts.unshift({ key: "spend", level: "critical", text: `The node key the website uses can send money${key.lightning && key.onchain ? " (Lightning and on-chain)" : key.lightning ? " over Lightning" : " on-chain"}. Replace LND_INVOICE_MACAROON in DirectAdmin with a receive-only key (the node's invoice.macaroon) right away.` });
  return { ...report, receiveOnly: key ? !key.lightning && !key.onchain : null, channels: node.channels, pending: node.pending, demand: need, lessons: await lessons(), checkedAt: new Date(now).toISOString() };
}

// Hourly: email Stanley about a new alert, at most once a day per alert.
export async function watchChannels(now = Date.now()) {
  const r = await channelReport(now);
  const sent = (await getJSON("ln:alerted")) || {};
  const fresh = r.alerts.filter((a) => a.level !== "info" && !(sent[a.key] && now - sent[a.key] < DAY));
  if (fresh.length) {
    await emailOwner(`Lightning: ${fresh.length} channel alert${fresh.length > 1 ? "s" : ""}`, fresh.map((a) => `• ${a.text}`).join("\n\n"), { label: "Open the dashboard", url: `${(process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "")}/admin` });
    for (const a of fresh) sent[a.key] = now;
    await setJSON("ln:alerted", sent);
  }
  return { alerts: r.alerts.length, emailed: fresh.length };
}

// ---- Sending power: top up the node's side of its channels (admin only).
// Any payment into the node raises what it can send. Stanley pays a node invoice
// from any Lightning wallet; the node's own record confirms it. Kept inside the
// admin: a public version would publish the node's balances (telling an attacker
// exactly when it can't pay) and reopen sign-in-free invoice creation, which the
// security audit closed. Supporters can give through /donate, which lands on the
// node the same way.
const TOPUP_MIN = 1_000, TOPUP_MAX = 2_000_000, BUFFER = 20_000;

export async function liquidityView() {
  const node = await lndChannels();
  const active = node.channels.filter((c) => c.active);
  const local = active.reduce((t, c) => t + c.local, 0), reserve = active.reduce((t, c) => t + (c.localReserve || 0), 0);
  const spendable = spendableIn(node.channels), inbound = active.reduce((t, c) => t + Math.max(0, c.remote - (c.reserve || 0)), 0);
  const { liabilities, walletsOn } = await import("./ywallet.js");
  const owed = walletsOn() ? await liabilities() : { wallets: 0, sats: 0 };
  // Enough to pay out every Ye₿ente balance plus a working buffer, never more than the channels can take in.
  const suggested = Math.min(Math.max(0, roundUp(owed.sats + BUFFER - spendable, 1000)), Math.floor(inbound * 0.9), TOPUP_MAX);
  const topups = (await getMany("topup", await listIds("topups", 10))).map(({ bolt11, ...t }) => t);
  const max = Math.min(TOPUP_MAX, Math.floor(inbound * 0.9));
  // Ready-made amounts for the QR (the custom field takes any other), and today's shilling rate
  // so each one can say how much M-Pesa sending it makes possible.
  const presets = [...new Set([10_000, 30_000, 60_000, 100_000, 250_000, suggested >= TOPUP_MIN ? suggested : 0])].filter((n) => n >= TOPUP_MIN && n <= max).sort((a, b) => a - b);
  const { btcKes } = await import("./lightning.js");
  const kesPerBtc = await btcKes().catch(() => null);
  return { local, reserve, spendable, inbound, owedSats: owed.sats, wallets: owed.wallets, covered: spendable >= owed.sats, suggested: suggested >= TOPUP_MIN ? suggested : 0,
    min: TOPUP_MIN, max, presets, satsPerKes: kesPerBtc ? 1e8 / kesPerBtc : null, topups };
}

export async function startTopup(sats) {
  sats = Number(sats);
  const v = await liquidityView();
  if (!Number.isSafeInteger(sats) || sats < TOPUP_MIN || sats > v.max) throw Object.assign(new Error(`Choose a whole number of sats from ${fmt(TOPUP_MIN)} to ${fmt(v.max)}.`), { status: 400 });
  const inv = await createInvoice({ sats, memo: "Altradits node top-up (sending power)", nodeOnly: true, expiry: 3600 });
  const t = { hash: inv.paymentHash, sats, bolt11: inv.bolt11, at: new Date().toISOString(), expiresAt: inv.expiresAt, state: "open", spendableBefore: v.spendable };
  await setJSON(`topup:${t.hash}`, t);
  await pushId("topups", t.hash);
  return { hash: t.hash, sats, bolt11: inv.bolt11, expiresAt: inv.expiresAt, qr: await qrSvg(`lightning:${inv.bolt11}`.toUpperCase()) };
}

// Paid? Asked of the node itself (never a third party).
export async function topupStatus(hash) {
  const t = /^[0-9a-f]{64}$/.test(String(hash)) && (await getJSON(`topup:${hash}`));
  if (!t) return null;
  if (t.state === "open") {
    if (await invoicePaid({ provider: "lnd", paymentHash: t.hash })) { t.state = "paid"; t.paidAt = new Date().toISOString(); await setJSON(`topup:${t.hash}`, t); }
    else if (Date.parse(t.expiresAt) < Date.now()) { t.state = "expired"; await setJSON(`topup:${t.hash}`, t); }
  }
  return { hash: t.hash, sats: t.sats, state: t.state, paidAt: t.paidAt || null };
}
