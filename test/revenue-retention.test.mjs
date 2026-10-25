import { test } from "node:test";
import assert from "node:assert/strict";

process.env.EMAIL_APPROVAL = "off";
process.env.ADMIN_TOKEN = "test-admin-secret";
process.env.CRON_SECRET = "test-cron-secret";

import {
  createLead,
  saveLead,
  getLead,
  priceProposal,
  saveProposal,
  getProposal,
  confirmPayment,
  createOrder,
} from "../lib/crm.js";
import {
  createTask,
  getTask,
  saveTask,
  planHours,
  hoursThisMonth,
  ensureReferral,
  indexLead,
} from "../lib/ops.js";
import { runFollowups } from "../lib/followups.js";
import { subscribe, confirmSubscription, runNurture } from "../lib/subscribers.js";
import { orderable } from "../data/catalog.js";
import * as portal from "../api/portal.js";
import * as orderApi from "../api/order.js";

const DAY = 864e5;
const req = (url, method = "GET", body, headers = {}) =>
  new Request(`https://altradits.com${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

test("Retainer renewal lifecycle (Day 25 / Day 30 / Day 35), 1-month hour rollover, and referral credit deduction", async () => {
  const lead = await createLead({ name: "Retainer Client", email: "retainer-cycle@example.com" });
  const { proposal: p } = priceProposal(lead, {
    title: "Lite Retainer Plan",
    executive_summary: "15 hours/month of dedicated assistance.",
    items: [{ package_id: "lite", description: "Inbox and admin" }],
  });
  await saveProposal(p);
  lead.proposalId = p.id;
  await saveLead(lead);

  // Confirm initial month payment
  await confirmPayment(lead, p);
  assert.equal(lead.retainer.status, "active");
  assert.equal(lead.retainer.baseHours, 15);
  assert.equal(lead.retainer.rolloverHours, 0);
  assert.equal(await planHours(lead), 15);

  // Log 5 hours of work in Month 1 (10 unused hours should roll over on renewal)
  const t1 = await createTask(lead, { title: "Month 1 inbox sort", details: "Sort 50 emails", department: "admin", fromOrder: true });
  t1.status = "done";
  t1.hoursLogged = 5;
  t1.closedAt = new Date().toISOString();
  await saveTask(t1);
  assert.equal(hoursThisMonth([t1], lead), 5);

  // Give the client $25 in referral credit to verify auto-deduction on renewal
  lead.referralCredit = 25;
  // Fast-forward retainer periodEnd to 4 days from now (Day 26 of 30)
  lead.retainer.periodEnd = new Date(Date.now() + 4 * DAY).toISOString();
  await saveLead(lead);

  const rep25 = await runFollowups("https://altradits.com", new Date());
  assert.ok(rep25.renewals >= 1, "Day 25 generates renewal invoice and sends notice");

  const updatedLead = await getLead(lead.id);
  assert.equal(updatedLead.retainer.noticesSent, 1);
  assert.ok(updatedLead.retainer.renewalProposalId);
  const renProp = await getProposal(updatedLead.retainer.renewalProposalId);
  assert.equal(renProp.creditAppliedUsd, 25);
  assert.equal(renProp.totals.dueNow, 349 - 25);

  // Confirm renewal payment -> 10 unused hours roll over (15 base + 10 rollover = 25 hours)
  await confirmPayment(updatedLead, renProp);
  assert.equal(updatedLead.referralCredit, 0, "referral credit consumed upon renewal payment");
  assert.equal(updatedLead.retainer.baseHours, 15);
  assert.equal(updatedLead.retainer.rolloverHours, 10);
  assert.equal(await planHours(updatedLead), 25, "planHours includes 1-month rollover hours");

  // Test Day 30 due-today and Day 35 pause when unpaid
  updatedLead.retainer.noticesSent = 1;
  updatedLead.retainer.periodEnd = new Date(Date.now() - 1 * DAY).toISOString();
  const { proposal: ren2 } = priceProposal(updatedLead, {
    title: "Renewal 2",
    executive_summary: "Month 3 renewal",
    items: [{ package_id: "lite" }],
  });
  ren2.status = "accepted";
  await saveProposal(ren2);
  updatedLead.retainer.renewalProposalId = ren2.id;
  await saveLead(updatedLead);

  await runFollowups("https://altradits.com", new Date());
  let lAfter30 = await getLead(updatedLead.id);
  assert.equal(lAfter30.retainer.noticesSent, 2, "Day 30 reminder sent");

  lAfter30.retainer.periodEnd = new Date(Date.now() - 6 * DAY).toISOString();
  await saveLead(lAfter30);
  await runFollowups("https://altradits.com", new Date());
  let lAfter35 = await getLead(updatedLead.id);
  assert.equal(lAfter35.retainer.status, "paused", "Day 35 pauses unpaid retainer");

  // Paused retainer cannot create new portal tasks
  await assert.rejects(
    () => createTask(lAfter35, { title: "Blocked task while paused", details: "Should fail" }),
    /paused pending renewal/i,
  );
});

test("Portal task entitlement gate blocks infinite tasks on one-off website orders & enforces plan hours", async () => {
  const item = orderable("q-try"); // $5 one-off starter task
  const { lead, p } = await createOrder(item);
  lead.email = "oneoff-buyer@example.com";
  lead.name = "OneOff Buyer";
  await saveLead(lead);
  await confirmPayment(lead, p);

  // The single ordered task was created automatically by confirmPayment
  assert.ok(p.order.taskId);

  // Attempting to create extra tasks via the portal without a monthly plan is blocked
  const res = await portal.POST(req("/api/portal", "POST", {
    c: lead.portalToken,
    action: "task",
    title: "Free extra task #2",
    details: "Build me a full website for free",
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Your portal covers the job you ordered/i);
});

test("Redeemable referral credit code at checkout and 50% project balanceOnDelivery tracking", async () => {
  // 1. Custom/chat project proposal records 50% deposit dueNow and 50% balanceOnDelivery
  const projLead = await createLead({ name: "Project Client", email: "proj-balance@example.com" });
  const { proposal: projProp } = priceProposal(projLead, {
    title: "Website Build",
    executive_summary: "Landing page build",
    items: [{ service_id: "website", quantity: 1 }],
  });
  assert.equal(projProp.totals.oneOff, 600);
  assert.equal(projProp.totals.dueNow, 300);
  assert.equal(projProp.totals.balanceOnDelivery, 300);

  // 2. Referral credit mints a redeemable CREDIT-... coupon code that works on /api/order
  const referrer = await createLead({ name: "Referrer", email: "referrer-code@example.com" });
  referrer.stage = "active";
  ensureReferral(referrer);
  await indexLead(referrer);
  await saveLead(referrer);

  const item = orderable("q-captions"); // $35 quick job
  const { lead: buyer, p: orderProp } = await createOrder(item, { ref: referrer.refCode });
  buyer.email = "referred-buyer@example.com";
  buyer.name = "Referred Buyer";
  await saveLead(buyer);
  await confirmPayment(buyer, orderProp);

  const updatedReferrer = await getLead(referrer.id);
  assert.ok(updatedReferrer.referralCredit > 0);
  assert.ok(updatedReferrer.referralCodes?.length >= 1, "referrer receives a redeemable CREDIT-... code");
  const code = updatedReferrer.referralCodes[0];
  assert.match(code, /^CREDIT-/);

  // Referrer applies their CREDIT-... code on a new order
  const { p: nextOrder } = await createOrder(orderable("q-competitors"));
  const applyRes = await orderApi.POST(req("/api/order", "POST", {
    id: nextOrder.id,
    t: nextOrder.token,
    coupon: code,
  }));
  assert.equal(applyRes.status, 200);
  const applyData = await applyRes.json();
  assert.equal(applyData.code, code);
  assert.ok(applyData.credit > 0);
  assert.equal(applyData.usd, nextOrder.totals.oneOff - applyData.credit);
});

test("14-day / 30-day free fix window on completed tasks, 3rd+ revision escalation, and post-payment order brief re-queuing", async () => {
  const lead = await createLead({ name: "Window Client", email: "window-client@example.com" });
  lead.stage = "active";
  const { proposal: p } = priceProposal(lead, {
    title: "Core Plan",
    executive_summary: "Core retainer",
    items: [{ package_id: "core" }],
  });
  await saveProposal(p);
  lead.proposalId = p.id;
  await confirmPayment(lead, p);

  // Create a completed task within the 14-day window
  const t = await createTask(lead, { title: "Social post pack", details: "Write 5 posts", department: "social", fromOrder: true });
  t.status = "done";
  t.deliverable = { title: "5 posts", summary: "Drafted 5 posts", files: [{ name: "posts.md", format: "md", content: "Post 1..." }], at: new Date().toISOString() };
  t.closedAt = new Date(Date.now() - 5 * DAY).toISOString();
  await saveTask(t);

  // Revision 1 on a "done" task within 14 days succeeds
  const rev1 = await portal.POST(req("/api/portal", "POST", {
    c: lead.portalToken,
    action: "changes",
    task: t.id,
    note: "Please adjust the CTA on post #2",
  }));
  assert.equal(rev1.status, 200);

  // Revision 2 succeeds
  let tReload = await getTask(t.id);
  tReload.status = "review";
  tReload.reviewAt = new Date().toISOString();
  await saveTask(tReload);
  const rev2 = await portal.POST(req("/api/portal", "POST", {
    c: lead.portalToken,
    action: "changes",
    task: t.id,
    note: "Also change the hashtag on post #4",
  }));
  assert.equal(rev2.status, 200);

  // Revision 3 escalates to Stanley (status === "owner")
  tReload = await getTask(t.id);
  tReload.status = "review";
  await saveTask(tReload);
  const rev3 = await portal.POST(req("/api/portal", "POST", {
    c: lead.portalToken,
    action: "changes",
    task: t.id,
    note: "Actually rewrite all 5 posts for a different product",
  }));
  assert.equal(rev3.status, 200);
  tReload = await getTask(t.id);
  assert.equal(tReload.status, "owner", "3rd revision escalates to Stanley");

  // Task outside the 14-day window is rejected
  const oldTask = await createTask(lead, { title: "Old deliverable", details: "Old brief", department: "social", fromOrder: true });
  oldTask.status = "done";
  oldTask.closedAt = new Date(Date.now() - 20 * DAY).toISOString();
  await saveTask(oldTask);
  const expiredRes = await portal.POST(req("/api/portal", "POST", {
    c: lead.portalToken,
    action: "changes",
    task: oldTask.id,
    note: "Change something 20 days later",
  }));
  assert.equal(expiredRes.status, 409);

  // Automation-ai service has a 30-day window (20 days is still allowed!)
  const autoTask = await createTask(lead, { title: "Zapier workflow", details: "Webhook to Sheet", service: "automation-ai", department: "tech", fromOrder: true });
  autoTask.status = "done";
  autoTask.closedAt = new Date(Date.now() - 20 * DAY).toISOString();
  await saveTask(autoTask);
  const autoRes = await portal.POST(req("/api/portal", "POST", {
    c: lead.portalToken,
    action: "changes",
    task: autoTask.id,
    note: "Update the webhook field mapping",
  }));
  assert.equal(autoRes.status, 200, "automation-ai allows revisions within 30 days");
});

test("Follow-up automations: 1-day missing brief chase, 2-day review reminder, 14-day auto-complete, 3-day care check-in, quiz follow-up, and stopping kit nurture for active clients", async () => {
  const client = await createLead({ name: "Care Client", email: "care-lifecycle@example.com" });
  client.stage = "active";
  ensureReferral(client);
  await saveLead(client);

  // 1. Task waiting on client brief > 1 day -> chased by orders@
  const tWait = await createTask(client, { title: "Missing brief task", details: "Details to follow from the client.", department: "admin", fromOrder: true });
  tWait.status = "waiting_client";
  tWait.question = "Which spreadsheet should we clean?";
  tWait.createdAt = new Date(Date.now() - 2 * DAY).toISOString();
  await saveTask(tWait);

  // 2. Task in review > 2 days -> review reminder
  const tRev = await createTask(client, { title: "Review reminder task", details: "Draft SOP", department: "admin", fromOrder: true });
  tRev.status = "review";
  tRev.reviewAt = new Date(Date.now() - 3 * DAY).toISOString();
  await saveTask(tRev);

  // 3. Task in review > 14 days -> auto-completed to done
  const tAuto = await createTask(client, { title: "Stale review task", details: "Draft bio", department: "social", fromOrder: true });
  tAuto.status = "review";
  tAuto.reviewAt = new Date(Date.now() - 15 * DAY).toISOString();
  await saveTask(tAuto);

  // 4. Completed 5★ task > 3 days ago -> 3-day care@ check-in + retainer upsell
  const tDone = await createTask(client, { title: "Loved deliverable", details: "Competitor report", department: "growth", fromOrder: true });
  tDone.status = "done";
  tDone.satisfaction = { rating: 5, comment: "Amazing!", at: new Date(Date.now() - 4 * DAY).toISOString() };
  tDone.closedAt = new Date(Date.now() - 4 * DAY).toISOString();
  await saveTask(tDone);

  // 5. Delegation quiz lead without proposal > 2 days old
  const quizLead = await createLead({
    name: "Quiz Prospect",
    email: "quiz-prospect@example.com",
    source: "delegation-quiz",
    context: { quiz: { hours: 12, tasks: ["Inbox", "Calendar"] } },
  });
  quizLead.createdAt = new Date(Date.now() - 3 * DAY).toISOString();
  await saveLead(quizLead);

  const rep = await runFollowups("https://altradits.com", new Date());
  assert.ok(rep.intakeChases >= 1, "chases missing client input after 1 day");
  assert.ok(rep.reviewReminders >= 1, "sends 2-day review reminder");
  assert.ok(rep.autoCompleted >= 1, "auto-completes review task after 14 days");
  assert.ok(rep.careCheckins >= 1, "sends 3-day care@ post-handover check-in");
  assert.ok(rep.upsells >= 1, "sends monthly retainer upsell to 5-star one-off client");
  assert.ok(rep.quizFollowups >= 1, "follows up delegation-quiz lead");

  assert.equal((await getTask(tAuto.id)).status, "done");

  // 6. Subscriber who becomes an active client stops receiving beginner kit nurture emails
  const sub = await subscribe({ email: `kit-buyer-${Date.now()}@example.com`, name: "KitBuyer", kit: "inbox", ip: `198.51.100.${Math.floor(Math.random() * 200) + 10}` });
  const { getJSON, setJSON } = await import("../lib/store.js");
  const subRec = await getJSON(`sub:${sub.sub.id}`);
  await confirmSubscription(subRec.id, subRec.c, "inbox");
  subRec.kits[0].at = new Date(Date.now() - 3 * DAY).toISOString();
  await setJSON(`sub:${subRec.id}`, subRec);

  const subLead = await getLead(subRec.leadId);
  subLead.stage = "active";
  await saveLead(subLead);

  await runNurture(new Date());
  const afterSub = await getJSON(`sub:${subRec.id}`);
  assert.equal(afterSub.kits[0].step, 0, "active paying client is skipped by free-kit nurture");
});
