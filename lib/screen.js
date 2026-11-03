// Security screen for every message the AI departments act on. Anything with
// a link, code, a script, or instructions aimed at our agents stops work
// before any AI reads it: the item is put on hold, forwarded to Stanley at
// altradits@gmail.com (links defanged so nothing is clicked by accident), and
// nothing happens until he releases or cancels it in the admin.
import { emailOwner } from "./email.js";
import { clean } from "./http.js";

const RULES = [
  // Links
  ["link", /\b(?:https?|ftp|file|data|javascript):/i],
  ["link", /\bwww\.[a-z0-9-]+/i],
  ["link", /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ai|app|dev|xyz|info|biz|me|ly|gl|link|site|online|top|ru|cn|ke|et|uk|us|de|fr|in|ng|za|tk|ml|gq|cf|ga)(?:\/\S*)?\b/i],
  ["link", /\b\d{1,3}(?:\.\d{1,3}){3}\b/],
  ["link", /\bbit\.ly\/|\btinyurl\b|\bt\.co\//i],
  // Code and scripts
  ["code", /```|<\s*\/?\s*(?:script|iframe|object|embed|svg|img|a|form|html|body|style)\b/i],
  ["code", /\b(?:function\s*\(|=>\s*[{(]|eval\s*\(|require\s*\(|import\s+[\w{*]|exec\s*\(|subprocess|os\.system|document\.|window\.)/i],
  ["script", /(?:^|[\s;|&`$(])(?:curl|wget|bash|sh|zsh|powershell|pwsh|cmd\.exe|sudo|chmod|rm\s+-rf|nc|ncat|python3?|npm|pip)\s+[-\w./:]/im],
  // "node" alone is usually the Lightning node in plain words ("fund node liquidity"):
  // only flag it when it runs something (a file or a flag).
  ["script", /(?:^|[\s;|&`$(])node\s+(?:-[-\w]|[\w./-]*\.m?js\b)/im],
  ["script", /\|\s*(?:sh|bash)\b|\$\(|`[^`]+`/],
  ["code", /\b(?:select\s+[\w*,\s]+\s+from|drop\s+table|insert\s+into|union\s+select|<\?php|#!\/)/i],
  ["code", /\b[A-Za-z0-9+/]{120,}={0,2}/], // long base64 blobs
  // Instructions aimed at our AI, or at moving secrets and money
  ["instructions", /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|your|all)\b[^.\n]{0,30}\b(?:instructions?|rules?|prompts?|directions?)/i],
  ["instructions", /\b(?:system prompt|you are now|act as (?:an?|the)\b|new instructions|developer mode|jailbreak)\b/i],
  ["instructions", /\b(?:run|execute|install|download|launch)\b[^.\n]{0,40}\b(?:script|command|code|macro|program|\.exe|\.bat|\.sh|\.ps1|extension|plugin|app)\b/i],
  ["instructions", /\b(?:password|passcode|seed phrase|recovery phrase|private key|2fa code|otp|api key|card number|cvv|macaroon)\b/i],
  ["instructions", /\b(?:send|transfer|wire|move)\b[^\n]{0,40}\b(?:bitcoin|btc|usdt|crypto|funds|sats)\b/i],
  ["instructions", /\b(?:bc1[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|lnbc[a-z0-9]{20,}|lnurl[a-z0-9]{20,})\b/i], // payment addresses and invoices
];

// For checking what agents write: the web addresses (hosts) and payment strings
// in a text. Email addresses aren't links.
const TLDS = "com|net|org|io|co|ai|app|dev|xyz|info|biz|me|ly|gl|link|site|online|top|ru|cn|ke|et|uk|us|de|fr|in|ng|za|tk|ml|gq|cf|ga";
const HOST_RE = new RegExp(`(?<![@\\w.-])(?:https?:\\/\\/)?((?:[a-z0-9-]+\\.)+(?:${TLDS}))(?![\\w-])`, "gi");
export const linkHosts = (text) => [...String(text || "").matchAll(HOST_RE)].map((m) => m[1].toLowerCase().replace(/^www\./, ""));
export const paymentStrings = (text) => String(text || "").match(/\b(?:bc1[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|lnbc[a-z0-9]{20,}|lnurl[a-z0-9]{20,})\b/gi) || [];
export const sameSite = (host, allowed) => allowed.some((a) => host === a || host.endsWith(`.${a}`));

// AI-written messages may only link to altradits.com; any other URL or bare
// domain is replaced with [link removed], while email addresses are left intact.
export const ownLinksOnly = (text) => String(text || "")
  .replace(/\bhttps?:\/\/[^\s)>\]]+/gi, (u) => (/^https?:\/\/(www\.)?altradits\.com(\/|$)/i.test(u) ? u : "[link removed]"))
  .replace(/\bwww\.[^\s)>\]]+/gi, (u) => (/^www\.altradits\.com/i.test(u) ? u : "[link removed]"))
  .replace(new RegExp(`(?<![@\\w.\\/-])(?:[a-z0-9-]+\\.)+(?:${TLDS})(?:\\/[^\\s)>\\]]*)?(?![\\w-])`, "gi"), (u) => (/^(www\.)?altradits\.com(\/|$)/i.test(u) ? u : "[link removed]"));

// Email addresses aren't links: take them out before checking for domains.
const strip = (t) => String(t || "").replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, " ");

export function screen(text) {
  const t = strip(text);
  const reasons = [...new Set(RULES.filter(([, re]) => re.test(t)).map(([why]) => why))];
  return { flagged: reasons.length > 0, reasons };
}

// For the forwarded copy: links can't be clicked by accident.
export const defang = (text) => String(text || "")
  .replace(/\bhttp(s?):\/\//gi, "hxxp$1://")
  .replace(/\b([a-z0-9-]+)\.(?=[a-z]{2,}\b)/gi, "$1[.]");

const LABEL = { link: "links", code: "code", script: "scripts or commands", instructions: "instructions aimed at our agents, or requests for secrets or money" };
export const describe = (reasons) => reasons.map((r) => LABEL[r] || r).join(", ");

// Puts a task on hold if text arriving for it fails the screen. Returns true if held.
export async function holdIfUnsafe(t, text, source, save) {
  const s = screen(text);
  if (!s.flagged) return false;
  const at = new Date().toISOString();
  t.held = { at, source, reasons: s.reasons, previous: t.status, text: clean(text, 4000) };
  t.status = "held";
  t.history ||= [];
  import("./attacks.js").then((a) => a.recordAttack(s.reasons.includes("instructions") ? "prompt_injection" : "hidden_content",
    { where: `${source} on task ${t.id}`, detail: `${describe(s.reasons)}: ${defang(text).slice(0, 160)}` })).catch(() => {});
  t.history.push({ at, by: "security", text: `On hold: ${source} contains ${describe(s.reasons)}. Forwarded to Stanley; waiting for his instructions.` });
  if (typeof save === "function") await save(t);
  await emailOwner(`Security hold: ${source} for "${t.title}"`,
    `All activity on this task has stopped. A ${source} from ${t.client || "unknown"} contains ${describe(s.reasons)}, so no AI agent will read it until you decide.\n\nForwarded message (links defanged, don't open them unless you trust the sender):\n\n${defang(text)}\n\nIn the admin, open Choumi and press Release to let the department continue, or Cancel to stop the task.`,
    { label: "Open the task in the admin", url: `${(process.env.SITE_URL || "https://altradits.com").replace(/\/$/, "")}/admin#choumi` }).catch(() => {});
  return true;
}
