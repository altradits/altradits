// Team members (freelance VAs by department).
// POST /api/team { action: "apply", ... }                 -> application
// GET  /api/team?m=<token>                                -> workspace: tasks + playbooks
// POST /api/team { m, action: "accept"|"submit"|"note", task, ... }
import { json, readBody, clean, clientIp, safeEqual } from "../lib/http.js";
import { hit, listIds, getMany } from "../lib/store.js";
import { applyMember, getMember, publicMember, getTask, saveTask, allTasks, notifyClient, OPEN } from "../lib/ops.js";
import { DEPARTMENTS } from "../data/playbooks.js";

async function memberByToken(token) {
  if (!token) return null;
  const members = await getMany("member", await listIds("members", 500));
  return members.find((m) => safeEqual(m.token, token)) || null;
}

const forMember = (t) => ({
  id: t.id, client: t.client, title: t.title, details: t.details, department: t.department, due: t.due,
  estimateHours: t.estimateHours, status: t.status, deliverable: t.deliverable, hoursLogged: t.hoursLogged,
  history: t.history.slice(-8), createdAt: t.createdAt,
});

export async function GET(request) {
  const m = await memberByToken(new URL(request.url).searchParams.get("m"));
  if (!m || m.status !== "approved") return json({ error: "Workspace not found or not active yet." }, 404);
  const tasks = (await allTasks()).filter((t) => t.assigneeId === m.id).map(forMember);
  const playbooks = DEPARTMENTS.filter((d) => m.departments.includes(d.id));
  return json({ member: publicMember(m), tasks, playbooks });
}

export async function POST(request) {
  const body = await readBody(request);

  if (body.action === "apply") {
    if (body.website) return json({ ok: true }); // honeypot
    if ((await hit(`rl:apply:${clientIp(request)}`, 3600)) > 5) return json({ error: "Too many applications from this connection." }, 429);
    try {
      await applyMember(body);
      return json({ ok: true });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  const m = await memberByToken(body.m);
  if (!m || m.status !== "approved") return json({ error: "Workspace not found." }, 404);
  const t = await getTask(clean(body.task, 40));
  if (!t || t.assigneeId !== m.id) return json({ error: "Task not found." }, 404);
  const at = new Date().toISOString();

  if (body.action === "accept") {
    if (!["assigned", "changes"].includes(t.status)) return json({ error: "Task is not waiting to start." }, 409);
    t.status = "in_progress";
    t.history.push({ at, by: m.name, text: "Started" });
  } else if (body.action === "submit") {
    if (!OPEN.includes(t.status)) return json({ error: "Task is not open." }, 409);
    const url = clean(body.url, 500);
    const note = clean(body.note, 2000);
    if (!/^https?:\/\//.test(url) && note.length < 20) return json({ error: "Add a link to the deliverable or a note describing what was done." }, 400);
    t.deliverable = { url: /^https?:\/\//.test(url) ? url : "", note, at };
    t.hoursLogged = Math.max(0, Math.min(40, Number(body.hours) || 0));
    t.status = "review";
    t.history.push({ at, by: m.name, text: `Submitted for review (${t.hoursLogged}h)` });
    await notifyClient(t, `Ready for your review: ${t.title}`,
      `Your task "${t.title}" is done and ready for you.\n\n${note}${t.deliverable.url ? `\n\nDeliverable: ${t.deliverable.url}` : ""}\n\nApprove it or ask for changes in your portal.`);
  } else if (body.action === "note") {
    const note = clean(body.note, 1000);
    if (!note) return json({ error: "Empty note." }, 400);
    t.history.push({ at, by: m.name, text: note });
  } else {
    return json({ error: "Unknown action" }, 400);
  }
  await saveTask(t);
  return json({ task: forMember(t) });
}
