// Continual Learning & Collective Intelligence Engine (Ruflo ReasoningBank + SONA):
//   1. RETRIEVE    -> BM25/tag-weighted retrieval of department rules, 5★ gold
//                     exemplars, client preferences, QA escape checks & Answer Bank
//   2. JUDGE       -> Trajectory & reward recording across QA rounds, client ratings,
//                     revisions (QA escapes), and Stanley's edits/overrides
//   3. DISTILL     -> Zero-latency extraction of rules, anti-patterns, QA escape
//                     criteria, client preferences, and reusable Q&A answers
//   4. CONSOLIDATE -> EWC++ importance weighting (preserving repeat & Stanley-pinned
//                     rules while decaying stale noise) + Daily/Weekly digests
import { getJSON, setJSON, pushId, listIds, getMany } from "./store.js";
import { newId, clean } from "./http.js";
import { screen } from "./screen.js";
import { COMMS, INTERNAL } from "../data/team-comms.js";
import { DEPARTMENTS, findDepartment } from "../data/playbooks.js";
import { findService, QUICK_JOBS } from "../data/catalog.js";

const now = () => new Date().toISOString();

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "have", "are", "was", "were",
  "will", "would", "could", "should", "into", "about", "after", "before", "when", "where",
  "what", "which", "their", "there", "been", "make", "made", "just", "more", "some", "such",
  "than", "then", "them", "they", "only", "also", "very", "much", "each", "every", "task",
  "work", "client", "please", "need", "needs", "ensure", "always", "never", "must",
]);

export function tokenize(text) {
  return [...new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^-+|-+$/g, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  )].slice(0, 40);
}

function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// ---------------------------------------------------------------- specialist routing
// Maps every catalog service, quick job, and task to its named Department Head
// and Specialist from data/team-comms.js.
const SERVICE_SPECIALIST = {
  // Social & Content (Head: Grace Wanjiru)
  "content-writing": { dept: "social", staffName: "Mary Njeri" },
  "short-video": { dept: "social", staffName: "Kevin Odhiambo" },
  "social-management": { dept: "social", staffName: "Ann Abebe" },
  // Operations & Admin (Head: Daniel Tesfaye)
  "inbox-calendar": { dept: "admin", staffName: "Lucy Kariuki" },
  "data-docs": { dept: "admin", staffName: "Martin Kebede" },
  "bookkeeping-prep": { dept: "admin", staffName: "Rose Chebet" },
  "project-coordination": { dept: "admin", staffName: "Thomas Negash" },
  "hr-recruiting": { dept: "admin", staffName: "Thomas Negash" },
  // Executive & Personal (Head: Faith Achieng)
  "travel-life": { dept: "personal", staffName: "Sarah Wambui" },
  "executive-assist": { dept: "personal", staffName: "Naomi Ayele" },
  "events": { dept: "personal", staffName: "Michael Desta" },
  // Customer Care & Growth (Head: Samuel Bekele)
  "customer-support": { dept: "growth", staffName: "Ivy Mutua" },
  "ecommerce-ops": { dept: "growth", staffName: "Ivy Mutua" },
  "host-assist": { dept: "growth", staffName: "Ivy Mutua" },
  "lead-generation": { dept: "growth", staffName: "David Wolde" },
  "research": { dept: "growth", staffName: "David Wolde" },
  // Web, Automation & Bitcoin (Head: Brian Otieno)
  "website": { dept: "tech", staffName: "George Kiprop" },
  "store-payments": { dept: "tech", staffName: "George Kiprop" },
  "automation-ai": { dept: "tech", staffName: "Victor Assefa" },
  "translation": { dept: "tech", staffName: "Victor Assefa" },
  "bitcoin": { dept: "tech", staffName: "Nathan Getachew" },
};

