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

test("payments: instant payment email, then Finance's QA-reconciled PDF receipt at once, then Finance's confirmation waits for Stanley", async () => {
  const crm = await import("../lib/crm.js");
  const pending = async () => (await email.pendingApprovals()).filter((e) => e.kind === "finance");
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
  assert.match(thanks.text, /\$20 donation to Bitcoin education.*\(24,000 sats\)/);
  // The detailed receipt: sent automatically, PDF attached, from Finance.
  const receipt = (await all()).find((e) => /^Receipt R-\d{4}-00001: Donation$/.test(e.subject));
  assert.equal(receipt.status, "logged");
  assert.equal(receipt.kind, "receipt");
  assert.match(receipt.from, /<finance@altradits\.com>$/);
  assert.deepEqual(receipt.files, [`altradits-receipt-${receipt.subject.match(/R-\d{4}-\d{5}/)[0]}.pdf`]);
  assert.equal(receipt.cta, null);
  assert.equal(receipt.qa.pass, true);
  const { receiptPdf } = await import("../lib/finance.js");
  const pdf = receiptPdf(lead, p, "R-2026-00001").toString("latin1");
  assert.ok(pdf.startsWith("%PDF"));
  for (const s of ["Receipt R-2026-00001", "Donation to Bitcoin education", "24,000 sats", "Settled on the Lightning Network", "abc123hash"]) assert.ok(pdf.includes(s), s);
  // Finance's personal confirmation waits for Stanley.
  const [conf] = await pending();
  assert.equal(conf.status, "awaiting approval");
  assert.match(conf.from, /<finance@altradits\.com>$/);
  assert.match(conf.text, /Donation to Bitcoin education: \$20\.00\nTotal: \$20\.00, received as 24,000 sats via Bitcoin \(Lightning\)/);
  assert.match(conf.text, /Your receipt is R-\d{4}-00001/);
  assert.ok(conf.qa.checks.every((c) => c.pass));
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
  assert.deepEqual(mail.files, ["inbox-zero-in-60-minutes.pdf"]);
  assert.ok(!(await email.pendingApprovals()).some((e) => e.to === "kiwi@shop.co"));
});

test("email look: no letterhead, signature all on the logo's background, no AI label, Unsubscribe a small word", async () => {
  const html = await email.previewEmail({ dept: "marketing", subject: "Your free kit", text: "Hi Jo, your kit is attached.", unsubscribe: "https://altradits.com/api/kits?unsub=a&t=b" });
  assert.equal((html.match(/assets\/logo\.png/g) || []).length, 1); // one logo: the signature's
  assert.doesNotMatch(html, /<h2/); // no letterhead or title block
  assert.match(html, /<table role="presentation" width="100%" bgcolor="#F5F5F5"/);
  assert.doesNotMatch(html, /AI agent|A human reviews/);
  assert.match(html, /Head of Marketing, Altradits|, Altradits</);
  assert.match(html, /seed phrases by email\. <a href="[^"]+unsub=a[^"]*"[^>]*>Unsubscribe<\/a>/);
});

test("start fresh: communications and test clients are archived to a file, then cleared; the team stays", async () => {
  const store = await import("../lib/store.js");
  await store.setJSON("member:m1", { id: "m1" }); await store.pushId("members", "m1");
  assert.ok((await store.listIds("emails")).length > 0);
  await assert.rejects(store.archiveAndClear(["nothing"]), /Choose/);
  const r = await store.archiveAndClear(["communications", "clients"]);
  assert.ok(r.archived > 5);
  assert.equal((await store.listIds("emails")).length, 0);
  assert.equal((await store.listIds("approvalq")).length, 0);
  assert.equal((await store.listIds("leads")).length, 0);
  assert.equal(await store.getJSON("finance:seq"), null); // receipts start again at 00001
  assert.deepEqual(await store.listIds("members"), ["m1"]);
  const saved = JSON.parse(fs.readFileSync(path.join(store.dataDir(), "archive", r.file), "utf8"));
  assert.ok(Object.keys(saved.kv).some((k) => k.startsWith("email:")));
  assert.ok(saved.lists.emails.length > 0);
});

test("delete for good keeps no copy; archives can be listed and deleted", async () => {
  const store = await import("../lib/store.js");
  await email.sendEmail({ to: "jo@shop.co", approved: true, subject: "Hi", text: "Hi" });
  const before = store.listArchives().length;
  const r = await store.archiveAndClear(["communications"], { keep: false });
  assert.ok(r.cleared > 0);
  assert.equal(r.file, null);
  assert.equal((await store.listIds("emails")).length, 0);
  assert.equal(store.listArchives().length, before); // no new archive file
  const [a] = store.listArchives();
  assert.ok(a.bytes > 0);
  assert.throws(() => store.deleteArchive("../db.json"), /isn't an archive/);
  store.deleteArchive(a.name);
  assert.equal(store.listArchives().length, before - 1);
  assert.throws(() => store.deleteArchive(a.name), /already gone/);
});
