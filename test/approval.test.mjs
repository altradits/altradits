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
const { orderable } = await import("../data/catalog.js");
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

test("bulk: several drafts approved or rejected at once from the admin", async () => {
  const admin = await import("../api/admin.js");
  process.env.ADMIN_TOKEN = "t0ken";
  const a = await email.sendEmail({ to: "a@shop.co", dept: "growth", subject: "A", text: "A" });
  const b = await email.sendEmail({ to: "b@shop.co", dept: "growth", subject: "B", text: "B" });
  const call = async (body) => (await admin.POST(new Request("http://x/api/admin", { method: "POST", headers: { Authorization: "Bearer t0ken", "Content-Type": "application/json" }, body: JSON.stringify(body) }))).json();
  const r = await call({ action: "mail_decide_bulk", ids: [a.id, b.id, "nope"], approve: true });
  assert.equal(r.done, 2);
  assert.equal(r.failed, 1);
  assert.ok(!(await email.pendingApprovals()).some((e) => [a.id, b.id].includes(e.id)));
  assert.match((await call({ action: "mail_decide_bulk", ids: [] })).error, /Select at least one/);
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

test("payments: one automatic email with the complete receipt attached; nothing waits for approval", async () => {
  const crm = await import("../lib/crm.js");
  const before = (await email.pendingApprovals()).length;
  // A donation, paid over Lightning.
  const { lead, p } = await crm.createDonation({ usd: 20, name: "Amina", email: "amina@shop.co", message: "Teach more people!" });
  assert.equal(p.status, "accepted");
  assert.ok(p.donation);
  p.lightning = { sats: 24000, rate: 83333 };
  p.payment = { method: "Bitcoin (Lightning)", reference: "abc123hash", sats: 24000 };
  // Without the node's record, no receipt: the payment is held.
  const probe = structuredClone(p);
  await crm.confirmPayment(structuredClone(lead), probe);
  assert.equal(probe.payment.held, true);
  assert.equal(probe.receipt, undefined);
  const node = (sats, reference) => ({ sats, reference, at: new Date().toISOString(), onchain: false });
  await crm.confirmPayment(lead, p, "", { settlement: node(24000, "abc123hash") });
  const mine = (await all()).filter((e) => e.to === "amina@shop.co" && e.files?.length);
  assert.equal(mine.length, 1); // one email with the receipt, not two receipts
  const [thanks] = mine;
  assert.equal(thanks.subject, "Thank you for your donation");
  assert.equal(thanks.status, "logged"); // sent at once
  assert.equal(thanks.from, "Stan at Altradits <stan@altradits.com>");
  assert.equal(thanks.bcc, "altradits@gmail.com");
  assert.match(thanks.text, /\$20 donation to Bitcoin education.*\(24,000 sats\)\. Your receipt R-\d{4}-00001 is attached\./);
  assert.deepEqual(thanks.files, [`altradits-receipt-${p.receipt.no}.pdf`]);
  assert.equal(p.receipt.qa, true);
  assert.equal((await email.pendingApprovals()).length, before); // nothing for Stanley to approve
  // The receipt has everything a receipt needs.
  const { receiptPdf } = await import("../lib/finance.js");
  const pdf = receiptPdf(lead, p, "R-2026-00001").toString("latin1");
  assert.ok(pdf.startsWith("%PDF"));
  for (const s of ["Receipt R-2026-00001", "PAID IN FULL", "Issued by Altradits", "finance@altradits.com", `Order reference: ${p.id}`, "Amina", "amina@shop.co",
    "Donation to Bitcoin education", "24,000 sats", "$20.00 at $83,333 per BTC", "Bitcoin Lightning Network", "abc123hash", "Settled on the Lightning Network",
    "No goods or services were provided"]) assert.ok(pdf.includes(s), s);
  // An order: same single email, items with quantity and price, and the portal button.
  const o = await crm.createOrder(orderable("hourly"));
  o.lead.email = "buyer@shop.co"; o.lead.name = "Kip";
  o.p.lightning = { sats: 60000, rate: 83333 };
  o.p.payment = { method: "Bitcoin (Lightning)", reference: "def456hash", sats: 60000 };
  await crm.confirmPayment(o.lead, o.p, "", { settlement: node(60000, "def456hash") });
  const paid = (await all()).filter((e) => e.to === "buyer@shop.co");
  assert.equal(paid.length, 1);
  assert.match(paid[0].text, /Your receipt R-\d{4}-00002 is attached/);
  assert.ok(paid[0].cta.url.includes("/portal"));
  const opdf = receiptPdf(o.lead, o.p, o.p.receipt.no).toString("latin1");
  assert.ok(opdf.includes("Pay-as-you-go hours: 2 x $25.00 = $50.00"));
  assert.ok(opdf.includes("fixed free for 14 days"));
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

test("start fresh: communications and test clients are cleared; payments and their emails are never touched", async () => {
  const store = await import("../lib/store.js");
  const cleanup = await import("../lib/cleanup.js");
  await store.setJSON("member:m1", { id: "m1" }); await store.pushId("members", "m1");
  const paid = (await getMany("proposal", await store.listIds("proposals"))).filter((p) => p.status === "paid");
  assert.equal(paid.length, 2); // the donation and the order from the payments test
  const payLeads = new Set(paid.map((p) => p.leadId));
  const payMail = (await all()).filter((e) => ["payment", "receipt", "finance"].includes(e.kind) || payLeads.has(e.leadId)).map((e) => e.id);
  assert.ok(payMail.length >= 2); // each payment's email, with its receipt
  const seq = await store.getJSON("finance:seq");
  await assert.rejects(cleanup.clearGroups(["nothing"]), /Choose/);
  const r = await cleanup.clearGroups(["communications", "clients"]);
  assert.ok(r.archived > 5);
  assert.ok(r.kept >= payMail.length + 2);
  // Only the payment's records remain, in their lists.
  assert.deepEqual(new Set(await store.listIds("proposals")), new Set(paid.map((p) => p.id)));
  assert.deepEqual(new Set(await store.listIds("leads")), payLeads);
  const waiting = (await all()).filter((e) => e.status === "awaiting approval").map((e) => e.id);
  assert.deepEqual(new Set(await store.listIds("emails")), new Set([...payMail, ...waiting])); // payments, and drafts still waiting for Stanley
  assert.equal(await store.getJSON("finance:seq"), seq); // receipt numbers never restart
  assert.deepEqual(await store.listIds("members"), ["m1"]);
  const saved = JSON.parse(fs.readFileSync(path.join(store.dataDir(), "archive", r.file), "utf8"));
  assert.ok(Object.keys(saved.kv).some((k) => k.startsWith("email:")));
  assert.ok(!paid.some((p) => saved.kv[`proposal:${p.id}`]));
});

test("delete for good keeps no copy; archives can be listed and deleted", async () => {
  const store = await import("../lib/store.js");
  const cleanup = await import("../lib/cleanup.js");
  await email.sendEmail({ to: "jo@shop.co", approved: true, subject: "Hi", text: "Hi" });
  const before = store.listArchives().length;
  const r = await cleanup.clearGroups(["communications"], { keep: false });
  assert.ok(r.cleared > 0);
  assert.equal(r.file, null);
  assert.ok((await getMany("email", await store.listIds("emails"))).every((e) => ["payment", "receipt", "finance"].includes(e.kind) || e.leadId || e.status === "awaiting approval"));
  assert.ok(!(await all()).some((e) => e.subject === "Hi" && e.to === "jo@shop.co")); // the plain email is gone
  assert.equal(store.listArchives().length, before); // no new archive file
  const [a] = store.listArchives();
  assert.ok(a.bytes > 0);
  assert.throws(() => store.deleteArchive("../db.json"), /isn't an archive/);
  store.deleteArchive(a.name);
  assert.equal(store.listArchives().length, before - 1);
  assert.throws(() => store.deleteArchive(a.name), /already gone/);
});

test("PDFs keep underscores inside ids and file names; only emphasis marks are removed", async () => {
  const { markdownToPdf } = await import("../lib/pdf.js");
  const s = markdownToPdf("Order reference: R0hgf_nMSB0z, file get_paid.pdf, _emphasis_ and **bold**").toString("latin1");
  for (const x of ["R0hgf_nMSB0z", "get_paid.pdf", "emphasis and bold"]) assert.ok(s.includes(x), x);
  assert.ok(!s.includes("_emphasis_"));
});

test("node down: a payment confirmed by hand gets its sats and payment hash from the invoice, labelled with the wallet that holds it", async () => {
  const crm = await import("../lib/crm.js");
  const { bolt11PaymentHash } = await import("../lib/lightning.js");
  // A real (1-sat, unpaid) Wallet of Satoshi invoice; its hash as decoded by LND.
  const pr = "lnbc10n1p4d6gplpp53vyeujc0vhfx3x5s5guv22g3nfm74rhmpruta3fca4y8x5p8lazshp5ta737ug0ktfwaen9g9ymhynh2s55h6yaac5zpv764asxp4y79fwscqzzsxqyz5vqsp5tn5sjxqggnggrmev9mwq7z5xcq2mpzyd4jkx2sxktsh8wqd4t4ms9qxpqysgquxmqqpfuts8shm6qyj2r0c2dzmk2crx3c2yuwduer04dsda0rpcj8r4gxaymwfhc6mz7s6rgff5ta5nkz4krehkdpdnre5w6xwyapygq8hnjgf";
  assert.equal(bolt11PaymentHash(pr), "8b099e4b0f65d2689a90a238c529119a77ea8efb08f8bec538ed48735027ff45");
  assert.equal(bolt11PaymentHash("not an invoice"), null);
  const o = await crm.createOrder(orderable("hourly"));
  o.lead.email = "offline@shop.co";
  o.p.lightning = { provider: "address", bolt11: pr, sats: 61000, rate: 82000 };
  o.p.status = "paid_claimed";
  o.p.payment = { method: "Bitcoin (Lightning)", reference: pr.slice(-24), claimedAt: new Date().toISOString() }; // what "I've paid" records
  // "I've paid": the client gets a plain acknowledgement, no receipt.
  await crm.acknowledgeClaim(o.lead, o.p);
  const ack = (await all()).find((e) => e.to === "offline@shop.co");
  assert.equal(ack.status, "logged");
  assert.match(ack.text, /recorded your payment of 61,000 sats/);
  assert.match(ack.text, /official receipt with every detail/);
  assert.deepEqual(ack.files, []);
  await crm.confirmPayment(o.lead, o.p, "", { approved: true }); // Stanley has seen it in the wallet: work starts
  assert.equal(o.p.payment.sats, 61000);
  assert.equal(o.p.payment.wallet, "Wallet of Satoshi");
  assert.equal(o.p.payment.held, true);
  assert.equal(o.p.payment.reference, bolt11PaymentHash(pr)); // the real payment hash, not the tail the client sent
  assert.equal(o.p.receipt, undefined); // no receipt until the sats are on the node
  assert.ok(o.p.order.taskId); // but the work has started
  const kick = (await all()).find((e) => e.to === "offline@shop.co" && /we're starting/.test(e.subject));
  assert.match(kick.text, /61,000 sats over Lightning/);
  assert.match(kick.text, /official receipt, with every detail of this payment, follows/);
  assert.deepEqual(kick.files, []);
  await crm.saveProposal(o.p);
  const { statement, statementCsv } = await import("../lib/statement.js");
  assert.ok((await statement()).custodial.sats >= 61000);
  assert.match(await statementCsv(), /,61000,lightning,Wallet of Satoshi,/);
  // Moving the sats needs the node: refused while it's down.
  const fin = await import("../lib/finance.js");
  assert.ok((await fin.heldPayments()).some((x) => x.id === o.p.id));
  await assert.rejects(fin.moveToNode(o.p), /node isn't connected/);
  // Once the node shows the move settled: the official receipt goes out.
  o.p.sweep = { paymentHash: "ab".repeat(32), provider: "lnd", sats: 61000 };
  await assert.rejects(fin.confirmOnNode(o.lead, o.p), /needs the node's record/); // no record, no receipt
  const r = await fin.confirmOnNode(o.lead, o.p, { sats: 61000, reference: "ab".repeat(32), at: new Date().toISOString() });
  assert.equal(o.p.payment.held, false);
  assert.equal(o.p.payment.sweptFrom, "Wallet of Satoshi");
  const official = (await all()).find((e) => e.to === "offline@shop.co" && /^Your official receipt R-/.test(e.subject));
  assert.deepEqual(official.files, [`altradits-receipt-${r.no}.pdf`]);
  const pdf = fin.receiptPdf(o.lead, o.p, r.no).toString("latin1");
  assert.ok(pdf.includes("Amount received: 61,000 sats"));
  assert.ok(pdf.includes("Received through our backup Lightning address while our node was offline") && pdf.includes("Altradits node on")); // wraps across two lines
  assert.ok(pdf.includes("Altradits node payment hash:") && pdf.includes("ab".repeat(32))); // the hash may wrap to its own line
  assert.match(await statementCsv(), /,61000,lightning,node,/);
  assert.ok(!(await fin.heldPayments()).some((x) => x.id === o.p.id));
});

test("WhatsApp alerts to Stanley: off without a CallMeBot key; with one, his number and the text go to CallMeBot only", async () => {
  const { whatsappOwner } = await import("../lib/notify.js");
  delete process.env.CALLMEBOT_APIKEY;
  assert.equal(await whatsappOwner("hi"), false);
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (u) => { calls.push(String(u)); return { ok: true }; };
  try {
    process.env.CALLMEBOT_APIKEY = "k123";
    assert.equal(await whatsappOwner("Altradits URGENT: check the Mac"), true);
    const u = new URL(calls[0]);
    assert.equal(u.host, "api.callmebot.com");
    assert.equal(u.searchParams.get("apikey"), "k123");
    assert.equal(u.searchParams.get("text"), "Altradits URGENT: check the Mac");
  } finally { globalThis.fetch = real; delete process.env.CALLMEBOT_APIKEY; }
});
