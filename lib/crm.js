// Leads, proposals and approvals. The agents call into this module; it owns the
// business rules (price floors, discount caps, approval thresholds) so a model
// can never quote below what Stanley has agreed to.
import { RULES, PAYG, findService, findPackage, BUSINESS } from "../data/catalog.js";
import { getJSON, setJSON, pushId } from "./store.js";
import { emailOwner, sendEmail } from "./email.js";
import { newId, clean, EMAIL_RE } from "./http.js";

export const STAGES = ["new", "engaged", "qualified", "pending_approval", "proposal_sent", "won", "paid", "active", "lost"];

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- leads
export async function createLead({ name = "", email = "", source = "chat", needs = [], context = {} } = {}) {
  const lead = {
    id: newId(), token: newId(18), createdAt: now(), updatedAt: now(),
    name: clean(name, 120), email: EMAIL_RE.test(email) ? clean(email, 200).toLowerCase() : "",
    company: "", country: "", role: "", source: clean(source, 40),
    needs: needs.map((n) => clean(n, 80)).slice(0, 20),
    hoursPerWeek: null, budgetMonthly: null, timeline: "", pain: "",
    score: 0, stage: "new", notes: "", proposalId: null,
    context, transcript: [], events: [],
  };
  await setJSON(`lead:${lead.id}`, lead);
  await pushId("leads", lead.id);
  return lead;
}

export const getLead = (id) => getJSON(`lead:${id}`);

export async function saveLead(lead) {
  lead.updatedAt = now();
  if (lead.transcript.length > 80) lead.transcript = lead.transcript.slice(-80);
  if (lead.events.length > 100) lead.events = lead.events.slice(-100);
  await setJSON(`lead:${lead.id}`, lead);
  return lead;
}

export function logEvent(lead, text) {
  lead.events.push({ at: now(), text });
}

export function advanceStage(lead, stage) {
  // Never move a lead backwards automatically (admin can, via setStage).
  if (STAGES.indexOf(stage) > STAGES.indexOf(lead.stage) || stage === "lost") lead.stage = stage;
}

// Delegation quiz answers from the website.
export function cleanQuiz(q) {
  if (!q || typeof q !== "object") return undefined;
  return {
    tasks: (Array.isArray(q.tasks) ? q.tasks : []).map((t) => clean(t, 80)).slice(0, 25),
    hours: Math.max(0, Math.min(80, Number(q.hours) || 0)),
    role: clean(q.role, 60),
    hourValue: Math.max(0, Math.min(5000, Number(q.hourValue) || 0)),
  };
}

// Public view sent back to the browser: no token, no internal notes.
export function publicLead(lead) {
  const { token, notes, events, context, ...rest } = lead;
  return rest;
}

// ---------------------------------------------------------- approvals
// Critical items: the only things that reach Stanley's inbox.
export async function createApproval({ type, lead, summary, payload = {}, siteUrl }) {
  const approval = { id: newId(), type, leadId: lead?.id || null, summary: clean(summary, 1500), payload, status: "pending", createdAt: now() };
  await setJSON(`approval:${approval.id}`, approval);
  await pushId("approvals", approval.id);
  const who = lead ? `${lead.name || "A visitor"}${lead.email ? ` <${lead.email}>` : ""}` : "System";
  await emailOwner(
    `${TYPE_LABELS[type] || type}: ${who}`,
    `${approval.summary}\n\nEverything else is being handled by the agents. Open the dashboard to approve or decline.`,
    { label: "Open approval", url: `${siteUrl}/admin.html#approval=${approval.id}` },
    lead?.id,
  );
  return approval;
}

export const TYPE_LABELS = {
  proposal_review: "Proposal needs your OK",
  payment_check: "Client says they paid: confirm & kick off",
  trial_task: "Free trial task to do",
  escalation: "Client needs you",
  call_request: "Call requested",
};

// ---------------------------------------------------------- proposals
function priceFloor(item) {
  return Math.round(item.base * (1 - RULES.maxDiscountPct / 100));
}

