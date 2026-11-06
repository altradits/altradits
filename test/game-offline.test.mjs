// Opcode Circuit offline and safety scan. No network after load: the game
// ships no fetch, XHR, sockets, or remote imports. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "opcode-circuit");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const f = path.join(dir, e.name);
  return e.isDirectory() ? walk(f) : [f];
});
const files = walk(root).filter((f) => f.endsWith(".js") && !f.endsWith("sw.js"));
test("game code makes no network calls", () => {
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /(?<![\w.])fetch\s*\(/, f);
    assert.doesNotMatch(src, /XMLHttpRequest/, f);
    assert.doesNotMatch(src, /WebSocket/, f);
    assert.doesNotMatch(src, /EventSource/, f);
    assert.doesNotMatch(src, /import\s*\(\s*["']https?:/, f);
    assert.doesNotMatch(src, /from\s+["']https?:/, f);
  }
});
test("service worker caches the shell and never calls APIs", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /opcode-circuit-v\d/);
  assert.match(sw, /startsWith\("\/api\/"\)\) return/);
  assert.match(sw, /u\.origin !== self\.location\.origin\) return/);
  for (const need of ["index.html", "game.js", "sim/primitives.js", "sim/interpreter.js"]) {
    assert.ok(sw.includes(need), need);
  }
});
test("only the store and the theme toggle touch localStorage, always guarded", () => {
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    if (f.endsWith("store.js")) {
      assert.match(src, /try/, f);
      assert.match(src, /catch/, f);
      continue;
    }
    if (f.endsWith("game.js")) {
      const uses = (src.match(/localStorage/g) || []).length;
      const guards = (src.match(/try \{/g) || []).length;
      assert.ok(uses > 0 && guards >= uses, `${f}: every localStorage use sits in try/catch`);
      assert.doesNotMatch(src, /opcode-circuit-v1/, `${f}: game shell never touches the save key`);
      continue;
    }
    assert.doesNotMatch(src, /localStorage/, f);
  }
});
test("simulation disclaimer is on the page", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Toy chain/);
  assert.match(html, /No real keys/);
  assert.match(html, /never paste a real key/i);
});
test("no mainnet key or seed fixtures in game files", () => {
  for (const f of walk(root)) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /xprv[1-9A-HJ-NP-Za-km-z]{100,}/, f);
    assert.doesNotMatch(src, /abandon abandon abandon/, f);
  }
});
