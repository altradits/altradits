// Donate dead ends (Closes #616): paid and expired invoices quiet dead
// actions and offer a way back that clears the stale invoice, copy failures
// speak plainly, and each new invoice resets the copy label and actions.
// Run: node --test test/donate-deadends.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "donate.html"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const inlineScript = scripts[scripts.length - 1];

function makeEl(id, extra = {}) {
  const attrs = new Map(Object.entries(extra.attrs || {}));
  const listeners = new Map();
  let focused = false;
  return {
    id,
    hidden: Boolean(extra.hidden),
    disabled: Boolean(extra.disabled),
    value: extra.value ?? "",
    innerHTML: "",
    textContent: extra.textContent ?? "",
    get href() { return attrs.get("href") ?? ""; },
    set href(v) { attrs.set("href", String(v)); },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    addEventListener(type, fn) { listeners.set(type, fn); },
    dispatch(type, event = {}) { return listeners.get(type)?.(event); },
    focus() { focused = true; },
    get focused() { return focused; },
    resetFocus() { focused = false; },
  };
}

function boot({ fetchImpl, clipboard }) {
  const els = {
    "#amts": makeEl("amts"),
    "#sats": makeEl("sats", { value: "12500" }),
    "#tipForm": makeEl("tipForm"),
    "#err": makeEl("err"),
    "#invoice": makeEl("invoice", { hidden: true }),
    "#qr": makeEl("qr"),
    "#bolt": makeEl("bolt"),
    "#copy": makeEl("copy", { textContent: "Copy invoice" }),
    "#open": makeEl("open", { attrs: { href: "#" } }),
    "#state": makeEl("state", { textContent: "Waiting for payment…" }),
    "#again": makeEl("again", { hidden: true }),
    "#fallback": makeEl("fallback", { hidden: true }),
    "#fbqr": makeEl("fbqr"),
    "#fbaddr": makeEl("fbaddr"),
  };
  let intervalFn = null;
  let cleared = 0;
  const ctx = {
    document: { querySelector: (s) => els[s] },
    navigator: clipboard === undefined ? {} : { clipboard },
    fetch: fetchImpl,
    setInterval(fn) { intervalFn = fn; return 1; },
    clearInterval() { cleared += 1; intervalFn = null; },
    Date,
    Number,
  };
  vm.runInNewContext(inlineScript, ctx);
  return { els, tick: () => intervalFn?.(), getCleared: () => cleared };
}

test("donate: dead actions have disabled styling", () => {
  assert.match(html, /#copy:disabled,#open\[aria-disabled\]\{opacity:\.55\}/, "dead invoice actions look disabled");
});

test("donate: expired invoice disables Copy and Open in wallet, reveals and focuses Make another invoice", async () => {
  const { els, tick } = boot({
    fetchImpl: async () => ({
      json: async () => ({
        qr: "<svg/>",
        bolt11: "lnbc12500n1expired",
        hash: "h-exp",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    }),
  });
  await els["#tipForm"].dispatch("submit", { preventDefault() {} });
  assert.equal(els["#invoice"].hidden, false);
  assert.equal(els["#copy"].disabled, false);
  assert.equal(els["#open"].href, "lightning:lnbc12500n1expired");
  assert.equal(els["#open"].hasAttribute("aria-disabled"), false);

  await tick();
  assert.equal(els["#state"].textContent, "This invoice expired. Make a new one.");
  assert.equal(els["#copy"].disabled, true, "Copy is disabled on expiry");
  assert.equal(els["#open"].hasAttribute("href"), false, "Open in wallet href removed on expiry");
  assert.equal(els["#open"].getAttribute("aria-disabled"), "true", "Open in wallet marked aria-disabled");
  assert.equal(els["#again"].hidden, false, "Make another invoice revealed");
  assert.equal(els["#again"].focused, true, "focus moves to Make another invoice");
});

test("donate: paid invoice quiets actions and Make another invoice clears stale invoice while keeping amount", async () => {
  const { els, tick } = boot({
    fetchImpl: async (url) => ({
      json: async () => url.includes("?hash=")
        ? { paid: true }
        : { qr: "<svg>ok</svg>", bolt11: "lnbc12500n1paid", hash: "h-paid", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    }),
  });
  await els["#tipForm"].dispatch("submit", { preventDefault() {} });
  await tick();
  assert.equal(els["#state"].textContent, "Received. Thank you ⚡");
  assert.equal(els["#copy"].disabled, true, "Copy is disabled after payment");
  assert.equal(els["#open"].hasAttribute("href"), false, "Open in wallet href removed after payment");
  assert.equal(els["#open"].getAttribute("aria-disabled"), "true");
  assert.equal(els["#again"].hidden, false);
  assert.equal(els["#again"].focused, true);

  els["#again"].dispatch("click");
  assert.equal(els["#invoice"].hidden, true, "invoice panel hides");
  assert.equal(els["#again"].hidden, true, "again button hides");
  assert.equal(els["#qr"].innerHTML, "", "stale QR cleared");
  assert.equal(els["#bolt"].value, "", "stale bolt11 cleared");
  assert.equal(els["#sats"].value, "12500", "typed amount kept");
  assert.equal(els["#sats"].focused, true, "amount input takes focus");
  assert.equal(els["#copy"].disabled, false, "Copy ready for next invoice");
  assert.equal(els["#copy"].textContent, "Copy invoice", "Copy label reset");
});

test("donate: clipboard success, denial, and missing API speak plainly; new invoice resets label and actions", async () => {
  let mode = "deny";
  const { els, tick } = boot({
    clipboard: {
      writeText: () => mode === "ok" ? Promise.resolve() : Promise.reject(new Error("denied")),
    },
    fetchImpl: async () => ({
      json: async () => ({
        qr: "<svg/>",
        bolt11: "lnbc12500n1copy",
        hash: "h-copy",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    }),
  });
  await els["#tipForm"].dispatch("submit", { preventDefault() {} });
  els["#copy"].dispatch("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(els["#copy"].textContent, "Copy failed", "denied clipboard says Copy failed");

  mode = "ok";
  els["#copy"].dispatch("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(els["#copy"].textContent, "Copied", "successful copy says Copied");

  await tick();
  assert.equal(els["#copy"].disabled, true);

  await els["#tipForm"].dispatch("submit", { preventDefault() {} });
  assert.equal(els["#copy"].textContent, "Copy invoice", "new invoice resets Copy label");
  assert.equal(els["#copy"].disabled, false, "new invoice re-enables Copy");
  assert.equal(els["#open"].hasAttribute("aria-disabled"), false, "new invoice re-enables Open in wallet");
  assert.equal(els["#open"].href, "lightning:lnbc12500n1copy");

  const noClip = boot({ fetchImpl: async () => ({ json: async () => ({}) }) });
  noClip.els["#copy"].dispatch("click");
  assert.equal(noClip.els["#copy"].textContent, "Copy failed", "missing clipboard API says Copy failed");
});
