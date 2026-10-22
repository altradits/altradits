// End-to-end funnel test against the real handlers, in scripted-agent mode with
// the local file store. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-"));
process.chdir(tmp); // store writes .data/db.json under cwd
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
process.env.ADMIN_TOKEN = "secret-admin";
process.env.CRON_SECRET = "secret-cron";
process.env.SITE_URL = "https://altradits.test";

const root = new URL("../", import.meta.url);
const chat = await import(new URL("api/chat.js", root));
const lead = await import(new URL("api/lead.js", root));
const proposal = await import(new URL("api/proposal.js", root));
const admin = await import(new URL("api/admin.js", root));
const cron = await import(new URL("api/cron.js", root));
const crm = await import(new URL("lib/crm.js", root));

const req = (method, url, body, headers = {}) => new Request(`https://altradits.test${url}`, {
  method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, ...a) => { const r = await fn(req(...a)); return { status: r.status, body: await r.json() }; };
const ADMIN = { Authorization: "Bearer secret-admin" };

test("chat visitor goes from first message to paid, active client", async () => {
  let r = await call(chat.POST, "POST", "/api/chat", { message: "My Instagram and inbox are eating my evenings" });
  assert.equal(r.status, 200);
  const { leadId, token } = r.body;
  assert.ok(leadId && token, "new lead gets id + token");
  assert.match(r.body.reply, /hours a week/i);

  r = await call(chat.POST, "POST", "/api/chat", { leadId, token, message: "About 8 hours" });
  assert.match(r.body.reply, /email/i);

  r = await call(chat.POST, "POST", "/api/chat", { leadId, token, message: "I'm Amina, amina@example.com" });
  const act = r.body.actions.find((a) => a.type === "proposal");
  assert.ok(act, "proposal button returned");
  const u = new URL(act.url);
  const id = u.searchParams.get("id"), t = u.searchParams.get("t");

  r = await call(proposal.GET, "GET", `/api/proposal?id=${id}&t=${t}`);
  assert.equal(r.body.proposal.status, "sent");
  assert.equal(r.body.proposal.token, undefined, "token never exposed");
  assert.equal(r.body.proposal.totals.monthly, 749, "8 h/week maps to Core");

  r = await call(proposal.GET, "GET", `/api/proposal?id=${id}&t=wrong`);
  assert.equal(r.status, 404, "bad token rejected");

  r = await call(proposal.POST, "POST", "/api/proposal", { id, t, action: "accept", name: "Amina K", agree: true });
  assert.equal(r.body.proposal.status, "accepted");

  r = await call(proposal.POST, "POST", "/api/proposal", { id, t, action: "paid", method: "Bitcoin (Lightning)", reference: "abc" });
  assert.equal(r.body.proposal.status, "paid_claimed");

  r = await call(admin.GET, "GET", "/api/admin?view=overview", null, ADMIN);
  const ap = r.body.approvals.find((a) => a.type === "payment_check" && a.status === "pending");
  assert.ok(ap, "payment check waiting for Stanley");
  const ownerMails = r.body.emails.filter((e) => e.kind === "owner");
  assert.equal(ownerMails.length, 1, "Stanley got exactly one email: the payment to confirm");

  r = await call(admin.POST, "POST", "/api/admin", { action: "approval", id: ap.id, decision: "approve" }, ADMIN);
  assert.equal(r.body.approval.status, "approved");
  const l = await crm.getLead(leadId);
  assert.equal(l.stage, "active");
  r = await call(admin.GET, "GET", "/api/admin?view=overview", null, ADMIN);
  assert.equal(r.body.stats.mrrUsd, 749);
});

test("agents cannot undercut prices: low quote goes to approval", async () => {
  const l = await crm.createLead({ email: "b@example.com", name: "Ben" });
  const { proposal: p, reasons } = crm.priceProposal(l, {
    executive_summary: "x", items: [{ package_id: "core", price_usd: 500 }], discount_pct: 25,
  });
  assert.equal(p.status, "pending_approval");
  assert.ok(reasons.some((x) => /floor/.test(x)));
  assert.ok(reasons.some((x) => /Discount/.test(x)));

  const ok = crm.priceProposal(l, { executive_summary: "x", items: [{ service_id: "website" }] });
  assert.equal(ok.proposal.status, "sent");
  assert.equal(ok.proposal.totals.dueNow, 300, "50% deposit on a $600 project");

  const custom = crm.priceProposal(l, { executive_summary: "x", items: [{ service_id: "custom", label: "Podcast", price_usd: 400 }] });
  assert.equal(custom.proposal.status, "pending_approval");
});

test("quiz lead magnet captures the lead without emailing Stanley", async () => {
  const before = (await call(admin.GET, "GET", "/api/admin", null, ADMIN)).body.emails.filter((e) => e.kind === "owner").length;
  const r = await call(lead.POST, "POST", "/api/lead", { name: "Cy", email: "cy@example.com", quiz: { tasks: ["inbox-calendar", "travel-life"], hours: 20, hourValue: 80 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.plan.package, "partner");
  const o = (await call(admin.GET, "GET", "/api/admin", null, ADMIN)).body;
  assert.equal(o.emails.filter((e) => e.kind === "owner").length, before);
  assert.ok(o.emails.some((e) => e.to === "cy@example.com" && /delegation plan/i.test(e.subject)));
});

test("admin and cron are locked", async () => {
  assert.equal((await call(admin.GET, "GET", "/api/admin", null, { Authorization: "Bearer nope" })).status, 401);
  assert.equal((await call(cron.GET, "GET", "/api/cron")).status, 401);
  const r = await call(cron.GET, "GET", "/api/cron", null, { Authorization: "Bearer secret-cron" });
  assert.equal(r.status, 200);
});
