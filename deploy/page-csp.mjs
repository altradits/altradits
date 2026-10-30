// Writes each page's Content-Security-Policy into the page itself.
// In production nginx sends .html files straight from disk, so header rules
// (Apache's or Node's) never reach them: the policy has to live in the page.
// Only our own scripts run, plus each page's inline script by its hash; no
// other site is called, framed or posted to.
//
//   node deploy/page-csp.mjs          rewrite the tags (after editing a page's inline script)
//   node deploy/page-csp.mjs --check  fail if any page's tag is missing or stale (npm test runs this)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const TAG = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n?/;

export function pagePolicy(html) {
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
  return [`default-src 'self'`, `script-src 'self'${hashes.length ? ` ${hashes.join(" ")}` : ""}`, `style-src 'self' 'unsafe-inline'`, `font-src 'self'`,
    `img-src 'self' data: https:`, ...(/<iframe\b/i.test(html) ? [`frame-src 'self' blob:`] : []), `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`].join("; ");
}

export function withPolicy(html) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${pagePolicy(html)}">\n`;
  if (TAG.test(html)) return html.replace(TAG, tag);
  const at = html.search(/<meta name="viewport"[^>]*>\n?/i);
  if (at < 0) throw new Error("no viewport meta to place the policy after");
  const end = html.indexOf(">", at) + 1;
  const nl = html[end] === "\n" ? 1 : 0;
  return html.slice(0, end + nl) + tag + html.slice(end + nl);
}

export const pages = () => fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const f of pages()) {
    const file = path.join(ROOT, f), html = fs.readFileSync(file, "utf8"), next = withPolicy(html);
    if (next === html) continue;
    stale.push(f);
    if (!check) fs.writeFileSync(file, next);
  }
  if (check && stale.length) { console.error(`Page policy missing or stale: ${stale.join(", ")}. Run: node deploy/page-csp.mjs`); process.exit(1); }
  console.log(stale.length ? `Updated: ${stale.join(", ")}` : "Every page's policy is current.");
}
