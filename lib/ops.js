// Operations: the team, client task requests and referrals. This is what lets
// the business run without Stanley: tasks are routed to the right department,
// briefed with its playbook, assigned to the least-busy approved team member,
// and reviewed by the client. Stanley only hears about work nobody can take
// and work that is overdue.
import { holdIfUnsafe } from "./screen.js";
import { BUSINESS, RULES, findPackage, SERVICES } from "../data/catalog.js";
import { DEPARTMENTS, findDepartment, routeTask } from "../data/playbooks.js";
import { getJSON, setJSON, pushId, listIds, getMany } from "./store.js";
import { sendEmail, emailOwner } from "./email.js";
import { newId, clean, EMAIL_RE } from "./http.js";
import { getLead, saveLead, logEvent, getProposal } from "./crm.js";

const now = () => new Date().toISOString();
export const base = () => (process.env.SITE_URL || BUSINESS.siteUrl).replace(/\/$/, "");
const DEPT_IDS = DEPARTMENTS.map((d) => d.id);
// Work not yet with the client and not finished.
export const OPEN = ["assigned", "in_progress", "changes", "queued", "working", "owner", "waiting_client", "follow_up"];

// ------------------------------------------------------------- team
export async function applyMember(input) {
  const departments = (Array.isArray(input.departments) ? input.departments : []).filter((d) => DEPT_IDS.includes(d));
  const m = {
    id: newId(), token: newId(18), createdAt: now(), updatedAt: now(), status: "applied",
    name: clean(input.name, 120), email: clean(input.email, 200).toLowerCase(),
    country: clean(input.country, 80), timezone: clean(input.timezone, 60),
    departments, skills: clean(input.skills, 1500), tools: clean(input.tools, 600),
    rate: Math.max(0, Math.min(500, Number(input.rate) || 0)),
    hoursPerWeek: Math.max(1, Math.min(60, Number(input.hoursPerWeek) || 10)),
    portfolio: /^https?:\/\//.test(input.portfolio || "") ? clean(input.portfolio, 300) : "",
    sample: clean(input.sample, 3000),
    sampleQuestion: clean(input.sampleQuestion, 400),
  };
  if (!m.name || !EMAIL_RE.test(m.email)) throw new Error("Name and a valid email are required.");
  if (!departments.length) throw new Error("Choose at least one department.");
  if (m.sample.length < 80) throw new Error("Please answer the sample task in a few sentences.");
  m.score = screen(m);
  await setJSON(`member:${m.id}`, m);
  await pushId("members", m.id);
  await sendEmail({
    to: m.email, kind: "team", dept: "careers", subject: "We received your Altradits application",
    text: `Hi ${m.name},\n\nThanks for applying to join the Altradits team (${departments.map((d) => findDepartment(d).name).join(", ")}). We review applications weekly and reply either way.`,
  });
  return m;
}

// A transparent first-pass score (0-10) for sorting applications; Stanley decides.
function screen(m) {
  let s = 0;
  if (m.sample.length > 300) s += 3; else if (m.sample.length > 150) s += 2; else s += 1;
  if (m.portfolio) s += 2;
  if (m.skills.length > 120) s += 2;
  if (m.tools) s += 1;
  if (m.hoursPerWeek >= 10) s += 1;
  if (m.timezone) s += 1;
  return Math.min(10, s);
}

export const getMember = (id) => getJSON(`member:${id}`);
export async function saveMember(m) { m.updatedAt = now(); await setJSON(`member:${m.id}`, m); return m; }
export async function allMembers() { return getMany("member", await listIds("members", 500)); }

export function publicMember(m) {
  const { token, sample, ...rest } = m;
  return rest;
}

export async function setMemberStatus(m, status) {
  if (!["approved", "paused", "rejected", "applied"].includes(status)) throw new Error("Bad status");
  const was = m.status;
  m.status = status;
  await saveMember(m);
  if (status === "approved" && was !== "approved") {
    await sendEmail({
      to: m.email, kind: "team", dept: "careers", subject: "Welcome to the Altradits team",
      text: `Hi ${m.name},\n\nYou're approved for: ${m.departments.map((d) => findDepartment(d).name).join(", ")}.\n\nTasks will arrive by email with a link to your workspace, where you'll find the brief, the department playbook and the quality checklist. Accept a task when you start, and submit your deliverable link when it's ready for the client.\n\nRules that never bend: no passwords or card numbers in chat or email, never hold a client's crypto keys, and ask when in doubt.`,
      cta: { label: "Open your workspace", url: `${base()}/team?m=${m.token}` },
    });
  }
  return m;
}

