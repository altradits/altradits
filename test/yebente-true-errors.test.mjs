// Error messages that say what actually happened (21 Nov 2026): the node's
// real reason for a failed payment, and the app's words when the server gave
// none (offline, a timeout, a gateway page) instead of one catch-all line.
// Run: node --test test/yebente-true-errors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { paymentFailureText } = await import("../lib/lightning.js");
const { httpTrouble, serverError, readableError } = await import("../yebente/src/services/errorText.ts");

test("each node failure reason gets its own explanation", () => {
  const cases = {
    FAILURE_REASON_NO_ROUTE: /No path to the recipient/,
    FAILURE_REASON_INSUFFICIENT_BALANCE: /doesn't have enough sending power/,
    FAILURE_REASON_INCORRECT_PAYMENT_DETAILS: /refused this payment: the invoice may have expired/,
    FAILURE_REASON_TIMEOUT: /couldn't complete in time/,
    FAILURE_REASON_ERROR: /refused the payment/,
    "invoice expired. Valid until 2026-11-21 10:00:00": /has expired/,
    "invoice is already paid": /already paid/,
  };
  const seen = new Set();
  for (const [raw, want] of Object.entries(cases)) {
    const t = paymentFailureText(raw);
    assert.match(t, want, raw);
    assert.match(t, /Nothing was taken/, `${raw}: says the money is safe`);
    seen.add(t);
  }
  assert.equal(seen.size, Object.keys(cases).length, "no two causes share one message");
  assert.match(paymentFailureText("some_new_reason"), /\(some new reason|some_new_reason\)/, "an unknown reason is shown, not hidden");
});

test("no answer at all: offline is told apart from an unreachable server", () => {
  assert.match(httpTrouble(0, false, true), /Your phone is offline/);
  assert.match(httpTrouble(0, false, false), /Couldn't reach Ye₿ente/);
  assert.doesNotMatch(httpTrouble(0, false, false), /gone through/, "a read never warns about double payment");
  assert.match(httpTrouble(0, true, false), /may have gone through/, "a payment that got no answer may still have happened");
});

test("each status says what it means", () => {
  assert.match(httpTrouble(401, false), /session ended/);
  assert.match(httpTrouble(429, false), /Too many tries/);
  assert.match(httpTrouble(502, true), /restarting or busy.*may have gone through/);
  assert.match(httpTrouble(504, false), /took too long/);
  assert.match(httpTrouble(500, false), /error 500/);
  assert.match(httpTrouble(404, false), /Refresh the page/);
});

test("the server's own words always win", () => {
  assert.equal(serverError(400, { error: "Wrong PIN. 2 tries left." }, true), "Wrong PIN. 2 tries left.");
  assert.match(serverError(502, {}, true), /restarting or busy/, "a gateway's HTML page (no JSON) is explained by its status");
  assert.match(serverError(200, { success: false }, false), /error 500/, "an OK status with no success is still a fault");
  assert.match(serverError(503, { error: "  " }, false), /restarting or busy/, "a blank message counts as none");
});

test("the browser's raw errors are translated, Ye₿ente's own pass through", () => {
  assert.match(readableError(new TypeError("Failed to fetch"), "x"), /Couldn't reach Ye₿ente|offline/);
  assert.match(readableError(new TypeError("Load failed"), "x"), /Couldn't reach Ye₿ente|offline/, "Safari's wording");
  assert.match(readableError(new SyntaxError("Unexpected token '<', \"<!DOCTYPE\"... is not valid JSON"), "x"), /restarting or busy/);
  const abort = new Error("signal timed out"); abort.name = "TimeoutError";
  assert.match(readableError(abort, "x", true), /took too long.*may have gone through/);
  assert.equal(readableError(new Error("Not enough sats. You have 120."), "x"), "Not enough sats. You have 120.");
  assert.equal(readableError("weird", "Couldn't send."), "Couldn't send.", "a non-error uses the screen's own fallback");
});

test("no developer instructions or catch-all lines are left for people to read", () => {
  const src = ["yebente/src/services/mpesaService.ts", "yebente/src/services/altraditsWallet.ts", "yebente/src/services/lightningService.ts"]
    .map((f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(src, /node server\.js|port 3002|Daraja bridge/, "no developer setup text in messages");
  assert.doesNotMatch(src, /'Wallet service unavailable\.'/, "no single catch-all for every failure");
  assert.doesNotMatch(src, /Network error connecting to/, "no 'network error' when the cause may be something else");
});
