// Collecting an order or donation with its order name (no email needed).
// POST /api/collect { name: "AMBER-FALCON-RIVER-7342" }        -> status, delivery, workspace link, receipt, balance
// POST /api/collect { name, receipt: true }                     -> the receipt PDF (only for payments recorded on the node)
// The name travels in the body, never the address (it unlocks the order).
// Only an exact name matches; lookups are rate-limited per connection.
import { json, clientIp, readBody } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { getLead, getProposal, saveProposal, saveLead } from "../lib/crm.js";
import { ensurePortal, getTask } from "../lib/ops.js";
import { leadIdForPickup, normalize } from "../lib/pickup.js";

const NOT_FOUND = json({ error: "No order has that name. Check the spelling: it looks like AMBER-FALCON-RIVER-7342." }, 404);

export async function POST(request) {
  const body = await readBody(request);
  const asked = String(body.name || "");
  if ((await hit(`rl:collect:${clientIp(request)}`, 600)) > 12) return json({ error: "Too many tries. Wait ten minutes and try again." }, 429);
  const id = await leadIdForPickup(asked);
  const lead = id && (await getLead(id));
  const p = lead?.proposalId && (await getProposal(lead.proposalId));
  if (!lead || !p || normalize(lead.pickup) !== normalize(asked)) return NOT_FOUND;
  const pay = p.payment || {};
  const paid = p.status === "paid";
  const onNode = paid && !pay.held; // receipts only for payments recorded on the node

  if (body.receipt) {
    if (!onNode) return json({ error: "Your receipt is issued once the payment is confirmed on the Altradits node." }, 409);
    const { issueReceipt } = await import("../lib/finance.js");
    const r = await issueReceipt(lead, p);
    if (pay.receiptOwed) pay.receiptOwed = false;
    await saveProposal(p);
    return new Response(Buffer.from(r.attachment.content, "base64"), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.attachment.filename}"`, "Cache-Control": "no-store" } });
  }

  const task = p.order?.taskId ? await getTask(p.order.taskId) : null;
  let balance = null;
  const bal = pay.balanceDue && (p.balances || []).at(-1);
  if (bal && Date.parse(bal.expiresAt) > Date.now()) {
    const { qrSvg } = await import("../lib/lightning.js");
    balance = { sats: pay.balanceDue, bolt11: bal.bolt11, qr: await qrSvg(`lightning:${bal.bolt11}`), expiresAt: bal.expiresAt };
  }
  const portal = paid && !p.donation ? ensurePortal(lead) : null;
  if (portal) await saveLead(lead);
  return json({
    name: lead.pickup, type: p.donation ? "donation" : "order", title: p.donation ? "Donation to Bitcoin education" : p.title,
    status: !paid ? (p.status === "paid_claimed" ? "being confirmed" : "not paid yet") : pay.held ? (pay.balanceDue ? "part paid" : "being confirmed") : "paid",
    delivery: p.donation ? null : p.timeline || null, due: task?.due || null,
    work: task ? { status: task.status, ready: Boolean(task.deliverable) && ["review", "done"].includes(task.status), question: task.status === "waiting_client" ? task.question : null } : null,
    portal, receipt: onNode, balance,
  });
}
