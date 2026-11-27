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
  for (const dead of [".cards", ".steps", ".sr-only", ".btn.ghost", ".tabs", ".more", ".pager", ".foot nav", "details{interpolate-size"]) {
    assert.ok(!css.includes(dead), `friends.html: no ${dead}`);
  }
});

test("used rules stay", () => {
  for (const kept of [".friends{", ".friends>li", ".side{", ".btn{", ".topnav a{transition", ".top{transition:box-shadow", "html{scroll-behavior:smooth}", ".friends>li,.side{transition"]) {
    assert.ok(css.includes(kept), `friends.html: keeps ${kept}`);
  }
});
