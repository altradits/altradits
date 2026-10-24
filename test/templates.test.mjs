// Free kits: sign-up, downloads, the follow-up ladder and unsubscribe.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-kits-"));
process.chdir(tmp);
for (const k of ["RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST"]) delete process.env[k];
process.env.SITE_URL = "https://altradits.test";

const { KITS } = await import("../data/templates.js");
const { orderable } = await import("../data/catalog.js");
const subs = await import("../lib/subscribers.js");
const api = await import("../api/kits.js");
const { getJSON, listIds, getMany } = await import("../lib/store.js");
const { getLead } = await import("../lib/crm.js");

const post = (body, ip = "1.1.1.1") => api.POST(new Request("https://altradits.test/api/kits", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));
const get = (q) => api.GET(new Request(`https://altradits.test/api/kits${q}`));
const emails = async () => getMany("email", await listIds("emails", 200));

test("every kit is complete and its offers are real catalog items", () => {
  assert.equal(KITS.length, 6);
  for (const k of KITS) {
    assert.ok(k.files.length >= 1 && k.files[0].type === "pdf", k.id);
    assert.ok(k.files[0].md.length > 2500, `${k.id} guide is substantial`);
    assert.equal(k.nurture.length, 3);
    for (const id of k.done) assert.ok(orderable(id), `${k.id}: ${id} is orderable`);
    // Kit text never hard-codes prices: they come from the catalog.
    for (const n of k.nurture) assert.doesNotMatch(n.text, /\$\d/, `${k.id} nurture has no typed prices`);
  }
  const pub = subs.publicKits();
  const inbox = pub.kits.find((k) => k.id === "inbox");
  assert.equal(inbox.offers.together.price, orderable("hourly").price);
  assert.deepEqual(inbox.offers.done.map((o) => [o.id, o.price]), [["q-inbox-cleanup", orderable("q-inbox-cleanup").price], ["inbox-calendar", orderable("inbox-calendar").price]]);
  assert.equal(pub.ladder.map((l) => l.code).join(" "), "DIY DIT DFY");
});

let sub, files;
test("sign-up: email checked, bots blocked, joins the list as a lead, kit emailed with download links", async () => {
  assert.equal((await post({ kit: "inbox", email: "nope" })).status, 400);
  assert.equal((await post({ kit: "inbox", email: "a@b.co", website: "spam" })).status, 400);
  assert.equal((await post({ kit: "nothing", email: "a@b.co" })).status, 400);
  const r = await (await post({ kit: "inbox", email: "Owner@Shop.co", name: "Amina" })).json();
  sub = r.sub; files = r.files;
  assert.match(files[0].url, /^https:\/\/altradits\.test\/api\/kits\?d=inbox&f=inbox-zero-in-60-minutes\.pdf&s=\w+&t=/);
  const s = await getJSON(`sub:${sub.id}`);
  assert.equal(s.email, "owner@shop.co");
  assert.match(s.kits[0].consent, /Unsubscribe anytime/);
  const lead = await getLead(s.leadId);
  assert.equal(lead.source, "kit:inbox");
  assert.equal(lead.email, "owner@shop.co");
  const mail = (await emails()).find((e) => /Your free kit: Inbox Zero/.test(e.subject));
  assert.match(mail.text, /api\/kits\?d=inbox/);
  assert.match(mail.text, /Do it together \(DIT\)/);
  assert.match(mail.text, /Unsubscribe in one click: https:\/\/altradits\.test\/api\/kits\?unsub=/);
  // A second kit adds an interest, not a second subscriber or lead.
  await post({ kit: "social", email: "owner@shop.co" });
  assert.equal((await listIds("subs")).length, 1);
  assert.deepEqual((await getJSON(`sub:${sub.id}`)).kits.map((k) => k.id), ["inbox", "social"]);
});

