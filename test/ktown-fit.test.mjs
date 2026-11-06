// kTown fit: every phone screen fits one viewport with no page scrolling.
// Static guards for the app shell (a 100dvh column of header, content and
// tab bar; only a content area ever scrolls). The live proof is the headless
// fit check with screenshots (sizes 320x568 to 412x915).
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const css = read("ktown/style.css");

test("kTown shell: one dynamic viewport, the page itself never scrolls", () => {
  assert.match(css, /height:100vh;height:100dvh/,
    "ktown/style.css: the app shell fills 100dvh with a 100vh fallback");
  assert.match(css, /body\.has-tabs,body\.pay\{[^}]*display:flex;flex-direction:column/,
    "ktown/style.css: header, content and tab bar are one column");
  assert.match(css, /body\.has-tabs,body\.pay\{[^}]*overflow:hidden\}/,
    "ktown/style.css: the page clips instead of scrolling");
  assert.match(css, /body\.has-tabs \.wrap,body\.pay \.wrap\{[^}]*flex:1 1 auto;min-height:0;[^}]*overflow-y:auto/,
    "ktown/style.css: only the content area scrolls inside itself");
  assert.doesNotMatch(css, /\.tabs\{[^}]*position:fixed/,
    "ktown/style.css: the tab bar sits in the column, not bolted over content");
  assert.match(css, /env\(safe-area-inset-bottom\)/,
    "ktown/style.css: the tab bar respects the home indicator");
  assert.match(css, /env\(safe-area-inset-top\)/,
    "ktown/style.css: the header respects the notch");
});

test("kTown fit: the QR scales to the free space, forms and history stay usable", () => {
  assert.match(css, /calc\(100dvh - [\d.]+rem\)/,
    "ktown/style.css: the QR width is capped by the viewport height");
  assert.match(css, /max\(16rem,min\(/,
    "ktown/style.css: the QR never shrinks below a scannable 220px plus padding");
  assert.match(css, /input,select\{[^}]*min-height:3rem/,
    "ktown/style.css: inputs stay 48px tall");
  assert.match(css, /\.tx\{[^}]*max-height:20rem;overflow-y:auto/,
    "ktown/style.css: a long history scrolls inside its own list");
  for (const page of ["ktown/index.html", "ktown/pay.html"])
    assert.match(read(page), /viewport-fit=cover/,
      `${page}: the viewport reaches under the notch`);
  for (const js of ["ktown/app.js", "ktown/pay.js"])
    assert.match(read(js), /scrollIntoView\(\{ block: "nearest" \}\)/,
      `${js}: the keyboard never hides the focused field`);
});

test("kTown fit: no fixed heights that force overflow", () => {
  assert.doesNotMatch(css, /height:\d+(\.\d+)?px/,
    "ktown/style.css: no pixel heights that could push content off a small phone");
  assert.doesNotMatch(css, /min-height:\d+(\.\d+)?px/,
    "ktown/style.css: no pixel min-heights either");
  assert.match(css, /@media print\{[\s\S]*overflow:visible/,
    "ktown/style.css: print releases the shell, so the card is never clipped");
});
