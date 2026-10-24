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
    { check: "Discount code applied correctly", pass: !p.coupon || Math.abs(p.totals.dueNow - (p.coupon.credit ? full - p.coupon.credit : Math.round(full * (100 - p.coupon.pct)) / 100)) < 0.01 },
    { check: "Order and payment are both marked paid", pass: p.status === "paid" && Boolean(p.payment?.confirmedAt) },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

async function nextNumber() {
  const n = ((await getJSON("finance:seq")) || 0) + 1;
  await setJSON("finance:seq", n);
  return `R-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

// What the client was asked to pay, in sats, and what the node has received for it.
export const expectedSats = (p) => Number(p.payment?.expectedSats || p.lightning?.sats || p.onchain?.sats || p.payment?.sats || 0);
const partsLine = (x, i) => `- Payment ${i + 1}: ${sats(x.sats)} on ${when(x.at)} (node payment hash ${x.reference})`;

const usdRate = (p) => Number(p.lightning?.rate) || (p.payment?.sats ? (p.totals.dueNow / p.payment.sats) * 1e8 : 0);

// Everything a receipt needs: who issued it, its number and date, who paid,
// what for (quantity, price, discount), the total in sats with the dollar
// equivalent, how it was paid and the transaction reference, and that it's paid.
// part: a part-payment receipt for what has arrived so far, with the balance due.
export function receiptPdf(lead, p, no, { part = false } = {}) {
  const pay = p.payment || {}, onchain = pay.method?.includes("on-chain"), rate = usdRate(p), parts = pay.parts || [];
  const items = (p.items || []).map((i) => `- ${i.label}: ${i.quantity || 1} x ${usd(i.price)} = ${usd(i.price * (i.quantity || 1))}`);
  const full = (p.items || []).reduce((t, i) => t + i.price * (i.quantity || 1), 0);
  const md = [
    `# Receipt ${no}`,
    part ? `**Status: PART PAYMENT. Balance due: ${sats(pay.balanceDue || 0)}**` : `**Status: PAID IN FULL**`,
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
    p.coupon ? (p.coupon.credit ? `- Credit code ${p.coupon.code}: -${usd(p.coupon.credit)}` : `- Discount code ${p.coupon.code} (${p.coupon.pct}% off): -${usd(full - p.totals.dueNow)}`) : "",
    "",
    part ? `**Order total: ${sats(expectedSats(p))} (${usd(p.totals.dueNow)}). Received so far: ${sats(pay.sats || 0)}. Balance due: ${sats(pay.balanceDue || 0)}**`
      : `**Total paid: ${sats(pay.sats || 0)}${rate ? ` (${usd(p.totals.dueNow)} at $${Math.round(rate).toLocaleString("en-US")} per BTC)` : ` (${usd(p.totals.dueNow)})`}**`,
    pay.credit ? `Overpaid by ${sats(pay.credit.sats)}: credit code ${pay.credit.code} (${usd(pay.credit.usd)}) for your next purchase.` : "",
    "",
    "## Payment",
    `- Method: ${onchain ? "Bitcoin on-chain" : "Bitcoin Lightning Network"}`,
    `- Amount received: ${sats(pay.sats || 0)}${parts.length > 1 ? ` in ${parts.length} payments` : ""}`,
    ...(parts.length > 1 ? parts.map(partsLine) : []),
    `- Paid on: ${when(pay.confirmedAt)}`,
    onchain ? `- Paid to address: ${String(pay.reference || "").replace(/^onchain:/, "")}` : `- Lightning payment hash: ${pay.reference || "not recorded"}`,
    `- Status: ${onchain ? "Confirmed on the Bitcoin blockchain" : "Settled on the Lightning Network"}`,
    pay.sweptFrom ? `- Received through our backup Lightning address while our node was offline; confirmed on the Altradits node on ${when(pay.nodeConfirmedAt)}` : "",
    pay.sweepHash ? `- Altradits node payment hash: ${pay.sweepHash}` : "",
    "",
    p.donation ? "No goods or services were provided in return for this donation." : "Delivery as described in your order. If what's delivered doesn't match, it's fixed free for 14 days.",
    `Questions about this receipt? Reply to the email or write to ${FINANCE}.`,
  ].join("\n");
  return markdownToPdf(md, `Receipt ${no}`, { letterhead: { lines: [FINANCE, CONTACT.site, CONTACT.place], footer: `Altradits · Receipt ${no} · ${part ? "Part payment" : "Paid in full"}` } });
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