export function specialistForTask(task = {}) {
  const deptId = task.department || findDepartment(task.department)?.id || "admin";
  const comm = COMMS.find((c) => c.id === deptId) || COMMS.find((c) => c.id === "admin");
  let svc = task.service || "";
  if (svc.startsWith("q-")) svc = QUICK_JOBS.find((q) => q.id === svc)?.service || svc;
  const text = `${task.title || ""} ${task.details || ""}`.toLowerCase();
  if (!svc) {
    if (/blog|article|newsletter|copy|case study|bio\b/.test(text) && deptId === "social") svc = "content-writing";
    else if (/reel|tiktok|short|video|script|subtitle|srt/.test(text) && deptId === "social") svc = "short-video";
    else if (/invoice|receipt|bookkeep|expense|reconcil/.test(text) && deptId === "admin") svc = "bookkeeping-prep";
    else if (/sheet|spreadsheet|slide|deck|pdf|sop|form/.test(text) && deptId === "admin") svc = "data-docs";
    else if (/recruit|candidate|job ad|cv|project|action item/.test(text) && deptId === "admin") svc = "project-coordination";
    else if (/flight|hotel|itinerary|travel|visa|booking/.test(text) && deptId === "personal") svc = "travel-life";
    else if (/event|venue|offsite|workshop|dinner/.test(text) && deptId === "personal") svc = "events";
    else if (/lead|outreach|competitor|prospect|research/.test(text) && deptId === "growth") svc = "lead-generation";
    else if (/bitcoin|lightning|lnd|wallet|sats|lnurl|nostr/.test(text) && deptId === "tech") svc = "bitcoin";
    else if (/zapier|make\.com|workflow|automation|translat|transcri/.test(text) && deptId === "tech") svc = "automation-ai";
    else if (/website|landing|page|css|html|shopify|woocommerce|checkout/.test(text) && deptId === "tech") svc = "website";
  }
  const mappedName = SERVICE_SPECIALIST[svc]?.staffName;
  const specialist = comm.staff.find((s) => s.name === mappedName) || comm.staff[0] || { name: comm.head.name, title: comm.head.title, jurisdiction: comm.purpose };
  return {
    dept: deptId,
    service: svc || null,
    head: comm.head,
    specialist,
    address: comm.address,
    voice: comm.voice,
    never: comm.never || [],
  };
}

// ---------------------------------------------------------------- storage helpers
const defaultPlaybook = (dept) => ({
  dept,
  updatedAt: now(),
  version: 1,
  rules: [],
  exemplars: [],
  metrics: { tasksTotal: 0, firstPassQa: 0, qaRejections: 0, clientRevisions: 0, ratingsSum: 0, ratingsCount: 0, stanleyOverrides: 0 },
});

export async function getLearnedPlaybook(dept) {
  return (await getJSON(`learn:playbook:${dept}`)) || defaultPlaybook(dept);
}

export async function saveLearnedPlaybook(pb) {
  pb.updatedAt = now();
  await setJSON(`learn:playbook:${pb.dept}`, pb);
  return pb;
}

export async function getLearnedQa(expertId) {
  return (await getJSON(`learn:qa:${expertId}`)) || { expertId, updatedAt: now(), dynamicChecklist: [] };
}

export async function saveLearnedQa(qaRec) {
  qaRec.updatedAt = now();
  await setJSON(`learn:qa:${qaRec.expertId}`, qaRec);
  return qaRec;
}

export async function getAnswerBank() {
  return (await getJSON("learn:answers")) || { updatedAt: now(), items: [] };
}

export async function saveAnswerBank(bank) {
  bank.updatedAt = now();
  await setJSON("learn:answers", bank);
  return bank;
}

