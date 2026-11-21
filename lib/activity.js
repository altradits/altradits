// Ye₿ente activity (admin): deposits and transactions per wallet over a
// period, ranked by completed transactions, so Stanley can reward the most
// active users. Read only. Handles only: no emails, recovery data or devices.
import { getMany, listIds } from "./store.js";

const IN = new Set(["receive", "buy"]);

export async function walletActivity({ days = 30, now = Date.now(), limit = 50 } = {}) {
  const since = days ? now - days * 864e5 : 0;
  const wallets = await getMany("yw", await listIds("ywallets", 100000));
  const rows = [];
  const total = { deposits: 0, depositSats: 0, sends: 0, sentSats: 0, transfers: 0, transferSats: 0, transactions: 0 };
  for (const w of wallets) {
    const entries = (await getMany("ywe", await listIds(`ywtx:${w.id}`, 5000)))
      .filter((e) => e.status === "completed" && Date.parse(e.at) >= since && e.sats);
    if (!entries.length) continue;
    const r = { handle: w.handle, createdAt: w.createdAt, deposits: 0, depositSats: 0, sends: 0, sentSats: 0, transfers: 0, transferSats: 0, transactions: entries.length, lastAt: null };
    for (const e of entries) {
      const sats = Math.abs(Number(e.sats) || 0);
      if (IN.has(e.kind)) { r.deposits++; r.depositSats += sats; }
      else if (e.kind === "send") { r.sends++; r.sentSats += sats; }
      else if (e.kind === "transfer_in" || e.kind === "transfer_out") { r.transfers++; r.transferSats += sats; }
      if (!r.lastAt || e.at > r.lastAt) r.lastAt = e.at;
    }
    for (const k of Object.keys(total)) total[k] += r[k];
    rows.push(r);
  }
  rows.sort((a, b) => b.transactions - a.transactions || (b.depositSats + b.sentSats + b.transferSats) - (a.depositSats + a.sentSats + a.transferSats));
  return { days, wallets: wallets.length, active: rows.length, total, top: rows.slice(0, limit) };
}

// Every Ye₿ente wallet's balance, largest first (admin). Handles only.
export async function walletBalances({ now = Date.now() } = {}) {
  const wallets = await getMany("yw", await listIds("ywallets", 100000));
  const rows = [];
  for (const w of wallets) {
    const last = (await getMany("ywe", await listIds(`ywtx:${w.id}`, 1)))[0];
    rows.push({ handle: w.handle, balance: Number(w.balance) || 0, createdAt: w.createdAt, lastAt: last?.at || null, email: Boolean(w.email), locked: Boolean(w.lockedUntil && Date.parse(w.lockedUntil) > now) });
  }
  rows.sort((a, b) => b.balance - a.balance);
  return { count: rows.length, total: rows.reduce((t, r) => t + r.balance, 0), wallets: rows };
}

