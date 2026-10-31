// Send Mobile's payout options come from one list (lib/rails.js): the app shows
// only the switched-on ones, and a switched-off partner is never paid, whichever
// way someone tries.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-rails-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "LND_INVOICE_MACAROON", "YEBENTE_LND_PAY_MACAROON", "RESEND_API_KEY", "SMTP_HOST", "YEBENTE_TELEBIRR", "YEBENTE_TELEBIRR_HOST"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", EMAIL_APPROVAL: "off" });

const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
const email = await import("../lib/email.js");
email.setMailer({ sendMail: async () => {} });

const rails = async () => (await (await api.GET(new Request("https://altradits.test/api/yebente/rails"))).json()).rails;
const device = () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" }).toString("base64url");

test("the app gets M-Pesa only, until Telebirr has a partner host AND is switched on", async () => {
  assert.deepEqual((await rails()).map((r) => r.id), ["mpesa"]);
  const mpesa = (await rails())[0];
  assert.equal(mpesa.host, "bitcoin.co.ke");
  assert.equal(mpesa.on, undefined, "the switch itself is never sent");

  process.env.YEBENTE_TELEBIRR = "on";
  assert.deepEqual((await rails()).map((r) => r.id), ["mpesa"], "switched on without a host: still hidden");
  process.env.YEBENTE_TELEBIRR_HOST = "pay.example.et";
  const both = await rails();
  assert.deepEqual(both.map((r) => r.id), ["mpesa", "telebirr"], "a setting, no code: the button appears");
  assert.equal(both[1].currency, "ETB");
  assert.equal(both[1].dial, "251");
  delete process.env.YEBENTE_TELEBIRR;
});

test("a switched-off partner is never paid, even by typing number@host into Send Sats", async () => {
  process.env.YEBENTE_TELEBIRR_HOST = "pay.example.et";
  const w = await (await api.POST(new Request("https://altradits.test/api/yebente/wallet/create", {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ pin: "715293", handle: "rails-payer", device: device() }),
  }))).json();
  await yw.credit({ walletId: w.wallet.id, sats: 5000, kind: "receive", ref: "fund-rails" });
  let asked = 0;
  yw.setLnurlFetcher(async () => { asked++; throw new Error("must not be called"); });
  const r = await api.POST(new Request("https://altradits.test/api/yebente/wallet/send", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${w.session}` },
    body: JSON.stringify({ to: "251912345678@pay.example.et", sats: 1000, pin: "715293" }),
  }));
  const body = await r.json();
  assert.equal(r.status, 403, body.error);
  assert.match(body.error, /aren't switched on yet/);
  assert.equal(asked, 0, "the partner was never even asked for an invoice");
  assert.equal((await yw.walletByHandle("rails-payer")).balance, 5000, "nothing left the wallet");
  delete process.env.YEBENTE_TELEBIRR_HOST;
});
