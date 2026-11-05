// Ye₿ente one-tap freeze (#190): every security email carries a single-use
// link that freezes sending until the owner logs in again. Receiving works
// throughout. Each test fails on the code before #190.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-freeze-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "LND_INVOICE_MACAROON", "YEBENTE_LND_PAY_MACAROON", "RESEND_API_KEY", "SMTP_HOST"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", EMAIL_APPROVAL: "off", YEBENTE_MAX_BALANCE_SATS: "10000", YEBENTE_MAX_PAYMENT_SATS: "5000" });

const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const attacks = await import("../lib/attacks.js");
const mailed = [];
email.setMailer({ sendMail: async (m) => { mailed.push({ to: m.to, cc: m.cc, subject: m.subject, text: m.text }); } });
const waitMail = async (pred, n = 1) => {
  for (let i = 0; i < 200 && mailed.filter(pred).length < n; i++) await new Promise((r) => setTimeout(r, 20));
  return mailed.filter(pred);
};

let n = 0;
const ip = () => `8.8.${Math.floor(++n / 250)}.${n % 250}`;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip(), ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const freezeTap = (t, at = ip()) => api.POST(new Request("https://altradits.test/api/yebente/wallet/freeze", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": at }, body: `t=${encodeURIComponent(t)}`,
}));
const phone = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { spki: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    sign: (m) => crypto.sign("sha256", Buffer.from(m), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url") };
};
const unlockWith = async (p, deviceId, extra = {}) => {
  const o = await json(await call("POST", "wallet/unlock/options", { deviceId }));
  return json(await call("POST", "wallet/unlock", { deviceId, signature: p.sign(yw.unlockMessage(deviceId, o.challenge)), ...extra }));
};
const freezeTokenOf = (m) => m.text.match(/wallet\/freeze\?t=([\w-]{20,})/)?.[1];
const seenTokens = [];
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const aminaPhone = phone();
let amina, juma;
test("every security email carries a one-tap freeze link; the email log keeps no token", async () => {
  amina = await json(await call("POST", "wallet/create", { pin: "604391", handle: "amina", email: "amina@example.org", device: aminaPhone.spki }));
  assert.equal(amina.status, 200);
  const confirm = mailed.find((m) => m.subject === "Confirm your Ye₿ente email");
  assert.ok(confirm, "confirm mail sent");
  assert.equal(freezeTokenOf(confirm), undefined, "the confirm mail is not a security email: no freeze link");
  const t = confirm.text.match(/[?&]t=([\w-]+)/)[1];
  const cf = await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }, body: `t=${t}` }));
  assert.equal(cf.status, 200);
  juma = await json(await call("POST", "wallet/create", { pin: "284731", handle: "juma", device: phone().spki }));
  // Five wrong PINs lock spending and warn the owner.
  for (let i = 0; i < 5; i++) await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "958302" }, amina.session);
  const locked = await waitMail((m) => m.subject === "Ye₿ente: wallet locked after wrong PINs");
  assert.equal(locked.length, 1);
  const token = freezeTokenOf(locked[0]);
  assert.ok(token && token.length >= 43, "a 256-bit token in the link");
  seenTokens.push(token);
  // The stored email log keeps the words but never the link.
  const records = await Promise.all((await store.keysWithPrefix("email:")).map((k) => store.getJSON(k)));
  assert.ok(records.some((r) => r.subject === "Ye₿ente: wallet locked after wrong PINs" && /t=\(redacted\)/.test(r.text)));
  assert.ok(!records.some((r) => r.text.includes(token)), "no raw freeze token in the email log");
  // Tokens are stored hashed only.
  assert.doesNotMatch(fs.readFileSync(path.join(".data", "db.json"), "utf8"), new RegExp(token));
  // The lock was only for the mail: lift it for the later tests.
  await yw._internal.withLedger(async () => { const cur = await yw.walletByHandle("amina"); Object.assign(cur, { lockedUntil: null, lockCount: 0, lockedAt: null }); await store.setJSON(`yw:${cur.id}`, cur); });
});

test("the link opens a button page without login or JS, and names nothing about the account", async () => {
  const token = seenTokens[0];
  for (const t of [token, "bogus-token-that-matches-nothing"]) {
    const r = await api.GET(new Request(`https://altradits.test/api/yebente/wallet/freeze?t=${t}`));
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /<form method="post" action="\/api\/yebente\/wallet\/freeze">/);
    assert.doesNotMatch(html, /<script/i, "works without JS");
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.match(r.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
    assert.ok(!/amina/.test(html), "no handle or email on the page");
  }
  // Opening the link freezes nothing: mail scanners open every link.
  assert.equal((await yw.walletByHandle("amina")).frozen, undefined);
});

