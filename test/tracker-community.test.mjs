// Community projects on the tracker: the BitDevs Kisumu site tracked with a
// challenge; Bitcoin Kisumu and Pacho Exchange in past work; copy counts seven.
// Run: node --test test/tracker-community.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { TRACK, DONE } = await import("../data/tracker.js");
const html = fs.readFileSync(path.join(root, "tracker.html"), "utf8");

test("seven tracked projects; the Kisumu site carries guide, start, challenge", () => {
  assert.equal(TRACK.length, 7);
  const ksm = TRACK.find((t) => t.repo === "bitdevsksm/bitdevsksm.org");
  assert.ok(ksm, "site tracked");
  assert.equal(ksm.guide, "https://github.com/bitdevsksm/bitdevsksm.org/blob/main/README.md");
  assert.equal(ksm.start, "https://github.com/bitdevsksm/bitdevsksm.org/issues");
  assert.ok(ksm.challenge.length > 20, "plain-words challenge");
});

test("past work names Kisumu and Pacho; every named logo ships", () => {
  for (const repo of ["bitcoinkisumu/bitcoin-kisumu", "bitdevsksm/pacho-exchange", "minmoto/payment-channels"]) {
    assert.ok(DONE.some((d) => d.repo === repo), `${repo} in past work`);
  }
  for (const e of [...TRACK, ...DONE]) {
    if (e.logo) assert.ok(fs.existsSync(path.join(root, "assets/players", `${e.logo}.png`)), `${e.repo} logo ships`);
  }
});

test("copy counts seven projects, never six", () => {
  assert.ok(!html.includes("six projects"), "no stale six count");
  assert.ok(html.includes("seven Bitcoin and Lightning projects"), "meta counts seven");
});
