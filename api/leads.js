// Free lead capture at /start (issue #459): no paywall, so spam is kept out
// with a honeypot, a time-to-submit check, rate limits and server-side
// validation instead of the $1 Lightning shield. No captcha services and no
// third-party scripts anywhere.
// POST /api/leads {name, phone?, email?, segment, answers, message?, consent, lang?, source?, startedAt, company?} -> {ok, id}
import { json, readBody, clean, newId, clientIp, siteUrl } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { validateLead, createLeadRecord, SEGMENTS, leadEmailText } from "../lib/leads.js";

export const LEAD_SUBMIT = { minSeconds: 3, maxHours: 24, perIpHour: 10, globalHour: 100 };

export async function POST(request) {
  const body = await readBody(request);
  // The honeypot: invisible to people, irresistible to bots. A filled one is
  // answered like a success but stores nothing, so bots learn nothing.
  if (clean(body.company, 200)) return json({ ok: true });
  const startedAt = Number(body.startedAt);
  const age = Date.now() - startedAt;
  if (!Number.isFinite(age) || age < LEAD_SUBMIT.minSeconds * 1000 || age > LEAD_SUBMIT.maxHours * 3600e3)
    return json({ error: "Please use the form on this site, and take a moment to fill it in." }, 400);
  if ((await hit(`rl:lead:${clientIp(request)}`, 3600)) > LEAD_SUBMIT.perIpHour)
    return json({ error: "Too many sign-ups. Try again in an hour." }, 429);
  if ((await hit(`rl:lead:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > LEAD_SUBMIT.globalHour)
    return json({ error: "Busy right now. Please try again in a few minutes." }, 429);
  let fields;
  try { fields = validateLead(body); }
  catch (e) { return json({ error: e.message }, e.status || 400); }
  // The security screen reads the free words before anyone acts on them:
  // links, code, scripts or instructions aimed at our agents put the lead on
  // hold, and the hold is recorded in the Security watch. Held leads are
  // still stored (they may be real), but Stanley decides on them himself.
  const { screen, describe, defang } = await import("../lib/screen.js");
  const freeText = [fields.name, fields.message, fields.answers.area, fields.answers.org, fields.answers.support, fields.answers.building].filter(Boolean).join("\n");
  const s = screen(freeText);
  const held = s.flagged ? { at: new Date().toISOString(), reasons: s.reasons } : null;
  const id = newId(8);
  const lead = await createLeadRecord({ id, fields, held });
  if (held) {
    const { recordAttack } = await import("../lib/attacks.js");
    await recordAttack(s.reasons.includes("instructions") ? "prompt_injection" : "hidden_content",
      { where: `lead ${id}`, ip: clientIp(request), detail: `${describe(s.reasons)}: ${defang(freeText).slice(0, 160)}` }).catch(() => {});
  }
  const { sendEmail, OWNER_EMAIL } = await import("../lib/email.js");
  const seg = SEGMENTS[lead.segment];
  const mail = leadEmailText(held ? { ...lead, name: defang(lead.name), message: defang(lead.message),
    answers: Object.fromEntries(Object.entries(lead.answers).map(([k, v]) => [k, defang(v)])) } : lead);
  try {
    await sendEmail({ to: OWNER_EMAIL, subject: mail.subject, kind: "owner", fromDept: seg.dept,
      text: mail.text, cta: { label: "Open the Leads pipeline", url: `${siteUrl(request)}/admin#leads` } });
  } catch (err) { console.error("lead notify", err.message); }
  return json({ ok: true, id });
}
