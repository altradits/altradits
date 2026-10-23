// Living CV (fact sheet + master CV + public page) and job discovery.
// Fake Claude. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-career-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";
process.env.JOBS_ALLOW_LOCAL = "1";

const root = new URL("../", import.meta.url);
const jobs = await import(new URL("lib/jobs.js", root));
const career = await import(new URL("lib/career.js", root));
const crm = await import(new URL("lib/crm.js", root));
const admin = await import(new URL("api/admin.js", root));
const cvApi = await import(new URL("api/cv.js", root));

const req = (method, url, body) => new Request(`https://altradits.test${url}`, {
  method, headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, ...a) => { const r = await fn(req(...a)); return { status: r.status, body: await r.json() }; };

const seen = [];
const fake = (handler) => ({ beta: { messages: { stream: (p) => ({ finalMessage: async () => { seen.push(p); return handler(p); } }) } } });
const tool = (name, input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "z", name, input }] });

// A paid CV pass, as if the 100-sat invoice had settled.
const store = await import(new URL("lib/store.js", root));
await store.setJSON("cvpass:paid1", { id: "paid1", token: "tok", invoice: {}, createdAt: new Date().toISOString(), paidAt: new Date().toISOString() });
const PAID = "pass=paid1&t=tok";

test("/cv.html: free preview without contact details, full CV only with a paid pass", async () => {
  const r = await cvApi.GET(req("GET", "/api/cv"));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.locked, true);
  assert.equal(d.sats, 100);
  assert.equal(d.preview.name, "Stanley Chege Thuita");
  assert.match(d.preview.summary, /founder of Altradits/);
  assert.ok(d.preview.sections.includes("Work Experience"));
  assert.doesNotMatch(JSON.stringify(d), /@|github\.com|quick jobs \(/, "no contact details or experience before payment");
  assert.equal((await cvApi.GET(req("GET", "/api/cv?format=pdf"))).headers.get("content-type").includes("json"), true, "no PDF without a pass");
  assert.equal((await cvApi.GET(req("GET", "/api/cv?pass=paid1&t=wrong"))).status, 404);

  const full = await (await cvApi.GET(req("GET", `/api/cv?${PAID}`))).json();
  assert.match(full.cv, /^# Stanley Chege Thuita/);
  assert.match(full.cv, /39 same-day quick jobs/);
  assert.doesNotMatch(full.cv, /\[ADD/, "no placeholders on the public page");
  assert.equal(full.ats, null);
});

test("fact sheet states real work and never invents numbers", async () => {
  let f = await career.factSheet();
  assert.match(f, /Founder & Managing Director, Altradits/);
  assert.match(f, /39 same-day "quick jobs" \(\$9–\$35\)/, "in sync with the website catalog");
  assert.match(f, /weVenture Hub \(Addis Ababa\) and Zone01 \(Kisumu\)/);
  assert.match(f, /unified BIP21 QR/);
  assert.match(f, /AI department agents/);
  assert.match(f, /LND node/);
  assert.match(f, /No client metrics yet/, "no clients yet: no numbers");
  const lead = await crm.createLead({ name: "A", email: "a@example.com" });
  lead.stage = "active";
  await crm.saveLead(lead);
  f = await career.factSheet();
  assert.match(f, /1 paying client/);
});

test("Living CV is built from upload + notes + fact sheet; publishing controls /cv", async () => {
  // Needs a CV first.
  career.setCareerClient(fake(() => tool("submit_master_cv", {})));
  let r = await call(admin.POST, "POST", "/api/admin", { action: "job_master_build" });
  assert.equal(r.status, 400);

  await call(admin.POST, "POST", "/api/admin", { action: "job_profile", cv: "Go and Node.js engineer. Bitcoin Core lab. ".repeat(6), targets: "Backend engineer, Lightning developer", location: "Kenya, remote" });
  const pdf = Buffer.from("%PDF-1.4\n%%EOF");
  await call(admin.POST, "POST", "/api/admin", { action: "job_cv_upload", name: "Stanley.pdf", data: pdf.toString("base64") });

  career.setCareerClient(fake(() => tool("submit_master_cv", {
    headline: "Founder & AI-systems engineer | Go · Node.js · Bitcoin Lightning",
    summary: "Runs Altradits with a team of AI agents.", cv_markdown: "# Stanley Chege Thuita\n## Experience\n### Founder & operator, Altradits\n- Built an AI front office",
    skills: ["Go", "Node.js", "LND"], highlights: ["Built and runs an AI-agent VA business"], missing: ["Dates for Zone01 Kisumu"],
  })));
  const master = await career.buildMasterCv();
  assert.match(master.headline, /Founder/);
  const call0 = seen.at(-1);
  assert.equal(call0.messages[0].content[0].type, "document", "uploaded PDF attached");
  assert.match(call0.messages[0].content[1].text, /FACT SHEET/);
  assert.match(call0.system, /Never fabricate/);
  assert.match(call0.system, /ATS FORMAT/);
  assert.ok(master.ats.issues.length, "a thin CV is flagged by the ATS check");
  assert.match(seen.at(-1).messages.at(-1).content[0].content, /ATS check failed/, "one repair pass was requested");

  // Saving profile notes keeps the Living CV and settings.
  await call(admin.POST, "POST", "/api/admin", { action: "job_settings", publishCv: false, autoDiscover: true });
  await call(admin.POST, "POST", "/api/admin", { action: "job_profile", cv: "Go and Node.js engineer. ".repeat(10), targets: "Backend", location: "Kenya" });
  const p = await jobs.getProfile();
  assert.ok(p.master && p.cvFile && p.autoDiscover, "master, upload and settings preserved");

  const pub = await cvApi.GET(req("GET", `/api/cv?${PAID}`));
  assert.equal(pub.status, 200, "the agent's CV is what paying visitors see");
  assert.match((await pub.json()).cv, /Founder & operator, Altradits/);
});

test("tailored packs start from the Living CV", async () => {
  jobs.setJobsFetcher(async () => new Response(`<title>Backend Engineer - Acme</title>${"<p>Go, Postgres, payments.</p>".repeat(40)}`, { status: 200 }));
  const r = await call(admin.POST, "POST", "/api/admin", { action: "job_add", url: "https://acme.example/jobs/backend-engineer" });
  const id = r.body.added[0].id;
  jobs.setJobsClient(fake(() => tool("submit_application_pack", { title: "Backend Engineer", company: "Acme", fit_score: 80, fit_reasons: ["Go"], gaps: [], recommendation: "apply", cv_markdown: "# CV", cover_letter: "Hi", screening_answers: [], form_checklist: [] })));
  try {
    await jobs.prepareJob(id);
    const text = seen.at(-1).messages[0].content[1].text;
    assert.match(text, /MASTER CV \(maintained by the Career Agent/);
    assert.match(text, /Built an AI front office/);
  } finally { jobs.setJobsClient(null); }
});

test("Find jobs adds real, new postings and skips duplicates and bad links", async () => {
  const known = (await jobs.allJobs()).map((j) => j.url)[0];
  career.setCareerClient(fake((p) => {
    assert.ok(p.tools.some((t) => t.type === "web_search_20260209"), "searches the web");
    return tool("submit_job_leads", { jobs: [
      { title: "Lightning Engineer", company: "Voltage", location: "Remote", url: "https://jobs.example/voltage/lightning-engineer", why: "LND experience" },
      { title: "Dup", company: "Acme", url: known, why: "dup" },
      { title: "Bad", company: "X", url: "javascript:alert(1)", why: "bad" },
    ] });
  }));
  const r = await call(admin.POST, "POST", "/api/admin", { action: "job_discover" });
  assert.equal(r.status, 202);
  for (let i = 0; i < 100 && (await jobs.getProfile()).discovery?.running !== false; i++) await new Promise((res) => setTimeout(res, 10));
  const p = await jobs.getProfile();
  assert.equal(p.discovery.added, 1);
  const found = (await jobs.allJobs()).find((j) => /Lightning Engineer/.test(j.title));
  assert.equal(found.source, "discovery");
  assert.equal(found.why, "LND experience");
  assert.equal(await career.dailyDiscovery(), 0, "daily run: nothing new the second time (dup)");
  career.setCareerClient(null);
});

test("ATS check passes a clean CV; sync rebuilds only when the website changes; PDF download", async () => {
  const good = `# Stanley Chege Thuita
Founder & AI Systems Engineer
Nairobi, Kenya | altradits@gmail.com | altradits.com | github.com/altradits

## Professional Summary
Founder of Altradits, a fixed-price virtual assistant business run with AI agents and a freelancer team. Built its storefront, order automation and Bitcoin payments end to end.

## Core Skills
Engineering: Node.js, JavaScript, Go, REST APIs, GitHub Actions, CI/CD
AI: Claude API, AI agents, tool use
Payments: Bitcoin, Lightning Network, LND

## Work Experience
### Founder & Managing Director | Altradits | Remote
Jan 2026 – Present
${"- Launched a fixed-price storefront of 39 quick jobs, letting clients order and pay without a sales call\n".repeat(8)}
## Education
### Software Engineering | Zone01 Kisumu | Kisumu, Kenya
Jan 2024 – Dec 2025
${"- Completed peer-learning projects in Go and JavaScript\n".repeat(30)}`;
  const a = career.atsAudit(good);
  assert.deepEqual(a.issues, []);
  assert.equal(a.score, 100);
  assert.ok(career.atsAudit(good + "\n| a | b |\n| - | - |\n").issues.some((i) => /table/.test(i)));
  assert.ok(career.atsAudit(good.replace("## Core Skills", "## Toolbox 🚀")).issues.length >= 2);
  assert.ok(career.atsAudit(good.replace("Jan 2024", "[ADD: start date]")).issues.some((i) => /ADD/.test(i)), "placeholders are flagged");
  assert.ok(career.atsAudit(good.replace("Founder & AI Systems Engineer", "Founder & Full-Stack Engineer | AI Agent Systems · Bitcoin & Lightning Payments · Go / Node.js")).issues.some((i) => /Headline/.test(i)));

  let builds = 0;
  career.setCareerClient(fake(() => { builds++; return tool("submit_master_cv", { headline: "Founder", summary: "s", cv_markdown: good, skills: [], highlights: [], missing: [] }); }));
  assert.equal(await career.syncCv(), "up to date", "nothing on the website changed since the last build");
  const p = await jobs.getProfile();
  p.master.factsHash = "something-else"; // the website's offer changed
  await (await import(new URL("lib/store.js", root))).setJSON("jobprofile", p);
  assert.equal(await career.syncCv(), "rebuilt");
  assert.equal(builds, 1, "clean CV: no repair pass");
  assert.equal(await career.syncCv(), "up to date");

  const pdf = await cvApi.GET(req("GET", `/api/cv?format=pdf&${PAID}`));
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.match(pdf.headers.get("content-disposition"), /Stanley_Chege_Thuita_CV\.pdf/);
  const text = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  assert.match(text, /^%PDF/);
  assert.match(text, /Work Experience/, "real, extractable text");
  assert.equal((await (await cvApi.GET(req("GET", `/api/cv?${PAID}`))).json()).ats, 100);
  career.setCareerClient(null);
  assert.equal(await career.syncCv(), "skipped: no API key");
});

test("the top of the CV is always simple: short headline, one contact line, 2-sentence summary", () => {
  const old = `# STANLEY CHEGE THUITA
**Founder & Full-Stack Engineer | AI Agent Systems · Bitcoin & Lightning Payments · Go / Node.js**

Nairobi & Kisumu, Kenya · altradits@gmail.com · +254 707 172 370

altradits.com · github.com/altradits · linkedin.com/in/stanmobitech · altradits-portfolio.vercel.app · x.com/altradits

---

## Professional Summary
Founder and engineer who designed, built and runs **Altradits**, a global virtual-assistant business operated by one person and a team of AI agents. The system covers AI sales chat.

## Experience
- kept as is`;
  const out = career.simplifyTop(old).split("\n");
  assert.equal(out[0], "# Stanley Chege Thuita");
  assert.equal(out[1], "Founder & Full-Stack Engineer");
  assert.equal(out[2], "Nairobi & Kisumu, Kenya | altradits@gmail.com | +254 707 172 370 | altradits.com | linkedin.com/in/stanmobitech");
  const text = out.join("\n");
  assert.doesNotMatch(text, /one person|sales chat|vercel|x\.com/);
  assert.match(text, /## Professional Summary\nSoftware engineer and founder of Altradits/);
  assert.match(text, /- kept as is/);
});