// ---------------------------------------------------------------- 1. RETRIEVE
export async function retrieveMemory({ dept = "admin", service = "", text = "", lead = null, expertIds = [] } = {}) {
  const pb = await getLearnedPlaybook(dept);
  const queryTokens = tokenize(`${service} ${text}`);
  const qSet = new Set(queryTokens);

  const scoredRules = (pb.rules || [])
    .map((r) => {
      const overlap = (r.keywords || []).filter((k) => qSet.has(k)).length;
      const score = (r.pinned ? 5 : 0) + (service && r.service === service ? 4 : 0) + overlap * 2 + (r.weight || 0.5) * 3 + Math.min(3, (r.occurrences || 1) * 0.5);
      return { ...r, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 6);

  const scoredExemplars = (pb.exemplars || [])
    .map((ex) => {
      const overlap = (ex.keywords || []).filter((k) => qSet.has(k)).length;
      const score = (service && ex.service === service ? 4 : 0) + overlap * 2;
      return { ...ex, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 2);

  const clientPrefs = Array.isArray(lead?.onboarding?.learned) ? lead.onboarding.learned.slice(-8) : [];

  const qaCriteria = {};
  for (const id of expertIds) {
    const rec = await getLearnedQa(id);
    if (rec.dynamicChecklist?.length) {
      qaCriteria[id] = [...rec.dynamicChecklist]
        .map((c) => {
          const overlap = tokenize(c.criterion).filter((k) => qSet.has(k)).length;
          return { ...c, _score: (c.escapes || 0) * 3 + (c.weight || 0.5) + overlap * 2 };
        })
        .sort((a, b) => b._score - a._score || String(b.updatedAt || b.lastSeenAt || "").localeCompare(String(a.updatedAt || a.lastSeenAt || "")))
        .slice(0, 3)
        .map((c) => c.criterion);
    }
  }

  const answers = await retrieveAnswers({ dept, text, limit: 4 });

  const lines = [];
  if (scoredRules.length) {
    lines.push(`\nCOLLECTIVE MEMORY — LEARNED DEPARTMENT RULES (distilled from past QA reviews, client feedback & Stanley's guidance — follow strictly):`);
    for (const r of scoredRules) lines.push(`- ${r.rule}${r.antiPattern ? ` (Avoid: ${r.antiPattern})` : ""}`);
  }
  if (scoredExemplars.length) {
    lines.push(`\nGOLD EXEMPLARS (5★ deliverables clients loved in this department):`);
    for (const ex of scoredExemplars) lines.push(`- "${ex.title}" (${ex.structure}): ${ex.whyClientLovedIt}`);
  }
  return {
    rules: scoredRules,
    exemplars: scoredExemplars,
    clientPrefs,
    qaCriteria,
    answers,
    promptBlock: lines.join("\n"),
  };
}

export async function retrieveAnswers(queryOrOpts = {}, maybeOpts = {}) {
  const opts = typeof queryOrOpts === "string" ? { ...maybeOpts, text: queryOrOpts } : (queryOrOpts || {});
  const { dept = "", text = "", limit = 5 } = opts;
  const bank = await getAnswerBank();
  if (!bank.items?.length) return [];
  const qSet = new Set(tokenize(text));
  return bank.items
    .map((item) => {
      const overlap = (item.keywords || []).filter((k) => qSet.has(k)).length;
      const deptMatch = dept && item.dept === dept ? 2 : 0;
      const qText = item.question || item.questionPattern || "";
      const aText = item.answer || item.approvedAnswer || "";
      return { ...item, question: qText, answer: aText, _score: overlap * 2 + deptMatch + Math.min(2, (item.hits || 1) * 0.2) };
    })
    .filter((i) => i._score > 0 || !qSet.size)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

// ---------------------------------------------------------------- 2. JUDGE & 3. DISTILL
function scrubPii(str) {
  return String(str || "")
    .replace(/^\s*(?:hi|hello|dear|hey)\s+[^,\n]{1,40},\s*/i, "")
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]{2,}\b/g, "[email]")
    .trim();
}

function upsertRule(pb, { rule, antiPattern = "", service = null, specialist = "", source = "qa_reject", weight = 0.75, pinned = false }) {
  const text = clean(scrubPii(rule), 320);
  if (!text || text.length < 10 || screen(text).flagged) return null;
  const tokens = tokenize(text);
  const existing = pb.rules.find((r) => r.rule.toLowerCase() === text.toLowerCase() || (tokens.length >= 3 && jaccard(tokens, r.keywords || []) >= 0.55));
  if (existing) {
    existing.occurrences = (existing.occurrences || 1) + 1;
    existing.weight = Math.min(1, Math.max(existing.weight || 0.7, weight) + 0.08);
    if (pinned || existing.occurrences >= 3 || source === "stanley_override") existing.pinned = true;
    if (antiPattern && !existing.antiPattern) existing.antiPattern = clean(antiPattern, 160);
    existing.lastSeenAt = now();
    return existing;
  }
  const entry = {
    id: `rule_${newId(8)}`,
    service: service || null,
    specialist: specialist || "",
    rule: text,
    antiPattern: clean(antiPattern, 160),
    source,
    occurrences: 1,
    weight: Math.max(0.5, Math.min(1, weight)),
    pinned: Boolean(pinned || source === "stanley_override"),
    keywords: tokens,
    firstSeenAt: now(),
    lastSeenAt: now(),
  };
  pb.rules.push(entry);
  if (pb.rules.length > 35) {
    pb.rules.sort((a, b) => (b.pinned ? 2 : 0) + b.weight - ((a.pinned ? 2 : 0) + a.weight));
    pb.rules = pb.rules.slice(0, 30);
  }
  pb.version = (pb.version || 1) + 1;
  return entry;
}

async function upsertQaCriterion(expertId, { criterion, reason = "", escape = false }) {
  const text = clean(criterion, 260);
  if (!text || text.length < 8 || screen(text).flagged) return null;
  const rec = await getLearnedQa(expertId);
  const tokens = tokenize(text);
  const existing = rec.dynamicChecklist.find((c) => c.criterion.toLowerCase() === text.toLowerCase() || (tokens.length >= 3 && jaccard(tokens, c.keywords || []) >= 0.55));
  if (existing) {
    if (escape) existing.escapes = (existing.escapes || 0) + 1;
    else existing.rejections = (existing.rejections || 0) + 1;
    existing.weight = Math.min(1, (existing.weight || 0.75) + (escape ? 0.15 : 0.05));
    existing.updatedAt = now();
  } else {
    rec.dynamicChecklist.push({
      id: `qac_${newId(8)}`,
      criterion: text,
      reason: clean(reason, 200),
      escapes: escape ? 1 : 0,
      rejections: escape ? 0 : 1,
      weight: escape ? 0.92 : 0.78,
      keywords: tokens,
      updatedAt: now(),
    });
    if (rec.dynamicChecklist.length > 15) {
      rec.dynamicChecklist.sort((a, b) => (b.escapes || 0) * 3 + b.weight - ((a.escapes || 0) * 3 + a.weight));
      rec.dynamicChecklist = rec.dynamicChecklist.slice(0, 12);
    }
  }
  await saveLearnedQa(rec);
  return rec;
}

export async function recordAnswer({ dept = "office", question = "", answer = "", source = "stanley_approved" }) {
  const q = clean(scrubPii(question), 260), a = clean(scrubPii(answer), 600);
  if (!q || !a || a.length < 15 || screen(q).flagged || screen(a).flagged) return null;
  const bank = await getAnswerBank();
  const tokens = tokenize(`${q} ${a}`);
  const existing = bank.items.find((i) => jaccard(tokens, i.keywords || []) >= 0.6);
  if (existing) {
    existing.approvedAnswer = a;
    existing.hits = (existing.hits || 1) + 1;
    existing.at = now();
  } else {
    bank.items.unshift({
      id: `ans_${newId(8)}`,
      dept: dept || "office",
      questionPattern: q,
      approvedAnswer: a,
      keywords: tokens,
      source,
      hits: 1,
      at: now(),
    });
    if (bank.items.length > 60) bank.items = bank.items.slice(0, 60);
  }
  await saveAnswerBank(bank);
  return bank;
}

export async function distillClientPreference(lead, rawNote, saveLeadFn = null) {
  if (!lead || !rawNote) return null;
  const note = clean(rawNote, 220).trim();
  if (note.length < 6 || screen(note).flagged) return null;
  if (/password|passcode|\bpin\b|seed phrase|private key|card number|cvv/i.test(note)) return null;
  lead.onboarding = lead.onboarding || {};
  const list = Array.isArray(lead.onboarding.learned) ? lead.onboarding.learned : [];
  const tokens = tokenize(note);
  if (list.some((x) => x.toLowerCase() === note.toLowerCase() || (tokens.length >= 3 && jaccard(tokens, tokenize(x)) >= 0.7))) return list;
  list.push(note);
  lead.onboarding.learned = list.slice(-12);
  if (saveLeadFn) await saveLeadFn(lead);
  return lead.onboarding.learned;
}

export async function recordOutcome(event = {}) {
  const task = event.task || null;
  const source = event.source || event.kind || "task";
  const spec = specialistForTask(task || { department: event.dept, service: event.service, title: event.title, details: event.summary });
  const dept = event.dept || spec.dept || "admin";
  const service = event.service || spec.service || task?.service || null;
  const pb = await getLearnedPlaybook(dept);

  let reward = typeof event.reward === "number" ? event.reward : 0.5;
  let verdict = event.verdict || "partial";
  const distilledIds = [];

  if (source === "qa_first_pass") {
    reward = 0.75;
    verdict = "success";
    pb.metrics.tasksTotal = (pb.metrics.tasksTotal || 0) + 1;
    pb.metrics.firstPassQa = (pb.metrics.firstPassQa || 0) + 1;
  } else if (source === "qa_reject" || source === "stan_reject") {
    reward = 0.3;
    verdict = "failure";
    pb.metrics.qaRejections = (pb.metrics.qaRejections || 0) + 1;
    const rawItems = [...(event.failedCriteria || []), ...(event.issues || [])];
    for (const fc of rawItems) {
      if (typeof fc === "string") {
        const r = upsertRule(pb, { rule: fc, service, specialist: event.specialist || spec.specialist.name, source, weight: 0.82 });
        if (r) distilledIds.push(r.id);
      } else if (fc && typeof fc === "object") {
        const ruleText = fc.fix ? `${fc.criterion}: ${fc.fix}` : fc.criterion;
        const r = upsertRule(pb, { rule: ruleText, antiPattern: fc.criterion, service, specialist: event.specialist || spec.specialist.name, source, weight: 0.8 });
        if (r) distilledIds.push(r.id);
        if (fc.expertId) await upsertQaCriterion(fc.expertId, { criterion: fc.criterion, reason: fc.fix || "QA rejection", escape: false });
      }
    }
  } else if (source === "client_revision" || source === "client_changes") {
    reward = 0.25;
    verdict = "failure";
    pb.metrics.clientRevisions = (pb.metrics.clientRevisions || 0) + 1;
    const note = clean(event.note, 280);
    if (note) {
      const r = upsertRule(pb, {
        rule: `Verify before handover: ${note}`,
        antiPattern: `Delivering without checking: ${note}`,
        service,
        specialist: event.specialist || spec.specialist.name,
        source: "client_revision",
        weight: 0.9,
        pinned: true,
      });
      if (r) distilledIds.push(r.id);
      // QA Escape: every expert on the task's panel who passed it learns this check!
      const panelIds = (task?.qa?.panel || []).map((p) => p.id);
      const targets = panelIds.length ? panelIds : ["reality-checker", "copy-editor"];
      for (const expId of targets) {
        await upsertQaCriterion(expId, {
          criterion: `Check client-reported gap: ${note}`,
          reason: `Client requested revision on "${clean(task?.title || event.title, 80) || "task"}" after QA pass`,
          escape: true,
        });
      }
    }
  } else if (source === "client_rating" || source === "client_approve") {
    const rating = Number(event.rating) || 0;
    const comment = clean(event.comment, 260);
    pb.metrics.tasksTotal = (pb.metrics.tasksTotal || 0) + 1;
    if (rating >= 1 && rating <= 5) {
      pb.metrics.ratingsSum = (pb.metrics.ratingsSum || 0) + rating;
      pb.metrics.ratingsCount = (pb.metrics.ratingsCount || 0) + 1;
    }
    if (rating >= 4) {
      reward = rating === 5 ? 1.0 : 0.85;
      verdict = "success";
      if (rating === 5) {
        pb.metrics.clientApproved5 = (pb.metrics.clientApproved5 || 0) + 1;
        const delivFiles = task?.deliverable?.files || event.files || [];
        const delivTitle = task?.deliverable?.title || task?.title || event.title || "Deliverable";
        const files = delivFiles.map((f) => f.name).join(", ") || (task?.deliverable?.url ? "external link" : "notes");
        const ex = {
          id: `ex_${newId(8)}`,
          service,
          title: clean(delivTitle, 120),
          structure: `files: [${files}]`,
          whyClientLovedIt: comment ? `Client rated 5/5: "${comment}"` : `Client rated 5/5 on "${clean(delivTitle, 80)}"`,
          keywords: tokenize(`${delivTitle} ${service} ${comment} ${event.summary || ""}`),
          at: now(),
        };
        pb.exemplars = [ex, ...(pb.exemplars || []).filter((x) => x.title !== ex.title)].slice(0, 8);
      }
    } else {
      reward = Math.max(0, (rating - 1) * 0.15);
      verdict = "failure";
      if (comment) {
        const r = upsertRule(pb, {
          rule: `Prevent low client satisfaction (${rating}/5): address "${comment}" before delivery`,
          service,
          specialist: event.specialist || spec.specialist.name,
          source: "client_rating",
          weight: 0.92,
          pinned: true,
        });
        if (r) distilledIds.push(r.id);
        await upsertQaCriterion("reality-checker", {
          criterion: `Prevent repeat ${rating}★ feedback: ${comment}`,
          reason: `Low rating (${rating}/5) on ${clean(task?.title || event.title, 80) || "deliverable"}`,
          escape: true,
        });
      }
    }
  } else if (["stanley_override", "email_edit", "stanley_email_edit", "proposal_edit", "marketing_edit", "escalation_resolved"].includes(source)) {
    pb.metrics.stanleyOverrides = (pb.metrics.stanleyOverrides || 0) + 1;
    const approved = event.approve ?? event.approved ?? true;
    reward = approved === false ? 0.15 : 0.5;
    verdict = approved === false ? "failure" : "partial";
    const note = clean(event.note || event.summary, 280);
    if (note) {
      const r = upsertRule(pb, {
        rule: `Stanley's directive: ${note}`,
        service,
        specialist: event.specialist || spec.specialist.name,
        source: "stanley_override",
        weight: 0.96,
        pinned: true,
      });
      if (r) distilledIds.push(r.id);
    }
    const origText = event.originalText || event.original?.text || "";
    const editText = event.editedText || event.edited?.text || event.answer || "";
    const origSubj = event.originalSubject || event.original?.subject || event.question || "";
    const editSubj = event.editedSubject || event.edited?.subject || origSubj;
    if ((source === "email_edit" || source === "stanley_email_edit") && approved && editText && origText && editText.trim() !== origText.trim()) {
      const r = upsertRule(pb, {
        rule: `Email style correction from Stanley on "${clean(editSubj, 80)}": keep wording concise and direct like "${clean(editText, 160)}"`,
        service,
        specialist: spec.head.name,
        source: "stanley_override",
        weight: 0.9,
        pinned: true,
      });
      if (r) distilledIds.push(r.id);
    }
    if (approved && editText && origSubj) {
      await recordAnswer({
        dept,
        question: editSubj,
        answer: editText,
        source: source === "escalation_resolved" ? "stanley_escalation" : "stanley_approved_email",
      });
    }
  }

  await saveLearnedPlaybook(pb);

  const traj = {
    id: `tr_${newId(10)}`,
    at: now(),
    dept,
    service,
    specialist: event.specialist || spec.specialist.name,
    head: spec.head.name,
    taskId: task?.id || event.taskId || null,
    leadId: task?.leadId || event.leadId || null,
    source,
    verdict,
    reward,
    summary: clean(event.summary || event.note || event.comment || task?.title || event.title || source, 240),
    distilledRuleIds: distilledIds,
  };
  await setJSON(`learn:traj:${traj.id}`, traj);
  await pushId("learn:trajs", traj.id);
  return { traj, playbook: pb };
}

// ---------------------------------------------------------------- 4. CONSOLIDATE (EWC++)
const LEARN_DEPTS = [...new Set([...DEPARTMENTS.map((d) => d.id), "marketing", "office", "careers"])];

export async function consolidateLearning({ dept = null } = {}) {
  const depts = dept ? [dept] : LEARN_DEPTS;
  const nowMs = Date.now();
  const consolidated = [];

  for (const d of depts) {
    const pb = await getLearnedPlaybook(d);
    const merged = [];
    for (const r of pb.rules || []) {
      const tokens = r.keywords?.length ? r.keywords : tokenize(r.rule);
      const match = merged.find((m) => jaccard(tokens, m.keywords || []) >= 0.55);
      if (match) {
        match.occurrences = (match.occurrences || 1) + (r.occurrences || 1);
        match.weight = Math.min(1, Math.max(match.weight, r.weight) + 0.05);
        match.pinned = Boolean(match.pinned || r.pinned || match.occurrences >= 3);
        if (r.rule.length > match.rule.length && r.source === "stanley_override") match.rule = r.rule;
      } else {
        const ageDays = (nowMs - Date.parse(r.lastSeenAt || r.firstSeenAt || now())) / 864e5;
        let w = r.weight || 0.7;
        const isCore = Boolean(r.pinned || r.source === "stanley_override" || (r.occurrences || 1) >= 3);
        if (isCore) {
          // EWC++ importance floor: core institutional rules never decay below 0.85
          w = Math.max(0.85, w);
        } else if (ageDays > 30) {
          w = Math.round(w * 0.9 * 100) / 100;
        }
        if (w >= 0.25) merged.push({ ...r, pinned: isCore, weight: w, keywords: tokens });
      }
    }
    merged.sort((a, b) => (b.pinned ? 2 : 0) + b.weight + Math.min(1, (b.occurrences || 1) * 0.1) - ((a.pinned ? 2 : 0) + a.weight + Math.min(1, (a.occurrences || 1) * 0.1)));
    pb.rules = merged.slice(0, 25);
    await saveLearnedPlaybook(pb);
    consolidated.push({ dept: d, rules: pb.rules.length, exemplars: (pb.exemplars || []).length });
  }
  const bank = await getAnswerBank();
  return {
    at: now(),
    rules: consolidated.reduce((n, c) => n + c.rules, 0),
    exemplars: consolidated.reduce((n, c) => n + c.exemplars, 0),
    answers: (bank.items || []).length,
    departments: consolidated,
  };
}

// ---------------------------------------------------------------- Daily & Weekly Cadence
function isoWeek(d = new Date()) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

export async function runLearningCadence(arg1 = "", arg2 = {}) {
  const at = arg1 instanceof Date ? arg1 : (arg2 instanceof Date ? arg2 : new Date());
  const opts = (arg1 && typeof arg1 === "object" && !(arg1 instanceof Date)) ? arg1 : (arg2 && typeof arg2 === "object" && !(arg2 instanceof Date) ? arg2 : {});
  const day = at.toISOString().slice(0, 10);
  const week = isoWeek(at);
  const { allTasks } = await import("./ops.js");
  const tasks = await allTasks();
  const trajs = await getMany("learn:traj", (await listIds("learn:trajs", 100)).slice(-100));
  const todayTrajs = trajs.filter((t) => (t.at || "").startsWith(day));

  // 1. Daily 5-line department status digest (INTERNAL.cadence.daily)
  const doneToday = tasks.filter((t) => (t.closedAt || t.reviewAt || "").startsWith(day));
  const dueTomorrow = tasks.filter((t) => ["queued", "working", "assigned", "in_progress", "changes"].includes(t.status));
  const blocked = tasks.filter((t) => ["owner", "held", "follow_up"].includes(t.status));
  const waitingClient = tasks.filter((t) => t.status === "waiting_client");
  const newRulesToday = todayTrajs.reduce((n, t) => n + (t.distilledRuleIds?.length || 0), 0);

  const dailyDigest = {
    day,
    at: at.toISOString(),
    cadence: INTERNAL.cadence.daily,
    lines: [
      `1. Done today: ${doneToday.length} task(s) delivered or approved.`,
      `2. Due / in progress: ${dueTomorrow.length} active task(s) across departments.`,
      `3. Blocked / waiting on Stanley: ${blocked.length} task(s).`,
      `4. Clients waiting to reply: ${waitingClient.length} task(s).`,
      `5. Intelligence & QA: ${todayTrajs.length} trajectory event(s) logged today, ${newRulesToday} new rule(s) distilled into department playbooks.`,
    ],
  };
  await setJSON(`learn:digest:daily:${day}`, dailyDigest);
  await setJSON("learn:digest:daily:latest", dailyDigest);

  // 2. Weekly Monday consolidation & QA failure / playbook summary (INTERNAL.cadence.weekly)
  let weeklyDigest = null;
  if (opts.forceWeekly || (at.getUTCDay() === 1 && !(await getJSON(`learn:digest:weekly:${week}`)))) {
    const cons = await consolidateLearning();
    const playbooks = await Promise.all(LEARN_DEPTS.map((d) => getLearnedPlaybook(d)));
    const bank = await getAnswerBank();
    weeklyDigest = {
      week,
      at: at.toISOString(),
      cadence: INTERNAL.cadence.weekly,
      consolidated: cons.departments,
      departments: playbooks.map((pb) => ({
        dept: pb.dept,
        head: COMMS.find((c) => c.id === pb.dept)?.head?.name || pb.dept,
        metrics: pb.metrics,
        topRules: (pb.rules || []).slice(0, 3).map((r) => r.rule),
      })),
      answerBankCount: (bank.items || []).length,
    };
    await setJSON(`learn:digest:weekly:${week}`, weeklyDigest);
    await setJSON("learn:digest:weekly:latest", weeklyDigest);
    if (trajs.length > 0 || opts.forceWeekly) {
      const { emailOwner } = await import("./email.js");
      const summaryLines = weeklyDigest.departments
        .filter((d) => d.topRules.length || d.metrics?.tasksTotal || d.metrics?.qaRejections)
        .map((d) => `- ${d.dept} (${d.head}): ${d.topRules.length} top rule(s)${d.topRules[0] ? ` — "${d.topRules[0]}"` : ""}`);
      await emailOwner(
        `Weekly learning & QA digest (${week})`,
        `Monday collective intelligence report (${week}):\n\n- Active learned rules: ${cons.rules}\n- Gold 5★ exemplars: ${cons.exemplars}\n- Approved Answer Bank entries: ${weeklyDigest.answerBankCount}\n\n${summaryLines.join("\n") || "All departments consolidated."}`
      ).catch(() => {});
    }
  }

  return { daily: dailyDigest, weekly: weeklyDigest };
}

export async function learningView() {
  const playbooks = await Promise.all(LEARN_DEPTS.map((d) => getLearnedPlaybook(d)));
  const bank = await getAnswerBank();
  const trajs = await getMany("learn:traj", (await listIds("learn:trajs", 40)).slice(-25));
  const daily = await getJSON("learn:digest:daily:latest");
  const weekly = await getJSON("learn:digest:weekly:latest");
  const deptList = playbooks.map((p) => {
    const comm = COMMS.find((c) => c.id === p.dept);
    return {
      dept: p.dept,
      head: comm?.head || null,
      staff: comm?.staff || [],
      version: p.version || 1,
      metrics: p.metrics,
      rules: (p.rules || []).slice(0, 10),
      topRules: (p.rules || []).slice(0, 10),
      exemplars: (p.exemplars || []).slice(0, 4),
    };
  });
  return {
    totalRules: playbooks.reduce((n, p) => n + (p.rules?.length || 0), 0),
    totalExemplars: playbooks.reduce((n, p) => n + (p.exemplars?.length || 0), 0),
    answerBankCount: bank.items?.length || 0,
    departments: deptList,
    byDepartment: Object.fromEntries(deptList.map((d) => [d.dept, d])),
    answers: (bank.items || []).slice(0, 15),
    recentTrajectories: trajs.reverse(),
    digests: { daily, weekly },
  };
}
