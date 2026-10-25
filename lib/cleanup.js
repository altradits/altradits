// Keeping the store lean as the business grows: a clear button per dashboard
// (lib/cleanup.js clearGroups) and a daily automatic clean-up (autoClean)
// with fixed retention periods.
//
// Never deleted, by a button or automatically:
// - anything attached to a payment: the paid order or donation, the client who
//   paid, their portal and referral links, tasks and approvals, the coupon
//   used, and every email about it (payment emails, receipts, confirmations)
// - live work: emails waiting for Stanley, pending approvals, open tasks,
//   proposals a client still has to answer, coupons a player has earned and
//   not yet used, and the leads those belong to
// - internal records: the team and applications, careers and the job hunt,
//   marketing content and settings, Lightning lessons, the receipt counter and
//   every setting. Those keys are simply not in any group below.
import fs from "node:fs";
import path from "node:path";
import { getJSON, setJSON, keysWithPrefix, deleteKeys, removeFromList, purgeCounters, listArchives, deleteArchive, ARCHIVE } from "./store.js";

// What each dashboard's clear button covers.
export const GROUPS = {
  communications: { label: "Communications", prefixes: ["email:", "stan:instr:"], keys: ["mail:notifiedAt"] },
  leads: { label: "Leads and unpaid orders", prefixes: ["lead:", "proposal:", "portal:", "ref:", "pickup:"] },
  tasks: { label: "Tasks", prefixes: ["task:"] },
  approvals: { label: "Approvals", prefixes: ["approval:"] },
  subscribers: { label: "Free-kit subscribers", prefixes: ["sub:"] },
  hunt: { label: "Treasure hunt", prefixes: ["coupon:", "hunt:claim:", "hunt:share:"], keys: ["hunt:shoutq", "hunt:stats"] },
};
// "Test clients" in Start fresh is every customer group at once.
const ALIASES = { clients: ["leads", "tasks", "approvals", "subscribers", "hunt"] };
const expand = (groups) => [...new Set(groups.flatMap((g) => ALIASES[g] || [g]))].filter((g) => GROUPS[g]);

// Which list holds the ids for a key prefix.
const LISTS = { "member:": ["members"], "email:": ["emails", "approvalq"], "stan:instr:": ["stan:instrs"], "lead:": ["leads"], "proposal:": ["proposals"], "task:": ["tasks"], "approval:": ["approvals"], "sub:": ["subs"], "learn:traj:": ["learn:trajs"] };

// Automatic clean-up: how long each kind of record is kept (days).
export const RETENTION = [
  { id: "checkouts", days: 14, text: "Unpaid checkouts and donation attempts (a QR was opened but never paid), and their anonymous visitor" },
  { id: "visitors", days: 30, text: "Visitors who chatted or clicked but left no email and bought nothing" },
  { id: "emails", days: 90, text: "Delivered, failed or rejected emails (never payment emails or drafts waiting for you)" },
  { id: "instructions", days: 90, text: "Your instructions to Stan" },
  { id: "approvals", days: 60, text: "Approvals you've already decided" },
  { id: "tasks", days: 180, text: "Finished or cancelled tasks for clients who never paid" },
  { id: "unsubscribed", days: 30, text: "Addresses that unsubscribed from the free-kit emails" },
  { id: "hunt", days: 30, text: "Treasure-hunt entries never completed, and coupons that expired unused" },
  { id: "archives", days: 90, text: "Start-fresh archive files" },
  { id: "counters", days: 0, text: "Rate-limit counters, once their window has passed" },
  { id: "inactive", days: 365, text: "Leads who gave an email but never paid, a year after we last heard from them" },
  { id: "applicants", days: 180, text: "Team applications that were turned down" },
];
const DAY = 864e5;
const older = (iso, days, now) => Boolean(iso) && now - Date.parse(iso) > days * DAY;
const PAY_KINDS = new Set(["payment", "receipt", "receipt-check", "finance"]);

async function load(prefixes) {
  const out = {};
  for (const prefix of prefixes) for (const k of await keysWithPrefix(prefix)) { const v = await getJSON(k); if (v != null) out[k] = v; }
  return out;
}

