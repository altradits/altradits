// Altra's misuse guard. Cheap checks run before any AI call; Altra can also
// flag misuse itself. Either way the conversation is gated behind a small
// Lightning payment (RULES.humanCheckSats): bots and freeloaders don't pay,
// real prospects can in seconds. While gated, no AI is called at all, so abuse
// costs us nothing. Paying (verified on our LND node) reopens the chat.
import { RULES, BUSINESS } from "../data/catalog.js";
import { createInvoice, invoicePaid, qrSvg, lightningMode } from "./lightning.js";
import { hit } from "./store.js";
import { logEvent } from "./crm.js";

const now = () => new Date().toISOString();

// Obvious attempts to subvert the assistant. Kept narrow on purpose: genuine
// questions about writing, translation or tech are our services, not misuse.
const INJECTION = /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|all|your|system)\b.{0,30}\b(instructions?|prompts?|rules?|guidelines?)\b|\b(system prompt|your (system )?instructions|initial prompt|developer mode|jailbreak|DAN mode|do anything now)\b|\b(reveal|print|show|repeat|output)\b.{0,30}\b(prompt|instructions|tools|configuration)\b|\byou are (now|no longer)\b|\bpretend (to be|you are)\b|<\/?(system|assistant|tool)[^>]*>/i;
const ABUSE = /\b(fuck|fucking|cunt|bitch|nigger|faggot|retard|kill yourself|kys|i will kill)\b/i;

export function guardState(lead) {
  return (lead.guard ||= { state: "open", strikes: 0, events: [] });
}

export function isGated(lead) {
  return guardState(lead).state === "gated";
}

// Returns a reason string if this message should gate the chat, else null.
export async function screenMessage(lead, text) {
  const g = guardState(lead);
  if (INJECTION.test(text)) return "prompt_injection";
  if (ABUSE.test(text)) return "abuse";
  if ((text.match(/https?:\/\//g) || []).length > 3) return "spam_links";
  const users = lead.transcript.filter((m) => m.role === "user");
  const last = users.slice(-3).map((m) => m.text.trim().toLowerCase());
  if (last.length === 3 && last.every((t) => t === text.trim().toLowerCase())) return "repetition";
  if (/^[^a-z0-9\s]{6,}$|^(.)\1{8,}$/i.test(text.trim())) return "gibberish";
  // Burst: more than 8 messages in 2 minutes from one conversation.
  if ((await hit(`rl:burst:${lead.id}`, 120)) > 8) return "bot_like_speed";
  // Long chats that never move toward a sale (verified humans get more room).
  const limit = g.state === "verified" ? RULES.maxTurnsVerified : RULES.maxTurnsUnqualified;
  if (!lead.email && !lead.proposalId && users.length >= limit) return "no_progress";
  return null;
}

function gateText(reason) {
  const why = {
    prompt_injection: "That message looks like an attempt to change how I work.",
    abuse: "Let's keep things respectful.",
    off_topic: "I'm here for Altradits services only, not general-purpose AI work.",
    spam_links: "That looks like spam.",
    repetition: "I'm seeing the same message repeatedly.",
    gibberish: "I couldn't make sense of that.",
    bot_like_speed: "Messages are arriving faster than a person types.",
    no_progress: "We've chatted a while without getting closer to how we can help.",
    fraud: "I can't help with that request.",
    bot_like: "This conversation looks automated.",
  }[reason] || "This conversation needs a quick check.";
  return `${why} To keep this chat for real people and serious enquiries, please confirm you're human with a ${RULES.humanCheckSats}-sat Lightning payment (a few US cents).\n\n**How to pay:** open any Lightning wallet (Wallet of Satoshi, Phoenix, Strike, Cash App, Blink…), tap **Send** or **Scan**, and scan the QR below or paste the invoice. The chat reopens automatically within seconds of payment.\n\nPrefer not to? Email ${BUSINESS.email} and ${BUSINESS.owner} will reply personally.`;
}

async function gateAction(g) {
  if (g.invoice && Date.parse(g.invoice.expiresAt) - Date.now() > 60e3) {
    return { type: "human_check", bolt11: g.invoice.bolt11, sats: g.invoice.sats, qr: await qrSvg(`lightning:${g.invoice.bolt11}`.toUpperCase()), expiresAt: g.invoice.expiresAt };
  }
  if (lightningMode() !== "lnd") return null; // can't verify payment without our node
  g.invoice = await createInvoice({ sats: RULES.humanCheckSats, memo: "Altradits chat: human check", expiry: 1800 });
  return gateAction(g);
}

// Lock the conversation. Returns the reply to send (no AI involved).
export async function gate(lead, reason, evidence = "") {
  const g = guardState(lead);
  g.state = "gated";
  g.reason = reason;
  g.gatedAt = now();
  g.strikes = (g.strikes || 0) + 1;
  g.events.push({ at: now(), reason, evidence: String(evidence).slice(0, 200) });
  if (g.events.length > 20) g.events = g.events.slice(-20);
  logEvent(lead, `Chat gated (${reason}).`);
  let action = null;
  try { action = await gateAction(g); } catch (err) { console.error("guard invoice", err); }
  if (!action) {
    return { reply: `${gateText(reason).split("\n\n")[0]} I've paused this chat. To continue, email ${BUSINESS.email} and ${BUSINESS.owner} will reply personally.`, actions: [], gated: true };
  }
  return { reply: gateText(reason), actions: [action], gated: true };
}

// Called for every message while gated: unlock if paid, otherwise repeat the
// payment request. Never calls the AI.
export async function checkGate(lead) {
  const g = guardState(lead);
  if (g.invoice) {
    let paid = false;
    try { paid = await invoicePaid({ provider: "lnd", paymentHash: g.invoice.paymentHash }); } catch (err) { console.error("guard check", err); }
    if (paid) {
      g.state = "verified";
      g.verifiedAt = now();
      g.paidSats = (g.paidSats || 0) + g.invoice.sats;
      g.invoice = null;
      logEvent(lead, `Human check paid (${RULES.humanCheckSats} sats); chat reopened.`);
      return { unlocked: true };
    }
  }
  let action = null;
  try { action = await gateAction(g); } catch (err) { console.error("guard invoice", err); }
  return {
    unlocked: false,
    reply: action
      ? `This chat is paused until the ${RULES.humanCheckSats}-sat human check is paid. Scan the QR with any Lightning wallet; the chat reopens automatically. Or email ${BUSINESS.email}.`
      : `This chat is paused. Please email ${BUSINESS.email} and ${BUSINESS.owner} will reply personally.`,
    actions: action ? [action] : [],
  };
}

// Daily ceiling on AI turns across all visitors, so a flood can't drain credits.
export async function aiBudgetLeft() {
  const day = now().slice(0, 10);
  return (await hit(`budget:ai:${day}`, 86400)) <= RULES.maxAiTurnsPerDay;
}
