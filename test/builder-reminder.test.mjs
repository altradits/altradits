// Hourly Builder Path reminder: one email per Nairobi hour while today's task
// is open, one "done" email, one rest-day note, nothing outside the window.
// Run: node --test test/builder-reminder.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-reminder-")));
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
delete process.env.BUILDER_REMINDER_HOURS;
delete process.env.BUILDER_REMINDERS;

const email = await import("../lib/email.js");
const sent = [];
email.setMailer({ sendMail: async (m) => { sent.push(m); return { messageId: "x" }; } });
const { setJSON } = await import("../lib/store.js");
const { dayAt, phaseAt } = await import("../data/builder-path.js");
const r = await import("../lib/builder-reminder.js");

// 16 Nov 2026 is a Monday log day; 15 Nov is a rest day. Nairobi is UTC+3.
const at = (date, hour, minute = 2) => Date.parse(`${date}T${String(hour - 3).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
const builder = (date, status = "open", extra = {}) => ({
  today: date, dayNo: 8, of: 234, phase: phaseAt(date), deliverable: dayAt(date), streak: 0,
  yesterday: { date: "2026-11-15", title: "Rest", verdict: "rest" },
  calendar: [{ date, type: dayAt(date).type, status, proof: status === "done" ? { title: "days/2026-11-16.md", url: "https://github.com/altradits/builder-log/blob/HEAD/days/2026-11-16.md" } : null }],
  ...extra,
});
const cache = (b, now) => setJSON("tracker:cache", { v: 6, updatedAt: new Date(now).toISOString(), builder: b });

test("Nairobi clock and the window", () => {
  assert.deepEqual(r.nairobiClock(at("2026-11-16", 7, 0)), { date: "2026-11-16", hour: 7, minute: 0 });
  assert.deepEqual(r.nairobiClock(Date.parse("2026-11-16T21:30:00Z")), { date: "2026-11-17", hour: 0, minute: 30 });
  assert.deepEqual(r.reminderWindow(undefined), { first: 7, last: 21 });
  assert.deepEqual(r.reminderWindow("8-20"), { first: 8, last: 20 });
  assert.deepEqual(r.reminderWindow("22-5"), { first: 7, last: 21 }, "a bad window falls back to the default");
  assert.equal(r.remindersOn(undefined), true);
  assert.equal(r.remindersOn("off"), false);
});

test("an open day: the task, how it counts and the time left; nothing outside the window", () => {
  const b = builder("2026-11-16");
  const p = r.reminderFor(b, { date: "2026-11-16", hour: 9, minute: 0 });
  assert.equal(p.kind, "open");
  assert.match(p.subject, /^Builder Path 09:00: Git: history and undo$/);
  assert.ok(p.text.includes(b.deliverable.what) && p.text.includes(b.deliverable.verify));
  assert.match(p.text, /Time left: 15 h 00 min until midnight in Nairobi\./);
  assert.match(r.reminderFor(b, { date: "2026-11-16", hour: 21, minute: 0 }).text, /today's last reminder/);
  assert.equal(r.reminderFor(b, { date: "2026-11-16", hour: 6, minute: 59 }), null);
  assert.equal(r.reminderFor(b, { date: "2026-11-16", hour: 22, minute: 0 }), null);
  assert.equal(r.reminderFor(b, { date: "2026-11-17", hour: 9, minute: 0 }), null, "a tracker result from another day sends nothing");
});

test("a done day sends one confirmation; a rest day one note in the first hour", () => {
  const done = builder("2026-11-16", "done", { streak: 1 });
  const p = r.reminderFor(done, { date: "2026-11-16", hour: 15, minute: 0 });
  assert.equal(p.kind, "done");
  assert.match(p.text, /days\/2026-11-16\.md/);
  assert.equal(r.reminderFor(done, { date: "2026-11-16", hour: 16, minute: 0 }, { doneSent: true }), null);
  const rest = builder("2026-11-15", "rest");
  assert.equal(r.reminderFor(rest, { date: "2026-11-15", hour: 7, minute: 0 }).kind, "rest");
  assert.match(r.reminderFor(rest, { date: "2026-11-15", hour: 7, minute: 0 }).text, /Tomorrow: Git: history and undo/);
  assert.equal(r.reminderFor(rest, { date: "2026-11-15", hour: 8, minute: 0 }), null);
});

test("end to end: one email per hour, a done email once, then silence", async () => {
  sent.length = 0;
  const nine = at("2026-11-16", 9);
  await cache(builder("2026-11-16"), nine);
  const first = await Promise.all([r.maybeSendBuilderReminder(nine), r.maybeSendBuilderReminder(nine + 1000)]);
  assert.equal(first.filter((x) => x.sent).length, 1, "pings arriving together send one email");
  assert.equal((await r.maybeSendBuilderReminder(nine + 40 * 60e3)).reason, "already_this_hour");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email.OWNER_EMAIL);
  assert.match(sent[0].subject, /Builder Path 09:00/);

  const ten = at("2026-11-16", 10);
  await cache(builder("2026-11-16", "done", { streak: 1 }), ten);
  assert.equal((await r.maybeSendBuilderReminder(ten)).kind, "done");
  const eleven = at("2026-11-16", 11);
  await cache(builder("2026-11-16", "done", { streak: 1 }), eleven);
  assert.equal((await r.maybeSendBuilderReminder(eleven)).reason, "nothing_due");
  assert.equal(sent.length, 2);

  assert.equal((await r.maybeSendBuilderReminder(at("2026-11-16", 23))).reason, "outside_window");
  process.env.BUILDER_REMINDERS = "off";
  assert.equal((await r.maybeSendBuilderReminder(at("2026-11-17", 9))).reason, "off");
  delete process.env.BUILDER_REMINDERS;
});
