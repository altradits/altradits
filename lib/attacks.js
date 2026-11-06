// Security watch: every attack or abuse the site turns away is recorded here
// (what was tried, the technique, where, from which connection hash, and what
// to improve), for the Security watch panel in Stan's tab. Nothing is stored
// that would help an attacker or expose a visitor: connections are keyed
// hashes, details are short and defanged. Stanley is emailed at most once an
// hour per technique, and only for high-severity ones.
import crypto from "node:crypto";
import { getJSON, setJSON, pushId, listIds, getMany, hit, peek, removeFromList, deleteKeys } from "./store.js";

// Each technique: a plain name, the industry reference, how serious, what it
// means for us, and what to do about it (shown next to every event).
export const TECHNIQUES = {
  prompt_injection: { name: "Prompt injection", ref: "OWASP LLM01", severity: "high",
    what: "Text written to make our AI agents ignore their instructions, reveal them, or act for the sender.",
    improve: "Keep the security screen strict; never give agents tools that move money or send to addresses found in content; review the held item before releasing it." },
  hidden_content: { name: "Links, code or scripts in a task", ref: "OWASP LLM01 (indirect) / phishing", severity: "medium",
    what: "A task, answer or message carried links, code or commands. It was held before any AI read it.",
    improve: "Release only after checking every link (defanged in the email); ask the client for plain text if unsure." },
  chat_abuse: { name: "Chat abuse or spam", ref: "Abuse / bot traffic", severity: "low",
    what: "Abuse, spam links, repetition or bot-speed messages in the chat. The chat was paused behind a small Lightning payment.",
    improve: "No action needed unless it repeats from many connections; raise RULES.humanCheckSats if it does." },
  admin_token_guess: { name: "Admin token guessing", ref: "MITRE ATT&CK T1110 (brute force)", severity: "high",
    what: "Wrong admin tokens were sent to the admin API.",
    improve: "Keep ADMIN_TOKEN long and random (openssl rand -hex 32); rotate it if this keeps happening; it is never typed anywhere but the admin sign-in." },
  secret_guess: { name: "Webhook or secret forgery", ref: "MITRE ATT&CK T1110 / spoofed webhook", severity: "high",
    what: "A deploy, cron or payment-callback request arrived with the wrong secret.",
    improve: "Rotate the secret that was targeted (DEPLOY_SECRET, CRON_SECRET, YEBENTE_CALLBACK_SECRET); check it isn't in any log or message." },
  rate_limited: { name: "Flooding or guessing (rate limit hit)", ref: "OWASP API4 (resource consumption)", severity: "low",
    what: "A connection went past a per-visitor or site-wide limit: guessing links, codes or order names, or flooding an endpoint.",
    improve: "Many hits on one path from many connections means a campaign: tighten that path's site-wide limit." },
  ssrf: { name: "Server-side request forgery", ref: "OWASP A10 / DNS rebinding", severity: "high",
    what: "A link or Lightning address tried to make our server call a private or internal address.",
    improve: "Nothing to change: lib/netsafe.js refused it. Look for the address that was supplied and who supplied it." },
  csp_violation: { name: "Blocked script (possible XSS)", ref: "OWASP A03 (injection) / CSP", severity: "medium",
    what: "A page's script lock blocked code that wasn't ours. Usually a browser extension; on the admin or portal, treat it as an injection attempt.",
    improve: "Check the page and the blocked source; if it's on a private page, look for unescaped text in what that page shows." },
  pin_guessing: { name: "Wallet PIN guessing", ref: "MITRE ATT&CK T1110.001", severity: "high",
    what: "Five wrong PINs on a Ye₿ente wallet; payments were locked and the owner warned.",
    improve: "If it repeats on one wallet, the device or its token may be stolen: the owner should recover by email (signs every device out)." },
  passkey_forgery: { name: "Forged fingerprint approval", ref: "WebAuthn assertion forgery / replay", severity: "high",
    what: "A fingerprint approval failed its signature, origin or counter check.",
    improve: "One failure can be a glitch; several mean a copied or forged key. Turn fingerprint off for that wallet." },
  invoice_substitution: { name: "Invoice substitution", ref: "Lightning address / LNURL tampering", severity: "high",
    what: "A Lightning address returned an invoice for a different amount than asked. Nothing was paid.",
    improve: "Nothing to change; avoid that address. Repeated cases suggest a compromised or malicious receiver." },
  solvency: { name: "Custodial shortfall", ref: "Mt. Gox 2014 / QuadrigaCX 2019 lessons", severity: "high",
    what: "Ye₿ente wallet balances are higher than what the node can pay out.",
    improve: "Add outbound liquidity or pause buying and receiving until the node can cover every balance." },
  unexplained_balance_drop: { name: "Unexplained node balance drop", ref: "Deadman's Switch Trigger 4 / hot-wallet drain", severity: "high",
    what: "The Lightning node's total balance (channels + on-chain) dropped with no matching recorded Ye₿ente send, tip refund or owner channel action.",
    improve: "Keep the Deadman's Switch lockdown on, inspect LND payments/peers/on-chain transactions with readonly.macaroon, and verify every channel and peer before lifting." },
  file_tampering: { name: "Server file or .htaccess tampering", ref: "Deadman's Switch Trigger / MITRE T1505.003", severity: "high",
    what: "A tracked server file or .htaccess protection rule was modified or deleted outside of a clean git deploy.",
    improve: "Keep the Deadman's Switch lockdown on, inspect git status/diff on the server, restore clean HEAD, and rotate secrets if any server code was altered." },
  email_change_pending: { name: "Email change pending", ref: "Account recovery / owner response", severity: "low",
    what: "An email change on a Ye₿ente wallet was confirmed and takes effect in 48 hours. Recovery keeps using the old address until then.",
    improve: "No action needed. If the owner did not ask for it, they can cancel from the old address or a trusted phone before it takes effect." },
  email_change_effective: { name: "Email change took effect", ref: "Account recovery / owner response", severity: "low",
    what: "An email change on a Ye₿ente wallet took effect after 48 hours. Recovery and login now use the new address.",
    improve: "No action needed. If the owner did not ask for it, their old address and a trusted phone were both out of reach for 48 hours: help them recover." },
  email_change_cancelled: { name: "Email change cancelled", ref: "Account recovery / owner response", severity: "low",
    what: "A pending email change on a Ye₿ente wallet was cancelled. The old address stays.",
    improve: "No action needed. If changes the owner did not ask for keep appearing, their phone or PIN may be compromised." },
  recovery_cancelled: { name: "Email recovery cancelled", ref: "Account recovery / owner response", severity: "low",
    what: "The owner cancelled a pending email recovery from a trusted phone. Every live recovery link for the wallet died at once.",
    improve: "No action needed. If recoveries the owner did not ask for keep appearing, their email may be compromised: they should recover first and change the email." },
  wallet_frozen: { name: "Wallet sending frozen", ref: "Account recovery / owner response", severity: "low",
    what: "Sending from a Ye₿ente wallet was frozen with the link in a security email. Receiving still works; the owner logs in again to unfreeze.",
    improve: "No action needed. If one wallet freezes again and again, its email may be compromised: the owner should recover the wallet and change the email." },
  wallet_email_failed: { name: "Wallet email not delivered", ref: "Account recovery / deliverability", severity: "high",
    what: "A Ye₿ente email to a wallet owner (a recovery link, a login code or a security notice) never left the server. The admin email log carries its status.",
    improve: "Open the admin email log for the failed row, fix the mail transport (server mail, SMTP or Resend), and ask the owner to try again." },
  admin_compromise: { name: "Admin sign-in from new IP after guessing burst", ref: "Deadman's Switch Trigger / MITRE T1078", severity: "high",
    what: "A request with a valid ADMIN_TOKEN arrived from a new connection within an hour of a token-guessing burst.",
    improve: "If that wasn't you on a new network, rotate ADMIN_TOKEN in DirectAdmin immediately (openssl rand -hex 32) before lifting the Deadman's Switch." },
  ktown_number: { name: "kTown number event", ref: "kTown pilot / squatter watch", severity: "low",
    what: "A kTown number was taken over by a new sign-up, blocked from registering, or released for its owner. Money always lands with the registered M-Pesa number, so a takeover risks no funds.",
    improve: "If one number churns, block it from registering; to free a squatted number for its owner, release the merchant record. How: docs/ktown.md." },
  dev_code_guessing: { name: "Developer code guessing", ref: "MITRE ATT&CK T1110.001", severity: "medium",
    what: "Many wrong Developer signup codes were tried for one address; further tries are refused for an hour.",
    improve: "No action needed unless it repeats across many addresses: then tighten the signup limits in lib/devapi.js." },
  dev_key_guess: { name: "Developer API key guessing", ref: "MITRE ATT&CK T1110 (brute force)", severity: "medium",
    what: "Unknown or revoked Developer API keys were sent to the API. Keys carry 192 random bits, so guessing can't reach one; a burst means scanning.",
    improve: "No action needed unless one connection keeps trying: the per-connection limit already slows it. Suspend the targeted account if abuse is confirmed." },
};

