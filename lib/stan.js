// Stan: security and communication. The rest of Stan's old team moved to
// altradits/chouMi; here he keeps watch and keeps Stanley informed.
// - Every alert to Stanley comes from Stan (lib/email.js, kind "owner"): attacks
//   the security watch turns away, channel trouble, Ye₿ente shortfalls, wrong admin tokens.
// - Once a day Stan sends a short report: the node against the chain tip, sending
//   power, Ye₿ente's balances, and what the security watch saw in the last 24 hours.
//   Stanley can ask for it any time from the admin.
import { getJSON, setJSON, listIds, getMany } from "./store.js";
import { sendEmail, OWNER_EMAIL } from "./email.js";

const DAY = 864e5;
const fmt = (n) => (n === null || n === undefined ? "unknown" : `${Math.round(n).toLocaleString("en-US")} sats`);
const settle = (p) => p.then((v) => v, () => null);

// What Stan knows right now. Pure data, no secrets.
export async function stanStatus(now = Date.now()) {
  const ln = await import("./lightning.js");
  const [node, tip, outbound] = await Promise.all([settle(ln.nodeInfo()), settle(ln.chainTip()), settle(ln.outboundSats())]);
  const { liabilities, walletsOn } = await import("./ywallet.js");
  const owed = walletsOn() ? await settle(liabilities()) : null;
  const { securityView, TECHNIQUES } = await import("./attacks.js");
  const sec = await settle(securityView());
  const day = (sec?.events || []).filter((e) => now - Date.parse(e.at) < DAY);
  const byKind = {};
  for (const e of day) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  const emails = (await getMany("email", await listIds("emails", 200))).filter((e) => now - Date.parse(e.at) < DAY);
  return {
    node: node && !node.error ? { ...node, behind: typeof tip === "number" && node.blockHeight ? Math.max(0, tip - node.blockHeight) : null } : node,
    tip, outbound, owed,
    security: Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ kind, name: TECHNIQUES[kind]?.name || kind, severity: TECHNIQUES[kind]?.severity || "low", n })),
    emailsFailed: emails.filter((e) => /^failed|^bounced/.test(e.status)).length,
  };
}

// The report as plain sentences, most urgent first.
export function stanReportText(s) {
  const lines = [], todo = [];
  if (!s.node) { lines.push("Node: not connected to the website."); todo.push("Connect the node (LND_REST_URL and the macaroons in DirectAdmin)."); }
  else if (s.node.error) { lines.push(`Node: can't read it (${s.node.error})`); todo.push("Check the node and the tunnel are running."); }
  else {
    lines.push(`Node: block ${s.node.blockHeight.toLocaleString("en-US")}${s.tip ? ` (chain tip ${s.tip.toLocaleString("en-US")}${s.node.behind ? `, ${s.node.behind} behind` : ", in step"})` : ""}; ${s.node.synced ? "synced" : "NOT synced"}; ${s.node.activeChannels} channel${s.node.activeChannels === 1 ? "" : "s"} active, ${s.node.peers} peer${s.node.peers === 1 ? "" : "s"}.`);
    if (!s.node.synced || (s.node.behind || 0) > 3) todo.push("The node is behind the chain: check its internet and that bitcoind is syncing.");
    if (!s.node.activeChannels) todo.push("No active channel: Lightning payments can't move.");
  }
  lines.push(`Can send: ${fmt(s.outbound)}.`);
  if (s.owed) {
    lines.push(`Ye₿ente: ${s.owed.wallets} wallet${s.owed.wallets === 1 ? "" : "s"} holding ${fmt(s.owed.sats)}.`);
    if (typeof s.outbound === "number" && s.outbound < s.owed.sats) todo.push(`The node can send less than wallets hold: top up at least ${fmt(s.owed.sats - s.outbound)} (admin → Sending power).`);
  }
  const high = s.security.filter((x) => x.severity === "high");
  lines.push(s.security.length ? `Security, last 24 hours: ${s.security.map((x) => `${x.name} ×${x.n}`).join(", ")}.` : "Security, last 24 hours: nothing turned away.");
  if (high.length) todo.push(`High-severity attempts: ${high.map((x) => x.name).join(", ")}. All were turned away; details in admin → Stan.`);
  if (s.emailsFailed) todo.push(`${s.emailsFailed} email${s.emailsFailed === 1 ? "" : "s"} failed to send in the last 24 hours (admin → Emails sent).`);
  return { subject: todo.length ? `Stan: ${todo.length} thing${todo.length === 1 ? "" : "s"} need you` : "Stan: all quiet",
    text: `${todo.length ? `Needs you:\n${todo.map((t) => `- ${t}`).join("\n")}\n\n` : "Nothing needs you today.\n\n"}${lines.join("\n")}\n\nStan` };
}

// Send the report (daily, or when Stanley asks from the admin).
export async function sendStanReport(now = Date.now()) {
  const r = stanReportText(await stanStatus(now));
  const site = (process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "");
  const sent = await sendEmail({ to: OWNER_EMAIL, subject: r.subject, text: r.text, cta: { label: "Open the dashboard", url: `${site}/admin` }, kind: "owner" });
  await setJSON("report:stan", { at: new Date(now).toISOString(), subject: r.subject, status: sent.status });
  return { ...r, status: sent.status };
}

export const stanLast = () => getJSON("report:stan");
