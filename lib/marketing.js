// Custom calendar posts: Stanley's own words on a blank template, placed on a
// calendar day. Stored as an overlay in the deploy-safe store (never in the
// tracked month files, which a deploy reset would wipe). Pure helpers shared
// by the API; the dashboard mirrors the merge in a few lines.
import fs from "node:fs";
export const CUSTOM_KEY = (month) => `mkt:custom:${month}`;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATA_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
export const MAX_IMAGE_CHARS = 700 * 1024;
export const POST_TYPES = ["Lesson", "Ye₿ente", "Myth vs fact", "Story", "Tip", "Question"];

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
  const type = String(input?.type || "");
  if (type && !POST_TYPES.includes(type)) throw new Error("Pick a content type from the list.");
  return { date, caption, alt: alt || `Custom post for ${date}`, imageData: input.imageData, type: type || null };
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
// Ideas keep thumbnails, not full pictures: the board is one store value,
// and 200 full-size pictures would outgrow shared hosting.
export const MAX_IDEA_IMAGE_CHARS = 60 * 1024;
export const MAX_IDEAS_BYTES = 8 * 1024 * 1024;
const IDEA_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const IDEA_JPEG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const CLEAN_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

export function validIdeaImage(s) {
  if (typeof s !== "string" || s.length > MAX_IDEA_IMAGE_CHARS || !IDEA_JPEG_RE.test(s)) return false;
  const bin = Buffer.from(s.split(",", 2)[1], "base64");
  if (bin.length < 16) return false;
  return bin[0] === 0xff && bin[1] === 0xd8 && bin[2] === 0xff;
}

// Idea layouts: the saved design behind a card's thumbnail (template plus
// elements), so Open in editor restores exactly what was pictured.
export const MAX_IDEA_ELEMENTS = 12;
export const MAX_LAYOUT_BYTES = 8 * 1024;
export const IDEA_STYLES = ["hbrand", "hsoft", "hplain", "hserif", "sbrand", "ssoft", "sserif", "smono"];
export const IDEA_COLORS = ["#0f1b2d", "#ffffff", "#ea5158", "#FFF7EC", "#000000"];
const TEXT_KEYS = ["kind", "role", "text", "x", "y", "w", "size", "style", "color", "align", "weight", "italic", "upper", "lines"];
const LOGO_KEYS = ["kind", "x", "y", "w", "white"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function validLayoutElement(e, i) {
  const who = `element ${i + 1}`;
  if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error(`Idea layout ${who} is not usable. Render the picture again.`);
  if (e.kind !== "text" && e.kind !== "logo") throw new Error(`Idea layout ${who} is neither words nor logo. Render the picture again.`);
  const allowed = e.kind === "text" ? TEXT_KEYS : LOGO_KEYS;
  for (const k of Object.keys(e)) {
    if (!allowed.includes(k)) throw new Error(`Idea layout ${who} carries an unknown detail. Render the picture again.`);
  }
  if (!isNum(e.x) || e.x < 0 || e.x > 1920 || !isNum(e.y) || e.y < 0 || e.y > 1280) throw new Error(`Idea layout ${who} sits off the canvas. Render the picture again.`);
  if (!isNum(e.w) || e.w < 1 || e.w > 1920) throw new Error(`Idea layout ${who} has a bad size. Render the picture again.`);
  if (e.kind === "logo") {
    if (typeof e.white !== "boolean") throw new Error(`Idea layout ${who} has a bad logo. Render the picture again.`);
    return { kind: "logo", x: e.x, y: e.y, w: e.w, white: e.white };
  }
  if (e.role !== null && e.role !== "head" && e.role !== "sub") throw new Error(`Idea layout ${who} has a bad role. Render the picture again.`);
  if (typeof e.text !== "string" || e.text.length > 200) throw new Error(`Idea layout ${who} holds too many words (200 max). Shorten it and render again.`);
  if (!isNum(e.size) || e.size < 1 || e.size > 1280) throw new Error(`Idea layout ${who} has a bad size. Render the picture again.`);
  if (!IDEA_STYLES.includes(e.style)) throw new Error(`Idea layout ${who} names an unknown style. Render the picture again.`);
  if (!IDEA_COLORS.includes(e.color)) throw new Error(`Idea layout ${who} names an unknown colour. Render the picture again.`);
  if (!["left", "center", "right"].includes(e.align)) throw new Error(`Idea layout ${who} has a bad alignment. Render the picture again.`);
  if (e.weight !== null && e.weight !== 800) throw new Error(`Idea layout ${who} has a bad weight. Render the picture again.`);
  if (typeof e.italic !== "boolean" || typeof e.upper !== "boolean") throw new Error(`Idea layout ${who} has a bad slant. Render the picture again.`);
  if (!Number.isInteger(e.lines) || e.lines < 1 || e.lines > 4) throw new Error(`Idea layout ${who} has a bad line count. Render the picture again.`);
  return { kind: "text", role: e.role, text: e.text, x: e.x, y: e.y, w: e.w, size: e.size, style: e.style, color: e.color, align: e.align, weight: e.weight, italic: e.italic, upper: e.upper, lines: e.lines };
}

export function validateIdeaLayout(layout) {
  if (layout === null || layout === undefined) return null;
  if (typeof layout !== "object" || Array.isArray(layout)) throw new Error("That layout is not usable. Render the picture again.");
  const keys = Object.keys(layout);
  if (keys.length !== 2 || !keys.includes("template") || !keys.includes("elements")) throw new Error("That layout is not usable. Render the picture again.");
  if (JSON.stringify(layout).length > MAX_LAYOUT_BYTES) throw new Error("That layout is too big. Simplify it and render again.");
  const tpls = JSON.parse(fs.readFileSync(new URL("../assets/marketing/templates.json", import.meta.url), "utf8"));
  if (!tpls.some((t) => t && t.file === layout.template)) throw new Error("That layout names an unknown background. Render the picture again.");
  if (!Array.isArray(layout.elements) || layout.elements.length > MAX_IDEA_ELEMENTS) throw new Error("That layout holds too many words (12 max). Simplify it and render again.");
  return { template: layout.template, elements: layout.elements.map((e, i) => validLayoutElement(e, i)) };
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
  if (imageData !== null && imageData.length > MAX_IDEA_IMAGE_CHARS) throw new Error("That picture is too big. Render a smaller one from the editor.");
  if (imageData !== null && !validIdeaImage(imageData)) throw new Error("That picture is not a JPEG. Render it from the editor again.");
  const placedDate = input?.placedDate || null;
  if (placedDate !== null && !validDay(String(placedDate))) throw new Error("That placed date is not a real day.");
  const list = Array.isArray(existing) ? existing : [];
  if (!list.some((e) => e && e.id === id) && list.length >= MAX_IDEAS) throw new Error("The board is full (200 ideas). Delete one first.");
  const layout = validateIdeaLayout(input?.layout);
  const idea = { id, column, title, caption, imageData, placedDate, updatedAt: new Date().toISOString(), layout };
  const rest = list.filter((e) => e && e.id !== id);
  if (JSON.stringify([...rest, idea]).length > MAX_IDEAS_BYTES) throw new Error("The board is too big (over 8 MB). Delete a picture or two first.");
  return idea;
}
