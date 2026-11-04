import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// House spelling: the wallet name carries the bitcoin sign in every file,
// except the X month hashtag, which stays ASCII so X links it as one tag.
// The needle is joined so this file never spells it the old way itself.
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const NEEDLE = ["Ye", "Bente"].join("");
const SKIP = new Set([".git", "node_modules"]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

test("wallet name carries the bitcoin sign outside the X hashtag", () => {
  const bad = [];
  for (const f of walk(ROOT)) {
    const s = fs.readFileSync(f, "latin1");
    let i = s.indexOf(NEEDLE);
    while (i !== -1) {
      if (s[i - 1] !== "#") bad.push(`${path.relative(ROOT, f)}:${s.slice(0, i).split("\n").length}`);
      i = s.indexOf(NEEDLE, i + 1);
    }
  }
  assert.deepEqual(bad, [], `old spelling outside hashtags: ${bad.join(", ")}`);
});
