// Guide tags: no card tag restates its neighbors. The eight .tag labels
// (Sats/In/Out, In your wallet now/Being built, Project/Wallet/Till)
// repeated their h3s or section intro from the same slot, so they are
// gone; headings and intros carry the meaning alone.
// Run: node --test test/guide-tags.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "wallet-guide.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

test("no tag spans or tag rule remain", () => {
  assert.ok(!html.includes('class="tag"'), "no tag spans in markup");
  assert.ok(!css.includes(".tag"), "no tag selectors in CSS");
});

test("headings and intros still carry the meaning", () => {
  for (const h3 of ["You count in sats", "Get some in", "Send some out",
    "Open, receive, send, cash out", "Buy, more countries, then full ownership",
    "Altradits", "Ye₿ente", "kTown"]) {
    assert.ok(html.includes(`<h3>${h3}</h3>`), `h3 kept: ${h3}`);
  }
  assert.ok(html.includes("What's already in your wallet, and what's being built."), "status intro kept");
  assert.ok(html.includes("Altradits is the project. Ye₿ente is the wallet. kTown is the till."), "names intro kept");
});
