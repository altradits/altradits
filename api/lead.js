// POST /api/lead  { name, email, quiz, leadId?, token?, website }
// The lead magnet: emails the visitor their free delegation plan and starts
// the nurture. Not critical, so Stanley is not emailed.
import { json, readBody, clean, clientIp, siteUrl, safeEqual, EMAIL_RE } from "../lib/http.js";
import { createLead, getLead, saveLead, logEvent, advanceStage, cleanQuiz } from "../lib/crm.js";
import { sendEmail } from "../lib/email.js";
import { hit } from "../lib/store.js";
import { recommend, findService, GUARANTEES } from "../data/catalog.js";

export async function POST(request) {
  const body = await readBody(request);
  if (body.website) return json({ ok: true }); // honeypot field: bots fill it
  const email = clean(body.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email." }, 400);
  if ((await hit(`rl:lead:${clientIp(request)}`, 3600)) > 10) return json({ error: "Too many requests, try again later." }, 429);

  const quiz = cleanQuiz(body.quiz) || { tasks: [], hours: 0, role: "", hourValue: 0 };
  let lead = body.leadId ? await getLead(clean(body.leadId, 40)) : null;
  if (lead && !safeEqual(lead.token, body.token)) lead = null;
  const isNew = !lead;
  if (!lead) lead = await createLead({ source: "delegation-quiz", email, name: body.name, referredBy: clean(body.ref, 12).toLowerCase() });

  lead.email = email;
  if (body.name) lead.name = clean(body.name, 120);
  lead.needs = [...new Set([...lead.needs, ...quiz.tasks.filter((t) => findService(t))])];
  if (quiz.hours) lead.hoursPerWeek = quiz.hours;
  if (quiz.role) lead.role = quiz.role;
  lead.context = { ...lead.context, quiz };
  advanceStage(lead, "qualified");
  logEvent(lead, "Requested the free delegation plan.");
  await saveLead(lead);

  const r = recommend(quiz.hours, quiz.hourValue);
  const tasks = lead.needs.map((id) => `- ${findService(id).name}: ${findService(id).outcome}`).join("\n");
  await sendEmail({
    to: email, leadId: lead.id, kind: "client",
    subject: "Your free delegation plan",
    text: `Hi ${lead.name || "there"},\n\nHere is your delegation plan.\n\nWhat to hand off first:\n${tasks || "- Tell us your top task and we'll map it."}\n\nYou listed about ${quiz.hours} hours a week of this work. Handing it off could give you back around ${r.hoursBack} hours a month${r.valueBack ? `, worth about $${r.valueBack} of your time` : ""}.\n\nThe plan that fits: ${r.pkg.name} at $${r.pkg.price}/month (${r.pkg.hours} hours).\n\nThe easiest way to start: ${GUARANTEES[0].text}\n\nReply to this email with your first task, or open the chat on the site and Altra will set it up in two minutes.`,
    cta: { label: "Start with a free task", url: `${siteUrl(request)}/?chat=trial` },
  });

  return json({ ok: true, leadId: lead.id, token: isNew ? lead.token : undefined, plan: { hoursBack: r.hoursBack, valueBack: r.valueBack, package: r.pkg.id } });
}
