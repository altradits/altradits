// Ye₿ente 48-hour email change (#188): a confirmed change takes effect after
// 48 hours. Until then recovery and login keep using the old address, and the
// old address (or a trusted phone) can cancel.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-emailchange-")));
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
const settled = () => new Promise((r) => setTimeout(r, 800)); // nothing else in flight
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

let n = 0;
const ip = () => `8.10.${Math.floor(++n / 250)}.${n % 250}`;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip(), ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const formPost = (p, t, at = ip()) => api.POST(new Request(`https://altradits.test/api/yebente/${p}`, {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": at }, body: `t=${encodeURIComponent(t)}`,
}));
const phone = () => {
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { spki: publicKey.export({ type: "spki", format: "der" }).toString("base64url") };
};
const cancelTokenOf = (m) => m.text.match(/email-change-cancel\?t=([\w-]{20,})/)?.[1];

// Follows the confirm link a new address was sent.
async function confirmNewEmail(mail) {
  const confirm = mailed.find((m) => m.subject === "Confirm your Ye₿ente email" && m.to === mail);
  assert.ok(confirm, `confirm mail to ${mail}`);
  const t = confirm.text.match(/[?&]t=([\w-]+)/)[1];
  return formPost("wallet/email-confirm", t);
}
const ageChangePast = async (handle) => yw._internal.withLedger(async () => {
  const cur = await yw.walletByHandle(handle);
  cur.emailChange.effectiveAt = new Date(Date.now() - 1000).toISOString();
  await store.setJSON(`yw:${cur.id}`, cur);
});

let amina;
test("a first email still counts at once", async () => {
  amina = await json(await call("POST", "wallet/create", { pin: "604391", handle: "amina", email: "amina@example.org", device: phone().spki }));
  assert.equal(amina.status, 200);
  assert.equal((await confirmNewEmail("amina@example.org")).status, 200);
  const w = await yw.walletByHandle("amina");
  assert.equal(w.email, "amina@example.org");
  assert.equal(w.emailChange, undefined, "no waiting period with no old address to protect");
});

test("a change takes effect after 48 hours; recovery keeps using the old address", async () => {
  assert.equal((await json(await call("POST", "wallet/email", { email: "amina.new@example.org", pin: "604391" }, amina.session))).emailPending, "amina.new@example.org");
  assert.ok((await waitMail((m) => m.subject === "Ye₿ente: someone asked to change your email" && m.to === "amina@example.org")).length, "the old address is warned at once");
  assert.equal((await confirmNewEmail("amina.new@example.org")).status, 200);
  assert.equal((await yw.walletByHandle("amina")).email, "amina@example.org", "still the old address");
  const pending = (await json(await call("GET", "wallet/me", null, amina.session))).wallet.emailChange;
  assert.ok(pending, "the phone shows the pending change");
  assert.equal(pending.newEmail, "amina.new@example.org");
  assert.ok(Date.parse(pending.effectiveAt) - Date.now() > 47 * 3600e3, "about 48 hours out");
  const notice = (await waitMail((m) => m.subject === "Ye₿ente: your email change is pending" && m.to === "amina@example.org")).at(-1);
  assert.ok(cancelTokenOf(notice), "the old address gets a cancel link");
  const stored = await Promise.all((await store.keysWithPrefix("email:")).map((k) => store.getJSON(k)));
  const logged = stored.find((r) => r.subject === "Ye₿ente: your email change is pending");
  assert.ok(logged && /t=\(redacted\)/.test(logged.text) && !logged.text.includes(cancelTokenOf(notice)), "the stored log keeps no cancel token");
  // Recovery keeps using the old address until then.
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  assert.ok((await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "amina@example.org")).length, "old address still recovers");
  await call("POST", "wallet/recover-email", { email: "amina.new@example.org" });
  await settled();
  assert.equal(mailed.filter((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "amina.new@example.org").length, 0, "new address recovers nothing yet");
  // The sweeper flips nothing early, and flips a due change exactly once.
  assert.equal((await yw.effectiveEmailChanges()).effective, 0);
  assert.equal((await yw.walletByHandle("amina")).email, "amina@example.org");
  await ageChangePast("amina");
  assert.equal((await yw.effectiveEmailChanges()).effective, 1);
  assert.equal((await yw.effectiveEmailChanges()).effective, 0, "second run finds nothing");
  const w = await yw.walletByHandle("amina");
  assert.equal(w.email, "amina.new@example.org");
  assert.equal(w.emailChange, null);
  assert.equal(w.emailPending, null);
  assert.ok((await waitMail((m) => m.subject === "Ye₿ente: your email has changed" && m.to === "amina.new@example.org")).length, "the new address is told");
  await call("POST", "wallet/recover-email", { email: "amina.new@example.org" });
  assert.ok((await waitMail((m) => m.subject === "Recover your Ye₿ente wallet" && m.to === "amina.new@example.org")).length, "new address recovers now");
  const ago = mailed.length;
  await call("POST", "wallet/recover-email", { email: "amina@example.org" });
  await settled();
  assert.equal(mailed.length, ago, "old address recovers nothing any more");
  assert.ok(w.log.some((e) => /takes effect/.test(e.text)) && w.log.some((e) => /took effect/.test(e.text)), "the owner log tells the story");
});

