// Custom calendar posts: Stanley's own words on a blank template, placed on a
// calendar day. Stored as an overlay in the deploy-safe store (never in the
// tracked month files, which a deploy reset would wipe). Pure helpers shared
// by the API; the dashboard mirrors the merge in a few lines.
export const CUSTOM_KEY = (month) => `mkt:custom:${month}`;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATA_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
export const MAX_IMAGE_CHARS = 700 * 1024;

export function validDay(date) {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validImageData(s) {
  if (typeof s !== "string" || s.length > MAX_IMAGE_CHARS || !DATA_RE.test(s)) return false;
  const bin = Buffer.from(s.split(",", 2)[1], "base64");
  if (bin.length < 16) return false;
  const jpeg = bin[0] === 0xff && bin[1] === 0xd8 && bin[2] === 0xff;
  const png = bin[0] === 0x89 && bin[1] === 0x50 && bin[2] === 0x4e && bin[3] === 0x47;
  return jpeg || png;
}

// Throws a plain message when anything is off; returns the cleaned post.
export function validateCustomPost(input, months) {
  const month = String(input?.month || "");
  if (!MONTH_RE.test(month) || !months.includes(month)) throw new Error("Pick a month from the schedule.");
  const date = String(input?.date || "");
  if (!validDay(date) || !date.startsWith(month)) throw new Error("Pick a real day inside that month.");
  const caption = String(input?.caption || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!caption) throw new Error("Write a caption first.");
  if (caption.length > 280) throw new Error("Keep the caption under 280 characters.");
  const alt = String(input?.alt || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 200);
  if (!validImageData(input?.imageData)) throw new Error("That download is not a picture. Compose it again.");
  return { date, caption, alt: alt || `Custom post for ${date}`, imageData: input.imageData };
}

// Custom posts win by date, then everything runs in day order.
export function mergeCustomPosts(posts, customs) {
  const byDate = new Map((posts || []).map((p) => [p.date, p]));
  for (const c of customs || []) byDate.set(c.date, { ...c, custom: true });
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Ideas board: rough cuts for future posts, kept server-side like custom
// posts. One card holds a title, a caption draft and an optional JPEG
// rendered from the editor.
export const IDEAS_KEY = "mkt:ideas";
export const IDEA_COLUMNS = ["ideas", "drafting", "approved", "placed"];
export const MAX_IDEAS = 200;
const IDEA_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const IDEA_JPEG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const CLEAN_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

export function validIdeaImage(s) {
  if (typeof s !== "string" || s.length > MAX_IMAGE_CHARS || !IDEA_JPEG_RE.test(s)) return false;
  const bin = Buffer.from(s.split(",", 2)[1], "base64");
  if (bin.length < 16) return false;
  return bin[0] === 0xff && bin[1] === 0xd8 && bin[2] === 0xff;
}

// Throws a plain message when anything is off; returns the cleaned idea.
// Pass the stored list so a full board refuses new cards.
export function validateIdea(input, existing) {
  const id = String(input?.id || "");
  if (!IDEA_ID_RE.test(id)) throw new Error("That idea has a bad id. Make a new one.");
  const column = String(input?.column || "");
  if (!IDEA_COLUMNS.includes(column)) throw new Error("Pick a board column.");
  const title = String(input?.title || "").replace(CLEAN_RE, "").trim();
  if (!title) throw new Error("Give the idea a title first.");
  if (title.length > 80) throw new Error("Keep the title under 80 characters.");
  const caption = String(input?.caption || "").replace(CLEAN_RE, "").trim();
  if (caption.length > 280) throw new Error("Keep the caption under 280 characters.");
  const imageData = input?.imageData || null;
  if (imageData !== null && !validIdeaImage(imageData)) throw new Error("That picture is not a JPEG. Render it from the editor again.");
  const placedDate = input?.placedDate || null;
  if (placedDate !== null && !validDay(String(placedDate))) throw new Error("That placed date is not a real day.");
  const list = Array.isArray(existing) ? existing : [];
  if (!list.some((e) => e && e.id === id) && list.length >= MAX_IDEAS) throw new Error("The board is full (200 ideas). Delete one first.");
  return { id, column, title, caption, imageData, placedDate, updatedAt: new Date().toISOString() };
}
