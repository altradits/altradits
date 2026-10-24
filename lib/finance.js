// Finance after a payment: one receipt, issued automatically the moment a
// payment is confirmed and attached to the client's (or donor's) payment
// email, so receiving money takes no approval. Stan's QA reconciles it
// against the payment; a mismatch never holds the email back, it alerts
// Stanley instead.
//
// A receipt is only ever issued for money on the Altradits node. A payment
// taken by the backup Lightning address while the node was down is "held":
// the Finance tab makes a node invoice for its exact sats, Stanley pays it
// from that wallet, and when the node shows it settled the official receipt
// goes out (moveToNode, checkHeld).
import { CONTACT, emailOwner } from "./email.js";
import { markdownToPdf } from "./pdf.js";
import { createInvoice, nodeSettlement } from "./lightning.js";
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
    pay.sweptFrom ? `- Received through our backup Lightning address while our node was offline; confirmed on the Altradits node on ${when(pay.nodeConfirmedAt)}` : "",
    pay.sweepHash ? `- Altradits node payment hash: ${pay.sweepHash}` : "",
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

// ---- payments held in the backup wallet, on their way to the node
export async function heldPayments() {
  const { listIds, getMany } = await import("./store.js");
  return (await getMany("proposal", await listIds("proposals", 100000))).filter((p) => p.status === "paid" && p.payment?.held);
}

// A node invoice for the payment's exact sats, for Stanley to pay from the backup wallet.
export async function moveToNode(p) {
  if (!p.payment?.held) throw new Error("This payment is already on the node.");
  if (!(p.sweep && Date.parse(p.sweep.expiresAt) > Date.now() + 10 * 60e3)) {
    const inv = await createInvoice({ sats: p.payment.sats, memo: `Altradits: move ${p.payment.wallet || "backup"} payment ${p.id} to the node`, expiry: 86400, nodeOnly: true });
    p.sweep = { bolt11: inv.bolt11, paymentHash: inv.paymentHash, provider: inv.provider, sats: inv.sats, expiresAt: inv.expiresAt };
    const { saveProposal } = await import("./crm.js");
    await saveProposal(p);
  }
  return p.sweep;
}

// The node has recorded the money (settlement, from nodeSettlement): issue the
// official receipt for exactly what the node received, and send it.
export async function confirmOnNode(lead, p, settlement) {
  if (!settlement?.sats) throw new Error("A receipt needs the node's record of the payment.");
  const { sendEmail } = await import("./email.js");
  const { saveProposal } = await import("./crm.js");
  const moved = settlement.reference === p.sweep?.paymentHash;
  Object.assign(p.payment, { held: false, nodeConfirmedAt: settlement.at, sats: settlement.sats, wallet: null,
    ...(moved ? { sweptFrom: p.payment.wallet, sweepHash: settlement.reference } : { reference: settlement.reference }) });
  const r = lead?.email ? await issueReceipt(lead, p) : null;
  await saveProposal(p);
  if (r) await sendEmail({ to: lead.email, leadId: lead.id, kind: "payment", subject: `Your official receipt ${r.no}: ${p.donation ? "Donation" : p.title}`, attachments: [r.attachment],
    text: `Hi ${lead.name || "there"}, your payment of ${sats(p.payment.sats)} is now confirmed on the Altradits node. Your official receipt ${r.no} is attached, with every detail of the payment.` });
  return r;
}

// Hourly, and whenever the Finance tab opens: has the node recorded any held
// payment yet (the move from the backup wallet, the client's own node invoice,
// or an on-chain payment to the node's address)? Only then is a receipt issued.
export async function checkHeld() {
  const { getLead } = await import("./crm.js");
  let done = 0;
  for (const p of await heldPayments()) {
    const onchain = /on-chain/i.test(p.payment.method || "");
    try {
      const s = await nodeSettlement({ invoices: [p.sweep, p.lightning, ...(p.lnurlInvoices || [])], address: onchain ? p.onchain?.address : null, need: Math.floor((p.onchain?.sats || 0) * 0.99) });
      if (s) { await confirmOnNode(await getLead(p.leadId), p, s); done++; }
    } catch { /* node still down: next time */ }
  }
  return { confirmed: done };
}
