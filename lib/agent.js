// Runs one visitor turn through the agent team: Claude with tools that write to
// the CRM. Without ANTHROPIC_API_KEY a scripted fallback walks the same funnel
// so the site never dead-ends.
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./agents.js";
import { BUSINESS, PACKAGES, SERVICES, recommend } from "../data/catalog.js";
import {
  saveLead, logEvent, advanceStage, priceProposal, saveProposal, publishProposal,
  proposalUrl, createApproval,
} from "./crm.js";
import { clean, EMAIL_RE } from "./http.js";

const MODEL = process.env.AGENT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.AGENT_EFFORT || "low"; // chat: low keeps replies quick
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const agentLive = Boolean(client);

const SERVICE_IDS = SERVICES.map((s) => s.id);

const TOOLS = [
  {
    name: "update_lead",
    description: "Save what you have learned about the visitor. Call whenever you learn a new fact (name, email, business, needs, hours, budget, pain). Only include fields you actually know.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        country: { type: "string" },
        role: { type: "string", description: "e.g. founder, executive, creator, e-commerce seller, host, coach" },
        needs: { type: "array", items: { type: "string", enum: SERVICE_IDS }, description: "Matching service_ids" },
        hours_per_week: { type: "number", description: "Hours per week the work currently takes them" },
        budget_monthly_usd: { type: "number" },
        timeline: { type: "string" },
        pain_summary: { type: "string", description: "Their problem and its cost, in their words" },
        fit_score: { type: "integer", minimum: 1, maximum: 10, description: "How well they fit and how ready they are to buy" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_proposal",
    description: "Create a priced proposal and send the link to the visitor by email. Requires the visitor's email. Use package_id for a retainer, service_id for catalog services, service_id 'hourly' for pay-as-you-go hours (quantity = hours), or a label with type for custom work (routed for owner approval).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        executive_summary: { type: "string", description: "3 to 6 sentences: their situation in their words, cost of inaction, our approach, the outcome." },
        win_themes: { type: "array", items: { type: "string" }, maxItems: 4, description: "Short client-centred reasons this plan fits them" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              package_id: { type: "string", enum: PACKAGES.map((p) => p.id) },
              service_id: { type: "string", enum: [...SERVICE_IDS, "hourly", "custom"] },
              label: { type: "string" },
              type: { type: "string", enum: ["monthly", "project"] },
              price_usd: { type: "number", description: "Unit price. Defaults to catalog price." },
              quantity: { type: "integer", minimum: 1 },
              description: { type: "string", description: "What is delivered for this client specifically" },
            },
            additionalProperties: false,
          },
          minItems: 1,
        },
        discount_pct: { type: "number" },
        timeline: { type: "string" },
      },
      required: ["executive_summary", "items"],
      additionalProperties: false,
    },
  },
  {
    name: "start_trial_task",
    description: "Register the visitor's free first task (up to 1 hour of work) so Stanley can do it. Requires their email.",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The task, with every detail needed to do it" },
        deadline: { type: "string" },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
  {
    name: "book_call",
    description: "Visitor wants to talk to Stanley before deciding. Returns a booking link or logs a call request.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" }, preferred_times: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_owner",
    description: "Email Stanley now. Only for: upset client, deadline under 48 hours, a dispute (legal, security, payment), or a question you cannot answer. Not for routine questions.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["upset_client", "urgent_deadline", "dispute", "unanswerable"] },
        summary: { type: "string", description: "What happened and what Stanley needs to do" },
      },
      required: ["reason", "summary"],
      additionalProperties: false,
    },
  },
];

