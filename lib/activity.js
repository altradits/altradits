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
