// Deadman's Switch, step 1 (plain-code emergency lockdown, zero AI dependency).
// Trips manually from /admin or automatically ONLY on signs of compromise:
//   1. unexplained_balance_drop (node total balance drops without a matching payment)
//   2. file_tampering (tracked server file or .htaccess modified outside git HEAD,
//      ignoring DirectAdmin's CloudLinux Passenger block in .htaccess)
//   3. admin_compromise (successful admin sign-in from a new IP within an hour of a
//      token-guessing burst)
// Failed attempts (admin_token_guess, secret_guess, passkey_forgery, pin_guessing)
// never trip the switch on their own. They only alert Stanley at most once an hour.
import fs from "node:fs";
import path from "node:path";
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

// Automatic Deadman's Switch triggers: ONLY signs of compromise.
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
    return s;
  } catch {
    return { active: false, checklist: defaultChecklist(), triggers: [], liftHistory: [] };
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

export function deadmanStatus() {
  const s = readState();
  const active = Boolean(s.active);
  return {
    active,
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
    });
  }

  return deadmanStatus();
}

// Called by lib/attacks.js whenever a security event is recorded.
// Failed attempts (admin_token_guess, secret_guess, passkey_forgery, pin_guessing)
// NEVER trip the Deadman's Switch; admin_token_guess only increments the 1-hour
// burst counter so noteAdminSignIn() can detect a subsequent sign-in from a new IP.
export async function noteAttackForDeadman(kind, detail = "") {
  if (kind === "admin_token_guess") {
    const burst = await hit("deadman:admin_guess_burst", 3600);
    return { tripped: false, count: burst };
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
    const nextKnown = [ipKey, ...(Array.isArray(known) ? known : [])].slice(0, 50);
    await setJSON("secw:admin_ips", nextKnown);
  }
  return { tripped: false, burst, ip: ipKey, isKnown };
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
// Legitimate deploys of merged `main` commits advance HEAD via `git reset --hard origin/main`,
// leaving `git status --porcelain` clean so deploys never trip this check.
// DirectAdmin updates to the CloudLinux Passenger block in `.htaccess` are also ignored.
export async function checkFileIntegrity({ rootDir = process.cwd(), checkGit = true } = {}) {
  const problems = [];

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
  }

  if (problems.length) {
    const detail = problems.join("; ");
    const { recordAttack } = await import("./attacks.js");
    await recordAttack("file_tampering", { where: "server files", detail });
    return { ok: false, problems, detail };
  }

  return { ok: true, problems: [] };
}

// Scheduled every 5 minutes (by server.mjs timer and every /healthz ping from
// deploy/cron.sh): runs checkFileIntegrity and, when the node is connected,
// checkNodeBalance.
export async function runDeadmanChecks({ rootDir = process.cwd(), force = false, totalSats = undefined } = {}) {
  const last = await getJSON("deadman:check:last");
  if (!force && last && Date.now() - Date.parse(last) < 5 * 60 * 1000) {
    return { skipped: true, last };
  }
  const at = new Date().toISOString();
  await setJSON("deadman:check:last", at);

  const files = await checkFileIntegrity({ rootDir });
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
  return { skipped: false, at, files, balance };
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
