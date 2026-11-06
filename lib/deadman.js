// Deadman's Switch (plain-code emergency lockdown, zero AI dependency).
// Trips manually from /admin, or automatically through three graded levels:
//   Level 1, watch: one weak signal (server files differ from git HEAD
//      outside a deploy) only records a Security watch event. No freeze.
//   Level 2, confirm: the signal persists across re-checks, or a second
//      independent signal agrees. Stanley gets the evidence by email with a
//      one-tap "this was me" link. No freeze.
//   Level 3, freeze: only on a strong signal, and only money-out freezes:
//     - unexplained_balance_drop (node total drops with no matching payment)
//     - file_tampering where the code is not a signed deploy of origin/main
//     - admin_compromise (admin sign-in from a new IP within an hour of a
//       token-guessing burst)
// Failed attempts (admin_token_guess, secret_guess, passkey_forgery, pin_guessing)
// never escalate on their own. They only alert Stanley at most once an hour.
// Full design: docs/deadman.md.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { dataDir, getJSON, setJSON, hit, peek, keysWithPrefix } from "./store.js";
import { newId } from "./http.js";
import { backupNow } from "./backup.js";
import { sendEmail, OWNER_EMAIL } from "./email.js";
import {
  overridePowerForIncident,
  restorePowerAfterIncident,
  aiPaused,
  incidentUsdCap,
  INCIDENT_RESPONSE_ROLES,
  INCIDENT_DEPARTMENTS,
} from "./ai.js";

export { INCIDENT_RESPONSE_ROLES, INCIDENT_DEPARTMENTS };

export const ADMIN_BURST_THRESHOLD = 10; // wrong admin tokens in 1 hour that count as a guessing burst

// Graded response levels. Only level 3 freezes money-out.
export const DEADMAN_LEVELS = Object.freeze(["Armed", "Watch", "Confirm", "Freeze"]);

// A weak file signal becomes level 2 after this many consecutive failing
// checks (5 minutes apart) with no deploy running.
export const WATCH_CONFIRM_SIGHTINGS = 2;

// The "this was me" acknowledgement link works once and dies after a day.
// /admin always offers the same acknowledgement while a watch is open.
export const ACK_TTL_MS = 24 * 3600 * 1000;

// A deploy marker left "in-progress" longer than this is from a run that
// died, so checks resume (cron.sh clears a lock older than 10 minutes).
export const DEPLOY_STALE_MS = 15 * 60 * 1000;

// Automatic Deadman's Switch signals: ONLY signs of compromise.
// unexplained_balance_drop and admin_compromise freeze at once (level 3).
// file_tampering climbs the watch ladder (levels 1-2) unless the code itself
// is not a signed deploy of origin/main, which freezes at once (level 3).
export const DEADMAN_THRESHOLDS = Object.freeze({
  unexplained_balance_drop: { count: 1, windowSec: 600,  label: "Node total balance dropped with no matching recorded payment" },
  file_tampering:           { count: 1, windowSec: 600,  label: "Tracked server file or .htaccess modified outside git HEAD" },
  admin_compromise:         { count: 1, windowSec: 3600, label: "Successful admin sign-in from a new IP within an hour of a token-guessing burst" },
});

export const CHECKLIST_KEYS = Object.freeze([
  "attackStopped15m",
  "solvencyConfirmed",
  "forensicBackupSaved",
  "secretsRotatedIfNeeded",
  "stanleyConfirmed",
]);

const stateFile = () => path.join(dataDir(), "deadman-state.json");

function defaultChecklist() {
  return {
    attackStopped15m: false,
    solvencyConfirmed: false,
    forensicBackupSaved: false,
    secretsRotatedIfNeeded: false,
    stanleyConfirmed: false,
  };
}

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8")) || {};
    s.active = Boolean(s.active);
    s.checklist = { ...defaultChecklist(), ...(s.checklist || {}) };
    s.triggers = Array.isArray(s.triggers) ? s.triggers : [];
    s.liftHistory = Array.isArray(s.liftHistory) ? s.liftHistory : [];
    s.watch = s.watch && typeof s.watch === "object" ? s.watch : null;
    s.watchHistory = Array.isArray(s.watchHistory) ? s.watchHistory : [];
    return s;
  } catch {
    return { active: false, checklist: defaultChecklist(), triggers: [], liftHistory: [], watch: null, watchHistory: [] };
  }
}

function writeState(s) {
  try {
    const f = stateFile();
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    fs.renameSync(tmp, f);
  } catch { /* read-only disk fallback */ }
}

// Fast synchronous check used by lib/ywallet.js and lib/email.js.
export function deadmanActive() {
  return Boolean(readState().active);
}

// The likely cause in plain words, for /admin and the level-2 email.
export function causeFor(trigger, reason = "", detail = "") {
  const d = `${reason} ${detail}`;
  if (trigger === "unexplained_balance_drop") return "Sats left the node with no matching payment record. Treat it as theft until proven otherwise.";
  if (trigger === "admin_compromise") return "Someone signed in to /admin from a new connection right after many wrong tokens. If that was not you on a new network, rotate ADMIN_TOKEN before lifting.";
  if (trigger === "manual") return "Stanley tripped the switch by hand.";
  if (trigger === "drill") return "A local security drill.";
  if (trigger === "file_tampering" && /not a signed deploy|not signed by an allowed key|not on origin\/main/i.test(d)) {
    return "Server code changed to something that is not a signed deploy of main. Inspect git status and git log on the server, restore clean origin/main, and rotate secrets if server code was altered.";
  }
  if (trigger === "file_tampering" || trigger === "watch") return "Server files differ from the last deploy. A deploy in progress, a restart, or a panel change explains it. Nothing is frozen while it is only a watch.";
  return String(reason || "Emergency lockdown triggered").slice(0, 300);
}

export function deadmanStatus() {
  const s = readState();
  const active = Boolean(s.active);
  const level = active ? 3 : s.watch ? Number(s.watch.level) || 1 : 0;
  let deploy = null;
  try { deploy = deployStatus(); } catch { deploy = null; }
  return {
    active,
    level,
    levelName: DEADMAN_LEVELS[level] || "Armed",
    cause: active ? causeFor(s.trigger, s.reason, s.detail) : s.watch ? causeFor("watch", "", s.watch.detail || "") : null,
    watch: s.watch || null,
    ackOpen: Boolean(s.watch && s.watch.ackOpen),
    history: s.watchHistory || [],
    deploy,
    incidentId: s.incidentId || null,
    trippedAt: s.trippedAt || null,
    trigger: s.trigger || null,
    reason: s.reason || null,
    detail: s.detail || null,
    triggers: s.triggers || [],
    forensicBackup: s.forensicBackup || null,
    checklist: s.checklist || defaultChecklist(),
    step2: s.step2 || null,
    lastHourlyUpdateAt: s.lastHourlyUpdateAt || null,
    liftedAt: s.liftedAt || null,
    liftedBy: s.liftedBy || null,
    liftNote: s.liftNote || null,
    forcedLift: Boolean(s.forcedLift),
    liftHistory: s.liftHistory || [],
    thresholds: DEADMAN_THRESHOLDS,
    frozen: {
      yebenteSends: active,
      yebenteTransfers: active,
      yebenteBuys: active,
      yebenteReceive: false, // receiving stays ON during lockdown
      nonOwnerEmail: active,
      nodeTopup: active,
    },
  };
}

