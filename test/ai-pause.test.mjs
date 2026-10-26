// When the Anthropic credit runs out, the site keeps working: the AI pauses,
// the chat answers in scripted mode, client tasks wait in the queue, and the
// daily AI jobs skip. Nothing calls the API again until the pause lifts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-ai-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
process.env.CHAT_ENABLED = "1";
process.env.SITE_URL = "https://altradits.test";

const root = new URL("../", import.meta.url);
const ai = await import(new URL("lib/ai.js", root));
const agent = await import(new URL("lib/agent.js", root));
const career = await import(new URL("lib/career.js", root));
const chat = await import(new URL("api/chat.js", root));

const creditError = () => Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 });
let calls = 0;
const broke = { beta: { messages: {
  create: async () => { calls++; throw creditError(); },
  stream: () => ({ finalMessage: async () => { calls++; throw creditError(); } }),
} } };

async function post(body) {
  const res = await chat.POST(new Request("https://altradits.test/api/chat", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

test("credit errors are recognised; transient ones are not", () => {
  assert.equal(ai.aiErrorKind(creditError()), "credit");
  assert.equal(ai.aiErrorKind(Object.assign(new Error("bad key"), { status: 401 })), "key");
  assert.equal(ai.aiErrorKind(Object.assign(new Error("overloaded"), { status: 529 })), null);
  assert.equal(ai.aiErrorKind(Object.assign(new Error("rate"), { status: 429 })), null);
});

test("out of credit: chat still answers (scripted), AI pauses, no more API calls", async () => {
  ai.resumeAi();
  agent.setChatClient(broke);
  try {
    const r = await post({ message: "I need help with my inbox and calendar" });
    assert.equal(r.status, 200);
    assert.ok(r.body.reply && !/trouble connecting/i.test(r.body.reply), r.body.reply);
    assert.equal(calls, 1);
    assert.equal(ai.aiPaused(), true);
    assert.equal(ai.aiStatus().reason, "credit");

    const r2 = await post({ leadId: r.body.leadId, token: r.body.token, message: "what does it cost?" });
    assert.equal(r2.status, 200);
    assert.ok(r2.body.reply);
    assert.equal(calls, 1, "paused: no API call");

    assert.match(await career.syncCv(), /skipped/);
  } finally { agent.setChatClient(null); }
});

test("guarded calls fail fast with a clear message while paused; re-check lifts it", async () => {
  const g = ai.guardClient(broke);
  await assert.rejects(() => g.beta.messages.create({}), (e) => e.aiPaused && /credit/.test(e.message));
  assert.equal(calls, 1);
  ai.resumeAi();
  assert.equal(ai.aiPaused(), false);
  const ok = ai.guardClient({ beta: { messages: { create: async () => ({ ok: true }), stream: () => ({ finalMessage: async () => ({ ok: true }) }) } } });
  assert.deepEqual(await ok.beta.messages.create({}), { ok: true });
  assert.equal(ai.aiStatus().paused, false);
});
