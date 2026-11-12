// Ye₿ente when the node is set up but can't be reached (its tunnel drops now and
// then): the wallet keeps Receive, Send and Send Mobile on screen, greyed out,
// instead of showing an empty wallet with no buttons.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-paused-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_TLS_CERT", "YEBENTE_LND_PAY_MACAROON",
  "YEBENTE_MPESA_BUY", "YEBENTE_BITIKA_BUY", "BITIKA_API_KEY", "PESAPAL_CONSUMER_KEY", "PESAPAL_CONSUMER_SECRET"]) delete process.env[k];
// A port nothing listens on: the node is set up, but silent.
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
Object.assign(process.env, { YEBENTE_WALLETS: "on", LND_REST_URL: `https://127.0.0.1:${port}`, LND_INVOICE_MACAROON: "cd".repeat(32) });

const yb = await import("../api/yebente.js");
const { pausedActions, visibleActions } = await import("../yebente/src/services/features.ts");

test("node set up but unreachable: nothing works, Receive and Send are paused, not gone", async () => {
  const h = await (await yb.GET(new Request("http://x/api/yebente/health"))).json();
  assert.equal(h.node, false);
  assert.equal(h.features.receive, false, "the endpoints stay off");
  assert.equal(h.features.send, false);
  assert.equal(h.paused.receive, true);
  assert.equal(h.paused.send, true);
  assert.deepEqual(Object.keys(h.paused).sort(), ["receive", "send", "sendMobile"], "only booleans for the three node actions");
  for (const v of Object.values(h.paused)) assert.equal(typeof v, "boolean");
});

test("pausedActions: greyed-out tiles in display order, never one that already works", () => {
  assert.deepEqual(pausedActions({ paused: ["send", "receive"] }), ["receive", "send"]);
  assert.deepEqual(pausedActions({ receive: true, paused: ["receive", "send"] }), ["send"], "working beats paused");
  assert.deepEqual(visibleActions({ paused: ["receive"] }), [], "paused is never clickable");
  assert.deepEqual(pausedActions(null), []);
  assert.deepEqual(pausedActions({ paused: "receive" }), [], "misshapen: nothing");
  assert.deepEqual(pausedActions({ paused: ["buy", "nope"] }), ["buy"], "unknown names ignored");
});
