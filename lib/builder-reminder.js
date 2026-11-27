// Hourly Builder Path reminder to Stanley (OWNER_EMAIL): what today's task is,
// how the tracker proves it, and how long is left before midnight in Nairobi.
// One email per Nairobi clock hour inside the window (BUILDER_REMINDER_HOURS,
// default "7-21"), only while today's task is still open. The first hour the
// tracker proves the day done, one "done" email, then silence until tomorrow.
// A rest day gets one note in the first hour. BUILDER_REMINDERS=off stops it.
// Plain code: it reads the tracker's own verdict and never marks anything.
import { tracker, trackerCached } from "./tracker.js";
import { claimSlot } from "./jobs.js";
import { getJSON, setJSON } from "./store.js";
import { sendEmail, OWNER_EMAIL } from "./email.js";
import { dayAt } from "../data/builder-path.js";

const TRACKER_URL = "https://altradits.com/tracker";
const CLOCK = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function nairobiClock(now = Date.now()) {
  const p = Object.fromEntries(CLOCK.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

export function reminderWindow(raw = process.env.BUILDER_REMINDER_HOURS) {
  const m = String(raw || "").trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const first = m ? Number(m[1]) : 7, last = m ? Number(m[2]) : 21;
  return first <= last && last <= 23 ? { first, last } : { first: 7, last: 21 };
}

export const remindersOn = (raw = process.env.BUILDER_REMINDERS) =>
  !["off", "false", "no", "0"].includes(String(raw ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase());

const left = ({ hour, minute }) => {
  const mins = (24 - hour) * 60 - minute;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
};

// What to send this hour, or null. Pure: tests drive it with a tracker result.
// kind: "open" (task still to do), "done" (first proof seen), "rest" (Sunday note).
export function reminderFor(builder, clock, { window = reminderWindow(), doneSent = false } = {}) {
  if (!builder || !builder.deliverable || builder.today !== clock.date) return null;
  if (clock.hour < window.first || clock.hour > window.last) return null;
  const d = builder.deliverable;
  const cta = { label: "Open my tracker", url: TRACKER_URL };
  if (d.type === "rest") {
    if (clock.hour !== window.first) return null;
    const next = dayAt(new Date(Date.parse(`${clock.date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10));
    return { kind: "rest", subject: "Builder Path: rest day",
      text: `Today is a rest day. Nothing is due, and rest keeps your streak alive (${builder.streak} days).` +
        (next ? `\n\nTomorrow: ${next.title}.\n${next.what}` : ""), cta };
  }
  const today = (builder.calendar || []).find((c) => c.date === clock.date);
  if (today?.status === "done") {
    if (doneSent) return null;
    return { kind: "done", subject: `Builder Path: today is done (${d.title})`,
      text: `The tracker found your proof for today: ${today.proof?.title || today.provedAs || "done"}${today.proof?.url ? `\n${today.proof.url}` : ""}\n\n` +
        `Streak: ${builder.streak} days. No more reminders today.`, cta };
  }
  const y = builder.yesterday;
  const last = clock.hour === window.last;
  const lines = [
    `Day ${builder.dayNo} of ${builder.of}${builder.phase?.name ? `, ${builder.phase.name}` : ""}: ${d.title}`,
    "", `What to do: ${d.what}`,
    "", `How it counts: ${d.verify}`,
    "", `Time left: ${left(clock)} until midnight in Nairobi.${last ? " This is today's last reminder." : ""}`,
    `Streak: ${builder.streak} days.${y ? ` Yesterday (${y.title}): ${y.verdict}.` : ""}`,
  ];
  if (d.resources?.length) lines.push("", "Resources:", ...d.resources.map((r) => `- ${r.label}: ${r.url}`));
  return { kind: "open", subject: `Builder Path ${String(clock.hour).padStart(2, "0")}:00: ${d.title}`, text: lines.join("\n"), cta };
}

// Called every few minutes by the app (server.mjs). Claims the Nairobi hour
// first, so pings arriving together send one email at most.
export async function maybeSendBuilderReminder(now = Date.now()) {
  if (!remindersOn()) return { sent: false, reason: "off" };
  const clock = nairobiClock(now), window = reminderWindow();
  if (clock.hour < window.first || clock.hour > window.last) return { sent: false, reason: "outside_window" };
  if (!(await claimSlot("builder-reminder", `${clock.date}T${clock.hour}`))) return { sent: false, reason: "already_this_hour" };
  const t = await tracker(now).catch(() => trackerCached());
  const plan = reminderFor(t?.builder, clock, { window, doneSent: await doneAlready(clock.date) });
  if (!plan) return { sent: false, reason: "nothing_due" };
  if (plan.kind === "done") await markDone(clock.date);
  await sendEmail({ to: OWNER_EMAIL, subject: plan.subject, text: plan.text, cta: plan.cta, kind: "owner" });
  return { sent: true, kind: plan.kind };
}

const doneAlready = async (date) => (await getJSON("builder-reminder:done")) === date;
const markDone = (date) => setJSON("builder-reminder:done", date);