let makeInvoice = createInvoice;
export function setInvoiceMaker(f) { makeInvoice = f || createInvoice; } // tests

// The short code that ties a waiting payment, its node invoice and its receipt together.
export const orderCode = (p) => p.id.slice(0, 6).toUpperCase();
const sweepsOf = (p) => [...(p.sweeps || []), ...(p.sweep && !(p.sweeps || []).some((s) => s.paymentHash === p.sweep.paymentHash) ? [p.sweep] : [])];

// A node invoice for one order's exact sats, for whichever admin pays it from
// the backup wallet. Every invoice made for the order is kept (sweeps), so if
// two admins make one at the same moment, paying either still counts. The
// invoice note names the order code, client and amount for the wallet app.
// sats: what the client actually sent (as the backup wallet shows it); by
// default the order amount. Pay exactly that: a short or extra payment is
// handled when the node records it (confirmOnNode).
export async function moveToNode(p, amount) {
  const { getProposal, saveProposal } = await import("./crm.js");
  p = (await getProposal(p.id)) || p; // the latest record, never a stale copy
  if (!p.payment?.held || !p.payment.wallet) throw new Error("Nothing of this payment is waiting in the backup wallet.");
  const need = expectedSats(p), want = Math.round(Number(amount) || need);
  if (!(want > 0 && want <= need * 3)) throw new Error(`Enter what the client sent, in sats (the order is ${need.toLocaleString("en-US")} sats).`);
  const live = sweepsOf(p).find((s) => s.sats === want && Date.parse(s.expiresAt) > Date.now() + 10 * 60e3);
  if (live) return live;
  const who = String(p.client?.name || "client").split(" ")[0];
  const inv = await makeInvoice({ sats: want, memo: `Altradits ${orderCode(p)}: ${p.donation ? "donation" : p.title} for ${who}, ${want} sats (move from ${p.payment.wallet || "backup wallet"})`, expiry: 86400, nodeOnly: true });
  const sweep = { bolt11: inv.bolt11, paymentHash: inv.paymentHash, provider: inv.provider, sats: inv.sats, expiresAt: inv.expiresAt, createdAt: new Date().toISOString() };
  p.sweeps = [...sweepsOf(p), sweep];
  p.sweep = sweep;
  await saveProposal(p);
  return sweep;
}

// The node has recorded money for this order (settlement, from nodeSettlement).
// Each node payment is counted once (parts). Short of the order: the client
// gets a part-payment receipt for what arrived and a node QR for the balance.
// Paid in full: the official receipt, and for anything extra, a credit code
// worth the difference for their next purchase.
export async function confirmOnNode(lead, p, settlement) {
  if (!settlement?.sats) throw new Error("A receipt needs the node's record of the payment.");
  const { saveProposal } = await import("./crm.js");
  if ((p.payment.parts || []).some((x) => x.reference === settlement.reference)) return null; // already counted
  const moved = sweepsOf(p).some((s) => s.paymentHash === settlement.reference);
  const parts = [...(p.payment.parts || []), { sats: settlement.sats, reference: settlement.reference, at: settlement.at }];
  const received = parts.reduce((t, x) => t + x.sats, 0), need = expectedSats(p);
  Object.assign(p.payment, { expectedSats: need, parts, sats: received, nodeConfirmedAt: settlement.at,
    ...(moved ? { sweptFrom: p.payment.wallet || p.payment.sweptFrom, sweepHash: settlement.reference } : { reference: settlement.reference }), wallet: null,
    otherSweeps: sweepsOf(p).map((s) => s.paymentHash).filter((h) => !parts.some((x) => x.reference === h)) });
  if (received < need) return requestBalance(lead, p);
  Object.assign(p.payment, { held: false, balanceDue: 0 });
  if (received > need && !p.payment.credit) p.payment.credit = await creditFor(lead, p, received - need);
  p.payment.receiptOwed = true;
  await saveProposal(p);
  return sendOfficialReceipt(lead, p);
}