// ------------------------------------------------------------- client portal
export function ensurePortal(lead) {
  if (!lead.portalToken) lead.portalToken = newId(18);
  return `${base()}/portal?c=${lead.portalToken}`;
}

export function ensureReferral(lead) {
  if (!lead.refCode) lead.refCode = newId(5).replace(/[-_]/g, "x").toLowerCase();
  return `${base()}/r/${lead.refCode}`;
}

// Index so a referral code or portal token resolves to its lead.
export async function indexLead(lead) {
  if (lead.refCode) await setJSON(`ref:${lead.refCode}`, lead.id);
  if (lead.portalToken) await setJSON(`portal:${lead.portalToken}`, lead.id);
}

export async function leadByPortal(token) {
  const id = token && (await getJSON(`portal:${clean(token, 40)}`));
  const lead = id && (await getLead(id));
  return lead && lead.portalToken === token ? lead : null;
}

// Plan hours for the active proposal (retainers), for the usage meter.
export async function planHours(lead) {
  const p = lead.proposalId && (await getProposal(lead.proposalId));
  if (!p) return 0;
  return p.items.reduce((t, i) => t + (findPackage(i.ref)?.hours || 0) * i.quantity, 0);
}

export function hoursThisMonth(tasks) {
  const month = now().slice(0, 7);
  return tasks.filter((t) => t.status === "done" && (t.closedAt || "").startsWith(month)).reduce((s, t) => s + (t.hoursLogged || 0), 0);
}

// Credit the referrer when a referred client pays (called from confirmPayment).
export async function creditReferral(lead, proposal) {
  if (!lead.referredBy || lead.referralCredited) return;
  const refId = await getJSON(`ref:${lead.referredBy}`);
  const referrer = refId && refId !== lead.id && (await getLead(refId));
  if (!referrer) return;
  const credit = Math.round(((proposal.totals.monthly || proposal.totals.dueNow) * RULES.referralCreditPct) / 100);
  referrer.referralCredit = (referrer.referralCredit || 0) + credit;
  logEvent(referrer, `Referral credit $${credit} for ${lead.name || lead.email}.`);
  await saveLead(referrer);
  lead.referralCredited = true;
  if (referrer.email) {
    await sendEmail({
      to: referrer.email, leadId: referrer.id, dept: "growth", subject: `You earned $${credit} in Altradits credit`,
      text: `Hi ${referrer.name || "there"},\n\n${lead.name || "Someone you referred"} just became a client. Thank you! $${credit} has been added to your account credit (total $${referrer.referralCredit}). It comes off your next invoice.`,
    });
  }
}

// ------------------------------------------------------------- tasks
export const getTask = (id) => getJSON(`task:${id}`);
export async function saveTask(t) { t.updatedAt = now(); await setJSON(`task:${t.id}`, t); return t; }
export async function allTasks(limit = 500) { return getMany("task", await listIds("tasks", limit)); }

function estimateHours(dept, text) {
  const words = text.split(/\s+/).length;
  const base = { social: 2, admin: 1, personal: 1, growth: 2, tech: 3 }[dept] || 1;
  return Math.min(8, base + (words > 120 ? 2 : words > 50 ? 1 : 0));
}

export async function createTask(lead, input) {
  const title = clean(input.title, 140);
  const details = clean(input.details, 4000);
  if (!title) throw new Error("Give the task a short title.");
  const service = SERVICES.find((s) => s.id === input.service)?.id || null;
  const department = DEPT_IDS.includes(input.department) ? input.department : routeTask(`${title} ${details}`, service);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(input.due || "") ? input.due : null;
  const t = {
    id: newId(), leadId: lead.id, client: lead.name || lead.email, title, details, service, department, due,
    estimateHours: estimateHours(department, `${title} ${details}`),
    urgency: ["hours", "minutes"].includes(input.urgency) ? input.urgency : null,
    status: "new", assigneeId: null, createdAt: now(), updatedAt: now(),
    history: [{ at: now(), by: "client", text: "Requested" }], deliverable: null, hoursLogged: 0,
  };
  await setJSON(`task:${t.id}`, t);
  await pushId("tasks", t.id);
  logEvent(lead, `Task requested: ${title}`);
  await saveLead(lead);
  // Security: links, code, scripts or instructions stop everything until Stanley decides.
  if (await holdIfUnsafe(t, `${title}\n${details}`, "task request", saveTask)) return t;
  const { workersLive, kickQueue } = await import("./workers.js");
  if (workersLive()) {
    // Stanley's AI department agent takes it.
    t.status = "queued";
    t.history.push({ at: now(), by: "ops", text: `Queued for the ${findDepartment(department).agent.name}` });
    await saveTask(t);
    kickQueue();
  } else {
    await assignTask(t);
  }
  return t;
}

