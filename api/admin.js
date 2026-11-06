// Admin API for Stanley's node dashboard. Every request needs
// Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin                  -> overview: node, chain, Ye₿ente, settlement hooks, visits, system
//   GET  /api/admin?view=explore     -> the node explorer (read-only: network, channel internals, peers, payments, invoices, coins)
//   GET  /api/admin?view=pnl&days=30 -> profit and loss, and what is yours after Ye₿ente's wallet holders
//   GET  /api/admin?view=wallets     -> every Ye₿ente wallet's balance, and your own wallets with their history
//   GET  /api/admin?view=destinations&days=90 -> where clients' payments out of Ye₿ente go (phone numbers masked)
//   GET  /api/admin?view=walletinvoice&hash= -> has a receive invoice been paid?
//   GET  /api/admin?view=channels    -> channels, alerts and advice (lib/channels.js)
//   GET  /api/admin?view=liquidity   -> sending power and top-up amounts
//   GET  /api/admin?view=topup&hash= -> a top-up's state
//   GET  /api/admin?view=security    -> what was turned away, and Bitcoin's attack history
//   GET  /api/admin?view=emails      -> the email log (a wallet email's link is never stored)
//   GET  /api/admin?view=statement   -> money received through the website (&format=csv for the books)
//   GET  /api/admin?view=activity&days=30 -> Ye₿ente deposits and transactions per wallet, most active first
//   GET  /api/admin?view=trivia -> Mempool Mayhem games with pools; ?view=trivia_game&game= -> one game: pool, ledger, donors, payouts
//   POST { action: "stan_report" } | { action: "node_topup", sats } | { action: "address_qr", address } | { action: "ln_lesson", text } | { action: "archive_delete", name, confirm: "DELETE" }
//   POST { action: "trivia_create", id?, title, startsAt?, players? } | { action: "trivia_schedule", id, startsAt } | { action: "trivia_cancel", id, rule: "keep"|"return", note?, nextGame? } | { action: "trivia_payout", game, winner, to, pin }
//   POST { action: "ktown_block" | "ktown_unblock" | "ktown_release", phone } (kTown squatter tools, docs/ktown.md)
import { json, readBody, clean, newId, adminAuthed, clientIp, siteUrl, EMAIL_RE } from "../lib/http.js";
import { listIds, getMany, getJSON, setJSON, pushId, usingRedis, hit, peek, listArchives } from "../lib/store.js";
import { lightningMode } from "../lib/lightning.js";

function authorized(request) {
  return adminAuthed(request.headers.get("authorization"));
}

const deny = () => json({ error: process.env.ADMIN_TOKEN ? "Wrong admin token." : "Set ADMIN_TOKEN in your environment first." }, 401);

// Wrong tokens are throttled: 20 per connection per 15 minutes, then a pause.
async function gate(request) {
  const ip = clientIp(request);
  const key = `rl:admin:fail:${ip}`;
  if ((await peek(key)) >= 20) return json({ error: "Too many wrong tokens. Wait 15 minutes and try again." }, 429);
  if (authorized(request)) {
    const { noteAdminSignIn } = await import("../lib/deadman.js");
    await noteAdminSignIn(ip).catch(() => {});
    return null;
  }
  await hit(key, 900);
  const { recordAttack } = await import("../lib/attacks.js");
  await recordAttack("admin_token_guess", { where: `${request.method} /api/admin`, ip: ip || "" }).catch(() => {});
  // Many wrong tokens across the whole site: Stanley is told, at most once an
  // hour. Never a site-wide lockout, which would let a stranger lock him out.
  const hour = new Date().toISOString().slice(0, 13);
  if ((await hit(`rl:admin:fail:all:${hour}`, 3600)) === 100) {
    const { emailOwner } = await import("../lib/email.js");
    await emailOwner("Many wrong admin tokens", "More than 100 wrong admin tokens were tried in the last hour, from several connections. If that wasn't you, rotate ADMIN_TOKEN in DirectAdmin (openssl rand -hex 32), then Save and Restart the app.", null, "trust").catch(() => {});
  }
  return deny();
}

// A part that fails or takes longer than 8 s becomes { error }, so the rest of the dashboard still loads.
// The same 8 s limit, but failing: for a view that is all node data, so the page says why it's empty.
const within = (p, ms = 8000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("The node took too long to answer.")), ms).unref?.())]);
const settle = (p, ms = 8000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("The node took too long to answer.")), ms).unref?.())]).then((v) => v, (e) => ({ error: e.message }));

