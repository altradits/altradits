// Leads: free lead capture at /start, tracked until the sale (issue #459).
// A visitor answers 2 to 4 short questions per segment; the record carries
// the post that brought them (ref/utm), an explainable 0 to 100 score, and a
// pipeline stage Stanley moves by hand in the admin. No AI, no cookies, no
// third parties, no paywall. Records are never deleted: archive hides them,
// and erasure on a deletion request is a separate explicit admin act that
// keeps an anonymised audit line.
//
//   lead:<id>   the record (below)
//   leads       ids, newest first
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany } from "./store.js";
import { oneLine, clean, EMAIL_RE } from "./http.js";

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

export const LEAD = { nameMax: 80, phoneMax: 30, emailMax: 120, messageMax: 1000, noteMax: 1000, nextMax: 200, amountMax: 120, reasonMax: 200 };

// Segment -> label, owning department (data/team-comms.js), and its questions.
export const SEGMENTS = {
  shop: { label: "Shop (kTown)", dept: "growth" },
  partner: { label: "Partner", dept: "office" },
  developer: { label: "Developer", dept: "tech" },
  learner: { label: "Learner", dept: "office" },
};
export const STAGES = ["new", "qualified", "contacted", "meeting", "won", "lost", "nurture"];
export const STAGE_LABEL = { new: "New", qualified: "Qualified", contacted: "Contacted", meeting: "Meeting or Setup", won: "Won", lost: "Lost", nurture: "Nurture" };
const CLOSED = new Set(["won", "lost"]);

export const SHOP_TYPES = { kiosk: "Kiosk or shop", food: "Food or drinks", salon: "Salon or barber", services: "Services", other: "Other" };
export const TIMELINES = { now: "Now", months: "In 1 to 3 months", later: "Later" };
export const VOLUMES = { lt100: "Under 100", mid: "100 to 999", high: "1,000 to 9,999", vhigh: "10,000 or more" };
export const LEVELS = { never: "Never coded", learning: "Learning to code", building: "Already building" };
const YESNO = { yes: "Yes", no: "No" };

// The post that brought the visitor: ?ref= (li, x, tt, devto) plus the utm
// tags. Same shape on /start and on kTown registration, so a shop that
// registers can be matched to its lead. First-party only: read from our own
// page address, never from cookies or outside scripts.
const REF_RE = /^[a-z0-9_-]{1,32}$/;
export function cleanSource(input) {
  const s = (input && typeof input === "object") ? input : {};
  const ref = String(s.ref || "").trim().toLowerCase();
  const out = {
    ref: REF_RE.test(ref) ? ref : null,
    utm_source: oneLine(s.utm_source, 60) || null,
    utm_medium: oneLine(s.utm_medium, 60) || null,
    utm_campaign: oneLine(s.utm_campaign, 120) || null,
  };
  return out;
}
export const tracked = (source) => Boolean(source && (source.ref || source.utm_source || source.utm_medium || source.utm_campaign));

// A phone number reduced to digits for matching a lead to a kTown merchant.
// Kept loose on purpose: partners and developers may write foreign numbers.
export function phoneDigits(input) {
  return String(input || "").replace(/\D/g, "").slice(0, 16);
}
export const emailKey = (input) => String(input || "").trim().toLowerCase().slice(0, LEAD.emailMax);

// Kisumu and its estates, for the shop score ("a visit is easy"). Matched as
// whole words against the typed area, so "Kisumu" or "Kondele" counts.
const KISUMU = ["kisumu", "kondele", "nyamasaria", "milimani", "otonglo", "kajulu", "nyalenda", "manyatta", "migosi", "bandani", "nyawita", "kasagam", "lolwe", "tivoli", "dago"];
export const inKisumu = (area) => {
  const words = new Set(String(area || "").toLowerCase().split(/[^a-z]+/).filter(Boolean));
  return KISUMU.some((k) => words.has(k));
};

// ---- validation: the submitted form becomes a clean record, or a refusal.
function needText(v, max, what) {
  const t = oneLine(v, max);
  if (!t) throw err(`${what} is needed.`);
  return t;
}
function needChoice(v, map, what) {
  if (!Object.hasOwn(map, String(v))) throw err(`Pick an answer for "${what}".`);
  return String(v);
}
function checkPhone(v) {
  const p = clean(v, LEAD.phoneMax).replace(/[^\d+\-() ]/g, "").trim();
  if (p && phoneDigits(p).length >= 7) return p;
  if (p) throw err("That phone number does not look right.");
  return "";
}
function checkEmail(v) {
  const e = clean(v, LEAD.emailMax);
  if (e && !EMAIL_RE.test(e)) throw err("That email address does not look right.");
  return e;
}

