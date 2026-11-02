import test from "node:test";
import assert from "node:assert/strict";
import { summarizeUtxos } from "../lib/lightning.js";

test("empty wallet: no coins, zero sats", () => {
  assert.deepEqual(summarizeUtxos([]), { count: 0, sats: 0, coins: [] });
  assert.deepEqual(summarizeUtxos(null), { count: 0, sats: 0, coins: [] });
});

test("maps each coin to address, sats, confirmations, outpoint", () => {
  const out = summarizeUtxos([
    { address: "bc1qaaa", amount_sat: "50000", confirmations: "12", outpoint: "abc:0" },
    { address: "bc1qbbb", amount_sat: 25000, confirmations: 0, outpoint: "def:1" },
  ]);
  assert.equal(out.count, 2);
  assert.equal(out.sats, 75000);
  assert.deepEqual(out.coins[0], { address: "bc1qaaa", sats: 50000, confs: 12, outpoint: "abc:0" });
  assert.deepEqual(out.coins[1], { address: "bc1qbbb", sats: 25000, confs: 0, outpoint: "def:1" });
});

test("skips coins with missing address or amount", () => {
  const out = summarizeUtxos([{ address: "", amount_sat: "10" }, { amount_sat: "5" }]);
  assert.deepEqual(out, { count: 0, sats: 0, coins: [] });
});