export async function tripDeadman({ trigger = "manual", reason = "", detail = "" } = {}) {
  const prev = readState();
  const now = new Date().toISOString();
  const alreadyActive = Boolean(prev.active);
  const incidentId = alreadyActive && prev.incidentId ? prev.incidentId : `inc_${newId()}`;
  const trigRule = DEADMAN_THRESHOLDS[trigger];
  const resolvedReason = String(reason || trigRule?.label || "Emergency lockdown triggered").slice(0, 300);
  const resolvedDetail = String(detail || "").slice(0, 500);

  const entry = { trigger, reason: resolvedReason, detail: resolvedDetail, at: now };
  const triggers = [...(prev.triggers || []).slice(-19), entry];
  const checklist = alreadyActive ? { ...defaultChecklist(), ...(prev.checklist || {}) } : defaultChecklist();

  // 1. Activate lockdown immediately on disk before any async I/O.
  // An open watch ends here: the freeze is the answer, so the watch history
  // keeps how the signal looked when the level rose.
  let watch = prev.watch || null;
  let watchHistory = prev.watchHistory || [];
  if (watch) {
    watchHistory = [{
      id: watch.id, kind: watch.kind, level: watch.level, firstSeen: watch.firstSeen,
      closedAt: now, outcome: trigger === "manual" || trigger === "drill" ? "cleared_on_trip" : "escalated_freeze",
      sightings: watch.sightings, detail: watch.detail,
    }, ...watchHistory].slice(0, 20);
    watch = null;
  }
  const next = {
    ...prev,
    active: true,
    incidentId,
    trippedAt: alreadyActive && prev.trippedAt ? prev.trippedAt : now,
    trigger: alreadyActive && prev.trigger ? prev.trigger : trigger,
    reason: alreadyActive && prev.reason ? prev.reason : resolvedReason,
    detail: resolvedDetail || prev.detail || "",
    triggers,
    checklist,
    watch,
    watchHistory,
  };
  writeState(next);

  // 2. Power on the incident response departments derived from INCIDENT_RESPONSE_ROLES
  // (saving Stanley's prior button state).
  try {
    overridePowerForIncident(incidentId, INCIDENT_DEPARTMENTS);
  } catch { /* non-fatal */ }

  // 3. Take an immediate forensic backup snapshot (encrypted when BACKUP_KEY is set).
  if (!alreadyActive || !next.forensicBackup?.ok) {
    try {
      const b = await backupNow(new Date());
      next.forensicBackup = { ok: true, file: b.file, bytes: b.bytes, encrypted: b.encrypted, at: now };
      next.checklist.forensicBackupSaved = true;
      writeState(next);
    } catch (err) {
      next.forensicBackup = { ok: false, error: String(err?.message || err).slice(0, 200), at: now };
      writeState(next);
    }
  }

  // 4. Step 2: coordinate background incident response tasks across responding departments.
  if (!alreadyActive || !next.step2) {
    try {
      next.step2 = await coordinateIncidentResponse({
        incidentId,
        trigger,
        reason: resolvedReason,
        detail: resolvedDetail,
      });
      next.lastHourlyUpdateAt = now;
      writeState(next);
    } catch { /* non-fatal: Step 1 lockdown always holds */ }
  }

  await setJSON("deadman:state", next);

  // 5. Send immediate owner alert email to altradits@gmail.com (once per incident).
  if (!alreadyActive) {
    const backupLine = next.forensicBackup?.ok
      ? `Forensic backup saved: ${next.forensicBackup.file} (${next.forensicBackup.encrypted ? "encrypted" : "gzip"})`
      : `Forensic backup status: ${next.forensicBackup?.error || "skipped"}`;
    const step2Line = next.step2?.aiStatus === "responding"
      ? `Step 2 team response: ACTIVE (${next.step2.taskIds?.length || 4} department tasks queued under Choumi, capped at $${incidentUsdCap().toFixed(2)} for this incident).`
      : `Step 2 team response: WAITING FOR AI CREDIT (${next.step2?.taskIds?.length || 4} department tasks queued; Step 1 lockdown holds in plain code).`;
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `[DEADMAN TRIPPED] ${trigger}: ${resolvedReason}`,
      text:
        `The Deadman's Switch has tripped and Altradits is now in emergency lockdown.\n\n` +
        `Incident ID: ${incidentId}\n` +
        `Trigger: ${trigger}\n` +
        `Reason: ${resolvedReason}\n` +
        (resolvedDetail ? `Detail: ${resolvedDetail}\n` : "") +
        `Time: ${now}\n\n` +
        `What is frozen right now:\n` +
        `• Ye₿ente outbound sends (payOut): FROZEN\n` +
        `• Ye₿ente internal transfers (transfer): FROZEN\n` +
        `• Ye₿ente M-Pesa buys (quoteBuy): FROZEN\n` +
        `• Non-security outbound emails: HELD (wallet security notices still go out)\n` +
        `• Ye₿ente receiving (invoices, LNURL, handle@altradits.com) & balance viewing: LIVE\n\n` +
        `${backupLine}\n` +
        `Response departments powered on: founder, trust, tech, finance, quality, admin, growth, personal (social & marketing stay silent; capped at $${incidentUsdCap().toFixed(2)} for this incident).\n` +
        `${step2Line}\n\n` +
        `Only you can lift this lockdown from /admin once the 5-point all-clear checklist is verified.`,
      kind: "owner",
      fromDept: "trust",
    });
  }

  return deadmanStatus();
}

export async function updateDeadmanChecklist(patch = {}, { by = "" } = {}) {
  if (by !== "stanley") {
    throw new Error("Only Stanley can update the Deadman's Switch checklist.");
  }
  const s = readState();
  s.checklist = { ...defaultChecklist(), ...(s.checklist || {}) };
  for (const k of CHECKLIST_KEYS) {
    if (k in patch) s.checklist[k] = Boolean(patch[k]);
  }
  writeState(s);
  await setJSON("deadman:state", s);
  return deadmanStatus();
}

