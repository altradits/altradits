// A failed balance refresh says so instead of silently keeping the stale
// number: the note shows on failure and clears on the next try.
// Run: node --test test/sync-failure.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("a failed refresh shows its note, cleared on retry", () => {
  const card = read("yebente/src/components/BalanceCard.tsx");
  assert.match(card, /catch \{\s*setSyncFailed\(true\);/, "failures raise the note");
  assert.match(card, /setSyncFailed\(false\)/, "a retry clears it");
  assert.match(card, /role="status"/, "the note is announced");
  assert.ok(card.includes("Couldn't refresh. Showing the last balance."), "the words stay plain");
});
