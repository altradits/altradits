// The Finance department's receipt. The client already has the instant
// payment confirmation (Stan's, automatic); later Finance prepares a proper
// receipt, Stan's QA reconciles it against the payment, and it joins
// Stanley's approval queue with the QA result attached.
import { sendEmail } from "./email.js";
import { getJSON, setJSON } from "./store.js";

const usd = (n) => `$${Number(n).toFixed(2)}`;
const day = (iso) => new Date(iso || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });

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

export async function prepareReceipt(lead, p) {
  if (!lead?.email || p.receipt) return null; // no address yet: Finance sends it once there is one
  const qa = reconcile(p);
  const no = await nextNumber();
  const what = p.donation ? "your donation to Bitcoin education" : `"${p.title}"`;
  const sats = p.payment?.sats ? ` (${Number(p.payment.sats).toLocaleString("en-US")} sats)` : "";
  const email = await sendEmail({
    to: lead.email, leadId: lead.id, dept: "finance", kind: "receipt",
    subject: `Receipt ${no}: ${p.donation ? "Donation" : p.title}`,
    text: `Hi ${lead.name || "there"}, here's your receipt for ${what}.\n\nAmount: ${usd(p.totals.dueNow)}${sats}, paid in ${p.payment?.method || "Bitcoin"} on ${day(p.payment?.confirmedAt)}.\nReceipt no. ${no} · Reference ${String(p.payment?.reference || "").slice(0, 16)}`,
    qa: { by: "Stan (QA)", ...qa },
  });
  p.receipt = { no, at: new Date().toISOString(), emailId: email.id, qa: qa.pass };
  return p.receipt;
}
