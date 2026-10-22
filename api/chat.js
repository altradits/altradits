// POST /api/chat  { leadId?, token?, message, context? }
// One visitor turn with the agent team. Creates the lead on first contact.
import { json, readBody, clean, clientIp, siteUrl, safeEqual } from "../lib/http.js";
import { createLead, getLead, cleanQuiz } from "../lib/crm.js";
import { handleTurn, agentLive } from "../lib/agent.js";
import { hit } from "../lib/store.js";

const MAX_TURNS_PER_LEAD = 60;

export async function POST(request) {
  const body = await readBody(request);
  const message = clean(body.message, 2000);
  if (!message) return json({ error: "Empty message" }, 400);

  if ((await hit(`rl:chat:${clientIp(request)}`, 600)) > 40) {
    return json({ error: "You're sending messages quickly. Please wait a few minutes, or email altradits@gmail.com." }, 429);
  }

  let lead;
  let isNew = false;
  if (body.leadId) {
    lead = await getLead(clean(body.leadId, 40));
    if (!lead || !safeEqual(lead.token, body.token)) lead = null;
  }
  if (!lead) {
    const ctx = body.context && typeof body.context === "object" ? body.context : {};
    lead = await createLead({
      source: clean(ctx.source || "chat", 40),
      needs: Array.isArray(ctx.needs) ? ctx.needs : [],
      context: { page: clean(ctx.page, 200), service: clean(ctx.service, 80), quiz: cleanQuiz(ctx.quiz) },
    });
    isNew = true;
  }

  if (!isNew && Array.isArray(body.context?.needs)) {
    lead.needs = [...new Set([...lead.needs, ...body.context.needs.map((n) => clean(n, 80))])].slice(0, 20);
  }

  if (lead.transcript.filter((m) => m.role === "user").length >= MAX_TURNS_PER_LEAD) {
    return json({ leadId: lead.id, reply: "We've covered a lot! Stanley will pick this up personally: reply to any email from us or write to altradits@gmail.com.", actions: [] });
  }

  const { reply, actions } = await handleTurn(lead, message, siteUrl(request));
  return json({ leadId: lead.id, token: isNew ? lead.token : undefined, reply, actions, stage: lead.stage, live: agentLive });
}