// ------------------------------------------------------------- tool handlers
async function runTool(name, input, ctx) {
  const { lead, siteUrl } = ctx;
  switch (name) {
    case "update_lead": {
      if (input.name) lead.name = clean(input.name, 120);
      if (input.email && EMAIL_RE.test(input.email)) lead.email = clean(input.email, 200).toLowerCase();
      for (const [k, f] of [["company", "company"], ["country", "country"], ["role", "role"], ["timeline", "timeline"], ["pain_summary", "pain"]]) {
        if (input[k]) lead[f] = clean(input[k], 600);
      }
      if (Array.isArray(input.needs)) lead.needs = [...new Set([...lead.needs, ...input.needs.filter((n) => SERVICE_IDS.includes(n))])];
      if (input.hours_per_week > 0) lead.hoursPerWeek = Math.min(80, Number(input.hours_per_week));
      if (input.budget_monthly_usd > 0) lead.budgetMonthly = Math.round(input.budget_monthly_usd);
      if (input.fit_score) lead.score = Math.max(1, Math.min(10, Math.round(input.fit_score)));
      advanceStage(lead, lead.score >= 6 || (lead.email && lead.needs.length) ? "qualified" : "engaged");
      return "Saved.";
    }
    case "create_proposal": {
      if (!lead.email) return "ERROR: no email yet. Ask for their name and email first, save it with update_lead, then try again.";
      const { proposal, reasons } = priceProposal(lead, input);
      await saveProposal(proposal);
      lead.proposalId = proposal.id;
      const url = proposalUrl(siteUrl, proposal);
      if (reasons.length) {
        advanceStage(lead, "pending_approval");
        logEvent(lead, `Proposal ${proposal.id} drafted, waiting for approval.`);
        await saveLead(lead);
        await createApproval({
          type: "proposal_review", lead, siteUrl, payload: { proposalId: proposal.id },
          summary: `Proposal "${proposal.title}" for ${lead.name || lead.email}: $${proposal.totals.monthly}/month + $${proposal.totals.oneOff} one-off.\nWhy it needs you: ${reasons.join(" ")}\nClient's need: ${lead.pain || lead.needs.join(", ")}`,
        });
        return `Proposal drafted but it needs Stanley's approval (${reasons.join(" ")}). Tell the visitor he will confirm within 12 hours and they will get the link by email. Do not share a link.`;
      }
      await publishProposal(siteUrl, lead, proposal);
      ctx.actions.push({ type: "proposal", url, label: "Open your proposal" });
      return `Proposal sent to ${lead.email}. Link (already shown to the visitor as a button): ${url}. Totals: $${proposal.totals.monthly}/month, $${proposal.totals.oneOff} one-off, $${proposal.totals.dueNow} due to start.`;
    }
    case "start_trial_task": {
      if (!lead.email) return "ERROR: no email yet. Ask for their email first.";
      logEvent(lead, `Free trial task: ${clean(input.task, 200)}`);
      advanceStage(lead, "qualified");
      await saveLead(lead);
      await createApproval({
        type: "trial_task", lead, siteUrl, payload: { task: clean(input.task, 3000), deadline: clean(input.deadline, 120) },
        summary: `Free trial task from ${lead.name || lead.email}:\n${clean(input.task, 3000)}\nDeadline: ${clean(input.deadline, 120) || "none given"}\nDeliver it, then the agents will follow up with a proposal.`,
      });
      return "Trial task registered. Tell them Stanley will email the result, usually within one business day.";
    }
    case "book_call": {
      if (BUSINESS.bookingUrl) {
        ctx.actions.push({ type: "book", url: BUSINESS.bookingUrl, label: "Pick a time" });
        logEvent(lead, "Offered booking link.");
        return "Booking link shown to the visitor as a button.";
      }
      if (!lead.email) return "ERROR: ask for their email first so Stanley can send times.";
      await createApproval({
        type: "call_request", lead, siteUrl, payload: { preferred: clean(input.preferred_times, 300) },
        summary: `${lead.name || lead.email} wants a call. Reason: ${clean(input.reason, 500)}. Preferred times: ${clean(input.preferred_times, 300) || "not given"}.`,
      });
      return "Call request sent. Tell them Stanley will email times within 12 hours.";
    }
    case "escalate_to_owner": {
      logEvent(lead, `Escalated: ${input.reason}`);
      await saveLead(lead);
      await createApproval({ type: "escalation", lead, siteUrl, payload: { reason: input.reason }, summary: clean(input.summary, 1500) });
      return "Stanley has been emailed. Tell the visitor a human will reply personally, usually within a few hours.";
    }
    default:
      return `ERROR: unknown tool ${name}`;
  }
}

function leadState(lead) {
  const known = {
    name: lead.name, email: lead.email, company: lead.company, role: lead.role, country: lead.country,
    needs: lead.needs, hours_per_week: lead.hoursPerWeek, budget_monthly_usd: lead.budgetMonthly,
    pain: lead.pain, stage: lead.stage, has_proposal: Boolean(lead.proposalId), arrived_with: lead.context,
  };
  return `Visitor record (from our CRM, trusted): ${JSON.stringify(known)}`;
}

// ------------------------------------------------------------- live agent
async function runClaude(lead, siteUrl) {
  const ctx = { lead, siteUrl, actions: [] };
  const history = lead.transcript.map((m) => ({ role: m.role, content: m.text }));
  while (history.length && history[0].role !== "user") history.shift();
  const messages = [...history, { role: "system", content: leadState(lead) }];
  const replies = [];

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      replies.push(`I can't help with that one here, but ${BUSINESS.owner} can take a look personally: email ${BUSINESS.email}.`);
      break;
    }
    for (const block of response.content) if (block.type === "text" && block.text.trim()) replies.push(block.text.trim());

    if (response.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: response.content }); continue; }
    const calls = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !calls.length) break;

    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const call of calls) {
      let out;
      try { out = await runTool(call.name, call.input || {}, ctx); } catch (err) { out = `ERROR: ${err.message}`; }
      results.push({ type: "tool_result", tool_use_id: call.id, content: out, is_error: out.startsWith("ERROR") });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: replies.join("\n\n") || "Sorry, I lost my train of thought. Could you say that again?", actions: ctx.actions };
}

