// Opcode Circuit puzzles 1 to 8: reference passes, wrong fails. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
const { PUZZLES1 } = await import("../opcode-circuit/content/puzzles1.js");
const { PUZZLES2 } = await import("../opcode-circuit/content/puzzles2.js");
const score = await import("../opcode-circuit/engine/score.js");
const ALL = [...PUZZLES1, ...PUZZLES2];
test("all 8 chapters hold 4 to 6 puzzles each", () => {
  const by = {};
  for (const p of ALL) by[p.ch] = (by[p.ch] || 0) + 1;
  assert.deepEqual(Object.keys(by).sort(), ["bugs", "bytes", "fees", "lightning", "merkle", "script", "segwit", "work"]);
  for (const [ch, n] of Object.entries(by)) assert.ok(n >= 4 && n <= 6, `${ch}: ${n}`);
  assert.equal(ALL.length, 43);
});
test("every reference solution passes within par", () => {
  for (const p of ALL) {
    const r = p.check(p.reference);
    assert.equal(r.ok, true, `${p.id}: ${r.message}`);
    assert.ok(r.bytes <= p.par.bytes, `${p.id}: bytes ${r.bytes} over par ${p.par.bytes}`);
    assert.ok((r.ops || 0) <= (p.par.ops || 0), `${p.id}: ops over par`);
    assert.equal(score.starsFor({ bytes: r.bytes, ops: r.ops, sats: r.sats }, p.par, p.scored), 3, `${p.id}: reference earns 3 stars`);
  }
});
test("every wrong fixture fails", () => {
  for (const p of ALL) {
    assert.ok(p.wrong.length >= 2, `${p.id}: needs wrong fixtures`);
    for (const w of p.wrong) assert.equal(p.check(w).ok, false, `${p.id}: wrong passed: ${w.slice(0, 40)}`);
  }
});
test("every puzzle carries hints and debrief sources", () => {
  for (const p of ALL) {
    assert.ok(p.hints.length >= 2, p.id);
    assert.ok(p.debrief.length >= 1, p.id);
    assert.ok(p.idea && p.briefing && p.prompt, p.id);
  }
});
test("8-1 states the true P2WSH length (68 hex chars, 34 bytes)", () => {
  const p = ALL.find((x) => x.id === "8-1");
  assert.match(p.prompt, /68 hex chars/);
  assert.equal(p.par.bytes, 34);
});
test("typed byte costs match decoded or UTF-8 length", async () => {
  const { answerBytes } = await import("../opcode-circuit/engine/score.js");
  for (const p of ALL.filter((x) => x.input === "text")) {
    const r = p.check(p.reference);
    assert.equal(r.bytes, answerBytes(p.reference), `${p.id}: byte cost must be honest`);
  }
});
