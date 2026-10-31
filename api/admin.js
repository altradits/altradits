// Admin API for Stanley's node dashboard. Every request needs
// Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin                  -> overview: node, chain, Ye₿ente, settlement hooks, visits, system
//   GET  /api/admin?view=channels    -> channels, alerts and advice (lib/channels.js)
//   GET  /api/admin?view=liquidity   -> sending power and top-up amounts
//   GET  /api/admin?view=topup&hash= -> a top-up's state
//   GET  /api/admin?view=security    -> what was turned away, and Bitcoin's attack history
//   GET  /api/admin?view=emails      -> the email log (a wallet email's link is never stored)
//   GET  /api/admin?view=statement   -> money received through the website (&format=csv for the books)
//   GET  /api/admin?view=cv          -> Stanley's first CV, and whether an uploaded CV file is on the server (&file=uploaded downloads it)
//   POST { action: "stan_report" } | { action: "node_topup", sats } | { action: "ln_lesson", text } | { action: "archive_delete", name, confirm: "DELETE" }
import { json, readBody, clean, safeEqual, clientIp } from "../lib/http.js";
import { listIds, getMany, getJSON, usingRedis, hit, peek, listArchives } from "../lib/store.js";
import { lightningMode } from "../lib/lightning.js";

function authorized(request) {
  const token = process.env.ADMIN_TOKEN;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(token) && safeEqual(token, given);
}

const deny = () => json({ error: process.env.ADMIN_TOKEN ? "Wrong admin token." : "Set ADMIN_TOKEN in your environment first." }, 401);

// Wrong tokens are throttled: 20 per connection per 15 minutes, then a pause.
async function gate(request) {
  const key = `rl:admin:fail:${clientIp(request)}`;
  if ((await peek(key)) >= 20) return json({ error: "Too many wrong tokens. Wait 15 minutes and try again." }, 429);
  if (authorized(request)) return null;
  await hit(key, 900);
  // Many wrong tokens across the whole site: Stanley is told, at most once an
  // hour. Never a site-wide lockout, which would let a stranger lock him out.
  const hour = new Date().toISOString().slice(0, 13);
  if ((await hit(`rl:admin:fail:all:${hour}`, 3600)) === 100) {
    const { emailOwner } = await import("../lib/email.js");
    await emailOwner("Many wrong admin tokens", "More than 100 wrong admin tokens were tried in the last hour, from several connections. If that wasn't you, rotate ADMIN_TOKEN in DirectAdmin (openssl rand -hex 32), then Save and Restart the app.").catch(() => {});
  }
  return deny();
}

const settle = (p) => p.then((v) => v, (e) => ({ error: e.message }));

