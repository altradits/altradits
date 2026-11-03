// Fiat deposits: M-Pesa and card top-ups start from one plain-words quote.
// Run: node --test test/fiatbuy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "altradits-fiat-")));
for (const k of ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "SMTP_HOST", "DATA_DIR", "LND_REST_URL"]) delete process.env[k];
process.env.YEBENTE_WALLETS = "on";
process.env.YEBENTE_CARD_BUY = "on";
process.env.PESAPAL_CONSUMER_KEY = "test-key";
process.env.PESAPAL_CONSUMER_SECRET = "test-secret";
process.env.PESAPAL_IPN_ID = "test-ipn-id";
process.env.PESAPAL_CALLBACK_SECRET = "card-callback-secret-12345678";
process.env.SITE_URL = "https://cards.test";

const yw = await import("../lib/ywallet.js");
const pep = await import("../lib/pesapal.js");
const yb = await import("../api/yebente.js");
const { getJSON } = await import("../lib/store.js");

test("a fiat quote says plainly when the price can't be reached", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("net down"); };
  try {
    await assert.rejects(yw.quoteBuy({ id: "w1", balance: 0 }, 100), /current price couldn't be reached/i);
  } finally { globalThis.fetch = realFetch; }
});

// ---- card deposits: pay on the provider's page, credited once confirmed ----
// The provider and the price feeds are scripted below.
const ppOrders = new Map();
let ppTokenHits = 0, ppStatusDesc = "Pending", ppStatusCode = 0, ppStatusKes = null, ppFailStatus = false;
const ok = (body) => ({ ok: true, json: async () => body });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  // Shillings per bitcoin for quotes: 100,000 USD x 129 KES.
  if (u.includes("open.er-api.com")) return ok({ rates: { KES: 129 } });
  if (u.includes("api.coinbase.com")) return ok({ data: { amount: "100000" } });
  if (u.endsWith("/api/Auth/RequestToken")) { ppTokenHits++; return ok({ token: "pp-test-token", expiryDate: new Date(Date.now() + 300e3).toISOString() }); }
  if (u.endsWith("/api/Transactions/SubmitOrderRequest")) {
    const body = JSON.parse(opts.body);
    const id = `track-${ppOrders.size + 1}-abcd-1234-efgh-567812345678`;
    ppOrders.set(id, body);
    return ok({ redirect_url: `https://pay.test/checkout/${id}`, order_tracking_id: id, merchant_reference: body.id });
  }
  const m = u.match(/GetTransactionStatus\?orderTrackingId=([^&]+)/);
  if (m) {
    if (ppFailStatus) throw new Error("provider unreachable");
    const order = ppOrders.get(decodeURIComponent(m[1]));
    return ok({ payment_status_description: ppStatusDesc, status_code: ppStatusCode, amount: ppStatusKes ?? order?.amount, currency: "KES" });
  }
  throw new Error(`unexpected fetch: ${u}`);
};

const mkWallet = (handle) => yw.createWallet({ pin: "482910", handle });
const authed = (token, url, opts = {}) => new Request(url, { ...opts,
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });

test("card order: refused gracefully without a node instead of quoting blindly", async () => {
  const { token } = await mkWallet("card_buyer");
  const r = await yb.POST(authed(token, "http://x/api/yebente/wallet/card/order",
    { method: "POST", body: JSON.stringify({ kes: 500 }) }));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /paused|try again/i);
});

