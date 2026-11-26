// The paid contact step offers a way back: an expired invoice must not strand
// the visitor on a page whose only advice is to start again. The paid step
// stays one-way on purpose (going back would mint a second invoice).
// Run: node --test test/contact-back.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the pay step links back to the message, the paid step does not", () => {
  const html = read("contact.html");
  assert.match(html, /id="backToWrite"[^>]*>Back to your message</, "contact.html: the pay step has its way back");
  assert.match(html, /\$\("#backToWrite"\)\.addEventListener\("click"/, "contact.html: the way back is wired");
  assert.match(html, /clearInterval\(poll\)[^}]*\$\("#stepWrite"\)\.hidden = false/, "contact.html: going back stops the wait and reopens the message");
  const send = html.slice(html.indexOf('id="stepSend"'), html.indexOf('id="stepSend"') + html.slice(html.indexOf('id="stepSend"')).indexOf("</fieldset>"));
  assert.doesNotMatch(send, /backToWrite|Back to your message/, "contact.html: the paid step offers no way back");
});
