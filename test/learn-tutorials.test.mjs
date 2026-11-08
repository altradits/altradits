// The Learn tab's tutorial PDFs (assets/learn-*.pdf) are public files in a
// public repo. They are practice editions: node keys, payment IDs, invoices,
// tunnel names and server addresses must be placeholders. This reads the text
// of every PDF (inflating compressed streams) and fails on anything that looks
// like a real identifier, and checks the Learn tab links each one.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const pdfs = fs.readdirSync(path.join(root, "assets")).filter((f) => /^learn-[\w-]+\.pdf$/.test(f));

// ASCII85 (PDF's /ASCII85Decode filter) to bytes.
function a85(s) {
  s = s.replace(/\s/g, "").replace(/^<~/, "").replace(/~>.*$/, "");
  const out = [];
  for (let i = 0; i < s.length;) {
    if (s[i] === "z") { out.push(0, 0, 0, 0); i++; continue; }
    const chunk = s.slice(i, i + 5); i += 5;
    const pad = 5 - chunk.length;
    let n = 0;
    for (const c of chunk.padEnd(5, "u")) n = n * 85 + (c.charCodeAt(0) - 33);
    const bytes = [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
    out.push(...bytes.slice(0, 4 - pad));
  }
  return Buffer.from(out);
}

// Every stream's text, decoded (ASCII85) and inflated (Flate) as needed.
function pdfText(file) {
  const buf = fs.readFileSync(path.join(root, "assets", file));
  const raw = buf.toString("latin1");
  let out = raw;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dict = raw.slice(Math.max(0, raw.lastIndexOf("<<", m.index)), m.index);
    let data = buf.subarray(start, end);
    if (/ASCII85Decode/.test(dict)) data = a85(data.toString("latin1"));
    try { data = zlib.inflateSync(data); } catch { /* not compressed */ }
    out += "\n" + data.toString("latin1");
  }
  return out;
}

test("the PDF reader really reads text", () => {
  const sample = pdfs.map(pdfText).join("\n");
  assert.match(sample, /Practice edition/, "the reader decoded no page text: fix pdfText before trusting the checks below");
});

test("the Learn tab has tutorial PDFs", () => {
  assert.ok(pdfs.length >= 6, "expected the six tutorial PDFs in assets/");
});

for (const f of pdfs) {
  test(`${f}: no real identifiers in a public tutorial`, () => {
    const t = pdfText(f);
    assert.doesNotMatch(t, /\b0[23][0-9a-f]{64}\b/, "a Lightning node public key: use a placeholder");
    assert.doesNotMatch(t, /\b[0-9a-f]{64}\b/, "a 64-character hash, preimage or txid: use a placeholder");
    assert.doesNotMatch(t, /\blnbc[0-9a-z]{30,}/, "a Lightning invoice: use a placeholder");
    assert.doesNotMatch(t, /\b[a-z2-7]{56}\.onion\b/, "a Tor address: use a placeholder");
    assert.doesNotMatch(t, /\b(?!\[)[a-z]+-[a-z]+-[a-z]+\.ngrok-free\.(?:dev|app)\b/, "a real ngrok domain: use [your-domain]");
    assert.doesNotMatch(t, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/, "an order ID: use a placeholder");
    const ips = (t.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || []).filter((ip) => !/^(127\.|10\.|192\.168\.|0\.0\.0\.0$)/.test(ip));
    assert.deepEqual(ips, [], "a public IP address: use a placeholder");
    assert.doesNotMatch(t, /\/Users\/(?!you\b)[a-z]+/, "a real Mac user folder: use /Users/you or ~");
  });
}

test("the Learn tab links every tutorial PDF", () => {
  const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  for (const f of pdfs) assert.ok(html.includes(`href="/assets/${f}"`), `admin.html: link ${f} in the Learn tab`);
});
