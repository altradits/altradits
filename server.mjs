// The whole site in one Node process: static pages + api/*.js handlers.
// Production: HostAfrica "Setup Node.js App" (Passenger) starts it via app.cjs.
// Local:      npm run dev, then open http://localhost:3000
import { safeEqual } from "./lib/http.js";
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === "production";

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
  for (const k of ["ADMIN_TOKEN", "CRON_SECRET"]) {
    if (!process.env[k]) { process.env[k] = "dev"; console.log(`${k} not set: using "dev" locally`); }
  }
} else {
  for (const k of ["ADMIN_TOKEN", "SITE_URL"]) if (!process.env[k]) console.error(`${k} is not set: ${k === "ADMIN_TOKEN" ? "the admin stays locked" : "links use https://altradits.com"}. Set it in DirectAdmin → Setup Node.js App.`);
  if (process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length < 24) console.error("ADMIN_TOKEN is short: use a long random one (openssl rand -hex 32).");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml; charset=utf-8", ".woff2": "font/woff2", ".ttf": "font/ttf" };
// Only these paths are ever served: never .git, .env, lib/, data files.
const PUBLIC = /^\/(index\.html|admin\.html|proposal\.html|portal\.html|team\.html|join\.html|cv\.html|hunt\.html|templates\.html|donate\.html|va\.html|bitcoin\.html|products\.html|collect\.html|robots\.txt|sitemap\.xml|yebente\/app\/(?:index\.html|assets\/[\w.-]+|fonts\/[\w.-]+)|data\/(?:catalog|playbooks|community)\.js|assets\/[\w.-]+|\.well-known\/acme-challenge\/[\w-]+)$/;
const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN" };

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
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
  const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  headers.ETag = etag;
  headers["Last-Modified"] = st.mtime.toUTCString();
  const compressible = COMPRESSIBLE.test(file) && st.size > 1024;
  if (compressible) headers.Vary = "Accept-Encoding";
  if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(etag)) { res.writeHead(304, headers).end(); return; }
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

const YEBENTE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function publicUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  return new URL(req.url, `${proto}://${host}`);
}

