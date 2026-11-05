// Open-source tracker: Stanley's progress on projects he doesn't own, read from
// GitHub's public search (four searches cover every project), plus the Builder
// Path: one verified deliverable a day, proven only by his public GitHub
// activity. One cached computation feeds the page, the API and Stan's report:
// refreshed each morning before the report and at most every 30 minutes on
// demand (concurrent views share one refresh). The last good result is kept
// if GitHub can't be reached. GITHUB_TOKEN (optional, read-only, no scopes)
// raises GitHub's rate limit and is advised: without it the margin is thin.
import { getJSON, setJSON } from "./store.js";
import { createHash } from "node:crypto";
import { GITHUB_USER, TRACK, DONE, STEPS, MILESTONES, FULL_TIME, FOCUS } from "../data/tracker.js";
import { START, END, LEARNING_REPO, LOG_DIR, BTRUST_BAR, dayAt, buildDays, phaseAt } from "../data/builder-path.js";

const CACHE = "tracker:cache", TTL = 30 * 60e3;
// Bumped whenever the result's shape changes, so a copy saved by older code is
// refreshed at once instead of lasting out its TTL (2: the blockchain; 3:
// milestones named by blocks won; 4: the focus project; 5: the Builder Path,
// merged counted everywhere, active days from authored dates too; 6: the
// Btrust bar counts the focus project only).
const VERSION = 6;
const ALL = [...TRACK, ...DONE].map((t) => t.repo);
const ACTIVE = new Set(["PullRequestEvent", "PullRequestReviewEvent", "PullRequestReviewCommentEvent", "IssuesEvent", "IssueCommentEvent", "PushEvent"]);

let get = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, { signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/vnd.github+json", "User-Agent": "altradits-tracker", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
};
export const setGitHubFetcher = (f) => { get = f; }; // tests

const repoOf = (item) => String(item.repository_url || "").split("/").slice(-2).join("/");
// Everything outside Stanley's own repositories, newest first, up to 3 pages of 100.
async function search(q) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const r = await get(`/search/issues?per_page=100&page=${page}&sort=created&q=${encodeURIComponent(q)}`);
    const items = r.items || [];
    // Links leave the page as <a href>: only GitHub's own addresses, so a
    // compromised or unexpected API reply can't plant a javascript: link.
    out.push(...items.filter((i) => typeof i.html_url === "string" && /^https:\/\/github\.com\//.test(i.html_url))
      .map((i) => ({ repo: repoOf(i), number: i.number, title: i.title, url: i.html_url, at: i.created_at, pr: Boolean(i.pull_request),
      merged: Boolean(i.pull_request?.merged_at), mergedAt: i.pull_request?.merged_at || null, open: i.state === "open" })));
    if (items.length < 100) break;
  }
  return out;
}

// His recent public activity, up to 300 events: his own repository floods the
// first page, so one page is not enough to see tracked work.
async function eventsAll(u) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const r = await get(`/users/${u}/events/public?per_page=100&page=${page}`).catch(() => []);
    if (!Array.isArray(r) || !r.length) break;
    out.push(...r);
    if (r.length < 100) break;
  }
  return out;
}

// A timestamp's calendar day in Nairobi, where Stanley lives and commits.
const NAIROBI = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" });
export const nairobiDay = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return NAIROBI.format(d);
};
const LOG_FILE = new RegExp(`^${LOG_DIR}/(\\d{4}-\\d{2}-\\d{2})\\.md$`);