test("downloads: a real PDF with the next steps, and the spreadsheet; wrong tokens get nothing", async () => {
  const res = await get(`?d=inbox&f=inbox-zero-in-60-minutes.pdf&s=${sub.id}&t=${sub.t}`);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition"), /inbox-zero-in-60-minutes\.pdf/);
  const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Next steps/);
  assert.match(pdf, /One-time inbox clean-up/);
  const csv = await (await get(`?d=social&f=30-day-content-calendar.csv&s=${sub.id}&t=${sub.t}`)).text();
  assert.equal(csv.trim().split("\n").length, 31);
  assert.match(csv, /^Day,Pillar,Format/);
  assert.match(await (await get(`?d=inbox&f=inbox-zero-in-60-minutes.pdf&s=${sub.id}&t=wrong`)).text(), /not recognised/);
  assert.match(await (await get(`?d=outreach&f=lead-research-sheet.csv&s=${sub.id}&t=${sub.t}`)).text(), /not recognised/); // not signed up for it
});

test("follow-ups: one a day at most, from the newest kit, climbing the ladder, then stop", async () => {
  const s = await getJSON(`sub:${sub.id}`);
  const start = Date.parse(s.kits[1].at);
  const at = (days) => new Date(start + days * 864e5 + 60e3);
  assert.equal((await subs.runNurture(at(1))).sent, 0);
  assert.equal((await subs.runNurture(at(2))).sent, 1);
  assert.equal((await subs.runNurture(at(2.2))).sent, 0); // one a day
  let mail = (await emails()).find((e) => e.subject === "The fastest way to fill your calendar");
  assert.equal(mail.cta.url, "https://altradits.test/?buy=hourly");
  assert.equal((await subs.runNurture(at(5))).sent, 1);
  mail = (await emails()).find((e) => e.subject === "10 captions, done today");
  assert.equal(mail.cta.url, "https://altradits.test/?buy=q-captions");
  assert.equal((await subs.runNurture(at(10))).sent, 1);
  // The social sequence is done; the inbox one (older) continues.
  assert.equal((await subs.runNurture(at(11))).sent, 1);
  assert.ok((await emails()).some((e) => e.subject === "The one inbox habit that sticks"));
});