// Extra sats become a credit code for the client's next purchase, at the rate they paid.
async function creditFor(lead, p, extra) {
  const { createCredit } = await import("./hunt.js");
  const c = await createCredit({ sats: extra, usd: (extra * usdRate(p)) / 1e8, leadId: lead?.id || p.leadId, proposalId: p.id });
  return { code: c.code, sats: extra, usd: c.usd };
}

// Short: confirm what arrived (a part-payment receipt) and ask for the balance
// with a node invoice: its QR attached and a link that opens their wallet.
async function requestBalance(lead, p) {
  const { sendEmail } = await import("./email.js");
  const { saveProposal } = await import("./crm.js");
  const { qrPng } = await import("./lightning.js");
  const due = expectedSats(p) - p.payment.sats;
  Object.assign(p.payment, { held: true, balanceDue: due });
  const inv = await makeInvoice({ sats: due, memo: `Altradits ${orderCode(p)}: balance for ${p.donation ? "your donation" : p.title}, ${due} sats`, expiry: 7 * 86400, nodeOnly: true });
  const bal = { bolt11: inv.bolt11, paymentHash: inv.paymentHash, provider: inv.provider, sats: due, expiresAt: inv.expiresAt, createdAt: new Date().toISOString() };
  p.balances = [...(p.balances || []), bal];
  const no = await nextNumber();
  p.partReceipts = [...(p.partReceipts || []), { no, sats: p.payment.sats, due, at: new Date().toISOString() }];
  await saveProposal(p);
  const to = String(lead?.email || "").toLowerCase();
  if (!to || lead.id !== p.leadId || to.endsWith("@altradits.com")) return { part: no, balance: due };
  await sendEmail({ to, leadId: lead.id, kind: "payment", subject: `Part payment received: ${sats(due)} to complete ${p.donation ? "your donation" : `"${p.title}"`}`,
    attachments: [
      { filename: `altradits-receipt-${no}-part-payment.pdf`, content: receiptPdf(lead, p, no, { part: true }).toString("base64"), contentType: "application/pdf" },
      { filename: `altradits-balance-${orderCode(p)}.png`, content: (await qrPng(`lightning:${bal.bolt11}`)).toString("base64"), contentType: "image/png" },
    ],
    text: `Hi ${lead.name || "there"}, thank you. We've received ${sats(p.payment.sats)} for ${p.donation ? "your donation" : `"${p.title}"`}, now confirmed on the Altradits node; the part-payment receipt ${no} is attached.\n\nThe order comes to ${sats(expectedSats(p))}, so ${sats(due)} remain. Scan the attached QR code with any Lightning wallet, or use the button, to pay the balance. As soon as it arrives, your official receipt for the full amount follows automatically.\n\nThank you for your patience, and we're sorry for the short delay: our payment system was briefly offline when you paid.`,
    cta: { label: `Pay the balance: ${sats(due)}`, url: `lightning:${bal.bolt11}` } });
  return { part: no, balance: due };
}

