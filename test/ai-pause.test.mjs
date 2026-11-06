// Tests for the AI circuit breaker, budget ceilings and department power buttons (lib/ai.js).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ai-"));
process.chdir(tmp);
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.WORKER_CALLS_PER_DAY;
delete process.env.AI_MONTHLY_USD_CAP;
delete process.env.DEADMAN_INCIDENT_USD_CAP;

const {
  aiPaused,
  aiReady,
  aiStatus,
  noteAiError,
  resumeAi,
  guardClient,
  isAiPaused,
  aiErrorKind,
  DEFAULT_WORKER_CALLS_PER_DAY,
  DEFAULT_MONTHLY_USD_CAP,
  DEFAULT_INCIDENT_USD_CAP,
  dailyCallLimit,
  monthlyUsdCap,
  incidentUsdCap,
  DEPARTMENTS_LIST,
  PERMANENTLY_DISABLED,
  isPermanentlyDisabled,
  isDeptOn,
  setDeptPower,
  setAllDeptPower,
  deptPowerView,
  overridePowerForIncident,
  restorePowerAfterIncident,
  recordDeptUsage,
} = await import("../lib/ai.js");

function resetStateFile() {
  try { fs.unlinkSync(path.join(tmp, ".data", "ai-state.json")); } catch {}
}

test("ai: paused when ANTHROPIC_API_KEY is not set, and defaults match owner budget", () => {
  resetStateFile();
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(DEFAULT_WORKER_CALLS_PER_DAY, 20);
  assert.equal(dailyCallLimit(), 20);
  assert.equal(DEFAULT_MONTHLY_USD_CAP, 10);
  assert.equal(monthlyUsdCap(), 10);
  assert.equal(DEFAULT_INCIDENT_USD_CAP, 2);
  assert.equal(incidentUsdCap(), 2);
  assert.equal(aiPaused(), true);
  assert.equal(aiReady(), false);
  assert.equal(aiStatus().kind, "unconfigured");
});

test("ai: credit exhaustion trips the circuit breaker and blocks further SDK calls", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  resumeAi();
  assert.equal(aiPaused(), false);
  assert.equal(aiStatus().kind, "ok");

  let calls = 0;
  const creditErr = Object.assign(new Error("400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"Your credit balance is too low to access the Anthropic API.\"}}"), { status: 400 });
  const fake = guardClient({
    messages: {
      async create() { calls++; throw creditErr; },
    },
  });

  await assert.rejects(() => fake.messages.create({}), (e) => isAiPaused(e) && e.kind === "credits");
  assert.equal(calls, 1, "first call reached the SDK and tripped the breaker");
  assert.equal(aiPaused(), true);
  assert.equal(aiStatus().kind, "credits");

  await assert.rejects(() => fake.messages.create({}), (e) => isAiPaused(e));
  assert.equal(calls, 1, "second call blocked locally without hitting the SDK");

  resumeAi();
  assert.equal(aiPaused(), false);
});

test("ai: invalid key and rate-limit errors are classified, unrelated errors are not", () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  assert.equal(aiErrorKind({ status: 401, message: "invalid x-api-key" }), "key");
  assert.equal(aiErrorKind({ status: 429, message: "rate_limit_error" }), "rate");
  assert.equal(aiErrorKind(new Error("ECONNRESET")), null);
  assert.equal(noteAiError(new Error("syntax error")), false);
  assert.equal(aiPaused(), false);
});

test("ai: a successful call clears a stale pause", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  noteAiError({ status: 402, message: "credit balance is too low" });
  assert.equal(aiPaused(), true);

  const stateFile = path.join(tmp, ".data", "ai-state.json");
  const s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  s.retryAt = Date.now() - 1000;
  fs.writeFileSync(stateFile, JSON.stringify(s));
  assert.equal(aiPaused(), false, "retry window elapsed: one probe call allowed");

  const ok = guardClient({
    messages: {
      async create() { return { content: [{ type: "text", text: "hi" }], usage: { input_tokens: 100, output_tokens: 50 } }; },
    },
  });
  await ok.messages.create({ model: "claude-haiku-4-5" });
  assert.equal(aiStatus().kind, "ok", "successful probe cleared the pause");
});