// Refuses until every checklist item is true, unless Stanley explicitly passes
// force ("force" or true) together with a non-empty written note (which is recorded).
export async function liftDeadman({ by = "", note = "", checklist = null, force = false } = {}) {
  if (by !== "stanley") {
    throw new Error("Only Stanley can lift the Deadman's Switch.");
  }
  const prev = readState();
  const nextChecklist = {
    ...defaultChecklist(),
    ...(prev.checklist || {}),
    ...(checklist && typeof checklist === "object" ? Object.fromEntries(CHECKLIST_KEYS.filter((k) => k in checklist).map((k) => [k, Boolean(checklist[k])])) : {}),
  };
  const missing = CHECKLIST_KEYS.filter((k) => nextChecklist[k] !== true);
  const isForce = force === "force" || force === true;
  const cleanNote = String(note || "").trim().slice(0, 500);

  if (missing.length > 0) {
    if (!isForce) {
      throw new Error(`Cannot lift the Deadman's Switch until every checklist item is true (missing: ${missing.join(", ")}). Pass force: "force" with a written note to override.`);
    }
    if (!cleanNote) {
      throw new Error("Force-lifting the Deadman's Switch requires a written note.");
    }
  }

  const now = new Date().toISOString();
  const forcedLift = Boolean(missing.length > 0 && isForce);
  const liftRecord = {
    incidentId: prev.incidentId || null,
    liftedAt: now,
    liftedBy: "stanley",
    forced: forcedLift,
    missingChecklist: missing,
    note: cleanNote,
    checklist: { ...nextChecklist },
  };
  const next = {
    ...prev,
    active: false,
    liftedAt: now,
    liftedBy: "stanley",
    liftNote: cleanNote,
    forcedLift,
    checklist: nextChecklist,
    liftHistory: [liftRecord, ...(Array.isArray(prev.liftHistory) ? prev.liftHistory : []).slice(0, 49)],
  };
  // A trip always closes the open watch, but a watch opened by hand between
  // trip and lift must not survive the all-clear: the next check starts fresh.
  if (next.watch) {
    next.watchHistory = [{
      id: next.watch.id, kind: next.watch.kind, level: next.watch.level, firstSeen: next.watch.firstSeen,
      closedAt: now, outcome: "cleared_on_lift", sightings: next.watch.sightings, detail: next.watch.detail,
    }, ...(next.watchHistory || [])].slice(0, 20);
    next.watch = null;
  }
  writeState(next);

  // Restore Stanley's exact department power button states from before the incident.
  try {
    restorePowerAfterIncident();
  } catch { /* non-fatal */ }

  await setJSON("deadman:state", next);

  if (prev.active) {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `[All-clear] Deadman's Switch lifted (${prev.incidentId || "manual"})${forcedLift ? " [FORCED]" : ""}`,
      text:
        `You lifted the Deadman's Switch lockdown at ${now}.\n\n` +
        `Incident ID: ${prev.incidentId || "n/a"}\n` +
        `Mode: ${forcedLift ? `Forced override (unchecked: ${missing.join(", ")})` : "All 5 checklist items verified"}\n` +
        (cleanNote ? `Note: ${cleanNote}\n` : "") +
        `Ye₿ente outbound sends, transfers and M-Pesa buys are live again, and your department power buttons have been restored to their previous state.`,
      kind: "owner",
      fromDept: "trust",
    });
  }

  return deadmanStatus();
}

// Called by lib/attacks.js whenever a security event is recorded.
// Failed attempts (admin_token_guess, secret_guess, passkey_forgery, pin_guessing)
// NEVER escalate; admin_token_guess only increments the 1-hour burst counter
// so noteAdminSignIn() can detect a subsequent sign-in from a new IP.
// file_tampering climbs the watch ladder (levels 1-2) instead of freezing:
// only a strong signal (unexplained_balance_drop, admin_compromise, or code
// that is not a signed deploy of origin/main) freezes at once.
export async function noteAttackForDeadman(kind, detail = "") {
  if (kind === "admin_token_guess") {
    const burst = await hit("deadman:admin_guess_burst", 3600);
    return { tripped: false, count: burst };
  }
  if (kind === "file_tampering") {
    return noteFileSignal(detail);
  }
  const rule = DEADMAN_THRESHOLDS[kind];
  if (!rule) return { tripped: false, count: 0 };
  const n = await hit(`deadman:hit:${kind}`, rule.windowSec);
  if (n >= rule.count) {
    const status = await tripDeadman({
      trigger: kind,
      reason: rule.label,
      detail: detail || `${n} event(s) in ${Math.round(rule.windowSec / 60)}m window`,
    });
    return { tripped: true, count: n, status };
  }
  return { tripped: false, count: n };
}

// Level 1: one weak file signal opens a watch (the Security watch panel
// already recorded the event). Level 2: the same signal is still there on a
// later check with no deploy running, or a second signal corroborates it.
async function noteFileSignal(detail = "") {
  const s = readState();
  if (s.active) return { tripped: false, level: 3, frozen: true };
  const now = new Date().toISOString();
  const cleanDetail = String(detail || "").slice(0, 500);
  let w = s.watch && s.watch.kind === "file_tampering" ? s.watch : null;
  if (!w) {
    w = {
      id: `watch_${newId(8)}`, kind: "file_tampering", level: 1,
      firstSeen: now, lastSeen: now, sightings: 1, detail: cleanDetail,
      emailedAt: null, ackOpen: false, ackId: null,
    };
    s.watch = w;
    writeState(s);
    await setJSON("deadman:state", s);
    return { tripped: false, level: 1, watch: w };
  }
  w.sightings += 1;
  w.lastSeen = now;
  if (cleanDetail) w.detail = cleanDetail;
  s.watch = w;
  writeState(s);
  if (w.level === 1 && w.sightings >= WATCH_CONFIRM_SIGHTINGS && !deployStatus().inProgress) {
    await escalateWatch("the same signal was still there on the next check, after any deploy had finished");
    return { tripped: false, level: 2, watch: readState().watch };
  }
  await setJSON("deadman:state", s);
  return { tripped: false, level: w.level, watch: w };
}

function closeWatchInto(s, w, outcome, note = "") {
  const entry = {
    id: w.id, kind: w.kind, level: w.level, firstSeen: w.firstSeen,
    closedAt: new Date().toISOString(), outcome, note: String(note || "").slice(0, 300),
    sightings: w.sightings, detail: w.detail,
  };
  s.watchHistory = [entry, ...(s.watchHistory || [])].slice(0, 20);
  s.watch = null;
  return entry;
}

