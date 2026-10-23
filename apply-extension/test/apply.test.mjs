// End-to-end: a fake job site (listing -> 2-step form -> thank-you page) driven
// in headless Chrome by the extension's own dom.js + core.js, with a scripted
// stand-in for the server's AI step. Run: npm test (in apply-extension/)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { runApplication, describe } from "../core.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let server, base, browser;
const submissions = [];

const LISTING = `<!doctype html><title>Senior Backend Engineer - Acme</title><h1>Senior Backend Engineer</h1><p>Go, payments.</p><a href="/form">Apply for this job</a>`;
const FORM = `<!doctype html><title>Apply - Acme</title><h1>Application</h1>
<form method="post" action="/submit" enctype="multipart/form-data">
  <div id="s1">
    <label for="n">Full name *</label><input id="n" name="name" required>
    <label for="e">Email *</label><input id="e" name="email" type="email" required>
    <label for="p">Phone *</label><input id="p" name="phone" required>
    <label for="c">Country</label><select id="c" name="country"><option></option><option>Kenya</option><option>Uganda</option></select>
    <button type="button" id="next" onclick="document.getElementById('s1').style.display='none';document.getElementById('s2').style.display='block'">Next</button>
  </div>
  <div id="s2" style="display:none">
    <label for="cv">Resume/CV *</label><input id="cv" name="cv" type="file" required>
    <label for="cl">Cover letter</label><textarea id="cl" name="cover"></textarea>
    <label for="ref">How many years of Go experience? *</label><input id="ref" name="goyears" required>
    <fieldset><legend>Gender</legend><label><input type="radio" name="gender" value="f">Female</label><label><input type="radio" name="gender" value="x">Prefer not to say</label></fieldset>
    <label><input type="checkbox" name="consent" required> I agree to the privacy policy</label>
    <label><input type="checkbox" name="news"> Send me marketing emails</label>
    <button type="submit" id="go">Submit application</button>
  </div>
</form>`;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/form") return res.end(FORM);
    if (req.url === "/submit") {
      let body = "";
      req.on("data", (c) => { body += c.toString("latin1"); });
      req.on("end", () => { submissions.push(body); res.end("<!doctype html><title>Thanks</title><h1>Thank you! Your application has been received.</h1>"); });
      return;
    }
    res.end(LISTING);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
});
after(async () => { await browser?.close(); server?.close(); });

