// Ye₿ente access: log in first, one PIN, stay signed in safely on your own phone,
// and nothing about a wallet's balance leaks to outsiders. Each test fails on the
// code before #185.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-access-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "LND_INVOICE_MACAROON", "YEBENTE_LND_PAY_MACAROON", "RESEND_API_KEY", "SMTP_HOST"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", EMAIL_APPROVAL: "off", YEBENTE_MAX_BALANCE_SATS: "10000", YEBENTE_MAX_PAYMENT_SATS: "5000" });

const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const mailed = [];
email.setMailer({ sendMail: async (m) => { mailed.push({ to: m.to, cc: m.cc, subject: m.subject, text: m.text }); } });

let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `7.7.${Math.floor(++n / 250)}.${n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const json = async (r) => ({ status: r.status, ...(await r.json()) });
// A phone's device key, as the browser makes it (ECDSA P-256, raw r||s signatures).
const phone = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { spki: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    sign: (m) => crypto.sign("sha256", Buffer.from(m), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url") };
};
const unlockWith = async (p, deviceId, walletId, extra = {}) => {
  const o = await json(await call("POST", "wallet/unlock/options", { deviceId }));
  return json(await call("POST", "wallet/unlock", { deviceId, signature: p.sign(yw.unlockMessage(deviceId, o.challenge)), ...extra }));
};

const kitoPhone = phone();
let kito;
test("create on a phone: a device key and a short session, never a long-lived token; Lock ends the session, the phone stays trusted", async () => {
  kito = await json(await call("POST", "wallet/create", { pin: "730184", handle: "kito", device: kitoPhone.spki }));
  assert.equal(kito.status, 200);
  assert.ok(kito.session && kito.deviceId);
  assert.equal(kito.token, undefined, "no long-lived bearer token for apps with a device key");
  assert.equal((await call("GET", "wallet/me", null, kito.session)).status, 200);
  assert.equal((await call("POST", "wallet/lock", {}, kito.session)).status, 200);
  assert.equal((await call("GET", "wallet/me", null, kito.session)).status, 401, "locked");
  // Back in on the same phone with the PIN: no recovery needed.
  const back = await unlockWith(kitoPhone, kito.deviceId, kito.wallet.id, { pin: "730184" });
  assert.equal(back.status, 200);
  kito.session = back.session;
  assert.equal((await call("GET", "wallet/me", null, kito.session)).status, 200);
});

test("unlock needs the device key's signature over a fresh one-time challenge AND the PIN", async () => {
  const opt = await json(await call("POST", "wallet/unlock/options", { deviceId: kito.deviceId }));
  const good = kitoPhone.sign(yw.unlockMessage(kito.deviceId, opt.challenge));
  assert.equal((await call("POST", "wallet/unlock", { deviceId: kito.deviceId, signature: good, pin: "730184" })).status, 200);
  assert.equal((await call("POST", "wallet/unlock", { deviceId: kito.deviceId, signature: good, pin: "730184" })).status, 400, "a challenge works once");
  assert.equal((await unlockWith(phone(), kito.deviceId, kito.wallet.id, { pin: "730184" })).status, 403, "another phone's key is refused");
  assert.equal((await unlockWith(kitoPhone, kito.deviceId, kito.wallet.id, { pin: "111111" })).status, 403, "wrong PIN");
  // A challenge older than 60 seconds is refused.
  const late = await json(await call("POST", "wallet/unlock/options", { deviceId: kito.deviceId }));
  const rec = await store.getJSON(`ywuc:${kito.deviceId}`);
  await store.setJSON(`ywuc:${kito.deviceId}`, { ...rec, exp: Date.now() - 1 });
  assert.equal((await call("POST", "wallet/unlock", { deviceId: kito.deviceId, signature: kitoPhone.sign(yw.unlockMessage(kito.deviceId, late.challenge)), pin: "730184" })).status, 400);
  assert.equal((await call("POST", "wallet/unlock/options", { deviceId: "not-a-device-id" })).status, 404);
});

test("sessions end after 15 minutes idle and when the phone is removed", async () => {
  const s = await unlockWith(kitoPhone, kito.deviceId, kito.wallet.id, { pin: "730184" });
  const key = `yws:${crypto.createHash("sha256").update(s.session).digest("hex")}`;
  await store.setJSON(key, { ...(await store.getJSON(key)), last: Date.now() - 16 * 60e3 });
  assert.equal((await call("GET", "wallet/me", null, s.session)).status, 401, "idle too long");
  // A second phone removes the first: its sessions stop at once.
  const other = phone();
  const second = await json(await call("POST", "wallet/restore", { recovery: kito.recovery, pin: "526184", device: other.spki }));
  assert.equal((await call("GET", "wallet/me", null, kito.session)).status, 401, "a PIN reset signs every other phone out");
  const third = phone();
  const t2 = await json(await call("POST", "wallet/create", { pin: "730184", handle: "kito2", device: third.spki }));
  const fourth = phone();
  // The same wallet on a second phone (added directly, as a login would).
  const w = await store.getJSON(`yw:${t2.wallet.id}`);
  const id4 = "dev4-" + crypto.randomBytes(6).toString("hex");
  w.devices.push({ id: id4, spki: fourth.spki, at: new Date().toISOString(), lastSeen: new Date().toISOString() });
  await store.setJSON(`yw:${w.id}`, w); await store.setJSON(`ywd:${id4}`, w.id);
  const s4 = await unlockWith(fourth, id4, w.id, { pin: "730184" });
  assert.equal(s4.status, 200);
  assert.equal((await call("POST", "wallet/device/remove", { deviceId: id4, pin: "730184" }, t2.session)).status, 200);
  assert.equal((await call("GET", "wallet/me", null, s4.session)).status, 401, "the removed phone's session ends");
  assert.ok(second.session);
});

test("log in on a new phone: the email code is checked before the PIN, and a stranger can never lock the owner out", async () => {
  const p = phone();
  const owner = await json(await call("POST", "wallet/create", { pin: "418263", handle: "nyokabi", email: "nyokabi@example.org", device: p.spki }));
  const confirm = mailed.find((m) => m.subject === "Confirm your Ye₿ente email" && m.to === "nyokabi@example.org");
  assert.equal(confirm.cc, undefined, "wallet mail is not copied to anyone");
  const t = confirm.text.match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  // Someone who knows the public handle guesses PINs without a code: refused before any PIN check.
  for (let i = 0; i < 10; i++) assert.equal((await call("POST", "wallet/login/finish", { email: "nyokabi@example.org", code: "12345678", pin: "000000", device: phone().spki })).status, 400);
  let w = await yw.walletByHandle("nyokabi");
  assert.equal(w.failedPins || 0, 0, "the owner's PIN counter never moved");
  assert.equal(w.lockedUntil, null, "the owner is not locked out");
  // Same answer whether or not the email has a wallet.
  const known = await call("POST", "wallet/login/start", { email: "nyokabi@example.org" }).then((r) => r.json());
  const unknown = await call("POST", "wallet/login/start", { email: "nobody@example.org" }).then((r) => r.json());
  assert.deepEqual(known, unknown);
  const codeOf = () => mailed.filter((m) => m.subject === "Your Ye₿ente login code").at(-1).text.match(/\b(\d{8})\b/)[1];
  let code = codeOf();
  // With the code, three wrong PINs burn it; the owner is still not locked.
  for (let i = 0; i < 3; i++) assert.equal((await call("POST", "wallet/login/finish", { email: "nyokabi@example.org", code, pin: "999999", device: phone().spki })).status, 403);
  assert.equal((await call("POST", "wallet/login/finish", { email: "nyokabi@example.org", code, pin: "418263", device: phone().spki })).status, 400, "the code is gone after 3 wrong PINs");
  w = await yw.walletByHandle("nyokabi");
  assert.equal(w.lockedUntil, null);
  await call("POST", "wallet/login/start", { email: "nyokabi@example.org" });
  code = codeOf();
  const fresh = phone();
  const ok = await json(await call("POST", "wallet/login/finish", { email: "nyokabi@example.org", code, pin: "418263", device: fresh.spki }));
  assert.equal(ok.status, 200);
  assert.equal(ok.wallet.holdUntil, null, "logging in is not a recovery: no PIN reset, no hold");
  assert.equal((await call("GET", "wallet/me", null, owner.session)).status, 200, "the owner's own phone stays signed in");
  assert.ok(mailed.some((m) => m.subject === "Ye₿ente: a new phone logged in" && m.to === "nyokabi@example.org"));
  // No wallet email names the handle or an amount.
  assert.ok(!mailed.some((m) => /nyokabi(@| )|\bsats?\b.*\d/.test(`${m.subject} ${m.text}`.replace(/1,000 sats in total/g, ""))));
  // The owner sees the new phone and the log.
  const sec = await json(await call("GET", "wallet/security", null, ok.session));
  assert.equal(sec.devices.length, 2);
  assert.equal(sec.devices.filter((d) => d.current).length, 1);
  assert.ok(sec.log.some((e) => e.kind === "login"));
});

test("an app from before device keys moves to one with its old token and the PIN; the old token then stops working", async () => {
  const old = await json(await call("POST", "wallet/create", { pin: "529173", handle: "legacy-user" }));
  assert.ok(old.token, "old apps still get a token, so nobody is locked out by the update");
  const p = phone();
  assert.equal((await call("POST", "wallet/device/register", { pin: "000000", device: p.spki }, old.token)).status, 403);
  const moved = await json(await call("POST", "wallet/device/register", { pin: "529173", device: p.spki }, old.token));
  assert.equal(moved.status, 200);
  assert.equal((await call("GET", "wallet/me", null, old.token)).status, 401);
  assert.equal((await call("GET", "wallet/me", null, moved.session)).status, 200);
});

test("the Lightning address tells nobody what a wallet holds", async () => {
  await call("POST", "wallet/create", { pin: "602817", handle: "empty-one", device: phone().spki });
  await call("POST", "wallet/create", { pin: "602817", handle: "full-one", device: phone().spki });
  await yw.credit({ walletId: (await yw.walletByHandle("full-one")).id, sats: 9000, kind: "receive", ref: "fill" });
  const a = await (await api.GET(new Request("https://altradits.test/api/yebente/lnurlp/empty-one"))).json();
  const b = await (await api.GET(new Request("https://altradits.test/api/yebente/lnurlp/full-one"))).json();
  assert.equal(a.maxSendable, b.maxSendable, "the same limits, whatever the balance");
  const over = async (h) => (await (await api.GET(new Request(`https://altradits.test/api/yebente/lnurl/${h}?amount=6000000`))).json()).reason;
  assert.equal(await over("empty-one"), await over("full-one"), "the same refusal text");
  const fullTry = await (await api.GET(new Request("https://altradits.test/api/yebente/lnurl/full-one?amount=1000000"))).json();
  assert.equal(fullTry.reason, "This Lightning address can't receive this payment right now.");
  // A wallet holder probing another wallet by sending to it learns nothing either.
  const prober = await json(await call("POST", "wallet/create", { pin: "602817", handle: "prober", device: phone().spki }));
  await yw.credit({ walletId: prober.wallet.id, sats: 3000, kind: "receive", ref: "fund-prober" });
  const r = await json(await call("POST", "wallet/send", { to: "full-one", sats: 2000, pin: "602817" }, prober.session));
  assert.equal(r.error, "This payment can't be delivered to that wallet right now.");
});
