// Email typos, test addresses on the live site, and bounced emails marked in
// the admin log (read-only IMAP, with a fake mail server). Run: npm test
process.env.EMAIL_APPROVAL = "off";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-bounces-")));
for (const k of Object.keys(process.env)) if (k.startsWith("MAIL_")) delete process.env[k];
process.env.MAIL_MARKETING = "marketing-password";

const { emailTypo } = await import("../lib/http.js");
const email = await import("../lib/email.js");
const inbox = await import("../lib/inbox.js");
const { checkBounces } = await import("../lib/bounces.js");
const store = await import("../lib/store.js");

const sent = [];
email.setMailer({ sendMail: async (m) => { sent.push(m); return { messageId: "x" }; } });

test("known domain typos get a suggestion; real domains never do", () => {
  assert.equal(emailTypo("qansa112@homtmail.com"), "qansa112@hotmail.com");
  assert.equal(emailTypo("Jo@GMIAL.com"), "jo@gmail.com");
  for (const ok of ["jo@gmail.com", "jo@hotmail.com", "jo@shop.co.ke", "jo@altradits.com", "", "nonsense"]) assert.equal(emailTypo(ok), null, ok);
});

test("the kit form refuses a typo domain and says which address was meant", async () => {
  const { subscribe } = await import("../lib/subscribers.js");
  const { KITS } = await import("../data/templates.js");
  const r = await subscribe({ email: "qansa112@homtmail.com", kit: KITS[0].id, ip: "1.2.3.4" });
  assert.equal(r.status, 400);
  assert.match(r.error, /Did you mean qansa112@hotmail\.com\?/);
});

test("on the live site, reserved test addresses are skipped, not sent", async () => {
  const before = sent.length;
  process.env.NODE_ENV = "production";
  try {
    const r = await email.sendEmail({ to: "sam@example.com", subject: "Any questions about your proposal?", text: "Hi", kind: "payment" });
    assert.equal(r.status, "skipped: test address");
    assert.equal(sent.length, before);
    const real = await email.sendEmail({ to: "client@shop.co", subject: "Receipt", text: "Hi", kind: "payment" });
    assert.equal(real.status, "sent");
  } finally { delete process.env.NODE_ENV; }
});

test("a bounce notice marks the matching email bounced and tells Stanley once", async () => {
  const kit = await email.sendEmail({ to: "qansa112@hotmail.com", subject: "Your free kit: 30-Day Social Media Content Kit", text: "Here it is", kind: "delivery", dept: "marketing" });
  const other = await email.sendEmail({ to: "qansa112@hotmail.com", subject: "Confirm to get your kit", text: "Confirm", kind: "delivery", dept: "marketing" });
  assert.equal(kit.status, "sent");
  const when = new Date(Date.now() + 30e3);
  const RAW = {
    41: `From: Mail Delivery System <Mailer-Daemon@da40.host-ww.net>\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nThis message was created automatically.\r\n\r\nReporting-MTA: dns; da40.host-ww.net\r\nFinal-Recipient: rfc822;qansa112@hotmail.com\r\nDiagnostic-Code: smtp; 550 5.7.1 [CS] Message blocked.\r\n\r\nFrom: Altradits <marketing@altradits.com>\r\nTo: qansa112@hotmail.com\r\nSubject: Your free kit: 30-Day Social Media Content Kit\r\n\r\nHere it is\r\n`,
    42: `From: Jo <jo@shop.co>\r\nTo: marketing@altradits.com\r\nSubject: Question\r\nDate: ${when.toUTCString()}\r\n\r\nHello\r\n`,
  };
  const opened = [];
  inbox.setImapFactory((b) => ({
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
  assert.match((await store.getJSON(`email:${kit.id}`)).status, /^bounced: 550 5\.7\.1 \[CS\] Message blocked/);
  assert.equal((await store.getJSON(`email:${other.id}`)).status, "sent"); // the subject decides which one bounced
  assert.ok(opened.every((ro) => ro === true)); // read-only
  const alert = sent.slice(before).find((m) => /bounced/.test(m.subject));
  assert.match(alert.subject, /\[Action needed\] 1 email bounced/);
  // The same notice is never counted twice.
  assert.deepEqual(await checkBounces(), { checked: 1, bounced: 0 });
  assert.equal(sent.slice(before).filter((m) => /bounced/.test(m.subject)).length, 1);
});
