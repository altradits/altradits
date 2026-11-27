// TouchType focus: Tab moves focus instead of typing, so the shipped game
// never scores it, and the Sound and Reset buttons drop focus after a click
// so a later Space types instead of re-pressing them.
// Run: node --test test/touchtype-focus.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function loadShippedCore() {
  const sandbox = { window: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(read("touchtype/js/game.js"), sandbox, { filename: "touchtype/js/game.js" });
  return sandbox.module.exports;
}
const g = loadShippedCore();
const memStorage = () => {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};

test("Tab is ignored by the shipped core: no hit, no streak change", () => {
  const game = g.createGame({ storage: g.createStorage(memStorage()) });
  g.generateDrill(game, () => 0.99);
  const before = { total: game.totalHits, stage: game.stageTotalHits, streak: game.streak };
  const r = g.handleKey(game, "Tab", 1000);
  assert.equal(r.ignored, true);
  assert.equal(game.totalHits, before.total);
  assert.equal(game.stageTotalHits, before.stage);
  assert.equal(game.streak, before.streak);
});

test("a real wrong key still scores a miss", () => {
  const game = g.createGame({ storage: g.createStorage(memStorage()) });
  g.generateDrill(game, () => 0.99);
  game.currentText = "f";
  game.charIndex = 0;
  const r = g.handleKey(game, "j", 1000);
  assert.equal(r.ignored, false);
  assert.equal(r.correct, false);
  assert.equal(game.totalHits, 1);
});

test("no drill step ever asks for Tab", () => {
  for (const step of g.ADVENTURE_STEPS) {
    assert.ok(!step.keys.includes("Tab"), `step ${step.id} has no Tab`);
    for (const p of step.patterns) assert.ok(!p.includes("\t"), `step ${step.id} patterns have no tab`);
  }
});

test("the ignored list names Tab in the shipped script", () => {
  assert.match(read("touchtype/js/game.js"), /\['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'\]/, "Tab joins the ignored keys");
});

test("both control buttons drop focus after a click", () => {
  const src = read("touchtype/js/game.js");
  const sound = src.match(/soundBtn\.addEventListener\('click', function \(\) \{([\s\S]*?)\}\);/);
  assert.ok(sound && sound[1].includes("soundBtn.blur();"), "sound button blurs");
  const reset = src.match(/getElementById\('btn-reset'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\}\);/);
  assert.ok(reset && reset[1].includes("getElementById('btn-reset').blur();"), "reset button blurs");
});
