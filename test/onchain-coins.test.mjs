// The on-chain panel renders each reading once, however often it reloads.
// Executes the dashboard's own renderChain with a stub page.
// Run: node --test test/onchain-coins.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/admin.js"), "utf8");
const start = src.indexOf("function renderChain(D) {");
const end = src.indexOf("// end renderChain");
assert.ok(start > 0 && end > start, "renderChain is shipped in assets/admin.js");

// The dashboard's own helpers, copied exactly.
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const satsF = (n) => (n === null || n === undefined ? "–" : `${num(n)} sats`);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kpi = (label, v, state, why) => `<div class="kpi${state ? ` ${state}` : ""}"><small>${esc(label)}</small><div>${esc(v)}</div>${why ? `<span class="why">${esc(why)}</span>` : ""}</div>`;
const judge = (ok) => (ok === null || ok === undefined ? "" : ok ? "good" : "warn");
const els = {};
const $ = (sel) => (els[sel] ||= { innerHTML: "", insertAdjacentHTML(pos, html) { this.innerHTML += html; } });
const render = new Function("D", "$", "kpi", "satsF", "num", "judge", "esc", "lastUtxos",
  `${src.slice(start, end)}\nreturn renderChain(D);`);
const D = { details: { onchain: { confirmed: 0, unconfirmed: 0 } }, chainFees: { fast: 3, slow: 3 } };
const coins = () => els["#chainKpis"].innerHTML.split("Coins (UTXOs)").length - 1;

test("reloading twice shows the Coins reading exactly once", () => {
  render(D, $, kpi, satsF, num, judge, esc, { count: 0 });
  render(D, $, kpi, satsF, num, judge, esc, { count: 0 });
  assert.equal(coins(), 1);
});

test("no coins known yet: no Coins reading, and no blind appends outside the renderer", () => {
  els["#chainKpis"].innerHTML = "";
  render(D, $, kpi, satsF, num, judge, esc, null);
  assert.equal(coins(), 0);
  const explorer = src.slice(src.indexOf("async function loadExplorer() {"), src.indexOf("// Ye₿ente wallets"));
  assert.ok(!explorer.includes("insertAdjacentHTML"), "loadExplorer never appends to the panel itself");
});