// Level 2: email Stanley the exact evidence with a one-tap "this was me"
// link. The link is a 256-bit token, stored hashed like the wallet freeze
// link, single-use, dead after ACK_TTL_MS. Nothing freezes.
export async function escalateWatch(reason = "") {
  const s = readState();
  const w = s.watch;
  if (!w || s.active || w.level >= 2) return { escalated: false, level: w?.level || 0 };
  const now = new Date().toISOString();
  const token = crypto.randomBytes(32).toString("base64url");
  const fh = crypto.createHash("sha256").update(token).digest("hex");
  await setJSON(`dmack:${fh}`, {
    watchId: w.id, fh, expiresAt: new Date(Date.now() + ACK_TTL_MS).toISOString(), used: false,
  });
  w.level = 2;
  w.escalatedAt = now;
  w.escalateReason = String(reason || "").slice(0, 300);
  w.emailedAt = now;
  w.ackOpen = true;
  w.ackId = fh;
  s.watch = w;
  writeState(s);
  await setJSON("deadman:state", s);
  const base = (process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "");
  await sendEmail({
    to: OWNER_EMAIL,
    subject: "[Security watch] Server files differ from the last deploy. Was this you?",
    text:
      `Something on the server changed outside a deploy, and it is still changed.\n\n` +
      `Evidence: ${w.detail || "server files differ from git HEAD"}\n` +
      `First seen: ${w.firstSeen}. Seen ${w.sightings} time(s).\n` +
      `Likely cause: ${causeFor("watch")}\n\n` +
      `Nothing is frozen. Money in and out works as normal.\n\n` +
      `If this was you (a deploy, a restart, a panel change), close this watch with one tap:\n` +
      `${base}/api/deadman?t=${token}\n\n` +
      `The link works once and expires in 24 hours. You can also close the watch from /admin.\n\n` +
      `If it was not you, do not tap the link. Open /admin, read the Security watch, and trip the switch by hand if the change looks hostile.`,
    kind: "owner",
    fromDept: "trust",
  });
  return { escalated: true, level: 2 };
}

// A level-1 or level-2 signal that clears on its own (the file returned to
// HEAD after a deploy) closes without a lockdown. When level 2 already
// emailed, Stanley gets a short all-clear so the thread ends.
export async function resolveWatch(reason = "") {
  const s = readState();
  const w = s.watch;
  if (!w || s.active) return { resolved: false };
  const entry = closeWatchInto(s, w, "resolved", reason || "the signal cleared on its own");
  writeState(s);
  await setJSON("deadman:state", s);
  if (w.level >= 2 && w.emailedAt) {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: "[Security watch] All clear: the file signal resolved itself",
      text:
        `The file change from ${w.firstSeen} is gone. The files match the last deploy again.\n\n` +
        `No action needed. Nothing was ever frozen.`,
      kind: "owner",
      fromDept: "trust",
    });
  }
  return { resolved: true, entry };
}

// What the ack page may show before Stanley taps: kind and timing only,
// never file names or evidence.
export async function previewAck(token) {
  const rec = await readAckRecord(String(token || ""));
  if (!rec) return { ok: false };
  const s = readState();
  const w = s.watch;
  if (!w || w.id !== rec.watchId) return { ok: false };
  return { ok: true, firstSeen: w.firstSeen, sightings: w.sightings, expiresAt: rec.expiresAt };
}

async function readAckRecord(token) {
  if (!/^[\w-]{20,128}$/.test(token)) return null;
  const h = crypto.createHash("sha256").update(token).digest("hex");
  const rec = await getJSON(`dmack:${h}`);
  // The stored hash is compared in constant time, so a wrong guess learns nothing from how long it takes.
  if (!rec || !/^[0-9a-f]{64}$/.test(rec.fh || "") || !crypto.timingSafeEqual(Buffer.from(rec.fh, "hex"), Buffer.from(h, "hex"))) return null;
  const exp = Date.parse(rec.expiresAt);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if (rec.used) return null;
  return rec;
}

// The one-tap link: strictly single-use. A replay, an expired link, or a
// bogus token all fail without saying which (the page keeps one message).
export async function acknowledgeWatch(token) {
  const rec = await readAckRecord(String(token || ""));
  if (!rec) return { ok: false };
  const s = readState();
  const w = s.watch;
  if (!w || s.active || w.id !== rec.watchId) return { ok: false };
  await setJSON(`dmack:${rec.fh}`, { ...rec, used: true });
  const entry = closeWatchInto(s, w, "acknowledged", "Stanley tapped: this was me");
  writeState(s);
  await setJSON("deadman:state", s);
  return { ok: true, entry };
}

// The same acknowledgement from /admin (Stanley is already signed in there).
// Safe to call with no watch open: it just reports that.
export async function acknowledgeWatchAsStanley() {
  const s = readState();
  const w = s.watch;
  if (!w || s.active) return { ok: false, reason: s.active ? "a lockdown lifts only by checklist" : "no open watch" };
  if (w.ackId) {
    const rec = await getJSON(`dmack:${w.ackId}`);
    if (rec && !rec.used) await setJSON(`dmack:${w.ackId}`, { ...rec, used: true });
  }
  const entry = closeWatchInto(s, w, "acknowledged", "Stanley confirmed from /admin: this was me");
  writeState(s);
  await setJSON("deadman:state", s);
  return { ok: true, entry };
}

// Called by api/admin.js on a successful admin token check.
// If the sign-in comes from a new IP within an hour of a token-guessing burst
// (>= ADMIN_BURST_THRESHOLD wrong tokens in the last hour), trips the Deadman's Switch.
export async function noteAdminSignIn(ip = "local") {
  const ipKey = String(ip || "local").slice(0, 32);
  const known = (await getJSON("secw:admin_ips")) || [];
  const isKnown = Array.isArray(known) && known.includes(ipKey);
  const burst = await peek("deadman:admin_guess_burst");

  if (!isKnown && burst >= ADMIN_BURST_THRESHOLD) {
    const detail = `Successful admin sign-in from a new connection (${ipKey}) within an hour of ${burst} wrong admin token guesses`;
    const { recordAttack } = await import("./attacks.js");
    await recordAttack("admin_compromise", { where: "/api/admin", ip: ipKey, detail });
    return { tripped: true, burst, ip: ipKey, isKnown: false };
  }

  if (!isKnown) {
    // Two independent signals agree: a new connection while a file watch is
    // open confirms the watch (level 2, still no freeze).
    let escalated = false;
    const s = readState();
    if (s.watch && s.watch.level === 1 && !s.active) {
      const r = await escalateWatch("an admin sign-in from a new connection arrived while the files differed").catch(() => null);
      escalated = Boolean(r?.escalated);
    }
    const nextKnown = [ipKey, ...(Array.isArray(known) ? known : [])].slice(0, 50);
    await setJSON("secw:admin_ips", nextKnown);
    return { tripped: false, burst, ip: ipKey, isKnown: false, escalated };
  }
  return { tripped: false, burst, ip: ipKey, isKnown };
}

