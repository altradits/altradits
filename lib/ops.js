// Operations & background task queue for Choumi Yakunte and the 5 departments
// (social, admin, personal, growth, tech). Tasks are screened before any AI
// reads them, routed to the right department with its playbook, checked by
// Choumi's 32-expert QA team, and handed to Stanley for review.
import { holdIfUnsafe } from "./screen.js";
import { BUSINESS } from "../data/brand.js";
import { DEPARTMENTS, findDepartment, routeTask } from "../data/playbooks.js";
import { COMMS } from "../data/team-comms.js";
import { getJSON, setJSON, pushId, listIds, getMany } from "./store.js";
import { sendEmail, emailOwner, OWNER_EMAIL } from "./email.js";
import { newId, clean } from "./http.js";

const now = () => new Date().toISOString();
export const base = () => (process.env.SITE_URL || BUSINESS.site || "https://altradits.com").replace(/\/$/, "");
const DEPT_IDS = DEPARTMENTS.map((d) => d.id);

// Work not yet finished.
export const OPEN = ["assigned", "in_progress", "changes", "queued", "working", "owner", "waiting_client", "follow_up"];

// Lightweight contact/lead store helpers (used when a task has an associated contact or preferences).
export const getLead = (id) => (id ? getJSON(`lead:${id}`) : Promise.resolve(null));
export async function saveLead(lead) {
  if (!lead?.id) return null;
  lead.updatedAt = now();
  await setJSON(`lead:${lead.id}`, lead);
  return lead;
}

export const getTask = (id) => getJSON(`task:${id}`);
export async function saveTask(t) {
  t.updatedAt = now();
  await setJSON(`task:${t.id}`, t);
  return t;
}
export async function allTasks(limit = 500) {
  return getMany("task", await listIds("tasks", limit));
}

function estimateHours(dept, text) {
  const words = String(text || "").split(/\s+/).filter(Boolean).length;
  const baseHours = { social: 2, admin: 1, personal: 1, growth: 2, tech: 3 }[dept] || 1;
  return Math.min(8, baseHours + (words > 120 ? 2 : words > 50 ? 1 : 0));
}

// Per requester: open tasks and new tasks a day are capped (each task is multiple AI calls).
export const MAX_OPEN_TASKS = 10, MAX_TASKS_PER_DAY = 10;

export async function createTask(leadOrInput, maybeInput = null) {
  const hasLead = maybeInput !== null && typeof leadOrInput === "object" && leadOrInput !== null;
  const lead = hasLead
    ? leadOrInput
    : {
        id: leadOrInput?.leadId || "stanley",
        name: leadOrInput?.client || "Stanley",
        email: leadOrInput?.clientEmail || OWNER_EMAIL,
      };
  const input = hasLead ? maybeInput : (leadOrInput || {});

  if (!input.fromOrder && !input.internal && lead.id && lead.id !== "stanley") {
    const mine = (await allTasks(2000)).filter((x) => x.leadId === lead.id);
    if (mine.filter((x) => !["done", "cancelled"].includes(x.status)).length >= MAX_OPEN_TASKS) {
      throw new Error(`You have ${MAX_OPEN_TASKS} tasks open. Approve or close some first, then send the next one.`);
    }
    if (mine.filter((x) => Date.now() - Date.parse(x.createdAt) < 864e5).length >= MAX_TASKS_PER_DAY) {
      throw new Error("That's the daily limit for new tasks. Send the next one tomorrow.");
    }
  }

  const title = clean(input.title, 140);
  const details = clean(input.details, 4000);
  if (!title) throw new Error("Give the task a short title.");
  const service = clean(input.service, 60) || null;
  const department = DEPT_IDS.includes(input.department) ? input.department : routeTask(`${title} ${details}`, service);
  const dept = findDepartment(department);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(input.due || "") ? input.due : null;

  const t = {
    id: newId(),
    leadId: lead.id || "stanley",
    client: lead.name || lead.email || lead.pickup || "Stanley",
    clientEmail: lead.email || null,
    title,
    details,
    service,
    department: dept.id,
    due,
    incidentId: input.incidentId || null,
    estimateHours: estimateHours(dept.id, `${title} ${details}`),
    urgency: ["hours", "minutes"].includes(input.urgency) ? input.urgency : null,
    status: "new",
    assigneeId: null,
    agent: dept.agent.name,
    createdAt: now(),
    updatedAt: now(),
    history: [{ at: now(), by: input.by || "Stanley", text: "Requested" }],
    deliverable: null,
    hoursLogged: 0,
    messages: [],
  };

  await setJSON(`task:${t.id}`, t);
  await pushId("tasks", t.id);

  // Security: links, code, scripts or instructions in untrusted input stop work until Stanley decides.
  if (!input.trustedInternal && (await holdIfUnsafe(t, `${title}\n${details}`, "task request", saveTask))) {
    return t;
  }

  t.status = "queued";
  t.history.push({ at: now(), by: "ops", text: `Queued for the ${dept.agent.name}` });
  await saveTask(t);

  const { kickQueue } = await import("./workers.js");
  kickQueue();
  return t;
}