export function validateAnswers(segment, a = {}) {
  if (segment === "shop") return {
    shopType: needChoice(a.shopType, SHOP_TYPES, "Shop type"),
    area: needText(a.area, 60, "The area in Kisumu"),
    demand: needChoice(a.demand, YESNO, "Customers asking to pay by phone"),
    smartphone: needChoice(a.smartphone, YESNO, "Smartphone on the till"),
  };
  if (segment === "partner") return {
    org: needText(a.org, 120, "The organisation"),
    support: needText(a.support, 200, "What they want to support"),
    timeline: needChoice(a.timeline, TIMELINES, "Timeline"),
  };
  if (segment === "developer") return {
    building: needText(a.building, 200, "What they are building"),
    volume: needChoice(a.volume, VOLUMES, "Expected monthly payments"),
    timeline: needChoice(a.timeline, TIMELINES, "Timeline"),
  };
  if (segment === "learner") return {
    level: needChoice(a.level, LEVELS, "Coding level"),
    attend: needChoice(a.attend, YESNO, "Attending in Kisumu"),
  };
  throw err("Pick what best describes you.");
}

export function validateLead(body = {}) {
  const segment = String(body.segment || "");
  if (!SEGMENTS[segment]) throw err("Pick what best describes you.");
  const name = needText(body.name, LEAD.nameMax, "Your name");
  const phone = checkPhone(body.phone);
  const email = checkEmail(body.email);
  if (!phone && !email) throw err("Give a phone number or an email address, so we can reach you.");
  if (body.consent !== true) throw err("Tick the consent line so we may store your answers and follow up.");
  const lang = body.lang === "sw" ? "sw" : "en";
  return { segment, name, phone, email, answers: validateAnswers(segment, body.answers), message: clean(body.message, LEAD.messageMax), lang, source: cleanSource(body.source) };
}

// ---- scoring: a simple explainable 0 to 100 per segment. Pure: the same
// answers always give the same score and reasons. Each reason names the
// points it earned, so Stanley sees why a lead ranks high.
export function scoreLead(segment, answers, { bothContacts = false, isTracked = false, hasMessage = false } = {}) {
  const reasons = [];
  const give = (points, text) => { reasons.push({ points, text }); };
  let score = 0;
  const add = (points, text) => { if (points > 0) { score += points; give(points, text); } };
  if (segment === "shop") {
    add(inKisumu(answers.area) ? 30 : 0, "Shop is in Kisumu, so a visit is easy");
    add(answers.demand === "yes" ? 30 : 0, "Customers already ask to pay by phone");
    add(answers.smartphone === "yes" ? 20 : 0, "A smartphone sits on the till");
    add(bothContacts ? 10 : 0, "Gave phone and email");
    add(isTracked ? 10 : 0, "Came from a tracked post");
  } else if (segment === "partner") {
    add(answers.org ? 30 : 0, "Named an organisation");
    add(answers.support ? 25 : 0, "Said what they want to support");
    add(answers.timeline === "now" ? 25 : answers.timeline === "months" ? 20 : answers.timeline === "later" ? 10 : 0,
      answers.timeline === "now" ? "Ready now" : answers.timeline === "months" ? "Ready within 3 months" : "Timeline is later");
    add(bothContacts ? 10 : 0, "Gave phone and email");
    add(isTracked ? 10 : 0, "Came from a tracked post");
  } else if (segment === "developer") {
    add(answers.building ? 30 : 0, "Said what they are building");
    add(answers.volume === "vhigh" || answers.volume === "high" ? 25 : answers.volume === "mid" ? 15 : answers.volume === "lt100" ? 5 : 0,
      answers.volume === "vhigh" ? "Expects 10,000 or more payments a month" : answers.volume === "high" ? "Expects 1,000 or more payments a month"
      : answers.volume === "mid" ? "Expects 100 or more payments a month" : "Expects under 100 payments a month");
    add(answers.timeline === "now" ? 25 : answers.timeline === "months" ? 20 : answers.timeline === "later" ? 10 : 0,
      answers.timeline === "now" ? "Ready now" : answers.timeline === "months" ? "Ready within 3 months" : "Timeline is later");
    add(bothContacts ? 10 : 0, "Gave phone and email");
    add(isTracked ? 10 : 0, "Came from a tracked post");
  } else if (segment === "learner") {
    add(answers.attend === "yes" ? 40 : 0, "Can attend in Kisumu");
    add(answers.level === "building" ? 30 : answers.level === "learning" ? 20 : answers.level === "never" ? 10 : 0,
      answers.level === "building" ? "Already building with code" : answers.level === "learning" ? "Learning to code" : "Starting out");
    add(bothContacts ? 10 : 0, "Gave phone and email");
    add(isTracked ? 10 : 0, "Came from a tracked post");
    add(hasMessage ? 10 : 0, "Added details in their own words");
  }
  return { score: Math.min(100, score), reasons };
}