// Is a deploy running right now? deploy/cron.sh holds the .deploy.lock
// directory while it works, and writes .deploy-marker.json with start/end.
// Either one live means "expect the tree to move": file checks defer.
export function deployStatus(rootDir = process.cwd()) {
  const dir = String(rootDir || process.cwd());
  let lockHeld = false;
  try {
    lockHeld = fs.statSync(path.join(dir, ".deploy.lock")).isDirectory();
  } catch { lockHeld = false; }
  let marker = null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, ".deploy-marker.json"), "utf8"));
    if (m && typeof m === "object") {
      marker = {
        state: String(m.state || ""),
        startedAt: String(m.startedAt || ""),
        endedAt: String(m.endedAt || ""),
        oldHead: String(m.oldHead || "").slice(0, 40),
        newHead: String(m.newHead || "").slice(0, 40),
      };
    }
  } catch { marker = null; }
  const startedMs = marker && marker.startedAt ? Date.parse(marker.startedAt) : NaN;
  const markerLive = Boolean(marker && marker.state === "in-progress" && Number.isFinite(startedMs) && Date.now() - startedMs < DEPLOY_STALE_MS);
  return { inProgress: lockHeld || markerLive, lockHeld, marker };
}

// Is the running code a legitimate deploy? Legitimate means HEAD sits on the
// origin/main line. A HEAD behind the tip is an old deploy with one pending:
// legitimate without further checks (the tip is signature-checked by cron.sh
// before it deploys, and again here once it becomes HEAD). A HEAD equal to
// the tip additionally needs an allowed signature when a trusted-signers
// file exists. Anything off the line (a local commit no deploy made) is
// illegitimate. "unknown" (no origin/main here, as in tests or a fresh
// clone) skips the strong-signal path: only proof, never absence, freezes.
export function headStatus(rootDir = process.cwd(), { signersFile = null } = {}) {
  const dir = String(rootDir || process.cwd());
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch { return null; }
  };
  const head = run(["rev-parse", "HEAD"]);
  const main = run(["rev-parse", "origin/main"]);
  if (!head || !main) return { state: "unknown", head, main, reason: "origin/main could not be read here, so the HEAD check is skipped" };
  if (head !== main) {
    let ancestor = false;
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd: dir, stdio: "ignore" });
      ancestor = true;
    } catch { ancestor = false; }
    if (!ancestor) {
      return { state: "illegitimate", head, main, reason: `HEAD (${head.slice(0, 7)}) is not on origin/main (${main.slice(0, 7)}): code no deploy made` };
    }
    return { state: "legit", head, main, behindBy: "pending", reason: "" };
  }
  let signers = signersFile;
  if (!signers) {
    const homeCopy = process.env.HOME ? path.join(process.env.HOME, ".altradits-allowed-signers") : null;
    if (homeCopy && fs.existsSync(homeCopy)) signers = homeCopy;
    else if (fs.existsSync(path.join(dir, ".github/allowed_signers"))) signers = path.join(dir, ".github/allowed_signers");
  }
  if (!signers || !fs.existsSync(signers)) {
    return { state: "legit", head, main, signature: "skipped", reason: "" };
  }
  let sigOk = false;
  try {
    execFileSync("git", ["-c", "gpg.format=ssh", "-c", `gpg.ssh.allowedSignersFile=${signers}`, "verify-commit", "HEAD"], { cwd: dir, stdio: "ignore" });
    sigOk = true;
  } catch { sigOk = false; }
  if (!sigOk) {
    // Servers with OpenSSH older than 8.2 can't run git's SSH check: the
    // same signature is checked in Node. The helper travels with this
    // module, not with the tree under check.
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL("../deploy/verify-sshsig.mjs", import.meta.url)), "HEAD", signers], { cwd: dir, stdio: "ignore" });
      sigOk = true;
    } catch { sigOk = false; }
  }
  if (!sigOk) {
    return { state: "illegitimate", head, main, signature: "bad", reason: `HEAD (${head.slice(0, 7)}) sits on origin/main but is not signed by an allowed key` };
  }
  return { state: "legit", head, main, signature: "good", reason: "" };
}

// Record a legitimate owner channel action or tip refund so Trigger 4
// (unexplained_balance_drop) knows the outbound sats were authorized.
export async function recordNodeAction({ sats, reason = "owner_node_action", by = "stanley" } = {}) {
  const amount = Math.max(0, Math.floor(Number(sats) || 0));
  if (!amount) throw new Error("sats must be a positive number.");
  const list = (await getJSON("secw:node_actions")) || [];
  const entry = {
    id: newId(),
    sats: amount,
    reason: String(reason || "owner_node_action").slice(0, 200),
    by: String(by || "stanley"),
    at: new Date().toISOString(),
  };
  const next = [entry, ...list.slice(0, 199)];
  await setJSON("secw:node_actions", next);
  return entry;
}

async function sumRecordedOutboundSince(sinceIso, alreadyAccountedIds = []) {
  const sinceMs = Date.parse(sinceIso) || 0;
  const seen = new Set(Array.isArray(alreadyAccountedIds) ? alreadyAccountedIds : []);
  const newlyAccounted = [];
  let sats = 0;

  // 1. Ye₿ente wallet ledger entries (ywe:*) with kind === "send"
  const eventKeys = await keysWithPrefix("ywe:");
  for (const k of eventKeys) {
    const ev = await getJSON(k);
    const id = ev?.id || k;
    if (ev && ev.kind === "send" && !seen.has(id) && (Date.parse(ev.at) || 0) >= sinceMs) {
      sats += (Math.abs(Number(ev.sats)) || 0) + (Math.abs(Number(ev.feeSats)) || 0);
      newlyAccounted.push(id);
    }
  }

  // 2. Owner-recorded node actions or tip refunds (secw:node_actions)
  const actions = (await getJSON("secw:node_actions")) || [];
  for (const a of actions) {
    const id = a?.id;
    if (a && id && !seen.has(id) && (Date.parse(a.at) || 0) >= sinceMs) {
      sats += Math.abs(Number(a.sats)) || 0;
      newlyAccounted.push(id);
    }
  }

  return { sats, accountedIds: [...seen, ...newlyAccounted].slice(-500) };
}

