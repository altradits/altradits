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
