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
  for (const f of [...fs.readdirSync(root).filter((x) => x.endsWith(".html")), "ktown/index.html", "ktown/pay.html", "ktown/terms.html", "sats-safari/index.html", "address-check/index.html", "touchtype/index.html", "opcode-circuit/index.html"]) {
    const html = read(f), srcs = [...html.matchAll(/<script[^>]*\bsrc="\/((?:assets|ktown|sats-safari)\/[\w.-]+\.js)(?:\?[\w=.-]*)?"/g)].map((m) => read(m[1])).join("\n");
    assert.match(html + srcs, /window\.top !== window\.self/, `${f}: add the frame check at the top of its script`);
    assert.match(html, /<script src="\/assets\/report\.js"><\/script>/, `${f}: the Security watch reporter is missing (run: node deploy/page-csp.mjs)`);
  }
});

test("pages have no inline event handlers or javascript: links (the policy would block them, and they invite injection)", () => {
  for (const f of [...fs.readdirSync(root).filter((x) => x.endsWith(".html")), "ktown/index.html", "ktown/pay.html", "ktown/terms.html", "yebente/app/index.html", "sats-safari/index.html", "address-check/index.html", "touchtype/index.html", "opcode-circuit/index.html"]) {
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
  const PUBLIC = new Set(["assets", "ktown", "sats-safari", "address-check", "touchtype", "opcode-circuit"]); // pages' own scripts, styles and images; kTown, Sats Safari, Address Check, TouchType and Opcode Circuit hold only web content
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
    ...walk("ktown").filter((f) => /\.(html|js|css)$/.test(f) && !f.includes("qrcode-generator-")),
    ...walk("sats-safari").filter((f) => /\.(html|js|css)$/.test(f)),
    ...walk("address-check").filter((f) => /\.(html|js)$/.test(f)),
    ...walk("touchtype").filter((f) => /\.(html|js|css)$/.test(f)),
    ...walk("opcode-circuit").filter((f) => /\.(html|js|css)$/.test(f)),
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
  assert.match(read("lib/tracker.js"), /typeof r\.html_url === "string"[\s\S]{0,80}github\\.com\\/, "lib/tracker.js: review addresses are checked too, with the pull request as fallback");
  assert.match(read("lib/tracker.js"), /`https:\/\/github\.com\/\$\{LEARNING_REPO\}/, "lib/tracker.js: log proof links are built from a constant, never API text");
  assert.match(read("tracker.html"), /href="\$\{esc\(c\.proof\.url\)\}"/, "tracker.html: calendar proof links go through esc()");
  assert.match(read("tracker.html"), /href="\$\{esc\(y\.proof\.url\)\}"/, "tracker.html: yesterday's proof link goes through esc()");
  const qr = read("lib/lightning.js").slice(read("lib/lightning.js").indexOf("export async function qrSvg"));
  assert.match(qr, /startsWith\("<svg"\)/, "lib/lightning.js qrSvg: check the picture starts with <svg");
  assert.match(qr, /<script\|on\\w\+/, "lib/lightning.js qrSvg: refuse scripts and event handlers in the SVG");
});

test("every wallet read that can ask the node or confirm an email is rate-limited", () => {
  const yb = read("api/yebente.js");
  assert.match(yb, /rl:yb:emailcf/, "api/yebente.js confirmEmailPost: limit confirmation attempts per network");
  assert.match(yb, /rl:yb:me:/, "api/yebente.js wallet/me: limit balance checks per wallet");
  assert.match(yb, /rl:yb:invq:/, "api/yebente.js wallet/invoice: limit settlement checks per wallet");
  assert.match(yb, /rl:yb:freeze:/, "api/yebente.js freezePost: limit freeze-link guesses per network");
});

test("email changes wait 48 hours, cancellable from the old address or a phone", () => {
  const yw = read("lib/ywallet.js");
  const confirm = yw.slice(yw.indexOf("export async function confirmEmail"));
  assert.match(confirm, /emailChange: \{ newEmail: rec\.email, effectiveAt/, "lib/ywallet.js confirmEmail: a change waits instead of swapping at once");
  assert.match(confirm, /48 \* 3600e3/, "lib/ywallet.js confirmEmail: the wait is 48 hours");
  assert.match(yw, /export async function effectiveEmailChanges/, "lib/ywallet.js: a sweeper flips due changes");
  const cancel = yw.slice(yw.indexOf("export async function cancelPendingEmailChange"));
  assert.match(cancel, /await checkPin\(cur, pin\)/, "lib/ywallet.js cancelPendingEmailChange: cancelling from a phone needs the PIN");
  const yb = read("api/yebente.js");
  assert.match(yb, /rl:yb:emailcx:/, "api/yebente.js emailChangeCancelPost: limit cancel-link guesses per network");
  assert.match(yb, /rl:yb:emailc:/, "api/yebente.js email/cancel: limit phone cancels per wallet");
});

test("cancelling a pending recovery: rate-limited, PIN-checked, and every live link dies", () => {
  const yb = read("api/yebente.js");
  assert.match(yb, /rl:yb:recc:/, "api/yebente.js recovery/cancel: limit cancel attempts per wallet");
  const yw = read("lib/ywallet.js");
  const cancel = yw.slice(yw.indexOf("export async function cancelEmailRecovery"));
  assert.match(cancel, /await checkPin\(cur, pin\)/, "lib/ywallet.js cancelEmailRecovery: cancelling needs the PIN");
  assert.match(cancel, /deleteKeys\(live\.map\(\(p\) => `ywrt:\$\{p\.h\}`\)\)/, "lib/ywallet.js cancelEmailRecovery: every live recovery link dies at once");
});

test("the one-tap freeze link: hashed token, constant-time compare, frozen sends refused, links never logged", () => {
  const yw = read("lib/ywallet.js");
  assert.match(yw, /ywft:\$\{sha\(token\)\}/, "lib/ywallet.js: freeze tokens are stored hashed");
  assert.match(yw, /timingSafeEqual\(Buffer\.from\(rec\.fh, "hex"\), Buffer\.from\(h, "hex"\)\)/, "lib/ywallet.js freezeWallet: the stored freeze hash is compared in constant time");
  assert.match(yw, /if \(w\.frozen\) throw err\("Sending is frozen/, "lib/ywallet.js spendable: a frozen wallet sends nothing");
  assert.match(yw, /Date\.parse\(d\.at \|\| 0\) < Date\.parse\(w\.frozen\.at\)/, "lib/ywallet.js unlock: only a phone trusted before the freeze lifts it");
  const em = read("lib/email.js");
  assert.match(em, /\(\[\?&\]t=\)\[\\w-\]\{20,\}.*\(redacted\)/, "lib/email.js: one-tap tokens in wallet mail are redacted from the stored log");
});

test("Bitika stays server-side: no Bitika host in any page CSP, no API key in built assets", () => {
  // The browser never calls Bitika: the policy must not gain its hosts.
  for (const f of [...fs.readdirSync(root).filter((x) => x.endsWith(".html")), "yebente/app/index.html"]) {
    const csp = read(f).match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] || "";
    assert.doesNotMatch(csp, /bitika/i, `${f}: the page policy names a Bitika host (the server calls Bitika, never the browser)`);
  }
  // The key lives in the environment, not in anything shipped to the browser.
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  for (const f of [...walk("yebente/app").filter((x) => !/\.(png|jpe?g|gif|ico|woff2?|ttf)$/i.test(x)), "yebente/index.html",
    ...walk("yebente/src").filter((x) => /\.(tsx?|css)$/.test(x))]) {
    assert.doesNotMatch(read(f), /BITIKA_API_KEY/, `${f}: the Bitika API key must never ship to the browser`);
    assert.doesNotMatch(read(f), /bitikaserver/i, `${f}: the Bitika API host must never ship to the browser`);
  }
});

test("Bitika buys: credited only by the Lightning payment arriving, status is display only", () => {
  const bk = read("lib/bitika.js");
  assert.doesNotMatch(bk, /\bcredit\(/, "lib/bitika.js: never credits a wallet (the invoice path does that)");
  assert.doesNotMatch(bk, /ywe:|ywtx:|record\(/, "lib/bitika.js: writes no history entries");
  assert.match(bk, /crypto\.randomUUID\(\)/, "lib/bitika.js: one fresh UUID Idempotency-Key per buy");
  assert.match(bk, /RANK\[state\] < RANK\[b\.state\]\) return b\.state/, "lib/bitika.js: a status never moves backward");
  assert.match(bk, /timingSafeEqual/, "lib/bitika.js: the webhook signature is compared in constant time");
  assert.match(bk, /Math\.abs\(nowSec - Number\(m\[1\]\)\) > 300/, "lib/bitika.js: webhooks older than 5 minutes are rejected");
  assert.match(bk, /publicFetch/, "lib/bitika.js: outside calls go through the public-address guard");
  const yb = read("api/yebente.js");
  assert.match(yb, /rl:yb:bitp:/, "api/yebente.js wallet/buy/bitika: limit prompts per number");
  assert.match(yb, /rl:yb:bitw:/, "api/yebente.js wallet/buy/bitika: limit buys per wallet");
  assert.match(yb, /rl:yb:bitq:/, "api/yebente.js wallet/buy/bitika: limit status checks per wallet");
  assert.match(yb, /wrong bitika webhook secret/, "api/yebente.js bitika/webhook: refuse a wrong path secret and record it");
  assert.match(yb, /buyProvider/, "api/yebente.js health: names the Buy provider");
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
  assert.doesNotMatch(read("lib/njia.js"), /"lncli (?!--lnddir)/, "lib/njia.js: every printed lncli command carries --lnddir (reads use ln-ro)");
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

test("Ye₿ente calls only its fixed services: Lightning lookups go through the server, and connect-src names the rest", () => {
  const CONNECT = "connect-src 'self' https://api.blink.sv https://api.coinbase.com https://open.er-api.com https://bitcoin.co.ke";
  for (const f of ["yebente/index.html", "yebente/app/index.html", "yebente/public/.htaccess"]) {
    assert.ok(read(f).includes(CONNECT), `${f}: connect-src names only the fixed feeds and Tando (Lightning lookups go through /api/yebente/address/*)`);
  }
  assert.ok(read("server.mjs").includes(CONNECT), "server.mjs YEBENTE_CSP: the same narrowed connect-src as the page");
  for (const f of ["yebente/index.html", "yebente/app/index.html"]) {
    assert.doesNotMatch(read(f), /connect-src[^;]*https:(?!\/)/, `${f}: no https: wildcard in connect-src`);
  }
  // The wallet's own lookup code calls only our API: any outside host it could
  // name would need a connect-src entry, so none may remain.
  const ls = read("yebente/src/services/lightningService.ts");
  for (const m of [...ls.matchAll(/fetch\(\s*(`|'|")([^`"']*)/g)]) {
    assert.ok(m[2].startsWith("/api/"), `lightningService.ts: fetch(${m[1]}${m[2].slice(0, 60)}...) must stay on our API (proxy outside lookups through the server)`);
  }
  // The shipped bundle is built from this source: it uses the proxy too.
  const bundle = files("yebente/app/assets", /\.js$/).map((f) => read(f)).join("\n");
  assert.ok(bundle.includes("/api/yebente/address/resolve") && bundle.includes("/api/yebente/address/invoice"),
    "yebente/app/assets: rebuild the app (cd yebente && npm run build) so the shipped page uses the proxy");
});

test("kTown: Tando through the public-address guard, exact-amount invoices, no payer data, limits on every route", () => {
  const kt = read("lib/ktown.js"), api = read("api/ktown.js"), srv = read("server.mjs");
  assert.match(kt, /switchOn\("KTOWN"\)/, "lib/ktown.js: everything waits on the KTOWN switch");
  assert.match(kt, /publicFetch\(/, "lib/ktown.js: Tando calls go through the public-address guard");
  assert.doesNotMatch(kt, /(?<![\w.])fetch\(/, "lib/ktown.js: no direct fetch() to an address others can influence");
  assert.match(kt, /bolt11Msats\(pr\)/, "lib/ktown.js: every Tando invoice is measured before it is handed out");
  assert.match(kt, /invoice_substitution/, "lib/ktown.js: a wrong-amount invoice is refused and recorded");
  assert.match(kt, /kesReceived: null, mpesaCode: null, merchantName: null, confirmedAt: null/, "lib/ktown.js: a history entry carries only the merchant's own payment facts");
  assert.doesNotMatch(kt, /clientIp\(/, "lib/ktown.js: never sees the network address, so no record can carry it");
  for (const k of ["rl:kt:reg:", "rl:kt:login:", "rl:kt:lnurl:", "rl:kt:cb:", "rl:kt:rc:", "rl:kt:me:", "rl:kt:set:", "rl:kt:rates:"])
    assert.ok(api.includes(k), `api/ktown.js: rate limit ${k}... is in place`);
  assert.match(kt, /verified: Boolean\(merchant\.verified\)/, "lib/ktown.js: the pay page reads the verified mark from the LNURL answer");
  const ht = read(".htaccess");
  for (const [page, js] of [["ktown/index.html", "ktown/app.js"], ["ktown/pay.html", "ktown/pay.js"]]) {
    const html = read(page), src = read(js);
    assert.match(html, /connect-src 'self'/, `${page}: the app calls only this site's API`);
    assert.doesNotMatch(html, /connect-src 'self' https?:/, `${page}: no API host beside this site`);
    assert.doesNotMatch(html, /(src|href)="http/, `${page}: no outside scripts, styles or images (store assets in the repo)`);
    assert.doesNotMatch(src, /fetch\(\s*["'`]https?:/, `${js}: fetch() takes same-site paths only`);
    for (const [, key] of html.matchAll(/data-i18n="([a-zA-Z]+)"/g))
      assert.ok(src.includes(`${key}:`), `${page}: label "${key}" has no wording in ${js}`);
    for (const [, id] of src.matchAll(/\$\("([a-z-]+)"\)/g))
      assert.ok(html.includes(`id="${id}"`), `${js}: #${id} is missing from ${page}`);
  }
  const payHtml = read("ktown/pay.html"), payJs = read("ktown/pay.js");
  assert.doesNotMatch(payHtml, /id="sats"/, "ktown/pay.html: before paying, no sats figure is shown");
  assert.doesNotMatch(payJs, /feeIncl/, "ktown/pay.js: before paying, no fee line is shown");
  assert.match(payJs, /setLine\("paid-fee"/, "ktown/pay.js: after paying, the Tando fee shows");
  assert.match(payJs, /setLine\("paid-sats"/, "ktown/pay.js: after paying, the sats paid show");
  const appJs = read("ktown/app.js");
  assert.match(appJs, /e\.mode === "msat"/, "ktown/app.js: history names payments that arrived by a wallet's own conversion");
  assert.match(appJs, /kesReceived < e\.kesExpected/, "ktown/app.js: history shows quoted vs received when they differ");
  const qrLib = fs.readdirSync(path.join(root, "ktown")).find((f) => f.startsWith("qrcode-generator-") && f.endsWith(".js"));
  assert.ok(qrLib && /\d+\.\d+\.\d+/.test(qrLib), "ktown/: the QR library is vendored with its version in the name, never hotlinked");
  assert.match(read(`ktown/${qrLib}`), /Licensed under the MIT license/, "ktown/: the QR library keeps its licence header");
  assert.doesNotMatch(read(`ktown/${qrLib}`), /<script/i, "ktown/: the QR library emits no scripts");
  assert.ok(srv.includes('"/ktown/index.html"') && srv.includes('"/ktown/pay.html"') && srv.includes('"/ktown/terms.html"'), "server.mjs: /ktown serves the app, /k/<id> the pay page, /ktown/terms the terms");
  assert.ok(ht.includes("ktown/index.html") && ht.includes("ktown/pay.html") && ht.includes("ktown/terms.html"), ".htaccess: the same three routes on the Apache stack");
  const mani = JSON.parse(read("ktown/manifest.webmanifest"));
  assert.equal(mani.start_url, "/ktown", "ktown/: the app installs at /ktown");
  assert.equal(mani.scope, "/ktown", "ktown/: installed scope stays inside the app");
  assert.equal(mani.display, "standalone", "ktown/: the app installs standalone");
  assert.ok(mani.icons.length >= 2, "ktown/: install icons are declared");
  for (const icon of mani.icons)
    assert.ok(fs.existsSync(path.join(root, icon.src.replace(/^\//, ""))), `ktown/: ${icon.src} exists on disk`);
  const sw = read("ktown/sw.js"), app = read("ktown/app.js"), css = read("ktown/style.css");
  assert.match(sw, /const CACHE = "ktown-v\d+"/, "ktown/sw.js: a versioned cache (bump it when cached files change)");
  for (const f of ["/ktown/index.html", "/ktown/style.css", "/ktown/app.js", "/ktown/qrcode-generator-1.4.4.js", "figtree-latin.woff2"])
    assert.ok(sw.includes(f), `ktown/sw.js: the offline shell precaches ${f}`);
  for (const m of sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)) {
    const p = m[1] === "/ktown" ? "ktown/index.html" : m[1].replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(root, p)), `ktown/sw.js: precached ${m[1]} exists (one 404 breaks the whole install)`);
  }
  assert.match(sw, /u\.origin !== self\.location\.origin/, "ktown/sw.js: same-site reads only");
  assert.match(sw, /startsWith\("\/api\/"/, "ktown/sw.js: live API data is never cached");
  assert.match(sw, /caches\.match\("\/ktown\/index\.html"\)/, "ktown/sw.js: failed reads fall back to the app");
  assert.match(app, /navigator\.serviceWorker\.register\("\/ktown\/sw\.js"\)/, "ktown/app.js: the app installs its worker");
  assert.match(app, /e\.status === 401/, "ktown/app.js: only a dead session signs out; a failed network runs on saved data");
  assert.match(css, /@page card\{size:A6/, "ktown/style.css: the counter card prints at A6");
  assert.match(css, /@page sheet\{size:A4/, "ktown/style.css: the cut-out sheet prints at A4");
  assert.match(app, /toBlob\(res, "image\/png"\)/, "ktown/app.js: the PNG renders locally");
  assert.match(app, /a\.download = /, "ktown/app.js: the PNG downloads as a file");
  assert.match(app, /afterprint/, "ktown/app.js: the print sheet is removed after printing");
  for (const page of ["ktown/index.html", "ktown/pay.html", "ktown/terms.html"])
    assert.match(read(page), /name="theme-color" content="#0f1b2d"/, `${page}: the install theme color is set`);
  assert.match(srv, /api\[1\] !== "yebente" && api\[1\] !== "ktown"/, "server.mjs: kTown's API takes a sub-path");
  assert.ok(srv.indexOf("k-[A-Za-z0-9_-]{6,64}") !== -1 && srv.indexOf("k-[A-Za-z0-9_-]{6,64}") < srv.indexOf("handle@altradits.com"),
    "server.mjs: the kTown well-known route runs before Ye₿ente's, which would also match the name");
  assert.ok(kt.indexOf("kt:pay:${h}") !== -1 && kt.indexOf("kt:pay:${h}") < kt.indexOf("fetchReceipt(h)"),
    "lib/ktown.js: unknown payment hashes are refused before Tando is ever asked");
  assert.match(kt, /merchantName: nameMatch \? rc\.merchantName : null/, "lib/ktown.js: the registered name is answered only when it matches the merchant");
  assert.match(kt, /if \(nameMatch && !merchant\.claimed\)/, "lib/ktown.js: a matched receipt claims the number, and nothing unclaims it");
  assert.match(kt, /takeoverEligible/, "lib/ktown.js: a stale unclaimed number with no paid receipt can be taken over");
  assert.match(kt, /deleteKeys\(\[`kt:\$\{old\.id\}`\]\)/, "lib/ktown.js: a takeover ends the old record, so its sessions and QR die with it");
});

test("Kazi board: switched off by default, moderated publishing, limits on every route, words rendered inert", () => {
  const kz = read("lib/kazi.js"), api = read("api/kazi.js"), srv = read("server.mjs"), ad = read("api/admin.js");
  assert.match(kz, /switchOn\("KAZI"\)/, "lib/kazi.js: everything waits on the KAZI switch");
  assert.doesNotMatch(kz, /(?<![\w.])fetch\(/, "lib/kazi.js: no outside calls at all (posters and workers settle off the board)");
  assert.doesNotMatch(kz, /clientIp\(/, "lib/kazi.js: never sees the network address, so no record can carry it");
  assert.match(kz, /screen\(/, "lib/kazi.js: task words pass the word screen before Stanley sees them");
  assert.match(kz, /timingSafeEqual/, "lib/kazi.js: the manage token is compared in constant time");
  assert.match(kz, /manageHash: sha\(token\)/, "lib/kazi.js: only the manage token's hash is stored");
  assert.match(kz, /status: "pending"/, "lib/kazi.js: a new task waits for review");
  assert.match(ad, /body\.action === "kazi_list"/, "api/admin.js: the moderation list sits behind the admin gate");
  assert.match(ad, /kazi_approve/, "api/admin.js: approval is an explicit admin act");
  assert.match(read("assets/admin.js"), /data-kazi-act/, "assets/admin.js: the dashboard approves and hides with buttons");
  for (const k of ["rl:kz:list:", "rl:kz:post:", "rl:kz:post:all", "rl:kz:manage:", "rl:kz:flag:"])
    assert.ok(api.includes(k), `api/kazi.js: rate limit ${k}... is in place`);
  const html = read("kazi.html");
  assert.match(html, /connect-src 'self'/, "kazi.html: the board calls only this site's API");
  assert.doesNotMatch(html, /connect-src 'self' https?:/, "kazi.html: no API host beside this site");
  assert.doesNotMatch(html, /src="http/, "kazi.html: no outside scripts or images (store assets in the repo)");
  assert.doesNotMatch(html, /url\(http/, "kazi.html: no outside fonts or styles (store assets in the repo)");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const uses = [...inline.matchAll(/[^\n]*innerHTML[^\n]*/g)].map((m) => m[0].trim());
  assert.ok(uses.length > 0 && uses.every((l) => /document\.documentElement\.innerHTML = ""/.test(l)), "kazi.html: the only innerHTML is the frame check clearing the page; task words render through textContent");
  assert.match(inline, /window\.top !== window\.self/, "kazi.html: the frame check is in the page script");
  const srvLine = (start) => srv.split("\n").find((l) => l.trim().startsWith(start)) || "";
  assert.match(srvLine("const oldPage"), /\|kazi[|)]/, "server.mjs: /kazi.html redirects to /kazi");
  assert.match(srvLine("const page ="), /\|kazi[|)]/, "server.mjs: /kazi serves the board");
  assert.ok(srv.includes('kazi\\.html'), "server.mjs: the board page is whitelisted for serving");
  assert.ok(srv.includes('api[1] !== "kazi"'), "server.mjs: the board API keeps its sub-paths");
  assert.match(read(".htaccess"), /\|kazi[|)][^\n]*\/\?\$ \$1\.html/, ".htaccess: /kazi works on the Apache stack too");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/kazi<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/, "sitemap.xml: the board is listed with a date");
});