// Where clients' money goes: completed payments out of Ye₿ente, grouped by
// destination. Phone numbers in M-Pesa addresses are masked.
const mask = (s) => String(s || "").replace(/\d{6,}/g, (d) => `${d.slice(0, 4)}…${d.slice(-3)}`);
export async function destinations({ days = 90, now = Date.now() } = {}) {
  const since = days ? now - days * 864e5 : 0;
  const wallets = await getMany("yw", await listIds("ywallets", 100000));
  const by = new Map();
  for (const w of wallets) {
    for (const e of await getMany("ywe", await listIds(`ywtx:${w.id}`, 5000))) {
      if (e.kind !== "send" || e.status !== "completed" || Date.parse(e.at) < since) continue;
      const key = mask(e.counterparty) || "Lightning invoice";
      const d = by.get(key) || { to: key, mpesa: /@bitcoin\.co\.ke$/i.test(e.counterparty || ""), payments: 0, sats: 0, from: new Set(), lastAt: null, receipts: [] };
      d.payments++; d.sats += Math.abs(Number(e.sats) || 0); d.from.add(w.handle);
      if (!d.lastAt || e.at > d.lastAt) d.lastAt = e.at;
      if (e.receiptUrl && /^https:\/\//.test(e.receiptUrl)) d.receipts.push({ at: e.at, url: e.receiptUrl });
      by.set(key, d);
    }
  }
  return { days, destinations: [...by.values()].map((d) => ({ ...d, from: d.from.size, receipts: d.receipts.slice(-5) })).sort((a, b) => b.sats - a.sats) };
}

// The cockpit (admin Overview): Ye₿ente per day for the last `days` days, and
// the same totals for the `days` before, so each number shows its trend and
// its change. Days are Kenyan days (UTC+3). Read only; counts and sums only.
const EAT = 3 * 3600e3;
const dayOf = (ms) => new Date(ms + EAT).toISOString().slice(0, 10);
export async function cockpitSeries({ days = 30, now = Date.now() } = {}) {
  const today = Date.parse(dayOf(now)) - EAT; // the start of today in Kenya
  const start = today - (days - 1) * 864e5, before = start - days * 864e5;
  const blank = () => ({ newWallets: 0, deposits: 0, depositSats: 0, sends: 0, sentSats: 0, transfers: 0, failedSends: 0, active: 0 });
  const series = Array.from({ length: days }, (_, i) => ({ day: dayOf(start + i * 864e5), ...blank() }));
  const prev = blank(), activeNow = new Set(), activePrev = new Set(), reasons = new Map();
  const slot = (ms) => (ms >= start ? series[Math.floor((ms - start) / 864e5)] : ms >= before ? prev : null);
  const wallets = await getMany("yw", await listIds("ywallets", 100000));
  let held = 0;
  for (const w of wallets) {
    held += Number(w.balance) || 0;
    const made = slot(Date.parse(w.createdAt));
    if (made) made.newWallets++;
    const activeDays = new Set();
    for (const e of await getMany("ywe", await listIds(`ywtx:${w.id}`, 5000))) {
      const ms = Date.parse(e.at), s = slot(ms);
      if (!s) continue;
      if (e.kind === "send" && e.status === "failed") {
        s.failedSends++;
        // Why, in its first sentence (the reason people saw), counted for the last period only.
        if (s !== prev) { const why = String(e.error || "No reason recorded").split(/(?<=\.)\s/)[0].slice(0, 120); reasons.set(why, (reasons.get(why) || 0) + 1); }
        continue;
      }
      if (e.status !== "completed" || !e.sats) continue;
      const sats = Math.abs(Number(e.sats) || 0);
      if (IN.has(e.kind)) { s.deposits++; s.depositSats += sats; }
      else if (e.kind === "send" || e.kind === "send_mobile") { s.sends++; s.sentSats += sats; }
      else if (e.kind === "transfer_in" || e.kind === "transfer_out") s.transfers++;
      if (s === prev) activePrev.add(w.id);
      else { activeNow.add(w.id); if (!activeDays.has(s.day)) { activeDays.add(s.day); s.active++; } }
    }
  }
  const sum = (k) => series.reduce((t, d) => t + d[k], 0);
  const now30 = Object.fromEntries(Object.keys(blank()).map((k) => [k, sum(k)]));
  now30.active = activeNow.size; prev.active = activePrev.size;
  const failReasons = [...reasons].map(([why, count]) => ({ why, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  return { days, at: new Date(now).toISOString(), wallets: wallets.length, heldSats: held, series, totals: now30, previous: prev, failReasons };
}

// What is open right now (admin cockpit): payments, buys and payouts that
// haven't finished, with how many have waited too long. Counts, sums and ages
// only. "Too long" is past the point where each normally settles on its own.
export async function openItems({ now = Date.now() } = {}) {
  const age = (r) => now - Date.parse(r.at || 0);
  const sum = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const group = (rows, lateMs, k) => ({ count: rows.length, late: rows.filter((r) => age(r) > lateMs).length, oldestAt: rows.reduce((o, r) => (!o || r.at < o ? r.at : o), null), amount: sum(rows, k) });
  const pays = (await getMany("ywpay", await listIds("ywpayopen", 500))).filter((p) => p && !p.done);
  const buys = [...await getMany("ywbuy", await listIds("ywbuyopen", 500)), ...await getMany("ywcard", await listIds("ywcardopen", 500)), ...await getMany("ywbit", await listIds("ywbitopen", 500))].filter((b) => b && b.state === "pending");
  const payouts = (await getMany("ywmob", await listIds("ywmobopen", 500))).filter((p) => p && !p.done);
  return {
    payments: group(pays, 10 * 60e3, "sats"),   // Lightning sends settle in seconds; the check runs every few minutes
    buys: group(buys, 30 * 60e3, "kes"),        // an M-Pesa or card buy left pending half an hour
    payouts: group(payouts, 15 * 60e3, "kes"),  // direct M-Pesa payouts waiting for Safaricom
  };
}

// kTown payments per Kenyan day, and the period before: how shops are paid.
export async function ktownSeries({ days = 30, now = Date.now() } = {}) {
  const today = Date.parse(dayOf(now)) - EAT, start = today - (days - 1) * 864e5, before = start - days * 864e5;
  const series = Array.from({ length: days }, (_, i) => ({ day: dayOf(start + i * 864e5), payments: 0, sats: 0, failed: 0 }));
  const prev = { payments: 0, sats: 0, failed: 0 };
  let stuck = 0;
  for (const id of await listIds("ktowns", 1000)) {
    for (const e of await getMany("kte", await listIds(`kt:tx:${id}`, 5000))) {
      const ms = Date.parse(e.at);
      // Pending past an hour: almost always an invoice nobody paid (it stays
      // pending by design). The hourly server check confirms any that were paid.
      if (e.status === "pending" && now - ms > 3600e3 && now - ms < days * 864e5) stuck++;
      const s = ms >= start ? series[Math.floor((ms - start) / 864e5)] : ms >= before ? prev : null;
      if (!s) continue;
      if (e.status === "completed") { s.payments++; s.sats += Number(e.sats) || 0; } else if (e.status === "failed") s.failed++;
    }
  }
  const total = { payments: 0, sats: 0, failed: 0 };
  for (const d of series) for (const k of Object.keys(total)) total[k] += d[k];
  return { series, total, previous: prev, stuck };
}
