// Keeping the store lean.
// - retireAgency(): once, after the agency moved to altradits/chouMi, removes
//   its records (test orders, leads, tasks, marketing, job hunt…). Everything
//   is first written to one owner-only archive file, so nothing is lost by accident.
//   The old email log and visit counts for removed pages are cleared at the same time.
// - autoClean(): daily, drops rate-limit counters past their window and
//   archive files older than 90 days (their payments are kept in the statement first).
// Ye₿ente's wallets, the security log and the node's lessons are never touched here.
import fs from "node:fs";
import path from "node:path";
import { getJSON, setJSON, keysWithPrefix, deleteKeys, deleteList, purgeCounters, listArchives, deleteArchive, ARCHIVE } from "./store.js";

// Every key prefix the agency used, and the lists that held their ids. The old
// email log (Stanley asked for "Emails sent" to start empty) and the removed
// bounce check go too.
export const AGENCY_PREFIXES = ["lead:", "proposal:", "portal:", "ref:", "pickup:", "task:", "approval:", "sub:", "coupon:", "hunt:",
  "member:", "membertok:", "applicant", "stan:", "mkt:", "job:", "jobprofile", "learn:", "budget:", "confirm:", "cvpass:", "finance:", "mail:notifiedAt",
  "email:", "bounces:"];
export const AGENCY_LISTS = ["leads", "proposals", "tasks", "approvals", "approvalq", "subs", "members", "jobs", "stan:instrs", "learn:trajs", "emails"];
const RETIRED = "retired:agency";
const DAY = 864e5;

export async function retireAgency(now = new Date()) {
  if (await getJSON(RETIRED)) return { already: true };
  const kv = {};
  for (const prefix of AGENCY_PREFIXES) for (const k of await keysWithPrefix(prefix)) { const v = await getJSON(k); if (v != null) kv[k] = v; }
  let file = null;
  if (Object.keys(kv).length) {
    const at = now.toISOString();
    file = path.join(ARCHIVE(), `fresh-${at.replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(ARCHIVE(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify({ at, label: "agency records, moved to altradits/chouMi", kv }), { mode: 0o600 });
  }
  await deleteKeys(Object.keys(kv));
  for (const list of AGENCY_LISTS) await deleteList(list);
  const { keepOnlyPages } = await import("./visits.js");
  const visits = keepOnlyPages();
  const result = { removed: Object.keys(kv).length, visitsDropped: visits, archive: file && path.basename(file), at: now.toISOString() };
  await setJSON(RETIRED, result);
  return result;
}

export async function autoClean(now = Date.now()) {
  const counters = purgeCounters(now);
  // Payments in an archive move to the permanent statement before any archive file goes.
  const { keepArchivedPayments } = await import("./statement.js");
  await keepArchivedPayments();
  const old = listArchives().filter((a) => now - Date.parse(a.at) > 90 * DAY);
  for (const a of old) deleteArchive(a.name);
  // Spent or long-expired contact quotes go; paid messages stay forever (payment records).
  let quotes = 0;
  for (const k of await keysWithPrefix("contact:quote:")) {
    const q = await getJSON(k);
    if (!q) { await deleteKeys([k]); quotes++; continue; }
    const age = now - Date.parse(q.inv?.expiresAt || 0);
    if ((q.used && age > 7 * DAY) || (!q.used && age > DAY)) { await deleteKeys([k]); quotes++; }
  }
  return { counters, archives: old.length, quotes };
}

export const archivesView = () => listArchives();
export { deleteArchive };
