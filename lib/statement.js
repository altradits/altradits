// Statement of everything received through the website, in sats.
// - Before 31 Oct 2026: paid orders and donations from the agency's records,
//   read once from the archive file and kept for good in "ledger:website"
//   (payment records are never deleted, even when the archive is).
// - Since: support payments made on /donate (api/tip.js).
// Ye₿ente deposits aren't here: they're wallet holders' money, not the website's.
import fs from "node:fs";
import path from "node:path";
import { getJSON, setJSON, keysWithPrefix, listArchives, ARCHIVE } from "./store.js";

const LEDGER = "ledger:website";
const channel = (p) => (p.payment?.method?.includes("on-chain") ? "onchain" : "lightning");

// Paid orders and donations out of every archive file, merged into the permanent ledger.
export async function keepArchivedPayments() {
  const ledger = (await getJSON(LEDGER)) || { payments: [], from: [] };
  const seen = new Set(ledger.payments.map((x) => x.id));
  for (const a of listArchives()) {
    if (ledger.from.includes(a.name)) continue;
    let kv = {};
    try { kv = JSON.parse(fs.readFileSync(path.join(ARCHIVE(), a.name), "utf8")).kv || {}; } catch { continue; }
    for (const [k, p] of Object.entries(kv)) {
      if (!k.startsWith("proposal:") || !(p.status === "paid" || p.payment?.confirmedAt) || seen.has(p.id)) continue;
      seen.add(p.id);
      ledger.payments.push({ id: p.id, at: p.payment?.confirmedAt || p.updatedAt, receipt: p.receipt?.no || null,
        what: p.donation ? "Donation: Bitcoin education" : p.order?.name || p.title || "Order", type: p.donation ? "donation" : "order",
        sats: Number(p.payment?.sats) || 0, channel: channel(p), payer: p.client?.name || "" });
    }
    ledger.from.push(a.name);
  }
  await setJSON(LEDGER, ledger);
  return ledger;
}

export async function statement() {
  const ledger = await keepArchivedPayments();
  const tips = (await Promise.all((await keysWithPrefix("tip:")).map(async (k) => ({ k, t: await getJSON(k) }))))
    .filter(({ t }) => t?.paidAt).map(({ k, t }) => ({ id: k.slice(4, 16), at: t.paidAt, receipt: null, what: "Support for open-source work", type: "support", sats: t.sats, channel: "lightning", payer: "" }));
  const contact = (await Promise.all((await keysWithPrefix("contact:msg:")).map(async (k) => getJSON(k))))
    .filter((t) => t?.paidAt).map((t) => ({ id: t.id, at: t.paidAt, receipt: t.receipt || null, what: `Contact message (${t.label || t.topic})`, type: "contact", sats: t.sats, channel: "lightning", payer: t.name || "" }));
  const payments = [...ledger.payments, ...tips, ...contact].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const sum = (list) => ({ sats: list.reduce((t, x) => t + x.sats, 0), count: list.length });
  const months = Object.entries(payments.reduce((m, x) => ((m[String(x.at).slice(0, 7)] ||= []).push(x), m), {}))
    .map(([month, list]) => ({ month, ...sum(list) })).sort((a, b) => b.month.localeCompare(a.month));
  return { total: sum(payments), orders: sum(payments.filter((x) => x.type === "order")), donations: sum(payments.filter((x) => x.type === "donation")),
    support: sum(payments.filter((x) => x.type === "support")), contact: sum(payments.filter((x) => x.type === "contact")), months, payments };
}

// For the books. Cells can't start a spreadsheet formula.
const cell = (v) => { const s = String(v ?? ""); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
export async function statementCsv() {
  const { payments } = await statement();
  const head = ["date", "type", "what", "sats", "channel", "receipt", "payer"];
  return [head.join(","), ...payments.map((x) => [x.at, x.type, x.what, x.sats, x.channel, x.receipt, x.payer].map(cell).join(","))].join("\n");
}
