// Ye₿ente recovery and login email must never fail silently (#387 bug 1): every
// failed or skipped mail to an existing wallet shows in the admin email log
// with its status and raises one Stan alert. Replies stay identical whether
// the email belongs to a wallet or not.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-recmail-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "SMTP_HOST", "RESEND_API_KEY", "EMAIL_TRANSPORT"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test", ADMIN_TOKEN: "test-admin-token-long-and-random-32bytes" });

const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const yw = await import("../lib/ywallet.js");
const deadman = await import("../lib/deadman.js");
const api = await import("../api/yebente.js");
let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `7.7.7.${++n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const mailed = [];
email.setMailer({ sendMail: async (m) => { mailed.push(m); } });
const mails = async () => store.getMany("email", await store.listIds("emails", 100));
const alerts = async (kind) => (await store.getMany("secw:e", await store.listIds("secw:events", 100))).filter((e) => !kind || e.kind === kind);
// Recovery and login mail leave without holding up the reply: wait for them.
const waitFor = async (fn, ms = 3000) => {
  const t = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await new Promise((r) => setTimeout(r, 25)); }
};
// A wallet with a confirmed email, through the real confirm link.
async function confirmedWallet(handle, pin, addr) {
  const r = await (await call("POST", "wallet/create", { pin, handle, email: addr })).json();
  assert.equal(r.success, true);
  const m = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Confirm your Ye₿ente email"));
  assert.ok(m, `confirm mail to ${addr}`);
  const t = m.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  const ok = await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  assert.equal(ok.status, 200);
  return r;
}

test("a recovery email the transport refuses is logged as failed and raises one Stan alert, and the reply stays a success", async () => {
  const addr = "fail-a@shop.co";
  await confirmedWallet("recfaila", "604391", addr);
  const before = (await alerts("wallet_email_failed")).length;
  email.setMailer({ sendMail: async () => { throw new Error("sendmail ENOENT"); } });
  try {
    const r = await (await call("POST", "wallet/recover-email", { email: addr })).json();
    assert.deepEqual(r, { success: true, message: "If that email is confirmed for a Ye₿ente wallet, a recovery link is on its way." });
    const row = await waitFor(async () => (await mails()).find((m) => m.to === addr && m.subject === "Recover your Ye₿ente wallet" && m.status !== "logged"));
    assert.ok(row, "a log row for the failed recovery mail");
    assert.match(row.status, /^failed: /);
    const alert = await waitFor(async () => (await alerts("wallet_email_failed")).length > before ? (await alerts("wallet_email_failed")).at(-1) : null);
    assert.ok(alert, "one Stan alert for the failed recovery mail");
    assert.match(alert.where, /recfaila/);
    assert.doesNotMatch(`${alert.where} ${alert.detail}`, /fail-a@shop\.co/);
  } finally {
    email.setMailer({ sendMail: async (m) => { mailed.push(m); } });
  }
});

test("with no email transport configured, the recovery mail is logged as failed (never silently logged) and alerts", async () => {
  const addr = "fail-b@shop.co";
  await confirmedWallet("recfailb", "284731", addr);
  const before = (await alerts("wallet_email_failed")).length;
  email.setMailer(null); // no SMTP, no sendmail, no Resend key
  try {
    const r = await (await call("POST", "wallet/recover-email", { email: addr })).json();
    assert.equal(r.success, true);
    const row = await waitFor(async () => (await mails()).find((m) => m.to === addr && m.subject === "Recover your Ye₿ente wallet" && m.status !== "logged"));
    assert.ok(row, "a log row for the unsent recovery mail");
    assert.match(row.status, /^failed: /);
    assert.ok(await waitFor(async () => (await alerts("wallet_email_failed")).length > before ? true : null), "one Stan alert");
  } finally {
    email.setMailer({ sendMail: async (m) => { mailed.push(m); } });
  }
});

test("the 11th login code of the day is logged as skipped and alerts, instead of vanishing", async () => {
  const addr = "codes@shop.co";
  await confirmedWallet("codelimit", "719263", addr);
  for (let i = 0; i < 10; i++) await yw.startLogin(addr);
  await waitFor(async () => ((await mails()).filter((m) => m.to === addr && m.subject === "Your Ye₿ente login code").length >= 10 ? true : null));
  const before = (await alerts("wallet_email_failed")).length;
  await yw.startLogin(addr); // 11th: over the per-wallet daily quota
  const row = await waitFor(async () => (await mails()).find((m) => m.to === addr && m.subject === "Your Ye₿ente login code" && /^skipped: .+/.test(m.status)));
  assert.ok(row, "a skipped row for the 11th code");
  assert.ok(await waitFor(async () => (await alerts("wallet_email_failed")).length > before ? true : null), "one Stan alert");
});

test("a login code held by the Deadman's Switch is logged and alerts", async () => {
  const addr = "held@shop.co";
  await confirmedWallet("codeheld", "813592", addr);
  await deadman.tripDeadman({ trigger: "manual", reason: "recovery mail test" });
  try {
    const before = (await alerts("wallet_email_failed")).length;
    await yw.startLogin(addr);
    const row = await waitFor(async () => (await mails()).find((m) => m.to === addr && m.subject === "Your Ye₿ente login code"));
    assert.ok(row);
    assert.equal(row.status, "held: deadman lockdown");
    assert.ok(await waitFor(async () => (await alerts("wallet_email_failed")).length > before ? true : null), "one Stan alert");
    // Recovery still goes out during a lockdown (and sends no alert).
    const sentBefore = mailed.length;
    await yw.requestEmailRecovery(addr, "https://altradits.test");
    const rec = await waitFor(async () => (await mails()).find((m) => m.to === addr && m.subject === "Recover your Ye₿ente wallet"));
    assert.ok(rec);
    assert.equal(rec.status, "sent");
    assert.ok(mailed.length > sentBefore);
  } finally {
    await deadman.liftDeadman({ by: "stanley", force: "force", note: "recovery mail test done" });
  }
});

test("a wallet on a test-domain address still logs and alerts when the mail is skipped in production", async () => {
  const addr = "skipped@example.com";
  await confirmedWallet("testskip", "390517", addr);
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const before = (await alerts("wallet_email_failed")).length;
    await yw.requestEmailRecovery(addr, "https://altradits.test");
    const row = await waitFor(async () => (await mails()).find((m) => m.to === addr && m.subject === "Recover your Ye₿ente wallet"));
    assert.ok(row);
    assert.equal(row.status, "skipped: test address");
    assert.ok(await waitFor(async () => (await alerts("wallet_email_failed")).length > before ? true : null), "one Stan alert");
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  }
});

test("login replies are identical with and without a wallet, and unknown emails raise no alert", async () => {
  const addr = "known-login@shop.co";
  await confirmedWallet("knownlogin", "518274", addr);
  const before = (await alerts("wallet_email_failed")).length;
  const known = await (await call("POST", "wallet/login/start", { email: addr })).json();
  const unknown = await (await call("POST", "wallet/login/start", { email: "nobody-here@shop.co" })).json();
  assert.deepEqual(known, unknown);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal((await alerts("wallet_email_failed")).length, before, "no alert for an unknown email");
});

test("a typo address throws with a hint, and the same address resubmitted with confirmTypo sends", async () => {
  const addr = "typo@gmial.com";
  const r = await (await call("POST", "wallet/create", { pin: "619427", handle: "typoflow" })).json();
  assert.equal((await call("POST", "wallet/email", { email: addr, pin: "619427" }, r.token)).status, 400);
  const ok = await (await call("POST", "wallet/email", { email: addr, pin: "619427", confirmTypo: true }, r.token)).json();
  assert.equal(ok.emailPending, addr);
  const m = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Confirm your Ye₿ente email"));
  assert.ok(m, "confirm mail after confirmTypo");
  const t = m.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  const first = await call("POST", "wallet/recover-email", { email: addr });
  assert.equal(first.status, 400);
  assert.equal((await first.json()).typoHint, "typo@gmail.com");
  const again = await (await call("POST", "wallet/recover-email", { email: addr, confirmTypo: true })).json();
  assert.equal(again.success, true);
  const rec = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Recover your Ye₿ente wallet"));
  assert.ok(rec, "recovery mail after confirmTypo");
});

test("during a pending email change, recovery goes to the old confirmed address; after 48 hours, to the new one", async () => {
  const oldAddr = "old48@shop.co", newAddr = "new48@shop.co";
  const r = await confirmedWallet("change48", "730184", oldAddr);
  const set = await (await call("POST", "wallet/email", { email: newAddr, pin: "730184" }, r.token)).json();
  assert.equal(set.emailPending, newAddr);
  const m = await waitFor(() => mailed.find((x) => x.to === newAddr && x.subject === "Confirm your Ye₿ente email"));
  const t = m.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  assert.ok((await yw.walletByHandle("change48")).emailChange, "change pending");
  mailed.length = 0;
  await yw.requestEmailRecovery(oldAddr, "https://altradits.test");
  await yw.requestEmailRecovery(newAddr, "https://altradits.test");
  await new Promise((r2) => setTimeout(r2, 200));
  assert.deepEqual(mailed.filter((x) => x.subject === "Recover your Ye₿ente wallet").map((x) => x.to), [oldAddr], "only the old confirmed address gets the link");
  // 48 hours pass: the new address takes over.
  await yw._internal.withLedger(async () => {
    const cur = await yw.walletByHandle("change48");
    cur.emailChange.effectiveAt = new Date(Date.now() - 1000).toISOString();
    await store.setJSON(`yw:${cur.id}`, cur);
  });
  await yw.effectiveEmailChanges();
  mailed.length = 0;
  await yw.requestEmailRecovery(oldAddr, "https://altradits.test");
  await yw.requestEmailRecovery(newAddr, "https://altradits.test");
  await new Promise((r2) => setTimeout(r2, 200));
  assert.deepEqual(mailed.filter((x) => x.subject === "Recover your Ye₿ente wallet").map((x) => x.to), [newAddr], "only the new address gets the link now");
});
