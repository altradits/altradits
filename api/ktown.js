// kTown (issue #385), served at /ktown in a later step. Its API lives here at
// /api/ktown/<path> (server.mjs passes the path on). kTown never holds money
// and is not a wallet: it fronts the merchant's Tando address, and the sats go
// straight to Tando and on to M-Pesa for Tando's 1% fee.
//
// Switched on with KTOWN=on. Off: every route below refuses, except health and help.
//
//   GET  health                      always: {ok, on, full} (full: the pilot cap is reached)
//   GET  help                        always: {help} (KTOWN_HELP, or null when unset)
//   POST register {phone, shop, mpesaName, pin, agree, lang?} -> {merchant, session}
//   POST login {phone, pin} -> {merchant, session}
//   GET  me, history                 (Authorization: Bearer <session>)
//   POST settings {shop?, mpesaName?, currency?, lang?}  (signed in)
//   POST pin {pin}                   a new PIN (signed in: the session proves ownership)
//   POST lock                        sign out on this phone (signed in)
//   POST check                       asks Tando about this merchant's own newest pending
//                                    payments (at most 5, picked by the server) -> {merchant, entries}
//   GET  lnurlp/<id> (= /.well-known/lnurlp/k-<id>)  the merchant as LNURL-pay
//   GET  lnurlp/<id>/cb?amount=&currency=  Tando's invoice for exactly that amount
//   GET  receipt/<hash>              Tando's status for a kTown-recorded payment only
//   GET  rates                       KES into the display currencies (display only)
import { json, readBody, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import crypto from "node:crypto";

const env = (k) => String(process.env[k] || "").trim();
const site = () => (env("SITE_URL") || "https://altradits.com").replace(/\/$/, "");
const sub = (request) => decodeURIComponent(new URL(request.url).pathname.replace(/^\/api\/ktown\/?/, ""));
const ipKey = (request) => crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);
function authOf(request) { return String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim(); }
const lnurlReply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });

async function me(request) {
  const { merchantForToken } = await import("../lib/ktown.js");
  const m = await merchantForToken(authOf(request));
  if (!m) throw Object.assign(new Error("Sign in again on the shop phone."), { status: 401 });
  return m;
}

async function lnurlPay(request, id) {
  const kt = await import("../lib/ktown.js");
  if (!kt.ktownOn()) return lnurlReply({ status: "ERROR", reason: "kTown isn't open yet." });
  if (!kt.ID_RE.test(id)) return lnurlReply({ status: "ERROR", reason: "Unknown QR code." }, 404);
  const { getJSON } = await import("../lib/store.js");
  const m = await getJSON(`kt:${id}`);
  if (!m) return lnurlReply({ status: "ERROR", reason: "Unknown QR code." }, 404);
  if ((await hit(`rl:kt:lnurl:${m.id}`, 600)) > 120 || (await hit(`rl:kt:lnurli:${ipKey(request)}`, 600)) > 60)
    return lnurlReply({ status: "ERROR", reason: "Too many requests." });
  try {
    return lnurlReply(kt.payRequestJson(site(), m, await kt.tandoQuote(m.phone)));
  } catch (e) {
    // Known refusals keep their words; anything unexpected stays generic.
    return lnurlReply({ status: "ERROR", reason: e.status ? e.message : "Tando isn't reachable right now. Try again in a minute." });
  }
}

async function lnurlCallback(request, id) {
  const kt = await import("../lib/ktown.js");
  if (!kt.ktownOn()) return lnurlReply({ status: "ERROR", reason: "kTown isn't open yet." });
  if (!kt.ID_RE.test(id)) return lnurlReply({ status: "ERROR", reason: "Unknown QR code." }, 404);
  const { getJSON } = await import("../lib/store.js");
  const m = await getJSON(`kt:${id}`);
  if (!m) return lnurlReply({ status: "ERROR", reason: "Unknown QR code." }, 404);
  if ((await hit(`rl:kt:cb:${m.id}`, 600)) > 60 || (await hit(`rl:kt:cbi:${ipKey(request)}`, 600)) > 30)
    return lnurlReply({ status: "ERROR", reason: "Too many requests." });
  const q = new URL(request.url).searchParams;
  try {
    const { invoice } = await kt.tandoInvoice(m, { amount: q.get("amount"), currency: q.get("currency") });
    return lnurlReply(invoice);
  } catch (e) {
    return lnurlReply({ status: "ERROR", reason: e.status ? e.message : "Tando isn't reachable right now. Try again in a minute." });
  }
}

async function receipt(request, hash) {
  const kt = await import("../lib/ktown.js");
  if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
  // The pay page polls every few seconds while it waits; a shared mobile
  // address holds many payers, so the per-network cap is generous.
  if ((await hit(`rl:kt:rc:${ipKey(request)}`, 600)) > 300
    || (await hit(`rl:kt:rch:${String(hash).toLowerCase()}`, 600)) > 100)
    return json({ success: false, error: "Too many checks. Try again later." }, 429);
  try {
    return json({ success: true, ...(await kt.confirmPayment(hash)) });
  } catch (e) {
    return e.status ? json({ success: false, error: e.message }, e.status)
      : json({ success: false, error: "Internal server error." }, 500);
  }
}