// The protection rule shared by the buttons and the automatic clean-up.
async function protector(now = Date.now()) {
  const props = Object.values(await load(["proposal:"]));
  const paid = props.filter((p) => p.status === "paid" || p.payment?.confirmedAt);
  const paidIds = new Set(paid.map((p) => p.id)), paidLeads = new Set(paid.map((p) => p.leadId).filter(Boolean));
  const liveLeads = new Set(props.filter((p) => ["sent", "pending_approval"].includes(p.status)).map((p) => p.leadId).filter(Boolean));
  const keepLead = (id) => paidLeads.has(id) || liveLeads.has(id);
  const liveCoupon = (c) => ["active", "reserved"].includes(c.status) && !(c.expiresAt && Date.parse(c.expiresAt) < now);
  return (key, v) => {
    if (key.startsWith("proposal:")) return paidIds.has(v.id) || ["sent", "pending_approval"].includes(v.status);
    if (key.startsWith("lead:")) return keepLead(v.id);
    if (key.startsWith("portal:") || key.startsWith("ref:") || key.startsWith("pickup:")) return keepLead(v);
    if (key.startsWith("email:")) return PAY_KINDS.has(v.kind) || paidLeads.has(v.leadId) || v.status === "awaiting approval";
    if (key.startsWith("task:")) return paidLeads.has(v.leadId) || !["done", "cancelled"].includes(v.status);
    if (key.startsWith("approval:")) return paidLeads.has(v.leadId) || v.status === "pending";
    if (key.startsWith("coupon:")) return paidIds.has(v.usedOn) || paidIds.has(v.reservedFor) || liveCoupon(v);
    if (key.startsWith("hunt:claim:")) return v.status === "earned"; // their coupon decides; the claim stays with it
    return false;
  };
}

// Erase one person on request (privacy): their unpaid leads and orders, free-kit
// subscription, emails to them and a turned-down application. Never a payment:
// paid orders, receipts and payment emails stay for the books (the admin says so).
export async function erasePerson(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error("Enter the person's email address.");
  const isKept = await protector();
  const all = await load(["lead:", "proposal:", "portal:", "ref:", "pickup:", "email:", "sub:", "task:", "approval:", "member:", "membertok:", "learn:traj:"]);
  const leads = new Set(Object.values(all).filter((v) => v && v.email === e && v.token && v.stage).map((l) => l.id));
  const drop = {};
  let kept = 0;
  for (const [k, v] of Object.entries(all)) {
    const mine = (k.startsWith("lead:") && leads.has(v.id)) || (["proposal:", "task:", "approval:", "learn:traj:"].some((x) => k.startsWith(x)) && leads.has(v.leadId))
      || ((k.startsWith("portal:") || k.startsWith("ref:") || k.startsWith("pickup:")) && leads.has(v))
      || (k.startsWith("email:") && (String(v.to).toLowerCase() === e || leads.has(v.leadId)))
      || (k.startsWith("sub:") && v.email === e)
      || (k.startsWith("member:") && v.email === e && v.status !== "approved" && v.status !== "paused");
    if (!mine) continue;
    if (k.startsWith("member:")) { drop[k] = v; drop[`membertok:${v.token}`] = v.id; continue; }
    if (isKept(k, v)) kept++; else drop[k] = v;
  }
  // Scrub any distilled learning rules or Answer Bank entries that mention this email.
  for (const k of await keysWithPrefix("learn:playbook:")) {
    const pb = await getJSON(k);
    if (!pb || !Array.isArray(pb.rules)) continue;
    const filtered = pb.rules.filter((r) => !String(r.rule || "").toLowerCase().includes(e));
    if (filtered.length !== pb.rules.length) { pb.rules = filtered; await setJSON(k, pb); }
  }
  const ans = await getJSON("learn:answers");
  if (Array.isArray(ans)) {
    const filtered = ans.filter((a) => !`${a.question || ""} ${a.answer || ""}`.toLowerCase().includes(e));
    if (filtered.length !== ans.length) await setJSON("learn:answers", filtered);
  }
  await remove(drop, { keep: false });
  return { erased: Object.keys(drop).length, kept };
}

