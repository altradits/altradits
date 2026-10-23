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

test("fact sheet states real work and never invents numbers", async () => {
  let f = await career.factSheet();
  assert.match(f, /Founder & operator, Altradits/);
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

  // Saving profile notes keeps the Living CV and settings.
  await call(admin.POST, "POST", "/api/admin", { action: "job_settings", publishCv: false, autoDiscover: true });
  await call(admin.POST, "POST", "/api/admin", { action: "job_profile", cv: "Go and Node.js engineer. ".repeat(10), targets: "Backend", location: "Kenya" });
  const p = await jobs.getProfile();
  assert.ok(p.master && p.cvFile && p.autoDiscover, "master, upload and settings preserved");

  let pub = await cvApi.GET();
  assert.equal(pub.status, 404, "not public until published");
  await call(admin.POST, "POST", "/api/admin", { action: "job_settings", publishCv: true });
  pub = await cvApi.GET();
  assert.equal(pub.status, 200);
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
