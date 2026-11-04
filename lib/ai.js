// Shared guard around the model client (Anthropic or Meta): circuit breaker,
// daily/monthly/incident cost ceilings, and manual-only department power
// buttons with credit counters. When the API key is absent, invalid or out of
// credits, every caller pauses cleanly and retries after RETRY_MS once credits
// or a new key are in place.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./store.js";

// The brain behind the agents. AI_PROVIDER=meta selects Meta's Model API
// (Muse); anything else (or unset) keeps Anthropic, so a server without
// Meta settings behaves exactly as before. Switching providers needs a
// restart: clients read their key when they are built.
export const aiProvider = () => (String(process.env.AI_PROVIDER || "").trim().toLowerCase() === "meta" ? "meta" : "anthropic");
export const aiModel = () => aiProvider() === "meta"
  ? (process.env.META_MODEL || "muse-spark-1.3")
  : (process.env.AGENT_WORKER_MODEL || process.env.AGENT_MODEL || "claude-sonnet-5-5");
export const providerKey = () => aiProvider() === "meta" ? process.env.META_MODEL_API_KEY : process.env.ANTHROPIC_API_KEY;
export const providerKeyPresent = () => Boolean(providerKey());
export const providerLabel = () => (aiProvider() === "meta" ? "Meta" : "Anthropic");
export const providerKeyName = () => (aiProvider() === "meta" ? "META_MODEL_API_KEY" : "ANTHROPIC_API_KEY");

// One guarded client for the active provider, or null when its key is absent.
// Workers and Stan build theirs through this instead of the SDK directly.
export async function createAiClient(deptOrOpts = null) {
  if (!providerKeyPresent()) return null;
  if (aiProvider() === "meta") {
    const { createMetaClient } = await import("./meta.js");
    return guardClient(createMetaClient(), deptOrOpts);
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return guardClient(new Anthropic(), deptOrOpts);
}

export const RETRY_MS = 10 * 60 * 1000; // after a credit error, re-try one call every 10 minutes
export const DEFAULT_WORKER_CALLS_PER_DAY = 20;
export const DEFAULT_MONTHLY_USD_CAP = 10;
export const DEFAULT_INCIDENT_USD_CAP = 2;

export const DEPARTMENTS_LIST = Object.freeze([
  "founder", "tech", "trust", "finance", "social", "marketing",
  "growth", "admin", "personal", "office", "orders", "quality",
]);

// Step 2 department roles during a Deadman's Switch lockdown (docs/choumi-return.md §6).
export const INCIDENT_RESPONSE_ROLES = Object.freeze({
  founder:   { role: "Leads; checks every finding; writes the incident report", activeDuringSwitch: true },
  quality:   { role: "Reviews every incident finding and deliverable before Stanley sees it", activeDuringSwitch: true },
  tech:      { role: "Investigates logs, deploys, served files and node activity (read-only key); finds the way in", activeDuringSwitch: true },
  admin:     { role: "Keeps the evidence and the payment records intact; checks the books against the node", activeDuringSwitch: true },
  growth:    { role: "Drafts a notice for Ye₿ente users; it waits for Stanley's approval", activeDuringSwitch: true },
  personal:  { role: "Builds Stanley's step-by-step response list and times it", activeDuringSwitch: true },
  trust:     { role: "Monitors intrusion signals and access controls during lockdown", activeDuringSwitch: true },
  finance:   { role: "Audits ledger solvency and payment records during lockdown", activeDuringSwitch: true },
  social:    { role: "Silent: nothing is posted or scheduled", activeDuringSwitch: false },
  marketing: { role: "Silent: nothing is posted or scheduled", activeDuringSwitch: false },
});

// Single source of truth: derived from INCIDENT_RESPONSE_ROLES (every role with
// activeDuringSwitch: true, plus founder and quality for Choumi's review).
export const INCIDENT_DEPARTMENTS = Object.freeze([
  ...new Set([
    ...Object.entries(INCIDENT_RESPONSE_ROLES)
      .filter(([, r]) => r.activeDuringSwitch)
      .map(([id]) => id),
    "founder",
    "quality",
  ]),
]);

// Permanently disabled in code per owner policy: on-site chat (Altra),
// marketing autoposting, and career tools cannot be switched on.
export const PERMANENTLY_DISABLED = Object.freeze([
  "chat", "altra", "marketing_autopost", "career", "careers",
]);

export function isPermanentlyDisabled(dept) {
  return PERMANENTLY_DISABLED.includes(String(dept || "").trim().toLowerCase());
}

export function dailyCallLimit() {
  const n = Number(process.env.WORKER_CALLS_PER_DAY);
  return n > 0 ? Math.floor(n) : DEFAULT_WORKER_CALLS_PER_DAY;
}

export function monthlyUsdCap() {
  const n = Number(process.env.AI_MONTHLY_USD_CAP);
  return n > 0 ? n : DEFAULT_MONTHLY_USD_CAP;
}

export function incidentUsdCap() {
  const n = Number(process.env.DEADMAN_INCIDENT_USD_CAP);
  return n > 0 ? n : DEFAULT_INCIDENT_USD_CAP;
}

const stateFile = () => path.join(dataDir(), "ai-state.json");

function defaultButtons() {
  const out = {};
  for (const d of DEPARTMENTS_LIST) out[d] = false;
  return out;
}

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8")) || {};
    s.buttons = { ...defaultButtons(), ...(s.buttons || {}) };
    for (const d of PERMANENTLY_DISABLED) delete s.buttons[d];
    s.usage ||= { days: {}, months: {} };
    s.usage.days ||= {};
    s.usage.months ||= {};
    return s;
  } catch {
    return { buttons: defaultButtons(), usage: { days: {}, months: {} } };
  }
}

