// Tiny key-value store. In production it talks to Upstash Redis (or Vercel KV,
// which is Upstash underneath) over REST. Without those env vars it falls back
// to a JSON file in .data/ so the whole funnel runs locally.
import fs from "node:fs";
import path from "node:path";

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
const FILE = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "db.json");
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