test("one-click unsubscribe stops all emails", async () => {
  const page = await (await get(`?unsub=${sub.id}&t=${sub.t}`)).text();
  assert.match(page, /You're unsubscribed/);
  const s = await getJSON(`sub:${sub.id}`);
  assert.equal(s.unsubscribed, true);
  assert.equal((await subs.runNurture(new Date(Date.now() + 30 * 864e5))).sent, 0);
  assert.match(await (await get(`?unsub=${sub.id}&t=bad`)).text(), /not recognised/);
  const view = await subs.subscribersView();
  assert.equal(view.unsubscribed, 1);
  assert.match(await subs.subscribersCsv(), /^email,name,kits,joined,unsubscribed,consent\nowner@shop\.co,Amina,inbox social,/);
});

test("every kit's PDF renders", () => {
  for (const k of KITS) for (const f of k.files) {
    const out = subs.renderFile(k, f);
    if (f.type === "pdf") assert.ok(out.body.toString("latin1").startsWith("%PDF"), f.name);
    else assert.ok(out.body.length > 100, f.name);
  }
});

test("departments email from their official addresses, signed by a named AI head, copy stan@, and blind-copy Stanley only for paying clients", async () => {
  const { sendEmail, emailOwner } = await import("../lib/email.js");
  const { COMMS } = await import("../data/team-comms.js");
  const { createLead, saveLead } = await import("../lib/crm.js");
  const by = Object.fromEntries(COMMS.map((c) => [c.id, c]));
  for (const [id, head, address] of [["founder", "Stan", "stan@altradits.com"], ["office", null, "hello@altradits.com"], ["social", "Grace Wanjiru", "social@altradits.com"],
    ["admin", "Daniel Tesfaye", "admin@altradits.com"], ["personal", "Faith Achieng", "assistant@altradits.com"], ["growth", "Samuel Bekele", "care@altradits.com"],
    ["tech", "Brian Otieno", "tech@altradits.com"], ["orders", "Samuel Bekele", "orders@altradits.com"], ["finance", null, "finance@altradits.com"],
    ["trust", null, "trust@altradits.com"], ["marketing", "Hannah Alemu", "marketing@altradits.com"], ["careers", "Daniel Tesfaye", "careers@altradits.com"], ["quality", null, "quality@altradits.com"]]) {
    assert.equal(by[id]?.address, address, id);
    if (head) assert.equal(by[id].head.name, head, id);
  }
  // Stan never sends; every department has named AI staff with a jurisdiction.
  assert.equal(by.founder.sendsAs, false);
  assert.ok(COMMS.every((c) => c.staff.length >= 1 && c.staff.every((s) => s.jurisdiction.length)));
  // Official department addresses; the head's full name signs the email and says they're an AI.
  for (const c of COMMS.filter((x) => x.head.name !== "Stan")) {
    assert.equal(c.signature[0], c.head.name, `${c.id}: signed by the head`);
    assert.match(c.signature[1], /\(AI agent\)/);
    assert.match(c.head.name, /^[A-Z][a-z]+ [A-Z][a-z]+$/, `${c.id}: first and last name`);
  }
  assert.ok(COMMS.every((c) => !/\d{3}[\s-]?\d{3}[\s-]?\d{3}/.test(JSON.stringify(c))), "no phone numbers");

  const lead = await createLead({ email: "client@x.co", source: "order" });
  // Before any deposit: the Front Office sends, stan@ is copied; no blind copy to Stanley.
  const plain = await sendEmail({ to: "client@x.co", leadId: lead.id, subject: "Hello", text: "Hi" });
  assert.equal(plain.from, `${by.office.name} <hello@altradits.com>`);
  assert.equal(plain.cc, "stan@altradits.com");
  assert.equal(plain.bcc, null);
  // stan@ never sends, even if a caller asks for it.
  for (const d of ["founder", "nonsense"]) assert.equal((await sendEmail({ to: "client@x.co", dept: d, subject: "x", text: "x" })).from, `${by.office.name} <hello@altradits.com>`);
  const care = await sendEmail({ to: "client@x.co", leadId: lead.id, dept: "growth", subject: "Your question", text: "Answer" });
  assert.equal(care.from, "Altradits Customer Care <care@altradits.com>");
  assert.equal(care.cc, "stan@altradits.com");
  assert.equal(care.bcc, null);
  // After a deposit: Stanley's inbox gets a blind copy.
  const receipt = await sendEmail({ to: "client@x.co", leadId: lead.id, dept: "orders", paid: true, subject: "Payment received", text: "Thanks" });
  assert.equal(receipt.bcc, "altradits@gmail.com");
  lead.stage = "active"; await saveLead(lead);
  const update = await sendEmail({ to: "client@x.co", leadId: lead.id, dept: "tech", subject: "Staging link", text: "Here" });
  assert.equal(update.from, "Altradits Web & Automation <tech@altradits.com>");
  assert.equal(update.cc, "stan@altradits.com");
  assert.equal(update.bcc, "altradits@gmail.com");
  const owner = await emailOwner("Alert", "x");
  assert.equal(owner.bcc, null); // already going to that inbox
  assert.equal(owner.cc, null);
  const kit = (await emails()).find((e) => /Your free kit/.test(e.subject));
  assert.equal(kit.from, "Altradits <marketing@altradits.com>");
  assert.equal(kit.cc, "stan@altradits.com");
  assert.equal(kit.bcc, null); // a free download isn't a deposit
  // Kit PDFs carry the letterhead.
  const pdf = subs.renderFile(KITS[0], KITS[0].files[0]).body.toString("latin1");
  assert.match(pdf, /\(hello@altradits\.com\) Tj/);
  assert.match(pdf, /\(Page 1 of \d\) Tj/);
});
