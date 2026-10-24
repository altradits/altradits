// Finance after a payment: one receipt, issued automatically the moment a
// payment is confirmed and attached to the client's (or donor's) payment
// email, so receiving money takes no approval. Stan's QA reconciles it
// against the payment; a mismatch never holds the email back, it alerts
// Stanley instead.
import { CONTACT, emailOwner } from "./email.js";
import { markdownToPdf } from "./pdf.js";
import { getJSON, setJSON } from "./store.js";

const FINANCE = "finance@altradits.com";
const usd = (n) => `$${Number(n).toFixed(2)}`;
const sats = (n) => `${Number(n).toLocaleString("en-US")} sats`;
const when = (iso) => new Date(iso || Date.now()).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) + " EAT";

// Stan's QA reconciliation: every check must pass for a clean receipt.
export function reconcile(p) {
  const expected = p.payment?.method?.includes("on-chain") ? p.onchain?.sats : p.lightning?.sats;
  const paid = Number(p.payment?.sats) || 0;
  const full = (p.totals?.monthly || 0) + (p.totals?.oneOff || 0);
  const checks = [
    { check: "Amount is positive", pass: p.totals?.dueNow > 0 },
    { check: "Sats received cover the invoice", pass: !expected || paid >= Math.floor(expected * 0.98) },
    { check: "Payment reference recorded", pass: Boolean(p.payment?.reference) },
    { check: "Discount code applied correctly", pass: !p.coupon || Math.abs(p.totals.dueNow - Math.round(full * (100 - p.coupon.pct)) / 100) < 0.01 },
    { check: "Order and payment are both marked paid", pass: p.status === "paid" && Boolean(p.payment?.confirmedAt) },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

async function nextNumber() {
  const n = ((await getJSON("finance:seq")) || 0) + 1;
  await setJSON("finance:seq", n);
  return `R-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

const usdRate = (p) => Number(p.lightning?.rate) || (p.payment?.sats ? (p.totals.dueNow / p.payment.sats) * 1e8 : 0);

// Everything a receipt needs: who issued it, its number and date, who paid,
// what for (quantity, price, discount), the total in sats with the dollar
// equivalent, how it was paid and the transaction reference, and that it's paid.
export function receiptPdf(lead, p, no) {
  const pay = p.payment || {}, onchain = pay.method?.includes("on-chain"), rate = usdRate(p);
  const items = (p.items || []).map((i) => `- ${i.label}: ${i.quantity || 1} x ${usd(i.price)} = ${usd(i.price * (i.quantity || 1))}`);
  const full = (p.items || []).reduce((t, i) => t + i.price * (i.quantity || 1), 0);
  const md = [
    `# Receipt ${no}`,
    `**Status: PAID IN FULL**`,
    "",
    `Issued by Altradits, ${CONTACT.site}, ${CONTACT.place}. Contact: ${FINANCE}`,
    `Date issued: ${when(pay.confirmedAt)}`,
    `Order reference: ${p.id}`,
    "",
    `**Received from**`,
    [lead.name, lead.email].filter(Boolean).join(" · ") || "Client",
    "",
    p.donation ? "## Donation" : "## What you paid for",
    ...(p.donation ? [`- Donation to Bitcoin education in the community: ${usd(p.totals.dueNow)}`] : items),
    p.coupon ? `- Discount code ${p.coupon.code} (${p.coupon.pct}% off): -${usd(full - p.totals.dueNow)}` : "",
    "",
    `**Total paid: ${sats(pay.sats || 0)}${rate ? ` (${usd(p.totals.dueNow)} at $${Math.round(rate).toLocaleString("en-US")} per BTC)` : ` (${usd(p.totals.dueNow)})`}**`,
    "",
    "## Payment",
    `- Method: ${onchain ? "Bitcoin on-chain" : "Bitcoin Lightning Network"}`,
    `- Amount received: ${sats(pay.sats || 0)}`,
    `- Paid on: ${when(pay.confirmedAt)}`,
    onchain ? `- Paid to address: ${String(pay.reference || "").replace(/^onchain:/, "")}` : `- Lightning payment hash: ${pay.reference || "not recorded"}`,
    `- Status: ${onchain ? "Confirmed on the Bitcoin blockchain" : "Settled on the Lightning Network"}`,
    "",
    p.donation ? "No goods or services were provided in return for this donation." : "Delivery as described in your order. If what's delivered doesn't match, it's fixed free for 14 days.",
    `Questions about this receipt? Reply to the email or write to ${FINANCE}.`,
  ].join("\n");
  return markdownToPdf(md, `Receipt ${no}`, { letterhead: { lines: [FINANCE, CONTACT.site, CONTACT.place], footer: `Altradits · Receipt ${no} · Paid in full` } });
}

// Number the receipt (once per payment), reconcile it, and return the PDF to
// attach. Alerts Stanley, at most once, if QA finds a mismatch.
export async function issueReceipt(lead, p) {
  if (!p.receipt) {
    const qa = reconcile(p);
    p.receipt = { no: await nextNumber(), at: new Date().toISOString(), qa: qa.pass, checks: qa.checks };
    if (!qa.pass) await emailOwner(`Receipt ${p.receipt.no} needs a look`, `Stan's QA found a mismatch on ${lead.name || lead.email || "a payment"} for "${p.title}". The client already has their receipt.\n\n${qa.checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.check}`).join("\n")}`, null, lead.id).catch(() => {});
  }
  return { no: p.receipt.no, attachment: { filename: `altradits-receipt-${p.receipt.no}.pdf`, content: receiptPdf(lead, p, p.receipt.no).toString("base64"), contentType: "application/pdf" } };
}