export async function GET(request) {
  { const g = await gate(request); if (g) return g; }
  const view = new URL(request.url).searchParams.get("view");

  // The node explorer: network, channel internals, peers, payments, invoices, coins and closed channels.
  if (view === "explore") { const { nodeExplorer } = await import("../lib/lightning.js"); const d = await settle(nodeExplorer()); return json(d || { error: "The node isn't connected." }); }
  // Profit and loss over a period, and what is yours after Ye₿ente's wallet holders.
  if (view === "pnl") {
    const days = Math.min(3650, Math.max(1, Math.floor(Number(new URL(request.url).searchParams.get("days") ?? 30)) || 30));
    const { profitLoss } = await import("../lib/pnl.js");
    try { return json(await within(profitLoss({ days }))); } catch (err) { return json({ error: err.message }, 502); }
  }
  // Ye₿ente: every wallet's balance, your own wallets in detail, and where clients' payments go.
  if (view === "wallets") {
    const { walletBalances } = await import("../lib/activity.js");
    const { walletByHandle, history, DOMAIN } = await import("../lib/ywallet.js");
    const mine = [];
    for (const h of (await getJSON("admin:mywallets")) || []) {
      const w = await walletByHandle(h);
      if (!w) { mine.push({ handle: h, missing: true }); continue; }
      mine.push({ handle: w.handle, address: `${w.handle}@${DOMAIN()}`, balance: Number(w.balance) || 0, createdAt: w.createdAt,
        history: (await history(w.id, 15)).map((e) => ({ at: e.at, kind: e.kind, sats: e.sats, fee: e.fee || 0, status: e.status, counterparty: e.counterparty || "", receiptUrl: /^https:\/\//.test(e.receiptUrl || "") ? e.receiptUrl : null })) });
    }
    return json({ ...(await walletBalances()), mine });
  }
  if (view === "destinations") {
    const days = Math.min(3650, Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("days") ?? 90)) || 0));
    const { destinations } = await import("../lib/activity.js");
    return json(await destinations({ days }));
  }
  if (view === "walletinvoice") {
    const inv = await getJSON(`ywinv:${clean(new URL(request.url).searchParams.get("hash"), 64)}`);
    return inv ? json({ state: inv.state, sats: inv.sats }) : json({ error: "No such invoice." }, 404);
  }
  if (view === "channels") { const { channelReport } = await import("../lib/channels.js"); try { return json(await within(channelReport())); } catch (err) { return json({ error: err.message }, 502); } }
  if (view === "liquidity") { const { liquidityView } = await import("../lib/channels.js"); try { return json(await within(liquidityView())); } catch (err) { return json({ error: err.message }, 502); } }
  if (view === "topup") {
    const { topupStatus } = await import("../lib/channels.js");
    const t = await topupStatus(clean(new URL(request.url).searchParams.get("hash"), 64));
    return t ? json(t) : json({ error: "No such top-up." }, 404);
  }
  if (view === "mktcustom") {
    const { CUSTOM_KEY } = await import("../lib/marketing.js");
    const month = clean(new URL(request.url).searchParams.get("month"), 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: "Pick a month from the schedule." }, 400);
    return json({ posts: (await getJSON(CUSTOM_KEY(month))) || [] });
  }
  if (view === "mktideas") {
    const { IDEAS_KEY } = await import("../lib/marketing.js");
    return json({ ideas: (await getJSON(IDEAS_KEY)) || [] });
  }
  if (view === "security") {
    const { securityView } = await import("../lib/attacks.js");
    const { deadmanStatus } = await import("../lib/deadman.js");
    const { BITCOIN_ATTACKS } = await import("../data/bitcoin-attacks.js");
    return json({ ...(await securityView()), deadman: deadmanStatus(), history: BITCOIN_ATTACKS });
  }
  if (view === "choumi" || view === "ai") {
    return json(await buildChoumiView());
  }
  // Money received through the website.
  if (view === "statement") {
    const { statement, statementCsv } = await import("../lib/statement.js");
    if (new URL(request.url).searchParams.get("format") === "csv") return new Response(await statementCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="altradits-statement-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    return json(await statement());
  }
  // Ye₿ente deposits and transactions per wallet, most active first (for rewards).
  if (view === "activity") {
    const days = Math.min(3650, Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("days") ?? 30)) || 0));
    const { walletActivity } = await import("../lib/activity.js");
    return json(await walletActivity({ days }));
  }
  if (view === "emails") return json({ emails: (await getMany("email", await listIds("emails", 100))).map(({ text, ...e }) => e) });
  // Mempool Mayhem: games with pools (reads stay up when the switch is off).
  if (view === "trivia") {
    const dn = await import("../lib/trivia-donors.js");
    const ids = await listIds("trv:games", 200);
    const games = [];
    for (const id of ids) {
      const m = await dn.gameMeta(id);
      if (!m) continue;
      const t = await dn.ledgerTotals(id).catch(() => ({ net: 0, count: 0 }));
      games.push({ id: m.id, title: m.title, status: m.status, startsAt: m.startsAt, players: m.players.length, winners: m.winners, poolSats: t.net, entries: t.count, cancel: m.cancel });
    }
    return json({ games, house: clean(process.env.TRIVIA_HOUSE_WALLET, 40) || null, rules: dn.CANCEL_RULES });
  }
  if (view === "trivia_game") {
    const dn = await import("../lib/trivia-donors.js");
    const game = clean(new URL(request.url).searchParams.get("game"), 64);
    try {
      const meta = await dn.gameMeta(game);
      if (!meta) return json({ error: "No such game." }, 404);
      const intents = await getMany("trv:don", await listIds(`trv:dons:${game}`, 2000));
      return json({ meta, pool: await dn.poolView(game), payouts: await dn.payoutsOf(game),
        donors: intents.map((i) => ({ hash: i.hash, sats: i.sats, target: i.target, message: i.message, state: i.state, at: i.at, paidAt: i.paidAt || null, carriedTo: i.carriedTo || null })),
        ledger: { entries: await dn.ledgerEntries(game, 500), totals: await dn.ledgerTotals(game) } });
    } catch (err) { return json({ error: err.message }, err.status || 400); }
  }

  const { nodeInfo, nodeDetails, chainTip, outboundSats, inboundSats, onchainFeeRates, openChannelPoints } = await import("../lib/lightning.js");
  const { btcKes } = await import("../lib/lightning.js");
  const [node, details, tip, outbound, inbound, chainFees, kes, points] = await Promise.all([settle(nodeInfo()), settle(nodeDetails()), settle(chainTip()), settle(outboundSats()), settle(inboundSats()), settle(onchainFeeRates()), settle(btcKes()), settle(openChannelPoints())]);
  try { return await overview(node, details, tip, outbound, inbound, chainFees, kes, points); }
  catch (err) { return json({ error: `The dashboard couldn't load: ${err.message}` }, 500); }
}

