// Meta Model API (Muse) client, speaking the codebase's Messages shape:
// messages.create({ model, max_tokens, system, tools, tool_choice, messages })
// and answering { content: [{ type: "text"|"tool_use" }], usage, stop_reason,
// model }. The agent loop, the guard and the budgets in lib/ai.js work
// unchanged: only the translation below is Meta-specific.
//
// Wire format is Chat Completions: POST {META_BASE_URL}/chat/completions
// (default https://api.meta.ai/v1) with a Bearer META_MODEL_API_KEY.
// Anthropic server tools (web_search_*, web_fetch_*) have no Meta equivalent
// and are left out; function tools translate 1:1. output_config is dropped:
// it names Anthropic-only settings.
const BASE = () => (process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
export const META_MODEL = () => process.env.META_MODEL || "muse-spark-1.3";
const KEY = () => String(process.env.META_MODEL_API_KEY || "");

// A fetch that tests can replace; production uses the global one.
let httpFetch = (...a) => globalThis.fetch(...a);
export const setMetaFetcher = (f) => { httpFetch = f; };
export const resetMetaFetcher = () => { httpFetch = (...a) => globalThis.fetch(...a); };

const isServerTool = (t) => t && typeof t.type === "string" && /^(web_search|web_fetch)_/.test(t.type);

function toFunctionTool(t) {
  return {
    type: "function",
    function: {
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      parameters: t.input_schema || { type: "object", properties: {} },
    },
  };
}

function toToolChoice(tc) {
  // The Model API currently honours only "auto": forced and required choices
  // ride as auto, and the caller already handles a text-only answer.
  if (!tc || typeof tc !== "object") return undefined;
  return "auto";
}

// One Anthropic block message becomes one or more Chat messages. tool_use
// blocks ride as tool_calls on their assistant message; tool_result blocks
// each become their own tool message (Chat has no mixed user content).
function toChatMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    if (typeof m?.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = Array.isArray(m?.content) ? m.content : [];
    if (m?.role === "assistant") {
      const text = blocks.filter((b) => b?.type === "text").map((b) => b.text || "").join("");
      const calls = blocks.filter((b) => b?.type === "tool_use").map((b, i) => ({
        id: String(b.id || `call_${i}`),
        type: "function",
        function: { name: String(b.name || ""), arguments: JSON.stringify(b.input ?? {}) },
      }));
      const msg = { role: "assistant", content: text };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
      continue;
    }
    const text = blocks.filter((b) => b?.type === "text").map((b) => b.text || "").join("");
    if (text || !blocks.some((b) => b?.type === "tool_result")) out.push({ role: m.role || "user", content: text });
    for (const b of blocks.filter((b) => b?.type === "tool_result")) {
      out.push({
        role: "tool",
        tool_call_id: String(b.tool_use_id || ""),
        content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""),
      });
    }
  }
  return out;
}

export function toChatBody(params = {}) {
  const body = {
    model: params.model || META_MODEL(),
    messages: [
      ...(params.system ? [{ role: "system", content: params.system }] : []),
      ...toChatMessages(params.messages),
    ],
  };
  if (Number(params.max_tokens) > 0) body.max_tokens = Math.floor(params.max_tokens);
  const tools = (params.tools || []).filter((t) => t && !isServerTool(t));
  if (tools.length) body.tools = tools.map(toFunctionTool);
  const choice = toToolChoice(params.tool_choice);
  if (choice !== undefined && tools.length) body.tool_choice = choice;
  return body;
}

const STOP = { tool_calls: "tool_use", length: "max_tokens", content_filter: "refusal", stop: "end_turn" };

export function fromChatReply(json = {}, fallbackModel = "") {
  const msg = json?.choices?.[0]?.message || {};
  const content = [];
  if (typeof msg.content === "string" && msg.content) content.push({ type: "text", text: msg.content });
  for (const c of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(c?.function?.arguments || "{}") || {}; } catch { input = {}; }
    content.push({ type: "tool_use", id: String(c?.id || ""), name: String(c?.function?.name || ""), input });
  }
  const u = json?.usage || {};
  return {
    id: json?.id || "",
    model: json?.model || fallbackModel,
    stop_reason: STOP[json?.choices?.[0]?.finish_reason] || "end_turn",
    content,
    usage: { input_tokens: Number(u.prompt_tokens) || 0, output_tokens: Number(u.completion_tokens) || 0 },
  };
}

function metaError(status, json) {
  const message = String(json?.error?.message || json?.message || `Meta API request failed (HTTP ${status}).`);
  const e = new Error(message);
  e.status = status;
  e.error = json?.error || json;
  return e;
}

export function createMetaClient() {
  return {
    provider: "meta",
    messages: {
      create: async (params = {}) => {
        const key = KEY();
        if (!key) {
          const e = new Error("META_MODEL_API_KEY is not set.");
          e.status = 401;
          throw e;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120000);
        let res;
        try {
          res = await httpFetch(`${BASE()}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify(toChatBody(params)),
            signal: ctrl.signal,
          });
        } catch (e) {
          if (e?.name === "AbortError") throw new Error("Meta API request timed out after 120 seconds.");
          throw e;
        } finally {
          clearTimeout(timer);
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw metaError(res.status, json);
        return fromChatReply(json, params.model || META_MODEL());
      },
    },
  };
}
