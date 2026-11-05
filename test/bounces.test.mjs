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
  const hint = await r.json();
  assert.match(hint.error, /Did you mean jo@gmail\.com\?/);
  assert.equal(hint.typoHint, "jo@gmail.com");
  const retry = await send({ ...base, email: "jo@gmial.com", confirmTypo: true });
  assert.equal(retry.status, 402); // confirmed: past the typo gate, only the unpaid invoice stops it
  const ok = await send({ ...base, email: "jo@gmail.com" });
  assert.equal(ok.status, 402); // past the typo gate: only the unpaid invoice stops it
});

test("wallet email entries refuse a typo domain, without naming any wallet", async () => {
  await assert.rejects(yw.setEmail({ id: "nope" }, "a@gmial.com", "https://altradits.test"), /Did you mean a@gmail\.com\?/);
  await assert.rejects(yw.startLogin("a@hotmial.com"), /Did you mean a@hotmail\.com\?/);
  await assert.rejects(yw.requestEmailRecovery("a@yaho.com", "https://altradits.test"), /Did you mean a@yahoo\.com\?/);
  const e = await yw.setEmail({ id: "nope" }, "a@gmial.com", "https://altradits.test").catch((x) => x);
  assert.equal(e.typoHint, "a@gmail.com");
});

test("a confirmed typo address is accepted for the wallet email change", async () => {
  const { setJSON } = store;
  await setJSON("yw:w1", { id: "w1", holdUntil: null, email: null, log: [] });
  const r = await yw.setEmail({ id: "w1" }, "me@gmial.com", "https://altradits.test", { confirmTypo: true });
  assert.deepEqual(r, { emailPending: "me@gmial.com" });
});

test("login and recovery with a confirmed typo reply the same with or without a wallet", async () => {
  const { default: crypto } = await import("node:crypto");
  const { setJSON } = store;
  const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
  await setJSON("yw:w2", { id: "w2", email: "mine@hotmial.com", log: [] });
  await setJSON(`yw:e:${sha("mine@hotmial.com")}`, ["w2"]);
  await setJSON("yw:w3", { id: "w3", email: "theirs@yaho.com", log: [] });
  await setJSON(`yw:e:${sha("theirs@yaho.com")}`, ["w3"]);
  const loginBare = await yw.startLogin("nobody@hotmial.com", { confirmTypo: true });
  const loginHeld = await yw.startLogin("mine@hotmial.com", { confirmTypo: true });
  assert.deepEqual(loginBare, { sent: true });
  assert.deepEqual(loginHeld, loginBare);
  const recBare = await yw.requestEmailRecovery("nobody@yaho.com", "https://altradits.test", { confirmTypo: true });
  const recHeld = await yw.requestEmailRecovery("theirs@yaho.com", "https://altradits.test", { confirmTypo: true });
  assert.deepEqual(recBare, { sent: true });
  assert.deepEqual(recHeld, recBare);
});

