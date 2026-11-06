// The 24-hour post-recovery hold (#387 bug 3): at most 1,000 sats in total may
// leave for 24 hours, on every outgoing path, under the ledger lock. Pending
// sends count; failed ones don't. Nothing resets the hold except time.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-hold-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "SMTP_HOST", "RESEND_API_KEY", "EMAIL_TRANSPORT"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test",
  YEBENTE_MAX_BALANCE_SATS: "10000", YEBENTE_MAX_PAYMENT_SATS: "5000", YEBENTE_DAILY_SEND_SATS: "6000",
  YEBENTE_RECOVERY_HOLD_SATS: "1000", LND_REST_URL: "https://127.0.0.1:9", YEBENTE_LND_PAY_MACAROON: "deadbeef" }); // dead node: sends stay pending

const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const yw = await import("../lib/ywallet.js");
const lnaddr = await import("../lib/lnaddr.js");
const api = await import("../api/yebente.js");
yw.setPayTimings({ recheckMs: 20 });
let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `7.7.9.${++n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const mailed = [];
email.setMailer({ sendMail: async (m) => { mailed.push(m); } });
const waitFor = async (fn, ms = 3000) => {
  const t = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await new Promise((r) => setTimeout(r, 25)); }
};
// A BOLT11-shaped invoice for `sats` (the reader takes the amount and the "p" field).
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function invoice(sats, hash = crypto.randomBytes(32).toString("hex")) {
  const w5 = (hex) => [...Buffer.from(hex, "hex")].map((b) => b.toString(2).padStart(8, "0")).join("").padEnd(260, "0").match(/.{5}/g).map((b) => parseInt(b, 2));
  const words = [...Array(7).fill(0), 1, 1, 20, ...w5(hash), ...Array(104).fill(0)];
  return { pr: `lnbc${sats * 10}n1` + words.map((w) => BECH[w]).join("") + "qqqqqq", hash };
}
// A phone's device key, as the browser makes it.
const phone = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { spki: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    sign: (m) => crypto.sign("sha256", Buffer.from(m), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url") };
};
const mk = async (handle, pin, extra = {}) => (await (await call("POST", "wallet/create", { pin, handle, ...extra })).json());
const recover = async (words, pin) => (await (await call("POST", "wallet/restore", { recovery: words, pin })).json());

test("Lightning invoices honor the hold: blocked at 1,001 total", async () => {
  const a = await mk("holdinv", "604391");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdinv" });
  const back = await recover(a.recovery, "390517");
  assert.ok(back.wallet.holdUntil);
  const over = await call("POST", "wallet/send", { to: invoice(1001).pr, pin: "390517" }, back.token);
  assert.equal(over.status, 423);
  assert.match((await over.json()).error, /recovered recently/);
});

test("a pending send counts toward the 1,000; a failed one doesn't; reconcile moves nothing", async () => {
  const a = await mk("holdpend", "284731");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdpend" });
  await mk("holdpendpal", "719263");
  const back = await recover(a.recovery, "813592");
  const p = await (await call("POST", "wallet/send", { to: invoice(990).pr, pin: "813592" }, back.token)).json();
  assert.equal(p.status, "pending"); // the node is down: 990 + 10 reserve debited, still counted
  const blocked = await call("POST", "wallet/send", { to: "holdpendpal", sats: 1, pin: "813592" }, back.token);
  assert.equal(blocked.status, 423);
  const bal = (await yw.walletByHandle("holdpend")).balance;
  await yw.reconcilePayments(); // the node still down: nothing moves
  assert.equal((await yw.walletByHandle("holdpend")).balance, bal);
  assert.equal((await yw.history((await yw.walletByHandle("holdpend")).id))[0].status, "pending");
  // The payment fails (the node's final word, as finishPayment writes it): refunded and no longer counted.
  const w = await yw.walletByHandle("holdpend");
  const e = (await yw.history(w.id))[0];
  await yw._internal.withLedger(async () => {
    const cur = await yw.walletByHandle("holdpend");
    cur.balance += 990 + 10;
    await store.setJSON(`yw:${cur.id}`, cur);
    const rec = await store.getJSON(`ywe:${e.id}`);
    await store.setJSON(`ywe:${e.id}`, { ...rec, status: "failed", fee: 0 });
  });
  const ok = await call("POST", "wallet/send", { to: "holdpendpal", sats: 1000, pin: "813592" }, back.token);
  assert.equal(ok.status, 200);
});

test("many small payments can't pass the hold together", async () => {
  const a = await mk("holdmany", "739204");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdmany" });
  await mk("holdmanypal", "194827");
  const back = await recover(a.recovery, "482915");
  let ok = 0, blocked = 0;
  for (let i = 0; i < 11; i++) {
    const r = await call("POST", "wallet/send", { to: "holdmanypal", sats: 100, pin: "482915" }, back.token);
    if (r.status === 200) ok++; else blocked++;
  }
  assert.deepEqual([ok, blocked], [10, 1]);
});

test("paying another Ye₿ente wallet's invoice honors the hold", async () => {
  const target = await mk("holdtarget", "129847");
  const a = await mk("holdown", "316280");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdown" });
  const back = await recover(a.recovery, "417306");
  const { pr, hash } = invoice(1001);
  await store.setJSON(`ywinv:${hash}`, { walletId: target.wallet.id, sats: 1001, at: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString(), state: "open" });
  const r = await call("POST", "wallet/send", { to: pr, pin: "417306" }, back.token);
  assert.equal(r.status, 423);
});

const lnaddrFetch = () => (u, o) => globalThis.fetch(u, o);
test("Send Mobile honors the hold: the server-side invoice plus wallet/send", async () => {
  // The app asks /address/invoice (Tando's number@bitcoin.co.ke shape), then pays the invoice.
  const real = lnaddrFetch();
  lnaddr.setLnaddrFetcher(async (u) => {
    const x = new URL(String(u));
    if (x.hostname === "bitcoin.co.ke" && x.pathname === "/.well-known/lnurlp/0707172370")
      return new Response(JSON.stringify({ tag: "payRequest", callback: "https://bitcoin.co.ke/lnurlp/cb/0707172370", minSendable: 1000, maxSendable: 1e9, metadata: "[]" }), { headers: { "content-type": "application/json" } });
    if (x.hostname === "bitcoin.co.ke" && x.pathname === "/lnurlp/cb/0707172370")
      return new Response(JSON.stringify({ pr: invoice(Number(x.searchParams.get("amount")) / 1000).pr }), { headers: { "content-type": "application/json" } });
    return real(u);
  });
  try {
    const a = await mk("holdmobile", "518274");
    await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdmobile" });
    const back = await recover(a.recovery, "619427");
    const inv = await (await call("POST", "address/invoice", { to: "0707172370@bitcoin.co.ke", sats: 1001 }, back.token)).json();
    assert.ok(inv.invoice, "the proxy hands out the invoice");
    const r = await call("POST", "wallet/send", { to: inv.invoice, pin: "619427" }, back.token);
    assert.equal(r.status, 423);
  } finally {
    lnaddr.setLnaddrFetcher(null);
  }
});

test("a Lightning address honors the hold", async () => {
  const realFetch = globalThis.fetch;
  yw.setLnurlFetcher((u, o) => globalThis.fetch(u, o));
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    if (u.hostname === "bitcoin.co.ke" && u.pathname === "/.well-known/lnurlp/0707172370")
      return new Response(JSON.stringify({ tag: "payRequest", callback: "https://bitcoin.co.ke/lnurlp/cb/0707172370", minSendable: 1000, maxSendable: 1e9, metadata: "[]" }));
    if (u.hostname === "bitcoin.co.ke" && u.pathname === "/lnurlp/cb/0707172370")
      return new Response(JSON.stringify({ pr: invoice(Number(u.searchParams.get("amount")) / 1000).pr }));
    return realFetch(url, opts);
  };
  try {
    const a = await mk("holdlnaddr", "730184");
    await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdlnaddr" });
    const back = await recover(a.recovery, "527864");
    const r = await call("POST", "wallet/send", { to: "0707172370@bitcoin.co.ke", sats: 1001, pin: "527864" }, back.token);
    assert.equal(r.status, 423);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("after 24 hours the normal limits apply again", async () => {
  const a = await mk("holdexpire", "735018");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdexpire" });
  await mk("holdexpirepal", "568013");
  const back = await recover(a.recovery, "604392");
  assert.equal((await call("POST", "wallet/send", { to: "holdexpirepal", sats: 1001, pin: "604392" }, back.token)).status, 423);
  await yw._internal.withLedger(async () => {
    const cur = await yw.walletByHandle("holdexpire");
    cur.holdUntil = new Date(Date.now() - 1000).toISOString();
    await store.setJSON(`yw:${cur.id}`, cur);
  });
  assert.equal((await call("POST", "wallet/send", { to: "holdexpirepal", sats: 1500, pin: "604392" }, back.token)).status, 200);
  assert.equal((await (await call("GET", "wallet/me", null, back.token)).json()).wallet.holdUntil, null);
});

test("logging in on a new phone, unlock, freeze, cancel and email change never reset the hold", async () => {
  const addr = "holdlife@shop.co";
  const p1 = phone(), p2 = phone();
  const a = await mk("holdlife", "604393", { email: addr, device: p1.spki });
  await mk("holdlifepal", "390518");
  const m = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Confirm your Ye₿ente email"));
  const t = m.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdlife" });
  const back = await (await call("POST", "wallet/restore", { recovery: a.recovery, pin: "390519", device: p1.spki })).json();
  const hold = back.wallet.holdUntil;
  assert.ok(hold);
  const sameHold = async (why) => assert.equal((await yw.walletByHandle("holdlife")).holdUntil, hold, why);
  // A new phone logs in with a code and the PIN: no reset.
  await call("POST", "wallet/login/start", { email: addr });
  const code = (await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Your Ye₿ente login code"))).text.match(/(\d{8})/)[1];
  const logged = await (await call("POST", "wallet/login/finish", { email: addr, code, pin: "390519", device: p2.spki })).json();
  assert.equal(logged.success, true);
  await sameHold("after a new-phone login");
  // Unlock on a trusted phone: no reset.
  const opt = await (await call("POST", "wallet/unlock/options", { deviceId: back.deviceId })).json();
  const unl = await call("POST", "wallet/unlock", { deviceId: back.deviceId, signature: p1.sign(yw.unlockMessage(back.deviceId, opt.challenge)), pin: "390519" });
  assert.equal(unl.status, 200);
  await sameHold("after unlock");
  // Freeze from an email link, then unfreeze by logging in again: no reset.
  const freezeMail = await waitFor(() => mailed.find((x) => x.to === addr && /freeze\?t=/.test(x.text)));
  const ft = freezeMail.text.match(/freeze\?t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/freeze",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${ft}` }));
  assert.ok((await yw.walletByHandle("holdlife")).frozen);
  await sameHold("after freeze");
  const opt2 = await (await call("POST", "wallet/unlock/options", { deviceId: back.deviceId })).json();
  const unl2 = await call("POST", "wallet/unlock", { deviceId: back.deviceId, signature: p1.sign(yw.unlockMessage(back.deviceId, opt2.challenge)), pin: "390519" });
  assert.equal(unl2.status, 200);
  assert.ok(!(await yw.walletByHandle("holdlife")).frozen);
  await sameHold("after unfreeze");
  // A pending recovery cancelled from a trusted phone: no reset.
  await call("POST", "wallet/recover-email", { email: addr });
  await waitFor(async () => (await yw.walletByHandle("holdlife")).pendingRecovery ? true : null);
  const fresh = await (await call("POST", "wallet/unlock/options", { deviceId: back.deviceId })).json();
  const session = (await (await call("POST", "wallet/unlock", { deviceId: back.deviceId, signature: p1.sign(yw.unlockMessage(back.deviceId, fresh.challenge)), pin: "390519" })).json()).session;
  assert.equal((await call("POST", "wallet/recovery/cancel", { pin: "390519" }, session)).status, 200);
  await sameHold("after recovery cancel");
  // The email can't change during the hold.
  assert.equal((await call("POST", "wallet/email", { email: "other@shop.co", pin: "390519" }, session)).status, 423);
  await sameHold("after refused email change");
  // And the hold still bites.
  assert.equal((await call("POST", "wallet/send", { to: "holdlifepal", sats: 1001, pin: "390519" }, session)).status, 423);
});