test("the old address cancels with one link", async () => {
  await json(await call("POST", "wallet/email", { email: "amina.c@example.org", pin: "604391" }, amina.session));
  await confirmNewEmail("amina.c@example.org");
  const notice = (await waitMail((m) => m.subject === "Ye₿ente: your email change is pending" && m.to === "amina.new@example.org")).at(-1);
  const token = cancelTokenOf(notice);
  // The page: a button, no login, no JS, nothing about the account.
  for (const t of [token, "bogus-token-that-matches-nothing"]) {
    const r = await api.GET(new Request(`https://altradits.test/api/yebente/wallet/email-change-cancel?t=${t}`));
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /<form method="post" action="\/api\/yebente\/wallet\/email-change-cancel">/);
    assert.doesNotMatch(html, /<script/i);
    assert.ok(!/amina/.test(html), "no handle or email on the page");
  }
  assert.equal((await yw.walletByHandle("amina")).emailChange?.newEmail, "amina.c@example.org", "opening the link cancels nothing");
  assert.equal((await formPost("wallet/email-change-cancel", token)).status, 200);
  const w = await yw.walletByHandle("amina");
  assert.equal(w.email, "amina.new@example.org", "the old address stays");
  assert.equal(w.emailChange, null);
  assert.equal(w.emailPending, null);
  assert.equal((await yw.effectiveEmailChanges()).effective, 0, "a cancelled change never flips");
  assert.equal((await formPost("wallet/email-change-cancel", token)).status, 410, "replays are refused");
});

test("a trusted phone cancels too", async () => {
  await json(await call("POST", "wallet/email", { email: "amina.d@example.org", pin: "604391" }, amina.session));
  await confirmNewEmail("amina.d@example.org");
  const notice = (await waitMail((m) => m.subject === "Ye₿ente: your email change is pending" && m.to === "amina.new@example.org")).at(-1);
  assert.equal((await call("POST", "wallet/email/cancel", { pin: "000000" }, amina.session)).status, 403, "wrong PIN");
  assert.ok((await yw.walletByHandle("amina")).emailChange, "still pending after the wrong PIN");
  assert.equal((await json(await call("POST", "wallet/email/cancel", { pin: "604391" }, amina.session))).cancelled, true);
  assert.equal((await yw.walletByHandle("amina")).emailChange, null);
  assert.equal((await formPost("wallet/email-change-cancel", cancelTokenOf(notice))).status, 410, "the link died with it");
  assert.equal((await call("POST", "wallet/email/cancel", { pin: "604391" }, amina.session)).status, 404, "nothing left to cancel");
});