// Every handover or question message is kept on the task, and alerts Stanley when ready.
export async function notifyClient(t, subject, text) {
  const cleanSubject = clean(subject, 200);
  const cleanText = clean(text, 4000);
  const comm = COMMS.find((c) => c.id === t.department);
  t.messages = [...(t.messages || []), { at: now(), from: comm?.address || "hello@altradits.com", subject: cleanSubject, text: cleanText }].slice(-10);
  await saveTask(t);

  const lead = t.leadId && t.leadId !== "stanley" ? await getLead(t.leadId) : null;
  const recipient = (lead?.email || t.clientEmail || OWNER_EMAIL).trim();
  if (!recipient) return;

  // Phase 2 #5: only owner emails to altradits@gmail.com go out live; external
  // recipient messages stay recorded on the task and alert Stanley.
  if (recipient.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `[${findDepartment(t.department).name}] ${cleanSubject}`,
      text: cleanText,
      cta: { label: "Open Choumi in admin", url: `${base()}/admin#choumi` },
      kind: "owner",
    });
  }
}

// Release a task held by lib/screen.js after Stanley reviews its links/content.
export async function releaseTask(id, { note = "", by = "" } = {}) {
  if (by !== "stanley") throw new Error("Only Stanley can release a held task.");
  const t = await getTask(clean(id, 40));
  if (!t) throw new Error("Task not found.");
  if (t.status !== "held") throw new Error("This task isn't on hold.");
  const at = now();
  t.held = { ...(t.held || {}), releasedAt: at, releasedBy: "stanley", note: clean(note, 300) || null };
  t.status = "queued";
  t.history.push({ at, by: "Stanley", text: `Released after security review${clean(note, 300) ? `: ${clean(note, 300)}` : ""}` });
  await saveTask(t);
  const { kickQueue } = await import("./workers.js");
  kickQueue();
  return t;
}

export async function cancelTask(id, { note = "", by = "" } = {}) {
  if (by !== "stanley") throw new Error("Only Stanley can cancel a task.");
  const t = await getTask(clean(id, 40));
  if (!t) throw new Error("Task not found.");
  const at = now();
  t.status = "cancelled";
  t.history.push({ at, by: "Stanley", text: `Cancelled${clean(note, 300) ? `: ${clean(note, 300)}` : ""}` });
  await saveTask(t);
  return t;
}

export async function answerTask(id, { answer = "", by = "stanley" } = {}) {
  const t = await getTask(clean(id, 40));
  if (!t) throw new Error("Task not found.");
  const ans = clean(answer, 2000);
  if (!ans) throw new Error("Write an answer.");
  if (by !== "stanley" && (await holdIfUnsafe(t, ans, "task answer", saveTask))) return t;
  const at = now();
  t.details = `${t.details ? `${t.details}\n\n` : ""}Answer (${at.slice(0, 10)}): ${ans}`;
  t.question = null;
  t.waitingSince = null;
  t.status = "queued";
  t.history.push({ at, by: by === "stanley" ? "Stanley" : "client", text: `Client answered: ${ans.slice(0, 200)}` });
  await saveTask(t);
  const { kickQueue } = await import("./workers.js");
  kickQueue();
  return t;
}

export async function rerunTask(id, { note = "", by = "" } = {}) {
  if (by !== "stanley") throw new Error("Only Stanley can request a task re-run.");
  const t = await getTask(clean(id, 40));
  if (!t) throw new Error("Task not found.");
  const cleanNote = clean(note, 1000);
  const at = now();
  t.status = "queued";
  t.attempts = 0;
  const { reopen } = await import("./qa.js");
  reopen(t.qa, cleanNote);
  t.history.push({ at, by: "Stanley", text: cleanNote ? `Changes requested: ${cleanNote}` : "Re-run requested" });
  await saveTask(t);
  if (cleanNote) {
    const { recordOutcome } = await import("./learning.js");
    await recordOutcome({
      kind: "stanley_override",
      dept: t.department,
      service: t.service,
      taskId: t.id,
      leadId: t.leadId,
      title: t.title,
      specialist: t.specialist,
      note: cleanNote,
    }).catch(() => {});
  }
  const { kickQueue } = await import("./workers.js");
  kickQueue();
  return t;
}

