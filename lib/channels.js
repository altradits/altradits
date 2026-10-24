// The node's Lightning channels for the Finance tab: capacity, what we can
// still receive, alerts before payments start failing, advice for the next
// channel, and a lessons log that grows from running the node.
import { lndChannels, onchainFeeRates, spendCheck } from "./lightning.js";
import { statement } from "./statement.js";
import { emailOwner } from "./email.js";
import { getJSON, setJSON } from "./store.js";
import { LESSONS, AVOID } from "../data/lightning-lessons.js";

const fmt = (n) => `${Math.round(n).toLocaleString("en-US")} sats`;
const roundUp = (n, step) => Math.ceil(n / step) * step;
const DAY = 864e5;

// What the website actually receives over Lightning, from the statement.
async function demand(now) {
  const ln = (await statement()).payments.filter((p) => p.channel === "lightning" && p.sats > 0);
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
    totals: { capacity, inbound, local: channels.reduce((t, c) => t + c.local, 0), active: active.length, channels: channels.length },
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
    await emailOwner(`Lightning: ${fresh.length} channel alert${fresh.length > 1 ? "s" : ""}`, fresh.map((a) => `• ${a.text}`).join("\n\n"), { label: "Open Finance", url: `${(process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "")}/admin#finance` });
    for (const a of fresh) sent[a.key] = now;
    await setJSON("ln:alerted", sent);
  }
  return { alerts: r.alerts.length, emailed: fresh.length };
}
