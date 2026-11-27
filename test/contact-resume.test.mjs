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
  assert.match(html, /fetch\("\/api\/contact\?hash=" \+ draft\.quote\.hash\)/, "contact.html: resume asks the server");
  assert.match(html, /paid = \(await \(await fetch\("\/api\/contact\?hash=" \+ draft\.quote\.hash\)\)\.json\(\)\)\.paid === true/,
    "contact.html: only a fresh paid=true counts");
  assert.match(html, /if \(paid\) \{ quote = draft\.quote; showSend\(\); return; \}/, "contact.html: paid returns to Send");
  assert.match(html, /if \(Date\.parse\(draft\.quote\.expiresAt\) >= Date\.now\(\)\) \{ quote = draft\.quote; showPay\(quote\); startPoll\(\); return; \}/,
    "contact.html: a fresh quote returns to Pay with the wait restarted");
});

test("an expired quote falls back to step 1 with words kept", () => {
  assert.match(html, /saveDraft\({ fields }\);\n      \$\("#err"\)\.textContent = "Your last invoice expired\. Check your words and continue when ready\."/,
    "contact.html: expired keeps the words and says why");
});

test("going back keeps the live quote stashed, never mints from the draft", () => {
  assert.match(html, /stashWords\(\); \$\("#toPay"\)\.disabled = false/, "contact.html: going back stashes words");
  assert.match(html, /saveDraft\({ fields: readFields\(\), \.\.\.\(d\.quote \? \{ quote: d\.quote \} : \{\}\) \}\)/,
    "contact.html: the stashed quote survives going back");
  assert.doesNotMatch(html, /step: "quote".*draft|draft.*step: "quote"/, "contact.html: resume never mints, it only rechecks");
});