test("a second recovery extends the hold, never shortens it", async () => {
  const addr = "holdsecond@shop.co";
  const a = await mk("holdsecond", "112358", { email: addr });
  const m = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Confirm your Ye₿ente email"));
  const t = m.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdsecond" });
  await mk("holdsecondpal", "334567");
  const first = await recover(a.recovery, "101234");
  const h1 = first.wallet.holdUntil;
  await call("POST", "wallet/recover-email", { email: addr });
  const link = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Recover your Ye₿ente wallet"));
  const token = link.text.match(/#recover=([\w-]+)/)[1];
  await new Promise((r) => setTimeout(r, 1100));
  const second = await (await call("POST", "wallet/recover-email/finish", { token, pin: "202345" })).json();
  assert.ok(second.wallet.holdUntil > h1, "the hold moves out, never in");
  assert.equal((await call("POST", "wallet/send", { to: "holdsecondpal", sats: 1001, pin: "202345" }, second.token)).status, 423);
});

test("a PIN check on a stale wallet copy can't wipe a recovery (PIN, hold, sessions)", async () => {
  const a = await mk("holdstale", "303456");
  const stale = await yw.walletByHandle("holdstale"); // loaded before the recovery
  const oldHash = yw._internal.sha(a.token);
  const back = await recover(a.recovery, "404567");
  assert.ok(back.wallet.holdUntil);
  await yw._internal.withLedger(async () => { await yw._internal.checkPin(stale, "000000").catch(() => {}); });
  const w = await yw.walletByHandle("holdstale");
  assert.equal(w.holdUntil, back.wallet.holdUntil, "the hold survives");
  assert.equal(w.epoch, 1, "sessions stay dead");
  assert.ok(!w.tokens.includes(oldHash), "the old phone's token stays dead");
  await yw._internal.withLedger(async () => { await yw._internal.checkPin(await yw.walletByHandle("holdstale"), "404567"); }); // the new PIN works
  assert.equal((await call("GET", "wallet/me", null, a.token)).status, 401, "the old phone stays signed out");
});

test("the daily cap counts the routing fee, not minus it", async () => {
  const a = await mk("dailycap", "505678");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-dailycap" });
  await yw._internal.record(a.wallet.id, { kind: "send", sats: -5000, fee: 50, counterparty: "Lightning invoice", status: "completed", ref: "cap-1" });
  const w = await yw.walletByHandle("dailycap");
  await assert.rejects(yw._internal.spendable(w, 951), /daily sending limit/); // 5,050 + 951 > 6,000
  await yw._internal.spendable(await yw.walletByHandle("dailycap"), 950); // 5,050 + 950 = 6,000: allowed
});

test("a history entry can't be backdated past the hold", async () => {
  const a = await mk("nodate", "606789");
  const e = await yw._internal.record(a.wallet.id, { kind: "send", sats: -100, fee: 0, status: "completed", ref: "date-1", at: "2001-01-01T00:00:00.000Z" });
  assert.ok(Date.parse(e.at) > Date.now() - 60e3, "record() stamps its own time");
});

test("the app learns the hold: when it ends and how much can still leave", async () => {
  const a = await mk("holdshown", "101234");
  await yw.credit({ walletId: a.wallet.id, sats: 9000, kind: "receive", ref: "fund-holdshown" });
  await mk("holdshownpal", "202345");
  const back = await recover(a.recovery, "303456");
  const me = await (await call("GET", "wallet/me", null, back.token)).json();
  assert.equal(me.wallet.hold.until, back.wallet.holdUntil);
  assert.equal(me.wallet.hold.total, 1000);
  assert.equal(me.wallet.hold.left, 1000);
  assert.equal((await call("POST", "wallet/send", { to: "holdshownpal", sats: 600, pin: "303456" }, back.token)).status, 200);
  const me2 = await (await call("GET", "wallet/me", null, back.token)).json();
  assert.equal(me2.wallet.hold.left, 400);
  const sec = await (await call("GET", "wallet/security", null, back.token)).json();
  assert.equal(sec.hold.left, 400);
});
