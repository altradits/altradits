// Opcode Circuit puzzles 1 to 4: reference passes, wrong fails. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
const { PUZZLES1 } = await import("../opcode-circuit/content/puzzles1.js");
const score = await import("../opcode-circuit/engine/score.js");
test("chapters 1 to 4 hold 4 to 6 puzzles each", () => {
  const by = {};
  for (const p of PUZZLES1) by[p.ch] = (by[p.ch] || 0) + 1;
  assert.deepEqual(Object.keys(by).sort(), ["bytes", "merkle", "script", "work"]);
  for (const [ch, n] of Object.entries(by)) assert.ok(n >= 4 && n <= 6, `${ch}: ${n}`);
  assert.equal(PUZZLES1.length, 21);
});
test("every reference solution passes within par", () => {
  for (const p of PUZZLES1) {
    const r = p.check(p.reference);
    assert.equal(r.ok, true, `${p.id}: ${r.message}`);
    assert.ok(r.bytes <= p.par.bytes, `${p.id}: bytes ${r.bytes} over par ${p.par.bytes}`);
    assert.ok((r.ops || 0) <= (p.par.ops || 0), `${p.id}: ops over par`);
    assert.equal(score.starsFor({ bytes: r.bytes, ops: r.ops, sats: r.sats }, p.par, p.scored), 3, `${p.id}: reference earns 3 stars`);
  }
});
test("every wrong fixture fails", () => {
  for (const p of PUZZLES1) {
    assert.ok(p.wrong.length >= 2, `${p.id}: needs wrong fixtures`);
    for (const w of p.wrong) assert.equal(p.check(w).ok, false, `${p.id}: wrong passed: ${w.slice(0, 40)}`);
  }
});
test("every puzzle carries hints and debrief sources", () => {
  for (const p of PUZZLES1) {
    assert.ok(p.hints.length >= 2, p.id);
    assert.ok(p.debrief.length >= 1, p.id);
    assert.ok(p.idea && p.briefing && p.prompt, p.id);
  }
});