function writeState(s) {
  try {
    const f = stateFile();
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    fs.renameSync(tmp, f);
  } catch { /* read-only disk: in-memory fallback is enough */ }
}

const todayKey = (now = new Date()) => (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
const monthKey = (now = new Date()) => (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 7);

function pruneOldDays(days, keepDay) {
  const keys = Object.keys(days || {}).sort();
  while (keys.length > 45) {
    const k = keys.shift();
    if (k !== keepDay) delete days[k];
  }
}

export function estimateCallUsd(res, params = {}) {
  if (typeof res?.costUsd === "number" && res.costUsd >= 0) return res.costUsd;
  const u = res?.usage;
  if (!u) return 0;
  const model = String(res?.model || params?.model || "").toLowerCase();
  // Meta's list prices, standard tier (checked Nov 2026): 1.25 in, 4.25 out,
  // 0.15 cache reads per million tokens.
  if (model.includes("muse")) {
    const usd = ((Number(u.input_tokens) || 0) * 1.25 + (Number(u.output_tokens) || 0) * 4.25 + (Number(u.cache_read_input_tokens) || 0) * 0.15) / 1e6;
    return Math.round(usd * 1e6) / 1e6;
  }
  const isHaiku = model.includes("haiku");
  const inRate = isHaiku ? 1.0 : 3.0;
  const outRate = isHaiku ? 5.0 : 15.0;
  const cacheReadRate = isHaiku ? 0.10 : 0.30;
  const cacheWriteRate = isHaiku ? 1.25 : 3.75;
  const usd =
    ((Number(u.input_tokens) || 0) * inRate +
      (Number(u.output_tokens) || 0) * outRate +
      (Number(u.cache_read_input_tokens) || 0) * cacheReadRate +
      (Number(u.cache_creation_input_tokens) || 0) * cacheWriteRate) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

// Classify an error thrown by a model client (either SDK speaks in HTTP status
// codes; the message patterns stay as a second net). Null for unrelated errors.
export function aiErrorKind(e) {
  const msg = String(e?.error?.error?.message || e?.error?.message || e?.message || "");
  const status = e?.status || e?.statusCode;
  if (/credit balance is too low|insufficient[_\s-]?quota|billing|out of credits|quota exceeded|spend limit|monthly.*limit/i.test(msg) || status === 402) return "credits";
  if (/invalid[_\s-]?x-api-key|authentication[_\s-]?error|api[_\s-]?key.*invalid|permission[_\s-]?error/i.test(msg) || status === 401 || status === 403) return "key";
  if (/overloaded|rate[_\s-]?limit/i.test(msg) || status === 429 || status === 529) return "rate";
  return null;
}

export class AiPausedError extends Error {
  constructor(kind = "paused", detail = "") {
    super(detail ? `AI is paused (${kind}: ${detail})` : `AI is paused (${kind})`);
    this.aiPaused = true;
    this.kind = kind;
  }
}
export const isAiPaused = (e) => Boolean(e?.aiPaused || aiErrorKind(e));

export function isDeptOn(dept) {
  const id = String(dept || "").trim().toLowerCase();
  if (!id || isPermanentlyDisabled(id)) return false;
  const s = readState();
  return Boolean(s.buttons?.[id]);
}

// Manual-only department power button: only Stanley ({ by: "stanley" }) can flip it.
export function setDeptPower(dept, on, { by = "" } = {}) {
  const id = String(dept || "").trim().toLowerCase();
  if (isPermanentlyDisabled(id)) {
    throw new Error(`Department "${id}" is permanently disabled in code and cannot be switched on.`);
  }
  if (!DEPARTMENTS_LIST.includes(id)) {
    throw new Error(`Unknown department "${id}".`);
  }
  if (by !== "stanley") {
    throw new Error("Only Stanley can change department power buttons.");
  }
  const s = readState();
  s.buttons[id] = Boolean(on);
  s.updatedBy = "stanley";
  s.updatedAt = new Date().toISOString();
  writeState(s);
  return deptPowerView();
}

export function setAllDeptPower(on, { by = "" } = {}) {
  if (by !== "stanley") {
    throw new Error("Only Stanley can change department power buttons.");
  }
  const s = readState();
  for (const d of DEPARTMENTS_LIST) s.buttons[d] = Boolean(on);
  s.updatedBy = "stanley";
  s.updatedAt = new Date().toISOString();
  writeState(s);
  return deptPowerView();
}

// Deadman's Switch emergency override: saves Stanley's current button states
// and powers on the incident response departments until the lockdown is lifted.
export function overridePowerForIncident(incidentId = "incident", depts = INCIDENT_DEPARTMENTS) {
  const s = readState();
  if (!s.incidentOverride) {
    s.incidentOverride = {
      incidentId: String(incidentId),
      at: new Date().toISOString(),
      previousButtons: { ...s.buttons },
      calls: 0,
      usd: 0,
    };
  }
  for (const d of depts) {
    const id = String(d || "").trim().toLowerCase();
    if (DEPARTMENTS_LIST.includes(id) && !isPermanentlyDisabled(id)) {
      s.buttons[id] = true;
    }
  }
  writeState(s);
  return deptPowerView();
}

export function restorePowerAfterIncident() {
  const s = readState();
  if (s.incidentOverride?.previousButtons) {
    for (const d of DEPARTMENTS_LIST) {
      s.buttons[d] = Boolean(s.incidentOverride.previousButtons[d]);
    }
    s.lastIncident = {
      ...s.incidentOverride,
      restoredAt: new Date().toISOString(),
    };
    delete s.incidentOverride;
    writeState(s);
  }
  return deptPowerView();
}

export function recordDeptUsage(dept = "founder", { calls = 1, usd = 0, inputTokens = 0, outputTokens = 0, now = new Date() } = {}) {
  const id = DEPARTMENTS_LIST.includes(dept) ? dept : "founder";
  const s = readState();
  const dKey = todayKey(now), mKey = monthKey(now);
  pruneOldDays(s.usage.days, dKey);

  const day = (s.usage.days[dKey] ||= { totalCalls: 0, totalUsd: 0, depts: {} });
  const dDept = (day.depts[id] ||= { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0 });
  day.totalCalls += calls;
  day.totalUsd = Math.round((day.totalUsd + usd) * 1e6) / 1e6;
  dDept.calls += calls;
  dDept.usd = Math.round((dDept.usd + usd) * 1e6) / 1e6;
  dDept.inputTokens += inputTokens;
  dDept.outputTokens += outputTokens;

  const month = (s.usage.months[mKey] ||= { totalCalls: 0, totalUsd: 0, depts: {} });
  const mDept = (month.depts[id] ||= { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0 });
  month.totalCalls += calls;
  month.totalUsd = Math.round((month.totalUsd + usd) * 1e6) / 1e6;
  mDept.calls += calls;
  mDept.usd = Math.round((mDept.usd + usd) * 1e6) / 1e6;
  mDept.inputTokens += inputTokens;
  mDept.outputTokens += outputTokens;

  if (s.incidentOverride) {
    s.incidentOverride.calls = (Number(s.incidentOverride.calls) || 0) + calls;
    s.incidentOverride.usd = Math.round(((Number(s.incidentOverride.usd) || 0) + usd) * 1e6) / 1e6;
  }

  writeState(s);
  return { today: dDept, month: mDept };
}

function checkBudgets(s, now = new Date()) {
  const dKey = todayKey(now), mKey = monthKey(now);
  const day = s.usage?.days?.[dKey];
  const month = s.usage?.months?.[mKey];

  const mCap = monthlyUsdCap();
  if ((month?.totalUsd || 0) >= mCap) {
    return { paused: true, kind: "monthly_cap", reason: `Monthly AI ceiling ($${mCap.toFixed(2)}) reached.`, since: null, retryAt: null };
  }
  if (s.incidentOverride) {
    const iCap = incidentUsdCap();
    if ((s.incidentOverride.usd || 0) >= iCap) {
      return { paused: true, kind: "incident_cap", reason: `Incident response AI cap ($${iCap.toFixed(2)}) reached.`, since: s.incidentOverride.at, retryAt: null };
    }
  }
  const dLimit = dailyCallLimit();
  if ((day?.totalCalls || 0) >= dLimit) {
    return { paused: true, kind: "daily_limit", reason: `Daily AI call limit (${dLimit} calls/day) reached.`, since: null, retryAt: null };
  }
  return null;
}

// Is AI paused right now? If a pause window has elapsed, this lets one call
// through to test the waters; if it fails, noteAiError() re-arms the pause.
export function aiPaused() {
  if (!providerKeyPresent()) return true;
  const s = readState();
  const budgetStop = checkBudgets(s);
  if (budgetStop) return true;
  if (!s.paused) return false;
  if (s.retryAt && Date.now() >= s.retryAt) return false;
  return true;
}

// Fast check for callers before building prompts or loading context.
export const aiReady = () => !aiPaused();

export function aiStatus(now = new Date()) {
  const s = readState();
  const dKey = todayKey(now), mKey = monthKey(now);
  const day = s.usage?.days?.[dKey] || { totalCalls: 0, totalUsd: 0, depts: {} };
  const month = s.usage?.months?.[mKey] || { totalCalls: 0, totalUsd: 0, depts: {} };
  const limits = {
    dailyCallLimit: dailyCallLimit(),
    todayCalls: day.totalCalls || 0,
    todayUsd: day.totalUsd || 0,
    monthlyUsdCap: monthlyUsdCap(),
    monthCalls: month.totalCalls || 0,
    monthUsd: month.totalUsd || 0,
    incidentUsdCap: incidentUsdCap(),
    incidentOverride: s.incidentOverride ? {
      incidentId: s.incidentOverride.incidentId,
      at: s.incidentOverride.at,
      calls: s.incidentOverride.calls || 0,
      usd: s.incidentOverride.usd || 0,
    } : null,
  };

  const who = { provider: aiProvider(), model: aiModel() };
  if (!providerKeyPresent()) {
    return { paused: true, kind: "unconfigured", reason: `${providerKeyName()} is not set.`, since: null, retryAt: null, ...who, ...limits };
  }
  const budgetStop = checkBudgets(s, now);
  if (budgetStop) return { ...budgetStop, ...who, ...limits };
  if (!s.paused) return { paused: false, kind: "ok", reason: null, since: null, retryAt: null, ...who, ...limits };
  return {
    paused: Date.now() < (s.retryAt || Infinity),
    kind: s.kind,
    reason: s.reason,
    since: s.since,
    retryAt: s.retryAt ? new Date(s.retryAt).toISOString() : null,
    ...who,
    ...limits,
  };
}

export function deptPowerView(now = new Date()) {
  const s = readState();
  const dKey = todayKey(now), mKey = monthKey(now);
  const day = s.usage?.days?.[dKey] || { totalCalls: 0, totalUsd: 0, depts: {} };
  const month = s.usage?.months?.[mKey] || { totalCalls: 0, totalUsd: 0, depts: {} };

  const departments = DEPARTMENTS_LIST.map((id) => {
    const td = day.depts?.[id] || { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0 };
    const md = month.depts?.[id] || { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0 };
    return {
      id,
      on: Boolean(s.buttons?.[id]),
      permanentlyDisabled: false,
      today: { calls: td.calls || 0, usd: td.usd || 0, inputTokens: td.inputTokens || 0, outputTokens: td.outputTokens || 0 },
      month: { calls: md.calls || 0, usd: md.usd || 0, inputTokens: md.inputTokens || 0, outputTokens: md.outputTokens || 0 },
    };
  });

  const disabled = PERMANENTLY_DISABLED.map((id) => ({
    id,
    on: false,
    permanentlyDisabled: true,
    today: { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0 },
    month: { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0 },
  }));

  return {
    status: aiStatus(now),
    departments,
    permanentlyDisabled: disabled,
    incidentOverride: s.incidentOverride || null,
    updatedAt: s.updatedAt || null,
    updatedBy: s.updatedBy || null,
  };
}

// Record an SDK failure. Credits and key errors trip the circuit breaker;
// rate-limit errors pause briefly (2 minutes). Returns true if it was an AI error.
let lastLogged = 0;
export function noteAiError(err) {
  const kind = aiErrorKind(err);
  if (!kind) return false;
  const prev = readState();
  const wait = kind === "rate" ? 2 * 60 * 1000 : kind === "key" ? 60 * 60 * 1000 : RETRY_MS;
  const meta = aiProvider() === "meta";
  const reason =
    kind === "credits" ? (meta ? "Meta API credits are exhausted. Top up at dev.meta.ai to resume." : "Anthropic API credits are exhausted. Top up at console.anthropic.com to resume.")
    : kind === "key" ? `${providerKeyName()} was rejected. Check the key in your environment.`
    : (meta ? "Meta API is rate-limiting or overloaded. Pausing briefly." : "Anthropic API is rate-limiting or overloaded. Pausing briefly.");
  writeState({
    ...prev,
    paused: true,
    kind,
    reason,
    since: prev.since || new Date().toISOString(),
    retryAt: Date.now() + wait,
  });
  if (Date.now() - lastLogged > 60e3) { lastLogged = Date.now(); console.warn(`[ai paused: ${kind}] ${reason}`); }
  return true;
}

export function resumeAi() {
  const prev = readState();
  if (prev.paused) {
    delete prev.paused;
    delete prev.kind;
    delete prev.reason;
    delete prev.since;
    delete prev.retryAt;
    writeState(prev);
  }
}

// Wrap an Anthropic client so messages.create / messages.stream (and beta.messages.*)
// check the circuit breaker, department power state and budgets first, and trip on failure.
export function guardClient(c, deptOrOpts = null) {
  if (!c || c._guarded) return c;
  const explicitDept = typeof deptOrOpts === "string"
    ? deptOrOpts.trim().toLowerCase()
    : deptOrOpts && typeof deptOrOpts === "object" && deptOrOpts.dept
    ? String(deptOrOpts.dept).trim().toLowerCase()
    : null;
  const allowWithoutKey = Boolean(deptOrOpts && typeof deptOrOpts === "object" && deptOrOpts.allowWithoutKey);

  const checkAllowed = (params) => {
    const dept = (params?.dept ? String(params.dept).trim().toLowerCase() : null) || explicitDept;
    if (dept) {
      if (isPermanentlyDisabled(dept)) throw new AiPausedError("permanently_disabled", dept);
      if (!isDeptOn(dept)) throw new AiPausedError("dept_off", dept);
    }
    if (!providerKeyPresent() && !allowWithoutKey) throw new AiPausedError("unconfigured");
    const s = readState();
    const budgetStop = checkBudgets(s);
    if (budgetStop) throw new AiPausedError(budgetStop.kind, budgetStop.reason);
    if (s.paused && (!s.retryAt || Date.now() < s.retryAt)) {
      throw new AiPausedError(s.kind || "paused");
    }
    return dept || "founder";
  };

  const trackSuccess = (dept, res, params) => {
    resumeAi();
    const usd = estimateCallUsd(res, params);
    const inputTokens = Number(res?.usage?.input_tokens) || 0;
    const outputTokens = Number(res?.usage?.output_tokens) || 0;
    recordDeptUsage(dept, { calls: 1, usd, inputTokens, outputTokens });
  };

  const wrapMessages = (m) => {
    if (!m || m._wrapped) return;
    if (typeof m.create === "function") {
      const origCreate = m.create.bind(m);
      m.create = async (params, opts) => {
        const dept = checkAllowed(params);
        try {
          const cleanParams = params && typeof params === "object" && "dept" in params
            ? (() => { const copy = { ...params }; delete copy.dept; return copy; })()
            : params;
          const res = await origCreate(cleanParams, opts);
          trackSuccess(dept, res, cleanParams);
          return res;
        } catch (e) {
          if (noteAiError(e)) throw new AiPausedError(aiErrorKind(e));
          throw e;
        }
      };
    }
    if (typeof m.stream === "function") {
      const origStream = m.stream.bind(m);
      m.stream = (params, opts) => {
        const dept = checkAllowed(params);
        const cleanParams = params && typeof params === "object" && "dept" in params
          ? (() => { const copy = { ...params }; delete copy.dept; return copy; })()
          : params;
        const stream = origStream(cleanParams, opts);
        const origFinal = stream.finalMessage?.bind(stream);
        if (origFinal) {
          stream.finalMessage = async (...a) => {
            try {
              const res = await origFinal(...a);
              trackSuccess(dept, res, cleanParams);
              return res;
            } catch (e) {
              if (noteAiError(e)) throw new AiPausedError(aiErrorKind(e));
              throw e;
            }
          };
        }
        return stream;
      };
    }
    m._wrapped = true;
  };

  if (c.messages) wrapMessages(c.messages);
  if (c.beta?.messages) wrapMessages(c.beta.messages);
  else if (c.messages) c.beta = { ...(c.beta || {}), messages: c.messages };

  c._guarded = true;
  return c;
}