export async function approveTask(id, { rating = 5, comment = "", by = "stanley" } = {}) {
  const t = await getTask(clean(id, 40));
  if (!t) throw new Error("Task not found.");
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw new Error("Give a rating from 1 to 5.");
  const cleanComment = clean(comment, 600);
  const at = now();
  t.satisfaction = { rating: r, comment: cleanComment, at, by };
  t.closedAt = at;
  t.status = r <= 2 ? "follow_up" : "done";
  t.history.push({ at, by: by === "stanley" ? "Stanley" : t.client, text: `Approved (${r}★)${cleanComment ? `: ${cleanComment}` : ""}` });
  await saveTask(t);
  const { recordOutcome } = await import("./learning.js");
  await recordOutcome({
    kind: "client_approve",
    dept: t.department,
    service: t.service,
    task: t,
    taskId: t.id,
    leadId: t.leadId,
    title: t.title,
    specialist: t.specialist,
    rating: r,
    comment: cleanComment,
    summary: t.deliverable?.summary || "",
    files: t.deliverable?.files || [],
  }).catch(() => {});
  if (r <= 2 && by !== "stanley") {
    await emailOwner(`Unhappy rating (${r}★): ${t.title}`, `${t.client} rated "${t.title}" ${r}/5${cleanComment ? `:\n\n"${cleanComment}"` : "."}`, { label: "Open Choumi in admin", url: `${base()}/admin#choumi` });
  }
  return t;
}

export async function closeTask(id, { note = "", by = "" } = {}) {
  if (by !== "stanley") throw new Error("Only Stanley can close a task.");
  const t = await getTask(clean(id, 40));
  if (!t) throw new Error("Task not found.");
  const cleanNote = clean(note, 500);
  const at = now();
  t.status = "done";
  t.closedAt = at;
  t.history.push({ at, by: "Stanley", text: `Closed${cleanNote ? `: ${cleanNote}` : ""}` });
  await saveTask(t);
  if (cleanNote) {
    const { recordOutcome } = await import("./learning.js");
    await recordOutcome({
      kind: "stanley_override",
      dept: t.department,
      service: t.service,
      task: t,
      leadId: t.leadId,
      title: t.title,
      specialist: t.specialist,
      note: `Resolution on "${t.title}": ${cleanNote}`,
    }).catch(() => {});
  }
  return t;
}

// Daily: overdue work goes to Stanley in one email.
export async function overdueDigest() {
  const today = now().slice(0, 10);
  const tasks = await allTasks();
  const late = tasks.filter(
    (t) =>
      [...OPEN, "new"].filter((s) => s !== "waiting_client").includes(t.status) &&
      ((t.due && t.due < today) ||
        (!t.due && Date.now() - Date.parse(t.createdAt) > (findDepartment(t.department).turnaroundHours + 24) * 3600e3)) &&
      t.overdueNotified !== today,
  );
  if (!late.length) return 0;
  await emailOwner(
    `${late.length} task${late.length > 1 ? "s" : ""} overdue`,
    late.map((t) => `- ${t.title} for ${t.client} (${t.status}${t.due ? `, due ${t.due}` : ""})`).join("\n"),
    { label: "Open Choumi in admin", url: `${base()}/admin#choumi` },
  );
  for (const t of late) {
    t.overdueNotified = today;
    await saveTask(t);
  }
  return late.length;
}

export async function opsSummary() {
  const tasks = await allTasks();
  const counts = Object.fromEntries(
    ["queued", "working", "waiting_client", "held", "owner", "review", "follow_up", "done", "cancelled"].map((st) => [
      st,
      tasks.filter((t) => t.status === st).length,
    ]),
  );
  const ratings = tasks.filter((t) => t.satisfaction?.rating).map((t) => t.satisfaction.rating);
  return {
    total: tasks.length,
    counts,
    satisfaction: ratings.length
      ? { avg: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10, count: ratings.length }
      : null,
    recent: tasks.slice(0, 30),
  };
}