async function overview(node, details, tip, outbound, inbound, chainFees, kes, points) {
  const { liabilities, walletsOn, switchOn } = await import("../lib/ywallet.js");
  const { backupStatus } = await import("../lib/scb.js");
  const owed = walletsOn() ? await settle(liabilities()) : null;
  const openInvoices = (await listIds("ywinvopen", 500)).length;
  const backup = points && !points.error ? await backupStatus(points) : { markedAt: (await getJSON("backup:scb"))?.at || null, stale: null, opened: [], closed: [], current: null, nodeRead: false };
  const alerts = (await getMany("email", await listIds("emails", 200))).filter((e) => e.kind === "owner").slice(0, 20).map(({ at, subject, status }) => ({ at, subject, status }));
  return json({
    node: node && !node.error ? { ...node, behind: typeof tip === "number" && node.blockHeight ? Math.max(0, tip - node.blockHeight) : null } : node,
    chainTip: typeof tip === "number" ? tip : null,
    kesPerBtc: typeof kes === "number" ? Math.round(kes) : null, // shillings per bitcoin, for KSh beside sats
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
    alerts,
    backup,
    deadman: await import("../lib/deadman.js").then((d) => d.deadmanStatus()).catch(() => null),
    ai: await import("../lib/ai.js").then((a) => a.deptPowerView()).catch(() => null),
    archives: listArchives(),
    system: {
      email: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : process.env.EMAIL_TRANSPORT === "sendmail" ? "server mail (sendmail)" : process.env.RESEND_API_KEY ? "Resend" : "log only: set EMAIL_TRANSPORT=sendmail",
      storage: usingRedis ? "Redis" : `file store (${process.env.DATA_DIR || ".data"})`,
    },
  });
}

