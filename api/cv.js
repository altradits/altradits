// Stanley's CV behind a 100-sat Lightning paywall.
// GET  /api/cv                       -> preview only (name, headline, summary) + price
// POST /api/cv                       -> { pass, t, invoice, qr, sats }: a 100-sat invoice
// GET  /api/cv?pass=&t=              -> the full CV once that invoice is paid (402 until then)
// GET  /api/cv?pass=&t=&format=pdf   -> the same CV as an ATS-friendly PDF
// A paid pass works for 30 days on that browser.
import { json, clean, clientIp, safeEqual, newId } from "../lib/http.js";
import { getJSON, setJSON, hit } from "../lib/store.js";
import { publicCv, syncCv } from "../lib/career.js";
import { markdownToPdf } from "../lib/pdf.js";
import { createInvoice, invoicePaid, qrSvg } from "../lib/lightning.js";

export const CV_SATS = 100;
const PASS_DAYS = 30;

// Name, headline and summary only: no contact details before payment.
function preview(cv) {
  const lines = cv.cv.split("\n");
  const name = (lines.find((l) => /^#\s/.test(l)) || "# CV").replace(/^#\s+/, "").trim();
  const start = lines.findIndex((l) => /^##\s+(professional\s+)?summary/i.test(l));
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  const summary = start < 0 ? [] : lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => l.trim());
  const sections = lines.filter((l) => /^##\s/.test(l) && !/summary/i.test(l)).map((l) => l.replace(/^##\s+/, "").trim());
  return { name, headline: cv.headline, summary: summary.join("\n").slice(0, 1200), sections, updated: cv.updated, agent: cv.agent };
}

async function loadPass(id, t) {
  const pass = id && (await getJSON(`cvpass:${clean(id, 40)}`));
  if (!pass || !safeEqual(pass.token, t)) return null;
  if (!pass.paidAt) {
    try { if (await invoicePaid(pass.invoice)) { pass.paidAt = new Date().toISOString(); await setJSON(`cvpass:${pass.id}`, pass); } }
    catch (err) { console.error("cv pass check", err.message); }
  }
  return pass;
}

// The host idles the app between requests, which cancels timers, so visits to
// the CV page also nudge the Career Agent to rebuild when the CV is out of date.
let lastSync = 0;
function nudgeSync() {
  if (Date.now() - lastSync < 30 * 60e3) return;
  lastSync = Date.now();
  syncCv().then((r) => console.log("CV sync", r)).catch((e) => console.error("CV sync", e.message));
}

export async function GET(request) {
  nudgeSync();
  const u = new URL(request.url);
  const cv = await publicCv();
  if (!cv) return json({ error: "CV not available." }, 404);
  if (!u.searchParams.get("pass")) return json({ locked: true, sats: CV_SATS, preview: preview(cv) });

  const pass = await loadPass(u.searchParams.get("pass"), u.searchParams.get("t"));
  if (!pass) return json({ error: "Unknown pass." }, 404);
  if (!pass.paidAt) return json({ locked: true, paid: false }, 402);
  if (Date.now() - Date.parse(pass.paidAt) > PASS_DAYS * 864e5) return json({ locked: true, expired: true }, 402);
  if (u.searchParams.get("format") !== "pdf") return json(cv);
  const name = (cv.cv.match(/^#\s+(.+)$/m)?.[1] || "CV").trim();
  return new Response(markdownToPdf(cv.cv, `${name} CV`), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${name.replace(/[^\w]+/g, "_")}_CV.pdf"`,
    "Cache-Control": "no-store",
  } });
}

export async function POST(request) {
  if ((await hit(`rl:cvpass:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many requests. Try again later." }, 429);
  let invoice;
  try { invoice = await createInvoice({ sats: CV_SATS, memo: "Altradits: view Stanley Chege Thuita's CV", expiry: 1800 }); }
  catch (err) { console.error("cv invoice", err.message); return json({ error: "Payments are briefly unavailable. Please try again in a few minutes." }, 503); }
  // The pass unlocks only on a payment we can confirm automatically.
  if (!invoice.autoConfirm) return json({ error: "Payments are briefly unavailable. Please try again in a few minutes." }, 503);
  const pass = { id: newId(), token: newId(18), invoice, createdAt: new Date().toISOString(), paidAt: null };
  await setJSON(`cvpass:${pass.id}`, pass);
  return json({ pass: pass.id, t: pass.token, sats: invoice.sats, bolt11: invoice.bolt11, expiresAt: invoice.expiresAt, qr: await qrSvg(`lightning:${invoice.bolt11}`.toUpperCase()) });
}
