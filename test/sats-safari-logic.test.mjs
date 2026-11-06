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
