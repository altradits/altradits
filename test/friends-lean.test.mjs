// Friends lean: the stylesheet carries only selectors the page uses.
// .cards, .steps, .sr-only and .btn.ghost had no matching markup, and the
// motion guard named .tabs, .more, .pager, .foot and details the page
// never uses. The used rules (friends grid, side cards, buttons, nav,
// top shadow, card lift) stay.
// Run: node --test test/friends-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "friends.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

test("dead rules are gone", () => {
  for (const dead of [".cards", ".steps", ".sr-only", ".btn.ghost", ".tabs", ".more", ".pager", ".foot nav", "details{interpolate-size", "--ok", "aria-current", "5px 5px 0 var(--ink)"]) {
    assert.ok(!css.includes(dead), `friends.html: no ${dead}`);
  }
});

test("cards stay calm with guarded hover", () => {
  for (const calm of [".friends>li{background:var(--paper);border:2px solid var(--line)", ".side{background:var(--paper);border:2px solid var(--line)"]) {
    assert.ok(css.includes(calm), `friends.html: calm ${calm.slice(0, 12)} border`);
  }
  assert.ok(css.includes("@media (prefers-reduced-motion:no-preference){.friends>li,.side{transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.friends>li:hover,.side:hover{border-color:var(--ink);transform:translateY(-2px)}"), "friends.html: hover lift and ink border stay inside the motion guard");
});

test("used rules stay", () => {
  for (const kept of [".friends{", ".friends>li", ".side{", ".btn{", ".topnav a{transition", ".top{transition:box-shadow", "html{scroll-behavior:smooth}", ".friends>li,.side{transition"]) {
    assert.ok(css.includes(kept), `friends.html: keeps ${kept}`);
  }
});