// ---- the record -----------------------------------------------------------
export async function getLead(id) {
  const m = await getJSON(`lead:${clean(id, 80)}`);
  return m || null;
}
async function saveLead(m) {
  await setJSON(`lead:${m.id}`, m);
  return m;
}
const stamp = (by, text, kind) => ({ at: now(), by, text, kind });

export async function createLeadRecord({ id, fields, held }) {
  const { score, reasons } = scoreLead(fields.segment, fields.answers,
    { bothContacts: Boolean(fields.phone && fields.email), isTracked: tracked(fields.source), hasMessage: Boolean(fields.message) });
  const at = now();
  const m = {
    id, at, lang: fields.lang, segment: fields.segment, name: fields.name, phone: fields.phone, email: fields.email,
    answers: fields.answers, message: fields.message, consent: { at, version: "dpa-ke-2019-v1" }, source: fields.source,
    score, reasons, held: held || null, stage: "new", lostReason: null, wonAt: null, archived: false,
    links: { ktown: null, dev: null, amount: null }, notes: [], next: null,
    timeline: [stamp("visitor", `Sent the /start form (${SEGMENTS[fields.segment].label}). Score ${score}.`, "system")],
    erased: null,
  };
  if (held) m.timeline.push(stamp("system", `Security hold: the words contain ${held.reasons.join(", ")}. Decide on this lead yourself.`, "system"));
  await saveLead(m);
  await pushId("leads", id);
  return m;
}

export async function setStage(id, stage, { note, reason, by = "stanley" } = {}) {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  if (m.erased) throw err("Erased: this record keeps only its audit line.", 400);
  if (!STAGES.includes(stage)) throw err("Unknown stage.", 400);
  const r = oneLine(reason, LEAD.reasonMax);
  if (stage === "lost" && !r) throw err("Give a reason for Lost, so the record explains itself.", 400);
  const from = STAGE_LABEL[m.stage], to = STAGE_LABEL[stage];
  const was = m.stage;
  m.stage = stage;
  m.lostReason = stage === "lost" ? r : null;
  m.wonAt = stage === "won" ? (was === "won" ? m.wonAt || now() : now()) : null;
  m.timeline.push(stamp(by, stage === "lost" ? `Stage: ${from} to ${to}. Reason: ${r}` : `Stage: ${from} to ${to}.`, "stage"));
  if (note !== undefined && String(note).trim()) await addNote(m, note, by);
  else await saveLead(m);
  return m;
}

export async function addNote(m, text, by = "stanley") {
  const lead = typeof m === "string" ? await getLead(m) : m;
  if (!lead) throw err("No such lead.", 404);
  if (lead.erased) throw err("Erased: this record keeps only its audit line.", 400);
  const t = clean(text, LEAD.noteMax);
  if (!t) throw err("Write the note first.", 400);
  lead.notes.push({ at: now(), by, text: t });
  lead.timeline.push(stamp(by, `Note: ${t}`, "note"));
  await saveLead(lead);
  return lead;
}