// The learning repo: which dated log files exist, and which Nairobi days he
// committed on. Both must hold for a log day: the file alone, or commits
// alone, prove nothing. Missing or private: no log day can pass, and nothing
// about the repo leaks beyond that state.
async function learningEvidence(u) {
  const meta = await get(`/repos/${LEARNING_REPO}`).catch(() => null);
  if (!meta) return { repoState: "missing", logFiles: new Set(), logCommits: new Set() };
  if (!(meta.private === false && meta.visibility !== "private")) return { repoState: "private", logFiles: new Set(), logCommits: new Set() };
  const logFiles = new Set(), logCommits = new Set();
  const tree = await get(`/repos/${LEARNING_REPO}/git/trees/HEAD?recursive=1`).catch(() => null);
  if (tree && !tree.truncated && Array.isArray(tree.tree)) {
    for (const e of tree.tree) {
      const m = LOG_FILE.exec(e.path || "");
      if (m && e.type === "blob") logFiles.add(m[1]);
    }
  }
  for (let page = 1; page <= 3; page++) {
    const cs = await get(`/repos/${LEARNING_REPO}/commits?author=${u}&per_page=100&page=${page}&since=${START}T00:00:00Z`).catch(() => []);
    if (!Array.isArray(cs) || !cs.length) break;
    for (const c of cs) {
      if ((c.author?.login || "").toLowerCase() !== u.toLowerCase()) continue; // linked to his account
      const d = nairobiDay(c.commit?.author?.date);
      if (d) logCommits.add(d);
    }
    if (cs.length < 100) break;
  }
  return { repoState: "ready", logFiles, logCommits };
}

