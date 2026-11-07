// kTown fit: every screen fits one viewport with no page scrolling, on
// every screen height. Static guards for the app shell (a 100dvh column of
// header, content and tab bar; only a content area ever scrolls) and the
// height-driven rules. The live proof is the headless height check with
// screenshots (landscape phones, tablets, desktops, and the portrait
// phones 320x568 to 412x915).
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

test("kTown height: landscape phones go two-column, short screens stay scannable", () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-height:30rem\)\{/,
    "ktown/style.css: landscape phones get their own height-driven layout");
  assert.match(css, /#screen-qr\{display:grid;grid-template-columns:auto 1fr/,
    "ktown/style.css: the merchant code sits beside the shop name and buttons");
  assert.match(css, /#view-invoice\{display:grid;grid-template-columns:auto 1fr/,
    "ktown/style.css: the invoice code sits beside its actions");
  assert.match(css, /#view-pay\{display:grid;grid-template-columns:1fr 1fr/,
    "ktown/style.css: the pay form splits into shop and amount columns");
  assert.match(css, /max\(13\.5rem,min\(17rem,calc\(100dvh - 8rem\)\)\)/,
    "ktown/style.css: the landscape code is capped by height, floored at 200px");
  assert.match(css, /@media screen and \(max-height:52rem\)\{/,
    "ktown/style.css: short-screen tightening covers short landscape windows");
  assert.match(css, /#view-invoice \.qr-card\{padding:\.75rem\}/,
    "ktown/style.css: the invoice code stays scannable on short screens");
  assert.match(css, /#screen-qr,#view-pay,#view-invoice\{display:block\}/,
    "ktown/style.css: printing from a landscape phone keeps the stacked card");
});

test("kTown fit: no fixed heights that force overflow", () => {
  assert.doesNotMatch(css, /height:\d+(\.\d+)?px/,
    "ktown/style.css: no pixel heights that could push content off a small phone");
  assert.doesNotMatch(css, /min-height:\d+(\.\d+)?px/,
    "ktown/style.css: no pixel min-heights either");
  assert.match(css, /@media print\{[\s\S]*overflow:visible/,
    "ktown/style.css: print releases the shell, so the card is never clipped");
});
