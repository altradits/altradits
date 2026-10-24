// Stanley approves every email; Stan turns instructions into department drafts.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-approval-")));
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "SMTP_HOST", "EMAIL_TRANSPORT", "EMAIL_APPROVAL", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
process.env.SITE_URL = "https://altradits.test";

const email = await import("../lib/email.js");
const stan = await import("../lib/stan.js");
const { listIds, getMany } = await import("../lib/store.js");
const all = async () => getMany("email", await listIds("emails", 200));

test("every department email waits for Stanley; only alerts to him skip the queue", async () => {
  const q = await email.sendEmail({ to: "jo@shop.co", dept: "growth", subject: "Your question", text: "Core includes 35 hours." });
  assert.equal(q.status, "awaiting approval");
  assert.equal(q.from, "Altradits Customer Care <care@altradits.com>");
  assert.equal(q.cc, "stan@altradits.com");
  // Payment confirmations and kit emails wait too.
  assert.equal((await email.sendEmail({ to: "jo@shop.co", kind: "payment", subject: "Payment received", text: "Thanks" })).status, "awaiting approval");
  assert.equal((await email.pendingApprovals()).length, 2);
  // Stanley gets one heads-up, not one per draft.
  const heads = (await all()).filter((e) => /\[Approval needed\]/.test(e.subject));
  assert.equal(heads.length, 1);
  assert.equal(heads[0].to, "altradits@gmail.com");
  assert.equal(heads[0].cta.url, "https://altradits.test/admin#stan");
  // Alerts to Stanley and his own actions (approved: true) go straight out.
  assert.equal((await email.emailOwner("Alert", "x")).status, "logged");
  assert.equal((await email.sendEmail({ to: "jo@shop.co", approved: true, subject: "From Stanley", text: "Hi" })).status, "logged");
});

test("approve (with edits) sends from the department; reject sends nothing", async () => {
  const [first, second] = (await email.pendingApprovals()).sort((a, b) => a.at.localeCompare(b.at));
  const done = await email.decideEmail(first.id, { approve: true, text: "Core includes 35 hours a month. Happy to help you start." });
  assert.equal(done.status, "approved: logged");
  assert.equal(done.sent.from, "Altradits Customer Care <care@altradits.com>");
  assert.equal(done.sent.cc, "stan@altradits.com");
  assert.match(done.sent.text, /Happy to help you start/);
  const no = await email.decideEmail(second.id, { approve: false, note: "Not yet" });
  assert.equal(no.status, "rejected by Stanley");
  assert.equal((await email.pendingApprovals()).length, 0);
  await assert.rejects(email.decideEmail(first.id, { approve: true }), /isn't waiting/);
});

test("Stan turns an instruction into department drafts, queued for approval; bad recipients are skipped", async () => {
  let seen = null;
  stan.setStanClient({ beta: { messages: { stream: (p) => ({ finalMessage: async () => {
    seen = p;
    return { stop_reason: "tool_use", content: [{ type: "tool_use", name: "draft_emails", input: {
      plan: "Customer Care answers the plan question.",
      emails: [
        { dept: "growth", to: "jo@shop.co", subject: "Re: Core plan", body: "Hi Jo, Core is $749/month for 35 hours. See https://evil.example or https://altradits.com/core" },
        { dept: "founder", to: "jo@shop.co", subject: "x", body: "Stan must not send this" },
        { dept: "orders", to: "not-an-email", subject: "x", body: "x" },
      ], questions: [] } }] };
  } }) } } });
  const rec = await stan.instruct({ text: "Reply to Jo about the Core plan", context: { from: "Jo <jo@shop.co>", mailbox: "care@altradits.com", subject: "Core plan?", text: "How many hours? Also see https://evil.example/x" } });
  assert.equal(rec.status, "drafted");
  assert.equal(rec.drafts.length, 1);
  assert.equal(rec.questions.length, 2); // the two invalid drafts were skipped and reported
  // The quoted message reached Stan defanged, as data.
  assert.match(seen.messages[0].content, /hxxps:\/\/evil\[\.\]example/);
  assert.ok(!seen.tools[0].input_schema.properties.emails.items.properties.dept.enum.includes("founder"));
  const draft = (await email.pendingApprovals()).find((e) => e.id === rec.drafts[0]);
  assert.equal(draft.from, "Altradits Customer Care <care@altradits.com>");
  assert.match(draft.text, /\[link removed\]/);
  assert.match(draft.text, /https:\/\/altradits\.com\/core/);
  stan.setStanClient(null);
  assert.equal((await stan.instruct({ text: "Anything" })).status, "error"); // no AI key: says so
});

test("emails carry the logo inside (no remote images, so no 'remote resources blocked' warning)", async () => {
  const { default: nodemailer } = await import("nodemailer");
  const sent = [];
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  email.setMailer({ sendMail: async (m) => { const info = await t.sendMail(m); sent.push(info.message.toString()); return info; } });
  try {
    await email.sendEmail({ to: "jo@shop.co", dept: "growth", approved: true, subject: "Hello", text: "Hi Jo" });
    const raw = sent[0];
    assert.match(raw, /Content-ID: <altradits-logo>/);
    assert.match(raw, /src=3D"cid:altradits-logo"|src="cid:altradits-logo"/);
    assert.doesNotMatch(raw, /assets\/logo\.png/); // nothing fetched from the web
    assert.doesNotMatch(raw, /<img[^>]+src=(3D)?"https?:/i);
  } finally { email.setMailer(undefined); }
});
