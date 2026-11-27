// Bitcoin Core guide lean: the stylesheet carries only selectors the page
// uses. .sr-only, .ctas, .btn and .btn.ghost had no matching markup, and
// the motion guard named .tabs, .btn, .cards, .more, .foot and .pager
// selectors the page never uses. The OS details animation stays.
// Run: node --test test/core-guide-lean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "bitcoin-core.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

test("dead rules are gone", () => {
  for (const dead of [".sr-only", ".ctas", ".btn{", ".btn.ghost", ".tabs", ".cards", ".more", ".pager", ".foot nav", "a[aria-current]"]) {
    assert.ok(!css.includes(dead), `bitcoin-core.html: no ${dead}`);
  }
});

test("used rules stay", () => {
  for (const kept of [".paths a", "details.os", "ol.howto", ".expect", ".warn", ".toc", ".topnav a{transition", ".top{transition:box-shadow", "html{scroll-behavior:smooth}", "details{interpolate-size:allow-keywords}", "details::details-content{transition:height .25s ease}", "max-width:44rem;text-wrap:balance}"]) {
    assert.ok(css.includes(kept), `bitcoin-core.html: keeps ${kept}`);
  }
});