test("the wallet API returns the hint and honors the confirmation", async () => {
  const yb = await import("../api/yebente.js");
  const post = (path, body) => yb.POST(new Request(`https://altradits.test/api/yebente/${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const r = await post("wallet/login/start", { email: "a@hotmial.com" });
  assert.equal(r.status, 400);
  const hint = await r.json();
  assert.equal(hint.success, false);
  assert.match(hint.error, /Did you mean a@hotmail\.com\?/);
  assert.equal(hint.typoHint, "a@hotmail.com");
  const retry = await post("wallet/login/start", { email: "a@hotmial.com", confirmTypo: true });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).success, true);
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

test("a daemon notice without a Message-ID falls back to recipient and subject", async () => {
  process.env.MAIL_MARKETING = "marketing-password";
  const confirm = await email.sendEmail({ to: "qansa112@hotmail.com", subject: "Confirm your Ye₿ente email", text: "Here it is", kind: "wallet" });
  const other = await email.sendEmail({ to: "qansa112@hotmail.com", subject: "Your Ye₿ente login code", text: "Code", kind: "wallet" });
  assert.equal(confirm.status, "sent");
  const when = new Date(Date.now() + 30e3);
  const RAW = {
    41: `From: Mail Delivery System <Mailer-Daemon@da40.host-ww.net>\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nThis message was created automatically.\r\n\r\nReporting-MTA: dns; da40.host-ww.net\r\nFinal-Recipient: rfc822;qansa112@hotmail.com\r\nDiagnostic-Code: smtp; 550 5.7.1 [CS] Message\x01 blocked.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: qansa112@hotmail.com\r\nSubject: Confirm your Ye₿ente email\r\n\r\nHere it is\r\n`,
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
  assert.ok(alert.text.includes('(the receiving server said: "550 5.7.1 [CS] Message blocked.")'), "the reason is quoted as the server's words");
  // The same notice is never counted twice.
  assert.deepEqual(await checkBounces(), { checked: 1, bounced: 0 });
  assert.equal(sent.slice(before).filter((m) => /bounced/.test(m.subject)).length, 1);
});

const fakeMailbox = (envelopes, sources) => (b) => ({
  async connect() {},
  async getMailboxLock(name, opts) { return { release() {} }; },
  mailbox: { exists: envelopes.length },
  async search() { return envelopes.map((e) => e.uid); },
  async *fetch() { for (const e of envelopes) yield e; },
  async fetchOne(uid) { return { source: Buffer.from(sources[uid]) }; },
  async logout() {},
});

test("a forged notice from a normal sender is ignored, even with our Message-ID", async () => {
  const m = await email.sendEmail({ to: "victim@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
  assert.match(m.messageId, /^<[^<>]+@altradits\.com>$/);
  assert.equal(sent.at(-1).messageId, m.messageId);
  const when = new Date(Date.now() + 30e3);
  setImapFactory(fakeMailbox(
    [{ uid: 51, envelope: { subject: "Mail delivery failed: returning message to sender", date: when } }],
    { 51: `From: attacker@evil.com\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nFinal-Recipient: rfc822;victim@shop.co\r\nDiagnostic-Code: smtp; 550 You lose, click http://evil.example now.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: victim@shop.co\r\nSubject: Confirm your Ye₿ente email\r\nMessage-ID: ${m.messageId}\r\n\r\nHi\r\n` }));
  const before = sent.length;
  assert.deepEqual(await checkBounces(), { checked: 1, bounced: 0 });
  assert.equal((await store.getJSON(`email:${m.id}`)).status, "sent");
  assert.equal(sent.slice(before).filter((x) => /bounced/.test(x.subject)).length, 0);
});

test("a daemon notice with an unknown Message-ID is ignored", async () => {
  const m = await email.sendEmail({ to: "jo@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
  const when = new Date(Date.now() + 30e3);
  setImapFactory(fakeMailbox(
    [{ uid: 61, envelope: { subject: "Mail delivery failed: returning message to sender", date: when } }],
    { 61: `From: Mail Delivery System <Mailer-Daemon@mail.altradits.com>\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nFinal-Recipient: rfc822;jo@shop.co\r\nDiagnostic-Code: smtp; 550 Mailbox unavailable.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: jo@shop.co\r\nSubject: Confirm your Ye₿ente email\r\nMessage-ID: <never-sent-by-us@example.com>\r\n\r\nHi\r\n` }));
  assert.deepEqual(await checkBounces(), { checked: 1, bounced: 0 });
  assert.equal((await store.getJSON(`email:${m.id}`)).status, "sent");
});

test("a daemon notice with our Message-ID marks that email, by From or Return-Path", async () => {
  const a = await email.sendEmail({ to: "amy@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
  const b = await email.sendEmail({ to: "bob@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
  const when = new Date(Date.now() + 30e3);
  setImapFactory(fakeMailbox(
    [{ uid: 71, envelope: { subject: "Mail delivery failed: returning message to sender", date: when } },
     { uid: 72, envelope: { subject: "Undelivered Mail Returned to Sender", date: when } }],
    { 71: `From: postmaster@mail.altradits.com\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nFinal-Recipient: rfc822;amy@shop.co\r\nDiagnostic-Code: smtp; 552 Quota exceeded.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: amy@shop.co\r\nSubject: Confirm your Ye₿ente email\r\nMessage-ID: ${a.messageId}\r\n\r\nHi\r\n`,
      72: `Return-Path: <MAILER-DAEMON@mail.altradits.com>\r\nFrom: relay-friend@other.net\r\nTo: marketing@altradits.com\r\nSubject: Undelivered Mail Returned to Sender\r\nDate: ${when.toUTCString()}\r\n\r\nFinal-Recipient: rfc822;bob@shop.co\r\nDiagnostic-Code: smtp; 550 No such user.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: bob@shop.co\r\nSubject: Confirm your Ye₿ente email\r\nMessage-ID: ${b.messageId}\r\n\r\nHi\r\n` }));
  assert.deepEqual(await checkBounces(), { checked: 2, bounced: 2 });
  assert.match((await store.getJSON(`email:${a.id}`)).status, /^bounced: 552 Quota exceeded/);
  assert.match((await store.getJSON(`email:${b.id}`)).status, /^bounced: 550 No such user/);
});

test("BOUNCE_DAEMON_HOSTS replaces the trusted daemon hosts", async () => {
  const m = await email.sendEmail({ to: "zoe@shop.co", subject: "Confirm your Ye₿ente email", text: "Hi", kind: "wallet" });
  const when = new Date(Date.now() + 30e3);
  const notice = (uid, from) => ({ uid, envelope: { subject: "Mail delivery failed: returning message to sender", date: when } });
  const sources = {};
  for (const [uid, from] of [[81, "Mailer-Daemon@custom.test"], [82, "Mailer-Daemon@mail.altradits.com"]]) {
    sources[uid] = `From: ${from}\r\nTo: marketing@altradits.com\r\nSubject: Mail delivery failed: returning message to sender\r\nDate: ${when.toUTCString()}\r\n\r\nFinal-Recipient: rfc822;zoe@shop.co\r\nDiagnostic-Code: smtp; 550 Nope.\r\n\r\nFrom: Altradits <hello@altradits.com>\r\nTo: zoe@shop.co\r\nSubject: Confirm your Ye₿ente email\r\nMessage-ID: ${m.messageId}\r\n\r\nHi\r\n`;
  }
  setImapFactory(fakeMailbox([notice(81), notice(82)], sources));
  process.env.BOUNCE_DAEMON_HOSTS = "custom.test";
  try {
    assert.deepEqual(await checkBounces(), { checked: 2, bounced: 1 });
    assert.match((await store.getJSON(`email:${m.id}`)).status, /^bounced: 550 Nope/);
  } finally { delete process.env.BOUNCE_DAEMON_HOSTS; }
});