const DUE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export async function setNext(id, { text, due }, by = "stanley") {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  if (m.erased) throw err("Erased: this record keeps only its audit line.", 400);
  const t = oneLine(text, LEAD.nextMax);
  const d = String(due || "").trim();
  if (!t && !d) {
    m.next = null;
    m.timeline.push(stamp(by, "Next step cleared.", "next"));
    await saveLead(m);
    return m;
  }
  if (!t) throw err("Describe the next step.", 400);
  if (!DUE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw err("Give the due date as YYYY-MM-DD.", 400);
  m.next = { text: t, due: d };
  m.timeline.push(stamp(by, `Next step: ${t} (due ${d}).`, "next"));
  await saveLead(m);
  return m;
}

// Linking is always Stanley's explicit act in the admin: a typed phone or
// email never joins records by itself.
export async function linkTarget(id, kind, target, by = "stanley") {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  if (m.erased) throw err("Erased: this record keeps only its audit line.", 400);
  const t = clean(target, 80);
  if (kind === "ktown") {
    const merch = t && (await getJSON(`kt:${t}`));
    if (!merch) throw err("No kTown merchant with that id.", 404);
    m.links.ktown = merch.id;
    m.timeline.push(stamp(by, `Linked to the kTown registration "${merch.shop}".`, "link"));
  } else if (kind === "dev") {
    const acct = t && (await getJSON(`dev:acct:${t}`));
    if (!acct) throw err("No Developer API account with that id.", 404);
    m.links.dev = acct.id;
    m.timeline.push(stamp(by, `Linked to the Developer API account ${acct.email}.`, "link"));
  } else throw err("Unknown link.", 400);
  await saveLead(m);
  return m;
}

export async function unlinkTarget(id, kind, by = "stanley") {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  if (m.erased) throw err("Erased: this record keeps only its audit line.", 400);
  if (kind !== "ktown" && kind !== "dev") throw err("Unknown link.", 400);
  m.links[kind] = null;
  m.timeline.push(stamp(by, `Unlinked the ${kind === "ktown" ? "kTown registration" : "Developer API account"}.`, "link"));
  await saveLead(m);
  return m;
}

export async function setAmount(id, amount, by = "stanley") {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  if (m.erased) throw err("Erased: this record keeps only its audit line.", 400);
  m.links.amount = oneLine(amount, LEAD.amountMax) || null;
  m.timeline.push(stamp(by, m.links.amount ? `Agreed amount: ${m.links.amount}.` : "Agreed amount cleared.", "link"));
  await saveLead(m);
  return m;
}

export async function archiveLead(id, archived, by = "stanley") {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  m.archived = Boolean(archived);
  m.timeline.push(stamp(by, m.archived ? "Archived. The record stays, out of the way." : "Brought back from the archive.", "system"));
  await saveLead(m);
  return m;
}

// Erasure on a deletion request (Kenya Data Protection Act 2019): the name,
// contacts, answers, message and notes go; the segment, source, score, stage
// history and one audit line stay. System timeline entries carry no free
// text, so they stay; notes (Stanley's free text) go with the rest.
export async function eraseLead(id, by = "stanley") {
  const m = await getLead(id);
  if (!m) throw err("No such lead.", 404);
  if (m.erased) throw err("This lead is already erased.", 400);
  const audit = (m.timeline || []).filter((e) => e && e.kind !== "note");
  m.name = "[erased]";
  m.phone = "";
  m.email = "";
  m.answers = {};
  m.message = "[erased on request]";
  m.held = null;
  m.notes = [];
  m.next = null;
  m.links = { ktown: null, dev: null, amount: null };
  m.lostReason = m.lostReason ? "[erased on request]" : null;
  m.timeline = [...audit, stamp(by, "Erased on a deletion request. This line stays as the audit.", "system")];
  m.erased = { at: now(), by };
  await saveLead(m);
  return m;
}

// ---- matching candidates (suggestions only; linking stays explicit) --------
export async function findKtownCandidate(phone) {
  let d = phoneDigits(phone);
  if (/^0\d{9}$/.test(d)) d = `254${d.slice(1)}`;
  else if (/^\d{9}$/.test(d)) d = `254${d}`;
  if (!/^254\d{9}$/.test(d)) return null;
  const id = await getJSON(`kt:phone:${d}`);
  const merch = id && (await getJSON(`kt:${id}`));
  if (!merch) return null;
  return { id: merch.id, shop: merch.shop, createdAt: merch.createdAt, source: merch.source || null };
}

export async function findDevCandidate(email) {
  const e = emailKey(email);
  if (!EMAIL_RE.test(e)) return null;
  const id = await getJSON(`dev:email:${sha(e)}`);
  const acct = id && (await getJSON(`dev:acct:${id}`));
  if (!acct) return null;
  const keyCount = (await listIds(`dev:keys:${acct.id}`, 200)).length;
  return { accountId: acct.id, email: acct.email, keyCount, createdAt: acct.createdAt };
}

export async function devKeysOf(accountId) {
  const { getJSON: g, listIds: l } = await import("./store.js");
  const rows = [];
  for (const kid of await l(`dev:keys:${clean(accountId, 80)}`, 200)) {
    const h = await g(`dev:keyid:${kid}`);
    const k = h && (await g(`dev:key:${h}`));
    if (k) rows.push({ id: k.id, prefix: k.prefix, name: k.name, sandbox: Boolean(k.sandbox), createdAt: k.createdAt, revokedAt: k.revokedAt || null, lastUsedAt: k.lastUsedAt || null });
  }
  return rows;
}

// The first payment that landed for a linked shop: amount and date only.
export async function firstPayment(merchantId) {
  const { history } = await import("./ktown.js");
  const done = (await history(clean(merchantId, 80), 500)).filter((e) => e && e.status === "completed");
  if (!done.length) return null;
  done.sort((a, b) => String(a.confirmedAt || a.at).localeCompare(String(b.confirmedAt || b.at)));
  const f = done[0];
  return { kes: f.kesReceived ?? null, sats: f.sats ?? null, at: f.confirmedAt || f.at };
}

// ---- the admin pipeline view ------------------------------------------------
export function answerLabel(segment, key, value) {
  const maps = { shop: { shopType: SHOP_TYPES, demand: YESNO, smartphone: YESNO }, partner: { timeline: TIMELINES },
    developer: { volume: VOLUMES, timeline: TIMELINES }, learner: { level: LEVELS, attend: YESNO } };
  return maps[segment]?.[key]?.[value] || String(value ?? "");
}
export const ANSWER_LABEL = { shopType: "Shop type", area: "Area", demand: "Customers ask for phone payments", smartphone: "Smartphone on the till",
  org: "Organisation", support: "Wants to support", timeline: "Timeline", building: "Building", volume: "Monthly payments", level: "Coding level", attend: "Can attend in Kisumu" };

export async function leadsView() {
  const leads = await getMany("lead", await listIds("leads", 500));
  const bySegment = { shop: 0, partner: 0, developer: 0, learner: 0 };
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  const bySource = {};
  let wonThisWeek = 0, dueCount = 0, archived = 0;
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = Date.now() - 7 * 864e5;
  const rows = [];
  for (const m of leads) {
    if (!m) continue;
    if (m.archived) archived++;
    if (SEGMENTS[m.segment]) bySegment[m.segment]++;
    if (byStage[m.stage] !== undefined) byStage[m.stage]++;
    const src = m.source?.ref || (m.source?.utm_source ? `utm:${m.source.utm_source}` : null) || "direct";
    bySource[src] = (bySource[src] || 0) + 1;
    if (m.stage === "won" && m.wonAt && Date.parse(m.wonAt) >= weekAgo) wonThisWeek++;
    if (!m.archived && !m.erased && !CLOSED.has(m.stage) && m.next?.due && m.next.due <= today) dueCount++;
    const row = { ...m };
    row.answerRows = Object.entries(m.answers || {}).map(([k, v]) => ({ label: ANSWER_LABEL[k] || k, value: answerLabel(m.segment, k, v) }));
    row.candidates = {};
    if (!m.erased && m.segment === "shop" && m.phone && !m.links?.ktown) row.candidates.ktown = await findKtownCandidate(m.phone);
    if (!m.erased && m.segment === "developer" && m.email && !m.links?.dev) row.candidates.dev = await findDevCandidate(m.email);
    if (m.links?.ktown) {
      const merch = await getJSON(`kt:${m.links.ktown}`);
      row.linked = { ktown: merch ? { id: merch.id, shop: merch.shop, createdAt: merch.createdAt } : { id: m.links.ktown, missing: true } };
      row.firstPayment = merch ? await firstPayment(merch.id).catch(() => null) : null;
    }
    if (m.links?.dev) {
      const acct = await getJSON(`dev:acct:${m.links.dev}`);
      row.linked = { ...(row.linked || {}), dev: acct ? { accountId: acct.id, email: acct.email, keys: await devKeysOf(acct.id) } : { accountId: m.links.dev, missing: true } };
    }
    rows.push(row);
  }
  return { stages: STAGES.map((s) => ({ id: s, label: STAGE_LABEL[s] })), leads: rows,
    stats: { total: rows.length, archived, bySegment, byStage, bySource, wonThisWeek, dueCount } };
}

// ---- CSV export for Stanley -------------------------------------------------
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function leadsCsv(leads) {
  const head = ["id", "submitted", "segment", "stage", "name", "phone", "email", "score", "score_reasons", "ref", "utm_source", "utm_medium", "utm_campaign",
    "answers", "message", "next_step", "next_due", "linked_ktown", "linked_dev", "agreed_amount", "archived"];
  const lines = [head.join(",")];
  for (const m of leads) {
    const answers = Object.entries(m.answers || {}).map(([k, v]) => `${ANSWER_LABEL[k] || k}: ${answerLabel(m.segment, k, v)}`).join("; ");
    lines.push([m.id, m.at, m.segment, m.stage, m.name, m.phone, m.email, m.score,
      (m.reasons || []).map((r) => `+${r.points} ${r.text}`).join("; "),
      m.source?.ref || "", m.source?.utm_source || "", m.source?.utm_medium || "", m.source?.utm_campaign || "",
      answers, m.message || "", m.next?.text || "", m.next?.due || "", m.links?.ktown || "", m.links?.dev || "", m.links?.amount || "",
      m.archived ? "yes" : ""].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

// ---- notifications ----------------------------------------------------------
export function leadEmailText(m) {
  const seg = SEGMENTS[m.segment]?.label || m.segment;
  const answers = Object.entries(m.answers || {}).map(([k, v]) => `- ${ANSWER_LABEL[k] || k}: ${answerLabel(m.segment, k, v)}`).join("\n");
  const src = [m.source?.ref && `ref ${m.source.ref}`, m.source?.utm_source && `utm_source ${m.source.utm_source}`,
    m.source?.utm_medium && `utm_medium ${m.source.utm_medium}`, m.source?.utm_campaign && `utm_campaign ${m.source.utm_campaign}`].filter(Boolean).join(", ") || "direct (no ref or utm tags)";
  const lines = [`A new ${seg.toLowerCase()} lead arrived from the /start form.`,
    ...(m.held ? [`SECURITY HOLD: the words contain ${m.held.reasons.join(", ")}, so decide on this lead yourself. The text below is defanged.`] : []),
    ``, `Name: ${m.name}`, `Phone: ${m.phone || "-"}`, `Email: ${m.email || "-"}`, ``, answers,
    ...(m.message ? [``, `Message: ${m.message}`] : []), ``,
    `Score: ${m.score} of 100.`, ...(m.reasons || []).map((r) => `+${r.points}: ${r.text}`), ``, `Source: ${src}.`, ``,
    `Open the pipeline from the dashboard: Leads tab.`];
  return { subject: `New ${seg.toLowerCase()} lead: ${m.name}`, text: lines.join("\n") };
}

// The daily digest: leads whose next step is due. Sent only when at least one
// is due; silence otherwise keeps Stanley's inbox for decisions.
export async function leadsDigest(today = new Date().toISOString().slice(0, 10)) {
  const { leads } = await leadsView();
  const due = leads.filter((m) => !m.archived && !m.erased && !CLOSED.has(m.stage) && m.next?.due && m.next.due <= today)
    .sort((a, b) => String(a.next.due).localeCompare(String(b.next.due)));
  if (!due.length) return { sent: false, due: 0 };
  const { emailOwner } = await import("./email.js");
  const lines = due.map((m) => `- ${m.name} (${SEGMENTS[m.segment]?.label || m.segment}, ${STAGE_LABEL[m.stage]}): ${m.next.text} (due ${m.next.due})`);
  await emailOwner(`Leads due: ${due.length} next step${due.length === 1 ? "" : "s"}`,
    `${due.length} lead${due.length === 1 ? " has" : "s have"} a next step due.\n\n${lines.join("\n")}\n\nOpen the pipeline from the dashboard: Leads tab.`,
    { label: "Open the Leads pipeline", url: `${(process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "")}/admin#leads` }, "office");
  return { sent: true, due: due.length };
}
