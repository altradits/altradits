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

test("every department email waits for Stanley; only alerts to him and payment confirmations skip the queue", async () => {
  const q = await email.sendEmail({ to: "jo@shop.co", dept: "growth", subject: "Your question", text: "Core includes 35 hours." });
  assert.equal(q.status, "awaiting approval");
  assert.equal(q.from, "Altradits Customer Care <care@altradits.com>");
  assert.equal(q.cc, "stan@altradits.com");
  // Kit follow-ups wait too; the kit someone just requested and payment confirmations go at once.
  assert.equal((await email.sendEmail({ to: "jo@shop.co", kind: "kit", dept: "marketing", subject: "Your kit", text: "Here" })).status, "awaiting approval");
  const kit = await email.sendEmail({ to: "jo@shop.co", kind: "delivery", dept: "marketing", subject: "Your free kit", text: "Here" });
  assert.equal(kit.status, "logged");
  assert.ok(!kit.bcc);
  const pay = await email.sendEmail({ to: "jo@shop.co", kind: "payment", subject: "Payment received", text: "Thanks" });
  assert.equal(pay.status, "logged");
  assert.equal(pay.bcc, "altradits@gmail.com");
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

test("links in emails are embedded: worded links and buttons, never long raw addresses in the HTML", async () => {
  const { previewEmail } = await import("../lib/email.js");
  const html = await previewEmail({ dept: "growth", subject: "Hi", text: "See [your portal](https://altradits.com/portal?c=SECRET123) or https://altradits.com/hourly?x=TOKEN", unsubscribe: "https://altradits.com/api/kits?unsub=a&t=b" });
  assert.match(html, /<a href="https:\/\/altradits\.com\/portal\?c=SECRET123"[^>]*>your portal<\/a>/);
  assert.match(html, />altradits\.com\/hourly<\/a>/); // bare address shown short, no token
  assert.doesNotMatch(html.replace(/href="[^"]*"/g, ""), /SECRET123|TOKEN|unsub=a/); // tokens only inside links
  assert.match(html, />Unsubscribe<\/a>/);
});

test("payments: the confirmation is instant; Finance's receipt is QA-reconciled and waits for Stanley; donations work the same way", async () => {
  const crm = await import("../lib/crm.js");
  const pending = async () => (await email.pendingApprovals()).filter((e) => e.kind === "receipt");
  // A donation, paid over Lightning.
  const { lead, p } = await crm.createDonation({ usd: 20, name: "Amina", email: "amina@shop.co", message: "Teach more people!" });
  assert.equal(p.status, "accepted");
  assert.ok(p.donation);
  p.lightning = { sats: 24000 };
  p.payment = { method: "Bitcoin (Lightning)", reference: "abc123hash", sats: 24000 };
  await crm.confirmPayment(lead, p);
  const thanks = (await all()).find((e) => e.subject === "Thank you for your donation");
  assert.equal(thanks.status, "logged"); // sent at once
  assert.equal(thanks.from, "Stan at Altradits <stan@altradits.com>");
  assert.match(thanks.text, /\$20 donation to Bitcoin education/);
  const [receipt] = await pending();
  assert.equal(receipt.status, "awaiting approval");
  assert.match(receipt.from, /<finance@altradits\.com>$/);
  assert.match(receipt.subject, /^Receipt R-\d{4}-00001: Donation$/);
  assert.match(receipt.text, /Amount: \$20\.00 \(24,000 sats\), paid in Bitcoin \(Lightning\)/);
  assert.equal(receipt.qa.pass, true);
  assert.ok(receipt.qa.checks.every((c) => c.pass));
  // Short payment: Stan's QA flags it for Stanley.
  const { reconcile } = await import("../lib/finance.js");
  const short = reconcile({ ...p, payment: { ...p.payment, sats: 1000 } });
  assert.equal(short.pass, false);
  assert.ok(short.checks.some((c) => c.check === "Sats received cover the invoice" && !c.pass));
  // Donations aren't revenue or chased.
  const api = await import("../api/donate.js");
  const tally = await (await api.GET()).json();
  assert.equal(tally.raised, 20);
  assert.equal(tally.donors, 1);
});

test("a kit requested on /products reaches the inbox at once, with approvals on", async () => {
  const subs = await import("../lib/subscribers.js");
  const r = await subs.subscribe({ email: "kiwi@shop.co", name: "Kiwi", kit: "inbox", ip: "1.2.3.4" });
  assert.ok(r.sub);
  const mail = (await all()).find((e) => e.to === "kiwi@shop.co");
  assert.equal(mail.status, "logged"); // sent, not waiting for approval
  assert.match(mail.from, /<marketing@altradits\.com>$/);
  assert.match(mail.cta.url, /\/api\/kits\?d=inbox&/);
  assert.ok(!(await email.pendingApprovals()).some((e) => e.to === "kiwi@shop.co"));
});
