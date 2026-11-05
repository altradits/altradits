// A new PIN must not be the old PIN: recovery (both paths) and PIN change
// refuse a PIN equal to the current one or to the last 3, kept as salted
// hashes only (#387 bug 2).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-pinhist-")));
for (const k of ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "DATA_DIR", "SMTP_HOST", "RESEND_API_KEY", "EMAIL_TRANSPORT"]) delete process.env[k];
Object.assign(process.env, { YEBENTE_WALLETS: "on", SITE_URL: "https://altradits.test" });

const store = await import("../lib/store.js");
const email = await import("../lib/email.js");
const yw = await import("../lib/ywallet.js");
const api = await import("../api/yebente.js");
let n = 0;
const call = (method, p, body, token) => api[method](new Request(`https://altradits.test/api/yebente/${p}`, {
  method, headers: { "Content-Type": "application/json", "x-forwarded-for": `7.7.8.${++n % 250}`, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body ? JSON.stringify(body) : undefined,
}));
const mailed = [];
email.setMailer({ sendMail: async (m) => { mailed.push(m); } });
const waitFor = async (fn, ms = 3000) => {
  const t = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await new Promise((r) => setTimeout(r, 25)); }
};
const REUSED = "Choose a PIN you haven't used before.";

test("recovery with the words refuses the current PIN, and the wallet is untouched", async () => {
  const r = await (await call("POST", "wallet/create", { pin: "604391", handle: "reusewords" })).json();
  await yw.credit({ walletId: r.wallet.id, sats: 2000, kind: "receive", ref: "fund-reusewords" });
  const bad = await call("POST", "wallet/restore", { recovery: r.recovery, pin: "604391" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, REUSED);
  // Nothing was reset: the old phone still works, no hold started.
  const me = await (await call("GET", "wallet/me", null, r.token)).json();
  assert.equal(me.success, true);
  assert.equal(me.wallet.holdUntil, null);
  const send = await call("POST", "wallet/send", { to: "reusewords", sats: 1, pin: "604391" }, r.token);
  assert.equal(send.status, 400); // own wallet: reached past the PIN check
  const ok = await (await call("POST", "wallet/restore", { recovery: r.recovery, pin: "390517" })).json();
  assert.equal(ok.success, true);
  assert.ok(ok.wallet.holdUntil);
});

test("recovery by email refuses the current PIN without consuming the link", async () => {
  const addr = "reuse@shop.co";
  const r = await (await call("POST", "wallet/create", { pin: "284731", handle: "reuseemail", email: addr })).json();
  const m = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Confirm your Ye₿ente email"));
  const t = m.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${t}` }));
  await call("POST", "wallet/recover-email", { email: addr });
  const link = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Recover your Ye₿ente wallet"));
  const token = link.text.match(/#recover=([\w-]+)/)[1];
  const bad = await call("POST", "wallet/recover-email/finish", { token, pin: "284731" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, REUSED);
  // The link still works with a fresh PIN.
  const ok = await (await call("POST", "wallet/recover-email/finish", { token, pin: "739204" })).json();
  assert.equal(ok.success, true);
  assert.ok(ok.wallet.holdUntil);
});

test("PIN change refuses the current PIN and the last 3, and forgets older ones", async () => {
  // The phone owns a device key (like the real app): its session survives PIN changes.
  const crypto = await import("node:crypto");
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const device = Buffer.from(publicKey.export({ type: "spki", format: "der" })).toString("base64url");
  const r = await (await call("POST", "wallet/create", { pin: "101234", handle: "pinchange", device })).json();
  const session = r.session;
  assert.ok(session, "a device session");
  const change = (pin, newPin) => call("POST", "wallet/pin/change", { pin, newPin }, session);
  let pin = "101234";
  assert.equal((await (await change(pin, pin)).json()).error, REUSED); // the current one
  for (const np of ["202345", "303456", "404567", "505678", "606789"]) {
    const res = await change(pin, np);
    assert.equal(res.status, 200, `${pin} -> ${np}`);
    pin = np;
  }
  // Current (606789) plus the last 3 (505678, 404567, 303456) are refused; 202345 is forgotten.
  for (const refused of ["606789", "505678", "404567", "303456"]) {
    const res = await change(pin, refused);
    assert.equal(res.status, 400, `${refused} must be refused`);
    assert.equal((await res.json()).error, REUSED);
  }
  assert.equal((await change(pin, "202345")).status, 200, "a PIN older than the last 3 is allowed again");
  // The phone's own session kept working throughout.
  assert.equal((await (await call("GET", "wallet/me", null, session)).json()).success, true);
});

test("PIN change needs the current PIN, keeps device sessions, and stores hashes only", async () => {
  const addr = "pinmail@shop.co";
  const r = await (await call("POST", "wallet/create", { pin: "112358", handle: "pinhash", email: addr })).json();
  const cm = await waitFor(() => mailed.find((x) => x.to === addr && x.subject === "Confirm your Ye₿ente email"));
  const ct = cm.text.match(/https?:\/\/\S+/)[0].match(/[?&]t=([\w-]+)/)[1];
  await api.POST(new Request("https://altradits.test/api/yebente/wallet/email-confirm",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${ct}` }));
  assert.equal((await call("POST", "wallet/pin/change", { pin: "000000", newPin: "334567" }, r.token)).status, 403);
  assert.equal((await call("POST", "wallet/pin/change", { pin: "112358", newPin: "123456" }, r.token)).status, 400); // weak
  const ok = await (await call("POST", "wallet/pin/change", { pin: "112358", newPin: "334567" }, r.token)).json();
  assert.equal(ok.success, true);
  // Legacy tokens end (even this phone's): log in again with the new PIN.
  assert.equal((await call("GET", "wallet/me", null, r.token)).status, 401);
  const w = await yw.walletByHandle("pinhash");
  assert.equal(w.pinHistory.length, 1);
  assert.ok(w.pinHistory[0].salt && w.pinHistory[0].hash);
  const raw = fs.readFileSync(path.join(".data", "db.json"), "utf8");
  assert.doesNotMatch(raw, /"112358"/);
  assert.doesNotMatch(raw, /"334567"/);
  // The security log and the owner notice say the PIN changed; no hold starts.
  assert.ok((w.log || []).some((e) => /PIN was changed/.test(e.text)));
  assert.equal(w.holdUntil || null, null);
  const notice = await waitFor(() => mailed.find((x) => x.to === addr && /PIN was changed/.test(x.subject)));
  assert.ok(notice, "owner notice");
});