// Delete keys (archiving them first unless keep is false) and take their ids out of the lists.
async function remove(kv, { keep, label }) {
  const keys = Object.keys(kv);
  let file = null;
  if (keep && keys.length) {
    const at = new Date().toISOString();
    file = path.join(ARCHIVE(), `fresh-${at.replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(ARCHIVE(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify({ at, label, kv }), { mode: 0o600 }); // client records: owner-only
  }
  await deleteKeys(keys);
  for (const [prefix, lists] of Object.entries(LISTS)) {
    const ids = keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    for (const l of lists) await removeFromList(l, ids);
  }
  return file && path.basename(file);
}

// A dashboard's clear button (or Start fresh): everything in the groups except what's protected.
export async function clearGroups(groups, { keep = true } = {}) {
  const picked = expand(groups);
  if (!picked.length) throw new Error("Choose what to clear.");
  const isKept = await protector();
  const kv = {};
  let kept = 0;
  for (const g of picked) {
    const all = await load(GROUPS[g].prefixes);
    for (const k of GROUPS[g].keys || []) { const v = await getJSON(k); if (v != null) all[k] = v; }
    for (const [k, v] of Object.entries(all)) { if (isKept(k, v)) kept++; else kv[k] = v; }
  }
  const file = await remove(kv, { keep, label: picked.join(", ") });
  return { cleared: Object.keys(kv).length, archived: keep ? Object.keys(kv).length : 0, kept, keptPayments: kept, groups: picked, file };
}

// Daily: remove what's past its retention period. Deleted for good (no archive:
// the point is to save space), always behind the same protection rule.
export async function autoClean(now = Date.now()) {
  const isKept = await protector(now);
  const days = Object.fromEntries(RETENTION.map((r) => [r.id, r.days]));
  const all = await load(["lead:", "proposal:", "portal:", "ref:", "pickup:", "email:", "stan:instr:", "task:", "approval:", "sub:", "coupon:", "hunt:claim:", "hunt:share:"]);
  const by = (prefix) => Object.entries(all).filter(([k]) => k.startsWith(prefix));
  const drop = {}, counts = {};
  const mark = (rule, k) => { if (!isKept(k, all[k]) && !drop[k]) { drop[k] = all[k]; counts[rule] = (counts[rule] || 0) + 1; } };

  // Unpaid checkouts: the order or donation, and the visitor if that's all they did.
  const proposalsOf = {};
  for (const [, p] of by("proposal:")) (proposalsOf[p.leadId] ||= []).push(p);
  for (const [k, p] of by("proposal:")) if (p.status === "accepted" && (p.order || p.donation) && older(p.createdAt, days.checkouts, now)) mark("checkouts", k);
  for (const [k, l] of by("lead:")) {
    const props = proposalsOf[l.id] || [];
    const gone = props.every((p) => drop[`proposal:${p.id}`]);
    if (!l.email && gone && older(l.updatedAt || l.createdAt, props.length ? days.checkouts : days.visitors, now)) mark(props.length ? "checkouts" : "visitors", k);
  }
  // Index keys (portal, referral, order name) go with their lead, including leads removed earlier.
  for (const [k, id] of [...by("portal:"), ...by("ref:"), ...by("pickup:")]) if (drop[`lead:${id}`] || !all[`lead:${id}`]) mark("visitors", k);
  for (const [k, e] of by("email:")) if (e.status !== "awaiting approval" && older(e.at, days.emails, now)) mark("emails", k);
  for (const [k, r] of by("stan:instr:")) if (older(r.at, days.instructions, now)) mark("instructions", k);
  for (const [k, a] of by("approval:")) if (a.status !== "pending" && older(a.resolvedAt || a.createdAt, days.approvals, now)) mark("approvals", k);
  for (const [k, t] of by("task:")) if (["done", "cancelled"].includes(t.status) && older(t.closedAt || t.updatedAt, days.tasks, now)) mark("tasks", k);
  for (const [k, s] of by("sub:")) if (s.unsubscribed && older(s.unsubscribedAt, days.unsubscribed, now)) mark("unsubscribed", k);
  for (const [k, c] of by("hunt:claim:")) if (c.status === "share" && older(c.createdAt, days.hunt, now)) mark("hunt", k);
  for (const [k, c] of by("coupon:")) if (c.status !== "used" && older(c.expiresAt, days.hunt, now)) mark("hunt", k);
  // A year of silence from someone who never paid: their lead and unpaid orders go (protection still applies).
  for (const [k, l] of by("lead:")) if (l.email && older(l.updatedAt || l.createdAt, days.inactive, now)) {
    mark("inactive", k);
    for (const p of proposalsOf[l.id] || []) if (p.status !== "paid") mark("inactive", `proposal:${p.id}`);
  }
  // Turned-down applicants (never the team: approved or paused members stay).
  const members = await load(["member:", "membertok:"]);
  for (const [k, m] of Object.entries(members)) if (k.startsWith("member:") && m.status === "rejected" && older(m.updatedAt || m.createdAt, days.applicants, now)) {
    drop[k] = m; drop[`membertok:${m.token}`] = m.id; counts.applicants = (counts.applicants || 0) + 1;
  }

  await remove(drop, { keep: false });
  let archives = 0;
  for (const a of listArchives()) if (older(a.at, days.archives, now)) { deleteArchive(a.name); archives++; }
  if (archives) counts.archives = archives;
  const counters = purgeCounters(now);
  if (counters) counts.counters = counters;
  const report = { at: new Date(now).toISOString(), removed: Object.values(counts).reduce((t, n) => t + n, 0), counts };
  await setJSON("clean:last", report);
  return report;
}

export async function cleanupView() {
  return { retention: RETENTION, last: await getJSON("clean:last"), groups: Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.label])), archives: listArchives() };
}