// Least-loaded approved member in the department, within their weekly hours.
export async function pickMember(department, excludeId) {
  const [members, tasks] = await Promise.all([allMembers(), allTasks()]);
  const load = (id) => tasks.filter((t) => t.assigneeId === id && OPEN.includes(t.status)).reduce((s, t) => s + t.estimateHours, 0);
  return members
    .filter((m) => m.status === "approved" && m.departments.includes(department) && m.id !== excludeId)
    .map((m) => ({ m, load: load(m.id) }))
    .filter(({ m, load }) => load < m.hoursPerWeek)
    .sort((a, b) => a.load - b.load)[0]?.m || null;
}

export async function assignTask(t, memberId) {
  const dept = findDepartment(t.department);
  const m = memberId ? await getMember(memberId) : await pickMember(t.department);
  if (m && m.status === "approved") {
    t.assigneeId = m.id;
    t.status = "assigned";
    t.history.push({ at: now(), by: "ops", text: `Assigned to ${m.name}` });
    await saveTask(t);
    await sendEmail({
      to: m.email, kind: "team", dept: t.department, subject: `New task: ${t.title} (${dept.name})`,
      text: `Hi ${m.name},\n\nNew task for ${t.client}:\n\n${t.title}\n${t.details}\n\nEstimate: ${t.estimateHours}h${t.due ? ` · Due ${t.due}` : ` · Turnaround ${dept.turnaroundHours}h`}\n\nThe brief, playbook and quality checklist are in your workspace. Accept it when you start.`,
      cta: { label: "Open task", url: `${base()}/team?m=${m.token}#${t.id}` },
    });
    return t;
  }
  // Nobody available: this is real work only Stanley can resolve.
  t.assigneeId = null;
  t.status = "new";
  t.history.push({ at: now(), by: "ops", text: "No team member available; sent to Stanley" });
  await saveTask(t);
  await emailOwner(`Task needs a doer: ${t.title}`,
    `${t.client} requested "${t.title}" (${dept.name}, ~${t.estimateHours}h${t.due ? `, due ${t.due}` : ""}).\n\n${t.details}\n\nNo approved ${dept.name} team member has capacity. Do it yourself, or approve/assign someone in the dashboard.`,
    { label: "Open tasks", url: `${base()}/admin#tasks` }, t.leadId);
  return t;
}

export async function notifyClient(t, subject, text, { approved = false } = {}) {
  const lead = await getLead(t.leadId);
  if (!lead?.email) return;
  // Task updates come from the department doing the work.
  await sendEmail({ to: lead.email, leadId: lead.id, dept: t.department, approved, subject, text, cta: { label: "Open your portal", url: ensurePortal(lead) } });
}

// Daily: overdue work goes to Stanley in one email.
export async function overdueDigest() {
  const today = now().slice(0, 10);
  const tasks = await allTasks();
  const late = tasks.filter((t) => [...OPEN, "new"].filter((s) => s !== "waiting_client").includes(t.status) && ((t.due && t.due < today) ||
    (!t.due && Date.now() - Date.parse(t.createdAt) > (findDepartment(t.department).turnaroundHours + 24) * 3600e3)) && t.overdueNotified !== today);
  if (!late.length) return 0;
  await emailOwner(`${late.length} task${late.length > 1 ? "s" : ""} overdue`,
    late.map((t) => `- ${t.title} for ${t.client} (${t.status}${t.due ? `, due ${t.due}` : ""})`).join("\n"),
    { label: "Open tasks", url: `${base()}/admin#tasks` });
  for (const t of late) { t.overdueNotified = today; await saveTask(t); }
  return late.length;
}
