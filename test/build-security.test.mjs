// Build-stage security guard: the rules learned in the October 2026 audit,
// checked on every test run (and in CI on every pull request), so a change
// can't quietly reopen a hole. A failure here names the rule and the fix.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const files = (dir, ext = /\.(m?js)$/) => fs.readdirSync(path.join(root, dir)).filter((f) => ext.test(f)).map((f) => `${dir}/${f}`);
const SERVER = [...files("lib"), ...files("api"), "server.mjs"];

test("every page carries its own up-to-date Content-Security-Policy (nginx sends pages without headers)", async () => {
  const { pages, withPolicy } = await import("../deploy/page-csp.mjs");
  for (const f of pages()) {
    const html = read(f);
    assert.equal(withPolicy(html), html, `${f}: policy missing or stale. Run: node deploy/page-csp.mjs`);
  }
  const yb = read("yebente/app/index.html");
  assert.match(yb, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/, "Ye₿ente's built page keeps its policy (rebuild: cd yebente && npm run build)");
  assert.match(read("yebente/src/main.tsx"), /window\.top !== window\.self/, "Ye₿ente refuses to load inside a frame");
});

test("every page refuses to load inside another site's frame (a meta policy can't forbid framing)", () => {
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html"))) {
    const html = read(f), srcs = [...html.matchAll(/<script[^>]*\bsrc="\/(assets\/[\w.-]+\.js)(?:\?[\w=.-]*)?"/g)].map((m) => read(m[1])).join("\n");
    assert.match(html + srcs, /window\.top !== window\.self/, `${f}: add the frame check at the top of its script`);
    assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, `${f}: the Security watch reporter is missing (run: node deploy/page-csp.mjs)`);
  }
});

