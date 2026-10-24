// Tiny key-value store. In production it talks to Upstash Redis (or Vercel KV,
// which is Upstash underneath) over REST. Without those env vars it falls back
// to a JSON file in .data/ so the whole funnel runs locally.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(...cmd) {
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error(`redis: ${data.error}`);
  return data.result;
}

// --- local file store ----------------------------------------------------
// On HostAfrica this is the production store: set DATA_DIR to a folder outside
// public_html. The file is re-read on every operation because Passenger may
// run more than one app process.
// In production the data must never sit inside the web root (Apache serves
// every file there): without DATA_DIR, use ~/altradits-data.
export const dataDir = () => process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? path.join(os.homedir(), "altradits-data") : path.join(process.cwd(), ".data"));
const FILE = path.join(dataDir(), "db.json");
let mem = null;
function load() {
  try { mem = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { mem ||= { kv: {}, lists: {}, counters: {} }; }
  return mem;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(mem));
    fs.renameSync(tmp, FILE); // atomic swap: readers never see a half-written file
  } catch { /* read-only filesystem: keep it in memory */ }
}

export const usingRedis = Boolean(REST_URL && REST_TOKEN);

export async function getJSON(key) {
  if (usingRedis) {
    const v = await redis("GET", key);
    return v ? JSON.parse(v) : null;
  }
  return load().kv[key] ?? null;
}

export async function setJSON(key, value) {
  if (usingRedis) return redis("SET", key, JSON.stringify(value));
  load().kv[key] = value;
  save();
}

// Newest first, like LPUSH + LRANGE.
export async function pushId(list, id) {
  if (usingRedis) return redis("LPUSH", list, id);
  const db = load();
  (db.lists[list] ||= []).unshift(id);
  save();
}

export async function listIds(list, limit = 500) {
  if (usingRedis) return redis("LRANGE", list, 0, limit - 1);
  return (load().lists[list] || []).slice(0, limit);
}

// Fixed-window counter used for rate limiting. Returns the new count.
export async function hit(key, windowSeconds) {
  if (usingRedis) {
    const n = await redis("INCR", key);
    if (n === 1) await redis("EXPIRE", key, windowSeconds);
    return n;
  }
  const db = load();
  const now = Date.now();
  const c = db.counters[key];
  if (!c || c.until < now) db.counters[key] = { n: 1, until: now + windowSeconds * 1000 };
  else c.n++;
  save();
  return db.counters[key].n;
}

export async function getMany(prefix, ids) {
  const out = await Promise.all(ids.map((id) => getJSON(`${prefix}:${id}`)));
  return out.filter(Boolean);
}

// Every key starting with prefix (admin housekeeping only).
async function keysWithPrefix(prefix) {
  if (!usingRedis) return Object.keys(load().kv).filter((k) => k.startsWith(prefix));
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis("SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

// "Start fresh": clear groups of records from the live store. By default they
// are first moved into an archive file in the data folder (restorable by
// hand); with keep: false they are deleted for good. Team, careers and
// marketing content are never touched.
export const FRESH_GROUPS = {
  communications: { prefixes: ["email:", "stan:instr:"], lists: ["emails", "approvalq", "stan:instrs"], keys: ["mail:notifiedAt"] },
  clients: { prefixes: ["lead:", "proposal:", "task:", "approval:", "sub:", "portal:", "ref:", "coupon:", "hunt:claim:", "hunt:share:"],
    lists: ["leads", "proposals", "tasks", "approvals", "subs"], keys: ["finance:seq", "hunt:shoutq", "hunt:stats"] },
};
export async function archiveAndClear(groups, { keep = true } = {}) {
  const picked = groups.filter((g) => FRESH_GROUPS[g]);
  if (!picked.length) throw new Error("Choose what to clear.");
  const kv = {}, lists = {};
  for (const g of picked) {
    const { prefixes, lists: ls, keys } = FRESH_GROUPS[g];
    for (const k of [...(await Promise.all(prefixes.map(keysWithPrefix))).flat(), ...keys]) { const v = await getJSON(k); if (v != null) kv[k] = v; }
    for (const l of ls) lists[l] = await listIds(l, 100000);
  }
  const at = new Date().toISOString();
  const file = keep ? path.join(ARCHIVE(), `fresh-${at.replace(/[:.]/g, "-")}.json`) : null;
  if (file) { fs.mkdirSync(ARCHIVE(), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at, groups: picked, kv, lists })); }
  const del = [...Object.keys(kv), ...Object.keys(lists)];
  if (usingRedis) { for (let i = 0; i < del.length; i += 200) await redis("DEL", ...del.slice(i, i + 200)); }
  else { const db = load(); for (const k of Object.keys(kv)) delete db.kv[k]; for (const l of Object.keys(lists)) delete db.lists[l]; save(); }
  return { cleared: Object.keys(kv).length, archived: keep ? Object.keys(kv).length : 0, groups: picked, file: file && path.basename(file) };
}

// The archive files, newest first, and deleting one for good to free space.
const ARCHIVE = () => path.join(dataDir(), "archive");
const ARCHIVE_RE = /^fresh-[\dTZ-]+\.json$/;
export function listArchives() {
  try {
    return fs.readdirSync(ARCHIVE()).filter((f) => ARCHIVE_RE.test(f))
      .map((name) => ({ name, bytes: fs.statSync(path.join(ARCHIVE(), name)).size })).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}
export function deleteArchive(name) {
  if (!ARCHIVE_RE.test(String(name))) throw new Error("That isn't an archive file.");
  try { fs.unlinkSync(path.join(ARCHIVE(), name)); } catch { throw new Error("That archive is already gone."); }
  return { deleted: name };
}
