import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The Meta provider: request/response translation, error mapping, provider
// selection and budget recording. No network: fetch is stubbed throughout.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-meta-")));
const KEYS = ["AI_PROVIDER", "META_MODEL_API_KEY", "META_MODEL", "META_BASE_URL", "ANTHROPIC_API_KEY", "AGENT_MODEL", "AGENT_WORKER_MODEL"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
for (const k of KEYS) delete process.env[k];
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetMetaFetcher();
});

const meta = await import("../lib/meta.js");
const { toChatBody, fromChatReply, createMetaClient, setMetaFetcher, resetMetaFetcher, META_MODEL } = meta;
const ai = await import("../lib/ai.js");
// Freeze the worker model on Muse, as a server started with AI_PROVIDER=meta would.
process.env.AI_PROVIDER = "meta";
const workers = await import("../lib/workers.js");
const ops = await import("../lib/ops.js");
delete process.env.AI_PROVIDER;

const FN_TOOL = { name: "draft", description: "Draft it.", input_schema: { type: "object", properties: { to: { type: "string" } }, required: ["to"] } };
const SRV_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 6 };

test("request: system, tools and tool_choice translate; server tools and Anthropic-only fields drop out", () => {
  const body = toChatBody({
    model: "muse-spark-1.3", max_tokens: 8000, output_config: { effort: "medium" },
    system: "You draft mail.", tools: [SRV_TOOL, FN_TOOL],
    tool_choice: { type: "tool", name: "draft" },
    messages: [{ role: "user", content: "Write it." }],
  });
  assert.deepEqual(body, {
    model: "muse-spark-1.3",
    messages: [{ role: "system", content: "You draft mail." }, { role: "user", content: "Write it." }],
    max_tokens: 8000,
    tools: [{ type: "function", function: { name: "draft", description: "Draft it.", parameters: FN_TOOL.input_schema } }],
    tool_choice: "auto",
  });
});

test("request: every tool choice rides as auto, and none without tools", () => {
  const base = { tools: [FN_TOOL], messages: [{ role: "user", content: "Hi." }] };
  assert.equal(toChatBody({ ...base, tool_choice: { type: "tool", name: "draft" } }).tool_choice, "auto");
  assert.equal(toChatBody({ ...base, tool_choice: { type: "any" } }).tool_choice, "auto");
  assert.equal(toChatBody({ ...base, tool_choice: { type: "auto" } }).tool_choice, "auto");
  assert.equal("tool_choice" in toChatBody({ messages: base.messages }), false);
});

test("request: an assistant turn with tool calls echoes back as tool_calls", () => {
  const body = toChatBody({
    messages: [
      { role: "user", content: "Go." },
      { role: "assistant", content: [{ type: "text", text: "On it." }, { type: "tool_use", id: "c1", name: "draft", input: { to: "a@b.co" } }] },
    ],
  });
  assert.deepEqual(body.messages[1], {
    role: "assistant",
    content: "On it.",
    tool_calls: [{ id: "c1", type: "function", function: { name: "draft", arguments: JSON.stringify({ to: "a@b.co" }) } }],
  });
});

test("request: tool results each become their own tool message", () => {
  const body = toChatBody({
    messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "queued" }] }],
  });
  assert.deepEqual(body.messages, [{ role: "tool", tool_call_id: "c1", content: "queued" }]);
});

test("reply: text, tool calls, usage and finish reasons translate back", () => {
  const r = fromChatReply({
    id: "x1", model: "muse-spark-1.3",
    choices: [{ finish_reason: "tool_calls", message: {
      content: "Drafting.",
      tool_calls: [{ id: "c9", type: "function", function: { name: "draft", arguments: "{\"to\":\"a@b.co\"}" } }],
    } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  });
  assert.equal(r.stop_reason, "tool_use");
  assert.deepEqual(r.content, [{ type: "text", text: "Drafting." }, { type: "tool_use", id: "c9", name: "draft", input: { to: "a@b.co" } }]);
  assert.deepEqual(r.usage, { input_tokens: 100, output_tokens: 50 });
  assert.equal(fromChatReply({ choices: [{ finish_reason: "length", message: {} }] }).stop_reason, "max_tokens");
  assert.equal(fromChatReply({ choices: [{ finish_reason: "content_filter", message: {} }] }).stop_reason, "refusal");
  assert.equal(fromChatReply({ choices: [{ finish_reason: "stop", message: { content: "hi" } }] }).stop_reason, "end_turn");
  const bad = fromChatReply({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "c", function: { name: "d", arguments: "not json" } }] } }] });
  assert.deepEqual(bad.content, [{ type: "tool_use", id: "c", name: "d", input: {} }]);
});

