// Open-source tracker: Stanley's progress on projects he doesn't own, read from
// GitHub's public search (four searches cover every project). Cached for 24
// hours (refreshed each morning before Stan's report); the last good result is kept
// if GitHub can't be reached. GITHUB_TOKEN (optional, read-only) raises
// GitHub's rate limit.
import { getJSON, setJSON } from "./store.js";
import { createHash } from "node:crypto";
import { GITHUB_USER, TRACK, DONE, STEPS, MILESTONES, FULL_TIME } from "../data/tracker.js";

const CACHE = "tracker:cache", TTL = 24 * 3600e3;
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
    out.push(...items.map((i) => ({ repo: repoOf(i), number: i.number, title: i.title, url: i.html_url, at: i.created_at, pr: Boolean(i.pull_request),
      merged: Boolean(i.pull_request?.merged_at), mergedAt: i.pull_request?.merged_at || null, open: i.state === "open" })));
    if (items.length < 100) break;
  }
  return out;
}

export async function computeTracker(now = Date.now()) {
  const u = GITHUB_USER;
  const mine = `-user:${u}`; // never his own repositories
  let [prs, issues, reviewed, commented, events] = await Promise.all([
    search(`author:${u} type:pr ${mine}`), search(`author:${u} type:issue ${mine}`), search(`reviewed-by:${u} type:pr -author:${u} ${mine}`), search(`commenter:${u} -author:${u} ${mine}`),
    get(`/users/${u}/events/public?per_page=100`).catch(() => []),
  ]);
  // Public repositories only, whatever GITHUB_TOKEN can see: the page is public,
  // and every block must open for anyone who clicks it.
  const repos = [...new Set([...prs, ...issues, ...reviewed, ...commented].map((x) => x.repo))];
  const isPublic = new Map(await Promise.all(repos.map(async (r) => [r, await get(`/repos/${r}`).then((x) => x.private === false && x.visibility !== "private", () => false)])));
  const pub = (list) => list.filter((x) => isPublic.get(x.repo));
  [prs, issues, reviewed, commented] = [pub(prs), pub(issues), pub(reviewed), pub(commented)];
  const per = (repo) => {
    const p = prs.filter((x) => x.repo === repo), m = p.filter((x) => x.merged);
    const rv = [...reviewed, ...commented.filter((x) => x.pr)].filter((x) => x.repo === repo).filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
    const is = issues.filter((x) => x.repo === repo);
    const counts = { review: rv.length, issue: is.length, pr: p.length, merged: m.length };
    const latest = { review: rv[0], issue: is[0], pr: p[0], merged: m[0] };
    const steps = STEPS.map((s) => ({ key: s.key, done: counts[s.key] > 0, count: counts[s.key], link: latest[s.key] ? { title: latest[s.key].title, url: latest[s.key].url } : null }));
    return { steps, done: steps.filter((s) => s.done).length };
  };
  // Days with activity on the tracked projects (not Stanley's own repositories), last 30 days.
  const tracked = new Set(ALL.map((r) => r.toLowerCase()));
  const days = new Set((Array.isArray(events) ? events : []).filter((e) => ACTIVE.has(e.type) && tracked.has(String(e.repo?.name).toLowerCase()) && now - Date.parse(e.created_at) < 30 * 864e5).map((e) => e.created_at.slice(0, 10)));
  let streak = 0;
  for (let d = 0; d < 30; d++) { const day = new Date(now - d * 864e5).toISOString().slice(0, 10); if (days.has(day)) streak++; else if (d > 0) break; }
  const projects = TRACK.map((t) => ({ ...t, ...per(t.repo) }));
  const done = DONE.map((t) => ({ ...t, ...per(t.repo) }));
  // Today's task: projects with the fewest steps done, one per day in turn.
  const open = projects.filter((p) => p.done < STEPS.length);
  const least = Math.min(...open.map((p) => p.done));
  const pool = open.filter((p) => p.done === least);
  const pick = pool.length ? pool[Math.floor(now / 864e5) % pool.length] : null;
  const next = pick ? { repo: pick.repo, name: pick.name, step: STEPS[pick.done], challenge: pick.challenge, guide: pick.guide, start: pick.start } : null;
  return { user: u, updatedAt: new Date(now).toISOString(), projects, done, activeDays30: days.size, streak, next, chain: buildChain({ prs, issues, reviewed, commented, now }),
    totals: { steps: projects.reduce((t, p) => t + p.done, 0), of: projects.length * STEPS.length, merged: [...projects, ...done].reduce((t, p) => t + p.steps.find((s) => s.key === "merged").count, 0) } };
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
export const trackerCached = () => getJSON(CACHE);

// Cached for the public page and Stan's report.
export async function tracker(now = Date.now()) {
  const cached = await getJSON(CACHE);
  if (cached && now - Date.parse(cached.updatedAt) < TTL) return cached;
  try { const fresh = await computeTracker(now); await setJSON(CACHE, fresh); return fresh; }
  catch (err) { if (cached) return { ...cached, stale: true }; throw err; }
}
