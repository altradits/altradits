// Page views, counted on our own server: one line per view in
// <data>/visits/YYYY-MM-DD.jsonl with the day, page, referring site and
// utm_source. No IP address, no cookie, no user agent and no third party.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./store.js";

const dir = () => path.join(dataDir(), "visits");
// Public pages only: the admin is never counted.
const PAGES = { "/index.html": "home", "/journey.html": "journey", "/library.html": "library", "/players.html": "players", "/bitcoin.html": "bitcoin", "/wallet.html": "wallet", "/bitcoin-core.html": "bitcoin-core", "/donate.html": "donate", "/yebente/app/index.html": "yebente" };
const BOT = /bot|crawl|spider|slurp|preview|monitor|uptime|curl|wget|python|node-fetch|undici|axios|go-http|headless|lighthouse|facebookexternalhit|whatsapp/i;
const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);

// rel: the file the server is about to send (e.g. "/library.html").
export function recordVisit(req, url, rel) {
  const page = PAGES[rel];
  if (!page || req.method !== "GET" || BOT.test(req.headers["user-agent"] || "x")) return;
  let ref = "";
  try { ref = new URL(req.headers.referer).hostname.replace(/^www\./, ""); } catch { /* none */ }
  if (ref === url.hostname.replace(/^www\./, "")) ref = "";
  const day = new Date().toISOString().slice(0, 10);
  const line = JSON.stringify({ p: page, r: clean(ref), s: clean(url.searchParams.get("utm_source")) }) + "\n";
  fs.promises.mkdir(dir(), { recursive: true, mode: 0o700 })
    .then(() => fs.promises.appendFile(path.join(dir(), `${day}.jsonl`), line, { mode: 0o600 }))
    .catch(() => { /* counting must never break a page */ });
}

// Views per page over the last 7 and 30 days, the top sources and a 14-day line.
export function visitSummary(now = Date.now()) {
  const byPage = {}, sources = {}, daily = [];
  let d7 = 0, d30 = 0;
  for (let i = 0; i < 30; i++) {
    const day = new Date(now - i * 864e5).toISOString().slice(0, 10);
    let lines = [];
    try { lines = fs.readFileSync(path.join(dir(), `${day}.jsonl`), "utf8").split("\n").filter(Boolean); } catch { /* no views that day */ }
    if (i < 14) daily.unshift({ day, views: lines.length });
    for (const l of lines) {
      let v; try { v = JSON.parse(l); } catch { continue; }
      const p = (byPage[v.p] ||= { d7: 0, d30: 0 });
      p.d30++; d30++;
      if (i < 7) { p.d7++; d7++; }
      const src = v.s || v.r || "direct";
      sources[src] = (sources[src] || 0) + 1;
    }
  }
  const top = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([source, views]) => ({ source, views }));
  return { d7, d30, byPage, sources: top, daily };
}