test("one tap freezes sending, signs every phone out, and keeps receiving", async () => {
  await yw.credit({ walletId: amina.wallet.id, sats: 3000, kind: "receive", ref: "fz-1" });
  await yw.credit({ walletId: juma.wallet.id, sats: 3000, kind: "receive", ref: "fz-2" });
  const r = await freezeTap(seenTokens[0]);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Sending is frozen/);
  const w = await yw.walletByHandle("amina");
  assert.ok(w.frozen?.at, "frozen");
  assert.equal((await call("GET", "wallet/me", null, amina.session)).status, 401, "the session ended");
  // Sending is refused; receiving still works.
  assert.equal(yw._internal.publicWallet(w).frozen, true);
  await assert.rejects(yw._internal.spendable(w, 10), /Sending is frozen/);
  const dup = await yw.credit({ walletId: w.id, sats: 100, kind: "receive", ref: "fz-3" });
  assert.equal(dup.wallet.balance, 3100, "credits still land");
  // The wrong account is untouched.
  assert.equal((await yw.walletByHandle("juma")).frozen, undefined);
  assert.equal((await call("POST", "wallet/send", { to: "amina", sats: 10, pin: "284731" }, juma.session)).status, 200);
  // The owner is told, in their own log and by email, and the admin log records it without secrets.
  assert.ok(w.log.some((e) => e.kind === "frozen"), "the owner log records the freeze");
  const done = await waitMail((m) => m.subject === "Ye₿ente: sending is frozen");
  assert.equal(done.length, 1);
  assert.ok(!/amina(@| )/.test(`${done[0].subject} ${done[0].text}`), "the confirmation names no handle");
  let view = await attacks.securityView(50);
  for (let i = 0; i < 50 && !view.events.some((e) => e.kind === "wallet_frozen"); i++) { await new Promise((r) => setTimeout(r, 20)); view = await attacks.securityView(50); }
  const ev = view.events.find((e) => e.kind === "wallet_frozen");
  assert.ok(ev, "admin log records the freeze");
  assert.ok(!`${ev.where} ${ev.detail}`.includes(seenTokens[0]), "no token in the admin log");
  assert.ok(!mailed.some((m) => m.to === "altradits@gmail.com" && /frozen/i.test(m.subject)), "no page to the owner inbox for a freeze");
});

test("a used link replays the same answer and can never unfreeze; bad links are refused", async () => {
  const again = await freezeTap(seenTokens[0]);
  assert.equal(again.status, 200, "idempotent replay");
  assert.match(await again.text(), /Sending is frozen/);
  assert.equal((await waitMail((m) => m.subject === "Ye₿ente: sending is frozen")).length, 1, "no second confirmation");
  // Bogus, truncated and empty tokens.
  assert.equal((await freezeTap(crypto.randomBytes(32).toString("base64url"))).status, 410);
  assert.equal((await freezeTap(seenTokens[0].slice(0, 10))).status, 410);
  assert.equal((await freezeTap("")).status, 410);
  for (const bad of [crypto.randomBytes(32).toString("base64url"), ""]) {
    const html = await (await freezeTap(bad)).text();
    assert.ok(!/amina/.test(html), "refusals leak nothing");
  }
  // An expired link: a fresh token, aged past its 7 days.
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  const link = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet")).at(-1);
  const fresh = freezeTokenOf(link);
  assert.ok(fresh, "recovery mails carry a freeze link too");
  seenTokens.push(fresh);
  const key = `ywft:${sha(fresh)}`;
  await store.setJSON(key, { ...(await store.getJSON(key)), expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await freezeTap(fresh)).status, 410, "expired");
});

test("two taps at once freeze once", async () => {
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  const link = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet", 2)).at(-1);
  const fresh = freezeTokenOf(link);
  const [a, b] = await Promise.all([freezeTap(fresh), freezeTap(fresh)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal((await waitMail((m) => m.subject === "Ye₿ente: sending is frozen")).length, 1, "one confirmation for the race");
});

test("logging in again on a phone trusted before the freeze lifts it; a used link still cannot unfreeze", async () => {
  const back = await unlockWith(aminaPhone, amina.deviceId, { pin: "604391" });
  assert.equal(back.status, 200);
  assert.equal(back.wallet.frozen, false);
  assert.equal((await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "604391" }, back.session)).status, 200, "sending works again");
  amina.session = back.session;
  const w = await yw.walletByHandle("amina");
  assert.ok(w.log.some((e) => e.kind === "frozen") && w.log.some((e) => e.kind === "unfrozen"), "the owner log tells the story");
  assert.equal((await freezeTap(seenTokens[0])).status, 200, "replay still answers the same");
  assert.equal((await yw.walletByHandle("amina")).frozen, null, "but unfreezing by link is impossible");
});

test("a login on a new phone does not lift the freeze; an email recovery does", async () => {
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  const link = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet", 3)).at(-1);
  assert.equal((await freezeTap(freezeTokenOf(link))).status, 200, "frozen again");
  assert.equal((await call("GET", "wallet/me", null, amina.session)).status, 401);
  // A new phone: email code plus PIN. The session opens, the freeze stays.
  await call("POST", "wallet/login/start", { email: "amina@example.org" });
  const code = (await waitMail((m) => m.subject === "Your Ye₿ente login code")).at(-1).text.match(/\b(\d{8})\b/)[1];
  const fresh = phone();
  const logged = await json(await call("POST", "wallet/login/finish", { email: "amina@example.org", code, pin: "604391", device: fresh.spki }));
  assert.equal(logged.status, 200);
  assert.equal(logged.wallet.frozen, true, "a new phone never lifts the freeze");
  const refused = await json(await call("POST", "wallet/send", { to: "juma", sats: 10, pin: "604391" }, logged.session));
  assert.equal(refused.status, 423);
  assert.match(refused.error, /Sending is frozen/);
  // A full recovery lifts it, with the usual 24-hour hold.
  const rec = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet")).at(-1).text.match(/#recover=([\w-]+)/)[1];
  const done = await json(await call("POST", "wallet/recover-email/finish", { token: rec, pin: "735291", device: phone().spki }));
  assert.equal(done.status, 200);
  assert.equal(done.wallet.frozen, false, "recovery is full re-authentication");
  assert.ok(done.wallet.holdUntil, "and the 24-hour hold still applies");
});

test("guessing freeze links is rate limited", async () => {
  const at = "9.9.9.9";
  for (let i = 0; i < 30; i++) assert.equal((await freezeTap(crypto.randomBytes(32).toString("base64url"), at)).status, 410);
  assert.equal((await freezeTap(crypto.randomBytes(32).toString("base64url"), at)).status, 429);
});
