// The free-kit mailing list. Someone downloads a kit (data/templates.js) with
// their email; they join the list tagged with that kit, become a lead in the
// CRM, and get three follow-up emails over ten days that walk them from the
// free kit (do it yourself) to doing it together and to done for you. Every
// email has a one-click unsubscribe, and consent is recorded with its wording.
import crypto from "node:crypto";
import { KITS, findKit, LADDER } from "../data/templates.js";
import { orderable, BUSINESS } from "../data/catalog.js";
import { getJSON, setJSON, pushId, listIds, getMany, hit } from "./store.js";
import { createLead, getLead, saveLead } from "./crm.js";
import { sendEmail, CONTACT } from "./email.js";
import { markdownToPdf } from "./pdf.js";
import { clean, EMAIL_RE, safeEqual } from "./http.js";

const DAY = 864e5;
const now = () => new Date().toISOString();
const SITE = () => (process.env.SITE_URL || BUSINESS.siteUrl).replace(/\/$/, "");
const subId = (email) => crypto.createHash("sha256").update(`sub:${email}`).digest("hex").slice(0, 16);
export const CONSENT = (kit) => `Send me the ${kit.title} and occasional emails about ${kit.struggle.toLowerCase()} and related Altradits services; Altradits keeps my email and name as a lead. Unsubscribe anytime.`;
const NAME_RE = /^[\p{L}][\p{L}' -]{0,39}$/u; // a first name: letters only, so no links can ride on it
const KIT_EMAILS_PER_DAY = 300;

const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
// The ladder for a kit with live catalog prices: do it together, then done for you.
export function offers(kit) {
  const together = orderable("hourly");
  return {
    together: { id: "hourly", name: `${LADDER[1].name}: ${together.name}`, price: together.price, url: `${SITE()}/?buy=hourly` },
    done: kit.done.map((id) => orderable(id)).filter(Boolean).map((o) => ({
      id: o.id, name: o.name, price: o.price, monthly: o.type === "monthly", delivery: o.delivery, url: `${SITE()}/?buy=${o.id}`,
    })),
  };
}
const priceLine = (o) => `${o.name}: ${money(o.price)}${o.monthly ? "/month" : ""}`;

function ladderText(kit) {
  const o = offers(kit);
  return `${LADDER[1].name} (${LADDER[1].code}): we finish it with you. ${money(o.together.price)} for 2 hours: ${o.together.url}\n\n${LADDER[2].name} (${LADDER[2].code}):\n${o.done.map((d) => `- ${priceLine(d)}: ${d.url}`).join("\n")}`;
}

// The kit's files with a "Next steps" page listing the paid options.
export function renderFile(kit, file) {
  if (file.type === "csv") return { body: Buffer.from(file.body, "utf8"), type: "text/csv; charset=utf-8" };
  const o = offers(kit);
  const md = `${file.md}

## Next steps
${LADDER.map((l) => `- ${l.code}, ${l.name}: ${l.line}`).join("\n")}
- Do it together: ${o.together.name.split(": ")[1]}, ${money(o.together.price)}. Order at ${o.together.url}
${o.done.map((d) => `- Done for you: ${d.name}, ${money(d.price)}${d.monthly ? "/month" : ""}. Order at ${d.url}`).join("\n")}

Altradits: fixed-price jobs, paid with any Bitcoin wallet, done the same day. ${SITE().replace(/^https?:\/\//, "")}`;
  return { body: markdownToPdf(md, kit.title, { letterhead: LETTERHEAD }), type: "application/pdf" };
}

// The Altradits letterhead on every kit page (lib/pdf.js).
const LETTERHEAD = { lines: [CONTACT.email, CONTACT.site, CONTACT.place], footer: `Altradits · Virtual assistance worldwide · ${CONTACT.site}` };

// Links in the email carry the confirmation token (c): downloading from the
// inbox proves the address is theirs, which starts the follow-ups. Links shown
// on the page don't, so signing someone else up can't start emails to them.
const links = (s, kit, emailed = false) => kit.files.map((f) => ({ name: f.name, type: f.type, url: `${SITE()}/api/kits?d=${kit.id}&f=${encodeURIComponent(f.name)}&s=${s.id}&t=${s.t}${emailed ? `&c=${s.c}` : ""}` }));
const unsubLink = (s) => `${SITE()}/api/kits?unsub=${s.id}&t=${s.t}`;
const unsubHeaders = (s) => ({ "List-Unsubscribe": `<${unsubLink(s)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

async function sendKit(s, kit) {
  const files = links(s, kit, true);
  await sendEmail({
    to: s.email, kind: "kit", dept: "marketing", leadId: s.leadId, subject: `Your free kit: ${kit.title}`, headers: unsubHeaders(s),
    text: `Hi ${s.name || "there"},\n\nHere's your ${kit.title}. ${kit.promise}\n\n${files.map((f) => `${f.name}: ${f.url}`).join("\n")}\n\nIf you'd rather not do it alone:\n\n${ladderText(kit)}${footer(s)}`,
    cta: { label: "Download the kit", url: files[0].url },
  });
}
const footer = (s) => `\n\nYou're getting this because you downloaded a free Altradits kit. Unsubscribe in one click: ${unsubLink(s)}`;

export async function subscribe({ email, name = "", kit: kitId, ip = "", website = "" }) {
  const kit = findKit(clean(kitId, 30));
  if (!kit) return { error: "Unknown kit.", status: 400 };
  if (website) return { error: "Please try again.", status: 400 }; // bots fill the hidden field
  const e = clean(email, 200).toLowerCase().trim();
  if (!EMAIL_RE.test(e)) return { error: "Please check your email address.", status: 400 };
  if ((await hit(`rl:sub:${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16)}`, 3600)) > 10) return { error: "Too many sign-ups from this connection. Try again in an hour.", status: 429 };
  if ((await hit(`rl:kitmail:${now().slice(0, 10)}`, 86400)) > KIT_EMAILS_PER_DAY) return { error: "We're sending a lot of kits today. Please try again tomorrow.", status: 429 };

  const id = subId(e);
  let s = await getJSON(`sub:${id}`);
  if (s) {
    // Already on the list: never hand their links to whoever typed the address,
    // never change their name, never undo an unsubscribe from here. The kit
    // goes to their inbox (at most twice a day); a past unsubscriber gets a
    // confirmation link instead.
    if ((await hit(`rl:subto:${id}`, 86400)) > 2) return { sent: true };
    if (s.unsubscribed) {
      await sendEmail({ to: e, kind: "kit", dept: "marketing", subject: "Confirm you'd like our emails again",
        text: `Hi ${s.name || "there"},\n\nSomeone (hopefully you) asked for the ${kit.title} with this address. You unsubscribed earlier, so we won't email you again unless you confirm below.\n\nIf this wasn't you, ignore this email.`,
        cta: { label: "Yes, send me the kit", url: `${SITE()}/api/kits?resub=${s.id}&c=${s.c}&k=${kit.id}` } });
      return { sent: true };
    }
    if (!s.kits.some((k) => k.id === kit.id)) s.kits.push({ id: kit.id, at: now(), step: 0, consent: CONSENT(kit), downloads: 0 });
    s.updatedAt = now();
    await setJSON(`sub:${id}`, s);
    await sendKit(s, kit);
    return { sent: true };
  }

  const first = clean(name, 40).trim();
  s = { id, t: crypto.randomBytes(12).toString("base64url"), c: crypto.randomBytes(12).toString("base64url"), email: e, name: NAME_RE.test(first) ? first : "",
    createdAt: now(), updatedAt: now(), kits: [{ id: kit.id, at: now(), step: 0, consent: CONSENT(kit), downloads: 0 }], unsubscribed: false, confirmed: false };
  const lead = await createLead({ name: s.name, email: e, source: `kit:${kit.id}`, needs: kit.done.filter((d) => !d.startsWith("q-")) });
  s.leadId = lead.id;
  await setJSON(`sub:${id}`, s);
  await pushId("subs", id);
  await hit(`rl:subto:${id}`, 86400);
  await sendKit(s, kit);
  return { sub: { id: s.id, t: s.t }, files: links(s, kit) };
}

// "Yes, send me the kit" after an earlier unsubscribe.
export async function resubscribe(id, c, kitId) {
  const s = await getJSON(`sub:${clean(id, 20)}`);
  if (!s || !s.c || !safeEqual(s.c, String(c || ""))) return false;
  Object.assign(s, { unsubscribed: false, confirmed: true, resubscribedAt: now() });
  const kit = findKit(clean(kitId, 30));
  if (kit && !s.kits.some((k) => k.id === kit.id)) s.kits.push({ id: kit.id, at: now(), step: 0, consent: CONSENT(kit), downloads: 0 });
  await setJSON(`sub:${s.id}`, s);
  if (kit) await sendKit(s, kit);
  return true;
}

export async function download({ kit: kitId, file, id, t, c }) {
  const kit = findKit(clean(kitId, 30));
  const s = await getJSON(`sub:${clean(id, 20)}`);
  if (!kit || !s || !safeEqual(s.t, String(t || "")) || !s.kits.some((k) => k.id === kit.id)) return null;
  const f = kit.files.find((x) => x.name === file);
  if (!f) return null;
  const entry = s.kits.find((k) => k.id === kit.id);
  entry.downloads = (entry.downloads || 0) + 1;
  // Downloaded from the emailed link: the address is confirmed, follow-ups may start.
  if (c && s.c && !s.confirmed && safeEqual(s.c, String(c))) Object.assign(s, { confirmed: true, confirmedAt: now() });
  await setJSON(`sub:${s.id}`, s);
  return { name: f.name, ...renderFile(kit, f) };
}

export async function unsubscribe(id, t) {
  const s = await getJSON(`sub:${clean(id, 20)}`);
  if (!s || !safeEqual(s.t, String(t || ""))) return false;
  Object.assign(s, { unsubscribed: true, unsubscribedAt: now() });
  await setJSON(`sub:${s.id}`, s);
  // The CRM lead is marked too, so no one markets to them by hand either.
  const lead = s.leadId && (await getLead(s.leadId));
  if (lead) { lead.marketingOptOut = true; await saveLead(lead); }
  return true;
}

// Daily: at most one follow-up per subscriber, from their newest kit.
export async function runNurture(at = new Date()) {
  const report = { sent: 0 };
  for (const id of await listIds("subs", 5000)) {
    // Re-read each one: a run can take minutes, and they may have unsubscribed or added a kit meanwhile.
    const s = await getJSON(`sub:${id}`);
    // Follow-ups only to confirmed addresses (signed up before confirmations existed: treated as confirmed).
    if (!s || s.unsubscribed || s.confirmed === false) continue;
    if (s.lastNurtureAt && at.getTime() - Date.parse(s.lastNurtureAt) < 20 * 3600e3) continue;
    const entry = [...s.kits].reverse().find((k) => k.step < (findKit(k.id)?.nurture.length || 0));
    if (!entry) continue;
    const kit = findKit(entry.id), step = kit.nurture[entry.step];
    if (at.getTime() - Date.parse(entry.at) < step.day * DAY) continue;
    const o = offers(kit);
    // Day 2: do it together; day 5: the quick job; day 10: the monthly service.
    const main = entry.step === 0 ? o.together : o.done[entry.step === 1 ? 0 : o.done.length - 1];
    await sendEmail({
      to: s.email, kind: "kit", dept: "marketing", leadId: s.leadId, subject: step.subject, headers: unsubHeaders(s),
      text: `Hi ${s.name || "there"},\n\n${step.text}\n\n${ladderText(kit)}${footer(s)}`,
      cta: { label: `${main === o.together ? "Do it together" : "Get it done"}: ${money(main.price)}${main.monthly ? "/month" : ""}`, url: main.url },
    });
    entry.step++;
    s.lastNurtureAt = at.toISOString();
    await setJSON(`sub:${s.id}`, s);
    report.sent++;
  }
  return report;
}

// The admin view: counts per kit, recent sign-ups, and a CSV export.
export async function subscribersView() {
  const subs = await getMany("sub", await listIds("subs", 5000));
  const active = subs.filter((s) => !s.unsubscribed);
  return {
    total: subs.length, active: active.length, unsubscribed: subs.length - active.length,
    byKit: KITS.map((k) => ({ id: k.id, title: k.title, subscribers: active.filter((s) => s.kits.some((x) => x.id === k.id)).length,
      downloads: subs.reduce((n, s) => n + (s.kits.find((x) => x.id === k.id)?.downloads || 0), 0) })),
    recent: subs.slice(0, 50).map((s) => ({ email: s.email, name: s.name, kits: s.kits.map((k) => k.id), createdAt: s.createdAt, unsubscribed: s.unsubscribed })),
  };
}
export async function subscribersCsv() {
  const subs = await getMany("sub", await listIds("subs", 5000));
  // Quote, and defuse spreadsheet formulas (=, +, -, @, tab, CR) in user-supplied values.
  const esc = (v) => { let x = String(v ?? ""); if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`; return /[",\n']/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return ["email,name,kits,joined,unsubscribed,consent", ...subs.map((s) => [s.email, s.name, s.kits.map((k) => k.id).join(" "), s.createdAt, s.unsubscribed ? "yes" : "no", s.kits[0]?.consent].map(esc).join(","))].join("\n") + "\n";
}

// The public catalogue of kits for the templates page.
export function publicKits() {
  return {
    ladder: LADDER,
    kits: KITS.map((k) => ({ id: k.id, title: k.title, struggle: k.struggle, promise: k.promise, inside: k.inside, consent: CONSENT(k),
      files: k.files.map((f) => ({ name: f.name, type: f.type })), offers: offers(k) })),
  };
}
