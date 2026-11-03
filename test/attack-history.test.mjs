// Attack history: one closed accordion per attack, oldest first, each with its
// guard status. Executes the dashboard's own attackHistoryHtml.
// Run: node --test test/attack-history.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/admin.js"), "utf8");
const start = src.indexOf("const HIST_STATUS =");
const end = src.indexOf("// end attackHistoryHtml");
assert.ok(start > 0 && end > start, "attackHistoryHtml is shipped in assets/admin.js");

// The dashboard's own helper, copied exactly.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const render = new Function("list", "esc", `${src.slice(start, end)}\nreturn attackHistoryHtml(list);`);

const ATTACKS = [
  { year: 2014, name: "Mt. Gox collapse", what: "w", lesson: "l", guard: "g", status: "guarded" },
  { year: 2010, name: "Value overflow", what: "w", lesson: "l", guard: "g", status: "watch" },
  { year: 2016, name: "Bitfinex hack", what: "w", lesson: "l", guard: "g", status: "action" },
];

test("one closed accordion each, oldest first, with status and labeled parts", () => {
  const html = render(ATTACKS, esc);
  assert.equal(html.split("<details>").length - 1, 3);
  assert.ok(!html.includes(" open"), "all start closed");
  assert.ok(html.indexOf("2010") < html.indexOf("2014") && html.indexOf("2014") < html.indexOf("2016"), "oldest first");
  assert.ok(html.includes('<b class="ok">Guarded</b>'), "guarded badge");
  assert.ok(html.includes('<b class="warn">Watch</b>'), "watch badge");
  assert.ok(html.includes('<b class="err">Needs you</b>'), "action badge");
  for (const label of ["What happened:", "Lesson:", "Our guard:"]) assert.ok(html.includes(label), label);
});

test("every field is escaped", () => {
  const html = render([{ year: 2020, name: "<script>n</script>", what: "<b>w</b>", lesson: "<i>l</i>", guard: "<u>g</u>", status: "guarded" }], esc);
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"), "name escaped");
  assert.ok(!html.includes("<b>w</b>") && html.includes("&lt;b&gt;w&lt;/b&gt;"), "body escaped");
});
