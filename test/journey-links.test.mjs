// Journey links: one name, one destination. The top nav points Ye₿ente at
// the wallet guide, so the body must not point the same bare name at the
// wallet app. More broadly, no two links on the page may share an
// accessible name yet go to different places.
// Run: node --test test/journey-links.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "journey.html"), "utf8");
const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
  const href = (m[1].match(/href="([^"]*)"/) || [])[1] || "";
  const label = m[1].match(/aria-label="([^"]*)"/);
  // Every link with nested markup carries an aria-label; the rest are plain
  // text. Anything else fails loudly as an empty name below.
  return { href, name: label ? label[1] : (m[2].includes("<") ? "" : m[2].trim()) };
});

test("the wallet link names the app, not the bare word", () => {
  assert.ok(links.some((l) => l.href === "/yebente" && l.name === "Ye₿ente, my open-source wallet"),
    "journey.html: the wallet link carries its sentence");
  assert.ok(!links.some((l) => l.href === "/yebente" && l.name === "Ye₿ente"),
    "journey.html: no bare Ye₿ente points at the wallet");
});

test("no name on the page points two ways", () => {
  const dests = new Map();
  for (const l of links) {
    assert.ok(l.name, `journey.html: link to ${l.href} has an accessible name`);
    if (!dests.has(l.name)) dests.set(l.name, new Set());
    dests.get(l.name).add(l.href);
  }
  for (const [name, hrefs] of dests) {
    assert.equal(hrefs.size, 1, `journey.html: ${JSON.stringify(name)} goes one place, not ${[...hrefs].join(", ")}`);
  }
});
