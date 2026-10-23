// Stanley's job hunt: careers-page parsing, SSRF guard, Career Agent packs,
// application tracking. Fake web + fake Claude. Run: npm test
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
