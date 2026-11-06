// Opcode Circuit scoring and store. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
const score = await import("../opcode-circuit/engine/score.js");
const store = await import("../opcode-circuit/engine/store.js");
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
test("stars reward leaner solves", () => {
  const par = { bytes: 100, ops: 10, sats: 1000 };
  assert.equal(score.starsFor({ bytes: 90, ops: 8, sats: 900 }, par), 3);
  assert.equal(score.starsFor({ bytes: 140, ops: 8, sats: 900 }, par), 2);
  assert.equal(score.starsFor({ bytes: 200, ops: 8, sats: 900 }, par), 1);
});
test("unscored dims do not change stars", () => {
  const par = { bytes: 100, ops: 10, sats: 1000 };
  assert.equal(score.starsFor({ bytes: 90, ops: 8, sats: 99999 }, par, ["bytes", "ops"]), 3);
});
test("compareCost ranks stars first, then ratio, then stable order", () => {
  const par = { bytes: 100, ops: 10, sats: 1000 };
  const a = { bytes: 90, ops: 8, sats: 900 }, b = { bytes: 140, ops: 8, sats: 900 };
  assert.ok(score.compareCost(a, b, par) < 0);
  assert.ok(score.compareCost(b, a, par) > 0);
  assert.equal(score.compareCost(a, { ...a }, par) !== 0, true);
});
test("store survives missing and corrupt storage", () => {
  assert.deepEqual(store.loadState(null), store.blankState());
  const bad = mem();
  bad.setItem(store.STORE_KEY, "{oops");
  assert.deepEqual(store.loadState(bad), store.blankState());
  const old = mem();
  old.setItem(store.STORE_KEY, JSON.stringify({ version: 999 }));
  assert.deepEqual(store.loadState(old), store.blankState());
  assert.equal(store.saveState(store.blankState(), null), false);
});
test("recordSolve keeps the best cost", () => {
  let st = store.blankState();
  st = store.recordSolve(st, "p1", { bytes: 100, ops: 5, sats: 0 }, 3);
  st = store.recordSolve(st, "p1", { bytes: 200, ops: 5, sats: 0 }, 1);
  assert.deepEqual(st.best.p1, { bytes: 100, ops: 5, sats: 0 });
  assert.equal(st.stars.p1, 3);
  assert.equal(st.solved.p1, true);
});
test("achievements unlock once", () => {
  let st = store.blankState();
  st = store.unlockAchievement(st, "first");
  st = store.unlockAchievement(st, "first");
  assert.deepEqual(st.achievements, ["first"]);
});
test("achievement rules fire on the right state", async () => {
  const { ACHIEVEMENTS, checkAchievements } = await import("../opcode-circuit/engine/achieve.js");
  const { PUZZLES1 } = await import("../opcode-circuit/content/puzzles1.js");
  const { PUZZLES2 } = await import("../opcode-circuit/content/puzzles2.js");
  const all = [...PUZZLES1, ...PUZZLES2];
  assert.equal(ACHIEVEMENTS.length, 13);
  let st = store.blankState();
  assert.deepEqual(checkAchievements(st, all), []);
  st = store.recordSolve(st, "1-1", { bytes: 1, ops: 0, sats: 0 }, 3);
  assert.deepEqual(checkAchievements(st, all), ["first-solve"]);
  st = store.unlockAchievement(st, "first-solve");
  for (const p of all.filter((x) => x.ch === "bytes")) st = store.recordSolve(st, p.id, { bytes: 1, ops: 0, sats: 0 }, 3);
  assert.ok(checkAchievements(st, all).includes("ch-bytes"));
  st = store.unlockAchievement(st, "ch-bytes");
  st = store.recordSolve(st, "2-2", { bytes: 6, ops: 0, sats: 0 }, 3);
  assert.ok(checkAchievements(st, all).includes("miner"));
});
