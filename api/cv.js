// GET /api/cv : Stanley's Living CV, only if he has chosen to publish it.
import { json } from "../lib/http.js";
import { publicCv } from "../lib/career.js";

export async function GET() {
  const cv = await publicCv();
  return cv ? json(cv) : json({ error: "Not published." }, 404);
}
