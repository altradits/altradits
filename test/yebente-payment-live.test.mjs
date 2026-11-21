// Nobody is left guessing about a payment out (21 Nov 2026): the send screen
// asks until it settles, and the app tells the person if they closed it.
// Run: node --test test/yebente-payment-live.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the node gets 30 seconds, and the earliest direct check is safely after the send request ends", async () => {
  const ln = read("lib/lightning.js"), yw = read("lib/ywallet.js");
  assert.match(ln, /timeout_seconds: 30,/);
  assert.match(ln, /export const PAY_TIMEOUT_MS = 40000;/);
  assert.match(yw, /let SETTLE_AFTER = 60e3;/);
  const { PAY_TIMEOUT_MS } = await import("../lib/lightning.js");
  assert.ok(60e3 > PAY_TIMEOUT_MS + 15000, "a direct check never starts while a send request (plus its recheck) can still be running");
});

test("the send screen settles itself, and a closed screen still gets told once", () => {
  const modal = read("yebente/src/components/SendBtcModal.tsx"), app = read("yebente/src/App.tsx");
  assert.match(modal, /paymentResult\(txReference\)/, "the screen asks while it waits");
  assert.match(modal, /sats are back in your wallet/, "a failure says the sats came back");
  assert.match(app, /paymentResult\(w\.hash\)/, "the app asks for payments still on their way");
  assert.match(app, /if \(stop \|\| !r \|\| r\.status === 'pending' \|\| wasTold\(w\.hash\)\) continue;\s*markTold\(w\.hash\);/, "each result is told once");
  assert.match(read("api/yebente.js"), /payment\\\/\[0-9a-f\]\{64\}/, "the route takes a payment hash only");
});