let juma;
test("abuse: a superseded link, an expired link, and the wrong account", async () => {
  juma = await json(await call("POST", "wallet/create", { pin: "284731", handle: "juma", email: "juma@example.org", device: phone().spki }));
  await confirmNewEmail("juma@example.org");
  await json(await call("POST", "wallet/email", { email: "amina.e@example.org", pin: "604391" }, amina.session));
  await confirmNewEmail("amina.e@example.org");
  const first = (await waitMail((m) => m.subject === "Ye₿ente: your email change is pending" && m.to === "amina.new@example.org")).at(-1);
  assert.equal((await call("POST", "wallet/email/cancel", { pin: "284731" }, juma.session)).status, 404, "another wallet has nothing to cancel");
  assert.equal((await yw.walletByHandle("amina")).emailChange?.newEmail, "amina.e@example.org", "and the change is intact");
  await json(await call("POST", "wallet/email", { email: "amina.f@example.org", pin: "604391" }, amina.session));
  await confirmNewEmail("amina.f@example.org");
  assert.equal((await formPost("wallet/email-change-cancel", cancelTokenOf(first))).status, 410, "a superseded link is dead");
  // Age the current link and change past the 48 hours.
  const cur = (await waitMail((m) => m.subject === "Ye₿ente: your email change is pending" && m.to === "amina.new@example.org", 4)).at(-1);
  const token = cancelTokenOf(cur);
  const past = new Date(Date.now() - 1000).toISOString();
  await store.setJSON(`ywex:${sha(token)}`, { ...(await store.getJSON(`ywex:${sha(token)}`)), expiresAt: past });
  await ageChangePast("amina");
  assert.equal((await formPost("wallet/email-change-cancel", token)).status, 410, "an expired link is refused");
  assert.equal((await yw.effectiveEmailChanges()).effective, 1, "but the due change still flips");
  assert.equal((await yw.walletByHandle("amina")).email, "amina.f@example.org");
  assert.equal((await formPost("wallet/email-change-cancel", crypto.randomBytes(32).toString("base64url"))).status, 410);
  assert.equal((await formPost("wallet/email-change-cancel", "")).status, 410);
});

test("race: the old address and the phone cancelling at once", async () => {
  await json(await call("POST", "wallet/email", { email: "juma.2@example.org", pin: "284731" }, juma.session));
  await confirmNewEmail("juma.2@example.org");
  const notice = (await waitMail((m) => m.subject === "Ye₿ente: your email change is pending" && m.to === "juma@example.org")).at(-1);
  const [link, phoneCall] = await Promise.all([
    formPost("wallet/email-change-cancel", cancelTokenOf(notice)),
    call("POST", "wallet/email/cancel", { pin: "284731" }, juma.session),
  ]);
  assert.equal((link.status === 200) !== (phoneCall.status === 200), true, `exactly one wins (link ${link.status}, phone ${phoneCall.status})`);
  assert.equal((await yw.walletByHandle("juma")).emailChange, null, "cancelled either way");
});

test("guessing at cancel is rate limited", async () => {
  const at = "9.9.9.10";
  for (let i = 0; i < 30; i++) assert.equal((await formPost("wallet/email-change-cancel", crypto.randomBytes(32).toString("base64url"), at)).status, 410);
  assert.equal((await formPost("wallet/email-change-cancel", crypto.randomBytes(32).toString("base64url"), at)).status, 429);
  const kito = await json(await call("POST", "wallet/create", { pin: "730184", handle: "kito", device: phone().spki }));
  for (let i = 0; i < 20; i++) assert.equal((await call("POST", "wallet/email/cancel", { pin: "730184" }, kito.session)).status, 404);
  assert.equal((await call("POST", "wallet/email/cancel", { pin: "730184" }, kito.session)).status, 429);
});

test("the admin log records pending, effect and cancel without secrets", async () => {
  let view = await attacks.securityView(100);
  for (let i = 0; i < 50 && !view.events.some((e) => e.kind === "email_change_effective"); i++) { await new Promise((r) => setTimeout(r, 20)); view = await attacks.securityView(100); }
  for (const kind of ["email_change_pending", "email_change_effective", "email_change_cancelled"]) {
    const ev = view.events.find((e) => e.kind === kind);
    assert.ok(ev, `admin log records ${kind}`);
    assert.ok(!/example\.org|@/.test(`${ev.where} ${ev.detail}`), `no address in ${kind}`);
  }
});