test("ai: department power buttons are off by default, manual-only (Stanley), and track today/month counters", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

  for (const d of DEPARTMENTS_LIST) {
    assert.equal(isDeptOn(d), false, `${d} starts off by default`);
  }

  // Nobody except Stanley can flip a department button
  assert.throws(() => setDeptPower("marketing", true), /Only Stanley/);
  assert.throws(() => setDeptPower("marketing", true, { by: "worker" }), /Only Stanley/);
  assert.throws(() => setAllDeptPower(true, { by: "cron" }), /Only Stanley/);
  assert.equal(isDeptOn("marketing"), false);

  // Guarded client for a specific department refuses calls while its button is off
  const mktClient = guardClient({
    messages: {
      async create() {
        return {
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "draft" }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        };
      },
    },
  }, "marketing");

  await assert.rejects(() => mktClient.messages.create({}), (e) => isAiPaused(e) && e.kind === "dept_off");

  // Stanley switches marketing on
  setDeptPower("marketing", true, { by: "stanley" });
  assert.equal(isDeptOn("marketing"), true);

  await mktClient.messages.create({});
  const view = deptPowerView();
  const mkt = view.departments.find((d) => d.id === "marketing");
  assert.equal(mkt.on, true);
  assert.equal(mkt.today.calls, 1);
  assert.ok(mkt.today.usd > 0, "tracks USD spend from token usage");
  assert.equal(mkt.month.calls, 1);
  assert.equal(mkt.month.usd, mkt.today.usd);
});

test("ai: permanently disabled features (Altra chat, marketing autopost, careers) cannot be enabled", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

  for (const id of PERMANENTLY_DISABLED) {
    assert.equal(isPermanentlyDisabled(id), true);
    assert.equal(isDeptOn(id), false);
    assert.throws(() => setDeptPower(id, true, { by: "stanley" }), /permanently disabled/);
    assert.equal(isDeptOn(id), false);
  }

  const chatClient = guardClient({
    messages: { async create() { return { content: [] }; } },
  }, "chat");
  await assert.rejects(() => chatClient.messages.create({}), (e) => isAiPaused(e) && e.kind === "permanently_disabled");
});

test("ai: enforces WORKER_CALLS_PER_DAY (20), monthly $10 ceiling, and $2 incident response cap", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  setDeptPower("tech", true, { by: "stanley" });

  // 1. Daily call limit (default 20)
  recordDeptUsage("tech", { calls: 20, usd: 0.25 });
  assert.equal(aiPaused(), true);
  assert.equal(aiStatus().kind, "daily_limit");

  // Reset and test monthly $10 ceiling
  resetStateFile();
  setDeptPower("tech", true, { by: "stanley" });
  recordDeptUsage("tech", { calls: 2, usd: 10.00 });
  assert.equal(aiPaused(), true);
  assert.equal(aiStatus().kind, "monthly_cap");

  // Reset and test incident override + $2 incident cap
  resetStateFile();
  setDeptPower("marketing", true, { by: "stanley" });
  assert.equal(isDeptOn("marketing"), true);
  assert.equal(isDeptOn("trust"), false);

  overridePowerForIncident("inc_test_1");
  assert.equal(isDeptOn("trust"), true, "incident override turns on trust");
  assert.equal(isDeptOn("founder"), true, "incident override turns on founder");
  assert.equal(isDeptOn("marketing"), true, "Stanley's prior on button stays on");

  recordDeptUsage("trust", { calls: 3, usd: 2.00 });
  assert.equal(aiPaused(), true);
  assert.equal(aiStatus().kind, "incident_cap");

  restorePowerAfterIncident();
  assert.equal(isDeptOn("trust"), false, "trust restored to off after incident");
  assert.equal(isDeptOn("marketing"), true, "marketing restored to Stanley's prior on state");
  delete process.env.ANTHROPIC_API_KEY;
});

