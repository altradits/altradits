// A small, dependency-free PDF writer for CVs, cover letters and the library
// manuals: A4 pages, Helvetica, word-wrapped paragraphs, headings, bullet and
// numbered lists, "> " notes and ``` code blocks (Courier, shaded, spaces kept)
// from markdown. Text is real text, so ATS and search can read it.

import fs from "node:fs";
import zlib from "node:zlib";

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 54;

// The real Altradits logo (assets/logo.png), decoded once for letterheads:
// an RGB image plus its transparency as a soft mask. 8-bit, non-interlaced
// RGB or RGBA PNGs only; anything else leaves the letterhead without a logo.
let LOGO;
function logo() {
  if (LOGO !== undefined) return LOGO;
  LOGO = null;
  try {
    const png = fs.readFileSync(new URL("../assets/logo.png", import.meta.url));
    let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
    const idat = [];
    while (pos < png.length) {
      const len = png.readUInt32BE(pos), kind = png.toString("latin1", pos + 4, pos + 8), data = png.subarray(pos + 8, pos + 8 + len);
      if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
      if (kind === "IDAT") idat.push(data);
      pos += 12 + len;
    }
    if (depth !== 8 || interlace || ![2, 6].includes(type)) return LOGO;
    const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
    const px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
        px[row + x] = (src[x] + pred) & 255;
      }
    }
    const rgb = Buffer.alloc(w * h * 3), alpha = Buffer.alloc(w * h, 255);
    for (let i = 0; i < w * h; i++) { px.copy(rgb, i * 3, i * bpp, i * bpp + 3); if (bpp === 4) alpha[i] = px[i * 4 + 3]; }
    LOGO = { w, h, rgb: zlib.deflateSync(rgb), alpha: zlib.deflateSync(alpha) };
  } catch { /* no logo file: letterhead without it */ }
  return LOGO;
}
// Every page is the logo's brand background (#F5F5F5, from the official
// artwork), so the logo and the page read as one and every part shows as designed.
const PAGE_BG = `0.961 0.961 0.961 rg 0 0 ${PAGE_W} ${PAGE_H} re f 0 g`;
const LOGO_H = 30, LOGO_PAD = 8; // points
const tile = (L, top) => ({ x: MARGIN, y: top - 46, w: (LOGO_H * L.w) / L.h + LOGO_PAD * 2, h: LOGO_H + LOGO_PAD * 2 });
const WIDTH = PAGE_W - MARGIN * 2;

// Approximate Helvetica widths (per 1000 em) for wrapping.
const NARROW = "ijlI.,;:'!|()[]{}/\\ ", WIDE = "mwMW@";
function textWidth(s, size, bold) {
  let w = 0;
  for (const c of s) w += NARROW.includes(c) ? 280 : WIDE.includes(c) ? 850 : c === c.toUpperCase() && /[A-Z]/.test(c) ? 680 : 540;
  return (w * size * (bold ? 1.05 : 1)) / 1000;
}

function wrap(text, size, bold, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// PDF strings in WinAnsi: escape and map common Unicode punctuation.
function pdfText(s) {
  const map = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "•": "-", "…": "...", " ": " ", "→": "->", "·": "-", "₿": "B", "≥": ">=", "≤": "<=", "×": "x", "✓": "v", "★": "*" };
  return s.replace(/[‘’“”–—•… →·₿≥≤×✓★]/g, (c) => map[c])
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/[\\()]/g, (c) => `\\${c}`);
}

// Optional letterhead (opts.letterhead = { lines: [contact lines], footer }):
// the Altradits wordmark with its red swoosh and contact details on every
// page, a rule beneath, and a footer with page numbers. CVs don't use it.
// The letterhead uses only the real logo image, linked to the homepage.
function letterheadOps(lh, page, pages) {
  const top = PAGE_H - MARGIN + 6;
  const L = logo();
  const T = L && tile(L, top);
  const ops = L ? [`q ${(LOGO_H * L.w) / L.h} 0 0 ${LOGO_H} ${T.x + LOGO_PAD} ${T.y + LOGO_PAD} cm /Logo Do Q`] : [];
  lh.lines.forEach((line, i) => {
    const t = pdfText(line), w = textWidth(line, 8.5, false);
    ops.push(`0.294 0.353 0.439 rg BT /F1 8.5 Tf ${PAGE_W - MARGIN - w} ${top - 8 - i * 11.5} Td (${t}) Tj ET`);
  });
  ops.push(`0.153 0.298 0.467 RG 1.2 w ${MARGIN} ${top - 52} m ${PAGE_W - MARGIN} ${top - 52} l S 1 w`);
  const foot = lh.footer || "";
  const num = `Page ${page} of ${pages}`;
  ops.push(`0.788 0.827 0.875 RG 0.6 w ${MARGIN} ${MARGIN - 14} m ${PAGE_W - MARGIN} ${MARGIN - 14} l S 1 w`);
  ops.push(`0.294 0.353 0.439 rg BT /F1 8 Tf ${MARGIN} ${MARGIN - 26} Td (${pdfText(foot)}) Tj ET`);
  ops.push(`BT /F1 8 Tf ${PAGE_W - MARGIN - textWidth(num, 8, false)} ${MARGIN - 26} Td (${pdfText(num)}) Tj ET 0 g 0 G`);
  return ops.join("\n");
}

