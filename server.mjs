// The whole site in one Node process: static pages + api/*.js handlers.
// Production: HostAfrica "Setup Node.js App" (Passenger) starts it via app.cjs.
// Local:      npm run dev, then open http://localhost:3000
import { clientIp, etagMatches, adminAuthed } from "./lib/http.js";
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === "production";
const ROOT_REAL = (() => { try { return fs.realpathSync(ROOT); } catch { return ROOT; } })();

// Minimal .env loader (no dependency). In production prefer the panel's
// environment variables; a .env here would sit inside public_html.
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env */ }
// "dev" stand-ins only on a developer's own machine. Anywhere Passenger runs the
// app (the live server), or NODE_ENV is production, a missing secret stays
// missing: the admin then refuses everyone instead of accepting "dev".
const SERVER = PROD || Boolean(process.env.PASSENGER_APP_ENV) || typeof globalThis.PhusionPassenger !== "undefined";
if (!SERVER) {
  for (const k of ["ADMIN_TOKEN"]) {
    if (!process.env[k]) { process.env[k] = "dev"; console.log(`${k} not set: using "dev" locally`); }
  }
} else {
  for (const k of ["ADMIN_TOKEN", "SITE_URL"]) if (!process.env[k]) console.error(`${k} is not set: ${k === "ADMIN_TOKEN" ? "the admin stays locked" : "links use https://altradits.com"}. Set it in DirectAdmin → Setup Node.js App.`);
  if (process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length < 24) console.error("ADMIN_TOKEN is short: use a long random one (openssl rand -hex 32).");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml; charset=utf-8", ".woff2": "font/woff2", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json" };
// Only these paths are ever served: never .git, .env, lib/, data files.
const PUBLIC = /^\/(index\.html|admin\.html|journey\.html|library\.html|players\.html|tracker\.html|friends\.html|plan\.html|donate\.html|bitcoin\.html|wallet\.html|bitcoin-core\.html|contact\.html|receipt\.html|robots\.txt|sitemap\.xml|llms\.txt|yebente\/app\/(?:index\.html|manifest\.webmanifest|assets\/[\w.-]+|fonts\/[\w.-]+|icons\/[\w.-]+)|assets\/[\w.-]+|assets\/marketing\/(?:(?:\d{4}-\d{2}|templates)\/)?[\w-][\w.-]*|assets\/players\/[\w-]+\.png|\.well-known\/acme-challenge\/[\w-]+)$/;
// HSTS: browsers that have visited once only ever use HTTPS here (no includeSubDomains,
// so other subdomains such as mail are unaffected). COOP: no other site keeps a handle
// on our windows.
const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN",
  "Strict-Transport-Security": "max-age=31536000", "Cross-Origin-Opener-Policy": "same-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" };

// Pages that show client or admin data get a Content Security Policy: only our
// own scripts (and each page's inline script, by hash) can run, so even if some
// text slipped through unescaped it couldn't run or send the admin token away.
const cspCache = new Map();
function cspFor(file) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = cspCache.get(file);
  if (hit?.mtime === mtime) return hit.csp;
  const html = fs.readFileSync(file, "utf8");
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
  const csp = [`default-src 'self'`, `script-src 'self' ${hashes.join(" ")}`, `style-src 'self' 'unsafe-inline'`, `font-src 'self'`,
    `img-src 'self' data: https:`, `frame-src 'self' blob:`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`].join("; ");
  cspCache.set(file, { mtime, csp });
  return csp;
}

// Static files: compressed once per version (brotli, else gzip) and kept in
// memory, with an ETag so a repeat visit gets "304 Not Modified" instead of
// the whole file again.
const COMPRESSIBLE = /\.(html|js|css|svg|json|xml|txt)$/;
const packed = new Map();
function sendStatic(req, res, file, headers) {
  // A symlink inside a public folder must never reach outside the site.
  try { if (!fs.realpathSync(file).startsWith(ROOT_REAL + path.sep)) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; } }
  catch { /* missing: the stat below answers 404 */ }
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
  const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  headers.ETag = etag;
  headers["Last-Modified"] = st.mtime.toUTCString();
  const compressible = COMPRESSIBLE.test(file) && st.size > 1024;
  if (compressible) headers.Vary = "Accept-Encoding";
  if (etagMatches(req.headers["if-none-match"], etag)) { res.writeHead(304, headers).end(); return; }
  const accept = String(req.headers["accept-encoding"] || "");
  const enc = compressible ? (/\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null) : null;
  let body;
  if (enc) {
    let hit = packed.get(`${file}|${enc}`);
    if (hit?.etag !== etag) {
      const raw = fs.readFileSync(file);
      hit = { etag, body: enc === "br" ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : zlib.gzipSync(raw, { level: 9 }) };
      packed.set(`${file}|${enc}`, hit);
    }
    body = hit.body;
    headers["Content-Encoding"] = enc;
  } else body = fs.readFileSync(file);
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers).end(req.method === "HEAD" ? undefined : body);
}

const YEBENTE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.blink.sv https://api.coinbase.com https://open.er-api.com https://bitcoin.co.ke; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function publicUrl(req) {
  // On the live server a visitor's Host headers must never decide the URL's
  // host: routing only needs the path, and self-referral filtering uses our own
  // host. Only a developer's machine trusts the request's headers.
  if (SERVER) {
    const host = (process.env.SITE_URL || "https://altradits.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim() || "altradits.com";
    return new URL(req.url, `https://${host}`);
  }
  const proto = (req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  return new URL(req.url, `${proto}://${host}`);
}

