// GET /api/cv            : Stanley's Living CV, only if he has chosen to publish it.
// GET /api/cv?format=pdf : the same CV as an ATS-friendly PDF (real text, one column).
import { json } from "../lib/http.js";
import { publicCv } from "../lib/career.js";
import { markdownToPdf } from "../lib/pdf.js";

export async function GET(request) {
  const cv = await publicCv();
  if (!cv) return json({ error: "Not published." }, 404);
  if (new URL(request.url).searchParams.get("format") !== "pdf") return json(cv);
  const name = (cv.cv.match(/^#\s+(.+)$/m)?.[1] || "CV").trim();
  return new Response(markdownToPdf(cv.cv, `${name} CV`), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${name.replace(/[^\w]+/g, "_")}_CV.pdf"`,
    "Cache-Control": "no-store",
  } });
}
