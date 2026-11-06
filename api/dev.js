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
  } catch (e) {
    return fail(e);
  }
  return reply({ ok: false, code: "not_found", error: "Not found." }, 404);
}
