// Browser side of the Apply Agent: reading the form, acting on it, and the
// on-page control panel Stanley uses to answer questions and approve submits.

// ---------------------------------------------------------------- snapshot
// Runs inside each frame. Tags every interactive element with a stable id and
// describes it (label, type, required, value, options) for the AI.
function snapshotInFrame(prefix) {
  window.__aaN = window.__aaN || 0;
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const txt = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const labelOf = (el) => {
    // Buttons and links are described by their own text only.
    if (["BUTTON", "A"].includes(el.tagName) || el.getAttribute("role") === "button" || ["submit", "button"].includes(el.type)) {
      return (el.getAttribute("aria-label") || txt(el) || el.value || el.title || "").slice(0, 200);
    }
    const parts = [];
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    const by = el.getAttribute("aria-labelledby");
    if (by) parts.push(by.split(/\s+/).map((i) => txt(document.getElementById(i))).join(" "));
    if (el.labels?.length) parts.push([...el.labels].map(txt).join(" "));
    if (!parts.length && el.closest("label")) parts.push(txt(el.closest("label")));
    if (!parts.length) {
      const box = el.closest("fieldset, .field, .form-group, .form-field, li, div");
      const legend = box?.querySelector("legend, label, .label, h3, h4");
      if (legend && legend !== el) parts.push(txt(legend));
    }
    if (el.placeholder) parts.push(`placeholder: ${el.placeholder}`);
    if (!parts.length && el.name) parts.push(el.name);
    return parts.join(" | ").slice(0, 200);
  };
  const out = [];
  const els = document.querySelectorAll("input, textarea, select, button, [role=button], [role=checkbox], [role=radio], [role=combobox], [contenteditable=true], a[href]");
  for (const el of els) {
    if (el.type === "hidden") continue;
    if (!vis(el) && !["file", "checkbox", "radio"].includes(el.type)) continue;
    if (el.tagName === "A" && !/apply|next|continue|submit|start|upload|resume|cv/i.test(txt(el))) continue;
    if (!el.dataset.aaId) el.dataset.aaId = `${prefix}${++window.__aaN}`;
    const e = { id: el.dataset.aaId, tag: el.tagName.toLowerCase(), type: el.type || el.getAttribute("role") || "", label: labelOf(el) };
    if (el.required || el.getAttribute("aria-required") === "true") e.required = true;
    if (el.disabled) e.disabled = true;
    if (el.type === "password") e.value = el.value ? "(filled)" : "";
    else if (el.type === "file") e.value = el.files?.length ? [...el.files].map((f) => f.name).join(", ") : "";
    else if (["checkbox", "radio"].includes(el.type)) { e.checked = el.checked; e.value = el.value; if (el.name) e.name = el.name; }
    else if ("value" in el && el.tagName !== "BUTTON") e.value = String(el.value || "").slice(0, 200);
    if (el.tagName === "SELECT") e.options = [...el.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 60);
    out.push(e);
  }
  const notes = [...document.querySelectorAll("h1, h2, h3, [role=alert], .error, .errors, .field-error, .invalid-feedback, [aria-live]")]
    .filter(vis).map(txt).filter(Boolean).slice(0, 25).join(" · ").slice(0, 1500);
  const frames = [...document.querySelectorAll("iframe")].map((f) => `${f.title || ""} ${f.src || ""}`.trim()).filter(Boolean).slice(0, 10);
  return { url: location.href, title: document.title, elements: out, notes, body: txt(document.body).slice(0, 2500), frames };
}

export async function snapshot(page) {
  const parts = [];
  const frames = page.frames();
  for (let i = 0; i < frames.length && i < 8; i++) {
    try {
      const s = await frames[i].evaluate(snapshotInFrame, `f${i}e`);
      if (i === 0 || s.elements.length) parts.push({ frame: i, ...s });
    } catch { /* cross-origin frame not ready */ }
  }
  return parts;
}

export function describe(parts) {
  const lines = [];
  for (const p of parts) {
    lines.push(`=== FRAME ${p.frame}: ${p.title} (${p.url})`);
    if (p.notes) lines.push(`Headings/messages: ${p.notes}`);
    if (p.frames.length) lines.push(`Embedded frames: ${p.frames.join(" ; ")}`);
    for (const e of p.elements) {
      const bits = [`[${e.id}]`, e.tag + (e.type ? `:${e.type}` : ""), JSON.stringify(e.label)];
      if (e.required) bits.push("REQUIRED");
      if (e.disabled) bits.push("disabled");
      if (e.checked !== undefined) bits.push(e.checked ? "checked" : "unchecked");
      if (e.value) bits.push(`value=${JSON.stringify(e.value)}`);
      if (e.options) bits.push(`options=${JSON.stringify(e.options)}`);
      lines.push(bits.join(" "));
    }
    if (p.frame === 0) lines.push(`Page text (start): ${p.body}`);
  }
  return lines.join("\n").slice(0, 24000);
}

