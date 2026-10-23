// Operations: team, client portal, task routing, referrals. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ops-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "LND_REST_URL"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";
process.env.SITE_URL = "https://altradits.test";

const root = new URL("../", import.meta.url);
const crm = await import(new URL("lib/crm.js", root));
const ops = await import(new URL("lib/ops.js", root));
const team = await import(new URL("api/team.js", root));
const portal = await import(new URL("api/portal.js", root));
const admin = await import(new URL("api/admin.js", root));

const req = (method, url, body) => new Request(`https://altradits.test${url}`, {
  method, headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, ...a) => { const r = await fn(req(...a)); return { status: r.status, body: await r.json() }; };
const emails = async () => (await call(admin.GET, "GET", "/api/admin")).body.emails;

async function activeClient(name, email, referredBy = "") {
  const lead = await crm.createLead({ name, email, referredBy });
  const { proposal } = crm.priceProposal(lead, { executive_summary: "x", items: [{ package_id: "core" }] });
  await crm.saveProposal(proposal);
  lead.proposalId = proposal.id;
  await crm.confirmPayment(lead, proposal);
  return crm.getLead(lead.id);
}

test("a task with nobody on the team goes to Stanley", async () => {
  const lead = await activeClient("Ava", "ava@example.com");
  assert.ok(lead.portalToken && lead.refCode, "kick-off creates portal + referral link");
  const r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "task", title: "Book flights to Lagos", details: "Next Tuesday, aisle seat" });
  assert.equal(r.status, 200);
  assert.equal(r.body.tasks[0].department, "personal", "routed by keywords");
  assert.ok((await emails()).some((e) => e.kind === "owner" && /Task needs a doer: Book flights/.test(e.subject)));
});

test("team member: apply, approve, receive, deliver; client: changes then approve", async () => {
  let r = await call(team.POST, "POST", "/api/team", { action: "apply", name: "Joy", email: "joy@example.com", departments: ["social"], sample: "short" });
  assert.equal(r.status, 400, "sample answer required");
  r = await call(team.POST, "POST", "/api/team", { action: "apply", name: "Joy", email: "joy@example.com", departments: ["social"], hoursPerWeek: 10,
    skills: "Three years managing Instagram and TikTok for restaurants and salons, growing followers and bookings.", tools: "Canva, Later",
    sample: "Fresh from the oven at 7am: our new sourdough has a crackly crust and a soft, tangy middle. Come early, it sells out by noon! I'd post around 7-8am when locals plan breakfast, then check insights after a week." });
  assert.equal(r.status, 200);

  const ov = (await call(admin.GET, "GET", "/api/admin?view=ops")).body;
  const joy = ov.members.find((m) => m.email === "joy@example.com");
  assert.equal(joy.status, "applied");
  assert.equal(joy.token, undefined, "member token never sent to the dashboard");
  await call(admin.POST, "POST", "/api/admin", { action: "member_status", id: joy.id, status: "approved" });
  const welcome = (await emails()).find((e) => e.to === "joy@example.com" && /Welcome/.test(e.subject));
  assert.ok(welcome, "welcome email with workspace link");
  const m = (await ops.getMember(joy.id)).token;

  const lead = await activeClient("Ben", "ben@example.com");
  r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "onboarding", priorities: "Instagram", access: "password: hunter2" });
  assert.equal(r.status, 400, "passwords refused");
  r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "onboarding", priorities: "Grow Instagram", access: "Meta Business Suite partner access" });
  assert.equal(r.body.onboarding.priorities, "Grow Instagram");

  r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "task", title: "Write 3 Instagram captions for the sourdough launch", details: "Friendly, emoji ok" });
  const taskId = r.body.tasks[0].id;
  assert.equal(r.body.tasks[0].department, "social");
  assert.ok((await emails()).some((e) => e.to === "joy@example.com" && /New task/.test(e.subject)), "assigned to Joy");

  let w = await call(team.GET, "GET", `/api/team?m=${m}`);
  assert.equal(w.body.tasks[0].id, taskId);
  assert.equal(w.body.playbooks[0].id, "social", "workspace includes the playbook");
  assert.equal((await call(team.GET, "GET", "/api/team?m=wrong")).status, 404);

  await call(team.POST, "POST", "/api/team", { m, action: "accept", task: taskId });
  r = await call(team.POST, "POST", "/api/team", { m, action: "submit", task: taskId, url: "https://docs.google.com/x", note: "Three captions in the doc, with hashtags.", hours: 1.5 });
  assert.equal(r.body.task.status, "review");
  assert.ok((await emails()).some((e) => e.to === "ben@example.com" && /Ready for your review/.test(e.subject)));

  r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "changes", task: taskId, note: "Make the second one shorter" });
  assert.equal(r.body.tasks[0].status, "changes");
  await call(team.POST, "POST", "/api/team", { m, action: "accept", task: taskId });
  await call(team.POST, "POST", "/api/team", { m, action: "submit", task: taskId, url: "https://docs.google.com/x", note: "Shortened caption two.", hours: 2 });
  r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "approve", task: taskId });
  assert.equal(r.status, 400, "rating required to approve");
  r = await call(portal.POST, "POST", "/api/portal", { c: lead.portalToken, action: "approve", task: taskId, rating: 5, comment: "Perfect" });
  assert.equal(r.body.tasks.find((t) => t.id === taskId).status, "done");
  assert.equal(r.body.hours.used, 2);
  assert.equal(r.body.hours.plan, 35, "Core plan hours");

  // Other clients can't touch it.
  const other = await activeClient("Cy", "cy@example.com");
  r = await call(portal.POST, "POST", "/api/portal", { c: other.portalToken, action: "approve", task: taskId, rating: 5 });
  assert.equal(r.status, 404);
});

test("referral credit when a referred client pays", async () => {
  const referrer = await activeClient("Dee", "dee@example.com");
  await ops.indexLead(referrer);
  await activeClient("Eve", "eve@example.com", referrer.refCode);
  const after = await crm.getLead(referrer.id);
  assert.equal(after.referralCredit, 75, "10% of $749");
  assert.ok((await emails()).some((e) => e.to === "dee@example.com" && /\$75 in Altradits credit/.test(e.subject)));
});

test("overdue tasks reach Stanley once a day", async () => {
  const lead = await activeClient("Fay", "fay@example.com");
  const t = await ops.createTask(lead, { title: "Reconcile invoices", details: "September", due: "2020-01-01" });
  assert.equal(await ops.overdueDigest(), 1, "only the past-due task (the fresh flights task is within turnaround)");
  assert.equal(await ops.overdueDigest(), 0, "not repeated the same day");
  assert.equal((await ops.getTask(t.id)).department, "admin");
});
