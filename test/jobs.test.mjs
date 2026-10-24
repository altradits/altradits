// Stanley's job hunt: careers-page parsing, SSRF guard, Career Agent packs,
// application tracking. Fake web + fake Claude. Run: npm test
process.env.EMAIL_APPROVAL = "off"; // these tests check delivery; the approval gate has its own tests
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-jobs-"));
process.chdir(tmp);
for (const k of ["ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
process.env.ADMIN_TOKEN = "secret-admin";

const root = new URL("../", import.meta.url);
const jobs = await import(new URL("lib/jobs.js", root));
const admin = await import(new URL("api/admin.js", root));

const LISTING = `<html><head><title>Umba - Current Openings</title></head><body>
  <a href="/apply/">All jobs</a>
  <a href="/apply/2xd8XbYRID/Senior-Backend-Engineer-AINative-Remote">Senior Backend Engineer (AI-Native)- Remote</a>
  <a href="/apply/uocvLmEBFD/Executive-Assistant">Executive Assistant</a>
  <a href="https://umba.applytojob.com/apply/JwcNcZmD99/Senior-Product-Manager-AINative-Remote">Senior Product Manager (AI-Native) - Remote</a>
  <a href="https://other.example.com/apply/zzzzzzzz/Elsewhere">Other site</a>
  <a href="/privacy">Privacy</a></body></html>`;
const JOB = `<html><head><title>Senior Backend Engineer (AI-Native)- Remote - Umba</title><script>evil()</script></head><body>
  <h1>Senior Backend Engineer</h1><p>We need Go &amp; Postgres experience, payments systems, 5+ years.</p>
  <ul><li>Design APIs</li><li>Own reliability</li></ul>${"<p>More detail about the role and team culture.</p>".repeat(20)}</body></html>`;
jobs.setJobsFetcher(async (url) => new Response(url.includes("/apply/2xd8") ? JOB : LISTING, { status: 200, headers: { "Content-Type": "text/html" } }));

const req = (method, url, body) => new Request(`https://altradits.test${url}`, {
  method, headers: { "Content-Type": "application/json", Authorization: "Bearer secret-admin" }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, ...a) => { const r = await fn(req(...a)); return { status: r.status, body: await r.json() }; };

test("SSRF guard refuses internal addresses", async () => {
  delete process.env.JOBS_ALLOW_LOCAL;
  await assert.rejects(jobs.safeUrl("http://localhost:8080/v1/getinfo"), /public website/);
  await assert.rejects(jobs.safeUrl("http://169.254.169.254/latest/meta-data"), /public website/);
  await assert.rejects(jobs.safeUrl("file:///etc/passwd"), /http/);
});

test("careers page lists every opening; a job page adds one job; duplicates ignored", async () => {
  process.env.JOBS_ALLOW_LOCAL = "1"; // skip DNS in tests
  const r = await call(admin.POST, "POST", "/api/admin", { action: "job_add", url: "https://umba.applytojob.com/apply/" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.listing, true);
  assert.equal(r.body.added.length, 3, "three Umba openings, other site and non-job links ignored");
  assert.deepEqual(r.body.added.map((j) => j.company), ["Umba", "Umba", "Umba"]);
  const again = await call(admin.POST, "POST", "/api/admin", { action: "job_add", url: "https://umba.applytojob.com/apply/" });
  assert.equal(again.body.added.length, 0, "no duplicates");

  const text = jobs.htmlToText(JOB);
  assert.match(text, /Go & Postgres/);
  assert.doesNotMatch(text, /evil/, "scripts stripped");
});

test("Career Agent prepares a pack from the profile; Stanley tracks the application", async () => {
  let r = await call(admin.GET, "GET", "/api/admin?view=jobs");
  const job = r.body.jobs.find((j) => /Backend/.test(j.title));

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_prepare", id: job.id });
  assert.equal(r.status, 400, "needs the AI key");

  const seen = [];
  jobs.setJobsClient({ beta: { messages: { stream: (p) => ({ finalMessage: async () => { seen.push(p); return {
    stop_reason: "tool_use", content: [{ type: "tool_use", id: "x", name: "submit_application_pack", input: {
      title: "Senior Backend Engineer (AI-Native)", company: "Umba", location: "Remote (Nairobi)", fit_score: 74,
      fit_reasons: ["Go backend work (bitcoin-core-lab, YeboBank)"], gaps: ["5+ years: profile shows fewer; emphasise open-source depth"],
      recommendation: "apply_with_care", cv_markdown: "# Stanley Chege Thuita\n## Experience\n- Built SatsPool in pure Go [ADD: users]",
      cover_letter: "Dear Umba team, ...", screening_answers: [{ question: "Why Umba?", answer: "Payments in Africa..." }],
      form_checklist: ["CV (PDF)", "LinkedIn URL"], deadline: "", salary_notes: "Not stated",
    } }] }; } }) } } });
  try {
    r = await call(admin.POST, "POST", "/api/admin", { action: "job_prepare", id: job.id });
    assert.equal(r.status, 400, "needs a profile first");
    await call(admin.POST, "POST", "/api/admin", { action: "job_profile", cv: "Software engineer in Go and Next.js. ".repeat(10), targets: "Backend engineer", location: "Kenya, remote" });

    const j = await jobs.prepareJob(job.id);
    assert.equal(j.status, "ready");
    assert.equal(j.pack.fitScore, 74);
    assert.match(seen[0].system, /Never fabricate/);
    assert.match(seen[0].messages[0].content, /Go & Postgres/, "job page text given to the agent");
    assert.match(seen[0].messages[0].content, /Software engineer in Go/, "profile given to the agent");

    r = await call(admin.POST, "POST", "/api/admin", { action: "job_status", id: job.id, status: "applied" });
    assert.equal(r.body.job.status, "applied");
    // A week of silence flags a follow-up.
    const stored = await jobs.getJob(job.id);
    stored.appliedAt = new Date(Date.now() - 8 * 864e5).toISOString();
    await jobs.saveJob(stored);
    r = await call(admin.GET, "GET", "/api/admin?view=jobs");
    const listed = r.body.jobs.find((x) => x.id === job.id);
    assert.equal(listed.followUp, true);
    assert.equal(listed.pageText, undefined, "page text not sent to the dashboard");
  } finally {
    jobs.setJobsClient(null);
  }
});

// Builds a minimal .docx (a ZIP with word/document.xml) for the upload test.
import zlib from "node:zlib";
function makeDocx(paragraphs) {
  const xml = Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  const data = zlib.deflateRawSync(xml), name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
}

test("CV upload: Word text is read; a PDF is attached to the Career Agent; bad files refused", async () => {
  const docx = makeDocx(["Stanley Chege Thuita", "Software Engineer - Go, Next.js, Bitcoin and Lightning", "Built SatsPool, a multi-user Bitcoin savings pool in pure Go", "Contributed to Flying-Tea-Squad/lms: RBAC, uploads, API security"]);
  let r = await call(admin.POST, "POST", "/api/admin", { action: "job_cv_upload", name: "Stanley CV.docx", data: docx.toString("base64") });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.profile.cvFile.ext, "docx");
  assert.equal(r.body.profile.cvFile.text, undefined, "full text not sent to the dashboard");
  assert.match((await jobs.getProfile()).cvFile.text, /SatsPool, a multi-user Bitcoin savings pool/);

  // Saving typed notes keeps the uploaded file.
  await call(admin.POST, "POST", "/api/admin", { action: "job_profile", cv: "Also: BitDevs Kisumu co-founder", targets: "Backend" });
  assert.equal((await jobs.getProfile()).cvFile.name, "Stanley CV.docx");

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_cv_upload", name: "cv.pdf", data: Buffer.from("not a pdf").toString("base64") });
  assert.equal(r.status, 400, "fake PDF refused");
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_cv_upload", name: "cv.exe", data: Buffer.from("MZ").toString("base64") });
  assert.equal(r.status, 400, "other file types refused");

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_cv_upload", name: "Stanley.pdf", data: pdf.toString("base64") });
  assert.equal(r.body.profile.cvFile.ext, "pdf");
  const dl = await admin.GET(req("GET", "/api/admin?view=cvfile"));
  assert.equal(dl.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), pdf.toString(), "download returns the same file");

  // The PDF goes to the Career Agent as a document.
  const seen = [];
  jobs.setJobsClient({ beta: { messages: { stream: (p) => ({ finalMessage: async () => { seen.push(p); return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "y", name: "submit_application_pack", input: {
    title: "Executive Assistant", company: "Umba", fit_score: 55, fit_reasons: ["x"], gaps: ["y"], recommendation: "apply_with_care",
    cv_markdown: "# CV", cover_letter: "Hi", screening_answers: [], form_checklist: [] } }] }; } }) } } });
  try {
    const ea = (await jobs.allJobs()).find((x) => /Executive/.test(x.title));
    await jobs.prepareJob(ea.id);
    const content = seen[0].messages[0].content;
    assert.equal(content[0].type, "document");
    assert.equal(content[0].source.media_type, "application/pdf");
    assert.match(content[1].text, /attached as a PDF document \(Stanley\.pdf\)/);
  } finally { jobs.setJobsClient(null); }

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_cv_remove" });
  assert.equal(r.body.profile.cvFile, undefined);
  assert.equal((await admin.GET(req("GET", "/api/admin?view=cvfile"))).status, 404);
});