// Turns an agent's draft into a priced proposal and decides whether it needs
// Stanley's approval. Returns { proposal, reasons[] }.
export function priceProposal(lead, draft) {
  const reasons = [];
  const items = [];
  for (const raw of (draft.items || []).slice(0, 12)) {
    const qty = Math.max(1, Math.min(100, Math.round(Number(raw.quantity) || 1)));
    const pkg = raw.package_id && findPackage(raw.package_id);
    const svc = raw.service_id && findService(raw.service_id);
    let item;
    if (pkg) {
      item = { label: `${pkg.name} retainer (${pkg.hours} hrs/month)`, ref: pkg.id, type: "monthly", base: pkg.price };
    } else if (svc) {
      item = { label: svc.name, ref: svc.id, type: svc.type === "monthly" ? "monthly" : "project", base: svc.price };
    } else if (raw.service_id === "hourly") {
      item = { label: "Pay-as-you-go hours", ref: "hourly", type: "project", base: PAYG.hourly };
      if (qty < PAYG.minimumHours) reasons.push(`Hourly block below the ${PAYG.minimumHours}-hour minimum.`);
    } else {
      item = { label: clean(raw.label || "Custom work", 120), ref: "custom", type: raw.type === "monthly" ? "monthly" : "project", base: null };
      reasons.push(`Custom line item "${item.label}" is not in the catalog.`);
    }
    const price = Math.round(Number(raw.price_usd) || item.base || 0);
    if (item.base != null && price < priceFloor(item)) reasons.push(`${item.label} priced at $${price}, below the $${priceFloor(item)} floor.`);
    if (price <= 0) reasons.push(`${item.label} has no price.`);
    items.push({ ...item, price, quantity: qty, description: clean(raw.description, 500) });
  }
  if (!items.length) reasons.push("Proposal has no line items.");

  const discountPct = Math.max(0, Math.min(50, Number(draft.discount_pct) || 0));
  if (discountPct > RULES.maxDiscountPct) reasons.push(`Discount of ${discountPct}% exceeds the ${RULES.maxDiscountPct}% limit.`);

  const sum = (type) => items.filter((i) => i.type === type).reduce((t, i) => t + i.price * i.quantity, 0);
  const factor = 1 - discountPct / 100;
  const monthly = Math.round(sum("monthly") * factor);
  const oneOff = Math.round(sum("project") * factor);
  const dueNow = monthly + Math.round(oneOff * RULES.depositPctProjects / 100);
  if (monthly + oneOff > RULES.autoApproveLimitUsd) reasons.push(`First-invoice value $${monthly + oneOff} is over the $${RULES.autoApproveLimitUsd} auto-approve limit.`);

  const proposal = {
    id: newId(), token: newId(18), leadId: lead.id, createdAt: now(), updatedAt: now(),
    status: reasons.length ? "pending_approval" : "sent",
    client: { name: lead.name, email: lead.email, company: lead.company },
    title: clean(draft.title || `Delegation plan for ${lead.company || lead.name || "you"}`, 140),
    summary: clean(draft.executive_summary, 3000),
    themes: (draft.win_themes || []).map((t) => clean(t, 300)).slice(0, 5),
    items, discountPct, totals: { monthly, oneOff, dueNow },
    timeline: clean(draft.timeline || "Kick-off within 48 hours of payment.", 600),
    validUntil: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    approvalReasons: reasons, followups: 0,
  };
  return { proposal, reasons };
}

export const getProposal = (id) => getJSON(`proposal:${id}`);
export async function saveProposal(p) {
  p.updatedAt = now();
  await setJSON(`proposal:${p.id}`, p);
  if (!p.indexed) {
    p.indexed = true;
    await setJSON(`proposal:${p.id}`, p);
    await pushId("proposals", p.id);
  }
  return p;
}

// Used when Stanley edits prices while approving.
export function recomputeTotals(p) {
  const factor = 1 - (p.discountPct || 0) / 100;
  const sum = (type) => p.items.filter((i) => i.type === type).reduce((t, i) => t + i.price * i.quantity, 0);
  const monthly = Math.round(sum("monthly") * factor);
  const oneOff = Math.round(sum("project") * factor);
  p.totals = { monthly, oneOff, dueNow: monthly + Math.round(oneOff * RULES.depositPctProjects / 100) };
}

export function publicProposal(p) {
  const { token, approvalReasons, indexed, ...rest } = p;
  return rest;
}

export function proposalUrl(siteUrl, p) {
  return `${siteUrl}/proposal.html?id=${p.id}&t=${p.token}`;
}

export async function sendProposalToClient(siteUrl, lead, p) {
  if (!lead.email) return null;
  return sendEmail({
    to: lead.email, leadId: lead.id, kind: "client",
    subject: `Your proposal from Altradits: ${p.title}`,
    text: `Hi ${lead.name || "there"},\n\nThanks for the conversation. Here is your proposal, written from what you told us.\n\n${p.summary || ""}\n\nYou can accept it online in about a minute. Kick-off is within 48 hours of payment.\n\n${BUSINESS.owner}, Altradits`,
    cta: { label: "View your proposal", url: proposalUrl(siteUrl, p) },
  });
}

// Money is in: mark paid, activate the client and send the kick-off email.
// Used by Stanley's approval and by automatic Lightning settlement.
export async function confirmPayment(lead, p, note = "") {
  p.status = "paid";
  p.payment = { ...p.payment, confirmedAt: now() };
  lead.stage = "active";
  logEvent(lead, `Payment confirmed${p.payment.method ? ` (${p.payment.method})` : ""}. Client is active.`);
  await sendEmail({ to: lead.email, leadId: lead.id, subject: "Payment received: we're starting",
    text: `Hi ${lead.name || "there"},\n\nPayment received, thank you. Work on "${p.title}" starts within 48 hours.\n\n${note || "Next: reply with the logins or files we need (never your passwords in plain email: we'll send a secure way to share them) and your top three priorities."}\n\n${BUSINESS.owner}, Altradits` });
  await saveProposal(p);
  await saveLead(lead);
}

// Shared by the agent tool and by admin approval: put the proposal live.
export async function publishProposal(siteUrl, lead, p) {
  p.status = "sent";
  await saveProposal(p);
  advanceStage(lead, "proposal_sent");
  logEvent(lead, `Proposal ${p.id} sent ($${p.totals.dueNow} due to start).`);
  await saveLead(lead);
  await sendProposalToClient(siteUrl, lead, p);
}
