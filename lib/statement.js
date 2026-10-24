// Finance's statement of everything received through the website: every paid
// order and donation, totals in USD and sats, by channel, month and service.
// Donations are shown apart from sales (they aren't revenue).
import { listIds, getMany } from "./store.js";

const r2 = (n) => Math.round(n * 100) / 100;
const channel = (p) => (p.payment?.method?.includes("on-chain") ? "onchain" : "lightning");

export async function statement() {
  const paid = (await getMany("proposal", await listIds("proposals", 100000)))
    .filter((p) => p.status === "paid" || p.payment?.confirmedAt)
    .sort((a, b) => String(b.payment?.confirmedAt || "").localeCompare(String(a.payment?.confirmedAt || "")));
  const payments = paid.map((p) => ({
    at: p.payment?.confirmedAt || p.updatedAt, receipt: p.receipt?.no || null,
    client: p.client?.name || p.client?.email || "", email: p.client?.email || "",
    what: p.donation ? "Donation: Bitcoin education" : p.order?.name || p.title,
    type: p.donation ? "donation" : "sale", usd: r2(p.totals?.dueNow || 0), sats: Number(p.payment?.sats) || 0,
    channel: channel(p), reference: p.payment?.reference || "", coupon: p.coupon?.code || null,
  }));
  const sum = (list) => ({ usd: r2(list.reduce((t, x) => t + x.usd, 0)), sats: list.reduce((t, x) => t + x.sats, 0), count: list.length });
  const group = (key) => Object.entries(payments.reduce((m, x) => ((m[key(x)] ||= []).push(x), m), {}))
    .map(([k, list]) => ({ key: k, ...sum(list), sales: sum(list.filter((x) => x.type === "sale")).usd, donations: sum(list.filter((x) => x.type === "donation")).usd }));
  return {
    total: sum(payments),
    sales: sum(payments.filter((x) => x.type === "sale")),
    donations: sum(payments.filter((x) => x.type === "donation")),
    channels: { lightning: sum(payments.filter((x) => x.channel === "lightning")), onchain: sum(payments.filter((x) => x.channel === "onchain")) },
    months: group((x) => String(x.at).slice(0, 7)).sort((a, b) => b.key.localeCompare(a.key)),
    services: group((x) => x.what).filter((g) => g.sales > 0).sort((a, b) => b.usd - a.usd),
    payments,
  };
}

// For the books. Cells can't start a spreadsheet formula.
const cell = (v) => { const s = String(v ?? ""); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
export async function statementCsv() {
  const { payments } = await statement();
  const head = ["date", "receipt", "type", "client", "email", "what", "usd", "sats", "channel", "reference", "coupon"];
  return [head.join(","), ...payments.map((x) => [x.at, x.receipt, x.type, x.client, x.email, x.what, x.usd.toFixed(2), x.sats, x.channel, x.reference, x.coupon].map(cell).join(","))].join("\n");
}
