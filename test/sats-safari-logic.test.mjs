// Sats Safari: pure game logic. The browser and these tests share the files;
// hashing goes through an injected function (Web Crypto in the game,
// node:crypto here). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SATS_PER_BTC, MAX_MONEY_SATS, isValidAmount, toBTC, toSats, formatSats, divide, combine } from "../sats-safari/sats.js";

export const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

test("sats: 100,000,000 to a bitcoin, integers only, capped at 21 million", () => {
  assert.equal(SATS_PER_BTC, 100_000_000);
  assert.equal(MAX_MONEY_SATS, 2_100_000_000_000_000);
  assert.ok(isValidAmount(0) && isValidAmount(1) && isValidAmount(MAX_MONEY_SATS));
  assert.ok(!isValidAmount(-1) && !isValidAmount(1.5) && !isValidAmount(MAX_MONEY_SATS + 1) && !isValidAmount("1"));
});

test("sats: bitcoin and sats convert exactly, both ways", () => {
  assert.equal(toBTC(0), "0");
  assert.equal(toBTC(1), "0.00000001");
  assert.equal(toBTC(100_000_000), "1");
  assert.equal(toBTC(123_456_789), "1.23456789");
  assert.equal(toBTC(100), "0.000001");
  assert.equal(toSats("0"), 0);
  assert.equal(toSats("1"), 100_000_000);
  assert.equal(toSats("0.00000001"), 1);
  assert.equal(toSats("1.23456789"), 123_456_789);
  assert.throws(() => toSats("0.000000001"), "nine decimals rejected");
  assert.throws(() => toSats("-1"), "negatives rejected");
  assert.throws(() => toSats("21000001"), "over 21 million rejected");
  assert.throws(() => toSats("a lot"), "words rejected");
  for (const n of [0, 1, 42, 999, 10_000_000, MAX_MONEY_SATS]) assert.equal(toSats(toBTC(n)), n, `round trip ${n}`);
});

test("sats: splitting and combining never create or lose a sat", () => {
  assert.equal(formatSats(1234567), "1,234,567");
  assert.deepEqual(divide(10, 3), [4, 3, 3]);
  assert.deepEqual(divide(7, 7), [1, 1, 1, 1, 1, 1, 1]);
  for (const [a, n] of [[0, 1], [1, 2], [100, 3], [MAX_MONEY_SATS, 7]]) {
    const parts = divide(a, n);
    assert.equal(parts.length, n);
    assert.equal(Math.max(...parts) - Math.min(...parts) <= 1, true);
    assert.equal(combine(parts), a);
  }
  assert.throws(() => divide(10, 0));
  assert.throws(() => combine([]));
  assert.throws(() => combine([MAX_MONEY_SATS, 1]), "combining past the cap rejected");
});

test("chain: fingerprints link blocks, tampering breaks the links", async () => {
  const { headerText, seal, validChain, tamper, longestValid, webHash, GENESIS_PREV } = await import("../sats-safari/chain.js");
  assert.equal(await webHash("sats"), sha256hex("sats"), "game hashing matches node:crypto");
  const b1 = await seal({ n: 1, txs: ["a"], prev: GENESIS_PREV }, webHash);
  const b2 = await seal({ n: 2, txs: ["b"], prev: b1.hash }, webHash);
  assert.deepEqual(await validChain([b1, b2], webHash), { ok: true });
  assert.equal((await validChain([tamper(b1, 0, "evil"), b2], webHash)).ok, false, "a changed letter breaks its fingerprint");
  const relinked = await seal({ ...tamper(b1, 0, "evil"), prev: GENESIS_PREV }, webHash);
  assert.equal((await validChain([relinked, b2], webHash)).ok, false, "resealing breaks the next link instead");
  assert.equal((await validChain([b2, b1], webHash)).ok, false, "blocks out of order fail");
  assert.deepEqual(await validChain([], webHash), { ok: false, at: 0, why: "empty" });
  assert.equal(headerText(b1).split("|").length, 3, "number, transactions, previous fingerprint");
  assert.equal(longestValid([{ blocks: 3, valid: true }, { blocks: 4, valid: false }, { blocks: 2, valid: true }]), 0, "longest VALID wins");
  assert.equal(longestValid([{ blocks: 2, valid: false }]), -1, "no valid chain: no winner");
});

test("mining: guessing finds leading zeros, and pace moves difficulty", async () => {
  const { mine, retarget, meetsDifficulty } = await import("../sats-safari/mining.js");
  const { webHash } = await import("../sats-safari/chain.js");
  assert.ok(meetsDifficulty("00ab", 2) && !meetsDifficulty("00ab", 3) && meetsDifficulty("ff", 0));
  const r = await mine("test-block", 1, webHash, null);
  assert.ok(meetsDifficulty(r.hash, 1), "the winning hash starts with a zero");
  assert.equal(r.guesses, r.nonce + 1, "guesses count from zero");
  const seen = [];
  await mine("test-block", 1, webHash, (n, h) => seen.push([n, h]));
  assert.ok(seen.length > 0 && seen.at(-1)[1] === r.hash, "every guess is reported, the winner last");
  await assert.rejects(() => mine("x", 2, webHash, null, () => true), /stopped/, "leaving the level stops the drill");
  assert.equal(retarget(2, 120, 600), 3, "too fast: harder");
  assert.equal(retarget(3, 1800, 600), 2, "too slow: easier");
  assert.equal(retarget(1, 1800, 600), 1, "never below one zero");
  assert.equal(retarget(2, 500, 600), 2, "on pace: unchanged");
  assert.throws(() => retarget(2, 0, 600), /time moves forward/);
});

test("supply: halvings sum to just under 21 million", async () => {
  const { subsidyAt, totalAt, maxSupply, INITIAL_SUBSIDY_SATS, HALVING_BLOCKS } = await import("../sats-safari/supply.js");
  assert.equal(INITIAL_SUBSIDY_SATS, 5_000_000_000);
  assert.equal(HALVING_BLOCKS, 210_000);
  assert.equal(subsidyAt(0), 5_000_000_000);
  assert.equal(subsidyAt(210_000 - 1), 5_000_000_000);
  assert.equal(subsidyAt(210_000), 2_500_000_000);
  assert.equal(subsidyAt(840_000), 312_500_000, "the fourth era pays 3.125 BTC");
  assert.equal(totalAt(0), 0);
  assert.equal(totalAt(1), 5_000_000_000);
  assert.equal(totalAt(210_000), 210_000 * 5_000_000_000);
  assert.equal(maxSupply(), 2_099_999_997_690_000, "20,999,999.9769 BTC: just under 21 million");
  assert.throws(() => subsidyAt(-1));
  assert.throws(() => totalAt(-1));
});