test("Apply with AI via the extension: CV-filled details, start, AI steps, PDFs, outcome", async () => {
  const apply = await import(new URL("lib/apply.js", root));
  const job = (await jobs.allJobs()).find((x) => x.pack);
  let r = await call(admin.POST, "POST", "/api/admin", { action: "job_apply", id: job.id });
  assert.equal(r.status, 400, "needs confirmed applicant details");

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_applicant_suggest" });
  assert.equal(r.status, 400, "needs the AI key");
  await call(admin.POST, "POST", "/api/admin", { action: "job_cv_upload", name: "cv.txt", data: Buffer.from("Stanley Chege Thuita, Kisumu, Kenya. altradits@gmail.com. Software engineer: Go, Node.js, Bitcoin Lightning. github.com/altradits").toString("base64") });
  // "Fill from my CV" proposes details; nothing is saved until Stanley saves.
  apply.setApplyClient({ beta: { messages: { create: async (p) => {
    assert.equal(p.tools[0].name, "submit_applicant_details");
    return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "s", name: "submit_applicant_details", input: {
      fullName: "Stanley Chege Thuita", email: "altradits@gmail.com", phone: "+254 707 172370", city: "Kisumu", country: "Kenya",
      linkedin: "https://www.linkedin.com/in/stanmobitech/", github: "https://github.com/altradits", website: "https://altradits.com",
      workAuthorization: "", noticePeriod: "", salaryExpectation: "", relocate: "", startDate: "" } }] };
  } } } });
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_applicant_suggest" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.applicant.city, "Kisumu");
  assert.equal(r.body.applicant.demographics, "Prefer not to say");
  assert.equal((await call(admin.GET, "GET", "/api/admin?view=jobs")).body.applicant.fullName, undefined, "not saved until confirmed");

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_applicant", ...r.body.applicant, extra: "my password: hunter2" });
  assert.equal(r.status, 400, "no passwords in applicant details");
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_applicant", fullName: "Stanley Chege Thuita", email: "altradits@gmail.com", phone: "+254707172370" });
  assert.equal(r.status, 200);

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_agent_think", id: job.id, messages: [{ role: "user", content: "x" }] });
  assert.equal(r.status, 400, "AI steps only while an application is running");

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_apply", id: job.id });
  assert.equal(r.body.job.status, "apply_queued");
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_agent_start", id: job.id });
  assert.equal(r.body.job.id, job.id);
  assert.deepEqual(r.body.files.slice(0, 2), ["tailored_cv", "cover_letter"]);
  assert.equal(r.body.applicant.fullName, "Stanley Chege Thuita");

  // The AI runs on the server: the extension never holds the API key.
  let sent;
  apply.setApplyClient({ beta: { messages: { create: async (p) => { sent = p; return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "click", input: { id: "f0e1", why: "Apply" } }] }; } } } });
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_agent_think", id: job.id, messages: [{ role: "user", content: "CURRENT PAGE: ..." }] });
  assert.equal(r.body.content[0].name, "click");
  assert.match(sent.system, /Never click the final submit yourself/);
  assert.ok(sent.tools.some((t) => t.name === "ready_to_submit"));

  r = await call(admin.POST, "POST", "/api/admin", { action: "job_agent_file", id: job.id, file: "tailored_cv" });
  assert.equal(r.body.name, "Stanley_Chege_Thuita_CV.pdf");
  const pdf = Buffer.from(r.body.data, "base64").toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"), "a real PDF");

  await call(admin.POST, "POST", "/api/admin", { action: "job_agent_update", id: job.id, note: "Filled contact details" });
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_agent_update", id: job.id, status: "awaiting_submit", note: "Ready to submit" });
  assert.equal(r.body.job.status, "awaiting_submit");
  r = await call(admin.POST, "POST", "/api/admin", { action: "job_agent_update", id: job.id, status: "applied", confirmation: "Thank you! Application received." });
  assert.equal(r.body.job.status, "applied");
  assert.equal(r.body.job.apply.log.length, 2, "two progress notes");
  apply.setApplyClient(null);

  const anon = await admin.POST(new Request("https://altradits.test/api/admin", { method: "POST", body: JSON.stringify({ action: "job_agent_start", id: job.id }) }));
  assert.equal(anon.status, 401);
});
