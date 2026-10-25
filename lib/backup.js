// Daily backup of the data store: a compressed snapshot in ~/altradits-backups
// (BACKUP_DIR to change it), owner-only, encrypted with BACKUP_KEY when set
// (AES-256-GCM, key derived with scrypt). Keeps 14 daily and 8 weekly copies.
// Restore with: node deploy/restore-backup.mjs <file> > db.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { dataDir, usingRedis, keysWithPrefix, getJSON, listIds } from "./store.js";

export const backupDir = () => process.env.BACKUP_DIR || path.join(os.homedir(), "altradits-backups");
const MAGIC = Buffer.from("ALTBK1");

export function seal(buf, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", crypto.scryptSync(pass, salt, 32), iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
export function unseal(buf, pass) {
  if (!buf.subarray(0, 6).equals(MAGIC)) return buf; // not encrypted
  const salt = buf.subarray(6, 22), iv = buf.subarray(22, 34), tag = buf.subarray(34, 50);
  const d = crypto.createDecipheriv("aes-256-gcm", crypto.scryptSync(pass, salt, 32), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(50)), d.final()]);
}

async function snapshot() {
  if (!usingRedis) return fs.readFileSync(path.join(dataDir(), "db.json"));
  // Redis: every key and the lists the site uses.
  const kv = {};
  for (const k of await keysWithPrefix("")) { try { kv[k] = await getJSON(k); } catch { /* lists and counters are not JSON values */ } }
  const lists = {};
  for (const l of ["leads", "proposals", "tasks", "approvals", "subs", "emails", "approvalq", "stan:instrs", "members", "jobs"]) lists[l] = await listIds(l, 100000);
  return Buffer.from(JSON.stringify({ kv, lists, counters: {} }));
}

export async function backupNow(now = new Date()) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let data = zlib.gzipSync(await snapshot());
  const key = process.env.BACKUP_KEY;
  if (key) data = seal(data, key);
  const name = `db-${now.toISOString().slice(0, 10)}${now.getUTCDay() === 0 ? "-weekly" : ""}.json.gz${key ? ".enc" : ""}`;
  fs.writeFileSync(path.join(dir, name), data, { mode: 0o600 });
  // Rotation: the newest 14 daily and 8 weekly snapshots.
  const files = fs.readdirSync(dir).filter((f) => /^db-\d{4}-\d{2}-\d{2}/.test(f)).sort().reverse();
  const weekly = files.filter((f) => f.includes("-weekly")), daily = files.filter((f) => !f.includes("-weekly"));
  for (const f of [...daily.slice(14), ...weekly.slice(8)]) fs.unlinkSync(path.join(dir, f));
  return { file: name, bytes: data.length, encrypted: Boolean(key), kept: Math.min(daily.length, 14) + Math.min(weekly.length, 8) };
}

export function readBackup(file, key = process.env.BACKUP_KEY) {
  const raw = fs.readFileSync(file);
  const plain = unseal(raw, key || "");
  return JSON.parse(zlib.gunzipSync(plain).toString("utf8"));
}
