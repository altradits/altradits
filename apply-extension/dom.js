// Injected into the job tab (every frame) by the Altradits Apply extension.
// Reads the form for the AI, performs its actions, and shows Stanley's control
// panel in the top frame. Safe to inject more than once.
(() => {
  if (window.__aa) return;

  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const txt = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const isButton = (el) => ["BUTTON", "A"].includes(el.tagName) || el.getAttribute("role") === "button" || ["submit", "button"].includes(el.type);

  function labelOf(el) {
    if (isButton(el)) return (el.getAttribute("aria-label") || txt(el) || el.value || el.title || "").slice(0, 200);
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
  }

  let n = 0;
  function snapshot(prefix) {
    const out = [];
    const els = document.querySelectorAll("input, textarea, select, button, [role=button], [role=checkbox], [role=radio], [role=combobox], [contenteditable=true], a[href]");
    for (const el of els) {
      if (el.type === "hidden" || el.closest("#__aa_host")) continue;
      if (!vis(el) && !["file", "checkbox", "radio"].includes(el.type)) continue;
      if (el.tagName === "A" && !/apply|next|continue|submit|start|upload|resume|cv/i.test(txt(el))) continue;
      if (!el.dataset.aaId || !el.dataset.aaId.startsWith(prefix)) el.dataset.aaId = `${prefix}${++n}`;
      const e = { id: el.dataset.aaId, tag: el.tagName.toLowerCase(), type: el.type || el.getAttribute("role") || "", label: labelOf(el) };
      if (el.required || el.getAttribute("aria-required") === "true") e.required = true;
      if (el.disabled) e.disabled = true;
      if (el.type === "password") e.value = el.value ? "(filled)" : "";
      else if (el.type === "file") e.value = el.files?.length ? [...el.files].map((f) => f.name).join(", ") : "";
      else if (["checkbox", "radio"].includes(el.type)) { e.checked = el.checked; e.value = el.value; }
      else if ("value" in el && el.tagName !== "BUTTON") e.value = String(el.value || "").slice(0, 200);
      if (el.tagName === "SELECT") e.options = [...el.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 60);
      out.push(e);
    }
    const notes = [...document.querySelectorAll("h1, h2, h3, [role=alert], .error, .errors, .field-error, .invalid-feedback, [aria-live]")]
      .filter((el) => vis(el) && !el.closest("#__aa_host")).map(txt).filter(Boolean).slice(0, 25).join(" · ").slice(0, 1500);
    const frames = [...document.querySelectorAll("iframe")].map((f) => `${f.title || ""} ${f.src || ""}`.trim()).filter(Boolean).slice(0, 10);
    const body = txt(document.body).replace(txt(document.getElementById("__aa_host")), "").slice(0, 2500);
    return { url: location.href, title: document.title, elements: out, notes, body, frames };
  }

  // Set a value the way a person typing would (works with React/Vue forms).
  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    el.focus();
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  function act(op) {
    const el = document.querySelector(`[data-aa-id="${op.id}"]`);
    if (op.name !== "press_key" && !el) return `ERROR: element ${op.id} not found; take a new look at the page`;
    el?.scrollIntoView({ block: "center" });
    switch (op.name) {
      case "fill_field":
        if (el.isContentEditable) { el.focus(); el.textContent = op.value; el.dispatchEvent(new Event("input", { bubbles: true })); }
        else setValue(el, String(op.value ?? ""));
        return `Filled ${op.id}`;
      case "type_text":
        el.click();
        setValue(el, String(op.text ?? ""));
        el.focus();
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        return `Typed into ${op.id}; now click the matching option`;
      case "select_option": {
        const want = String(op.option).trim().toLowerCase();
        const opt = [...el.options].find((o) => o.text.trim().toLowerCase() === want) || [...el.options].find((o) => o.text.trim().toLowerCase().includes(want)) || [...el.options].find((o) => o.value.toLowerCase() === want);
        if (!opt) return `ERROR: no option "${op.option}"`;
        setValue(el, opt.value);
        return `Selected "${opt.text.trim()}" in ${op.id}`;
      }
      case "set_checked":
        if (el.checked !== Boolean(op.checked)) el.click();
        if (el.checked !== Boolean(op.checked)) { el.checked = Boolean(op.checked); el.dispatchEvent(new Event("change", { bubbles: true })); }
        return `${op.checked ? "Checked" : "Unchecked"} ${op.id}`;
      case "upload_file": {
        const bytes = Uint8Array.from(atob(op.data), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], op.fileName, { type: op.fileType }));
        el.files = dt.files;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return `Uploaded ${op.fileName} to ${op.id}`;
      }
      case "click":
        el.click();
        return `Clicked ${op.id}`;
      default:
        return `ERROR: unknown action ${op.name}`;
    }
  }

  // ---------------------------------------------------------------- panel (top frame)
  let last = null;
  function mountPanel() {
    if (window.top !== window || !document.body || document.getElementById("__aa_host")) return;
    const host = document.createElement("div");
    host.id = "__aa_host";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .p{width:340px;font:14px/1.45 system-ui,sans-serif;background:#0F1B2D;color:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}
      .h{background:#2F5BEA;padding:10px 14px;font-weight:700;display:flex;justify-content:space-between}
      .b{padding:12px 14px}.s{white-space:pre-wrap;max-height:200px;overflow:auto}
      .q{display:none;margin-top:10px}.q.on{display:block}
      textarea{width:100%;box-sizing:border-box;border-radius:8px;border:0;padding:8px;font:inherit;min-height:60px}
      .r{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      button{font:600 13px system-ui;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
      .go{background:#F7931A;color:#0F1B2D}.ok{background:#12A37F;color:#fff}.x{background:#4B5A70;color:#fff}.hide{display:none}</style>
      <div class="p"><div class="h"><span>🤖 Altradits Apply</span><span id="st">working</span></div>
      <div class="b"><div class="s" id="msg">Starting…</div><div class="q" id="ask"><textarea id="ans" placeholder="Your answer"></textarea></div>
      <div class="r"><button class="ok hide" id="submit">✅ Submit for me</button><button class="go hide" id="cont">Continue</button><button class="x" id="stop">Stop</button></div></div></div>`;
    document.body.appendChild(host);
    const $ = (id) => root.getElementById(id);
    const send = (action) => {
      const msg = { type: "panel", action, text: $("ans").value };
      if (window.chrome?.runtime?.sendMessage) chrome.runtime.sendMessage(msg);
      else window.__aaPanelAction?.(msg); // tests
    };
    $("cont").onclick = () => send("continue");
    $("submit").onclick = () => send("submit");
    $("stop").onclick = () => send("stop");
    host.__set = (s) => {
      $("msg").textContent = s.message || "";
      $("st").textContent = s.status || "working";
      $("ask").classList.toggle("on", Boolean(s.ask));
      if (s.ask) { $("ans").value = ""; $("ans").focus(); }
      $("cont").classList.toggle("hide", !s.wait);
      $("cont").textContent = s.ask ? "Send answer" : "Continue";
      $("submit").classList.toggle("hide", !s.canSubmit);
    };
    if (last) host.__set(last);
  }
  function setPanel(state) {
    last = state;
    mountPanel();
    document.getElementById("__aa_host")?.__set(state);
  }
  if (window.top === window) setInterval(() => { if (last) mountPanel(); }, 1000);

  window.__aa = { snapshot, act, setPanel };
})();
