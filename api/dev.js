// Developer API v1 (issue #421), at /api/dev/v1/<path> (server.mjs passes the
// path on). Versioned JSON: every reply carries a requestId, and every error
// carries a stable machine code plus a human sentence:
//
//   ok:    { ok: true, requestId, ... }
//   error: { ok: false, requestId, code, error }
//
// Authentication: Authorization: Bearer <token>. Dashboard sessions and API
// keys share the header and are told apart by the key prefix (ak_live_ /
// ak_test_). PR1 serves the account area (sessions); key-authenticated
// invoice routes arrive in PR2.
//
//   GET  v1/health                        always: { api, sandbox }
//   POST v1/accounts/request-code {email, confirmTypo?}
//   POST v1/accounts/verify-code {email, code} -> {account, session}
//   GET  v1/accounts/me                   (session)
//   POST v1/accounts/sign-out             (session)
//   GET  v1/keys                          (session)
//   POST v1/keys {name?, scopes?, sandbox?} -> the key, shown once
//   POST v1/keys/<id>/rotate             (session: old key revoked, new shown once)
//   POST v1/keys/<id>/revoke             (session)
//   GET  v1/destinations                  (session)
//   POST v1/destinations {address, sandbox?} -> destination + 1-sat challenge invoice
//   POST v1/destinations/<id>/prove      (session: after the challenge is paid)
//   POST v1/invoices {destinationId, sats?|fiat?, memo?} (+ Idempotency-Key)
//   GET  v1/invoices?limit&cursor        invoice routes take an API key, not a session
//   GET  v1/invoices/<id>               with a live settlement check
//   GET  v1/verify/<hash>               settlement by payment hash
//   POST v1/webhooks {url, events?, sandbox?} -> endpoint + secret, shown once
//   GET  v1/webhooks                     webhook routes take a key (webhooks scope) or a session
//   POST v1/webhooks/<id>/disable
//   GET  v1/webhooks/<id>/deliveries?limit&cursor
import { readBody, clientIp } from "../lib/http.js";
import { hit } from "../lib/store.js";
import crypto from "node:crypto";

