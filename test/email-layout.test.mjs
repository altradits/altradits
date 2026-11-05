import test from "node:test";
import assert from "node:assert/strict";
import { emailLayout, emailText, signatureHtml, sendEmail, setMailer } from "../lib/email.js";
import { BUSINESS } from "../data/brand.js";
import { commsFor } from "../data/team-comms.js";
import { liftDeadman } from "../lib/deadman.js";

test("message first, no letterhead: logo lives in the stamp", () => {
  const html = emailLayout("Hello.", null);
  assert.ok(html.indexOf("<p") < html.indexOf("cid:altradits-logo"), "words before the logo");
  assert.ok(!html.includes(BUSINESS.tagline.replace("&", "&amp;")), "no tagline block");
});

test("stamp footer: logo, place, contact and the safety line", () => {
  const html = emailLayout("Hello.", null);
  assert.ok(html.includes("cid:altradits-logo"), "inline logo");
  for (const bit of ["Kisumu, Kenya", "hello@altradits.com", "altradits.com", "We never ask for passwords"]) assert.ok(html.includes(bit), bit);
});

test("body: paragraphs, links and one button, all escaped", () => {
  const html = emailLayout("First.\n\nSee [the site](https://altradits.com/x) <script>alert(1)</script>", { label: "Open <it>", url: "https://altradits.com/?a=1&b=2" });
  assert.ok(html.includes("<p"), "paragraphs");
  assert.ok(html.includes('<a href="https://altradits.com/x"'), "markdown link");
  assert.ok(!html.includes("<script>"), "no raw script tag");
  assert.ok(html.includes("Open &lt;it&gt;"), "button label escaped");
  assert.ok(html.includes("?a=1&amp;b=2"), "button url escaped");
});

test("javascript: links stay inert text", () => {
  assert.ok(!emailLayout("click javascript:alert(1) now", null).includes('<a href="javascript:'));
});

test("signed stamp: red bar, name, title, linked contact", () => {
  const html = emailLayout("Hello.", null, ["Stan", "Head of Quality and Internal Communications, Altradits", "stan@altradits.com · altradits.com"]);
  assert.ok(html.includes("background:#EA5158"), "red brand bar");
  assert.ok(html.includes("<b style=\"color:#274C77;font-size:15px\">Stan</b>"), "name in navy");
  assert.ok(html.includes("Head of Quality and Internal Communications, Altradits"), "title");
  assert.ok(html.includes('<a href="mailto:stan@altradits.com"'), "address links to mail");
  assert.ok(html.includes("We never ask for passwords"), "safety line stays");
});

test("unsigned mail keeps the generic contact stamp", () => {
  const html = emailLayout("Hello.", null);
  assert.ok(!html.includes("background:#EA5158;font-size:0"), "no signature bar");
  assert.ok(html.includes("Kisumu, Kenya"), "generic contact block");
});

test("owner mail is signed by default, wallet mail is not", async () => {
  let sent = null;
  setMailer({ sendMail: async (m) => { sent = m; } });
  await liftDeadman({ by: "stanley", force: true, note: "test isolation" }); // other suites can leave the lockdown on
  await sendEmail({ to: "owner@example.com", subject: "s", text: "hello", kind: "owner" });
  assert.ok(sent.html.includes(commsFor("founder").signature[0]), "owner mail carries the founder signature");
  assert.ok(sent.text.includes(commsFor("founder").signature[0]), "plain text too");
  sent = null;
  await sendEmail({ to: "w@example.com", subject: "s", text: "hello", kind: "wallet" });
  assert.ok(sent && !sent.html.includes(commsFor("founder").signature[0]), "wallet mail stays unsigned");
  setMailer(undefined);
});

test("every send carries the plain-text twin and only the inline logo (the kit PDF+CSV tripped the relay filter, #119)", async () => {
  let sent = null;
  setMailer({ sendMail: async (m) => { sent = m; } });
  await liftDeadman({ by: "stanley", force: true, note: "test isolation" });
  await sendEmail({ to: "w@example.com", subject: "Confirm your Ye₿ente email", text: "Hi,\n\nConfirm this address.",
    cta: { label: "Confirm my email", url: "https://altradits.com/api/yebente/wallet/email-confirm?t=x" }, kind: "wallet" });
  assert.ok(sent.text.includes("Confirm this address."), "plain-text part carries the words");
  assert.ok(sent.text.includes("Confirm my email: https://altradits.com/api/yebente/wallet/email-confirm?t=x"), "plain-text part carries the link");
  for (const a of sent.attachments || []) {
    assert.equal(a.contentDisposition, "inline", "no file attachments, only the inline logo");
    assert.ok(a.cid, "inline parts carry a content id");
  }
  setMailer(undefined);
});

test("plain-text twin: same words plus sign-off footer", () => {
  const body = emailText("See [the site](https://altradits.com/x).", { label: "Open", url: "https://altradits.com/y" });
  assert.ok(body.includes("See the site: https://altradits.com/x."), "link flattened");
  assert.ok(body.includes("Open: https://altradits.com/y"), "cta appended");
  for (const bit of ["Altradits · Open-source Bitcoin", "Kisumu, Kenya", "hello@altradits.com", "We never ask for passwords"]) assert.ok(body.includes(bit), bit);
});
