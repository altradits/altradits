// Deadman's Switch — Step 1 (plain-code emergency lockdown, zero AI dependency).
// Trips manually from /admin or automatically on 6 high-confidence intrusion
// signals. Freezes outbound Ye₿ente sends, internal transfers and M-Pesa buys
// while keeping receiving and balance viewing live; holds non-owner outbound
// email; takes an encrypted backup; powers on the incident response departments;
// and alerts Stanley at altradits@gmail.com. Only Stanley can lift the lockdown.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { dataDir, getJSON, setJSON, hit, keysWithPrefix } from "./store.js";
import { newId } from "./http.js";
import { backupNow } from "./backup.js";
import { sendEmail, OWNER_EMAIL } from "./email.js";
import { overridePowerForIncident, restorePowerAfterIncident } from "./ai.js";

// The 6 automatic triggers approved by Stanley. Custodial `solvency` shortfall
// is intentionally excluded here so it remains an alert with top-up suggestion;
// Trigger 4 (`unexplained_balance_drop`) fires only when the node's total
// balance (channels + on-chain) drops without a matching recorded payment.
export const DEADMAN_THRESHOLDS = Object.freeze({
  admin_token_guess:        { count: 10, windowSec: 600, label: "10+ wrong admin token guesses in 10 minutes" },
  secret_guess:             { count: 5,  windowSec: 600, label: "5+ wrong webhook or deploy secret guesses in 10 minutes" },
  passkey_forgery:          { count: 3,  windowSec: 600, label: "3+ passkey signature verification failures in 10 minutes" },
  unexplained_balance_drop: { count: 1,  windowSec: 600, label: "Node total balance dropped with no matching recorded payment" },
  pin_guessing:             { count: 10, windowSec: 600, label: "10+ Ye₿ente wallet PIN lockouts in 10 minutes" },
  file_tampering:           { count: 1,  windowSec: 600, label: "Tracked server file or .htaccess modified outside git HEAD" },
});

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
    return s;
  } catch {
    return { active: false, checklist: defaultChecklist(), triggers: [] };
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
    liftedAt: s.liftedAt || null,
    liftedBy: s.liftedBy || null,
    liftNote: s.liftNote || null,
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

  // 2. Power on the incident response departments (saving Stanley's prior button state).
  try {
    overridePowerForIncident(incidentId);
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

  await setJSON("deadman:state", next);

  // 4. Send immediate owner alert email to altradits@gmail.com (once per incident).
  if (!alreadyActive) {
    const backupLine = next.forensicBackup?.ok
      ? `Forensic backup saved: ${next.forensicBackup.file} (${next.forensicBackup.encrypted ? "encrypted" : "gzip"})`
      : `Forensic backup status: ${next.forensicBackup?.error || "skipped"}`;
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
        `• Ye₿ente M-Pesa buys (quoteBuy / startBuy): FROZEN\n` +
        `• Non-owner outbound emails: HELD\n` +
        `• Ye₿ente receiving (invoices, LNURL, handle@altradits.com) & balance viewing: LIVE\n\n` +
        `${backupLine}\n` +
        `Response departments powered on: founder, trust, tech, finance, quality (capped at $2 for this incident).\n\n` +
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
  for (const k of Object.keys(defaultChecklist())) {
    if (k in patch) s.checklist[k] = Boolean(patch[k]);
  }
  writeState(s);
  await setJSON("deadman:state", s);
  return deadmanStatus();
}

export async function liftDeadman({ by = "", note = "", checklist = null } = {}) {
  if (by !== "stanley") {
    throw new Error("Only Stanley can lift the Deadman's Switch.");
  }
  const prev = readState();
  const now = new Date().toISOString();
  const next = {
    ...prev,
    active: false,
    liftedAt: now,
    liftedBy: "stanley",
    liftNote: String(note || "").slice(0, 500),
    checklist: {
      ...defaultChecklist(),
      ...(prev.checklist || {}),
      ...(checklist && typeof checklist === "object" ? checklist : {}),
      stanleyConfirmed: true,
    },
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
      subject: `[All-clear] Deadman's Switch lifted (${prev.incidentId || "manual"})`,
      text:
        `You lifted the Deadman's Switch lockdown at ${now}.\n\n` +
        `Incident ID: ${prev.incidentId || "n/a"}\n` +
        (next.liftNote ? `Note: ${next.liftNote}\n` : "") +
        `Ye₿ente outbound sends, transfers and M-Pesa buys are live again, and your department power buttons have been restored to their previous state.`,
      kind: "owner",
    });
  }

  return deadmanStatus();
}

// Called by lib/attacks.js whenever a security event is recorded.
// Counts hits inside the trigger's rolling window and trips the Deadman's Switch
// as soon as the threshold is reached.
export async function noteAttackForDeadman(kind, detail = "") {
  const rule = DEADMAN_THRESHOLDS[kind];
  if (!rule) return { tripped: false, count: 0 };
  const n = await hit(`deadman:hit:${kind}`, rule.windowSec);
  if (n >= rule.count) {
    const status = await tripDeadman({
      trigger: kind,
      reason: rule.label,
      detail: `${n} events in ${Math.round(rule.windowSec / 60)}m window${detail ? ` — ${detail}` : ""}`,
    });
    return { tripped: true, count: n, status };
  }
  return { tripped: false, count: n };
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

// Trigger 4: fires ONLY when the node's total balance (channels + on-chain)
// drops with no matching recorded payment (Ye₿ente send, tip refund, or an
// owner channel action). Custodial solvency shortfall is handled separately
// by checkSolvency() in lib/attacks.js as an alert with top-up suggestion.
export async function checkNodeBalance({
  totalSats,
  channelSats = 0,
  onchainSats = 0,
  recordedOutSats = 0,
  feeAllowanceSats = 5000,
} = {}) {
  const currentTotal = typeof totalSats === "number"
    ? Math.floor(totalSats)
    : Math.floor((Number(channelSats) || 0) + (Number(onchainSats) || 0));
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

// Trigger 6: verifies .htaccess deny rules and checks that tracked server files
// match git HEAD. Legitimate deploys of merged `main` commits advance HEAD via
// `git reset --hard origin/main`, leaving `git status --porcelain` clean so
// deploys never trip this check.
export async function checkFileIntegrity({ rootDir = process.cwd(), checkGit = true } = {}) {
  const problems = [];

  // 1. Check .htaccess protection files if present in rootDir
  const rootHtaccess = path.join(rootDir, ".htaccess");
  if (fs.existsSync(rootHtaccess)) {
    const txt = fs.readFileSync(rootHtaccess, "utf8");
    if (!txt.includes("<FilesMatch")) {
      problems.push(".htaccess is missing <FilesMatch deny rule");
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

  // 2. Check tracked server files against git HEAD (ignores untracked files and
  // clean deploys where HEAD moved to origin/main).
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
          const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
          problems.push(`Tracked server files modified outside git HEAD: ${lines.join(", ")}`);
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
