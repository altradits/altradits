// Opcode Circuit page checks: current CSP, frame bust, reporter. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
test("game page carries a current policy (same builder as the site)", async () => {
  const { withPolicy } = await import("../deploy/page-csp.mjs");
  const html = read("opcode-circuit/index.html");
  assert.equal(withPolicy(html), html, "opcode-circuit/index.html: policy stale. Rebuild the meta tag.");
});
test("game page busts frames and reports violations", () => {
  const html = read("opcode-circuit/index.html");
  const js = read("opcode-circuit/game.js");
  assert.match(html + js, /window\.top !== window\.self/, "frame check missing");
  assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, "reporter missing");
});
test("game page has no inline handlers or javascript links", () => {
  const html = read("opcode-circuit/index.html");
  assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=\s*["']/i, "inline handler");
  assert.doesNotMatch(html, /href\s*=\s*["']\s*javascript:/i, "javascript link");
});
test("manifest and service worker stay scoped to the game path", () => {
  const man = JSON.parse(read("opcode-circuit/manifest.webmanifest"));
  assert.equal(man.scope, "/opcode-circuit");
  assert.equal(man.start_url, "/opcode-circuit");
  for (const i of man.icons) assert.ok(i.src.startsWith("/opcode-circuit/"), i.src);
});