// Fires ONLY when the node's total balance (channels + on-chain) drops with no
// matching recorded payment (Ye₿ente send, tip refund, or an owner channel action).
// Custodial solvency shortfall is handled separately by checkSolvency() in lib/attacks.js.
export async function checkNodeBalance({
  totalSats,
  channelSats = 0,
  pendingOpenSats = 0,
  unsettledSats = 0,
  onchainSats = 0,
  unconfirmedSats = 0,
  limboSats = 0,
  recordedOutSats = 0,
  feeAllowanceSats = 5000,
} = {}) {
  const currentTotal = typeof totalSats === "number"
    ? Math.floor(totalSats)
    : Math.floor(
        (Number(channelSats) || 0) +
        (Number(pendingOpenSats) || 0) +
        (Number(unsettledSats) || 0) +
        (Number(onchainSats) || 0) +
        (Number(unconfirmedSats) || 0) +
        (Number(limboSats) || 0),
      );
  const now = new Date().toISOString();
  const prev = await getJSON("secw:nodebal");

  if (!prev || typeof prev.totalSats !== "number") {
    await setJSON("secw:nodebal", { totalSats: currentTotal, at: now, accountedIds: [] });
    return { ok: true, totalSats: currentTotal, dropSats: 0, accountedSats: 0, unexplainedSats: 0 };
  }

  const dropSats = Math.max(0, prev.totalSats - currentTotal);
  if (dropSats === 0) {
    await setJSON("secw:nodebal", { totalSats: currentTotal, at: now, accountedIds: prev.accountedIds || [] });
    return { ok: true, totalSats: currentTotal, dropSats: 0, accountedSats: 0, unexplainedSats: 0 };
  }

  const { sats: fromStore, accountedIds } = await sumRecordedOutboundSince(prev.at, prev.accountedIds);
  const accountedSats = Math.max(0, Math.floor(Number(recordedOutSats) || 0)) + fromStore;
  const unexplainedSats = Math.max(0, dropSats - accountedSats);
  await setJSON("secw:nodebal", { totalSats: currentTotal, at: now, accountedIds });

  if (unexplainedSats > feeAllowanceSats) {
    const detail = `Node total balance dropped by ${dropSats} sats (${prev.totalSats} → ${currentTotal} sats); ${accountedSats} sats recorded, ${unexplainedSats} sats unexplained`;
    const { recordAttack } = await import("./attacks.js");
    await recordAttack("unexplained_balance_drop", { where: "LND node", detail });
    return { ok: false, totalSats: currentTotal, dropSats, accountedSats, unexplainedSats, detail };
  }

  return { ok: true, totalSats: currentTotal, dropSats, accountedSats, unexplainedSats: 0 };
}