async function buildChoumiView() {
  const { deptPowerView } = await import("../lib/ai.js");
  const { deadmanStatus, lastSecurityDrill } = await import("../lib/deadman.js");
  const { DEPARTMENTS } = await import("../data/playbooks.js");
  const { allTasks, opsSummary } = await import("../lib/ops.js");
  const { CHOUMI, pendingDrafts, recentInstructions, stanLast, securityLessonOfTheDay } = await import("../lib/stan.js");
  const { learningView } = await import("../lib/learning.js");

  const view = deptPowerView();
  const ai = { ...view, incidentOverrideActive: Boolean(view.incidentOverride) };
  const deadman = { ...deadmanStatus(), lastDrill: await lastSecurityDrill().catch(() => null) };
  const [tasks, ops, approvals, instructions, learning, lastReport, contact, replies] = await Promise.all([
    allTasks(120).catch(() => []),
    opsSummary().catch(() => ({ total: 0, counts: {}, satisfaction: null, recent: [] })),
    pendingDrafts(50).catch(() => []),
    recentInstructions(20).catch(() => []),
    learningView().catch(() => ({ totalRules: 0, totalExemplars: 0, answerBankCount: 0, departments: [], byDepartment: {}, answers: [], recentTrajectories: [], digests: {} })),
    stanLast().catch(() => null),
    listIds("contact:inbox", 30).then((ids) => getMany("contact:msg", ids)).catch(() => []),
    listIds("reply:inbox", 30).then((ids) => getMany("reply", ids)).catch(() => []),
  ]);

  const powerMap = Object.fromEntries((ai.departments || []).map((d) => [d.id, d]));
  const departments = DEPARTMENTS.map((d) => {
    const deptTasks = tasks.filter((t) => t.department === d.id);
    const last = deptTasks[0] || null;
    const qaDecision = last?.qa?.final
      ? (last.qa.final.approve ? "approve" : "revise")
      : last?.qa?.rounds?.length
        ? (last.qa.rounds.at(-1)?.passed ? "approve" : "revise")
        : null;
    const qaHeadline = last?.qa?.final?.subject || (last?.qa?.final?.issues || [])[0] || "";
    return {
      id: d.id,
      name: d.name,
      agent: { name: d.agent.name, title: d.agent.title, persona: d.agent.persona },
      currentWork: d.currentWork,
      security: d.security,
      power: powerMap[d.id] || { id: d.id, on: false, today: { calls: 0, usd: 0 }, month: { calls: 0, usd: 0 } },
      queue: deptTasks.filter((t) => t.status === "queued" || t.status === "working").length,
      waiting: deptTasks.filter((t) => ["owner", "review", "held", "waiting_client", "follow_up"].includes(t.status)).length,
      doneCount: deptTasks.filter((t) => t.status === "done").length,
      lastTask: last
        ? {
            id: last.id,
            title: last.title,
            status: last.status,
            updatedAt: last.updatedAt || last.createdAt,
            lastOutput: last.deliverable?.summary || (last.deliverable?.files?.[0]?.content ? String(last.deliverable.files[0].content).slice(0, 240) : ""),
            qaVerdict: qaDecision,
            qaHeadline,
            qaRounds: last.qa?.rounds?.length || 0,
          }
        : null,
    };
  });

  return {
    identity: CHOUMI,
    ai,
    deadman,
    departments,
    ops,
    approvals,
    contact,
    replies,
    instructions,
    learning,
    report: { last: lastReport, lesson: securityLessonOfTheDay() },
    settlingIn: {
      issueNumber: 248,
      issueUrl: "https://github.com/altradits/altradits/issues/248",
      workingMemoryIssue: 253,
      workingMemoryUrl: "https://github.com/altradits/altradits/issues/253",
      summary: "Choumi Yakunte and the 5 background departments are back in altradits/altradits with the 2-step Deadman's Switch, per-department power buttons (off by default, $10/month ceiling, $2/incident cap, 20 worker calls/day), 4-step QA, and continual learning.",
      decisions: [
        "Keep lib/stan.js in code; display name is Choumi Yakunte",
        "Power buttons start OFF by default; only Stanley turns them on or off",
        "Monthly AI ceiling $10, incident cap $2, WORKER_CALLS_PER_DAY = 20",
        "Deadman's Switch Step 1 freezes money & outgoing actions in plain code; Step 2 wakes tech, admin, growth & personal while social & marketing stay silent",
        "Deferred until requested: inbox reading, marketing autoposting, career tools",
      ],
      openQuestions: [
        { id: "signers", text: "On the server, run ls -l ~/.altradits-allowed-signers to confirm signed-code-only deploy is active." },
        { id: "node_read_alert", text: "Follow-up issue: alert when the Deadman's balance check cannot read the node several times in a row." },
      ],
    },
  };
}

