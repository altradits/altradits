// Stan's library (admin → Stan → Library): everything needed to recreate,
// run, secure and teach Altradits. Each document is markdown in docs/ (or built
// from data, like the attack history) and is rendered to PDF when opened, so a
// PDF always matches the code it describes. The Bitcoin whitepaper is kept as
// published (docs/bitcoin-whitepaper.pdf, SHA-256 b1674191…f553).
// docs/ is never served as files (docs/.htaccess); only the admin API reads it.
import fs from "node:fs";
import path from "node:path";
import { markdownToPdf } from "./pdf.js";
import { BITCOIN_ATTACKS } from "../data/bitcoin-attacks.js";

const DOCS = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "docs");
export const WHITEPAPER_SHA256 = "b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553";

export const LIBRARY = [
  { id: "overview", group: "Recreate the system", title: "System overview", file: "system-overview.md", summary: "What Altradits is, every part of it, and how a request flows through the system." },
  { id: "recreate", group: "Recreate the system", title: "Recreate everything from scratch", file: "recreate.md", summary: "Hosting, settings, email, deploy, data, backups, node and tunnel, in the order to set them up." },
  { id: "payments", group: "Recreate the system", title: "Payments, receipts and the books", file: "payments.md", summary: "Orders, Lightning and on-chain payments, confirmations, held payments, receipts and statements." },
  { id: "yebente", group: "Recreate the system", title: "Ye₿ente wallets", file: "yebente.md", summary: "Custodial Lightning wallets: ledger, limits, sending, receiving, M-Pesa buys, recovery, fingerprint approval." },
  { id: "agents", group: "Recreate the system", title: "AI departments, Stan and the marketing team", file: "agents.md", summary: "How work is routed, done, checked by Stan's QA panel and delivered; marketing, learning and the inboxes." },
  { id: "faq", group: "Recreate the system", title: "Quick answers", file: "faq.md", summary: "Short answers to the questions that come up about the system, with where to look." },
  { id: "security", group: "Security", title: "Security handbook", file: "security-handbook.md", summary: "Every defence, the build gates, the audits, the Security watch and what to do in an incident." },
  { id: "attacks", group: "Security", title: "Bitcoin's attack history and our guards", build: attackHistory, summary: "Each major attack in Bitcoin's history, its lesson, and how this system guards against it." },
  { id: "whitepaper-alignment", group: "Security", title: "Aligned with the whitepaper", file: "whitepaper-alignment.md", summary: "Satoshi's whitepaper, section by section, and where the system follows it." },
  { id: "node-findings", group: "Security", title: "Your node today: findings and upgrades", file: "node-findings.md", summary: "What the Mac's Bitcoin Core and LND look like now, and what to change, in order." },
  { id: "manual-core", group: "Bitcoin manuals", title: "Manual: Bitcoin Core", file: "manual-bitcoin-core.md", summary: "Install, verify, configure and run Bitcoin Core on mainnet and regtest, securely." },
  { id: "manual-lnd", group: "Bitcoin manuals", title: "Manual: LND for a business", file: "manual-lnd.md", summary: "LND with Bitcoin Core or Neutrino, Tor, wallet unlock, least-privilege macaroons, channels and liquidity." },
  { id: "manual-tunnel", group: "Bitcoin manuals", title: "Manual: connecting a website to your node", file: "manual-tunnel.md", summary: "The ngrok tunnel with an IP allow-list, pinned TLS, the website keys and how to test them." },
  { id: "manual-lnaddress", group: "Bitcoin manuals", title: "Manual: Lightning addresses and LNURL", file: "manual-lightning-address.md", summary: "name@yourdomain payments, LNURL-pay, QR codes and the checks a receiver must make." },
  { id: "talk-core", group: "Talks", title: "Talk: Setting up Bitcoin Core, step by step", file: "talk-bitcoin-core.md", summary: "The talk script: every command with its real output, from build to a reorg, for listeners to follow." },
  { id: "whitepaper", group: "Reference", title: "Bitcoin: A Peer-to-Peer Electronic Cash System (Satoshi Nakamoto, 2008)", pdf: "bitcoin-whitepaper.pdf", summary: "The whitepaper as published (9 pages). Its SHA-256 matches the widely published fingerprint." },
];

const letterhead = (title) => ({ lines: ["Altradits Library", "altradits.com"], footer: `${title} · generated ${new Date().toISOString().slice(0, 10)}`, url: "https://altradits.com" });

export const libraryList = () => LIBRARY.map(({ id, group, title, summary, pdf }) => ({ id, group, title, summary, original: Boolean(pdf) }));

// The markdown behind a document (null for the original whitepaper).
export function docMarkdown(id) {
  const d = LIBRARY.find((x) => x.id === id);
  if (!d || d.pdf) return null;
  return d.build ? d.build() : fs.readFileSync(path.join(DOCS, d.file), "utf8");
}

// { name, body } of the PDF, or null for an unknown id.
export function docPdf(id) {
  const d = LIBRARY.find((x) => x.id === id);
  if (!d) return null;
  const name = `altradits-${d.id}.pdf`;
  if (d.pdf) return { name: d.id === "whitepaper" ? "bitcoin.pdf" : name, body: fs.readFileSync(path.join(DOCS, d.pdf)) };
  return { name, body: markdownToPdf(docMarkdown(id), d.title, { letterhead: letterhead(d.title) }) };
}

function attackHistory() {
  const label = { guarded: "Guarded", watch: "Guarded, keep current", action: "Needs action" };
  const lines = [
    "# Bitcoin's attack history and our guards",
    "Every major attack in Bitcoin's history taught a lesson. This is each one, what it means for Altradits, and the guard in place. Status: Guarded (in the code and tested), Guarded, keep current (depends on updates), Needs action (see Your node today).",
    "",
    `> ${BITCOIN_ATTACKS.filter((a) => a.status === "action").length} need action, ${BITCOIN_ATTACKS.filter((a) => a.status === "watch").length} need keeping current, ${BITCOIN_ATTACKS.filter((a) => a.status === "guarded").length} are guarded.`,
  ];
  for (const a of [...BITCOIN_ATTACKS].sort((x, y) => x.year - y.year)) {
    lines.push("", `## ${a.year}: ${a.name}`, `**${label[a.status]}**`, "", a.what, "", `- Lesson: ${a.lesson}`, `- Our guard: ${a.guard}`);
  }
  return lines.join("\n");
}
