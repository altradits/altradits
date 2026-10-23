// Client portal for active clients.
// GET  /api/portal?c=<token>   -> onboarding, tasks, hours used, referral link
// POST /api/portal { c, action: "onboarding"|"task"|"approve"|"changes", ... }
import { json, readBody, clean, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { saveLead, logEvent } from "../lib/crm.js";
import {
  leadByPortal, ensureReferral, indexLead, planHours, hoursThisMonth, allTasks,
  createTask, getTask, saveTask, getMember, assignTask,
} from "../lib/ops.js";
import { sendEmail } from "../lib/email.js";
import { RULES } from "../data/catalog.js";

const forClient = (t) => ({
  id: t.id, title: t.title, details: t.details, department: t.department, due: t.due, status: t.status,
  deliverable: t.deliverable, hoursLogged: t.hoursLogged, createdAt: t.createdAt,
  history: t.history.filter((h) => h.by !== "ops").slice(-6),
});

async function view(lead) {
  const tasks = (await allTasks()).filter((t) => t.leadId === lead.id);
  return {
    client: { name: lead.name, company: lead.company, email: lead.email },
    onboarding: lead.onboarding || null,
    tasks: tasks.map(forClient),
    hours: { used: hoursThisMonth(tasks), plan: await planHours(lead) },
    referral: { url: ensureReferral(lead), creditUsd: lead.referralCredit || 0, pct: RULES.referralCreditPct },
  };
}

export async function GET(request) {
  const lead = await leadByPortal(new URL(request.url).searchParams.get("c"));
  if (!lead) return json({ error: "Portal link not found. Use the link from your kick-off email." }, 404);
  const hadRef = Boolean(lead.refCode);
  const data = await view(lead);
  if (!hadRef) { await indexLead(lead); await saveLead(lead); }
  return json(data);
}

export async function POST(request) {
  const body = await readBody(request);
  if ((await hit(`rl:portal:${clientIp(request)}`, 600)) > 60) return json({ error: "Too many requests, try again shortly." }, 429);
  const lead = await leadByPortal(body.c);
  if (!lead) return json({ error: "Portal link not found." }, 404);

  if (body.action === "onboarding") {
    const f = (k, n = 1500) => clean(body[k], n);
    lead.onboarding = {
      priorities: f("priorities"), tools: f("tools", 800), access: f("access", 400),
      voice: f("voice", 800), hours: f("hours", 200), channel: f("channel", 60), notes: f("notes"),
      at: new Date().toISOString(),
    };
    // Guard: passwords must never be stored here.
    if (/password\s*[:=]|pwd\s*[:=]|\bpin\s*[:=]/i.test(JSON.stringify(lead.onboarding))) {
      return json({ error: "Please don't share passwords here. Describe how you'll grant access (e.g. delegate access or a password-manager share) instead." }, 400);
    }
    logEvent(lead, "Completed onboarding.");
    await saveLead(lead);
    return json(await view(lead));
  }

  if (body.action === "task") {
    try {
      await createTask(lead, { title: body.title, details: body.details, due: body.due, service: body.service, department: body.department });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    return json(await view(lead));
  }

  const t = await getTask(clean(body.task, 40));
  if (!t || t.leadId !== lead.id) return json({ error: "Task not found." }, 404);
  const at = new Date().toISOString();

  if (body.action === "approve") {
    if (t.status !== "review") return json({ error: "This task isn't waiting for your review." }, 409);
    t.status = "done";
    t.closedAt = at;
    t.history.push({ at, by: "client", text: "Approved" });
    await saveTask(t);
    const m = t.assigneeId && (await getMember(t.assigneeId));
    if (m) await sendEmail({ to: m.email, kind: "team", subject: `Approved: ${t.title}`, text: `${t.client} approved "${t.title}". Nice work, thank you!` });
  } else if (body.action === "changes") {
    if (t.status !== "review") return json({ error: "This task isn't waiting for your review." }, 409);
    const note = clean(body.note, 2000);
    if (!note) return json({ error: "Tell us what to change." }, 400);
    t.status = "changes";
    t.history.push({ at, by: "client", text: `Changes requested: ${note}` });
    await saveTask(t);
    const m = t.assigneeId && (await getMember(t.assigneeId));
    if (m && m.status === "approved") {
      await sendEmail({ to: m.email, kind: "team", subject: `Changes requested: ${t.title}`,
        text: `${t.client} asked for changes on "${t.title}":\n\n${note}`,
        cta: { label: "Open task", url: `${(process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "")}/team.html?m=${m.token}#${t.id}` } });
    } else {
      await assignTask(t);
    }
  } else {
    return json({ error: "Unknown action" }, 400);
  }
  return json(await view(lead));
}