// CloudLinux / DirectAdmin "Setup Node.js App" writes and updates the
// `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN ... END` (and
// optional `CLOUDLINUX ENV VARS CONFIGURATION`) block inside `.htaccess`.
// Those panel-managed blocks must never trip file_tampering, provided every
// line inside them is a benign Passenger/SetEnv directive and everything
// outside them matches git HEAD. A variable saved with an empty value is
// written as a bare `SetEnv NAME`, which is harmless (it tripped on 6 Nov 2026).
const CLOUDLINUX_BLOCK_RE = /^# DO NOT REMOVE[^\n]*CLOUDLINUX (?:PASSENGER|ENV VARS) CONFIGURATION BEGIN[ \t]*\r?\n([\s\S]*?)^# DO NOT REMOVE[^\n]*CLOUDLINUX (?:PASSENGER|ENV VARS) CONFIGURATION END[ \t]*\r?\n?/gm;
const SAFE_CLOUDLINUX_LINE_RE = /^\s*(?:#.*|Passenger[A-Za-z]+\s+.+|SetEnv\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+.*)?|<\/?IfModule\b[^>]*>)?\s*$/;

export function hasOnlySafeCloudLinuxBlocks(txt) {
  const s = String(txt || "");
  for (const m of s.matchAll(CLOUDLINUX_BLOCK_RE)) {
    const lines = String(m[1] || "").split(/\r?\n/);
    for (const line of lines) {
      if (!SAFE_CLOUDLINUX_LINE_RE.test(line)) return false;
    }
  }
  return true;
}

export function stripCloudLinuxBlocks(txt) {
  return String(txt || "")
    .replace(/\r\n/g, "\n")
    .replace(CLOUDLINUX_BLOCK_RE, "")
    .trim();
}

// Why .htaccess differs from git HEAD once the panel blocks are set aside:
// null when it doesn't. The reason names a line number only, never the
// line's text, which may hold a secret from the env block.
function htaccessDiffAgainstHead(rootDir) {
  const htPath = path.join(rootDir, ".htaccess");
  if (!fs.existsSync(htPath)) return ".htaccess is missing";
  try {
    const diskTxt = fs.readFileSync(htPath, "utf8");
    if (!hasOnlySafeCloudLinuxBlocks(diskTxt)) return "a line inside the CloudLinux blocks is not a Passenger or SetEnv line";
    let headTxt;
    try {
      headTxt = execFileSync("git", ["show", "HEAD:.htaccess"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return "git could not read .htaccess at HEAD";
    }
    const disk = stripCloudLinuxBlocks(diskTxt).split("\n");
    const head = stripCloudLinuxBlocks(headTxt).split("\n");
    if (disk.join("\n") === head.join("\n")) return null;
    let i = 0;
    while (i < disk.length && i < head.length && disk[i] === head[i]) i++;
    return `outside the CloudLinux blocks, line ${i + 1} differs from git HEAD (${disk.length} lines on disk, ${head.length} at HEAD, panel blocks set aside)`;
  } catch {
    return ".htaccess could not be read";
  }
}

// Verifies .htaccess deny rules and checks that tracked server files match git HEAD.
// A deploy in progress defers the whole file check: cron.sh rewrites the tree
// under the check, and judging a half-written tree caused the false freeze of
// 6 Nov 2026. Legitimate deploys of merged `main` commits advance HEAD via
// `git reset --hard origin/main`, leaving `git status --porcelain` clean.
// DirectAdmin updates to the CloudLinux panel blocks in `.htaccess` are also ignored.
// Weak findings climb the watch ladder; only code that is not a signed deploy
// of origin/main is a strong signal (strong: true).
export async function checkFileIntegrity({ rootDir = process.cwd(), checkGit = true } = {}) {
  const deploy = deployStatus(rootDir);
  if (deploy.inProgress) {
    return { ok: true, deferred: true, problems: [], detail: "", strong: false, deploy };
  }
  const problems = [];
  let strong = false;

  // 1. Check .htaccess protection files if present in rootDir
  const rootHtaccess = path.join(rootDir, ".htaccess");
  if (fs.existsSync(rootHtaccess)) {
    const txt = fs.readFileSync(rootHtaccess, "utf8");
    if (!txt.includes("<FilesMatch")) {
      problems.push(".htaccess is missing <FilesMatch deny rule");
    }
    if (!hasOnlySafeCloudLinuxBlocks(txt)) {
      problems.push(".htaccess contains non-Passenger directives inside the CloudLinux block");
    }
  }
  for (const dir of ["lib", "api", "data", "deploy", "test"]) {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    const ht = path.join(dirPath, ".htaccess");
    if (!fs.existsSync(ht)) {
      problems.push(`${dir}/.htaccess is missing`);
    } else if (!fs.readFileSync(ht, "utf8").includes("Require all denied")) {
      problems.push(`${dir}/.htaccess is missing 'Require all denied'`);
    }
  }

  // 2. Check tracked server files against git HEAD (ignores untracked files,
  // clean deploys where HEAD moved to origin/main, and DirectAdmin Passenger
  // block updates in .htaccess).
  if (checkGit && fs.existsSync(path.join(rootDir, ".git"))) {
    try {
      const watched = ["server.mjs", "lib", "api", "deploy", ".htaccess"]
        .filter((p) => fs.existsSync(path.join(rootDir, p)));
      if (watched.length) {
        const out = execFileSync(
          "git",
          ["status", "--porcelain", "--untracked-files=no", "--", ...watched],
          { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        ).trim();
        if (out) {
          let htReason = null;
          const lines = out
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .filter((line) => {
              // Ignore M .htaccess if only DirectAdmin's CloudLinux Passenger block changed
              if (/^M\s+\.htaccess$/.test(line)) {
                htReason = htaccessDiffAgainstHead(rootDir);
                if (!htReason) return false;
              }
              return true;
            });
          if (lines.length) {
            problems.push(`Tracked server files modified outside git HEAD: ${lines.join(", ")}${htReason ? ` (.htaccess: ${htReason})` : ""}`);
          }
        }
      }
    } catch { /* git binary unavailable in restricted env */ }

    // HEAD itself moved: legitimate only when it sits on origin/main (equal,
    // or behind while a deploy is pending) and carries an allowed signature.
    const hs = headStatus(rootDir);
    if (hs.state === "illegitimate") {
      problems.push(`Server code is not a signed deploy of main: ${hs.reason}`);
      strong = true;
    }
  }

  if (problems.length) {
    const detail = problems.join("; ");
    const { recordAttack } = await import("./attacks.js");
    await recordAttack("file_tampering", { where: "server files", detail });
    return { ok: false, problems, detail, strong, deferred: false };
  }

  return { ok: true, problems: [], strong: false, deferred: false };
}

// Scheduled every 5 minutes (by server.mjs timer and every /healthz ping from
// deploy/cron.sh): runs checkFileIntegrity and, when the node is connected,
// checkNodeBalance. A deferred file check (deploy running) judges nothing but
// the balance check still runs: money movement never waits for a deploy.
export async function runDeadmanChecks({ rootDir = process.cwd(), force = false, totalSats = undefined } = {}) {
  const last = await getJSON("deadman:check:last");
  if (!force && last && Date.now() - Date.parse(last) < 5 * 60 * 1000) {
    return { skipped: true, last };
  }
  const at = new Date().toISOString();
  await setJSON("deadman:check:last", at);

  const files = await checkFileIntegrity({ rootDir });
  if (files.strong) {
    await tripDeadman({
      trigger: "file_tampering",
      reason: "Server code changed outside a signed deploy of main",
      detail: files.detail,
    });
  } else if (files.ok && !files.deferred) {
    await resolveWatch("the signal cleared on its own");
  }
  let balance = null;
  if (typeof totalSats === "number") {
    balance = await checkNodeBalance({ totalSats });
  } else if (process.env.LND_REST_URL) {
    const { nodeTotalBalance } = await import("./lightning.js");
    const nb = await nodeTotalBalance();
    if (nb && typeof nb.totalSats === "number") {
      balance = await checkNodeBalance(nb);
    }
  }
  if (deadmanActive()) {
    await sendIncidentHourlyUpdate().catch(() => {});
  }
  const st = deadmanStatus();
  return { skipped: false, at, files, balance, level: st.level, watch: st.watch };
}

// Step 2: Choumi coordinates the responding departments during a Deadman's Switch lockdown.
// Social & Content and Marketing remain silent (no tasks queued).
export async function coordinateIncidentResponse({ incidentId = "inc_manual", trigger = "manual", reason = "", detail = "" } = {}) {
  const { createTask } = await import("./ops.js");
  const { workersLive } = await import("./workers.js");
  const contextLine = `Incident ${incidentId} · Trigger: ${trigger}${reason ? ` (${reason})` : ""}${detail ? `\nDetail: ${detail}` : ""}`;

  const specs = [
    {
      department: "tech",
      service: "website-care",
      title: `Incident ${incidentId}: Investigate logs, deploys, served files, and read-only node activity`,
      details: `${contextLine}\n\nRole: ${INCIDENT_RESPONSE_ROLES.tech.role}.\nInspect server integrity, recent deploys, security events, and read-only LND status (never touch admin.macaroon). Identify the entry vector and what must be closed.`,
    },
    {
      department: "admin",
      service: "bookkeeping-prep",
      title: `Incident ${incidentId}: Verify forensic backup and reconcile Ye₿ente ledger against node balance`,
      details: `${contextLine}\n\nRole: ${INCIDENT_RESPONSE_ROLES.admin.role}.\nConfirm the forensic backup snapshot is intact and reconcile Ye₿ente wallet balances and payment records against the node's read-only balance.`,
    },
    {
      department: "growth",
      service: "customer-support",
      title: `Incident ${incidentId}: Draft calm status notice for Ye₿ente users (for Stanley's approval)`,
      details: `${contextLine}\n\nRole: ${INCIDENT_RESPONSE_ROLES.growth.role}.\nDraft a short, calm, factual notice for Ye₿ente users explaining that outbound sends and M-Pesa buys are temporarily paused for a safety check while receiving remains open. Queue for Stanley's approval only; never send directly.`,
    },
    {
      department: "personal",
      service: "inbox-calendar",
      title: `Incident ${incidentId}: Build Stanley's timed step-by-step containment & secret-rotation checklist`,
      details: `${contextLine}\n\nRole: ${INCIDENT_RESPONSE_ROLES.personal.role}.\nPrepare a timed, step-by-step checklist for Stanley on a clean device: 1) verify attack stopped 15m, 2) confirm solvency, 3) verify forensic backup, 4) rotate any exposed secrets, 5) confirm all-clear before lifting.`,
    },
  ];

  const tasks = [];
  for (const sp of specs) {
    const t = await createTask({
      ...sp,
      incidentId,
      urgency: "minutes",
      internal: true,
      trustedInternal: true,
      by: "Choumi Yakunte",
    });
    tasks.push({ id: t.id, department: t.department, title: t.title });
  }

  const aiReadyNow = workersLive() && !aiPaused();
  return {
    incidentId,
    at: new Date().toISOString(),
    lead: "Choumi Yakunte",
    aiStatus: aiReadyNow ? "responding" : "waiting_for_credit",
    usdCap: incidentUsdCap(),
    taskIds: tasks.map((t) => t.id),
    tasks,
    silentDepartments: ["social", "marketing"],
    roles: INCIDENT_RESPONSE_ROLES,
  };
}

// Hourly update to Stanley at altradits@gmail.com while the switch is active.
export async function sendIncidentHourlyUpdate({ force = false, now = Date.now() } = {}) {
  const s = readState();
  if (!s.active) return { sent: false, reason: "inactive" };
  const lastMs = s.lastHourlyUpdateAt ? Date.parse(s.lastHourlyUpdateAt) : 0;
  if (!force && lastMs && now - lastMs < 3600_000) {
    return { sent: false, reason: "not_due", lastHourlyUpdateAt: s.lastHourlyUpdateAt };
  }

  const { getTask } = await import("./ops.js");
  const taskIds = s.step2?.taskIds || [];
  const taskLines = [];
  for (const id of taskIds) {
    const t = await getTask(id);
    if (t) {
      taskLines.push(`• [${t.department}] ${t.title}: ${t.status}${t.deliverable?.summary ? `: ${t.deliverable.summary.slice(0, 140)}` : ""}`);
    }
  }

  const checklist = s.checklist || defaultChecklist();
  const missing = CHECKLIST_KEYS.filter((k) => !checklist[k]);
  const nextStep = missing[0] || "All 5 checklist items verified. Ready for you to lift the switch in /admin.";
  const stamp = new Date(now).toISOString();

  s.lastHourlyUpdateAt = stamp;
  writeState(s);
  await setJSON("deadman:state", s);

  const mail = await sendEmail({
    to: OWNER_EMAIL,
    subject: `[DEADMAN UPDATE] ${s.incidentId || "active"}: ${missing.length} checklist item(s) remaining`,
    text:
      `Hourly Deadman's Switch status update (${stamp}).\n\n` +
      `What is known:\n` +
      `• Incident: ${s.incidentId || "active"} (${s.trigger || "manual"}: ${s.reason || "lockdown"})\n` +
      `• Tripped at: ${s.trippedAt || "unknown"}\n` +
      (taskLines.length ? `\nStep 2 department tasks:\n${taskLines.join("\n")}\n` : "") +
      `\nWhat is frozen:\n` +
      `• Ye₿ente sends, internal transfers & M-Pesa buys: FROZEN (receiving stays LIVE)\n` +
      `• Non-security outbound emails: HELD\n\n` +
      `5-point all-clear checklist (${CHECKLIST_KEYS.length - missing.length}/${CHECKLIST_KEYS.length} complete):\n` +
      CHECKLIST_KEYS.map((k) => `• [${checklist[k] ? "x" : " "}] ${k}`).join("\n") +
      `\n\nNext step for you: ${nextStep}`,
    kind: "owner",
    fromDept: "trust",
  });

  return { sent: true, at: stamp, emailId: mail.id, missing };
}

// Monthly security drill: runs Step 1 + Step 2 on a local copy only, verifies
// lockdown, power button overrides, checklist gating, clean lift, and records
// what the drill taught in the learning engine (docs/choumi-return.md §6).
export async function runSecurityDrill({
  scenario = "file_tampering",
  lesson = "Verify .htaccess and tracked server files match git HEAD, confirm forensic backup encryption, and check Ye₿ente solvency before lifting lockdown.",
  now = new Date(),
} = {}) {
  const isProdEnv = process.env.NODE_ENV === "production";
  const isLiveSite = /^https?:\/\/(www\.)?altradits\.com(\/|$)/i.test(process.env.SITE_URL || "");
  if (isProdEnv || isLiveSite) {
    throw new Error("Security drills run only on a local copy, never on the live production site.");
  }
  if (deadmanActive()) {
    throw new Error("Cannot start a security drill while a real Deadman's Switch lockdown is active.");
  }

  const startedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const tripped = await tripDeadman({
    trigger: "drill",
    reason: `Monthly security drill (${scenario})`,
    detail: lesson,
  });

  const step1Verified = Boolean(
    tripped.active &&
    tripped.frozen.yebenteSends &&
    tripped.frozen.yebenteTransfers &&
    tripped.frozen.yebenteBuys &&
    tripped.frozen.yebenteReceive === false &&
    tripped.frozen.nonOwnerEmail,
  );
  const step2Verified = Boolean(
    tripped.step2 &&
    Array.isArray(tripped.step2.taskIds) &&
    tripped.step2.taskIds.length === 4 &&
    tripped.step2.silentDepartments.includes("social") &&
    tripped.step2.silentDepartments.includes("marketing"),
  );

  // Cancel the drill tasks so they don't sit open after the drill lifts, and complete checklist.
  const { cancelTask } = await import("./ops.js");
  for (const tid of tripped.step2?.taskIds || []) {
    await cancelTask(tid, { note: "Completed local security drill", by: "stanley" }).catch(() => {});
  }

  await updateDeadmanChecklist(
    {
      attackStopped15m: true,
      solvencyConfirmed: true,
      forensicBackupSaved: true,
      secretsRotatedIfNeeded: true,
      stanleyConfirmed: true,
    },
    { by: "stanley" },
  );

  const lifted = await liftDeadman({
    by: "stanley",
    note: `Completed local security drill (${scenario})`,
  });

  const { recordOutcome } = await import("./learning.js");
  const learned = await recordOutcome({
    kind: "security_drill",
    dept: "tech",
    service: "website-care",
    scenario,
    note: lesson,
  });

  const report = {
    id: `drill_${newId(8)}`,
    at: startedAt,
    completedAt: new Date().toISOString(),
    scenario,
    lesson,
    incidentId: tripped.incidentId,
    step1Verified,
    step2Verified,
    liftedCleanly: !lifted.active && !lifted.forcedLift,
    trajectoryId: learned?.traj?.id || null,
  };
  await setJSON("deadman:drill:latest", report);
  return report;
}

export const lastSecurityDrill = () => getJSON("deadman:drill:latest");
