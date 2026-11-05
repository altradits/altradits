// Ye₿ente recovery in progress (#189): a requested email recovery shows on
// the owner's other trusted phones, with a Cancel button that kills the link
// at once. Only authenticated sessions can see it or cancel it.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-reccancel-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "LND_REST_URL", "LND_INVOICE_MACAROON", "YEBENTE_LND_PAY_MACAROON", "RESEND_API_KEY", "SMTP_HOST"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", EMAIL_APPROVAL: "off", YEBENTE_MAX_BALANCE_SATS: "10000", YEBENTE_MAX_PAYMENT_SATS: "5000" });

const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const attacks = await import("../lib/attacks.js");
const mailed = [];
email.setMailer({ sendMail: async (m) => { mailed.push({ to: m.to, subject: m.subject, text: m.text }); } });
const waitMail = async (pred, n = 1) => {
  for (let i = 0; i < 200 && mailed.filter(pred).length < n; i++) await new Promise((r) => setTimeout(r, 20));
  return mailed.filter(pred);
};

let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `8.9.${Math.floor(++n / 250)}.${n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const phone = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { spki: publicKey.export({ type: "spki", format: "der" }).toString("base64url") };
};
const recoverTokenOf = (m) => m.text.match(/#recover=([\w-]+)/)?.[1];

async function confirmed(handle, pin, mail) {
  const p = phone();
  const r = await json(await call("POST", "wallet/create", { pin, handle, email: mail, device: p.spki }));
  assert.equal(r.status, 200);
  const confirm = mailed.find((m) => m.subject === "Confirm your Ye₿ente email" && m.to === mail);
  const t = confirm.text.match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": `8.9.9.${++n % 250}` }, body: `t=${t}` }));
  return r;
}

let amina;
test("a requested recovery shows on the owner's trusted phones; strangers see nothing", async () => {
  amina = await confirmed("amina", "604391", "amina@example.org");
  assert.equal((await json(await call("GET", "wallet/security", null, amina.session))).pendingRecovery, null);
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  const link = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "amina@example.org")).at(-1);
  assert.ok(recoverTokenOf(link), "the link went out");
  const sec = await json(await call("GET", "wallet/security", null, amina.session));
  assert.ok(sec.pendingRecovery?.requestedAt && sec.pendingRecovery?.expiresAt, "the trusted phone sees it");
  assert.equal((await json(await call("GET", "wallet/me", null, amina.session))).wallet.pendingRecovery?.expiresAt, sec.pendingRecovery.expiresAt);
  assert.equal((await call("GET", "wallet/security")).status, 401, "no session, no look");
  assert.equal((await call("GET", "wallet/security", null, "x".repeat(32))).status, 401);
  assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "604391" })).status, 401);
  assert.ok((await yw.walletByHandle("amina")).log.some((e) => e.kind === "recovery_sent"), "the owner log notes the request");
});

test("cancel kills the link at once, and the admin log records it without secrets", async () => {
  const link = mailed.filter((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "amina@example.org").at(-1);
  const token = recoverTokenOf(link);
  const r = await json(await call("POST", "wallet/recovery/cancel", { pin: "604391" }, amina.session));
  assert.equal(r.status, 200);
  assert.equal(r.cancelled, true);
  assert.equal((await json(await call("GET", "wallet/security", null, amina.session))).pendingRecovery, null);
  assert.equal((await call("POST", "wallet/recover-email/finish", { token, pin: "735291", device: phone().spki })).status, 410, "the link died");
  assert.ok((await yw.walletByHandle("amina")).log.some((e) => e.kind === "recovery_cancelled"));
  let view = await attacks.securityView(50);
  for (let i = 0; i < 50 && !view.events.some((e) => e.kind === "recovery_cancelled"); i++) { await new Promise((r) => setTimeout(r, 20)); view = await attacks.securityView(50); }
  const ev = view.events.find((e) => e.kind === "recovery_cancelled");
  assert.ok(ev, "admin log records the cancel");
  assert.ok(!`${ev.where} ${ev.detail}`.includes(token), "no token in the admin log");
  assert.ok(!mailed.some((m) => /recovery was cancelled/i.test(m.subject)), "no mail needed: the owner cancelled it themselves");
});

test("cancel needs the PIN and a pending recovery", async () => {
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "amina@example.org", 2);
  assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "000000" }, amina.session)).status, 403, "wrong PIN");
  assert.ok((await json(await call("GET", "wallet/security", null, amina.session))).pendingRecovery, "still pending after the wrong PIN");
  assert.equal((await json(await call("POST", "wallet/recovery/cancel", { pin: "604391" }, amina.session))).cancelled, true);
  assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "604391" }, amina.session)).status, 404, "nothing left to cancel");
});

test("one cancel kills every live link; an expired recovery is hidden", async () => {
  const juma = await confirmed("juma", "284731", "juma@example.org");
  await call("POST", "wallet/recover-email", { email: "juma@example.org" });
  await call("POST", "wallet/recover-email", { email: "juma@example.org" });
  const links = await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "juma@example.org", 2);
  assert.ok((await json(await call("GET", "wallet/security", null, juma.session))).pendingRecovery, "pending while links are live");
  assert.equal((await json(await call("POST", "wallet/recovery/cancel", { pin: "284731" }, juma.session))).cancelled, true);
  for (const m of links) assert.equal((await call("POST", "wallet/recover-email/finish", { token: recoverTokenOf(m), pin: "735291", device: phone().spki })).status, 410, "both links died");
  // A third link, aged past expiry: the phones go quiet on their own.
  await call("POST", "wallet/recover-email", { email: "juma@example.org" });
  const third = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "juma@example.org", 3)).at(-1);
  const past = new Date(Date.now() - 1000).toISOString();
  await yw._internal.withLedger(async () => {
    const cur = await yw.walletByHandle("juma");
    cur.pendingRecovery = { ...cur.pendingRecovery, expiresAt: past };
    await store.setJSON(`yw:${cur.id}`, cur);
    const list = (await store.getJSON(`ywrp:${cur.id}`)) || [];
    await store.setJSON(`ywrp:${cur.id}`, list.map((p) => ({ ...p, expiresAt: past })));
    for (const p of list) { const k = `ywrt:${p.h}`; const rec = await store.getJSON(k); if (rec) await store.setJSON(k, { ...rec, expiresAt: past }); }
  });
  assert.equal((await json(await call("GET", "wallet/security", null, juma.session))).pendingRecovery, null, "expired recoveries stay hidden");
  assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "284731" }, juma.session)).status, 404, "nothing live to cancel");
  assert.equal((await call("POST", "wallet/recover-email/finish", { token: recoverTokenOf(third), pin: "735291", device: phone().spki })).status, 410);
});

test("using one of two live links leaves the other pending", async () => {
  const bob = await confirmed("bob", "518274", "bob@example.org");
  await call("POST", "wallet/recover-email", { email: "bob@example.org" });
  await call("POST", "wallet/recover-email", { email: "bob@example.org" });
  const links = await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "bob@example.org", 2);
  const done = await json(await call("POST", "wallet/recover-email/finish", { token: recoverTokenOf(links[0]), pin: "619427", device: phone().spki }));
  assert.equal(done.status, 200);
  assert.ok(done.wallet.pendingRecovery, "the second link is still live, so the phones still show it");
  const done2 = await json(await call("POST", "wallet/recover-email/finish", { token: recoverTokenOf(links[1]), pin: "730184", device: phone().spki }));
  assert.equal(done2.status, 200);
  assert.equal(done2.wallet.pendingRecovery, null);
});

test("a cancel and a use racing each other cannot both succeed", async () => {
  const zola = await confirmed("zola", "390517", "zola@example.org");
  await call("POST", "wallet/recover-email", { email: "zola@example.org" });
  const link = (await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "zola@example.org")).at(-1);
  const token = recoverTokenOf(link);
  const [c, f] = await Promise.all([
    call("POST", "wallet/recovery/cancel", { pin: "390517" }, zola.session),
    call("POST", "wallet/recover-email/finish", { token, pin: "526184", device: phone().spki }),
  ]);
  assert.equal((c.status === 200) !== (f.status === 200), true, `exactly one wins (cancel ${c.status}, finish ${f.status})`);
  assert.equal((await call("POST", "wallet/recover-email/finish", { token, pin: "526184", device: phone().spki })).status, 410, "the link is dead either way");
});

test("guessing at cancel is rate limited", async () => {
  const kito = await json(await call("POST", "wallet/create", { pin: "730184", handle: "kito", device: phone().spki }));
  for (let i = 0; i < 20; i++) assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "730184" }, kito.session)).status, 404);
  assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "730184" }, kito.session)).status, 429);
});