// Exact review dates, from each pull request's own reviews and comments. The
// search index dates the pull request, not the review, so it can't place a
// review on a day. Only his reviews and comments on someone else's pull
// request in a tracked repository count. Comments on issues don't: the review
// check asks for pull request review, the scarce skill.
async function reviewEvidence(u, reviewed, commented) {
  const tracked = new Set(ALL.map((r) => r.toLowerCase()));
  const need = new Map();
  for (const x of [...reviewed, ...commented]) {
    if (!x.pr || !tracked.has(x.repo.toLowerCase())) continue;
    need.set(`${x.repo}#${x.number}`, x);
  }
  const byDay = new Map(), atUtc = [];
  const push = (iso, x, url) => {
    const d = nairobiDay(iso);
    if (!d) return;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push({ title: x.title, url });
    atUtc.push(iso);
  };
  for (const x of need.values()) {
    const revs = await get(`/repos/${x.repo}/pulls/${x.number}/reviews?per_page=100`).catch(() => []);
    for (const r of (Array.isArray(revs) ? revs : [])) {
      if ((r.user?.login || "").toLowerCase() !== u.toLowerCase()) continue;
      push(r.submitted_at, x, typeof r.html_url === "string" && /^https:\/\/github\.com\//.test(r.html_url) ? r.html_url : x.url);
    }
    const cs = await get(`/repos/${x.repo}/issues/${x.number}/comments?per_page=100`).catch(() => []);
    for (const c of (Array.isArray(cs) ? cs : [])) {
      if ((c.user?.login || "").toLowerCase() !== u.toLowerCase()) continue;
      push(c.created_at, x, typeof c.html_url === "string" && /^https:\/\/github\.com\//.test(c.html_url) ? c.html_url : x.url);
    }
  }
  return { byDay, atUtc };
}

const RANK = { log: 0, review: 1, issue: 2, pr: 3, merged: 4 };

// The Builder Path verdicts. Evidence counts for the Nairobi date it happened
// on, never the date it was due: late work never reopens a missed day. Real
// upstream work is never punished: any upstream evidence satisfies a log day,
// and stronger upstream evidence satisfies a weaker day. Rest days keep the
// streak alive without extending it. Today, while still open, never ends it.
function buildBuilder({ prs, issues, reviewDays, logFiles, logCommits, repoState, focusMerged, focusName, now }) {
  const today = nairobiDay(now);
  const tracked = new Set(ALL.map((r) => r.toLowerCase()));
  const ev = new Map(); // date -> { type: [proofs] }
  const add = (date, type, proof) => {
    if (!date) return;
    if (!ev.has(date)) ev.set(date, {});
    (ev.get(date)[type] ||= []).push(proof);
  };
  for (const x of prs) {
    if (!tracked.has(x.repo.toLowerCase())) continue;
    add(nairobiDay(x.at), "pr", { title: x.title, url: x.url });
    if (x.merged) add(nairobiDay(x.mergedAt), "merged", { title: x.title, url: x.url });
  }
  for (const x of issues) {
    if (!tracked.has(x.repo.toLowerCase())) continue;
    add(nairobiDay(x.at), "issue", { title: x.title, url: x.url });
  }
  for (const [date, proofs] of reviewDays) for (const p of proofs) add(date, "review", p);
  for (const f of logFiles) {
    if (logCommits.has(f)) add(f, "log", { title: `${LOG_DIR}/${f}.md`, url: `https://github.com/${LEARNING_REPO}/blob/HEAD/${LOG_DIR}/${f}.md` });
  }
  const prove = (date, type) => {
    const day = ev.get(date);
    if (!day) return null;
    const hit = Object.keys(RANK).filter((t) => RANK[t] >= RANK[type] && day[t]?.length).sort((a, b) => RANK[b] - RANK[a])[0];
    return hit ? { type: hit, proof: day[hit][0] } : null;
  };
  const started = today >= START, ended = today > END;
  const last = !started ? null : today > END ? END : today;
  const calendar = [];
  const all = buildDays();
  if (last) {
    for (const d of all) {
      if (d.date > last) break;
      if (d.type === "rest") { calendar.push({ date: d.date, type: d.type, status: "rest", proof: null }); continue; }
      const hit = prove(d.date, d.type);
      calendar.push({ date: d.date, type: d.type, status: hit ? "done" : d.date === today ? "open" : "missed", proof: hit?.proof || null, provedAs: hit?.type || null });
    }
  }
  const verdict = new Map(calendar.map((c) => [c.date, c.status]));
  let streak = 0;
  if (last) {
    for (let d = last; d >= START; d = new Date(Date.parse(`${d}T12:00:00Z`) - 864e5).toISOString().slice(0, 10)) {
      const v = verdict.get(d);
      if (v === "done") { streak++; continue; }
      if (v === "rest" || d === today) continue; // rest keeps the streak; today never ends it
      break;
    }
  }
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10);
  const weekLinks = [];
  let weekCount = 0, allReviews = 0;
  for (const [date, proofs] of reviewDays) {
    allReviews += proofs.length;
    if (date >= weekAgo && date <= today) { weekCount += proofs.length; weekLinks.push(...proofs.map((p) => ({ date, ...p }))); }
  }
  weekLinks.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const phase = today >= START && today <= END ? phaseAt(today) : null;
  const deliverable = today >= START && today <= END ? dayAt(today) : null;
  const yDate = new Date(Date.parse(`${today}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const yDay = yDate >= START ? dayAt(yDate) : null;
  return { repo: LEARNING_REPO, repoState, start: START, end: END, today, dayNo: calendar.length, of: all.length, phase, deliverable, first: dayAt(START),
    yesterday: yDay ? { date: yDate, title: yDay.title, verdict: verdict.get(yDate) || "missed", proof: calendar.find((c) => c.date === yDate)?.proof || null } : null,
    streak, reviews: { week: weekCount, all: allReviews, links: weekLinks.slice(0, 5) },
    bar: { merged: focusMerged, need: BTRUST_BAR.merged, listing: BTRUST_BAR.listing, project: FOCUS, short: focusName },
    counts: { done: calendar.filter((c) => c.status === "done").length, missed: calendar.filter((c) => c.status === "missed").length, rest: calendar.filter((c) => c.status === "rest").length },
    calendar, started, ended };
}

export async function computeTracker(now = Date.now()) {
  const u = GITHUB_USER;
  const mine = `-user:${u}`; // never his own repositories
  const [prs0, issues0, reviewed0, commented0, events] = await Promise.all([
    search(`author:${u} type:pr ${mine}`), search(`author:${u} type:issue ${mine}`), search(`reviewed-by:${u} type:pr -author:${u} ${mine}`), search(`commenter:${u} -author:${u} ${mine}`),
    eventsAll(u),
  ]);
  // Public repositories only, whatever GITHUB_TOKEN can see: the page is public,
  // and every block must open for anyone who clicks it.
  const repos = [...new Set([...prs0, ...issues0, ...reviewed0, ...commented0].map((x) => x.repo))];
  const isPublic = new Map(await Promise.all(repos.map(async (r) => [r, await get(`/repos/${r}`).then((x) => x.private === false && x.visibility !== "private", () => false)])));
  const pub = (list) => list.filter((x) => isPublic.get(x.repo));
  const [prs, issues, reviewed, commented] = [pub(prs0), pub(issues0), pub(reviewed0), pub(commented0)];
  const [{ repoState, logFiles, logCommits }, { byDay: reviewDays, atUtc: reviewAt }] = await Promise.all([
    learningEvidence(u), reviewEvidence(u, reviewed, commented),
  ]);
  const per = (repo) => {
    const p = prs.filter((x) => x.repo === repo), m = p.filter((x) => x.merged);
    const rv = [...reviewed, ...commented.filter((x) => x.pr)].filter((x) => x.repo === repo).filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
    const is = issues.filter((x) => x.repo === repo);
    const counts = { review: rv.length, issue: is.length, pr: p.length, merged: m.length };
    const latest = { review: rv[0], issue: is[0], pr: p[0], merged: m[0] };
    const steps = STEPS.map((s) => ({ key: s.key, done: counts[s.key] > 0, count: counts[s.key], link: latest[s.key] ? { title: latest[s.key].title, url: latest[s.key].url } : null }));
    return { steps, done: steps.filter((s) => s.done).length };
  };
  // Days with activity on the tracked projects (not Stanley's own repositories), last 30 days:
  // public events plus the authored dates the search already returned (his own
  // repository floods the events list, so events alone can hide tracked work).
  // Merges don't count: the maintainer's click is not his activity.
  const tracked = new Set(ALL.map((r) => r.toLowerCase()));
  const days = new Set();
  for (const e of (Array.isArray(events) ? events : [])) {
    if (ACTIVE.has(e.type) && tracked.has(String(e.repo?.name).toLowerCase()) && now - Date.parse(e.created_at) < 30 * 864e5) days.add(e.created_at.slice(0, 10));
  }
  for (const x of [...prs, ...issues]) {
    if (tracked.has(x.repo.toLowerCase()) && x.at && now - Date.parse(x.at) < 30 * 864e5) days.add(x.at.slice(0, 10));
  }
  for (const iso of reviewAt) {
    if (now - Date.parse(iso) < 30 * 864e5) days.add(String(iso).slice(0, 10));
  }
  let streak = 0;
  for (let d = 0; d < 30; d++) { const day = new Date(now - d * 864e5).toISOString().slice(0, 10); if (days.has(day)) streak++; else if (d > 0) break; }
  const projects = TRACK.map((t) => ({ ...t, ...per(t.repo) }));
  const done = DONE.map((t) => ({ ...t, ...per(t.repo) }));
  // Today's task: the focus project until its four steps are done; then the
  // projects with the fewest steps done, one per day in turn.
  const open = projects.filter((p) => p.done < STEPS.length);
  const focus = open.find((p) => p.repo === FOCUS);
  const least = Math.min(...open.map((p) => p.done));
  const pool = open.filter((p) => p.done === least);
  const pick = focus || (pool.length ? pool[Math.floor(now / 864e5) % pool.length] : null);
  const next = pick ? { repo: pick.repo, name: pick.name, focus: pick.repo === FOCUS, step: STEPS[pick.steps.findIndex((s) => !s.done)], challenge: pick.challenge, guide: pick.guide, start: pick.start } : null;
  const chain = buildChain({ prs, issues, reviewed, commented, now });
  const mergedProjects = projects.reduce((t, p) => t + p.steps.find((s) => s.key === "merged").count, 0);
  const mergedPast = done.reduce((t, p) => t + p.steps.find((s) => s.key === "merged").count, 0);
  // The Btrust bar counts one project only: the focus. Past work and practice
  // repositories never move it. The all-repo total stays on the page below
  // with its own label.
  const focusMerged = prs.filter((x) => x.merged && x.repo.toLowerCase() === FOCUS.toLowerCase()).length;
  const focusName = TRACK.find((t) => t.repo === FOCUS)?.name || FOCUS;
  return { v: VERSION, user: u, updatedAt: new Date(now).toISOString(), focus: FOCUS, projects, done, activeDays30: days.size, streak, next, chain,
    builder: buildBuilder({ prs, issues, reviewDays, logFiles, logCommits, repoState, focusMerged, focusName, now }),
    totals: { steps: projects.reduce((t, p) => t + p.done, 0), of: projects.length * STEPS.length,
      merged: chain.confirmed, mergedProjects, mergedPast } };
}

// The blockchain game: every contribution outside his own repositories mines a
// block, oldest first (height 0 is the genesis block). A merged pull request
// won the mempool (confirmed); an open one is still in the mempool; one closed
// without merging was orphaned. Issues, reviews and comments are mined blocks.
// Each block's "hash" is the SHA-256 of its GitHub address, for fun and so it
// never changes. The chain ends on the 21M day: hired as a full-time
// open-source contributor (data/tracker.js FULL_TIME, set by hand when it happens).
const hashOf = (url) => createHash("sha256").update(url).digest("hex");
export function buildChain({ prs, issues, reviewed, commented, now = Date.now() }) {
  const seen = new Set(), blocks = [];
  const add = (x, kind) => { if (seen.has(x.url)) return; seen.add(x.url);
    const status = kind !== "pr" ? "mined" : x.merged ? "confirmed" : x.open ? "mempool" : "orphaned";
    blocks.push({ kind, status, repo: x.repo, number: x.number, title: x.title, url: x.url, at: x.at, mergedAt: x.mergedAt, hash: hashOf(x.url) }); };
  prs.forEach((x) => add(x, "pr"));
  issues.forEach((x) => add(x, "issue"));
  [...reviewed, ...commented].forEach((x) => add(x, x.pr ? "review" : "comment"));
  blocks.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.url.localeCompare(b.url));
  blocks.forEach((b, i) => { b.height = i; });
  const confirmed = blocks.filter((b) => b.status === "confirmed");
  const byMerge = [...confirmed].sort((a, b) => String(a.mergedAt).localeCompare(String(b.mergedAt)));
  const milestones = MILESTONES.map((m) => { const b = m.merged === 0 ? blocks[0] : byMerge[m.merged - 1]; return { ...m, reached: Boolean(b), block: b ? { height: b.height, url: b.url, title: b.title, at: m.merged === 0 ? b.at : b.mergedAt } : null }; });
  return { height: blocks.length ? blocks.length - 1 : -1, blocks: blocks.length, confirmed: confirmed.length, mempool: blocks.filter((b) => b.status === "mempool").length,
    orphaned: blocks.filter((b) => b.status === "orphaned").length, repos: new Set(blocks.map((b) => b.repo)).size,
    genesisAt: blocks[0]?.at || null, days: blocks[0] ? Math.max(1, Math.ceil((now - Date.parse(blocks[0].at)) / 864e5)) : 0,
    milestones, fullTime: FULL_TIME, list: blocks.slice().reverse() };
}

// The last result only, never a GitHub call (Stan's report).
export const trackerCached = () => getJSON(CACHE).then((c) => (c?.v === VERSION ? c : null));

// Cached for the public page and Stan's report. Concurrent views share one refresh.
let pending = null;
export async function tracker(now = Date.now()) {
  const cached = await getJSON(CACHE);
  if (cached?.v === VERSION && now - Date.parse(cached.updatedAt) < TTL) return cached;
  if (!pending) pending = computeTracker(now).then(async (fresh) => { await setJSON(CACHE, fresh); return fresh; }).finally(() => { pending = null; });
  try { return await pending; }
  catch (err) { const c = await getJSON(CACHE); if (c?.v === VERSION) return { ...c, stale: true }; throw err; }
}