export function markdownToPdf(markdown, title = "Document", opts = {}) {
  const lh = opts.letterhead || null;
  const TOP = PAGE_H - MARGIN - (lh ? 68 : 0);
  // Lay out blocks into lines with font/size/indent.
  const blocks = [];
  let code = false;
  const CODE_SIZE = 8.2, CODE_CHARS = Math.floor((WIDTH - 14) / (CODE_SIZE * 0.6));
  for (const raw of String(markdown).replace(/\r/g, "").split("\n")) {
    if (/^\s*```/.test(raw)) { code = !code; blocks.push({ gap: code ? 2 : 6 }); continue; }
    if (code) { // monospace, spaces kept, long lines broken at the page width
      const line = raw.replace(/\t/g, "  ");
      for (let i = 0; i === 0 || i < line.length; i += CODE_CHARS) blocks.push({ code: line.slice(i, i + CODE_CHARS) || " " });
      continue;
    }
    const l = raw.trim();
    if (!l || /^-{3,}$/.test(l)) { blocks.push({ gap: 6 }); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)/);
    const li = l.match(/^[-*•]\s+(.*)/);
    const num = l.match(/^(\d+)[.)]\s+(.*)/);
    const note = l.match(/^>\s?(.*)/);
    // Markdown emphasis out; underscores inside words (ids, file names) stay.
    const clean = (t) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=$|[\s).,;:!?])/g, "$1$2").replace(/[*`]/g, "");
    if (h) blocks.push({ text: clean(h[2]), size: [0, 18, 12.5, 11][h[1].length], bold: true, before: h[1].length === 1 ? 0 : 8, rule: h[1].length === 2 });
    else if (li) blocks.push({ text: clean(li[1]), size: 10, bullet: true });
    else if (num) blocks.push({ text: clean(num[2]), size: 10, marker: `${num[1]}.` });
    else if (note) blocks.push({ text: clean(note[1]) || " ", size: 9.5, note: true });
    else if (/^\*\*[^*]+\*\*$/.test(l)) blocks.push({ text: clean(l), size: 10.5, bold: true, before: 4 }); // a bold label line
    else blocks.push({ text: clean(l), size: 10 });
  }
  const pages = [[]];
  let y = TOP;
  const put = (op, h) => {
    if (y - h < MARGIN) { pages.push([]); y = TOP; }
    y -= h;
    pages.at(-1).push(op(y));
  };
  for (const b of blocks) {
    if (b.gap) { y -= b.gap; continue; }
    if (b.code !== undefined) { // a shaded band per line, so a block reads as one box
      const lh = CODE_SIZE * 1.32;
      put((yy) => `0.906 0.914 0.925 rg ${MARGIN} ${yy - 2.6} ${WIDTH} ${lh} re f 0.153 0.298 0.467 rg ${MARGIN} ${yy - 2.6} 2 ${lh} re f 0.09 0.11 0.16 rg BT /F3 ${CODE_SIZE} Tf ${MARGIN + 8} ${yy} Td (${pdfText(b.code)}) Tj ET 0 g`, lh);
      continue;
    }
    if (b.before) y -= b.before;
    const indent = b.bullet ? 12 : b.marker ? 16 : b.note ? 12 : 0;
    const lines = wrap(b.text, b.size, b.bold, WIDTH - indent);
    lines.forEach((line, i) => {
      const font = b.bold ? "F2" : b.note ? "F4" : "F1";
      const lh = b.size * 1.35;
      const mark = (yy) => i ? "" : b.bullet ? `BT /F1 ${b.size} Tf ${MARGIN + 2} ${yy} Td (-) Tj ET ` : b.marker ? `BT /F2 ${b.size} Tf ${MARGIN} ${yy} Td (${b.marker}) Tj ET ` : "";
      const bar = (yy) => b.note ? `0.969 0.576 0.102 rg ${MARGIN} ${yy - 3} 2.5 ${lh} re f 0 g ` : "";
      put((yy) => `${bar(yy)}${mark(yy)}BT /${font} ${b.size} Tf ${MARGIN + indent} ${yy} Td (${pdfText(line)}) Tj ET`, lh);
    });
    if (b.rule) put((yy) => `0.6 G ${MARGIN} ${yy + 3} m ${PAGE_W - MARGIN} ${yy + 3} l S 0 G`, 4);
  }

  // Serialise objects.
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const f4 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
  const kids = [];
  // The logo image (once per document) and a link from it to the homepage on every page.
  const L = lh && logo();
  const img = L && (() => {
    const mask = add(`<< /Type /XObject /Subtype /Image /Width ${L.w} /Height ${L.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${L.alpha.length} >>\nstream\n${L.alpha.toString("latin1")}\nendstream`);
    return add(`<< /Type /XObject /Subtype /Image /Width ${L.w} /Height ${L.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${mask} 0 R /Filter /FlateDecode /Length ${L.rgb.length} >>\nstream\n${L.rgb.toString("latin1")}\nendstream`);
  })();
  const top = PAGE_H - MARGIN + 6;
  const T = L && tile(L, top);
  const link = L ? `/Annots [<< /Type /Annot /Subtype /Link /Rect [${T.x} ${T.y} ${T.x + T.w} ${T.y + T.h}] /Border [0 0 0] /A << /S /URI /URI (${pdfText(lh.url || "https://altradits.com")}) >> >>] ` : "";
  for (const [i, ops] of pages.entries()) {
    const stream = `${PAGE_BG}\n` + (lh ? `${letterheadOps(lh, i + 1, pages.length)}\n` : "") + ops.join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >>${img ? ` /XObject << /Logo ${img} 0 R >>` : ""} >> ${link}/Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${pdfText(title)}) /Producer (Altradits) >>`);
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
