// "What's yours right now": unknown reads never look like a measured 0.
// Executes the dashboard's own pnlYoursHtml against both states.
// Run: node --test test/pnl-display.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/admin.js"), "utf8");
const start = src.indexOf("function pnlYoursHtml(L) {");
const end = src.indexOf("// end pnlYoursHtml");
assert.ok(start > 0 && end > start, "pnlYoursHtml is shipped in assets/admin.js");

// The dashboard's own helpers, copied exactly.
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const satsF = (n) => (n === null || n === undefined ? "–" : `${num(n)} sats`);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kpi = (label, v, state, why) => `<div class="kpi${state ? ` ${state}` : ""}"><small>${esc(label)}</small><div>${esc(v)}</div>${why ? `<span class="why">${esc(why)}</span>` : ""}</div>`;
const ksh = (sats) => (sats !== null && sats !== undefined ? `KSh ${Math.round((Number(sats) / 1e8) * 10074667).toLocaleString("en-US")}` : "");
const judge = (ok) => (ok === null || ok === undefined ? "" : ok ? "good" : "warn");
const render = (L) => new Function("L", "kpi", "satsF", "num", "ksh", "judge", "esc",
  `${src.slice(start, end)}\nreturn pnlYoursHtml(L);`)(L, kpi, satsF, num, ksh, judge, esc);

test("node unreadable: unknown, warned, never a 0", () => {
  const html = render({ nodeRead: false, yours: { assets: null, channelSats: null, onchainSats: null, owed: 37409, net: null } });
  assert.match(html, /kpi warn/, "On the node is flagged");
  assert.ok(html.includes("red note above"), "points at the red note");
  assert.ok(html.includes("Unknown until the node can be read."), "Yours says unknown");
  assert.ok(!html.includes("channels 0 + on-chain 0"), "unknown never prints as 0 + 0");
  assert.ok(html.includes("37,409 sats"), "the owed figure still shows");
});

test("node read and truly empty: honest zeros and the below-0 note", () => {
  const html = render({ nodeRead: true, yours: { assets: 0, channelSats: 0, onchainSats: 0, owed: 37409, net: -37409 } });
  assert.ok(html.includes("channels 0 + on-chain 0"), "a measured 0 still prints as 0");
  assert.ok(html.includes("Below 0 means wallets hold more than the node has."), "the shortfall note shows");
  assert.equal(html.split("kpi warn").length - 1, 1, "only the short Yours warns, not On the node");
});
