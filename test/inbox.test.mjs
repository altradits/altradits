// Department inboxes in the admin (read-only IMAP), with a fake mail server.
// Run: npm test
process.env.EMAIL_APPROVAL = "off"; // these tests check delivery; the approval gate has its own tests
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-inbox-")));
for (const k of Object.keys(process.env)) if (k.startsWith("MAIL_")) delete process.env[k];
process.env.MAIL_CARE = "care-password";
process.env.MAIL_STAN = "wrong";

const inbox = await import("../lib/inbox.js");

const RAW = {
  7: "From: Jo Client <jo@shop.co>\r\nTo: care@altradits.com\r\nSubject: Question about the Core plan\r\nDate: Fri, 23 Oct 2026 10:00:00 +0300\r\n\r\nHi, how many hours does Core include?\r\n",
  8: "From: Someone <x@evil.example>\r\nTo: care@altradits.com\r\nSubject: Urgent invoice\r\nDate: Sat, 24 Oct 2026 09:00:00 +0300\r\n\r\nPay now at https://evil.example/pay\r\n",
};
const opened = [];
inbox.setImapFactory((b) => ({
  async connect() { if (b.id === "stan") { const e = new Error("Authentication failed"); e.authenticationFailed = true; throw e; } },
  async getMailboxLock(name, opts) { opened.push({ box: b.id, name, readOnly: opts?.readOnly }); return { release() {} }; },
  mailbox: { exists: 2 },
  async *fetch() {
    yield { uid: 7, envelope: { subject: "Question about the Core plan", from: [{ name: "Jo Client", address: "jo@shop.co" }], date: new Date("2026-10-23T07:00:00Z") }, flags: new Set(["\\Seen"]) };
    yield { uid: 8, envelope: { subject: "Urgent invoice", from: [{ name: "Someone", address: "x@evil.example" }], date: new Date("2026-10-24T06:00:00Z") }, flags: new Set() };
  },
  async fetchOne(uid) { return { source: Buffer.from(RAW[uid]) }; },
  async logout() {},
}));

test("inboxes: every department listed; unconnected ones say which setting to add; passwords never leave the server", async () => {
  const boxes = await inbox.listInboxes({ fresh: true });
  assert.equal(boxes[0].address, "stan@altradits.com");
  for (const a of ["hello@altradits.com", "care@altradits.com", "orders@altradits.com", "quality@altradits.com"]) assert.ok(boxes.some((b) => b.address === a), a);
  const care = boxes.find((b) => b.id === "care");
  assert.equal(care.connected, true);
  assert.deepEqual(care.messages.map((m) => m.uid), [8, 7]); // newest first
  assert.equal(care.unread, 1);
  const hello = boxes.find((b) => b.id === "hello");
  assert.equal(hello.connected, false);
  assert.equal(hello.env, "MAIL_HELLO");
  assert.match(boxes.find((b) => b.id === "stan").error, /Login failed: check the password in MAIL_STAN/);
  assert.doesNotMatch(JSON.stringify(boxes), /care-password|wrong/);
  // Read-only, always.
  assert.ok(opened.length && opened.every((o) => o.name === "INBOX" && o.readOnly === true));
});

test("reading a message: plain text, and a security warning when it has links", async () => {
  const ok = await inbox.readMessage("care", 7);
  assert.equal(ok.subject, "Question about the Core plan");
  assert.match(ok.from, /jo@shop\.co/);
  assert.match(ok.text, /how many hours does Core include/);
  assert.equal(ok.security, null);
  const bad = await inbox.readMessage("care", 8);
  assert.match(bad.security, /Contains links/);
  await assert.rejects(inbox.readMessage("hello", 1), /isn't connected/);
});