test("card status: Completed credits once; a repeat confirmation never pays twice", async () => {
  const { wallet, token } = await mkWallet("card_paid");
  ppStatusDesc = "Completed"; ppStatusCode = 1; ppStatusKes = null;
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  assert.match(order.redirectUrl, /^https:\/\/pay\.test\/checkout\//);
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  const check = () => yb.GET(authed(token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`));
  assert.equal((await (await check()).json()).state, "paid");
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 3875);
  assert.equal((await (await check()).json()).state, "paid");
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 3875);
  const entries = await yw.history(wallet.id);
  assert.equal(entries.filter((e) => e.kind === "buy").length, 1);
});

test("card status: Failed closes the order and credits nothing; Pending leaves it open", async () => {
  const { wallet, token } = await mkWallet("card_failed");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  ppStatusDesc = "Pending"; ppStatusCode = 0;
  const pending = await (await yb.GET(authed(token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`))).json();
  assert.equal(pending.state, "pending");
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
  ppStatusDesc = "Failed"; ppStatusCode = 0;
  const failed = await (await yb.GET(authed(token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`))).json();
  assert.equal(failed.state, "failed");
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
});

test("card status: an unclear provider answer never credits, and never closes", async () => {
  const { wallet, token } = await mkWallet("card_unclear");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  ppFailStatus = true;
  try {
    const r = await (await yb.GET(authed(token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`))).json();
    assert.equal(r.state, "pending");
  } finally { ppFailStatus = false; }
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
  ppStatusDesc = "Refunded"; ppStatusCode = 2; // a status we don't pay on
  const r = await (await yb.GET(authed(token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`))).json();
  assert.equal(r.state, "pending");
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
});

test("card status: a different amount than quoted never credits", async () => {
  const { wallet, token } = await mkWallet("card_mismatch");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  ppStatusDesc = "Completed"; ppStatusCode = 1; ppStatusKes = 50; // provider says 50, we quoted 500
  try {
    const r = await (await yb.GET(authed(token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`))).json();
    assert.equal(r.state, "pending");
  } finally { ppStatusKes = null; }
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
});

test("card status: only the wallet that ordered can ask", async () => {
  const a = await mkWallet("card_owner");
  const b = await mkWallet("card_stranger");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  await yw.startCardBuy(await getJSON(`yw:${a.wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  ppStatusDesc = "Completed"; ppStatusCode = 1;
  const r = await yb.GET(authed(b.token, `http://x/api/yebente/wallet/card/status/${order.trackingId}`));
  assert.equal(r.status, 404);
  const missing = await yb.GET(authed(b.token, "http://x/api/yebente/wallet/card/status/track-no-such-order-0"));
  assert.equal(missing.status, 404);
});

test("card IPN: a wrong secret is refused; the right one confirms through a server query", async () => {
  const { wallet } = await mkWallet("card_ipn");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  ppStatusDesc = "Completed"; ppStatusCode = 1;
  const bad = await yb.POST(new Request("http://x/api/yebente/card/ipn/wrong-secret-12345678", { method: "POST" }));
  assert.equal(bad.status, 403);
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 0);
  const good = await yb.POST(new Request(`http://x/api/yebente/card/ipn/card-callback-secret-12345678?OrderTrackingId=${order.trackingId}`, { method: "POST" }));
  assert.equal(good.status, 200);
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 3875);
});

test("card IPN: the provider's JSON notice shape confirms too", async () => {
  const { wallet } = await mkWallet("card_ipnbody");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 500 });
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 500, sats: 3875 }, order.trackingId);
  ppStatusDesc = "Completed"; ppStatusCode = 1;
  const good = await yb.POST(new Request("http://x/api/yebente/card/ipn/card-callback-secret-12345678",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ OrderTrackingId: order.trackingId }) }));
  assert.equal(good.status, 200);
  assert.equal((await getJSON(`yw:${wallet.id}`)).balance, 3875);
});

test("card return page: only the state, never amounts", async () => {
  const { wallet } = await mkWallet("card_return");
  const order = await pep.submitOrder({ email: "buyer@example.com", kes: 777 });
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 777, sats: 6000 }, order.trackingId);
  ppStatusDesc = "Completed"; ppStatusCode = 1;
  const html = await (await yb.GET(new Request(`http://x/api/yebente/wallet/card/return?OrderTrackingId=${order.trackingId}`))).text();
  assert.match(html, /received|paid/i);
  assert.doesNotMatch(html, /777|6000/);
});

test("card and M-Pesa buys share one daily shilling limit", async () => {
  process.env.YEBENTE_DAILY_BUY_KES = "10000";
  const { wallet } = await mkWallet("card_daily");
  await yw.startCardBuy(await getJSON(`yw:${wallet.id}`), { kes: 9000, sats: 69000 }, "track-daily-limit-test-1");
  await assert.rejects(yw.quoteBuy(await getJSON(`yw:${wallet.id}`), 2000), /daily buying limit/i);
  delete process.env.YEBENTE_DAILY_BUY_KES;
});

test("provider sign-in is asked once and reused while fresh", async () => {
  await pep.submitOrder({ email: "buyer@example.com", kes: 100 }); // warms the cache in any order
  const before = ppTokenHits;
  await pep.submitOrder({ email: "buyer@example.com", kes: 100 });
  await pep.submitOrder({ email: "buyer@example.com", kes: 100 });
  assert.equal(ppTokenHits, before);
});
