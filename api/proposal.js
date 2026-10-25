// GET  /api/proposal?id=&t=          -> proposal for the client page
// POST /api/proposal { id, t, action } -> accept | paid | decline
import { json, readBody, clean, clientIp, siteUrl, safeEqual } from "../lib/http.js";
import { getProposal, saveProposal, publicProposal, getLead, saveLead, logEvent, advanceStage, createApproval, proposalUrl } from "../lib/crm.js";
import { sendEmail } from "../lib/email.js";
import { hit } from "../lib/store.js";
import { BUSINESS } from "../data/catalog.js";
import { lightningMode } from "../lib/lightning.js";

async function load(id, t) {
  const p = await getProposal(clean(id, 40));
  return p && safeEqual(p.token, t) ? p : null;
}

export async function GET(request) {
  const ip = clientIp(request);
  if ((await hit(`rl:prop:miss:${ip}`, 900)) > 30) return json({ error: "Too many attempts. Try again later." }, 429);
  const u = new URL(request.url);
  const p = await load(u.searchParams.get("id"), u.searchParams.get("t"));
  if (!p) { await hit(`rl:prop:miss:${ip}`, 900); return json({ error: "Proposal not found. Check the link in your email." }, 404); }
  if (p.status === "pending_approval") return json({ pending: true });
  return json({ proposal: publicProposal(p), lightning: lightningMode() });
}

export async function POST(request) {
  const ip = clientIp(request);
  if ((await hit(`rl:prop:miss:${ip}`, 900)) > 30) return json({ error: "Too many attempts. Try again later." }, 429);
  const body = await readBody(request);
  const p = await load(body.id, body.t);
  if (!p) { await hit(`rl:prop:miss:${ip}`, 900); return json({ error: "Proposal not found." }, 404); }
  const lead = await getLead(p.leadId);
  const base = siteUrl(request);

  if (body.action === "accept") {
    if (!["sent", "accepted"].includes(p.status)) return json({ error: "This proposal can't be accepted right now." }, 409);
    const signer = clean(body.name, 120);
    if (!signer || body.agree !== true) return json({ error: "Type your name and tick the box to accept." }, 400);
    p.status = "accepted";
    p.acceptedBy = signer;
    p.acceptedAt = new Date().toISOString();
    await saveProposal(p);
    if (lead) {
      advanceStage(lead, "won");
      logEvent(lead, `Proposal accepted by ${signer}.`);
      await saveLead(lead);
      await sendEmail({
        to: lead.email, leadId: lead.id, dept: "orders",
        subject: "Proposal accepted: one step to kick-off",
        text: `Thanks ${signer}. Your proposal is accepted.\n\nTo start, pay $${p.totals.dueNow} using any method on the proposal page, then press "I've paid". Kick-off is within 48 hours of payment.`,
        cta: { label: "Pay and start", url: proposalUrl(base, p) },
      });
    }
    return json({ proposal: publicProposal(p), lightning: lightningMode() });
  }

  if (body.action === "paid") {
    if (!["accepted", "paid_claimed"].includes(p.status)) return json({ error: "Accept the proposal first." }, 409);
    const method = clean(body.method, 40);
    const reference = clean(body.reference, 200);
    if (!method) return json({ error: "Choose how you paid." }, 400);
    const firstClaim = p.status !== "paid_claimed";
    p.status = "paid_claimed";
    p.payment = { method, reference, claimedAt: new Date().toISOString() };
    await saveProposal(p);
    if (lead && firstClaim) {
      logEvent(lead, `Client reports payment via ${method} (${reference || "no reference"}).`);
      await saveLead(lead);
      // Critical: money to verify and work to start.
      const backup = p.lightning?.provider === "address";
      await createApproval({
        type: "payment_check", lead, siteUrl: base, payload: { proposalId: p.id },
        summary: `${lead.name || lead.email || "A client"} says they paid $${p.totals.dueNow}${p.lightning?.sats ? ` (${p.lightning.sats.toLocaleString("en-US")} sats)` : ""} via ${method}. Reference: ${reference || "none"}.\nProposal: ${p.title}.\n${backup ? `The node was down, so this went to the backup Lightning address. In that wallet's history, look for the note "Altradits: ${p.title} (proposal ${p.id})". Approve to start the work; the official receipt goes out once you've moved the sats to the node (Finance tab).` : "Approve once you've seen the money, to start the work. The receipt goes out only when the node itself records the payment."}`,
      });
      // The client hears at once; urgent orders also reach Stanley on WhatsApp.
      const { acknowledgeClaim } = await import("../lib/crm.js");
      await acknowledgeClaim(lead, p);
      await saveProposal(p);
      if (backup && p.order?.urgentOk && ["hours", "minutes"].includes(p.order.urgency)) {
        const { whatsappOwner } = await import("../lib/notify.js");
        await whatsappOwner(`Altradits URGENT: a paid order (${p.order.name}, ${p.lightning.sats} sats) is waiting. The node is down, so the payment went to the backup wallet. Check the Mac and the admin Approvals.`);
      }
    }
    return json({ proposal: publicProposal(p), lightning: lightningMode() });
  }

  if (body.action === "decline") {
    if (!["sent", "accepted"].includes(p.status)) return json({ error: "This proposal is already closed." }, 409);
    p.status = "declined";
    p.declineReason = clean(body.reason, 500);
    await saveProposal(p);
    if (lead) {
      advanceStage(lead, "lost");
      logEvent(lead, `Declined proposal: ${p.declineReason || "no reason given"}`);
      await saveLead(lead);
    }
    return json({ proposal: publicProposal(p), message: `Thanks for letting us know. If anything changes, ${BUSINESS.owner} is one email away.` });
  }

  return json({ error: "Unknown action" }, 400);
}
