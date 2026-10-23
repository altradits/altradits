// Altradits Apply: background worker. When Stanley clicks "Apply with AI" in
// his dashboard, the bridge hands us the job and his dashboard sign-in. We open
// the job in a new tab of his own Chrome (his logins, his extensions), and run
// the apply loop: the AI runs on the Altradits server, we act on the page.
import { runApplication, describe } from "./core.js";

const VERSION = chrome.runtime.getManifest().version;
let running = null;      // { tabId, jobId }
let pending = null;      // resolves with Stanley's panel response

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ping") { sendResponse({ ok: true, version: VERSION, busy: Boolean(running) }); return; }
  if (msg?.type === "panel" && running && sender.tab?.id === running.tabId) { pending?.(msg); pending = null; return; }
  if (msg?.type === "apply") {
    if (running) { sendResponse({ ok: false, error: "Already applying to another job. Finish or stop it first." }); return; }
    sendResponse({ ok: true });
    apply(msg).catch((err) => console.error("apply failed", err));
  }
});

async function apply({ id, token, site }) {
  const api = async (body) => {
    const res = await fetch(`${site}/api/admin`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server ${res.status}`);
    return data;
  };
  const report = (u) => api({ action: "job_agent_update", id, ...u });
  // Extension API calls keep the worker alive during long pauses.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  let tabId = null;
  try {
    const start = await api({ action: "job_agent_start", id });
    const tab = await chrome.tabs.create({ url: "about:blank", active: true });
    tabId = tab.id;
    running = { tabId, jobId: id };

    const waitLoaded = (ms = 20000) => new Promise((resolve) => {
      const done = () => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); resolve(); };
      const listener = (tid, info) => { if (tid === tabId && info.status === "complete") done(); };
      const timer = setTimeout(done, ms);
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId).then((t) => { if (t.status === "complete" && t.url !== "about:blank") done(); }).catch(done);
    });
    const inject = () => chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["dom.js"] }).catch(() => {});
    const inFrame = async (frameId, func, args) => {
      const [r] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func, args });
      return r?.result;
    };
    let panelState = null;

    const adapter = {
      async open(url) { await chrome.tabs.update(tabId, { url }); await new Promise((r) => setTimeout(r, 500)); await waitLoaded(45000); await inject(); },
      async settle(ms) { await new Promise((r) => setTimeout(r, Math.min(ms, 800))); await waitLoaded(ms + 15000); await inject(); if (panelState) await adapter.panel(panelState); },
      async view() {
        await inject();
        const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [];
        const parts = [];
        for (const f of frames.slice(0, 8)) {
          try {
            const s = await inFrame(f.frameId, (p) => window.__aa?.snapshot(p), [`f${f.frameId}e`]);
            if (s && (f.frameId === 0 || s.elements.length)) parts.push({ frame: f.frameId, ...s });
          } catch { /* frame not scriptable */ }
        }
        return describe(parts);
      },
      async act(name, input) {
        const m = /^f(\d+)e\d+$/.exec(String(input.id || ""));
        if (!m) return `ERROR: unknown element id ${input.id}`;
        const op = { name, ...input };
        if (name === "upload_file") {
          if (!start.files.includes(input.file)) return `ERROR: no ${input.file} available`;
          const f = await api({ action: "job_agent_file", id, file: input.file });
          Object.assign(op, { data: f.data, fileName: f.name, fileType: f.type });
        }
        return (await inFrame(Number(m[1]), (o) => window.__aa ? window.__aa.act(o) : "ERROR: page not ready", [op])) ?? "ERROR: no result";
      },
      async panel(state) { panelState = state; await inFrame(0, (s) => window.__aa?.setPanel(s), [state]).catch(() => {}); },
    };

    const human = async (state) => {
      await adapter.panel(state);
      const t = await chrome.tabs.update(tabId, { active: true });
      chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
      return new Promise((resolve) => { pending = resolve; });
    };
    const think = (messages) => api({ action: "job_agent_think", id, messages });

    const result = await runApplication({ adapter, think, job: start.job, pack: start.pack, applicant: start.applicant, files: start.files, human, report });
    await adapter.panel({ message: result.outcome === "applied" ? `✅ Applied! ${result.details}` : `Stopped: ${result.details}`, status: result.outcome });
    await report({ status: result.outcome, note: result.details, confirmation: result.outcome === "applied" ? result.details : "" });
  } catch (err) {
    await report({ status: "failed", note: String(err.message || err).slice(0, 300) }).catch(() => {});
    if (tabId) chrome.scripting.executeScript({ target: { tabId }, func: (m) => window.__aa?.setPanel({ message: m, status: "error" }), args: [`Couldn't continue: ${err.message}`] }).catch(() => {});
  } finally {
    clearInterval(keepAlive);
    running = null;
    pending = null;
  }
}

// If Stanley closes the tab mid-application, stop cleanly.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (running?.tabId === tabId) { pending?.({ action: "stop" }); pending = null; }
});