test("create: posts to the Model API with a Bearer key and returns Messages", async () => {
  process.env.META_MODEL_API_KEY = "test-meta-key";
  let seen;
  setMetaFetcher(async (url, opts) => {
    seen = { url, opts };
    return { ok: true, json: async () => ({ model: "muse-spark-1.3", choices: [{ finish_reason: "stop", message: { content: "Done." } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
  });
  const res = await createMetaClient().messages.create({ model: "muse-spark-1.3", max_tokens: 100, messages: [{ role: "user", content: "Hi." }] });
  assert.equal(seen.url, "https://api.meta.ai/v1/chat/completions");
  assert.equal(seen.opts.headers.Authorization, "Bearer test-meta-key");
  assert.deepEqual(JSON.parse(seen.opts.body).messages, [{ role: "user", content: "Hi." }]);
  assert.equal(res.content[0].text, "Done.");
  assert.deepEqual(res.usage, { input_tokens: 10, output_tokens: 5 });
});

test("create: HTTP errors carry status so the guard classifies them", async () => {
  process.env.META_MODEL_API_KEY = "test-meta-key";
  setMetaFetcher(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid key" } }) }));
  const e401 = await createMetaClient().messages.create({ messages: [] }).catch((e) => e);
  assert.equal(e401.status, 401);
  assert.equal(ai.aiErrorKind(e401), "key");
  setMetaFetcher(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  const e429 = await createMetaClient().messages.create({ messages: [] }).catch((e) => e);
  assert.equal(ai.aiErrorKind(e429), "rate");
  delete process.env.META_MODEL_API_KEY;
  const eNone = await createMetaClient().messages.create({ messages: [] }).catch((e) => e);
  assert.equal(eNone.status, 401);
});

test("provider selection: explicit meta or default Anthropic, null without a key", async () => {
  process.env.AI_PROVIDER = "meta";
  assert.equal(await ai.createAiClient(), null);
  process.env.META_MODEL_API_KEY = "test-meta-key";
  assert.equal((await ai.createAiClient()).provider, "meta");
  assert.equal(ai.aiModel(), "muse-spark-1.3");
  process.env.META_MODEL = "muse-spark-9.9";
  assert.equal(ai.aiModel(), "muse-spark-9.9");
  delete process.env.AI_PROVIDER;
  delete process.env.META_MODEL_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  const ac = await ai.createAiClient();
  assert.equal(typeof ac.messages.create, "function");
  assert.equal(ac.provider, undefined);
  assert.equal(ai.aiModel(), "claude-sonnet-5-5");
});

test("status names the provider and model, with the right unconfigured hint", () => {
  process.env.AI_PROVIDER = "meta";
  assert.equal(ai.aiStatus().reason, "META_MODEL_API_KEY is not set.");
  process.env.META_MODEL_API_KEY = "test-meta-key";
  assert.deepEqual([ai.aiStatus().provider, ai.aiStatus().model], ["meta", "muse-spark-1.3"]);
  delete process.env.AI_PROVIDER;
  delete process.env.META_MODEL_API_KEY;
  assert.equal(ai.aiStatus().reason, "ANTHROPIC_API_KEY is not set.");
});

test("Muse calls are costed at Meta's list prices", () => {
  const usd = ai.estimateCallUsd({ model: "muse-spark-1.3", usage: { input_tokens: 1000000, output_tokens: 1000000 } });
  assert.equal(usd, 5.5);
});

test("a guarded Meta call records budgets and clears pauses", async () => {
  process.env.AI_PROVIDER = "meta";
  process.env.META_MODEL_API_KEY = "test-meta-key";
  ai.setDeptPower("founder", true, { by: "stanley" });
  setMetaFetcher(async () => ({ ok: true, json: async () => ({ model: "muse-spark-1.3", choices: [{ finish_reason: "stop", message: { content: "ok" } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }) }));
  const c = ai.guardClient(createMetaClient(), "founder");
  await c.messages.create({ model: "muse-spark-1.3", messages: [{ role: "user", content: "Hi." }] });
  const s = ai.aiStatus();
  assert.equal(s.todayCalls, 1);
  assert.ok(s.todayUsd > 0 && s.todayUsd < 0.01);
});

test("all five departments complete a task on Muse: agent, 4-step QA and handover, no Anthropic-only fields sent", async () => {
  process.env.AI_PROVIDER = "meta";
  process.env.META_MODEL_API_KEY = "test-meta-key";
  process.env.WORKER_CALLS_PER_DAY = "200";
  const seen = [];
  const reply = (name, input) => ({
    ok: true,
    json: async () => ({
      model: "muse-spark-1.3",
      choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: `c_${seen.length}`, type: "function", function: { name, arguments: JSON.stringify(input) } }] } }],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    }),
  });
  setMetaFetcher(async (url, opts) => {
    const body = JSON.parse(opts.body);
    seen.push(body);
    const names = (body.tools || []).map((t) => t.function?.name);
    const userText = (body.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (names.includes("qa_plan")) {
      const ids = [...userText.matchAll(/^- ([a-z-]+): /gm)].map((m) => m[1]);
      return reply("qa_plan", { areas: ids.map((id) => ({ id, criteria: [`${id} criterion`] })) });
    }
    if (names.includes("area_verdict")) {
      const crits = [...userText.matchAll(/^\d+\. (.+ criterion)$/gm)].map((m) => m[1]);
      return reply("area_verdict", { items: crits.map((c, i) => ({ index: i + 1, criterion: `Re: ${c}`, pass: true, evidence: "line 1" })) });
    }
    if (names.includes("stan_decision")) {
      return reply("stan_decision", { approve: true, reason: "All areas approved", issues: [], subject: "Your draft is ready", body: "The draft passed every check and is ready for review." });
    }
    const dept = (body.messages || []).find((m) => m.role === "system")?.content?.match(/background work for tasks in the (.+?) department/)?.[1] || "department";
    return reply("submit_deliverable", {
      title: `Draft for ${dept}`,
      summary_for_client: "A short plain draft written for review.",
      files: [{ name: "draft.md", format: "md", content: `# Draft\nPlain notes for Stanley to review.` }],
      hours_saved: 1,
      human_steps: [],
      sources: ["https://altradits.com/library"],
    });
  });

  const briefs = {
    tech: ["Check node sync and sending power", "Read-only summary of block height sync and outbound capacity for the daily report"],
    admin: ["Reconcile the weekly statement", "Match receipts to the ledger for the past week and list any exceptions"],
    growth: ["Draft Ye₿ente wallet help notes", "Plain-language answers to three common wallet questions for review"],
    personal: ["Plan the BitDevs Kisumu seminar", "Run-of-show draft with reading list and reminder times in EAT"],
    social: ["Draft journey update posts", "Two short posts about the latest open-source milestone for review"],
  };
  for (const dept of Object.keys(briefs)) ai.setDeptPower(dept, true, { by: "stanley" });
  for (const [dept, [title, details]] of Object.entries(briefs)) {
    const t = await ops.createTask({ title, details, department: dept });
    assert.equal(t.status, "queued");
    await workers.processTask(t.id).catch(() => {});
    let done = null;
    for (let i = 0; i < 200; i++) {
      const cur = await ops.getTask(t.id);
      if (!["queued", "working"].includes(cur.status)) { done = cur; break; }
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.ok(done, `${dept}: task settled`);
    assert.equal(done.status, "review", `${dept}: reached review, got ${done?.status}`);
    assert.equal(done.qa.final.approve, true, `${dept}: Choumi approved`);
    assert.ok(done.qa.rounds.length >= 1, `${dept}: QA ran`);
  }

  assert.ok(seen.length >= 5 * 8, `every call went through the Meta fetcher (saw ${seen.length})`);
  for (const b of seen) {
    assert.equal(b.model, "muse-spark-1.3");
    assert.ok((b.tools || []).every((t) => t.type === "function"), "no Anthropic server tools leak to Meta");
    assert.ok(!("output_config" in b), "no Anthropic-only output_config sent");
    assert.ok(b.tool_choice === undefined || b.tool_choice === "auto", "tool choice rides as auto");
  }
  const view = ai.deptPowerView();
  for (const dept of Object.keys(briefs)) {
    const row = view.departments.find((d) => d.id === dept);
    assert.ok(row.on && row.today.calls > 0, `${dept}: power on and spend tracked`);
  }
  assert.equal(view.status.provider, "meta");
  delete process.env.WORKER_CALLS_PER_DAY;
});
