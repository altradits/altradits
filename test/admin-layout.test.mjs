// The admin dashboard's layout (#517): every tab has its pane, every pane its
// tab, and every "What needs you" link names the tab that holds its panel, so
// panels can be moved between tabs without breaking a link.
// Run: node --test test/admin-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const js = fs.readFileSync(path.join(root, "assets/admin.js"), "utf8");
const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
const paneAt = [...html.matchAll(/<div class="pane" data-pane="(\w+)">/g)].map((m) => ({ at: m.index, name: m[1] }));
const paneOf = (id) => {
  const i = html.indexOf(`id="${id}"`);
  return i < 0 ? null : paneAt.filter((p) => p.at < i).pop()?.name || null;
};

test("every tab has one pane and every pane one tab", () => {
  assert.deepEqual([...new Set(tabs)].sort(), paneAt.map((p) => p.name).sort());
  assert.equal(new Set(tabs).size, tabs.length, "no tab listed twice");
});

test("every alert link names the tab that holds its panel", () => {
  const targets = [...new Set([...js.matchAll(/"([a-z]+):(h[A-Za-z0-9]+)(?::[^"]*)?"/g)].map((m) => `${m[1]}:${m[2]}`))];
  assert.ok(targets.length > 10, "alert links found");
  for (const t of targets) {
    const [tab, id] = t.split(":");
    assert.equal(paneOf(id), tab, `${t}: the panel is in ${paneOf(id)}`);
  }
});

test("element ids are unique on the page", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepEqual(dup, []);
});