const KEEP = 1000; // events kept; older ones are dropped
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const shorten = (s, n = 240) => String(s ?? "").replace(/[\u0000-\u001F]+/g, " ").replace(/https?:\/\//gi, "hxxp://").trim().slice(0, n);

export async function recordAttack(kind, { where = "", ip = "", detail = "" } = {}) {
  const t = TECHNIQUES[kind];
  if (!t) return null;
  try {
    const { noteAttackForDeadman } = await import("./deadman.js");
    await noteAttackForDeadman(kind, shorten(detail)).catch(() => {});
    // A flood must not flood the log: one event per technique, place and connection a minute.
    if ((await hit(`secw:dedupe:${kind}:${shorten(where, 60)}:${ip || "-"}:${Math.floor(Date.now() / 60e3)}`, 120)) > 1) {
      await hit(`secw:n:${kind}:${day()}`, 8 * 86400);
      return null;
    }
    const e = { id: `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`, at: new Date().toISOString(), kind, where: shorten(where, 120), ip: String(ip).slice(0, 16), detail: shorten(detail) };
    await setJSON(`secw:e:${e.id}`, e);
    await pushId("secw:events", e.id);
    await hit(`secw:n:${kind}:${day()}`, 8 * 86400);
    if ((await hit("secw:trim", 3600)) === 1) await trim();
    if (t.severity === "high" && (await hit(`secw:mail:${kind}:${new Date().toISOString().slice(0, 13)}`, 3600)) === 1) {
      const { emailOwner } = await import("./email.js");
      await emailOwner(`Security watch: ${t.name}`, `${t.what}\n\nWhere: ${e.where || "-"}\n${e.detail ? `Detail: ${e.detail}\n` : ""}Reference: ${t.ref}\n\nWhat to do: ${t.improve}\n\nEvery event is in admin → Stan → Security watch. You get at most one email an hour for this technique.`, null, "trust").catch(() => {});
    }
    return e;
  } catch { return null; } // recording must never break the request it describes
}

async function trim() {
  const ids = await listIds("secw:events", KEEP + 500);
  const old = ids.slice(KEEP);
  if (!old.length) return;
  await removeFromList("secw:events", old);
  await deleteKeys(old.map((id) => `secw:e:${id}`));
}

// The Security watch panel: recent events, counts per technique for today and
// the last 7 days, and the technique catalogue with what to improve.
export async function securityView(limit = 200) {
  const events = (await getMany("secw:e", await listIds("secw:events", limit))).filter(Boolean);
  const days = [...Array(7)].map((_, i) => day(new Date(Date.now() - i * 864e5)));
  const counts = {};
  for (const kind of Object.keys(TECHNIQUES)) {
    const per = await Promise.all(days.map((d) => peek(`secw:n:${kind}:${d}`)));
    counts[kind] = { today: per[0] || 0, week: per.reduce((t, n) => t + (n || 0), 0) };
  }
  return { events, counts, techniques: TECHNIQUES, solvency: (await getJSON("secw:solvency")) || null };
}

// Hourly: can the node pay out every Ye₿ente balance? (Mt. Gox and QuadrigaCX
// both hid a shortfall until withdrawals stopped.) Recorded every time, alerted
// when short.
export async function checkSolvency() {
  const { liabilities, walletsOn } = await import("./ywallet.js");
  if (!walletsOn()) return null;
  const { outboundSats } = await import("./lightning.js");
  const [owed, canPay] = await Promise.all([liabilities(), outboundSats()]);
  const r = { at: new Date().toISOString(), owedSats: owed.sats, wallets: owed.wallets, outboundSats: canPay, covered: canPay === null ? null : canPay >= owed.sats };
  await setJSON("secw:solvency", r);
  if (r.covered === false) await recordAttack("solvency", { where: "Ye₿ente wallets", detail: `Owed ${owed.sats} sats across ${owed.wallets} wallets; the node can send ${canPay} sats.` });
  return r;
}
