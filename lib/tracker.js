// Open-source tracker: Stanley's progress on projects he doesn't own, read from
// GitHub's public search (four searches cover every project). Cached for 3
// hours so the public page never hammers GitHub; the last good result is kept
// if GitHub can't be reached. GITHUB_TOKEN (optional, read-only) raises
// GitHub's rate limit.
import { getJSON, setJSON } from "./store.js";
import { GITHUB_USER, TRACK, DONE, STEPS } from "../data/tracker.js";

const CACHE = "tracker:cache", TTL = 3 * 3600e3;
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
async function search(q) {
  const scope = ALL.map((r) => `repo:${r}`).join(" ");
  const r = await get(`/search/issues?per_page=100&sort=created&q=${encodeURIComponent(`${q} ${scope}`)}`);
  return (r.items || []).map((i) => ({ repo: repoOf(i), title: i.title, url: i.html_url, at: i.created_at, merged: Boolean(i.pull_request?.merged_at), mergedAt: i.pull_request?.merged_at || null, open: i.state === "open" }));
}

export async function computeTracker(now = Date.now()) {
  const u = GITHUB_USER;
  const [prs, issues, reviewed, commented, events] = await Promise.all([
    search(`author:${u} type:pr`), search(`author:${u} type:issue`), search(`reviewed-by:${u} type:pr -author:${u}`), search(`commenter:${u} type:pr -author:${u}`),
    get(`/users/${u}/events/public?per_page=100`).catch(() => []),
  ]);
  const per = (repo) => {
    const p = prs.filter((x) => x.repo === repo), m = p.filter((x) => x.merged);
    const rv = [...reviewed, ...commented].filter((x) => x.repo === repo).filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
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
  return { user: u, updatedAt: new Date(now).toISOString(), projects, done, activeDays30: days.size, streak, next,
    totals: { steps: projects.reduce((t, p) => t + p.done, 0), of: projects.length * STEPS.length, merged: [...projects, ...done].reduce((t, p) => t + p.steps.find((s) => s.key === "merged").count, 0) } };
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