test("pages have no inline event handlers or javascript: links (the policy would block them, and they invite injection)", () => {
  for (const f of [...fs.readdirSync(root).filter((x) => x.endsWith(".html")), "yebente/app/index.html"]) {
    const html = read(f);
    assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=\s*["']/i, `${f}: move the inline handler into the page script`);
    assert.doesNotMatch(html, /href\s*=\s*["']\s*javascript:/i, `${f}: no javascript: links`);
  }
});

// Direct fetch() calls in server code, each to a fixed, configured service. Anything a
// visitor or an outside reply can point somewhere goes through lib/netsafe.js publicFetch
// (public IPs only, checked at connect time). A new fetch() here fails until it is
// either moved to publicFetch or reviewed and added with its reason.
const FIXED_FETCH = {
  "lib/store.js": ["REST_URL"], // Upstash, from the environment
  "lib/lightning.js": ["url", '"https://open.er-api.com/v6/latest/USD"', "`${base}/fee-estimates`", "`${base}/v1/fees/recommended`", "`${base}/address/${address}`", "`${base}/address/${address}/txs`", "`${base}/blocks/tip/height`"], // price and mempool APIs (CHAIN_APIS)
  "lib/email.js": ['"https://api.resend.com/emails"'],
  "lib/tracker.js": ["`https://api.github.com${path}`"], // GitHub's public API, a constant host
  "api/yebente.js": ["`${DARAJA()}/oauth/v1/generate?grant_type=client_credentials`", "`${DARAJA()}${path}`"], // Safaricom
  "lib/pesapal.js": ["`${BASE()}/api/Auth/RequestToken`", "`${BASE()}/api/Transactions/SubmitOrderRequest`", "`${BASE()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`"], // Pesapal, sandbox or live by setting
};
// The first argument of a call, brackets and template braces balanced.
function firstArg(src, i) {
  let depth = 0, out = "";
  for (; i < src.length; i++) {
    const c = src[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (c === "," && depth === 0) break;
    out += c;
  }
  return out.trim();
}
test("server code only fetches fixed services directly; everything else uses the public-address guard", () => {
  for (const f of SERVER) {
    if (f === "lib/netsafe.js") continue;
    const src = read(f).replace(/^\s*\/\/.*$/gm, "");
    const calls = [...src.matchAll(/(?<![\w.])fetch\(/g)].map((m) => firstArg(src, m.index + m[0].length));
    for (const arg of calls) assert.ok((FIXED_FETCH[f] || []).includes(arg), `${f}: fetch(${arg}) — use publicFetch from lib/netsafe.js for any address others can influence, or add it to FIXED_FETCH with its reason`);
  }
});

// Public endpoints are rate-limited. These are the reviewed exceptions.
const NO_LIMIT_OK = {};
test("every public API file has rate limits (or a reviewed reason)", () => {
  for (const f of files("api")) {
    if (NO_LIMIT_OK[f]) continue;
    assert.match(read(f), /\b(hit|peek)\(/, `${f}: add per-visitor and site-wide limits with hit() from lib/store.js`);
  }
});

test("secrets are never logged, compared with ===, or made with Math.random", () => {
  const SECRET = /process\.env\.[A-Z_]*(TOKEN|SECRET|KEY|MACAROON|PASS|PASSWORD)\b/;
  for (const f of SERVER) {
    const lines = read(f).split("\n");
    lines.forEach((l, i) => {
      const logged = l.match(/console\.(?:log|error|warn|info)\((.*)$/)?.[1];
      if (logged) assert.doesNotMatch(logged, SECRET, `${f}:${i + 1} logs a secret`);
      assert.doesNotMatch(l, /(===|!==)\s*process\.env\.[A-Z_]*(TOKEN|SECRET)\b|process\.env\.[A-Z_]*(TOKEN|SECRET)\s*(===|!==)/, `${f}:${i + 1}: compare secrets with safeEqual (constant time)`);
      assert.doesNotMatch(l, /Math\.random\(/, `${f}:${i + 1}: use node:crypto for anything random on the server`);
    });
  }
});

test("money: a Lightning payment is refunded only on the node's own final answer", () => {
  const ln = read("lib/lightning.js");
  const pay = ln.slice(ln.indexOf("export async function payInvoice"), ln.indexOf("// What the node can send right now"));
  const failed = [...pay.matchAll(/status: "failed"/g)].length;
  assert.equal(failed, 2, "payInvoice: \"failed\" only when sending is off or the node says FAILED; every other answer is \"unknown\"");
  assert.match(pay, /p\.status === "FAILED"\) return \{ status: "failed"/);
  const yw = read("lib/ywallet.js");
  assert.match(yw, /if \(Date\.now\(\) - Date\.parse\(p\.at\) < SETTLE_AFTER\) continue;/, "reconcilePayments leaves payments that may still be on their way alone");
});

test("Bitcoin-history guards stay in place (confirmations by amount, 21M cap, description hash, solvency)", () => {
  const ln = read("lib/lightning.js"), yw = read("lib/ywallet.js"), srv = read("server.mjs");
  assert.match(ln, /export const confirmationsFor = \(sats\) => \(sats >= 10_000_000 \? 6 : sats >= 1_000_000 \? 3 : 1\)/, "confirmation tiers (whitepaper section 11)");
  assert.match(ln, /num_confirmations\) >= depth/, "the node's own record must be as deep as the amount requires");
  assert.match(yw, /sats > MAX_MONEY\) throw err\("That amount isn't possible\."\)/, "credits capped at 21 million BTC");
  assert.match(yw, /bolt11DescriptionHash\(pr\)/, "LNURL invoices must match the description hash");
  assert.match(srv, /checkSolvency\(\)/, "the hourly solvency check runs");
});

test("access: no code joins records or hands over a portal on an unconfirmed email", () => {
  for (const f of SERVER) {
    const src = read(f);
    assert.doesNotMatch(src, /portalToken\s*=\s*(prior|other|existing|match)\w*\.portalToken/, `${f}: a portal link goes only to its owner`);
    assert.doesNotMatch(src, /\.leadId\s*=\s*lead\.id;[\s\S]{0,80}mergedInto/, `${f}: records are merged by Stanley in the admin, not on a typed email`);
  }
});

test("tests never load project modules before moving into their temporary folder", () => {
  // Static imports run before any statement, so they would open the repository's own .data store.
  for (const f of fs.readdirSync(path.join(root, "test")).filter((x) => x.endsWith(".test.mjs"))) {
    const src = read(`test/${f}`);
    if (!/process\.chdir\(/.test(src)) continue;
    assert.doesNotMatch(src, /^import\s[^;]*from\s+["']\.\.\/(lib|api|data)\//m, `test/${f}: import project modules with await import() after process.chdir()`);
  }
});

test("every Markdown file at the top level is denied to the web server", () => {
  const deny = read(".htaccess").match(/<FilesMatch "\^\(([^"]+)\)\$">/)[1];
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".md")))
    assert.ok(new RegExp(`^(${deny})$`).test(f), `${f}: add it to the FilesMatch deny list in .htaccess`);
});

test("signing stays available: the trusted-keys file, the verify script and the server option stay in place", () => {
  assert.match(read(".github/allowed_signers"), /^altradits@gmail\.com namespaces="git" ssh-ed25519 /m, "a trusted signing key");
  assert.match(read("deploy/verify-commits.sh"), /TRUST_ROOT=ba04d09d79a47a959d6c0ef6a2dde7396746adb0/, "the trust root never moves backwards");
  assert.match(read("deploy/cron.sh"), /verify-commits\.sh origin\/main "\$SIGNERS"/, "the server refuses unsigned code");
  assert.match(read("deploy/verify-commits.sh"), /deploy\/verify-sshsig\.mjs" "\$c" "\$SIGNERS"/, "servers with old OpenSSH verify signatures in Node");
  assert.match(read(".github/workflows/test.yml"), /if:\s*github\.event_name == 'push'\s*\n\s*run:\s*sh deploy\/verify-commits\.sh HEAD \.github\/allowed_signers/, "CI verifies signed commits on push to main");
  assert.match(read(".githooks/pre-push"), /force-push/, "the local gate refuses force-pushes to main");
  for (const f of fs.readdirSync(path.join(root, ".github/workflows")).filter((x) => x.endsWith(".yml")))
    assert.doesNotMatch(read(`.github/workflows/${f}`), /\bwrite\b/, `.github/workflows/${f}: no workflow has write access`);
});

test("no AI co-authors: the check runs in CI, before every push and on every commit message", () => {
  assert.match(read(".github/workflows/test.yml"), /sh deploy\/no-ai-coauthor\.sh HEAD/, "CI checks every commit");
  assert.match(read(".github/workflows/test.yml"), /fetch-depth: 0/, "CI sees the whole history");
  assert.match(read(".githooks/pre-push"), /no-ai-coauthor\.sh/, "the local gate checks pushed commits");
  assert.match(read(".githooks/commit-msg"), /no-ai-coauthor\.sh --message/, "the commit-msg hook checks each message");
});

test("every top-level folder is either public on purpose or denied to the web server", () => {
  const PUBLIC = new Set(["assets"]); // pages' own scripts, styles and images
  const DOT = /^\./; // nginx refuses dot-folders (.git, .github, .claude); .htaccess adds 404s
  for (const d of fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name)) {
    if (PUBLIC.has(d) || DOT.test(d) || d === "node_modules" || d === "tmp") continue; // node_modules gets deploy/deny.htaccess on the server
    const ht = path.join(root, d, ".htaccess");
    assert.ok(fs.existsSync(ht) && /Require all denied/.test(fs.readFileSync(ht, "utf8")), `${d}/: add an .htaccess that denies the web server (copy deploy/deny.htaccess), or list it as public here`);
  }
  assert.match(read("deploy/cron.sh"), /deny\.htaccess node_modules\/\.htaccess/, "dependencies stay unservable");
});

test("Meta client talks only to the configured Model API", () => {
  const m = read("lib/meta.js");
  assert.match(m, /https:\/\/api\.meta\.ai\/v1/, "default Model API base");
  assert.match(m, /Authorization.*Bearer/, "Bearer key auth, never in the URL");
  assert.doesNotMatch(m, /httpFetch\(`http/, "every call goes through BASE()");
});

test("AI status names its provider and model", () => {
  assert.match(read("lib/ai.js"), /provider: aiProvider\(\), model: aiModel\(\)/, "aiStatus reports who is thinking");
  assert.doesNotMatch(read("assets/admin.js"), /Anthropic key works/, "the dashboard shows the active provider, not a fixed name");
});

test("no secrets committed: keys, tokens, macaroons or private keys in any tracked file", async () => {
  const { execFileSync } = await import("node:child_process");
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|zip|mp4|mov|webm|m4v)$/i.test(f) && !f.startsWith("yebente/app/assets/"));
  const PATTERNS = [
    ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
    ["Resend key", /\bre_[A-Za-z0-9]{20,}/],
    ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
    ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["LND macaroon", /\b0201036c6e64[0-9a-f]{40,}/i],
    ["Upstash token", /\bA[A-Za-z0-9]{40,}=*\b(?=.*upstash)/i],
  ];
  for (const f of tracked) {
    let text;
    try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    for (const [what, re] of PATTERNS) assert.doesNotMatch(text, re, `${f}: looks like a committed ${what}. Remove it, rotate it, and keep it in the host's settings`);
  }
  assert.ok(!tracked.some((f) => /(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith(".example")), "no .env file is tracked");
});

test("site copy uses no em-dashes (house style: a full stop, comma or colon reads plainer)", () => {
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  const targets = [
    ...fs.readdirSync(root).filter((x) => x.endsWith(".html")),
    "server.mjs",
    ...walk("lib").filter((f) => f.endsWith(".js")),
    ...walk("api").filter((f) => f.endsWith(".js")),
    ...walk("data").filter((f) => f.endsWith(".js")),
    "yebente/index.html",
    ...walk("yebente/src").filter((f) => /\.(tsx?|css)$/.test(f)),
  ];
  for (const f of targets) assert.doesNotMatch(read(f), /—/, `${f}: replace the em-dash with a full stop, comma or colon`);
});

test("visitors reach us through /contact: no hello@ address on public pages", () => {
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html") && x !== "admin.html")) {
    assert.doesNotMatch(read(f), /hello@altradits\.com/, `${f}: link /contact (with ?topic=) instead of the email address`);
  }
  assert.equal((read("admin.html").match(/hello@altradits\.com/g) || []).length, 1, "only the receipt letterhead keeps the business address");
  assert.match(read("llms.txt"), /altradits\.com\/contact/, "llms.txt points at the contact form");
});

test("publicity: money keywords in the homepage title, large-image cards with the wallet screenshot, honest app schema", () => {
  const home = read("index.html");
  for (const w of ["wallet", "bitcoin", "free"]) {
    assert.match(home, new RegExp(`<title>[^<]*${w}`, "i"), `homepage title names ${w}`);
    assert.match(home, new RegExp(`og:title" content="[^"]*${w}`, "i"), `homepage og:title names ${w}`);
  }
  const pages = fs.readdirSync(root).filter((x) => x.endsWith(".html") && x !== "admin.html");
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /og:image" content="https:\/\/altradits\.com\/assets\/social-card\.png"/, `${f}: shares the wallet social card`);
    assert.match(html, /og:image:width" content="1200"/, `${f}: card width declared`);
    assert.match(html, /twitter:card" content="summary_large_image"/, `${f}: large-image card`);
    assert.match(html, /theme-color" content="#EEF2F6"/, `${f}: theme color set`);
  }
  const app = JSON.parse(home.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"SoftwareApplication".*?\})<\/script>/)[1]);
  assert.ok(app.screenshot && app.featureList && app.sameAs.includes("https://github.com/altradits/yebente"), "app schema carries screenshot, featureList and the repo");
  const sm = read("sitemap.xml");
  assert.match(sm, /<loc>https:\/\/altradits\.com\/yebente<\/loc>/, "sitemap lists the wallet");
  for (const loc of [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])) {
    assert.match(sm, new RegExp(`<loc>${loc}<\\/loc><lastmod>20\\d\\d-\\d\\d-\\d\\d<\\/lastmod>`), `sitemap dates ${loc}`);
  }
  const llms = read("llms.txt");
  assert.match(llms, /yebente#create/, "llms.txt points AI answers at wallet creation");
});

test("Ye₿ente installs as an app: manifest linked and served with icons on both stacks", () => {
  const head = read("yebente/index.html");
  assert.match(head, /rel="manifest" href="\/yebente\/manifest\.webmanifest"/, "app links its manifest");
  assert.match(head, /theme-color" content="#141117"/, "app theme color matches its surface");
  assert.match(head, /apple-touch-icon" href="\/yebente\/icons\/icon-192\.png"/, "app has an iOS icon");
  const man = JSON.parse(read("yebente/public/manifest.webmanifest"));
  assert.equal(man.start_url, "/yebente/");
  for (const icon of man.icons) assert.ok(fs.existsSync(path.join(root, "yebente/public", icon.src)), `manifest icon ships: ${icon.src}`);
  assert.ok(fs.existsSync(path.join(root, "yebente/app/manifest.webmanifest")), "rebuilt app ships the manifest (rebuild: cd yebente && npm run build)");
  const srv = read("server.mjs"), ht = read(".htaccess");
  assert.match(srv, /yebente\\\/app\\\/\(\?:[^)]*manifest\\.webmanifest[^)]*icons\\\/\[\\w\.-\]\+/, "Node serves the manifest and icons");
  assert.match(srv, /manifest\\.webmanifest\|\(\?:assets\|fonts\|icons\)/, "Node maps the manifest and icons paths");
  assert.match(ht, /\^yebente\/\(\(assets\|fonts\|icons\)\//, "Apache maps the icons path too");
  assert.match(ht, /\^yebente\/manifest\\.webmanifest\$/, "Apache maps the manifest too");
  assert.match(read("yebente/public/.htaccess"), /AddType application\/manifest\+json \.webmanifest/, "Apache serves the manifest MIME type");
});

test("rate-limit identity can't be spoofed: the socket address is passed in and trusted over forwarded headers", () => {
  const srv = read("server.mjs"), http = read("lib/http.js");
  assert.match(srv, /"x-remote-addr": req\.socket\.remoteAddress/, "server.mjs: pass the connected address into every API request");
  assert.match(http, /x-remote-addr/, "lib/http.js: read the connected address");
  assert.match(http, /Ignore them and use the connected address|forged X-Forwarded-For/, "lib/http.js: ignore forwarded headers on a direct connection");
});

test("live-server URLs never come from visitor headers, static answers only GET/HEAD, and symlinks can't escape the site", () => {
  const srv = read("server.mjs");
  assert.match(srv, /if \(SERVER\) \{\s*\n\s*const host = \(process\.env\.SITE_URL/, "server.mjs publicUrl: pin the host to SITE_URL on the live server");
  assert.match(srv, /Static content answers only GET and HEAD/, "server.mjs: refuse POST/PUT/DELETE to static paths with 405");
  assert.match(srv, /realpathSync\(file\)\.startsWith\(ROOT_REAL/, "server.mjs sendStatic: refuse symlinks that leave the site");
  assert.match(srv, /"Permissions-Policy": "camera=\(\), microphone=\(\), geolocation=\(\)"/, "server.mjs SECURITY: deny camera, microphone and geolocation by default");
  assert.match(srv, /"Permissions-Policy": "camera=\(self\), microphone=\(\), geolocation=\(\)"/, "server.mjs Ye₿ente: allow the camera only for the wallet app itself");
});

test("links rendered as href come only from trusted hosts, and QR pictures carry no scripts", () => {
  assert.match(read("lib/tracker.js"), /typeof i\.html_url === "string"[\s\S]{0,80}github\\.com\\/, "lib/tracker.js: only GitHub's own addresses become links");
  const qr = read("lib/lightning.js").slice(read("lib/lightning.js").indexOf("export async function qrSvg"));
  assert.match(qr, /startsWith\("<svg"\)/, "lib/lightning.js qrSvg: check the picture starts with <svg");
  assert.match(qr, /<script\|on\\w\+/, "lib/lightning.js qrSvg: refuse scripts and event handlers in the SVG");
});

test("every wallet read that can ask the node or confirm an email is rate-limited", () => {
  const yb = read("api/yebente.js");
  assert.match(yb, /rl:yb:emailcf/, "api/yebente.js confirmEmailPost: limit confirmation attempts per network");
  assert.match(yb, /rl:yb:me:/, "api/yebente.js wallet/me: limit balance checks per wallet");
  assert.match(yb, /rl:yb:invq:/, "api/yebente.js wallet/invoice: limit settlement checks per wallet");
});

test("card deposits: credited only on the provider's explicit Completed, for the quoted amount", () => {
  const pp = read("lib/pesapal.js");
  assert.match(pp, /desc === "Completed"\) return \{ state: "paid"/, "lib/pesapal.js: only Completed pays; anything else stays pending or failed");
  assert.match(pp, /card and bank details never touch this server/, "lib/pesapal.js: buyers always pay on the provider's page");
  const yw = read("lib/ywallet.js");
  assert.match(yw, /Number\(kes\) !== b\.kes\) return "pending"/, "lib/ywallet.js finishCardBuy: a different amount than quoted never credits");
  assert.match(yw, /ref: `CARD-\$\{trackingId\}`/, "lib/ywallet.js finishCardBuy: one credit per order, however often confirmed");
  const yb = read("api/yebente.js");
  assert.match(yb, /rl:yb:cardo:/, "api/yebente.js wallet/card/order: limit orders per wallet");
  assert.match(yb, /rl:yb:cardq:/, "api/yebente.js wallet/card/status: limit status checks per wallet");
  assert.match(yb, /wrong card IPN secret/, "api/yebente.js card/ipn: refuse a wrong path secret and record it");
});

test("dashboard commands work as printed: reads use ln-ro, writes carry the node directory", () => {
  const html = read("admin.html"), js = read("assets/admin.js"), api = read("api/admin.js");
  assert.match(html, /alias ln-ro='lncli --lnddir=\$HOME\/\.lnd-altradits --macaroonpath=/, "admin.html: the ln-ro shortcut carries the node directory and the read-only key");
  assert.doesNotMatch(html, /<code>lncli (?!--lnddir)/, "admin.html: every printed lncli command carries --lnddir (reads use ln-ro)");
  assert.doesNotMatch(js, /"lncli (?!--lnddir)/, "assets/admin.js: every lncli string carries --lnddir");
  assert.doesNotMatch(api, /"lncli (?!--lnddir)/, "api/admin.js: every lncli string carries --lnddir");
  for (const f of ["admin.html", "assets/admin.js", "api/admin.js", "docs/manual-lnd.md", "DEPLOY.md"]) {
    assert.doesNotMatch(read(f), /--[a-z]+=~\//, `${f}: no flag path starts with ~/ (the shell never expands it there)`);
  }
  for (const f of ["docs/manual-lnd.md", "DEPLOY.md"]) {
    assert.doesNotMatch(read(f), /^lncli (?!--lnddir)/m, `${f}: every lncli command carries --lnddir`);
  }
  assert.doesNotMatch(read("docs/manual-lnd.md"), /lncli-ro/, "docs/manual-lnd.md: the shortcut is called ln-ro, as on the dashboard");
});

test("expressions stay safe: etags match without a regex, configured domains are fully quoted", () => {
  const srv = read("server.mjs");
  assert.match(srv, /etagMatches\(req\.headers\["if-none-match"\]/, "server.mjs: match etags with etagMatches from lib/http.js");
  assert.doesNotMatch(srv, /split\(\/\\s/, "server.mjs: no regex split on a visitor header (a hostile one burns CPU)");
  const yw = read("lib/ywallet.js");
  assert.doesNotMatch(yw, /DOMAIN\(\)\.replace\(\/\\\./, "lib/ywallet.js: quote the domain with escapeRegExp, not a hand-rolled replace");
});

test("address QR: pasted text only, bc1q checked, capped, and no address-making key anywhere", () => {
  const ln = read("lib/lightning.js");
  assert.match(ln, /\^bc1q\[02-9ac-hj-np-z\]/, "lib/lightning.js: only bc1q-shaped text is encoded");
  const ad = read("api/admin.js");
  assert.match(ad, /body\.action === "address_qr"/, "api/admin.js: the QR action exists behind the admin gate");
  assert.match(ad, /rl:addrqr/, "api/admin.js address_qr: QR codes are capped per hour");
  for (const f of ["api/admin.js", "lib/lightning.js", "assets/admin.js", "admin.html", ".env.example"]) {
    assert.doesNotMatch(read(f), /LND_ADDRESS_MACAROON|node_address|newDepositAddress/, `${f}: no address-making key or action remains`);
  }
});
