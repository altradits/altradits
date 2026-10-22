// Admin API for Stanley's dashboard. Every request needs
// Authorization: Bearer <ADMIN_TOKEN>.
import { json, readBody, clean, siteUrl, safeEqual } from "../lib/http.js";
import { listIds, getMany, getJSON, setJSON, usingRedis } from "../lib/store.js";
import {
  STAGES, getLead, saveLead, logEvent, getProposal, saveProposal, publishProposal,
  recomputeTotals, proposalUrl, publicLead, confirmPayment,
} from "../lib/crm.js";
import { lightningMode } from "../lib/lightning.js";
import { sendEmail } from "../lib/email.js";
import { agentLive } from "../lib/agent.js";
import { BUSINESS } from "../data/catalog.js";

function authorized(request) {
  const token = process.env.ADMIN_TOKEN;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(token) && safeEqual(token, given);
}

const deny = () => json({ error: process.env.ADMIN_TOKEN ? "Wrong admin token." : "Set ADMIN_TOKEN in your environment first." }, 401);

export async function GET(request) {
  if (!authorized(request)) return deny();
  const u = new URL(request.url);

  if (u.searchParams.get("view") === "lead") {
    const lead = await getLead(clean(u.searchParams.get("id"), 40));
    if (!lead) return json({ error: "Not found" }, 404);
    const proposal = lead.proposalId ? await getProposal(lead.proposalId) : null;
    return json({
      lead: { ...publicLead(lead), notes: lead.notes, events: lead.events, context: lead.context },
      proposal: proposal && { ...proposal, url: proposalUrl(siteUrl(request), proposal) },
    });
  }

  const [leads, approvals, proposals, emails] = await Promise.all([
    listIds("leads", 300).then((ids) => getMany("lead", ids)),
    listIds("approvals", 200).then((ids) => getMany("approval", ids)),
    listIds("proposals", 300).then((ids) => getMany("proposal", ids)),
    listIds("emails", 60).then((ids) => getMany("email", ids)),
  ]);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const paid = proposals.filter((p) => p.status === "paid");
  const open = proposals.filter((p) => ["sent", "accepted", "paid_claimed"].includes(p.status));
  const stats = {
    leads: leads.length,
    leads7d: leads.filter((l) => Date.now() - Date.parse(l.createdAt) < 7 * 864e5).length,
    qualified: leads.filter((l) => STAGES.indexOf(l.stage) >= STAGES.indexOf("qualified") && l.stage !== "lost").length,
    proposalsOpen: open.length,
    pipelineUsd: open.reduce((t, p) => t + p.totals.monthly + p.totals.oneOff, 0),
    wonMonthUsd: paid.filter((p) => Date.parse(p.payment?.confirmedAt || p.updatedAt) >= monthStart).reduce((t, p) => t + p.totals.dueNow, 0),
    mrrUsd: paid.reduce((t, p) => t + p.totals.monthly, 0),
    activeClients: leads.filter((l) => l.stage === "active").length,
    pendingApprovals: approvals.filter((a) => a.status === "pending").length,
    byStage: Object.fromEntries(STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length])),
  };

  return json({
    stats,
    approvals: approvals.filter((a) => a.status === "pending").concat(approvals.filter((a) => a.status !== "pending").slice(0, 20)),
    leads: leads.map((l) => ({
      id: l.id, name: l.name, email: l.email, company: l.company, stage: l.stage, score: l.score,
      needs: l.needs, source: l.source, createdAt: l.createdAt, updatedAt: l.updatedAt,
      lastMessage: l.transcript.at(-1)?.text?.slice(0, 140) || "",
    })),
    emails,
    system: {
      agents: agentLive ? "live (Claude)" : "scripted fallback: set ANTHROPIC_API_KEY",
      email: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : process.env.EMAIL_TRANSPORT === "sendmail" ? "server mail (sendmail)" : process.env.RESEND_API_KEY ? "Resend" : "log only: set EMAIL_TRANSPORT=sendmail",
      storage: usingRedis ? "Redis" : `file store (${process.env.DATA_DIR || ".data"})`,
      ownerEmail: process.env.OWNER_EMAIL || BUSINESS.email,
      lightning: lightningMode() === "lnd" ? "LND node (QR invoices, auto-confirmed)" : "Lightning address (QR invoices, you confirm payment)",
    },
  });
}