// ------------------------------------------------------------- scripted fallback
const KEYWORDS = [
  [/social|instagram|tiktok|linkedin|facebook|post|content/i, "social-management"],
  [/reel|video|youtube|shorts/i, "short-video"],
  [/email|inbox|calendar|schedul/i, "inbox-calendar"],
  [/invoice|bookkeep|account|receipt/i, "bookkeeping-prep"],
  [/data|spreadsheet|excel|document|crm/i, "data-docs"],
  [/project|notion|trello|asana|meeting/i, "project-coordination"],
  [/recruit|hiring|hr|cv/i, "hr-recruiting"],
  [/travel|personal|errand|booking|family/i, "travel-life"],
  [/executive|chief|priorit/i, "executive-assist"],
  [/support|customer|helpdesk|whatsapp/i, "customer-support"],
  [/lead|outreach|prospect/i, "lead-generation"],
  [/shop|store|etsy|amazon|listing|order/i, "ecommerce-ops"],
  [/airbnb|guest|host/i, "host-assist"],
  [/research|report/i, "research"],
  [/website|landing|site/i, "website"],
  [/automat|zapier|n8n|ai agent/i, "automation-ai"],
  [/bitcoin|lightning|sats/i, "bitcoin"],
  [/translat|transcri/i, "translation"],
  [/newsletter|blog|copy/i, "content-writing"],
];

async function runScripted(lead, siteUrl, text) {
  const ctx = { lead, siteUrl, actions: [] };
  const email = text.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>,;]{2,}/);
  if (email) await runTool("update_lead", { email: email[0].replace(/[.)]+$/, "") }, ctx);
  const name = text.match(/(?:i'?m|i am|my name is|name:)\s+([A-Z][a-z]+)/i);
  if (name) lead.name = name[1];
  const needs = KEYWORDS.filter(([re]) => re.test(text)).map(([, id]) => id);
  if (needs.length) await runTool("update_lead", { needs }, ctx);
  const hours = text.match(/(\d{1,2})\s*(?:h|hrs|hours)/i);
  if (hours) lead.hoursPerWeek = Number(hours[1]);
  if (!lead.pain && text.length > 20) lead.pain = clean(text, 400);

  if (!lead.needs.length) return { reply: "Happy to help. What is the one task you would most like off your plate this month?", actions: [] };
  if (!lead.hoursPerWeek) return { reply: "Got it. Roughly how many hours a week does that take you right now?", actions: [] };
  if (!lead.email) return { reply: `That's about ${Math.round(lead.hoursPerWeek * 4.3)} hours a month you could get back. I can send you a proposal right now: what's your name and best email?`, actions: [] };
  if (lead.proposalId) return { reply: `Your proposal is ready, and a copy is in your inbox. If you have questions, ${BUSINESS.owner} reads every reply to that email.`, actions: [] };

  const h = lead.hoursPerWeek * 4.3;
  const { pkg } = recommend(lead.hoursPerWeek);
  const named = lead.needs.map((id) => SERVICES.find((s) => s.id === id)?.name).filter(Boolean);
  const out = await runTool("create_proposal", {
    title: `Delegation plan: ${named.slice(0, 2).join(" + ")}`,
    executive_summary: `You told us ${named.join(", ").toLowerCase()} is taking about ${lead.hoursPerWeek} hours of your week. Left as it is, that is roughly ${Math.round(h)} hours a month not spent on the work only you can do. The ${pkg.name} retainer gives you ${pkg.hours} hours a month of handled work, with a written summary so you always know where things stand.`,
    win_themes: ["You get your hours back from week one", "One person, every task, clear reporting", "Month to month, first task free"],
    items: [{ package_id: pkg.id, description: `Covers: ${named.join(", ")}` }],
  }, ctx);
  const sent = out.startsWith("Proposal sent");
  return {
    reply: sent
      ? `Done. Based on what you said, I'd suggest the **${pkg.name}** plan ($${pkg.price}/month, ${pkg.hours} hours). Your proposal is below and in your inbox. Accepting takes a minute, and kick-off is within 48 hours of payment.`
      : `Thanks. ${BUSINESS.owner} will confirm a tailored proposal within 12 hours, by email.`,
    actions: ctx.actions,
  };
}

export async function handleTurn(lead, text, siteUrl) {
  lead.transcript.push({ role: "user", text, at: new Date().toISOString() });
  advanceStage(lead, "engaged");
  let result;
  try {
    result = client ? await runClaude(lead, siteUrl) : await runScripted(lead, siteUrl, text);
  } catch (err) {
    console.error("agent error", err);
    result = {
      reply: `I'm having trouble connecting right now. You can reach ${BUSINESS.owner} directly on WhatsApp or at ${BUSINESS.email}, and nothing you've told me is lost.`,
      actions: [{ type: "whatsapp", url: `https://wa.me/${BUSINESS.whatsapp}`, label: "WhatsApp Stanley" }],
    };
  }
  lead.transcript.push({ role: "assistant", text: result.reply, at: new Date().toISOString() });
  await saveLead(lead);
  return result;
}
