// "Apply with AI": jobs queued from the dashboard are picked up by the Apply
// Agent running on Stanley's Mac (apply-agent/), which drives Chrome to fill
// the application and pauses for Stanley's OK before the final submit.
// This module is the server side: applicant details, the queue, and progress.
import { getJSON, setJSON } from "./store.js";
import { getJob, saveJob, allJobs, getProfile } from "./jobs.js";
import { clean } from "./http.js";

const now = () => new Date().toISOString();
export const APPLY_STATES = ["apply_queued", "applying", "awaiting_submit"];

// The facts application forms ask for. Never IDs, passwords or card numbers.
const FIELDS = {
  fullName: 120, email: 200, phone: 40, city: 80, country: 80, linkedin: 300, github: 300, website: 300,
  workAuthorization: 300, noticePeriod: 120, salaryExpectation: 120, relocate: 120, startDate: 120,
  pronouns: 40, demographics: 200, extra: 4000,
};

export async function getApplicant() {
  return (await getJSON("applicant")) || { demographics: "Prefer not to say" };
}

export async function saveApplicant(input) {
  const a = {};
  for (const [k, n] of Object.entries(FIELDS)) a[k] = clean(input[k], n);
  if (/password|passcode|\bpin\b|card number|cvv|id number|passport/i.test(a.extra)) {
    throw new Error("Don't store passwords, card or ID numbers here. The agent will ask you in the browser if a form needs them.");
  }
  a.demographics ||= "Prefer not to say";
  a.updatedAt = now();
  await setJSON("applicant", a);
  return a;
}

export async function queueApply(id) {
  const j = await getJob(id);
  if (!j) throw new Error("Job not found");
  if (!j.pack) throw new Error("Prepare the application pack first.");
  const a = await getApplicant();
  if (!a.fullName || !a.email || !a.phone) throw new Error("Add your name, email and phone in Applicant details first.");
  j.status = "apply_queued";
  j.apply = { queuedAt: now(), log: [] };
  j.history.push({ at: now(), text: "Queued for the Apply Agent" });
  return saveJob(j);
}

export async function cancelApply(id) {
  const j = await getJob(id);
  if (!j) throw new Error("Job not found");
  if (APPLY_STATES.includes(j.status)) {
    j.status = "ready";
    j.history.push({ at: now(), text: "Apply cancelled" });
    await saveJob(j);
  }
  return j;
}

// The agent polls this: records its heartbeat and claims the next queued job.
export async function claimNext(agentInfo = {}) {
  await setJSON("applyAgent", { lastSeen: now(), version: clean(agentInfo.version, 40), host: clean(agentInfo.host, 80) });
  const next = (await allJobs()).filter((j) => j.status === "apply_queued").sort((a, b) => a.apply.queuedAt.localeCompare(b.apply.queuedAt))[0];
  if (!next) return null;
  next.status = "applying";
  next.apply.startedAt = now();
  next.history.push({ at: now(), text: "Apply Agent started" });
  await saveJob(next);
  const profile = await getProfile();
  return {
    job: { id: next.id, url: next.url, title: next.title, company: next.company },
    pack: next.pack,
    applicant: await getApplicant(),
    hasOriginalCv: Boolean(profile.cvFile),
  };
}

export async function agentStatus() {
  const a = await getJSON("applyAgent");
  return { online: Boolean(a && Date.now() - Date.parse(a.lastSeen) < 60e3), lastSeen: a?.lastSeen || null };
}

// Progress from the agent: notes, the pause before submit, and the outcome.
export async function agentUpdate({ id, status, note, confirmation }) {
  const j = await getJob(clean(id, 40));
  if (!j || !j.apply) throw new Error("Job not found");
  const text = clean(note, 600);
  if (text) {
    j.apply.log.push({ at: now(), text });
    if (j.apply.log.length > 60) j.apply.log = j.apply.log.slice(-60);
  }
  if (status === "awaiting_submit") j.status = "awaiting_submit";
  if (status === "applied") {
    j.status = "applied";
    j.appliedAt = now();
    j.apply.confirmation = clean(confirmation, 1000);
    j.history.push({ at: now(), text: `Applied by the Apply Agent${j.apply.confirmation ? `: ${j.apply.confirmation.slice(0, 120)}` : ""}` });
  }
  if (status === "failed" || status === "blocked") {
    j.status = "ready";
    j.history.push({ at: now(), text: `Apply Agent stopped (${status}): ${text}` });
  }
  return saveJob(j);
}
