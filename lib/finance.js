// Finance after a payment. The client already has Stan's instant payment
// email. Seconds later Finance's detailed receipt goes out automatically: a
// PDF on the Altradits template with the Bitcoin settlement details, once
// Stan's QA has reconciled it against the payment (a receipt that fails QA
// waits for Stanley instead). Then Finance drafts a personal confirmation of
// the transaction and what it paid for, which waits for Stanley's approval.
import { sendEmail, CONTACT } from "./email.js";
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

// What was paid for, one line each.
const lines = (p) => (p.items || []).map((i) => `${i.label}${i.quantity > 1 ? ` x ${i.quantity}` : ""}: ${usd(i.price * i.quantity)}`);

// The settlement details a Bitcoin payment can be checked against.
function settlement(p) {
  const pay = p.payment || {}, onchain = pay.method?.includes("on-chain");
  const rate = p.lightning?.rate;
  return [
    `Network: ${onchain ? "Bitcoin on-chain" : "Bitcoin Lightning"}`,
    pay.sats ? `Amount received: ${sats(pay.sats)}` : null,
    rate ? `Exchange rate: $${Number(rate).toLocaleString("en-US")} per BTC` : null,
    `Settled: ${when(pay.confirmedAt)}`,
    onchain ? `Paid to address: ${String(pay.reference || "").replace(/^onchain:/, "")}` : `Payment hash: ${pay.reference || "not recorded"}`,
    `Status: ${onchain ? "Confirmed on the Bitcoin blockchain" : "Settled on the Lightning Network"}`,
  ].filter(Boolean);
}

export function receiptPdf(lead, p, no) {
  const md = [
    `# Receipt ${no}`,
    `Issued ${when(p.payment?.confirmedAt)}`,
    "",
    `**Received from**`,
    [lead.name, lead.email].filter(Boolean).join(" · ") || "Client",
    "",
    "## What you paid for",
    ...lines(p).map((l) => `- ${l}`),
    p.coupon ? `- Discount code ${p.coupon.code}: ${p.coupon.pct}% off` : "",
    "",
    `**Total paid: ${usd(p.totals.dueNow)} USD**`,
    "",
    "## Bitcoin payment",
    ...settlement(p).map((l) => `- ${l}`),
    "",
    `Questions about this receipt? Reply to the email or write to ${FINANCE}.`,
  ].filter((l) => l !== null).join("\n");
  return markdownToPdf(md, `Receipt ${no}`, { letterhead: { lines: [FINANCE, CONTACT.site, CONTACT.place], footer: `Altradits · Receipt ${no}` } });
}

export async function prepareReceipt(lead, p) {
  if (!lead?.email || p.receipt) return null; // no address yet: Finance sends it once there is one
  const qa = reconcile(p);
  const no = await nextNumber();
  const what = p.donation ? "Donation" : p.title;
  // 1. The detailed receipt, automatic when QA passes.
  const receipt = await sendEmail({
    to: lead.email, leadId: lead.id, dept: "finance", kind: qa.pass ? "receipt" : "receipt-check",
    subject: `Receipt ${no}: ${what}`,
    text: `Hi ${lead.name || "there"}, your receipt for ${usd(p.totals.dueNow)}${p.payment?.sats ? ` (${sats(p.payment.sats)})` : ""} is attached.`,
    attachments: [{ filename: `altradits-receipt-${no}.pdf`, content: receiptPdf(lead, p, no).toString("base64"), contentType: "application/pdf" }],
    qa: { by: "Stan (QA)", ...qa },
  });
  // 2. Finance's personal confirmation, waiting for Stanley.
  const confirmation = await sendEmail({
    to: lead.email, leadId: lead.id, dept: "finance", kind: "finance",
    subject: `Your payment is confirmed: ${what}`,
    text: `Hi ${lead.name || "there"},\n\nI've checked your payment and everything is in order. ${p.donation ? "Thank you for supporting Bitcoin education in our community." : "Here's what it covers:"}\n\n${lines(p).join("\n")}\nTotal: ${usd(p.totals.dueNow)}${p.payment?.sats ? `, received as ${sats(p.payment.sats)}` : ""} via ${p.payment?.method || "Bitcoin"} on ${when(p.payment?.confirmedAt)}.\n\nYour receipt is ${no}. Reply here if anything looks wrong.`,
    qa: { by: "Stan (QA)", ...qa },
  });
  p.receipt = { no, at: new Date().toISOString(), emailId: receipt.id, confirmationId: confirmation.id, qa: qa.pass };
  return p.receipt;
}