export async function GET(request) {
  const path = sub(request);
  if (path === "" || path === "health") {
    const { ktownOn, pilotFull } = await import("../lib/ktown.js");
    const on = ktownOn();
    return json({ ok: true, on, full: on ? await pilotFull() : false });
  }
  if (path === "help") {
    const { ktownHelp } = await import("../lib/ktown.js");
    return json({ success: true, help: ktownHelp() });
  }
  try {
    const lp = path.match(/^lnurlp\/([A-Za-z0-9_-]{1,80})$/);
    if (lp) return await lnurlPay(request, lp[1]);
    const cb = path.match(/^lnurlp\/([A-Za-z0-9_-]{1,80})\/cb$/);
    if (cb) return await lnurlCallback(request, cb[1]);
    const rc = path.match(/^receipt\/([0-9a-fA-F]{1,80})$/);
    if (rc) return await receipt(request, rc[1]);
    if (path === "rates") {
      const kt = await import("../lib/ktown.js");
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      if ((await hit(`rl:kt:rates:${ipKey(request)}`, 600)) > 120) return json({ success: false, error: "Too many requests. Try again later." }, 429);
      try {
        return json({ success: true, ...(await kt.fiatRates()) });
      } catch (e) {
        return e.status ? json({ success: false, error: e.message }, e.status)
          : json({ success: false, error: "Internal server error." }, 500);
      }
    }
    if (path === "me" || path === "history") {
      const kt = await import("../lib/ktown.js");
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      const m = await me(request);
      if ((await hit(`rl:kt:me:${m.id}`, 600)) > 120) return json({ success: false, error: "Too many requests. Try again later." }, 429);
      if (path === "me") return json({ success: true, merchant: kt.publicMerchant(m, site()) });
      return json({ success: true, entries: await kt.history(m.id) });
    }
  } catch (e) {
    if (e.status) return json({ success: false, error: e.message }, e.status);
    console.error("ktown", path, e.message);
    return json({ success: false, error: "Internal server error." }, 500);
  }
  return json({ success: false, error: "Not found" }, 404);
}

export async function POST(request) {
  const path = sub(request);
  try {
    const kt = await import("../lib/ktown.js");
    if (path === "register") {
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      const body = await readBody(request);
      let phoneKey = "bad";
      try { phoneKey = kt.normalizePhone(body.phone); } catch { /* counted below, refused by registerMerchant */ }
      if ((await hit(`rl:kt:reg:${ipKey(request)}`, 3600)) > 10
        || (await hit(`rl:kt:regp:${phoneKey}`, 3600)) > 5
        || (await hit(`rl:kt:reg:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 100)
        return json({ success: false, error: "Too many sign-ups. Try again later." }, 429);
      const r = await kt.registerMerchant({ phone: body.phone, shop: body.shop, mpesaName: body.mpesaName, pin: body.pin, agree: body.agree, lang: body.lang });
      return json({ success: true, merchant: kt.publicMerchant(r.merchant, site()), session: r.session });
    }
    if (path === "login") {
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      const body = await readBody(request);
      let phoneKey = "bad";
      try { phoneKey = kt.normalizePhone(body.phone); } catch { /* refused below */ }
      if ((await hit(`rl:kt:login:${ipKey(request)}`, 3600)) > 30 || (await hit(`rl:kt:loginp:${phoneKey}`, 3600)) > 10)
        return json({ success: false, error: "Too many attempts. Try again in an hour." }, 429);
      const r = await kt.loginMerchant({ phone: body.phone, pin: body.pin });
      return json({ success: true, merchant: kt.publicMerchant(r.merchant, site()), session: r.session });
    }
    if (path === "settings" || path === "pin") {
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      const m = await me(request);
      if ((await hit(`rl:kt:set:${m.id}`, 600)) > 30) return json({ success: false, error: "Too many changes. Try again later." }, 429);
      const body = await readBody(request);
      const next = path === "settings"
        ? await kt.updateSettings(m, { shop: body.shop, mpesaName: body.mpesaName, currency: body.currency, lang: body.lang })
        : await kt.changePin(m, body.pin);
      return json({ success: true, merchant: kt.publicMerchant(next, site()) });
    }
    if (path === "check") {
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      const m = await me(request);
      // The app asks every ~20 s while open: these caps keep any one phone, or
      // one shop on many phones, from turning it into a stream of Tando calls.
      const ses = crypto.createHash("sha256").update(authOf(request)).digest("hex").slice(0, 32);
      if ((await hit(`rl:kt:chk:${ses}`, 600)) > 40 || (await hit(`rl:kt:chkm:${m.id}`, 600)) > 80)
        return json({ success: false, error: "Too many checks. Try again later." }, 429);
      const r = await kt.confirmPending(m.id, 5);
      const { getJSON } = await import("../lib/store.js");
      const fresh = (await getJSON(`kt:${m.id}`)) || m;
      return json({ success: true, checked: r.checked, merchant: kt.publicMerchant(fresh, site()), entries: await kt.history(m.id) });
    }
    if (path === "lock") {
      if (!kt.ktownOn()) return json({ success: false, error: "kTown isn't open yet." }, 501);
      await me(request); // signed in: a stranger's token signs nothing out
      await kt.lockSession(authOf(request));
      return json({ success: true });
    }
    return json({ success: false, error: "Not found" }, 404);
  } catch (e) {
    if (e.status) return json({ success: false, error: e.message }, e.status);
    console.error("ktown", path, e.message);
    return json({ success: false, error: "Internal server error." }, 500);
  }
}
