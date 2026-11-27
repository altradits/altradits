// Checklist lean: the stylesheet carries only selectors the page uses,
// and every link into the full guide lands on a real section. Rules for
// note, pre, code, table, button, details, months, proof, cards, tag, sm,
// h3, sr-only, ctas and btn had no matching markup, and the motion guard
// named selectors the page never uses.
// Run: node --test test/checklist-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "bitcoin-core-checklist.html"), "utf8");
const guide = fs.readFileSync(path.join(ROOT, "bitcoin-core.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

test("dead rules are gone", () => {
  for (const dead of [".note", "pre{", "code{", "p code", "table{", "th,td", "th{", "button{", "button:hover", "details{", "summary{", ".months", ".proof", ".cards", ".tag{", ".sm{", "h3{", ".sr-only", ".ctas", ".btn{", ".btn.ghost", ".tabs", ".more", ".pager", ".foot nav", "details{interpolate-size"]) {
    assert.ok(!css.includes(dead), `checklist: no ${dead}`);
  }
});

test("used rules stay", () => {
  for (const kept of [".check{", ".check li{", ".check b{", "ol.check{", ".topnav a{transition", ".top{transition:box-shadow", "html{scroll-behavior:smooth}", "@media print"]) {
    assert.ok(css.includes(kept), `checklist: keeps ${kept}`);
  }
});

test("every guide link lands on a real section", () => {
  const frags = [...html.matchAll(/href="\/bitcoin-core#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(frags.length >= 10, `checklist links into the guide, found ${frags.length}`);
  for (const f of frags) {
    assert.ok(guide.includes(`id="${f}"`), `bitcoin-core.html carries #${f}`);
  }
});