export async function GET(request) {
  { const g = await gate(request); if (g) return g; }
  const view = new URL(request.url).searchParams.get("view");

  if (view === "channels") { const { channelReport } = await import("../lib/channels.js"); try { return json(await channelReport()); } catch (err) { return json({ error: err.message }, 502); } }
  if (view === "liquidity") { const { liquidityView } = await import("../lib/channels.js"); try { return json(await liquidityView()); } catch (err) { return json({ error: err.message }, 502); } }
  if (view === "topup") {
    const { topupStatus } = await import("../lib/channels.js");
    const t = await topupStatus(clean(new URL(request.url).searchParams.get("hash"), 64));
    return t ? json(t) : json({ error: "No such top-up." }, 404);
  }
  if (view === "security") {
    const { securityView } = await import("../lib/attacks.js");
    const { BITCOIN_ATTACKS } = await import("../data/bitcoin-attacks.js");
    return json({ ...(await securityView()), history: BITCOIN_ATTACKS });
  }
  // Money received through the website, and Stanley's CV (the first version, and any file he uploaded).
  if (view === "statement") {
    const { statement, statementCsv } = await import("../lib/statement.js");
    if (new URL(request.url).searchParams.get("format") === "csv") return new Response(await statementCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="altradits-statement-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    return json(await statement());
  }
  if (view === "cv") {
    const fs = await import("node:fs"), path = await import("node:path");
    const { dataDir } = await import("../lib/store.js");
    const md = fs.readFileSync(new URL("../data/cv-initial.md", import.meta.url), "utf8");
    const file = ["pdf", "docx", "txt", "md"].map((ext) => ({ ext, p: path.join(dataDir(), "files", `cv.${ext}`) })).find((f) => fs.existsSync(f.p));
    if (new URL(request.url).searchParams.get("file") === "uploaded") {
      if (!file) return json({ error: "No uploaded CV on the server." }, 404);
      const types = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown" };
      return new Response(fs.readFileSync(file.p), { headers: { "Content-Type": types[file.ext], "Content-Disposition": `attachment; filename="stanley-cv.${file.ext}"`, "Cache-Control": "no-store" } });
    }
    return json({ initial: md, uploaded: file ? { ext: file.ext, bytes: fs.statSync(file.p).size, at: fs.statSync(file.p).mtime.toISOString() } : null });
  }
  if (view === "emails") return json({ emails: (await getMany("email", await listIds("emails", 100))).map(({ text, ...e }) => e) });

  const { nodeInfo, nodeDetails, chainTip, outboundSats, inboundSats, onchainFeeRates } = await import("../lib/lightning.js");
  const [node, details, tip, outbound, inbound, chainFees] = await Promise.all([settle(nodeInfo()), settle(nodeDetails()), settle(chainTip()), settle(outboundSats()), settle(inboundSats()), settle(onchainFeeRates())]);
  const { liabilities, walletsOn, switchOn } = await import("../lib/ywallet.js");
  const owed = walletsOn() ? await settle(liabilities()) : null;
  const openInvoices = (await listIds("ywinvopen", 500)).length;
  return json({
    node: node && !node.error ? { ...node, behind: typeof tip === "number" && node.blockHeight ? Math.max(0, tip - node.blockHeight) : null } : node,
    chainTip: typeof tip === "number" ? tip : null,
    details: details && !details.error ? details : null,
    chainFees: chainFees && !chainFees.error ? chainFees : null,
    liquidity: { outboundSats: typeof outbound === "number" ? outbound : null, inboundSats: typeof inbound === "number" ? inbound : null },
    // How payments reach the node and settle: Lightning addresses (LNURL-pay), invoices, and the background sweep.
    settlement: {
      mode: lightningMode() === "lnd" ? "LND node" : lightningMode() === "address" ? "fallback Lightning address (node not set)" : "not set",
      wallets: walletsOn(), lightningAddresses: walletsOn() ? `handle@${(process.env.SITE_URL || "https://altradits.com").replace(/^https?:\/\//, "")}` : null,
      lnurlp: "/.well-known/lnurlp/<handle>", openInvoices, sweep: walletsOn() && Boolean(process.env.LND_REST_URL) ? "every 2 minutes" : "off",
      payouts: Boolean(process.env.YEBENTE_LND_PAY_MACAROON), telebirr: switchOn("YEBENTE_TELEBIRR"),
    },
    yebente: owed && !owed.error ? { wallets: owed.wallets, owedSats: owed.sats, covered: typeof outbound === "number" ? outbound >= owed.sats : null } : owed,
    visits: await import("../lib/visits.js").then((v) => v.visitSummary()).catch(() => null),
    retired: await getJSON("retired:agency"),
    stan: await import("../lib/stan.js").then((s) => s.stanLast()).catch(() => null),
    archives: listArchives(),
    system: {
      email: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : process.env.EMAIL_TRANSPORT === "sendmail" ? "server mail (sendmail)" : process.env.RESEND_API_KEY ? "Resend" : "log only: set EMAIL_TRANSPORT=sendmail",
      storage: usingRedis ? "Redis" : `file store (${process.env.DATA_DIR || ".data"})`,
    },
  });
}

export async function POST(request) {
  { const g = await gate(request); if (g) return g; }
  const body = await readBody(request);
  if (body.action === "node_topup") {
    const { startTopup } = await import("../lib/channels.js");
    try { return json(await startTopup(body.sats)); } catch (err) { return json({ error: err.message }, err.status || 502); }
  }
  if (body.action === "stan_report") {
    const { sendStanReport } = await import("../lib/stan.js");
    try { return json(await sendStanReport()); } catch (err) { return json({ error: err.message }, 502); }
  }
  if (body.action === "ln_lesson") {
    const { addLesson } = await import("../lib/channels.js");
    try { return json({ lesson: await addLesson(clean(body.text, 600)) }); } catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "archive_delete") {
    if (body.confirm !== "DELETE") return json({ error: "Type DELETE to confirm." }, 400);
    const { deleteArchive } = await import("../lib/store.js");
    try { return json(deleteArchive(clean(body.name, 80))); } catch (err) { return json({ error: err.message }, 400); }
  }
  return json({ error: "Unknown action." }, 400);
}