const server = http.createServer(async (req, res) => {
  const url = publicUrl(req);
  try {
    if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); import("./lib/workers.js").then((w) => w.kickQueue()).catch(() => {}); marketing(); dueJobs(); return; }
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
      // CV uploads (admin only) need room, so only a request carrying the right
      // admin token may send 8 MB; everything else stays small.
      const isAdmin = api[1] === "admin" && Boolean(process.env.ADMIN_TOKEN) && safeEqual(process.env.ADMIN_TOKEN, String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
      const limit = isAdmin ? 8_000_000 : 100_000;
      for await (const c of req) { size += c.length; if (size > limit) { res.writeHead(413, { "Content-Type": "application/json" }).end('{"error":"That file is too large."}'); return; } chunks.push(c); }
      const request = new Request(url, {
        method: req.method, headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const response = await handler(request);
      res.writeHead(response.status, { ...SECURITY, ...Object.fromEntries(response.headers) });
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    // handle@altradits.com: Lightning address lookups go to Ye₿ente's wallets.
    const lnaddr = url.pathname.match(/^\/\.well-known\/lnurlp\/([a-z0-9._-]{3,20})$/i);
    if (lnaddr && req.method === "GET") {
      const { GET } = await import("./api/yebente.js");
      const r = await GET(new Request(new URL(`/api/yebente/lnurlp/${lnaddr[1].toLowerCase()}`, url), { headers: req.headers }));
      res.writeHead(r.status, { ...SECURITY, ...Object.fromEntries(r.headers) }).end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    // Clean addresses: /templates, /hunt, /cv… for pages; /<job> (e.g. /hourly,
    // /inbox-cleanup), /r/<ref> and /h/<hunt code> open the homepage, which reads
    // the path. Old *.html addresses redirect to the clean ones.
    const old = url.pathname.match(/^\/(templates|hunt|cv|join|team|portal|proposal|admin|donate|va|bitcoin|products|collect)\.html$/);
    if (old && req.method === "GET") { res.writeHead(301, { Location: `/${old[1] === "templates" ? "products" : old[1]}${url.search}` }).end(); return; }
    // The free kits now live under Products.
    if (/^\/templates\/?$/.test(url.pathname) && req.method === "GET") { res.writeHead(301, { Location: `/products${url.search}` }).end(); return; }
    const page = url.pathname.match(/^\/(hunt|cv|join|team|portal|proposal|admin|donate|va|bitcoin|products|collect)\/?$/);
    const { idForSlug } = await import("./data/catalog.js");
    // /<job> opens that order on the VA page; /r/<ref> and /h/<code> land on the homepage.
    const order = idForSlug(url.pathname.slice(1).replace(/\/$/, ""));
    const home = /^\/(?:r|h)\/[a-z0-9]{4,12}\/?$/.test(url.pathname);
    // Ye₿ente: the built app in yebente/app, served at /yebente.
    const yb = url.pathname.match(/^\/yebente(?:\/(?:index\.html)?)?$/) ? "/yebente/app/index.html" : url.pathname.match(/^\/yebente\/((?:assets|fonts)\/[\w.-]+)$/)?.[1];
    const rel = yb ? (yb.startsWith("/") ? yb : `/yebente/app/${yb}`) : page ? `/${page[1]}.html` : order ? "/va.html" : url.pathname === "/" || home ? "/index.html" : url.pathname;
    if (!PUBLIC.test(rel)) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    const file = path.join(ROOT, rel);
    const headers = { ...SECURITY, "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" };
    if (/^\/(admin|proposal|portal|team|collect)\.html$/.test(rel)) headers["X-Robots-Tag"] = "noindex";
    if (/^\/(admin|portal|collect|proposal|team)\.html$/.test(rel)) headers["Content-Security-Policy"] = cspFor(file);
    // Ye₿ente: the same policy as yebente/public/.htaccess (Apache serves it in production).
    if (rel === "/yebente/app/index.html") Object.assign(headers, { "Content-Security-Policy": YEBENTE_CSP, "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" });
    // Font files never change under the same name: keep them a year.
    headers["Cache-Control"] = rel.endsWith(".woff2") || rel.startsWith("/yebente/app/assets/") ? "public, max-age=31536000, immutable" : rel.startsWith("/assets/") || rel.startsWith("/yebente/app/fonts/") ? "public, max-age=86400" : "no-cache";
    if (rel.endsWith(".html")) import("./lib/visits.js").then((v) => v.recordVisit(req, url, rel)).catch(() => {});
    sendStatic(req, res, file, headers);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end("Server error");
  }
});
server.listen(PORT, () => console.log(`Altradits running on port ${PORT}${PROD ? "" : `: http://localhost:${PORT}  (admin: /admin)`}`));

// The follow-up agent: once a day, after 06:00 UTC. The deploy cron pings
// /healthz every 5 minutes, which keeps this process (and timer) alive.
async function maybeRunDaily() {
  // On the server the daily jobs (backup, clean-up, follow-ups) always run.
  const siteUrl = process.env.SITE_URL || (SERVER ? "https://altradits.com" : null);
  if (!siteUrl || new Date().getUTCHours() < 6) return;
  const { getJSON, setJSON } = await import("./lib/store.js");
  const today = new Date().toISOString().slice(0, 10);
  if ((await getJSON("daily:last")) === today) return;
  await setJSON("daily:last", today);
  const { runFollowups } = await import("./lib/followups.js");
  console.log("daily follow-ups", today, await runFollowups(siteUrl.replace(/\/$/, "")));
  const { backupNow } = await import("./lib/backup.js");
  console.log("daily backup", await backupNow().catch((e) => `failed: ${e.message}`));
  const { autoClean } = await import("./lib/cleanup.js");
  console.log("daily clean-up", await autoClean().catch((e) => `failed: ${e.message}`));
  const { runNurture } = await import("./lib/subscribers.js");
  console.log("free-kit follow-ups", await runNurture().catch((e) => `failed: ${e.message}`));
  const { dailyDiscovery, syncCv } = await import("./lib/career.js");
  console.log("daily CV sync", await syncCv().catch((e) => `failed: ${e.message}`));
  console.log("daily job discovery", await dailyDiscovery().catch((e) => `failed: ${e.message}`));
  const { runLearningCadence } = await import("./lib/learning.js");
  console.log("daily learning cadence", await runLearningCadence().catch((e) => `failed: ${e.message}`));
}
// After each deploy, bring the CV in line with what the site now offers.
setTimeout(() => import("./lib/career.js").then((c) => c.syncCv()).then((r) => console.log("CV sync", r)).catch((e) => console.error("CV sync", e.message)), 60 * 1000).unref();
setInterval(() => maybeRunDaily().catch((e) => console.error("daily", e)), 10 * 60 * 1000).unref();
// Hourly: Lightning channel alerts and held payments (once the node is
// connected), and bounced emails marked in the admin log. The last run is kept
// in the store, so a restarted app neither skips nor repeats it.
async function maybeRunHourly() {
  const { getJSON, setJSON } = await import("./lib/store.js");
  const last = await getJSON("hourly:last");
  if (last && Date.now() - Date.parse(last) < 3600e3) return;
  await setJSON("hourly:last", new Date().toISOString());
  if (process.env.LND_REST_URL) {
    import("./lib/channels.js").then((c) => c.watchChannels()).catch((e) => console.error("channels", e.message));
    import("./lib/finance.js").then((f) => f.checkHeld()).then((r) => r.confirmed && console.log("moved to node", r)).catch((e) => console.error("held", e.message));
  }
  import("./lib/bounces.js").then((b) => b.checkBounces()).then((r) => r.bounced && console.log("bounces", r)).catch((e) => console.error("bounces", e.message));
}
setInterval(() => maybeRunHourly().catch((e) => console.error("hourly", e)), 10 * 60 * 1000).unref();
// Ye₿ente wallets: credit invoices paid while the app was closed (every 2 minutes).
setInterval(() => { if (["on", "true", "yes", "1"].includes(String(process.env.YEBENTE_WALLETS || "").trim().replace(/^["']|["']$/g, "").toLowerCase()) && process.env.LND_REST_URL) import("./lib/ywallet.js").then((y) => Promise.all([y.settleOpen(), y.reconcilePayments()])).catch((e) => console.error("yebente settle", e.message)); }, 2 * 60 * 1000).unref();

// The host stops an idle app, so the 10-minute timers alone can miss a day.
// Every /healthz ping (the deploy cron, every 5 minutes) also runs what's due.
let checking = false;
function dueJobs() {
  if (checking) return;
  checking = true;
  Promise.allSettled([maybeRunDaily(), maybeRunHourly()]).then((r) => r.forEach((x) => x.status === "rejected" && console.error("due jobs", x.reason))).finally(() => { checking = false; });
}

// The marketing team: plans the day's posts and publishes each at its slot.
// Also nudged by /healthz (a scheduled GitHub Action wakes the app at slot times).
const marketing = () => import("./lib/marketing.js").then((m) => m.marketingTick()).then((r) => r.posted?.length && console.log("marketing", r)).catch((e) => console.error("marketing", e.message));
setInterval(marketing, 5 * 60 * 1000).unref();

// The department AI agents work through queued client tasks in the background.
const kick = () => import("./lib/workers.js").then((w) => w.processQueue()).catch((e) => console.error("queue", e));
setInterval(kick, 2 * 60 * 1000).unref();
setTimeout(kick, 5000).unref();
