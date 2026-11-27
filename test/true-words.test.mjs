// Words follow state: pay-page fatals re-render on language switch, and the
// hold notice reads true when nothing is left to send.
// Run: node --test test/true-words.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("pay fatals remember their key and re-render on switch", () => {
  const js = read("ktown/pay.js");
  assert.match(js, /let fatalKey = null/, "the key is tracked");
  assert.match(js, /fatal\(t\("unknownQr"\), "unknownQr"\)/, "unknown QR keeps its key");
  assert.match(js, /fatal\(t\("tryLater"\), "tryLater"\)/, "try-later keeps its key");
  assert.match(js, /if \(!\$\("fatal"\)\.hidden && fatalKey\) fatal\(t\(fatalKey\), fatalKey\)/, "switching re-renders");
});

test("an empty hold says sending resumes", () => {
  const tsx = read("yebente/src/components/HoldNotice.tsx");
  assert.match(tsx, /hold\.left <= 0/, "empty is handled");
  assert.ok(tsx.includes("sending resumes after"), "the words read true");
});

test("boot fatals keep tryLater so it re-renders on switch", () => {
  const js = read("ktown/pay.js");
  assert.ok(js.includes('(!e.said && (e.status || !e.message)) ? "tryLater" : null'), "server and network errors keep their key");
});

test("the wallet cache is bumped with the rebuilt shell", () => {
  for (const f of ["yebente/public/sw.js", "yebente/app/sw.js"]) {
    const m = read(f).match(/const CACHE = "yebente-v(\d+)";/);
    assert.ok(m, `${f}: a versioned cache constant exists`);
    assert.ok(Number(m[1]) > 1, `${f}: returning users get the new shell`);
  }
});