// ---------------------------------------------------------------- actions
function locate(page, id) {
  const m = /^f(\d+)e\d+$/.exec(String(id));
  if (!m) throw new Error(`Unknown element id ${id}`);
  const frame = page.frames()[Number(m[1])];
  if (!frame) throw new Error(`Frame for ${id} is gone; take a new look at the page`);
  return frame.locator(`[data-aa-id="${id}"]`).first();
}

export async function act(page, name, input, files) {
  const el = () => locate(page, input.id);
  switch (name) {
    case "fill_field": await el().fill(String(input.value ?? ""), { timeout: 8000 }); return `Filled ${input.id}`;
    case "type_text": await el().click({ timeout: 8000 }); await page.keyboard.type(String(input.text ?? ""), { delay: 20 }); return `Typed into ${input.id}`;
    case "press_key": await page.keyboard.press(String(input.key)); return `Pressed ${input.key}`;
    case "select_option": {
      const loc = el();
      try { await loc.selectOption({ label: String(input.option) }, { timeout: 5000 }); }
      catch { await loc.selectOption(String(input.option), { timeout: 5000 }); }
      return `Selected "${input.option}" in ${input.id}`;
    }
    case "set_checked": await el().setChecked(Boolean(input.checked), { timeout: 8000, force: true }); return `${input.checked ? "Checked" : "Unchecked"} ${input.id}`;
    case "upload_file": {
      const path = files[input.file];
      if (!path) return `ERROR: no ${input.file} available`;
      await el().setInputFiles(path, { timeout: 8000 });
      return `Uploaded ${input.file} to ${input.id}`;
    }
    case "click": await el().click({ timeout: 8000 }); return `Clicked ${input.id}`;
    default: return `ERROR: unknown action ${name}`;
  }
}

// ---------------------------------------------------------------- control panel
// A small panel injected into the page (top frame) so Stanley can see what the
// agent is doing, answer its questions, and approve the final submit.
export function panelScript() {
  if (window.top !== window || window.__aaPanel) return;
  window.__aaPanel = true;
  const mount = () => {
    if (!document.body || document.getElementById("__aa_host")) return;
    const host = document.createElement("div");
    host.id = "__aa_host";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .p{width:340px;font:14px/1.45 system-ui,sans-serif;background:#0F1B2D;color:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}
      .h{background:#2F5BEA;padding:10px 14px;font-weight:700;display:flex;justify-content:space-between}
      .b{padding:12px 14px}.s{white-space:pre-wrap;max-height:180px;overflow:auto}
      .q{display:none;margin-top:10px}.q.on{display:block}
      textarea{width:100%;box-sizing:border-box;border-radius:8px;border:0;padding:8px;font:inherit;min-height:60px}
      .r{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      button{font:600 13px system-ui;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
      .go{background:#F7931A;color:#0F1B2D}.ok{background:#12A37F;color:#fff}.x{background:#4B5A70;color:#fff}
      .hide{display:none}</style>
      <div class="p"><div class="h"><span>🤖 Altradits Apply Agent</span><span id="st">working</span></div>
      <div class="b"><div class="s" id="msg">Starting…</div>
        <div class="q" id="ask"><textarea id="ans" placeholder="Your answer"></textarea></div>
        <div class="r"><button class="ok hide" id="submit">✅ Submit for me</button><button class="go hide" id="cont">Continue</button><button class="x" id="stop">Stop</button></div></div></div>`;
    document.body.appendChild(host);
    const $ = (id) => root.getElementById(id);
    const send = (action) => window.aaAction && window.aaAction(action, $("ans").value);
    $("cont").onclick = () => send("continue");
    $("submit").onclick = () => send("submit");
    $("stop").onclick = () => send("stop");
    window.__aaSet = (state) => {
      $("msg").textContent = state.message || "";
      $("st").textContent = state.status || "working";
      $("ask").classList.toggle("on", Boolean(state.ask));
      if (state.ask) { $("ans").value = ""; $("ans").focus(); }
      $("cont").classList.toggle("hide", !state.wait);
      $("cont").textContent = state.ask ? "Send answer" : "Continue";
      $("submit").classList.toggle("hide", !state.canSubmit);
    };
    if (window.__aaLast) window.__aaSet(window.__aaLast);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  setInterval(mount, 1000); // re-mount if a single-page app replaces the body
}

export async function setPanel(page, state) {
  await page.evaluate((s) => { window.__aaLast = s; if (window.__aaSet) window.__aaSet(s); }, state).catch(() => {});
}
