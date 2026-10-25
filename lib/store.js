// Tiny key-value store. In production it talks to Upstash Redis (or Vercel KV,
// which is Upstash underneath) over REST. Without those env vars it falls back
// to a JSON file in .data/ so the whole funnel runs locally.
import fs from "node:fs";
import crypto from "node:crypto";
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
// A file that exists but can't be read or parsed is never treated as empty:
// saving over it would wipe every record. The request fails instead.
function load() {
  let raw;
  try { raw = fs.readFileSync(FILE, "utf8"); } catch (err) {
    if (err.code === "ENOENT") return (mem ||= { kv: {}, lists: {}, counters: {} }); // first run
    if (mem) return mem; // transient read error: keep the last good copy, never an empty one
    throw new Error(`Data store unreadable (${err.code}); not touching it.`);
  }
  try { mem = JSON.parse(raw); } catch {
    if (mem) return mem;
    throw new Error("Data store file is damaged; not touching it. Restore the latest backup (deploy/restore-backup.mjs).");
  }
  mem.kv ||= {}; mem.lists ||= {}; mem.counters ||= {};
  return mem;
}
let lastSaveError = 0;
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(mem), { mode: 0o600 }); // client records: owner-only
    fs.renameSync(tmp, FILE); // atomic swap: readers never see a half-written file
  } catch (err) {
    // Disk full, quota or read-only: say so (at most once a minute) instead of failing silently.
    if (Date.now() - lastSaveError > 60e3) { lastSaveError = Date.now(); console.error(`data store: save failed (${err.code || err.message}); changes kept in memory only`); }
  }
}
// Every change is read-modify-write of the whole file. Passenger may run several
// processes, so each change holds a short file lock: no process can save over
// another's change made a moment earlier.
const LOCK = `${FILE}.lock`;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function mutate(fn) {
  let fd = null;
  for (let i = 0; i < 400 && fd === null; i++) {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 }); fd = fs.openSync(LOCK, "wx", 0o600); }
    catch (err) {
      if (err.code !== "EEXIST") break; // can't lock (read-only disk): carry on unlocked
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 5000) fs.unlinkSync(LOCK); } catch { /* gone already */ } // a crashed holder
      sleep(5);
    }
  }
  try { const db = load(); const out = fn(db); save(); return out; }
  finally { if (fd !== null) { fs.closeSync(fd); try { fs.unlinkSync(LOCK); } catch { /* gone */ } } }
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
  mutate((db) => { db.kv[key] = value; });
}

// Newest first, like LPUSH + LRANGE.
export async function pushId(list, id) {
  if (usingRedis) return redis("LPUSH", list, id);
  mutate((db) => { (db.lists[list] ||= []).unshift(id); });
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
  return mutate((db) => {
    const now = Date.now(), c = db.counters[key];
    if (!c || c.until < now) db.counters[key] = { n: 1, until: now + windowSeconds * 1000 };
    else c.n++;
    return db.counters[key].n;
  });
}

// A counter that never resets and never repeats (receipt numbers).
export async function increment(key) {
  if (usingRedis) return Number(await redis("INCR", key));
  return mutate((db) => { db.kv[key] = (Number(db.kv[key]) || 0) + 1; return db.kv[key]; });
}

// A counter's current value without counting (0 when absent or expired).
export async function peek(key) {
  if (usingRedis) return Number(await redis("GET", key)) || 0;
  const c = load().counters[key];
  return c && c.until >= Date.now() ? c.n : 0;
}

export async function getMany(prefix, ids) {
  const out = await Promise.all(ids.map((id) => getJSON(`${prefix}:${id}`)));
  return out.filter(Boolean);
}

// A lock held by one process at a time (create-exclusive file, or Redis SET NX),
// so a payment is confirmed once even when several checks arrive together.
// Returns a release function, or null if someone else holds it. Stale locks
// (a crashed process) expire after ttl seconds.
// Each holder writes its own random token and only ever removes a lock that
// still carries it, so a slow holder can't free someone else's lock.
export async function acquireLock(name, ttl = 120) {
  const key = `lock:${name}`, token = crypto.randomBytes(12).toString("hex");
  if (usingRedis) {
    if (!(await redis("SET", key, token, "NX", "EX", ttl))) return null;
    return async () => { await redis("EVAL", "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token); };
  }
  const dir = path.join(dataDir(), "locks");
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { return async () => {}; } // read-only disk: one process, nothing to lock against
  const file = path.join(dir, key.replace(/[^\w.-]/g, "_"));
  try {
    // A stale lock (crashed holder) is moved aside atomically: only one process wins the rename.
    if (Date.now() - fs.statSync(file).mtimeMs > ttl * 1000) { const aside = `${file}.${token}.stale`; fs.renameSync(file, aside); fs.unlinkSync(aside); }
  } catch { /* no lock, or another process cleared it first */ }
  try { const fd = fs.openSync(file, "wx", 0o600); fs.writeSync(fd, token); fs.closeSync(fd); } catch { return null; }
  return async () => { try { if (fs.readFileSync(file, "utf8") === token) fs.unlinkSync(file); } catch { /* already gone */ } };
}

// ---- housekeeping (lib/cleanup.js) ----------------------------------------
// Every key starting with prefix.
export async function keysWithPrefix(prefix) {
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
export async function deleteKeys(keys) {
  if (!keys.length) return;
  if (usingRedis) { for (let i = 0; i < keys.length; i += 200) await redis("DEL", ...keys.slice(i, i + 200)); return; }
  mutate((db) => { for (const k of keys) delete db.kv[k]; });
}
// Take ids out of a list, leaving anything added meanwhile in place.
export async function removeFromList(list, ids) {
  if (!ids.length) return;
  if (usingRedis) { for (const id of ids) await redis("LREM", list, 0, id); return; }
  const drop = new Set(ids);
  mutate((db) => {
    if (db.lists[list]) db.lists[list] = db.lists[list].filter((id) => !drop.has(id));
    if (db.lists[list] && !db.lists[list].length) delete db.lists[list];
  });
}
// Rate-limit counters past their window (Redis expires its own).
export function purgeCounters(now = Date.now()) {
  if (usingRedis) return 0;
  return mutate((db) => {
    const old = Object.keys(db.counters || {}).filter((k) => db.counters[k].until < now);
    for (const k of old) delete db.counters[k];
    return old.length;
  });
}

// The archive files, newest first, and deleting one for good to free space.
export const ARCHIVE = () => path.join(dataDir(), "archive");
const ARCHIVE_RE = /^fresh-[\dTZ-]+\.json$/;
export function listArchives() {
  try {
    return fs.readdirSync(ARCHIVE()).filter((f) => ARCHIVE_RE.test(f))
      .map((name) => { const st = fs.statSync(path.join(ARCHIVE(), name)); return { name, bytes: st.size, at: st.mtime.toISOString() }; }).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}
export function deleteArchive(name) {
  if (!ARCHIVE_RE.test(String(name))) throw new Error("That isn't an archive file.");
  try { fs.unlinkSync(path.join(ARCHIVE(), name)); } catch { throw new Error("That archive is already gone."); }
  return { deleted: name };
}
