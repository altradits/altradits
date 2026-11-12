// Sending out of Ye₿ente while the node can't be reached (its tunnel drops now
// and then): refused before anything is taken, so the app never shows a payment
// as sent that never reached the node. Payments between Ye₿ente wallets still work.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-nodedown-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "SMTP_HOST", "RESEND_API_KEY", "EMAIL_TRANSPORT", "LND_TLS_CERT"]) delete process.env[k];
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", YEBENTE_MAX_BALANCE_SATS: "10000",
  YEBENTE_MAX_PAYMENT_SATS: "5000", LND_REST_URL: `https://127.0.0.1:${port}`, YEBENTE_LND_PAY_MACAROON: "deadbeef" });

const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
(await import("../lib/email.js")).setMailer({ sendMail: async () => {} });
let n = 0;
const call = (p, body, token) => api.POST(new Request(`https://altradits.test/api/yebente/${p}`, {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `7.8.9.${++n % 250}`, Authorization: `Bearer ${token}` },
  body: JSON.stringify(body) }));
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function invoice(sats) {
  const hash = crypto.randomBytes(32).toString("hex");
  const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hash), ...Array(104).fill(0)];
  return `lnbc${sats * 10}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq";
}

test("node unreachable: a send out is refused, nothing is taken and nothing is left pending", async () => {
  const a = await (await api.POST(new Request("https://altradits.test/api/yebente/wallet/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "604392", handle: "downsend" }) }))).json();
  await yw.credit({ walletId: a.wallet.id, sats: 5000, kind: "receive", ref: "fund-downsend" });
  const r = await call("wallet/send", { to: invoice(500), pin: "604392" }, a.token);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /reconnects\. Nothing was taken/);
  const w = await yw.walletByHandle("downsend");
  assert.equal(w.balance, 5000, "not a sat moved");
  assert.ok(!(await yw.history(w.id)).some((e) => e.kind === "send"), "no pending send in History");
});

test("node unreachable: a transfer to another Ye₿ente wallet still goes through", async () => {
  const a = await (await api.POST(new Request("https://altradits.test/api/yebente/wallet/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "715304", handle: "downfrom" }) }))).json();
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "815306", handle: "downto" }) }));
  await yw.credit({ walletId: a.wallet.id, sats: 2000, kind: "receive", ref: "fund-downfrom" });
  const r = await call("wallet/send", { to: "downto", sats: 300, pin: "715304" }, a.token);
  assert.equal(r.status, 200);
  assert.equal((await yw.walletByHandle("downto")).balance, 300);
});
