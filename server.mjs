// The whole site in one Node process: static pages + api/*.js handlers.
// Production: HostAfrica "Setup Node.js App" (Passenger) starts it via app.cjs.
// Local:      npm run dev, then open http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

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
if (!PROD) {
  for (const k of ["ADMIN_TOKEN", "CRON_SECRET"]) {
    if (!process.env[k]) { process.env[k] = "dev"; console.log(`${k} not set: using "dev" locally`); }
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain" };
// Only these paths are ever served: never .git, .env, lib/, data files.
const PUBLIC = /^\/(index\.html|admin\.html|proposal\.html|portal\.html|team\.html|join\.html|cv\.html|robots\.txt|data\/(?:catalog|playbooks)\.js|assets\/[\w.-]+|\.well-known\/acme-challenge\/[\w-]+)$/;
const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN" };

function publicUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  return new URL(req.url, `${proto}://${host}`);
}

const server = http.createServer(async (req, res) => {
  const url = publicUrl(req);
  try {
    if (url.pathname === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); import("./lib/workers.js").then((w) => w.kickQueue()).catch(() => {}); return; }
    const api = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (api) {
      const file = path.join(ROOT, "api", `${api[1]}.js`);
      if (!fs.existsSync(file)) { res.writeHead(404).end("Not found"); return; }
      const handler = (await import(file))[req.method];
      if (!handler) { res.writeHead(405).end("Method not allowed"); return; }
      const chunks = [];
      let size = 0;
      // CV uploads (admin only) need room; everything else stays small.
      const limit = api[1] === "admin" ? 8_000_000 : 100_000;
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
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!PUBLIC.test(rel)) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    const file = path.join(ROOT, rel);
    const headers = { ...SECURITY, "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" };
    if (/^\/(admin|proposal|portal|team)\.html$/.test(rel)) headers["X-Robots-Tag"] = "noindex";
    headers["Cache-Control"] = rel.startsWith("/assets/") ? "public, max-age=86400" : "no-cache";
    fs.createReadStream(file)
      .on("open", () => res.writeHead(200, headers))
      .on("error", () => { if (!res.headersSent) res.writeHead(404).end("Not found"); else res.end(); })
      .pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end("Server error");
  }
});
server.listen(PORT, () => console.log(`Altradits running on port ${PORT}${PROD ? "" : `: http://localhost:${PORT}  (admin: /admin.html)`}`));

// The follow-up agent: once a day, after 06:00 UTC. The deploy cron pings
// /healthz every 5 minutes, which keeps this process (and timer) alive.
async function maybeRunDaily() {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl || new Date().getUTCHours() < 6) return;
  const { getJSON, setJSON } = await import("./lib/store.js");
  const today = new Date().toISOString().slice(0, 10);
  if ((await getJSON("daily:last")) === today) return;
  await setJSON("daily:last", today);
  const { runFollowups } = await import("./lib/followups.js");
  console.log("daily follow-ups", today, await runFollowups(siteUrl.replace(/\/$/, "")));
  const { dailyDiscovery, syncCv } = await import("./lib/career.js");
  console.log("daily CV sync", await syncCv().catch((e) => `failed: ${e.message}`));
  console.log("daily job discovery", await dailyDiscovery().catch((e) => `failed: ${e.message}`));
}
// After each deploy, bring the CV in line with what the site now offers.
setTimeout(() => import("./lib/career.js").then((c) => c.syncCv()).then((r) => console.log("CV sync", r)).catch((e) => console.error("CV sync", e.message)), 60 * 1000).unref();
setInterval(() => maybeRunDaily().catch((e) => console.error("daily", e)), 10 * 60 * 1000).unref();

// The department AI agents work through queued client tasks in the background.
const kick = () => import("./lib/workers.js").then((w) => w.processQueue()).catch((e) => console.error("queue", e));
setInterval(kick, 2 * 60 * 1000).unref();
setTimeout(kick, 5000).unref();
