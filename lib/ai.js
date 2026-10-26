// AI circuit breaker. When the Anthropic account runs out of credit (or the key
// stops working), every AI feature pauses instead of failing over and over:
// calls are refused locally (no network, no cost), the site keeps serving, the
// chat falls back to its scripted mode, client tasks wait in the queue, and the
// daily jobs skip their AI steps. After RETRY_MS one call is allowed through to
// check whether credit is back; Stanley can also re-check from the admin.
//
// The state lives in a small file next to the data store so every Passenger
// process (and every restart) sees the same pause.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./store.js";

export const RETRY_MS = Number(process.env.AI_RETRY_MINUTES || 30) * 60e3;
const FILE = () => path.join(dataDir(), "ai-state.json");
const CACHE_MS = 15e3;

let state = null; // { pausedUntil, reason, since, notifiedAt }
let readAt = 0;

function load() {
  if (state && Date.now() - readAt < CACHE_MS) return state;
  try { state = JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { state = state || { pausedUntil: 0 }; }
  readAt = Date.now();
  return state;
}
function save(next) {
  state = next;
  readAt = Date.now();
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(next));
  } catch (err) { console.error("ai state", err.message); }
}

// Errors that won't fix themselves until Stanley acts: no credit, billing, or a
// bad/revoked key. Rate limits and overloads are transient and not counted.
export function aiErrorKind(err) {
  if (!err) return null;
  const status = err.status ?? err.statusCode;
  const type = err.error?.error?.type || err.error?.type || "";
  const msg = String(err.message || err.error?.error?.message || "");
  if (/credit balance|billing|payment required|insufficient.*(credit|funds|quota)/i.test(msg) || type === "billing_error" || status === 402) return "credit";
  if (status === 401 || type === "authentication_error") return "key";
  if (status === 403 && type === "permission_error") return "key";
  return null;
}

export class AiPausedError extends Error {
  constructor(reason) {
    super(reason === "key"
      ? "The AI is paused: the Anthropic API key was rejected. Everything else on the site still works. Fix ANTHROPIC_API_KEY, then press \"Re-check AI\" in the admin."
      : "The AI is paused: the Anthropic credit has run out. Everything else on the site still works. Top up at console.anthropic.com, then press \"Re-check AI\" in the admin (or wait; it re-checks on its own).");
    this.name = "AiPausedError";
    this.aiPaused = true;
    this.reason = reason;
  }
}
export const isAiPaused = (err) => Boolean(err?.aiPaused) || Boolean(aiErrorKind(err));

export function aiPaused() {
  const s = load();
  return Boolean(s.pausedUntil) && Date.now() < s.pausedUntil;
}
export const aiReady = (client) => Boolean(client) && !aiPaused();

export function aiStatus() {
  const s = load();
  return aiPaused()
    ? { paused: true, reason: s.reason, since: s.since, retryAt: new Date(s.pausedUntil).toISOString() }
    : { paused: false, lastReason: s.reason || null };
}

// Records an API error. Returns true when it paused the AI.
export function noteAiError(err) {
  const kind = aiErrorKind(err);
  if (!kind) return false;
  const s = load();
  const first = !aiPaused() && !(s.since && s.reason === kind && Date.now() - Date.parse(s.since) < 24 * 3600e3);
  const next = { ...s, pausedUntil: Date.now() + RETRY_MS, reason: kind, since: first ? new Date().toISOString() : s.since || new Date().toISOString() };
  save(next);
  if (first) {
    console.error(`AI paused (${kind}): ${String(err.message).slice(0, 200)}. Retrying in ${Math.round(RETRY_MS / 60e3)} min.`);
    notifyOwner(kind).catch(() => {});
  }
  return true;
}

// A call went through: credit is back.
function noteAiOk() {
  const s = load();
  if (s.pausedUntil || s.since) { save({ pausedUntil: 0, reason: null, since: null, resumedAt: new Date().toISOString() }); console.log("AI resumed"); }
}

// Admin "Re-check AI": lift the pause so the next call tries the API again.
export function resumeAi() {
  save({ ...load(), pausedUntil: 0 });
  return aiStatus();
}

async function notifyOwner(kind) {
  if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) return;
  const s = load();
  if (s.notifiedAt && Date.now() - Date.parse(s.notifiedAt) < 24 * 3600e3) return;
  save({ ...s, notifiedAt: new Date().toISOString() });
  const { emailOwner } = await import("./email.js");
  const site = (process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "");
  await emailOwner(
    kind === "key" ? "AI paused: API key rejected" : "AI paused: Anthropic credit ran out",
    `${new AiPausedError(kind).message}\n\nWhile paused: the site, orders, payments, portal and admin work as normal; the chat answers in scripted mode; client tasks wait in the queue and start automatically once the AI is back; the daily CV sync, job discovery and marketing drafts are skipped.`,
    { label: "Open the admin", url: `${site}/admin` },
  );
}

// Wraps an Anthropic client (or a test fake) so every call goes through the
// breaker. Only the two call shapes the site uses are wrapped.
export function guardClient(c) {
  if (!c || c.__aiGuarded) return c;
  const m = c.beta.messages;
  const before = () => { if (aiPaused()) throw new AiPausedError(load().reason); };
  const fail = (err) => {
    if (noteAiError(err)) { const e = new AiPausedError(aiErrorKind(err)); e.cause = err; throw e; }
    throw err;
  };
  return {
    __aiGuarded: true,
    raw: c,
    beta: {
      messages: {
        create: async (...args) => {
          before();
          const res = await m.create(...args).catch(fail);
          noteAiOk();
          return res;
        },
        stream: (...args) => {
          before();
          const s = m.stream(...args);
          return {
            finalMessage: async () => {
              const res = await s.finalMessage().catch(fail);
              noteAiOk();
              return res;
            },
          };
        },
      },
    },
  };
}
