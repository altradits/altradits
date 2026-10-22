// GET  /api/proposal?id=&t=          -> proposal for the client page
// POST /api/proposal { id, t, action } -> accept | paid | decline
import { json, readBody, clean, siteUrl, safeEqual } from "../lib/http.js";
import { getProposal, saveProposal, publicProposal, getLead, saveLead, logEvent, advanceStage, createApproval, proposalUrl } from "../lib/crm.js";
import { sendEmail } from "../lib/email.js";
import { BUSINESS } from "../data/catalog.js";

async function load(id, t) {
  const p = await getProposal(clean(id, 40));
  return p && safeEqual(p.token, t) ? p : null;
}

export async function GET(request) {
  const u = new URL(request.url);
  const p = await load(u.searchParams.get("id"), u.searchParams.get("t"));
  if (!p) return json({ error: "Proposal not found. Check the link in your email." }, 404);
  if (p.status === "pending_approval") return json({ pending: true });
  return json({ proposal: publicProposal(p) });
}

export async function POST(request) {
  const body = await readBody(request);
  const p = await load(body.id, body.t);
  if (!p) return json({ error: "Proposal not found." }, 404);
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
        to: lead.email, leadId: lead.id,
        subject: "Proposal accepted: one step to kick-off",
        text: `Thanks ${signer}. Your proposal is accepted.\n\nTo start, pay $${p.totals.dueNow} using any method on the proposal page, then press "I've paid". Kick-off is within 48 hours of payment.`,
        cta: { label: "Pay and start", url: proposalUrl(base, p) },
      });
    }
    return json({ proposal: publicProposal(p) });
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
      await createApproval({
        type: "payment_check", lead, siteUrl: base, payload: { proposalId: p.id },
        summary: `${lead.name || lead.email} says they paid $${p.totals.dueNow} via ${method}. Reference: ${reference || "none"}.\nProposal: ${p.title}.\nConfirm the money arrived, then approve to send the kick-off email.`,
      });
    }
    return json({ proposal: publicProposal(p) });
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