test("admin bodies over 100 KB need the token up front: strangers hit 413, the token passes 700 KB", async () => {
  const { adminAuthed } = await import("../lib/http.js");
  assert.match(read("server.mjs"), /const limit = api\[1\] === "admin" && adminAuthed\(req\.headers\.authorization\) \? 1_000_000 : 100_000;/, "server.mjs: the ~1 MB body budget needs a valid admin token first");
  assert.match(read("server.mjs"), /if \(size > limit\) \{ res\.writeHead\(413/, "server.mjs: over-budget bodies still get 413");
  assert.match(read("lib/http.js"), /safeEqual\(token, given\)/, "lib/http.js: the token check stays timing-safe");
  const keep = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "secret-admin";
  try {
    const limitFor = (api, auth) => (api === "admin" && adminAuthed(auth) ? 1_000_000 : 100_000);
    assert.ok(limitFor("admin", "Bearer wrong") < 200_000, "a wrong token holds /api/admin at 100 KB: a 200 KB POST gets 413");
    assert.ok(limitFor("admin", undefined) < 200_000, "no token holds /api/admin at 100 KB: a 200 KB POST gets 413");
    assert.ok(limitFor("admin", "Bearer secret-admin") >= 700_000, "the valid token opens ~1 MB: a 700 KB picture is accepted");
    assert.ok(limitFor("contact", "Bearer secret-admin") < 200_000, "other APIs stay at 100 KB even with the token");
  } finally {
    if (keep === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = keep;
  }
  assert.equal(adminAuthed("Bearer x"), false, "no token configured: nobody is authed");
});

test("Njia stays read-only: no write imports, no write endpoints, no admin key, records never cleaned", () => {
  const nj = read("lib/njia.js");
  assert.doesNotMatch(nj, /\.macaroon/, "lib/njia.js: no macaroon filename");
  assert.doesNotMatch(nj, /LND_ADMIN|YEBENTE_LND_PAY_MACAROON/, "lib/njia.js: never the admin key or the pay key");
  assert.doesNotMatch(nj, /payInvoice|createInvoice|newOnchainAddress|spendCheck|startTopup/, "lib/njia.js: no import that can write to LND");
  assert.doesNotMatch(nj, /\/v1\/chanpolicy|\/channels\/transactions|\/v2\/router\/send|\/v1\/channels\/stream/, "lib/njia.js: no LND write path");
  const ln = read("lib/lightning.js");
  for (const fn of ["export async function njiaRead", "export async function njiaPing"]) {
    const at = ln.indexOf(fn);
    assert.ok(at >= 0, `${fn} exists`);
    const body = ln.slice(at, ln.indexOf("\n}\n", at));
    for (const line of body.split("\n")) {
      if (line.includes('"POST"')) assert.ok(line.includes("/v1/switch"), `${fn}: POST only to /v1/switch (the time-range read)`);
    }
    assert.doesNotMatch(body, /\/v1\/chanpolicy|\/channels\/transactions|\/v2\/router\/send|\/v1\/channels\/stream|\bDELETE\b/, `${fn}: no LND write endpoint`);
  }
  assert.doesNotMatch(read("lib/cleanup.js"), /njia:/, "lib/cleanup.js: Njia records are never cleaned up");
});

test("Njia page renders server data as text, never as HTML", () => {
  const js = read("assets/njia.js");
  assert.doesNotMatch(js, /innerHTML/, "assets/njia.js: build the DOM with textContent, never innerHTML");
  assert.match(js, /textContent/, "assets/njia.js: page data becomes text");
  assert.doesNotMatch(js, /nodeInfo|read\.info|channelbalance|walletbalance/, "assets/njia.js: the page only knows the public summary");
  assert.match(read("njia.html"), /\/assets\/njia\.js/, "njia.html: loads the page script");
  assert.match(read("api/njia.js"), /deadmanActive\(\)/, "api/njia.js: lockdown hides the summary");
});

test("sample contacts anyone can see or copy are Stanley's own, never a stranger's number", () => {
  // A made-up number like 0712345678 belongs to a real stranger: anyone who
  // copies one from a page, an example or a doc and sends money loses it. So
  // user-visible samples are Stanley's test number (a wrong payment to it can
  // be refunded) and his test email.
  const EMAIL = "5tan@altradits.com";
  assert.match(read("ktown/index.html"), /placeholder="0707 172 370"/, "ktown/index.html: the phone placeholder is Stanley's test number");
  assert.match(read("lib/ktown.js"), /like 0707 172 370\./, "lib/ktown.js: the M-Pesa error names Stanley's test number");
  assert.match(read("lib/rails.js"), /example: "707 172 370"/, "lib/rails.js: the M-Pesa example is Stanley's test number");
  assert.match(read("yebente/src/components/BuyBtcModal.tsx"), /example="707 172 370"/, "BuyBtcModal: the M-Pesa example is Stanley's test number");
  for (const f of ["yebente/src/components/WalletGate.tsx", "yebente/src/components/WalletSettingsModal.tsx", "yebente/src/components/CardTopupModal.tsx"])
    assert.match(read(f), new RegExp(`placeholder="${EMAIL}"`), `${f}: the email placeholder is Stanley's test email`);
  assert.match(read("admin.html"), new RegExp(`placeholder="${EMAIL}"`), "admin.html: the erase-box placeholder is Stanley's test email");
  assert.match(read("docs/hackathon.md"), new RegExp(EMAIL), "docs/hackathon.md: the draft goes to Stanley's test email");
  assert.match(read("demo/meta.mjs"), new RegExp(EMAIL), "demo/meta.mjs: the demo draft goes to Stanley's test email");
  // The retired samples are gone from everything people can see or copy.
  const retired = ["0712345678", "254712345678", "712 345 678", "0712 345 678", "you@email.com", "you@example.com", "their@email.com"];
  const visible = ["ktown/index.html", "ktown/pay.html", "ktown/terms.html", "ktown/app.js", "admin.html",
    "lib/ktown.js", "lib/rails.js", "docs/hackathon.md", "demo/meta.mjs",
    "yebente/src/components/BuyBtcModal.tsx", "yebente/src/components/CardTopupModal.tsx", "yebente/src/components/PhoneInput.tsx",
    "yebente/src/components/WalletGate.tsx", "yebente/src/components/WalletSettingsModal.tsx", "yebente/src/services/payoutRails.ts"];
  const bundle = fs.readdirSync(path.join(root, "yebente/app/assets")).find((f) => /^index-[\w-]+\.js$/.test(f));
  if (bundle) visible.push(`yebente/app/assets/${bundle}`);
  for (const f of visible) for (const s of retired)
    assert.ok(!read(f).includes(s), `${f}: retired sample ${s} is still visible${f.startsWith("yebente/app/") ? " (rebuild: cd yebente && npm run build)" : ""}`);
});

test("trivia: the switch gates writes, the server owns play, the page calls only this site", () => {
  const live = read("lib/trivia-live.js"), api = read("api/trivia.js"), srv = read("server.mjs");
  assert.match(read("lib/trivia.js"), /switchOn\("TRIVIA"\)/, "lib/trivia.js: live play waits on the TRIVIA switch");
  assert.match(live, /requireTrivia\(\)/, "lib/trivia-live.js: starting and answering need the switch on");
  for (const k of ["rl:trv:ans:", "rl:trv:join:", "rl:trv:fund:", "rl:trv:read:"])
    assert.ok(api.includes(k), `api/trivia.js: rate limit ${k}... is in place`);
  assert.match(live, /deadlineMs - QUESTION_MS/, "lib/trivia-live.js: reply timing is measured on the server clock");
  assert.match(live, /settleBattle\(meta\.battle/, "lib/trivia-live.js: battle sats move once per settled round");
  assert.match(live, /after !== before\) throw err\("Battle sats mismatch\."\s*, 500\)/, "lib/trivia-live.js: a broken battle total fails closed");
  assert.match(api, /action === "answer"/, "api/trivia.js: answers arrive as an action, checked on the server");
  const html = read("trivia.html"), js = read("assets/trivia.js");
  assert.match(html, /connect-src 'self'/, "trivia.html: the page calls only this site's API");
  assert.doesNotMatch(html, /connect-src 'self' https?:/, "trivia.html: no API host beside this site");
  assert.doesNotMatch(html, /src="http/, "trivia.html: no outside scripts or images (store assets in the repo)");
  assert.doesNotMatch(html, /rel="stylesheet" href="http/, "trivia.html: no outside styles (store assets in the repo)");
  assert.doesNotMatch(js, /fetch\(\s*["'`]https?:/, "assets/trivia.js: fetch() takes same-site paths only");
  assert.ok(js.includes("/api/trivia"), "assets/trivia.js: live play runs through /api/trivia");
  assert.match(js, /esc\(/, "assets/trivia.js: server words are escaped before they reach the page");
  assert.match(html, /name="theme-color" content="#EEF2F6"/, "trivia.html: the theme color is set");
  assert.doesNotMatch(html, /stak/i, "trivia.html: staked mode stays unshown while off");
  assert.doesNotMatch(js, /stak/i, "assets/trivia.js: staked mode stays unshown while off");
  assert.doesNotMatch(html, /\bearn\b/i, "trivia.html: no earnings promises");
  for (const id of ["game", "join-form", "live-status", "q-choices", "board-body", "fund-form", "books-btn"])
    assert.ok(html.includes(`id="${id}"`), `trivia.html: #${id} is missing`);
  for (const [, id] of js.matchAll(/\$\("([a-z-]+)"\)/g))
    assert.ok(html.includes(`id="${id}"`), `assets/trivia.js: #${id} is missing from trivia.html`);
  assert.ok(srv.includes("trivia\\.html"), "server.mjs: the page is served as public content");
  assert.match((srv.split("\n").find((l) => l.trim().startsWith("const page =")) || ""), /\|trivia[|)]/, "server.mjs: /trivia serves the page, /trivia.html redirects to it");
  assert.match(read(".htaccess"), /\|trivia[|)][^\n]*\/\?\$ \$1\.html/, ".htaccess: the same route on the Apache stack");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/trivia<\/loc>/, "sitemap.xml: the game is listed");
  assert.ok(read("portfolio.html").includes("/assets/trivia-shot.png"), "portfolio.html: the card shows a real screenshot");
  assert.ok(fs.existsSync(path.join(root, "assets/trivia-shot.png")), "assets/trivia-shot.png: the card screenshot is stored in the repo");
});

test("trivia stakes: off by default, plain refusal, locks open only at the end, never on the public page", () => {
  const sk = read("lib/trivia-stakes.js"), api = read("api/trivia.js"), ln = read("lib/lightning.js");
  assert.match(read("lib/trivia.js"), /switchOn\("TRIVIA_STAKES"\)/, "lib/trivia.js: staked play waits on the TRIVIA_STAKES switch");
  assert.match(sk, /Staked play is off/, "lib/trivia-stakes.js: one plain refusal when off");
  assert.match(sk, /requireStakes\(\)/, "lib/trivia-stakes.js: every staked endpoint needs the switch on");
  assert.match(sk, /Stakes settle when the game ends/, "lib/trivia-stakes.js: locks open only at the end");
  assert.match(read("lib/trivia-live.js"), /Every seat locks the same stake before the game starts/, "lib/trivia-live.js: a staked game starts only when every seat is locked");
  assert.doesNotMatch(sk, /ADMIN_MACAROON/, "lib/trivia-stakes.js: never the admin key (hold invoices need the invoice macaroon)");
  assert.ok(api.includes("rl:trv:stake:"), "api/trivia.js: the stake rate limit is in place");
  assert.match(api, /action === "stake"/, "api/trivia.js: stakes arrive as an action, locked on the server");
  assert.match(ln, /\/v2\/invoices\/hodl/, "lib/lightning.js: hold invoices are made with AddHoldInvoice");
  assert.match(ln, /\/v2\/invoices\/settle/, "lib/lightning.js: locks are collected with SettleInvoice");
  assert.match(ln, /\/v2\/invoices\/cancel/, "lib/lightning.js: locks are refunded with CancelInvoice");
  assert.match(read("api/admin.js"), /trivia_stake_set/, "api/admin.js: Stanley sets the equal stake");
  assert.match(read("api/admin.js"), /trivia_stake_settle/, "api/admin.js: Stanley settles at the end");
  assert.match(read("api/admin.js"), /trivia_stake_cancel/, "api/admin.js: Stanley can cancel the locks");
  assert.match(read("docs/trivia.md"), /stays off until the licences are in place and the lawyer/, "docs/trivia.md: staked play stays off until licences plus lawyer written OK");
  const html = read("trivia.html"), js = read("assets/trivia.js");
  assert.doesNotMatch(html, /stak/i, "trivia.html: staked mode stays unshown while off");
  assert.doesNotMatch(js, /stak/i, "assets/trivia.js: staked mode stays unshown while off");
});

test("Developer pages are wired like the others: nav, routes, policy, no secrets in the open", () => {
  for (const f of ["developer.html", "developer-reference.html", "developer-dashboard.html"]) {
    assert.ok(read(f).includes('<a href="/developer" aria-current="page">Developer</a>'), `${f}: marks Developer current`);
    assert.match(read(f), /<meta http-equiv="Content-Security-Policy" content="[^"]+">/, `${f}: carries its policy tag`);
    assert.doesNotMatch(read(f), /ak_(live|test)_[A-Za-z0-9_-]{32}/, `${f}: no real API key in the open (keys carry 32 secret characters)`);
  }
  const srv = read("server.mjs");
  assert.match(srv, /developer\\.html\|developer-reference\\.html\|developer-dashboard\\.html/, "server.mjs PUBLIC serves the Developer files");
  assert.match(srv, /api\[1\] !== "dev"/, "server.mjs: the Developer API takes a sub-path");
  assert.match(srv, /pumpWebhooks/, "server.mjs: health pings pump Developer webhook retries");
  assert.match(read(".htaccess"), /developer\/\(reference\|dashboard\)/, ".htaccess: the reference and dashboard resolve on the Apache stack");
});

test("Opcode Circuit: same route on both stacks, install manifest, versioned offline shell, no outside refs", () => {
  const srv = read("server.mjs"), ht = read(".htaccess");
  assert.ok(srv.includes('"/opcode-circuit/index.html"'), "server.mjs: /opcode-circuit serves the game");
  assert.match(srv, /opcode-circuit\\\/\(\?:[^)]*manifest\\.webmanifest[^)]*icons\\\/\[\\w\.-\]\+/, "server.mjs: the game path serves its manifest and icons");
  assert.ok(ht.includes("opcode-circuit/index.html"), ".htaccess: the same route on the Apache stack");
  const mani = JSON.parse(read("opcode-circuit/manifest.webmanifest"));
  assert.equal(mani.start_url, "/opcode-circuit", "the game installs at /opcode-circuit");
  assert.equal(mani.scope, "/opcode-circuit", "installed scope stays inside the game");
  assert.equal(mani.display, "standalone", "the game installs standalone");
  for (const icon of mani.icons)
    assert.ok(fs.existsSync(path.join(root, icon.src.replace(/^\//, ""))), `${icon.src} exists on disk`);
  const sw = read("opcode-circuit/sw.js");
  assert.match(sw, /const CACHE = "opcode-circuit-v\d+"/, "sw.js: a versioned cache");
  for (const f of ["./index.html", "./game.js", "./sim/primitives.js", "./sim/interpreter.js"])
    assert.ok(sw.includes(f), `sw.js: the offline shell precaches ${f}`);
  assert.match(sw, /u\.origin !== self\.location\.origin/, "sw.js: same-site reads only");
  assert.match(sw, /startsWith\("\/api\/"/, "sw.js: live API data is never cached");
  const html = read("opcode-circuit/index.html");
  assert.match(html, /connect-src 'self'/, "the game calls no host but this site");
  assert.doesNotMatch(html, /src="http/, "no outside scripts or images");
  assert.doesNotMatch(html, /<link[^>]*rel="stylesheet"[^>]*href="http/, "no outside styles");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/opcode-circuit<\/loc>/, "sitemap lists the game");
});

test("the deploy writes a marker the file check defers to, and the marker is never web content", () => {
  const cron = read("deploy/cron.sh");
  assert.match(cron, /\.deploy-marker\.json/, "deploy/cron.sh: the deploy writes its window to .deploy-marker.json");
  assert.match(cron, /marker "in-progress"/, "deploy/cron.sh: the marker opens when the deploy starts");
  assert.match(cron, /marker "done"/, "deploy/cron.sh: the marker closes once the tree is final");
  const deny = read(".htaccess").match(/<FilesMatch "\^\(([^"]+)\)\$">/)[1];
  assert.ok(new RegExp(`^(${deny})$`).test(".deploy-marker.json"), ".htaccess: the deploy marker is denied to the web server");
});

test("a mid-deploy file check defers; unsigned or non-main code is a strong signal that freezes", () => {
  const dm = read("lib/deadman.js");
  assert.match(dm, /if \(deploy\.inProgress\)/, "lib/deadman.js checkFileIntegrity: a deploy in progress defers judgment");
  assert.match(dm, /deferred: true/, "lib/deadman.js: the deferral is reported, not silent");
  assert.match(dm, /headStatus\(rootDir\)/, "lib/deadman.js: the running HEAD is judged against origin/main");
  assert.match(dm, /strong = true/, "lib/deadman.js: code outside a signed deploy is marked strong");
  assert.match(dm, /if \(files\.strong\)/, "lib/deadman.js runDeadmanChecks: a strong file signal freezes at once");
});

test("the deadman acknowledgement link: hashed token, constant-time compare, single-use, rate-limited, never acts on GET", () => {
  const dm = read("lib/deadman.js");
  assert.match(dm, /createHash\("sha256"\)\.update\(token\)/, "lib/deadman.js: ack tokens are hashed");
  assert.match(dm, /dmack:\$\{fh\}/, "lib/deadman.js: only the token hash is stored");
  assert.match(dm, /timingSafeEqual\(Buffer\.from\(rec\.fh, "hex"\), Buffer\.from\(h, "hex"\)\)/, "lib/deadman.js: the stored ack hash is compared in constant time");
  assert.match(dm, /if \(rec\.used\) return null/, "lib/deadman.js: a used ack token is dead (single-use)");
  const api = read("api/deadman.js");
  assert.match(api, /rl:dm:ack:/, "api/deadman.js: ack attempts are rate-limited per network");
  const get = api.slice(api.indexOf("export async function GET"), api.indexOf("export async function POST"));
  assert.doesNotMatch(get, /acknowledgeWatch\(/, "api/deadman.js GET: opening the link (mail scanners open every link) never closes the watch");
  assert.match(api.slice(api.indexOf("export async function POST")), /acknowledgeWatch\(/, "api/deadman.js POST: only the button tap acknowledges");
});

test("leads: free capture stays abuse-resistant, sources tracked, pipeline admin-only", () => {
  const srv = read("server.mjs"), ht = read(".htaccess"), api = read("api/leads.js"), lb = read("lib/leads.js"), ad = read("api/admin.js");
  assert.ok(srv.includes("start\\.html"), "server.mjs: the /start page is served as public content");
  assert.match(srv.split("\n").find((l) => l.trim().startsWith("const page =")) || "", /\|start[|)]/, "server.mjs: /start serves the page");
  assert.match(srv.split("\n").find((l) => l.trim().startsWith("const oldPage")) || "", /\|start[|)]/, "server.mjs: /start.html redirects to /start");
  assert.match(ht, /\|start\)\/\?\$ \$1\.html/, ".htaccess: /start works on the Apache stack too");
  assert.match(read("sitemap.xml"), /<loc>https:\/\/altradits\.com\/start<\/loc><lastmod>20\d\d-\d\d-\d\d<\/lastmod>/, "sitemap.xml: /start is listed with a date");
  assert.match(api, /body\.company/, "api/leads.js: the honeypot field is checked");
  assert.match(api, /body\.startedAt/, "api/leads.js: the time-to-submit check runs");
  assert.ok(api.includes("rl:lead:") && api.includes("rl:lead:all"), "api/leads.js: per-IP and site-wide limits are in place");
  assert.doesNotMatch(api, /export async function GET/, "api/leads.js: no public reads, only submits");
  assert.match(api, /screen\(/, "api/leads.js: free words pass the word screen before anyone acts on them");
  assert.match(lb, /export function scoreLead/, "lib/leads.js: scoring is one exported function");
  assert.match(lb, /Math\.min\(100, score\)/, "lib/leads.js: scores cap at 100");
  assert.doesNotMatch(lb, /clientIp\(/, "lib/leads.js: never sees the network address, so no record can carry it");
  assert.doesNotMatch(lb, /(?<![\w.])fetch\(/, "lib/leads.js: no outside calls at all");
  assert.match(lb, /STAGES = \["new", "qualified", "contacted", "meeting", "won", "lost", "nurture"\]/, "lib/leads.js: the seven pipeline stages");
  assert.match(lb, /Give a reason for Lost/, "lib/leads.js: Lost needs a reason");
  assert.match(lb, /Erased on a deletion request/, "lib/leads.js: erasure keeps an audit line");
  assert.match(read("lib/ktown.js"), /source: cleanSource\(source\)/, "lib/ktown.js: registrations store their source");
  assert.match(read("api/ktown.js"), /source: body\.source/, "api/ktown.js: the register route passes the source through");
  assert.match(read("ktown/app.js"), /source: pageSource\(\)/, "ktown/app.js: the app reads ref/utm from its own address");
  assert.match(ad, /view === "leads"/, "api/admin.js: the pipeline view sits behind the admin gate");
  assert.match(ad, /view === "leads_csv"/, "api/admin.js: CSV export sits behind the admin gate");
  for (const a of ["lead_stage", "lead_note", "lead_next", "lead_link", "lead_unlink", "lead_amount", "lead_archive", "lead_delete"])
    assert.ok(ad.includes(`"${a}"`), `api/admin.js: the ${a} action exists`);
  assert.doesNotMatch(lb, /mergedInto/, "lib/leads.js: records are linked by Stanley in the admin, never auto-joined");
  assert.match(read("assets/admin.js"), /data-lead-stage/, "assets/admin.js: the dashboard moves stages with buttons");
  assert.match(read("assets/admin.js"), /loadLeads\(\)/, "assets/admin.js: the pipeline loads with the rest");
  assert.match(read("admin.html"), /data-tab="leads"/, "admin.html: the Leads tab exists");
  assert.match(srv, /leadsDigest\(\)/, "server.mjs: the daily digest runs");
  assert.match(read("contact.html"), /\/start\?seg=\$\{seg\}/, "contact.html: free topics link to /start with their segment");
  assert.match(read("api/contact.js"), /yebente: \{ dept: "growth"/, "api/contact.js: the paid topics are unchanged");
  assert.doesNotMatch(read("api/contact.js"), /ktown-shop|dev-api/, "api/contact.js: the free topics never reach the paid server");
  const html = read("start.html");
  assert.match(html, /connect-src 'self'/, "start.html: the form calls only this site's API");
  assert.doesNotMatch(html, /connect-src 'self' https?:/, "start.html: no API host beside this site");
  assert.doesNotMatch(html, /src="http/, "start.html: no outside scripts or images (store assets in the repo)");
  assert.match(html, /0707 172 370/, "start.html: the phone placeholder is Stanley's test number");
  assert.match(html, /5tan@altradits\.com/, "start.html: the email placeholder is Stanley's test email");
});

test("a lockdown freezes Developer top-ups but never invoice creation (receiving always works)", () => {
  const dev = read("lib/devapi.js");
  const fn = (name) => {
    const at = dev.indexOf(`export async function ${name}(`);
    const next = dev.indexOf("\nexport async function ", at + 1);
    return dev.slice(at, next === -1 ? undefined : next);
  };
  assert.doesNotMatch(fn("createInvoice"), /checkLockdown\(\)/, "lib/devapi.js createInvoice: receiving stays live during a lockdown");
  assert.match(fn("createTopup"), /await checkLockdown\(\)/, "lib/devapi.js createTopup: top-ups freeze during a lockdown");
  assert.match(dev, /lockdown_freeze/, "lib/devapi.js: the freeze still has its stable error code");
});