function fakeThink() {
  let n = 0;
  const idFor = (view, re) => (view.split("\n").find((l) => re.test(l)) || "").match(/\[(f\d+e\d+)\]/)?.[1];
  return async (messages) => {
    const last = messages.at(-1);
    const view = typeof last.content === "string" ? last.content : last.content.map((c) => c.content).join("\n");
    const use = (...calls) => ({ stop_reason: "tool_use", content: calls.map(([name, input], i) => ({ type: "tool_use", id: `t${n}_${i}`, name, input })) });
    n++;
    if (/Thank you! Your application/.test(view)) return use(["finish", { outcome: "applied", details: "Thank you! Your application has been received." }]);
    if (idFor(view, /"Apply for this job"/)) return use(["click", { id: idFor(view, /"Apply for this job"/), why: "Open the application" }]);
    if (idFor(view, /"Full name \*/) && !/value="Stanley/.test(view)) return use(
      ["fill_field", { id: idFor(view, /"Full name/), value: "Stanley Chege Thuita" }],
      ["fill_field", { id: idFor(view, /"Email/), value: "altradits@gmail.com" }],
      ["fill_field", { id: idFor(view, /"Phone/), value: "+254 700 000000" }],
      ["select_option", { id: idFor(view, /"Country/), option: "Kenya" }],
      ["click", { id: idFor(view, /"Next"/), why: "Next step" }]);
    if (idFor(view, /"Resume\/CV/) && !/Stanley_CV.pdf/.test(view)) return use(
      ["upload_file", { id: idFor(view, /"Resume\/CV/), file: "tailored_cv" }],
      ["fill_field", { id: idFor(view, /"Cover letter/), value: "Dear Acme…" }],
      ["ask_stanley", { question: "How many years of Go experience should I state?" }]);
    if (/Stanley answered: (\d+)/.test(view)) return use(
      ["fill_field", { id: idFor(view, /"How many years/), value: view.match(/Stanley answered: (\d+)/)[1] }],
      ["set_checked", { id: idFor(view, /"Prefer not to say"/), checked: true }],
      ["set_checked", { id: idFor(view, /privacy policy/), checked: true }],
      ["ready_to_submit", { submit_id: idFor(view, /"Submit application"/), summary: "Name, contact, CV, cover letter, 3 yrs Go, consent" }]);
    return use(["finish", { outcome: "failed", details: `unexpected page: ${view.slice(0, 300)}` }]);
  };
}

test("extension fills a 2-step application, asks Stanley, waits for approval, then submits", async () => {
  const page = await browser.newPage();
  await page.addInitScript({ path: path.join(HERE, "..", "dom.js") });
  const settle = async (ms) => { await page.waitForLoadState("domcontentloaded").catch(() => {}); await page.waitForTimeout(Math.min(ms, 600)); };
  const adapter = {
    open: async (url) => { await page.goto(url); },
    settle,
    view: async () => describe([{ frame: 0, ...(await page.evaluate(() => window.__aa.snapshot("f0e"))) }]),
    act: async (name, input) => {
      const op = { name, ...input };
      if (name === "upload_file") Object.assign(op, { data: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"), fileName: "Stanley_CV.pdf", fileType: "application/pdf" });
      return page.evaluate((o) => window.__aa.act(o), op);
    },
    panel: async (s) => page.evaluate((st) => window.__aa.setPanel(st), s),
  };
  const asked = [], reports = [];
  let reviewed = false;
  const human = async (state) => {
    if (state.canSubmit) {
      reviewed = true;
      assert.equal(submissions.length, 0, "nothing submitted before Stanley approves");
      assert.equal(await page.locator("#__aa_host").count(), 1, "control panel visible for review");
      return { action: "submit" };
    }
    asked.push(state.message);
    return { action: "continue", text: "3" };
  };

  const result = await runApplication({
    adapter, think: fakeThink(), human, report: async (u) => reports.push(u),
    job: { id: "j1", url: base, title: "Senior Backend Engineer", company: "Acme" },
    pack: { cv: "# CV", coverLetter: "Dear Acme…", answers: [] },
    applicant: { fullName: "Stanley Chege Thuita", email: "altradits@gmail.com", phone: "+254 700 000000" },
    files: ["tailored_cv", "cover_letter"],
  });

  assert.equal(result.outcome, "applied", JSON.stringify(result));
  assert.ok(reviewed, "paused for review before submit");
  assert.match(asked[0], /years of Go/);
  assert.ok(reports.some((r) => r.status === "awaiting_submit"));
  const sent = submissions[0];
  assert.match(sent, /Stanley Chege Thuita/);
  assert.match(sent, /name="country"\r\n\r\nKenya/);
  assert.match(sent, /filename="Stanley_CV.pdf"/, "CV uploaded");
  assert.match(sent, /name="goyears"\r\n\r\n3/);
  assert.match(sent, /name="gender"\r\n\r\nx/, "prefer not to say");
  assert.match(sent, /name="consent"/);
  assert.doesNotMatch(sent, /name="news"/, "no marketing opt-in");
});

test("React-style controlled inputs register the filled value", async () => {
  const page = await browser.newPage();
  await page.addInitScript({ path: path.join(HERE, "..", "dom.js") });
  // Mimics React: the instance value property is overridden and only input
  // events from the native setter update state.
  await page.setContent(`<input id="x" aria-label="First name"><p id="out"></p><script>
    const el = document.getElementById('x'); let state = '';
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(el, 'value', { get(){ return desc.get.call(el) }, set(v){ state = v; desc.set.call(el, v) } });
    el.addEventListener('input', () => { state = desc.get.call(el); document.getElementById('out').textContent = 'state=' + state; });
  </script>`);
  await page.addScriptTag({ path: path.join(HERE, "..", "dom.js") });
  const view = await page.evaluate(() => window.__aa.snapshot("f0e"));
  const id = view.elements.find((e) => e.label === "First name").id;
  await page.evaluate((i) => window.__aa.act({ name: "fill_field", id: i, value: "Stanley" }), id);
  assert.equal(await page.textContent("#out"), "state=Stanley");
});