// The official receipt goes to the client who paid for this order (the lead on
// the order), never to Stanley or an Altradits address, even though Stanley is
// the one who moved the sats; he only gets his usual blind copy. If the client
// hasn't given an email yet, it's sent the moment they do (api/order.js).
export async function sendOfficialReceipt(lead, p) {
  if (!p.payment?.receiptOwed) return null;
  const { sendEmail, OWNER_EMAIL } = await import("./email.js");
  const { saveProposal } = await import("./crm.js");
  const to = String(lead?.email || "").toLowerCase();
  const ours = !to || lead.id !== p.leadId || to === String(OWNER_EMAIL).toLowerCase() || to.endsWith("@altradits.com");
  if (ours) return null; // waits for the client's own address
  const r = await issueReceipt(lead, p);
  await sendEmail({ to, leadId: lead.id, kind: "payment", subject: `Your official receipt ${r.no}: ${p.donation ? "Donation" : p.title}`, attachments: [r.attachment],
    text: `Hi ${lead.name || "there"}, your payment of ${sats(p.payment.sats)}${(p.payment.parts || []).length > 1 ? ` (in ${p.payment.parts.length} payments)` : ""} for ${p.donation ? "your donation" : `"${p.title}"`} is now confirmed on the Altradits node. Your official receipt ${r.no} is attached, with every detail of the payment.${p.payment.credit ? `\n\nYou sent ${sats(p.payment.credit.sats)} more than the order needed. That's kept for you as credit: use the code ${p.payment.credit.code} at checkout to take ${usd(p.payment.credit.usd)} off your next purchase.` : ""}\n\nThank you for your patience, and we're sorry for the short delay: our payment system was briefly offline when you paid.` });
  p.payment.receiptOwed = false;
  await saveProposal(p);
  return r;
}

// Hourly, and whenever the Finance tab opens: has the node recorded any held
// payment yet (one of the order's own node invoices, the client's original
// node invoice, or an on-chain payment to the node's address)? Only then is a
// receipt issued, to that order's client. Also watches for an order whose
// money was moved twice (two admins paying two of its invoices).
export async function checkHeld() {
  const { getLead, saveProposal } = await import("./crm.js");
  const { listIds, getMany } = await import("./store.js");
  let done = 0;
  for (const p of await heldPayments()) {
    const onchain = /on-chain/i.test(p.payment.method || "");
    try {
      // Each node payment counts once: look only at invoices not yet counted, one at a time.
      const counted = new Set((p.payment.parts || []).map((x) => x.reference));
      for (;;) {
        const s = await nodeSettlement({ invoices: [...sweepsOf(p), ...(p.balances || []), p.lightning, ...(p.lnurlInvoices || [])].filter((i) => i && !counted.has(i.paymentHash)), address: onchain && !counted.size ? p.onchain?.address : null, need: Math.floor((p.onchain?.sats || 0) * 0.99) });
        if (!s) break;
        counted.add(s.reference);
        await confirmOnNode(await getLead(p.leadId), p, s); done++;
        if (!p.payment.held) break;
      }
    } catch { /* node still down: next time */ }
  }
  const week = Date.now() - 7 * 864e5;
  for (const p of (await getMany("proposal", await listIds("proposals", 2000))).filter((x) => x.payment?.otherSweeps?.length && !x.payment.doubleAlerted && Date.parse(x.payment.nodeConfirmedAt) > week)) {
    try {
      const extra = await nodeSettlement({ invoices: sweepsOf(p).filter((s) => p.payment.otherSweeps.includes(s.paymentHash)) });
      if (extra) {
        p.payment.doubleAlerted = true;
        await saveProposal(p);
        await emailOwner(`Order ${orderCode(p)} was moved to the node twice`, `A second node invoice for order ${orderCode(p)} ("${p.title}") was paid: ${sats(extra.sats)} more than the client paid. The client's receipt is correct (${p.receipt?.no}). Move the extra back to the backup wallet or keep it as a correction.`, null, p.leadId).catch(() => {});
      }
    } catch { /* next time */ }
  }
  return { confirmed: done };
}

// What the Finance tab shows: each waiting payment with its order code, and
// the recent moves with the receipt each client was sent.
export async function heldView() {
  const { listIds, getMany } = await import("./store.js");
  const { getLead } = await import("./crm.js");
  const all = await getMany("proposal", await listIds("proposals", 2000));
  const held = all.filter((p) => p.status === "paid" && p.payment?.held);
  const moved = all.filter((p) => p.payment?.sweptFrom).sort((a, b) => String(b.payment.nodeConfirmedAt).localeCompare(String(a.payment.nodeConfirmedAt))).slice(0, 10);
  return {
    held: held.map((p) => ({ id: p.id, code: orderCode(p), title: p.title, client: p.client?.name || p.client?.email || "", sats: p.payment.sats, expected: expectedSats(p), wallet: p.payment.wallet, balanceDue: p.payment.wallet ? 0 : p.payment.balanceDue || 0,
      balanceAt: (p.balances || []).at(-1)?.createdAt || null, at: p.payment.confirmedAt, sweep: p.payment.wallet ? sweepsOf(p).filter((s) => Date.parse(s.expiresAt) > Date.now()).at(-1) || null : null })),
    moved: await Promise.all(moved.map(async (p) => { const l = await getLead(p.leadId); return { code: orderCode(p), title: p.title, sats: p.payment.sats, at: p.payment.nodeConfirmedAt, receipt: p.receipt?.no || null, to: p.payment.receiptOwed ? null : l?.email || null }; })),
  };
}
