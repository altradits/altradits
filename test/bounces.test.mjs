// Email typos, test addresses on the live site, and bounced emails marked in
// the admin log (read-only IMAP, with a fake mail server). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-bounces-")));
for (const k of Object.keys(process.env)) if (k.startsWith("MAIL_")) delete process.env[k];
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "RESEND_API_KEY"]) delete process.env[k];

const { emailTypo } = await import("../lib/http.js");
const email = await import("../lib/email.js");
const { findBounces, checkBounces } = await import("../lib/bounces.js");
const { setImapFactory } = await import("../lib/bounces.js");
const store = await import("../lib/store.js");
const { liftDeadman } = await import("../lib/deadman.js");
const contact = await import("../api/contact.js");
const yw = await import("../lib/ywallet.js");

const sent = [];
email.setMailer({ sendMail: async (m) => { sent.push(m); return { messageId: "x" }; } });
await liftDeadman({ by: "stanley", force: true, note: "test isolation" });

test("known domain typos get a suggestion; real domains never do", () => {
  assert.equal(emailTypo("qansa112@homtmail.com"), "qansa112@hotmail.com"); // the #119 bounce
  assert.equal(emailTypo("Jo@GMIAL.com"), "jo@gmail.com");
  assert.equal(emailTypo("a@gmal.com"), "a@gmail.com");
  assert.equal(emailTypo("a@yaho.com"), "a@yahoo.com");
  assert.equal(emailTypo("a@hotmial.com"), "a@hotmail.com");
  assert.equal(emailTypo("a@outlok.com"), "a@outlook.com");
  assert.equal(emailTypo("a@iclod.com"), "a@icloud.com");
  for (const ok of ["jo@gmail.com", "jo@hotmail.com", "jo@shop.co.ke", "jo@altradits.com", "", "nonsense"]) assert.equal(emailTypo(ok), null, ok);
});

test("the contact form refuses a typo domain and says which address was meant", async () => {
  const send = (body) => contact.POST(new Request("https://altradits.test/api/contact",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const base = { step: "send", hash: "0".repeat(64), name: "Jo", topic: "learn", message: "How do I start learning Bitcoin here?" };
  const r = await send({ ...base, email: "jo@gmial.com" });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Did you mean jo@gmail\.com\?/);
  const ok = await send({ ...base, email: "jo@gmail.com" });
  assert.equal(ok.status, 402); // past the typo gate: only the unpaid invoice stops it
});

test("wallet email entries refuse a typo domain, without naming any wallet", async () => {
  await assert.rejects(yw.setEmail({ id: "nope" }, "a@gmial.com", "https://altradits.test"), /Did you mean a@gmail\.com\?/);
  await assert.rejects(yw.startLogin("a@hotmial.com"), /Did you mean a@hotmail\.com\?/);
  await assert.rejects(yw.requestEmailRecovery("a@yaho.com", "https://altradits.test"), /Did you mean a@yahoo\.com\?/);
});

test("on the live site, reserved test addresses are skipped, not sent", async () => {
  const before = sent.length;
  process.env.NODE_ENV = "production";
  try {
    const r = await email.sendEmail({ to: "sam@example.com", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
    assert.equal(r.status, "skipped: test address");
    assert.equal(sent.length, before);
    const real = await email.sendEmail({ to: "client@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
    assert.equal(real.status, "sent");
  } finally { delete process.env.NODE_ENV; }
});

test("without mailbox passwords, the bounce check quietly finds nothing", async () => {
  assert.deepEqual(await findBounces(), []);
  assert.deepEqual(await checkBounces(), { checked: 0, bounced: 0 });
});

test("a bounce notice marks the matching email bounced and tells Stanley once", async () => {
  process.env.MAIL_MARKETING = "marketing-password";
  const confirm = await email.sendEmail({ to: "qansa112@hotmail.com", subject: "Confirm your Ye₿ente email", text: "Here it is", kind: "wallet" });
  const other = await email.sendEmail({ to: "qansa112@hotmail.com", subject: "Your Ye₿ente login code", text: "Code", kind: "wallet" });
  assert.equal(confirm.status, "sent");
  const when = new Date(Date.now() + 30e3);
  const RAW = {
    41: `From: Mail Delivery System <Mailer-Daemon@da40.host-ww.net>\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nThis message was created automatically.\r\n\r\nReporting-MTA: dns; da40.host-ww.net\r\nFinal-Recipient: rfc822;qansa112@hotmail.com\r\nDiagnostic-Code: smtp; 550 5.7.1 [CS] Message blocked.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: qansa112@hotmail.com\r\nSubject: Confirm your Ye₿ente email\r\n\r\nHere it is\r\n`,
    42: `From: Jo <jo@shop.co>\r\nTo: marketing@altradits.com\r\nSubject: Question\r\nDate: ${when.toUTCString()}\r\n\r\nHello\r\n`,
  };
  const opened = [];
  setImapFactory((b) => ({
    async connect() {},
    async getMailboxLock(name, opts) { opened.push(opts?.readOnly); return { release() {} }; },
    mailbox: { exists: 2 },
    async search() { return [41, 42]; },
    async *fetch() {
      yield { uid: 41, envelope: { subject: "Mail delivery failed: returning message to sender", date: when } };
      yield { uid: 42, envelope: { subject: "Question", date: when } };
    },
    async fetchOne(uid) { return { source: Buffer.from(RAW[uid]) }; },
    async logout() {},
  }));
  const before = sent.length;
  const r = await checkBounces();
  assert.deepEqual(r, { checked: 1, bounced: 1 });
  assert.match((await store.getJSON(`email:${confirm.id}`)).status, /^bounced: 550 5\.7\.1 \[CS\] Message blocked/);
  assert.equal((await store.getJSON(`email:${other.id}`)).status, "sent"); // the subject decides which one bounced
  assert.ok(opened.every((ro) => ro === true)); // read-only
  const alert = sent.slice(before).find((m) => /bounced/.test(m.subject));
  assert.match(alert.subject, /\[Action needed\] 1 email bounced/);
  // The same notice is never counted twice.
  assert.deepEqual(await checkBounces(), { checked: 1, bounced: 0 });
  assert.equal(sent.slice(before).filter((m) => /bounced/.test(m.subject)).length, 1);
});