export async function POST(request) {
  { const g = await gate(request); if (g) return g; }
  const body = await readBody(request);
  if (body.action === "node_topup") {
    const { deadmanActive } = await import("../lib/deadman.js");
    if (deadmanActive()) return json({ error: "Deadman's Switch is active: node top-ups are paused until you lift the lockdown." }, 503);
    const { startTopup } = await import("../lib/channels.js");
    try { return json(await startTopup(body.sats)); } catch (err) { return json({ error: err.message }, err.status || 502); }
  }
  if (body.action === "backup_marked") {
    const { openChannelPoints } = await import("../lib/lightning.js");
    const { markBackup } = await import("../lib/scb.js");
    try {
      const points = await openChannelPoints();
      const record = await markBackup(points);
      return json({ ok: true, markedAt: record.at, channels: points.length });
    } catch (err) { return json({ error: `The node couldn't be read, so the copy can't be confirmed: ${err.message}` }, 502); }
  }
  if (body.action === "address_qr") {
    const { validDepositAddress, qrSvg } = await import("../lib/lightning.js");
    const address = String(body.address || "").trim();
    if (!validDepositAddress(address)) return json({ error: "That isn't a bc1q address from your node. On the Mac run lncli --lnddir=$HOME/.lnd-altradits --network=mainnet newaddress p2wkh and paste the whole address." }, 400);
    if ((await hit("rl:addrqr", 3600)) > 60) return json({ error: "Too many QR codes. Try again in an hour." }, 429);
    return json({ address, qr: await qrSvg(address) });
  }
  if (body.action === "deadman_trip") {
    const { tripDeadman } = await import("../lib/deadman.js");
    try { return json(await tripDeadman({ trigger: "manual", reason: clean(body.reason, 200) || "Manual trigger from /admin", detail: clean(body.detail, 400) })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "deadman_lift") {
    const { liftDeadman } = await import("../lib/deadman.js");
    try { return json(await liftDeadman({ by: "stanley", note: clean(body.note, 500), checklist: body.checklist, force: body.force })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "deadman_checklist") {
    const { updateDeadmanChecklist } = await import("../lib/deadman.js");
    try { return json(await updateDeadmanChecklist(body.checklist || {}, { by: "stanley" })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "deadman_drill") {
    const { runSecurityDrill } = await import("../lib/deadman.js");
    try { return json(await runSecurityDrill({ scenario: clean(body.scenario, 80) || "intrusion_drill", lesson: clean(body.lesson, 500) })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "dept_power") {
    const { setDeptPower } = await import("../lib/ai.js");
    try { return json(setDeptPower(clean(body.dept, 40), Boolean(body.on), { by: "stanley" })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "dept_power_all") {
    const { setAllDeptPower } = await import("../lib/ai.js");
    try { return json(setAllDeptPower(Boolean(body.on), { by: "stanley" })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "ai_resume") {
    const { resumeAi, deptPowerView } = await import("../lib/ai.js");
    resumeAi();
    return json(deptPowerView());
  }
  if (body.action === "node_action_record") {
    const { recordNodeAction } = await import("../lib/deadman.js");
    try { return json(await recordNodeAction({ sats: body.sats, reason: clean(body.reason, 200), by: "stanley" })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "contact_read") {
    const m = await getJSON(`contact:msg:${clean(body.id, 80)}`);
    if (!m) return json({ error: "No such message." }, 404);
    m.handled = true;
    await setJSON(`contact:msg:${m.id}`, m);
    return json({ ok: true });
  }
  if (body.action === "contact_ack") {
    const m = await getJSON(`contact:msg:${clean(body.id, 80)}`);
    if (!m) return json({ error: "No such message." }, 404);
    if (m.held) return json({ error: "Security hold: decide on this message yourself. Never draft from held text." }, 400);
    if (!m.email) return json({ error: "Erased: no address left to reply to." }, 400);
    const { queueContactReply } = await import("../lib/stan.js");
    const draft = await queueContactReply({ to: m.email, dept: m.dept,
      subject: `Re: ${m.label}`,
      text: `Hi ${m.name},\n\nYour message about ${m.label.toLowerCase()} reached the right team, and Choumi's team is reading it. Stanley approves every reply himself, so please give us a little time.\n\nIf you wrote about your Ye₿ente wallet, help with it is already on the way.` });
    m.handled = true;
    m.ack = draft.id;
    await setJSON(`contact:msg:${m.id}`, m);
    return json({ ok: true, draft: draft.id });
  }
  if (body.action === "erase_person") {
    if (body.confirm !== "ERASE") return json({ error: "Type ERASE to confirm." }, 400);
    const { erasePerson } = await import("../lib/cleanup.js");
    try { return json({ ok: true, ...(await erasePerson(clean(body.email, 200))) }); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "contact_resend") {
    // Re-send a payer's receipt email from finance with the current
    // year-tagged number and link. Stanley's click is the approval; at most
    // one resend per receipt per hour, so a double-click never spams.
    const m = await getJSON(`contact:msg:${clean(body.id, 80)}`);
    if (!m) return json({ error: "No such message." }, 404);
    if (!EMAIL_RE.test(m.email || "")) return json({ error: "That message has no valid email address." }, 400);
    const last = (m.resends || []).at(-1);
    if (last && Date.now() - Date.parse(last) < 3600e3) return json({ error: "This receipt was already re-sent in the last hour." }, 429);
    const { displayReceipt } = await import("../lib/receipts.js");
    const { sendContactReceipt } = await import("./contact.js");
    const sent = await sendContactReceipt({ to: m.email, name: m.name, sats: m.sats, label: m.label || m.topic,
      dept: m.dept, receipt: displayReceipt(m.receipt, m.paidAt || m.at), hash: m.hash, site: siteUrl(request) });
    if (String(sent?.status || "").startsWith("failed")) return json({ error: "The email did not go out. Check the mail setup and try again." }, 502);
    m.resends = [...(m.resends || []), new Date().toISOString()].slice(-5);
    await setJSON(`contact:msg:${m.id}`, m);
    return json({ ok: true });
  }
  if (body.action === "reply_screen") {
    // A reply pasted from the mailbox: screened before anyone acts on it.
    const from = clean(body.from, 120);
    const text = clean(body.text, 4000);
    const { commsFor } = await import("../data/team-comms.js");
    const dept = commsFor(clean(body.dept, 40)).id;
    if (!EMAIL_RE.test(from)) return json({ error: "Who is it from? Give their email address." }, 400);
    if (text.length < 2) return json({ error: "Paste the reply text to screen it." }, 400);
    const { screen, describe, defang } = await import("../lib/screen.js");
    const s = screen(`${from}\n${text}`);
    const held = s.flagged ? { at: new Date().toISOString(), reasons: s.reasons } : null;
    const id = newId(8);
    await setJSON(`reply:${id}`, { id, at: new Date().toISOString(), from, text, dept, held, handled: false });
    await pushId("reply:inbox", id);
    if (held) {
      const { recordAttack } = await import("../lib/attacks.js");
      await recordAttack(s.reasons.includes("instructions") ? "prompt_injection" : "hidden_content",
        { where: `email reply ${id}`, detail: `${describe(s.reasons)}: ${defang(text).slice(0, 160)}` }).catch(() => {});
    }
    return json({ ok: true, id, held });
  }
  if (body.action === "reply_read") {
    const m = await getJSON(`reply:${clean(body.id, 80)}`);
    if (!m) return json({ error: "No such reply." }, 404);
    m.handled = true;
    await setJSON(`reply:${m.id}`, m);
    return json({ ok: true });
  }
  if (body.action === "reply_reject") {
    // Reject an email reply with the department's fixed message. The text is
    // fixed (no quoted reply, no free text), Stanley's click is the approval,
    // and the security filter still screens it before it leaves.
    const m = await getJSON(`reply:${clean(body.id, 80)}`);
    if (!m) return json({ error: "No such reply." }, 404);
    if (m.rejected) return json({ error: "This reply was already rejected. Never send twice." }, 400);
    const { commsFor, rejectFor } = await import("../data/team-comms.js");
    const dept = commsFor(m.dept || "office").id;
    const tpl = rejectFor(dept);
    const { screenOutbound, describe } = await import("../lib/screen.js");
    const s = screenOutbound(`${tpl.subject}\n${tpl.text}`);
    if (s.flagged) return json({ error: `Security filter refused the rejection message: ${describe(s.reasons)}.` }, 400);
    const { sendEmail } = await import("../lib/email.js");
    const sent = await sendEmail({ to: m.from, subject: tpl.subject, text: tpl.text, kind: "wallet", fromDept: dept, sender: commsFor(dept).signature });
    m.handled = true;
    m.rejected = { at: new Date().toISOString(), dept, emailId: sent.id };
    await setJSON(`reply:${m.id}`, m);
    return json({ ok: true, emailId: sent.id });
  }
  if (body.action === "draft_decide") {
    const { decideDraft } = await import("../lib/stan.js");
    try { return json(await decideDraft(clean(body.id, 80), { approve: Boolean(body.approve), note: clean(body.note, 500), by: "stanley" })); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "task_create") {
    const title = clean(body.title, 200);
    if (!title) return json({ error: "Give the task a title first." }, 400);
    const { createTask } = await import("../lib/ops.js");
    try {
      const task = await createTask({
        title,
        details: clean(body.details, 4000),
        department: clean(body.department, 40),
        service: clean(body.service, 80),
        due: clean(body.due, 40),
        by: "Stanley",
      });
      return json({ ok: true, task });
    } catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "task_work") {
    const { processQueue } = await import("../lib/workers.js");
    try {
      const count = await processQueue(Math.min(10000, Math.max(500, Number(body.budgetMs) || 5000)));
      return json({ ok: true, count });
    } catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "task_decide") {
    const id = clean(body.id, 80);
    const sub = clean(body.subaction, 40);
    const note = clean(body.note, 2000);
    if (!id) return json({ error: "Task ID is required." }, 400);
    const { releaseTask, cancelTask, answerTask, rerunTask, approveTask, closeTask } = await import("../lib/ops.js");
    try {
      if (sub === "release") return json({ ok: true, task: await releaseTask(id, { note, by: "stanley" }) });
      if (sub === "cancel") return json({ ok: true, task: await cancelTask(id, { note, by: "stanley" }) });
      if (sub === "answer") return json({ ok: true, task: await answerTask(id, { answer: note, by: "stanley" }) });
      if (sub === "rerun") return json({ ok: true, task: await rerunTask(id, { note, by: "stanley" }) });
      if (sub === "approve") return json({ ok: true, task: await approveTask(id, { rating: Number(body.rating) || 5, comment: note, by: "stanley" }) });
      if (sub === "close") return json({ ok: true, task: await closeTask(id, { note, by: "stanley" }) });
      return json({ error: "Unknown task subaction." }, 400);
    } catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "learning_rule") {
    const note = clean(body.note, 500);
    if (!note) return json({ error: "Write a rule to save first." }, 400);
    const { recordOutcome } = await import("../lib/learning.js");
    try {
      const r = await recordOutcome({
        kind: "stanley_override",
        dept: clean(body.dept, 40) || "all",
        service: clean(body.service, 80) || "general",
        note,
      });
      // The security screen drops rules that look like links, code, commands or requests for secrets.
      if (!r?.traj?.distilledRuleIds?.length) return json({ error: "The security screen didn't save this rule: it looks like a link, code, a command or a request for secrets. Reword it in plain words." }, 400);
      return json({ ok: true, ruleIds: r.traj.distilledRuleIds });
    } catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "learning_consolidate") {
    const { consolidateLearning, learningView } = await import("../lib/learning.js");
    try {
      const consolidated = await consolidateLearning();
      return json({ ok: true, consolidated, learning: await learningView() });
    } catch (err) { return json({ error: err.message }, 400); }
  }
  // Your wallets: a list of handles you keep an eye on, and invoices to receive into them.
  // Sending needs the wallet's PIN on a trusted device, so it happens in the Ye₿ente app, never here.
  if (body.action === "my_wallet_add" || body.action === "my_wallet_remove") {
    const h = clean(body.handle, 40).toLowerCase().replace(/@.*$/, "");
    const list = (await getJSON("admin:mywallets")) || [];
    if (body.action === "my_wallet_add") {
      const { walletByHandle } = await import("../lib/ywallet.js");
      if (!(await walletByHandle(h))) return json({ error: "No Ye₿ente wallet with that handle." }, 404);
      if (!list.includes(h)) list.push(h);
    }
    await setJSON("admin:mywallets", body.action === "my_wallet_add" ? list : list.filter((x) => x !== h));
    return json({ ok: true });
  }
  if (body.action === "wallet_invoice") {
    const h = clean(body.handle, 40).toLowerCase();
    if (!((await getJSON("admin:mywallets")) || []).includes(h)) return json({ error: "Add the wallet to your list first." }, 400);
    const { walletByHandle, invoiceFor } = await import("../lib/ywallet.js");
    const { qrSvg } = await import("../lib/lightning.js");
    try {
      const r = await invoiceFor(await walletByHandle(h), body.sats, { memo: "Ye₿ente payment" });
      return json({ ...r, qr: await qrSvg(`lightning:${r.invoice}`.toUpperCase()) });
    } catch (err) { return json({ error: err.message }, err.status || 400); }
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
  // kTown squatter tools: block a phone number from registering (or lift
  // the block), or release a merchant record so its number can sign up
  // again. Every one is logged in the Security watch. Payment entries are
  // never touched. Docs: docs/ktown.md.
  if (body.action === "ktown_block" || body.action === "ktown_unblock" || body.action === "ktown_release") {
    const kt = await import("../lib/ktown.js");
    try {
      if (body.action === "ktown_block") return json({ ok: true, phone: await kt.blockPhone(body.phone) });
      if (body.action === "ktown_unblock") return json({ ok: true, phone: await kt.unblockPhone(body.phone) });
      return json({ ok: true, ...(await kt.releaseMerchantByPhone(body.phone)) });
    } catch (err) { return json({ error: err.message }, err.status || 400); }
  }
  // Mempool Mayhem: create, schedule, cancel (with the written rule), and pay
  // winners. Writes need TRIVIA=on; payouts travel only via the wallet payout
  // path (PIN, caps, lockdown), and the PIN is passed through, never stored.
  if (body.action === "trivia_create" || body.action === "trivia_schedule" || body.action === "trivia_cancel" || body.action === "trivia_payout") {
    const dn = await import("../lib/trivia-donors.js");
    try {
      if (body.action === "trivia_create") return json({ ok: true, game: await dn.createGame({ id: body.id ? clean(body.id, 64) : undefined, title: body.title, startsAt: body.startsAt || null, players: body.players || [] }) });
      if (body.action === "trivia_schedule") return json({ ok: true, game: await dn.scheduleGame(clean(body.id, 64), body.startsAt) });
      if (body.action === "trivia_cancel") return json({ ok: true, cancel: await dn.cancelGame(clean(body.id, 64), { rule: body.rule, note: body.note || "", nextGame: body.nextGame || null }) });
      return json({ ok: true, payout: await dn.approvePayout(clean(body.game, 64), { winner: body.winner, to: body.to, pin: body.pin }) });
    } catch (err) { return json({ error: err.message }, err.status || 400); }
  }
  if (body.action === "mkt_idea_save" || body.action === "mkt_idea_delete") {
    const { IDEAS_KEY, validateIdea } = await import("../lib/marketing.js");
    const list = ((await getJSON(IDEAS_KEY)) || []).filter((e) => e && e.id);
    if (body.action === "mkt_idea_delete") {
      const id = String(body.id || "");
      await setJSON(IDEAS_KEY, list.filter((e) => e.id !== id));
      return json({ removed: id });
    }
    try {
      const idea = validateIdea(body, list);
      const at = list.findIndex((e) => e.id === idea.id);
      if (at < 0) list.push(idea); else list[at] = idea;
      await setJSON(IDEAS_KEY, list);
      return json({ ok: true, idea });
    } catch (err) { return json({ error: err.message }, 400); }
  }
  if (body.action === "mkt_place" || body.action === "mkt_remove") {
    const { CUSTOM_KEY, validateCustomPost } = await import("../lib/marketing.js");
    const { readFileSync } = await import("node:fs");
    let months = [];
    try { months = JSON.parse(readFileSync(new URL("../assets/marketing/months.json", import.meta.url), "utf8")); } catch { months = []; }
    const month = String(body.month || "");
    if (!months.includes(month)) return json({ error: "Pick a month from the schedule." }, 400);
    const list = ((await getJSON(CUSTOM_KEY(month))) || []).filter((p) => p && p.date);
    if (body.action === "mkt_remove") {
      const date = String(body.date || "");
      await setJSON(CUSTOM_KEY(month), list.filter((p) => p.date !== date));
      return json({ removed: date });
    }
    try {
      const post = validateCustomPost(body, months);
      await setJSON(CUSTOM_KEY(month), [...list.filter((p) => p.date !== post.date), post]);
      return json({ placed: post.date });
    } catch (err) { return json({ error: err.message }, 400); }
  }
  return json({ error: "Unknown action." }, 400);
}