// Addresses of the old task orders (the agency moved to altradits/chouMi).
const OLD_ORDERS = "bio captions schedule graphics reel newsletter blog product-copy try data-entry pdf-sheet sheet-cleanup slides sop inbox-cleanup meeting-notes invoices receipts job-post cv-screen booking trip subscriptions rsvp leads cold-email reply-templates faq reviews listings competitors suppliers email-signature site-fix google-profile business-email automation transcribe translate social-management content-writing short-video inbox-calendar data-docs bookkeeping-prep project-coordination hr-recruiting travel-life executive-assist events customer-support lead-generation ecommerce-ops host-assist research website store-payments automation-ai translation lite core partner".split(" ");

const server = http.createServer(async (req, res) => {
  const url = publicUrl(req);
  try {
    if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); dueJobs(); return; }
    // /api/<name>; only Ye₿ente's API takes a sub-path (/api/yebente/mpesa/stkpush…).
    const api = url.pathname.match(/^\/api\/([a-z]+)(\/[\w.\/-]+)?$/);
    if (api && api[2] && api[1] !== "yebente") { res.writeHead(404).end("Not found"); return; }
    if (api) {
      const file = path.join(ROOT, "api", `${api[1]}.js`);
      if (!fs.existsSync(file)) { res.writeHead(404).end("Not found"); return; }
      const handler = (await import(file))[req.method];
      if (!handler) { res.writeHead(405).end("Method not allowed"); return; }
      const chunks = [];
      let size = 0;
      // Posted pictures (custom calendar posts) run to ~700 KB, but only a
      // request already carrying the admin token may buffer ~1 MB; the 413
      // loop below holds everyone else at 100 KB.
      const limit = api[1] === "admin" && adminAuthed(req.headers.authorization) ? 1_000_000 : 100_000;
      for await (const c of req) { size += c.length; if (size > limit) { res.writeHead(413, { "Content-Type": "application/json" }).end('{"error":"That file is too large."}'); return; } chunks.push(c); }
      const request = new Request(url, {
        method: req.method, headers: { ...req.headers, "x-remote-addr": req.socket.remoteAddress || "" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const response = await handler(request);
      // Security watch (lib/attacks.js): what was turned away, recorded after the reply is decided.
      const kind = response.status === 429 ? "rate_limited"
        : response.status === 401 && api[1] === "admin" ? "admin_token_guess"
        : (response.status === 403 && (api[1] === "deploy" || /^\/mpesa\/callback\//.test(api[2] || ""))) ? "secret_guess" : null;
      if (kind) {
        const where = `${req.method} ${url.pathname.replace(/(\/mpesa\/callback\/).*/, "$1…")}`; // never the path secret, never the query
        import("./lib/attacks.js").then((a) => a.recordAttack(kind, { where, ip: clientIp(request) })).catch(() => {});
      }
      res.writeHead(response.status, { ...SECURITY, ...Object.fromEntries(response.headers) });
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    // Static content answers only GET and HEAD; state changes live under /api/.
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end("Method not allowed"); return; }
    // handle@altradits.com: Lightning address lookups go to Ye₿ente's wallets.
    const lnaddr = url.pathname.match(/^\/\.well-known\/lnurlp\/([a-z0-9._-]{3,20})$/i);
    if (lnaddr && req.method === "GET") {
      const { GET } = await import("./api/yebente.js");
      const r = await GET(new Request(new URL(`/api/yebente/lnurlp/${lnaddr[1].toLowerCase()}`, url), { headers: { ...req.headers, "x-remote-addr": req.socket.remoteAddress || "" } }));
      res.writeHead(r.status, { ...SECURITY, ...Object.fromEntries(r.headers) }).end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    // Clean addresses: /library, /journey… for pages. Old *.html addresses
    // redirect to the clean ones; pages that sold tasks and kits (the agency
    // moved to altradits/chouMi) redirect to their nearest page here.
    const GONE = { cv: "journey", products: "library", templates: "library", va: "", hunt: "", join: "", team: "", portal: "", proposal: "", collect: "", hourly: "", "bitcoin-setup": "bitcoin", lightning: "bitcoin", wallet: "",
      // Old order links (one per task), shared in posts and emails: home.
      ...Object.fromEntries(OLD_ORDERS.map((s) => [s, ""])) };
    const old = url.pathname.match(/^\/([a-z-]+)(?:\.html|\/)?$/);
    if (old && req.method === "GET" && old[1] in GONE) { res.writeHead(301, { Location: `/${GONE[old[1]]}` }).end(); return; }
    if (/^\/(?:r|h)\/[a-z0-9]{4,12}\/?$/.test(url.pathname) && req.method === "GET") { res.writeHead(301, { Location: "/" }).end(); return; }
    const oldPage = url.pathname.match(/^\/(journey|library|players|friends|plan|tracker|admin|donate|bitcoin|bitcoin-core|contact|receipt)\.html$/);
    if (oldPage && req.method === "GET") { res.writeHead(301, { Location: `/${oldPage[1]}${url.search}` }).end(); return; }
    const page = url.pathname.match(/^\/(journey|library|players|friends|plan|tracker|admin|donate|bitcoin|bitcoin-core|contact|receipt)\/?$/);
    // Ye₿ente: the built app in yebente/app, served at /yebente.
    const yb = url.pathname.match(/^\/yebente(?:\/(?:index\.html)?)?$/) ? "/yebente/app/index.html" : url.pathname.match(/^\/yebente\/(manifest\.webmanifest|(?:assets|fonts|icons)\/[\w.-]+)$/)?.[1];
    const rel = yb ? (yb.startsWith("/") ? yb : `/yebente/app/${yb}`) : page ? `/${page[1]}.html` : url.pathname === "/" ? "/index.html" : url.pathname;
    if (!PUBLIC.test(rel)) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    const file = path.join(ROOT, rel);
    const headers = { ...SECURITY, "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" };
    if (rel === "/admin.html") Object.assign(headers, { "X-Robots-Tag": "noindex", "Content-Security-Policy": cspFor(file) });
    // Ye₿ente: the same policy as yebente/public/.htaccess (Apache serves it in production).
    if (rel === "/yebente/app/index.html") Object.assign(headers, { "Content-Security-Policy": YEBENTE_CSP, "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(self), microphone=(), geolocation=()" });
    // Font files never change under the same name: keep them a year.
    headers["Cache-Control"] = rel.endsWith(".woff2") || rel.startsWith("/yebente/app/assets/") ? "public, max-age=31536000, immutable" : rel.startsWith("/assets/") || rel.startsWith("/yebente/app/fonts/") || rel.startsWith("/yebente/app/icons/") ? "public, max-age=86400" : "no-cache";
    if (rel.endsWith(".html")) import("./lib/visits.js").then((v) => v.recordVisit(req, url, rel)).catch(() => {});
    sendStatic(req, res, file, headers);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end("Server error");
  }
});
server.listen(PORT, () => console.log(`Altradits running on port ${PORT}${PROD ? "" : `: http://localhost:${PORT}  (admin: /admin)`}`));

// Daily, after 06:00 UTC: backup, clean-up and Stan's report to Stanley. The deploy cron pings /healthz
// every 5 minutes, which keeps this process (and timer) alive.
async function maybeRunDaily() {
  if (new Date().getUTCHours() < 6) return;
  const { claimDaily } = await import("./lib/jobs.js");
  if (!(await claimDaily())) return; // one run a day, however many pings arrive
  const { backupNow } = await import("./lib/backup.js");
  console.log("daily backup", await backupNow().catch((e) => `failed: ${e.message}`));
  const { autoClean } = await import("./lib/cleanup.js");
  console.log("daily clean-up", await autoClean().catch((e) => `failed: ${e.message}`));
  await import("./lib/tracker.js").then((t) => t.tracker()).catch((e) => console.error("tracker", e.message)); // fresh for Stan's report
  const { sendStanReport } = await import("./lib/stan.js");
  console.log("Stan's report", await sendStanReport().then((r) => r.status).catch((e) => `failed: ${e.message}`));
}
setInterval(() => maybeRunDaily().catch((e) => console.error("daily", e)), 10 * 60 * 1000).unref();
// Hourly, once the node is connected: channel alerts, and whether the node can
// pay every Ye₿ente wallet. The last run is kept in the store, so a restarted
// app neither skips nor repeats it.
async function maybeRunHourly() {
  const { claimHourly } = await import("./lib/jobs.js");
  if (!(await claimHourly())) return; // one run an hour, however many pings arrive
  if (process.env.LND_REST_URL) {
    import("./lib/channels.js").then((c) => c.watchChannels()).catch((e) => console.error("channels", e.message));
    import("./lib/attacks.js").then((a) => a.checkSolvency()).catch((e) => console.error("solvency", e.message));
  }
  import("./lib/bounces.js").then((b) => b.checkBounces()).then((r) => r.bounced && console.log("bounces", r)).catch((e) => console.error("bounces", e.message));
}
setInterval(() => maybeRunHourly().catch((e) => console.error("hourly", e)), 10 * 60 * 1000).unref();
// Ye₿ente wallets: credit invoices paid while the app was closed, and flip email
// changes whose 48 hours are up (every 2 minutes). The email flip needs no node.
setInterval(() => {
  if (!["on", "true", "yes", "1"].includes(String(process.env.YEBENTE_WALLETS || "").trim().replace(/^["']|["']$/g, "").toLowerCase())) return;
  import("./lib/ywallet.js").then((y) => y.effectiveEmailChanges()).catch((e) => console.error("yebente email changes", e.message));
  if (process.env.LND_REST_URL) import("./lib/ywallet.js").then((y) => Promise.all([y.settleOpen(), y.reconcilePayments()])).catch((e) => console.error("yebente settle", e.message));
}, 2 * 60 * 1000).unref();
// Every 5 minutes (and on every /healthz ping from deploy/cron.sh): Deadman's
// Switch file/.htaccess integrity check and node total balance check.
async function maybeRunDeadmanChecks() {
  const { runDeadmanChecks } = await import("./lib/deadman.js");
  await runDeadmanChecks({ rootDir: ROOT });
}
setInterval(() => maybeRunDeadmanChecks().catch((e) => console.error("deadman check", e)), 5 * 60 * 1000).unref();

// Once, after the agency moved to altradits/chouMi: its records (test orders
// included) are archived to one owner-only file, then removed from the store.
if (SERVER) setTimeout(() => import("./lib/cleanup.js").then((c) => c.retireAgency()).then((r) => !r.already && console.log("agency records retired", r)).catch((e) => console.error("retire", e.message)), 30 * 1000).unref();

// The host stops an idle app, so the 10-minute timers alone can miss a day.
// Every /healthz ping (the deploy cron, every 5 minutes) also runs what's due.
let checking = false;
function dueJobs() {
  if (checking) return;
  checking = true;
  Promise.allSettled([maybeRunDaily(), maybeRunHourly(), maybeRunDeadmanChecks()]).then((r) => r.forEach((x) => x.status === "rejected" && console.error("due jobs", x.reason))).finally(() => { checking = false; });
}
