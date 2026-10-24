// Client portal for active clients.
// GET  /api/portal?c=<token>                         -> onboarding, tasks, hours, referral
// GET  /api/portal?c=<token>&task=<id>&file=<n>      -> download a deliverable file
// POST /api/portal { c, action: "onboarding"|"task"|"answer"|"approve"|"changes", ... }
import { reopen } from "../lib/qa.js";
import { json, readBody, clean, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { saveLead, logEvent } from "../lib/crm.js";
import {
  leadByPortal, ensureReferral, indexLead, planHours, hoursThisMonth, allTasks,
  createTask, getTask, saveTask, getMember, assignTask, base,
} from "../lib/ops.js";
import { sendEmail, emailOwner } from "../lib/email.js";
import { workersLive, kickQueue } from "../lib/workers.js";
import { RULES } from "../data/catalog.js";

const TYPES = { md: "text/markdown", csv: "text/csv", txt: "text/plain", html: "text/html" };

const forClient = (t) => ({
  id: t.id, title: t.title, details: t.details, department: t.department, due: t.due, status: t.status,
  question: t.status === "waiting_client" ? t.question : null,
  // Clients only ever see work that has passed QA and been sent to them.
  deliverable: t.deliverable && ["review", "done", "follow_up"].includes(t.status) ? {
    title: t.deliverable.title, summary: t.deliverable.summary || t.deliverable.note || "", url: t.deliverable.url || "",
    files: (t.deliverable.files || []).map((f, i) => ({ i, name: f.name, format: f.format, size: f.content.length })),
    sources: t.deliverable.sources || [], by: t.deliverable.by || null,
  } : null,
  satisfaction: t.satisfaction || null, hoursLogged: t.hoursLogged, createdAt: t.createdAt,
  history: t.history.filter((h) => h.by !== "ops").slice(-8),
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
  const u = new URL(request.url);
  const lead = await leadByPortal(u.searchParams.get("c"));
  if (!lead) return json({ error: "Portal link not found. Use the link from your kick-off email." }, 404);
  kickQueue();

  if (u.searchParams.get("task")) {
    const t = await getTask(clean(u.searchParams.get("task"), 40));
    const f = t && t.leadId === lead.id && t.deliverable?.files?.[Number(u.searchParams.get("file"))];
    if (!f) return json({ error: "File not found." }, 404);
    return new Response(f.content, { headers: {
      // Downloads only: never rendered as a page on our origin.
      "Content-Type": `${TYPES[f.format] || "text/plain"}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    } });
  }

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

  if (body.action === "answer") {
    if (t.status !== "waiting_client") return json({ error: "This task isn't waiting for an answer." }, 409);
    const answer = clean(body.answer, 2000);
    if (!answer) return json({ error: "Type your answer." }, 400);
    t.details = `${t.details}\n\nQ: ${t.question}\nA: ${answer}`.trim();
    t.history.push({ at, by: "client", text: `Client answered: ${answer}` });
    t.question = null;
    t.status = "queued";
    await saveTask(t);
    kickQueue();
  } else if (body.action === "approve") {
    if (t.status !== "review") return json({ error: "This task isn't waiting for your review." }, 409);
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) return json({ error: "Please rate the work from 1 to 5 stars." }, 400);
    const comment = clean(body.comment, 1000);
    t.satisfaction = { rating, comment, at };
    t.closedAt = at;
    t.history.push({ at, by: "client", text: `Approved, rated ${rating}/5${comment ? `: ${comment}` : ""}` });
    if (rating >= 4) {
      t.status = "done";
      await saveTask(t);
      const m = t.assigneeId && (await getMember(t.assigneeId));
      if (m) await sendEmail({ to: m.email, kind: "team", dept: "quality", subject: `Approved: ${t.title}`, text: `${t.client} approved "${t.title}" (${rating}/5). Nice work, thank you!` });
    } else {
      // An unhappy client is one of the few things that always reaches Stanley.
      t.status = "follow_up";
      await saveTask(t);
      await emailOwner(`Unhappy client: ${t.title} rated ${rating}/5`,
        `${t.client} approved "${t.title}" but rated it ${rating}/5.\n\n${comment || "(no comment)"}\n\nReach out personally, then close the follow-up in the dashboard.`,
        { label: "Open tasks", url: `${base()}/admin.html#tasks` }, t.leadId);
    }
  } else if (body.action === "changes") {
    if (t.status !== "review") return json({ error: "This task isn't waiting for your review." }, 409);
    const note = clean(body.note, 2000);
    if (!note) return json({ error: "Tell us what to change." }, 400);
    t.history.push({ at, by: "client", text: `Changes requested: ${note}` });
    t.revisions = (t.revisions || 0) + 1;
    const m = t.assigneeId && (await getMember(t.assigneeId));
    if (m && m.status === "approved") {
      t.status = "changes";
      await saveTask(t);
      await sendEmail({ to: m.email, kind: "team", dept: "quality", subject: `Changes requested: ${t.title}`,
        text: `${t.client} asked for changes on "${t.title}":\n\n${note}`,
        cta: { label: "Open task", url: `${base()}/team.html?m=${m.token}#${t.id}` } });
    } else if (workersLive()) {
      t.status = "queued";
      t.attempts = 0; // fresh revision cycle with the client's feedback
      reopen(t.qa, note); // Stan's QA re-tests everything, including the change
      await saveTask(t);
      kickQueue();
    } else {
      t.status = "changes";
      await saveTask(t);
      await assignTask(t);
    }
  } else {
    return json({ error: "Unknown action" }, 400);
  }
  return json(await view(lead));
}