async function resolveApproval(request, body) {
  const a = await getJSON(`approval:${clean(body.id, 40)}`);
  if (!a) return json({ error: "Approval not found" }, 404);
  if (a.status !== "pending") return json({ error: "Already resolved" }, 409);
  const approve = body.decision === "approve";
  const note = clean(body.note, 3000);
  const lead = a.leadId ? await getLead(a.leadId) : null;
  const base = siteUrl(request);

  if (a.type === "proposal_review") {
    const p = await getProposal(a.payload.proposalId);
    if (approve && p && lead) {
      if (body.edits?.summary) p.summary = clean(body.edits.summary, 3000);
      if (Array.isArray(body.edits?.prices)) {
        body.edits.prices.forEach((price, i) => { if (p.items[i] && Number(price) > 0) p.items[i].price = Math.round(Number(price)); });
      }
      recomputeTotals(p);
      await publishProposal(base, lead, p);
    } else if (p && lead) {
      p.status = "declined";
      await saveProposal(p);
      await sendEmail({ to: lead.email, leadId: lead.id, subject: "About your proposal",
        text: note || `Hi ${lead.name || "there"}, thanks for your patience. ${BUSINESS.owner} would like to talk this through before sending a proposal. Just reply with a good time.` });
    }
  } else if (a.type === "payment_check") {
    const p = await getProposal(a.payload.proposalId);
    if (p && lead) {
      if (approve) {
        await confirmPayment(lead, p, note);
      } else {
        p.status = "accepted";
        logEvent(lead, "Payment not found yet.");
        await sendEmail({ to: lead.email, leadId: lead.id, subject: "We couldn't find your payment yet",
          text: note || `Hi ${lead.name || "there"}, we haven't received the payment yet. Could you reply with the transaction reference or a screenshot? Sometimes it just takes a little longer.` });
      }
      await saveProposal(p);
      await saveLead(lead);
    }
  } else if (lead && note) {
    // trial_task, call_request, escalation: the note goes to the client.
    await sendEmail({ to: lead.email, leadId: lead.id, subject: a.type === "trial_task" ? "Your free task is done" : "A note from Stanley", text: note });
  }

  if (lead) { logEvent(lead, `${a.type} ${approve ? "approved" : "declined"} by Stanley.`); await saveLead(lead); }
  a.status = approve ? "approved" : "declined";
  a.resolvedAt = new Date().toISOString();
  a.note = note;
  await setJSON(`approval:${a.id}`, a);
  return json({ ok: true, approval: a });
}

export async function POST(request) {
  if (!authorized(request)) return deny();
  const body = await readBody(request);

  if (body.action === "approval") return resolveApproval(request, body);

  const lead = await getLead(clean(body.id, 40));
  if (!lead) return json({ error: "Lead not found" }, 404);

  if (body.action === "lead_update") {
    if (STAGES.includes(body.stage)) lead.stage = body.stage;
    if (typeof body.notes === "string") lead.notes = clean(body.notes, 5000);
    await saveLead(lead);
    return json({ ok: true });
  }
  if (body.action === "email_client") {
    if (!lead.email) return json({ error: "This lead has no email." }, 400);
    const sent = await sendEmail({ to: lead.email, leadId: lead.id, subject: clean(body.subject, 200) || "A note from Altradits", text: clean(body.text, 8000) });
    logEvent(lead, `Stanley emailed: ${sent.subject}`);
    await saveLead(lead);
    return json({ ok: true, status: sent.status });
  }
  return json({ error: "Unknown action" }, 400);
}
