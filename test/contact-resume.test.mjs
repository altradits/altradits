// Contact resume: a refresh or a closed tab must not strand the visitor.
// Typed words come back on step 1, and a saved quote is rechecked with the
// server: paid returns to Send, fresh returns to Pay, expired falls back to
// the kept words. Send never opens on a stored claim alone.
// Run: node --test test/contact-resume.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(ROOT, "contact.html"), "utf8");

test("typing stashes a browser-local draft, a sent message clears it", () => {
  assert.match(html, /DRAFT_KEY = "altradits-contact-draft-v1"/, "contact.html: the draft has one key");
  assert.match(html, /addEventListener\("input", stashWords\)/, "contact.html: typing stashes words");
  assert.match(html, /localStorage\.setItem\(DRAFT_KEY/, "contact.html: the draft stays in this browser");
  assert.match(html, /saveDraft\({ fields, quote: \{ hash: r\.hash, bolt11: r\.bolt11, qr: r\.qr, sats: r\.sats, usd: r\.usd, expiresAt: r\.expiresAt \} \}\)/,
    "contact.html: the quote joins the draft with its expiry");
  assert.match(html, /clearDraft\(\);\n    \$\("#msgForm"\)\.hidden = true/, "contact.html: a sent message clears the draft");
});

test("saved words fill the form again on load", () => {
  assert.match(html, /\$\("#name"\)\.value = draft\.fields\.name \|\| ""/, "contact.html: name comes back");
  assert.match(html, /\$\("#email"\)\.value = draft\.fields\.email \|\| ""/, "contact.html: email comes back");
  assert.match(html, /\$\("#message"\)\.value = draft\.fields\.message \|\| ""/, "contact.html: message comes back");
  assert.match(html, /setTopic\(draft\.fields\.topic\)/, "contact.html: topic comes back");
});

test("resume rechecks with the server before Send ever opens", () => {
  assert.match(html, /fetch\("\/api\/contact\?hash=" \+ encodeURIComponent\(draft\.quote\.hash\)\)/, "contact.html: resume asks the server with an encoded hash");
  assert.match(html, /paid = \(await \(await fetch\("\/api\/contact\?hash=" \+ encodeURIComponent\(draft\.quote\.hash\)\)\)\.json\(\)\)\.paid === true/,
    "contact.html: only a fresh paid=true counts");
  assert.match(html, /if \(paid\) \{ quote = draft\.quote; showSend\(\); return; \}/, "contact.html: paid returns to Send");
  assert.match(html, /if \(Date\.parse\(draft\.quote\.expiresAt\) >= Date\.now\(\)\) \{\n        if \(typeof draft\.quote\.qr !== "string" \|\| typeof draft\.quote\.bolt11 !== "string"\) \{ saveDraft\(\{ fields \}\); return; \}\n        quote = draft\.quote; showPay\(quote\); startPoll\(\); return;\n      \}/,
    "contact.html: a fresh sound quote returns to Pay with the wait restarted");
});

test("an expired quote falls back to step 1 with words kept", () => {
  assert.match(html, /saveDraft\({ fields }\);\n      \$\("#err"\)\.textContent = "Your last invoice expired\. Check your words and continue when ready\."/,
    "contact.html: expired keeps the words and says why");
});

test("stored invoice data never becomes page markup or a raw link", () => {
  assert.doesNotMatch(html, /innerHTML = [rq]\.qr/, "contact.html: the QR picture is not written as markup");
  assert.match(html, /createElement\("img"\)/, "contact.html: the QR picture is an image element");
  assert.match(html, /pic\.src = "data:image\/svg\+xml," \+ encodeURIComponent\(svg\)/, "contact.html: the picture source is encoded");
  assert.match(html, /\$\("#open"\)\.href = "lightning:" \+ encodeURIComponent\(q\.bolt11\)/, "contact.html: the wallet link is encoded");
  assert.match(html, /\.qr img\{display:block;width:100%;height:auto\}/, "contact.html: the picture fills the QR box");
});

test("an in-flight resume never hijacks an active submit", () => {
  assert.match(html, /let poll = null, quote = null, fields = null, resumed = true;/, "contact.html: resume starts armed");
  assert.match(html, /e\.preventDefault\(\); resumed = false;/, "contact.html: submitting disarms it");
  assert.match(html, /clearInterval\(poll\); resumed = false; quote = null;/, "contact.html: going back disarms it");
  assert.match(html, /\} catch \{\}\n      if \(!resumed\) return;\n      fields = readFields\(\);/,
    "contact.html: a late resume aborts, and edits typed meanwhile are kept");
});

test("the saved hash and quote are validated before use", () => {
  assert.match(html, /\/\^\[0-9a-f\]\{64\}\$\/i\.test\(draft\.quote\.hash\)/, "contact.html: the saved hash must look like a hash");
  assert.match(html, /fetch\("\/api\/contact\?hash=" \+ encodeURIComponent\(quote\.hash\)\)/, "contact.html: the wait loop encodes its hash too");
  assert.match(html, /typeof draft\.quote\.qr !== "string" \|\| typeof draft\.quote\.bolt11 !== "string"\) \{ saveDraft\(\{ fields \}\); return; \}/,
    "contact.html: a corrupt quote is dropped instead of rendered");
});

test("going back keeps the live quote stashed, never mints from the draft", () => {
  assert.match(html, /stashWords\(\); \$\("#toPay"\)\.disabled = false/, "contact.html: going back stashes words");
  assert.match(html, /saveDraft\({ fields: readFields\(\), \.\.\.\(d\.quote \? \{ quote: d\.quote \} : \{\}\) \}\)/,
    "contact.html: the stashed quote survives going back");
  assert.doesNotMatch(html, /step: "quote".*draft|draft.*step: "quote"/, "contact.html: resume never mints, it only rechecks");
});