const sub = (request) => decodeURIComponent(new URL(request.url).pathname.replace(/^\/api\/dev\/?/, ""));
const rid = () => crypto.randomBytes(8).toString("hex");
const reply = (body, status = 200) =>
  new Response(JSON.stringify({ requestId: rid(), ...body }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (e, fallback = "bad_request") => {
  if (e && e.code) return reply({ ok: false, code: e.code, error: e.message }, e.status || 400);
  console.error("dev api:", e?.message || e);
  return reply({ ok: false, code: "server_error", error: "Internal server error." }, 500);
};
const authOf = (request) => String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
const ipKey = (request) => crypto.createHash("sha256").update(clientIp(request) || "").digest("hex").slice(0, 16);

async function sessionAccount(request) {
  const { accountForSession } = await import("../lib/devapi.js");
  const a = await accountForSession(authOf(request));
  if (!a) throw Object.assign(new Error("Sign in again."), { code: "unauthorized", status: 401 });
  return a;
}

// API-key routes: the token must be a key (ak_live_ / ak_test_), never a
// dashboard session. Unknown keys are key-guessing: logged for the Security
// watch (deduped per connection per minute inside recordAttack).
async function keyAuth(request, scope, where) {
  const { authKey, requireScope } = await import("../lib/devapi.js");
  try {
    const auth = await authKey(authOf(request));
    requireScope(auth.key, scope);
    return auth;
  } catch (e) {
    // Only key-shaped tokens count as guessing: a dashboard session sent to
    // a key route is a client bug, not an attack.
    if (e.code === "invalid_key" && authOf(request).startsWith("ak_")) {
      const { recordAttack } = await import("../lib/attacks.js");
      recordAttack("dev_key_guess", { where, ip: clientIp(request) }).catch(() => {});
    }
    throw e;
  }
}

// Webhook routes take either a key with the webhooks scope or a session (the
// dashboard manages webhooks with the signed-in account).
async function keyOrSession(request, where) {
  if (authOf(request).startsWith("ak_")) {
    const auth = await keyAuth(request, "webhooks", where);
    return { account: auth.account, sandbox: auth.sandbox };
  }
  return { account: await sessionAccount(request), sandbox: undefined };
}

export async function GET(request) {
  const path = sub(request);
  if (path === "" || path === "v1" || path === "v1/health") {
    const { devapiOn, devSandboxOn } = await import("../lib/devapi.js");
    return reply({ ok: true, version: "v1", api: devapiOn() ? "on" : "off", sandbox: devSandboxOn() ? "on" : "off" });
  }
  if (!path.startsWith("v1/")) return reply({ ok: false, code: "bad_version", error: "Unknown API version. The current version is v1." }, 404);
  const p = path.slice(3);
  try {
    if (p === "accounts/me") {
      const a = await sessionAccount(request);
      if ((await hit(`rl:dev:mei:${ipKey(request)}`, 600)) > 300) return reply({ ok: false, code: "rate_limited", error: "Too many requests. Try again later." }, 429);
      const { publicAccount } = await import("../lib/devapi.js");
      return reply({ ok: true, account: publicAccount(a) });
    }
    if (p === "keys") {
      const a = await sessionAccount(request);
      if ((await hit(`rl:dev:keyl:${a.id}`, 600)) > 60) return reply({ ok: false, code: "rate_limited", error: "Too many requests. Try again later." }, 429);
      const { listKeys } = await import("../lib/devapi.js");
      return reply({ ok: true, keys: await listKeys(a.id) });
    }
    if (p === "destinations") {
      const a = await sessionAccount(request);
      if ((await hit(`rl:dev:destl:${a.id}`, 600)) > 60) return reply({ ok: false, code: "rate_limited", error: "Too many requests. Try again later." }, 429);
      const { listDestinations } = await import("../lib/devapi.js");
      return reply({ ok: true, destinations: await listDestinations(a.id) });
    }
    if (p === "invoices") {
      const auth = await keyAuth(request, "invoices:read", "Developer API invoices");
      if ((await hit(`rl:dev:invli:${ipKey(request)}`, 600)) > 300) return reply({ ok: false, code: "rate_limited", error: "Too many requests. Try again later." }, 429);
      const { listInvoices } = await import("../lib/devapi.js");
      const q = new URL(request.url).searchParams;
      return reply({ ok: true, ...(await listInvoices(auth, { limit: q.get("limit"), cursor: q.get("cursor") })) });
    }
    const inv = p.match(/^invoices\/([A-Za-z0-9_-]{1,80})$/);
    if (inv) {
      const auth = await keyAuth(request, "invoices:read", "Developer API invoice");
      const { getInvoice } = await import("../lib/devapi.js");
      return reply({ ok: true, ...(await getInvoice(auth, inv[1])) });
    }
    const vfy = p.match(/^verify\/([0-9a-fA-F]{1,80})$/);
    if (vfy) {
      const auth = await keyAuth(request, "invoices:read", "Developer API verify");
      const { verifyByHash } = await import("../lib/devapi.js");
      return reply({ ok: true, ...(await verifyByHash(auth, vfy[1])) });
    }
    if (p === "webhooks") {
      const { account, sandbox } = await keyOrSession(request, "Developer API webhooks");
      const { listWebhooks } = await import("../lib/devapi.js");
      return reply({ ok: true, webhooks: await listWebhooks(account.id, { sandbox }) });
    }
    const del = p.match(/^webhooks\/([A-Za-z0-9_-]{1,80})\/deliveries$/);
    if (del) {
      const { account } = await keyOrSession(request, "Developer API deliveries");
      const { listDeliveries } = await import("../lib/devapi.js");
      const q = new URL(request.url).searchParams;
      return reply({ ok: true, ...(await listDeliveries(account.id, del[1], { limit: q.get("limit"), cursor: q.get("cursor") })) });
    }
  } catch (e) {
    return fail(e);
  }
  return reply({ ok: false, code: "not_found", error: "Not found." }, 404);
}

export async function POST(request) {
  const path = sub(request);
  if (!path.startsWith("v1/")) return reply({ ok: false, code: "bad_version", error: "Unknown API version. The current version is v1." }, 404);
  const p = path.slice(3);
  try {
    const dev = await import("../lib/devapi.js");
    if (p === "accounts/request-code") {
      if ((await hit(`rl:dev:codei:${ipKey(request)}`, 3600)) > 20) return reply({ ok: false, code: "rate_limited", error: "Too many codes. Try again in an hour." }, 429);
      const body = await readBody(request);
      await dev.requestAccountCode(body.email, { confirmTypo: body.confirmTypo === true });
      return reply({ ok: true, sent: true });
    }
    if (p === "accounts/verify-code") {
      if ((await hit(`rl:dev:verifyi:${ipKey(request)}`, 3600)) > 30) return reply({ ok: false, code: "rate_limited", error: "Too many tries. Try again in an hour." }, 429);
      const body = await readBody(request);
      const r = await dev.verifyAccountCode(body.email, body.code);
      return reply({ ok: true, account: r.account, session: r.session });
    }
    if (p === "accounts/sign-out") {
      const a = await sessionAccount(request);
      const { deleteKeys } = await import("../lib/store.js");
      await deleteKeys([`dev:sess:${crypto.createHash("sha256").update(authOf(request)).digest("hex")}`]);
      return reply({ ok: true, signedOut: true, account: { id: a.id } });
    }
    if (p === "keys") {
      const a = await sessionAccount(request);
      const body = await readBody(request);
      const k = await dev.createKey(a.id, { name: body.name, scopes: body.scopes, sandbox: body.sandbox === true });
      return reply({ ok: true, key: k.key, id: k.id, prefix: k.prefix, name: k.name, scopes: k.scopes, sandbox: k.sandbox, createdAt: k.createdAt,
        note: "Copy the key now: it is shown once and never again." }, 201);
    }
    const rot = p.match(/^keys\/([A-Za-z0-9_-]{1,80})\/(rotate|revoke)$/);
    if (rot) {
      const a = await sessionAccount(request);
      if (rot[2] === "revoke") {
        await dev.revokeKey(a.id, rot[1]);
        return reply({ ok: true, revoked: true });
      }
      const k = await dev.rotateKey(a.id, rot[1]);
      return reply({ ok: true, key: k.key, id: k.id, prefix: k.prefix, name: k.name, scopes: k.scopes, sandbox: k.sandbox, createdAt: k.createdAt,
        note: "Copy the key now: it is shown once and never again." }, 201);
    }
    if (p === "destinations") {
      const a = await sessionAccount(request);
      const body = await readBody(request);
      const r = await dev.registerDestination(a.id, { address: body.address, sandbox: body.sandbox === true });
      return reply({ ok: true, destination: r.destination, challenge: r.challenge }, 201);
    }
    const prv = p.match(/^destinations\/([A-Za-z0-9_-]{1,80})\/prove$/);
    if (prv) {
      const a = await sessionAccount(request);
      const r = await dev.proveDestination(a.id, prv[1]);
      return reply({ ok: true, destination: r.destination });
    }
    if (p === "invoices") {
      const auth = await keyAuth(request, "invoices:create", "Developer API invoices");
      if ((await hit(`rl:dev:invi:${ipKey(request)}`, 3600)) > 500) return reply({ ok: false, code: "rate_limited", error: "Too many invoices. Try again later." }, 429);
      const body = await readBody(request);
      const r = await dev.createInvoice(auth, { destinationId: body.destinationId, sats: body.sats, fiat: body.fiat,
        memo: body.memo, idempotencyKey: request.headers.get("idempotency-key") });
      return reply({ ok: true, ...r }, r.deduplicated ? 200 : 201);
    }
    if (p === "webhooks") {
      const { account } = await keyOrSession(request, "Developer API webhooks");
      const body = await readBody(request);
      const r = await dev.registerWebhook(account.id, { url: body.url, events: body.events, sandbox: body.sandbox === true });
      return reply({ ok: true, webhook: r.webhook, secret: r.secret, note: r.note }, 201);
    }
    const dis = p.match(/^webhooks\/([A-Za-z0-9_-]{1,80})\/disable$/);
    if (dis) {
      const { account } = await keyOrSession(request, "Developer API webhooks");
      const r = await dev.disableWebhook(account.id, dis[1]);
      return reply({ ok: true, webhook: r.webhook });
    }
  } catch (e) {
    return fail(e);
  }
  return reply({ ok: false, code: "not_found", error: "Not found." }, 404);
}