test("ai: guarded create keeps the SDK promise shape (withResponse/asResponse) and records each call once", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "[REDACTED]";
  setDeptPower("tech", true, { by: "stanley" });
  const data = {
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: "hi" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  const apiPromise = () => {
    const p = Promise.resolve(data);
    p.withResponse = async () => ({ data, response: { status: 200 } });
    p.asResponse = async () => ({ status: 200 });
    return p;
  };
  const c = guardClient({ messages: { create: () => apiPromise() } }, "tech");

  const viaAwait = await c.messages.create({ model: "x" });
  assert.equal(viaAwait.content[0].text, "hi");
  const viaBoth = await c.messages.create({ model: "x" }).withResponse();
  assert.equal(viaBoth.data.content[0].text, "hi");
  assert.equal(viaBoth.response.status, 200);
  const raw = await c.messages.create({ model: "x" }).asResponse();
  assert.equal(raw.status, 200);

  const tech = deptPowerView().departments.find((d) => d.id === "tech");
  assert.equal(tech.today.calls, 3, "one usage record per call, however it was consumed");
  assert.equal(tech.month.calls, 3);
  delete process.env.ANTHROPIC_API_KEY;
});

test("ai: guard refusals reject through withResponse too, so an in-flight stream still pauses cleanly", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "[REDACTED]";
  const c = guardClient({ messages: { create: async () => ({}) } }, "tech");
  await assert.rejects(() => c.messages.create({}), (e) => isAiPaused(e) && e.kind === "dept_off");
  await assert.rejects(() => c.messages.create({}).withResponse(), (e) => isAiPaused(e) && e.kind === "dept_off");
  await assert.rejects(() => c.messages.create({}).asResponse(), (e) => isAiPaused(e) && e.kind === "dept_off");
  delete process.env.ANTHROPIC_API_KEY;
});

test("ai: a guarded SDK stream survives the SDK inner messages.create(...).withResponse() and records one call", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "[REDACTED]";
  setDeptPower("founder", true, { by: "stanley" });
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const sse = [
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"m1","type":"message","role":"assistant","content":[],"model":"m","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":1}}}',
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":0}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
    '',
  ].join("\n");
  const stubFetch = async () => new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const c = guardClient(new Anthropic({ apiKey: "test-key", fetch: stubFetch }), "founder");
  const msg = await c.messages.stream({ model: "m", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }).finalMessage();
  assert.equal(msg.content[0].text, "hi");
  const founder = deptPowerView().departments.find((d) => d.id === "founder");
  assert.equal(founder.today.calls, 1, "streaming call recorded once, on the final message");
  assert.ok(founder.today.usd > 0, "streaming call records spend from the final usage");
  delete process.env.ANTHROPIC_API_KEY;
});

test("ai: errors through withResponse still map and trip the breaker, without an unhandled rejection", async () => {
  resetStateFile();
  process.env.ANTHROPIC_API_KEY = "[REDACTED]";
  setDeptPower("tech", true, { by: "stanley" });
  const creditErr = Object.assign(new Error("Your credit balance is too low."), { status: 400 });
  const c = guardClient({
    messages: {
      create: () => {
        const p = Promise.reject(creditErr);
        p.withResponse = async () => { await p; };
        return p;
      },
    },
  }, "tech");
  await assert.rejects(() => c.messages.create({}).withResponse(), (e) => isAiPaused(e) && e.kind === "credits");
  assert.equal(aiPaused(), true);
  assert.equal(aiStatus().kind, "credits");
  resumeAi();
  delete process.env.ANTHROPIC_API_KEY;
});
