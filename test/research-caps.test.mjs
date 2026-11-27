// The research page's Send Mobile caps must match the coded B2C limits:
// 10 to 5,000 KES per payment, not the old partner range.
// Run: node --test test/research-caps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("research Send Mobile caps match mobileLimits", () => {
  const yw = read("lib/ywallet.js");
  const m = yw.match(/const mobileLimits = \(\) => \(\{\s*minKes: (\d+),\s*maxKes: num\("YEBENTE_B2C_MAX_KES", ([\d_]+)\)/);
  assert.ok(m, "lib/ywallet.js: mobileLimits with KES bounds exists");
  const min = m[1], max = m[2].replace(/_/g, "");
  assert.equal(min, "10", "lib/ywallet.js: Send Mobile minimum is 10 KES");
  assert.equal(max, "5000", "lib/ywallet.js: Send Mobile maximum is 5,000 KES");
  const page = read("research.html");
  assert.doesNotMatch(page, /Send Mobile 15 to 50,000/, "research.html: no stale partner range");
  assert.match(page, new RegExp(`Send Mobile ${min} to ${Number(max).toLocaleString("en-US")} KES`), "research.html: the coded caps are stated");
});
