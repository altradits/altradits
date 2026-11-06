// Sats Safari: saved progress. Everything stays in this browser's localStorage.
// Every read and write is guarded: private mode, full disks and strange
// stored text all fall back to a fresh game instead of breaking it.
const KEY = "sats-safari-v1";

export const fresh = () => ({ v: 1, stars: {}, badges: [], lang: "en", sound: false });

function store() {
  try {
    const s = globalThis.localStorage;
    if (!s || typeof s.getItem !== "function") return null;
    return s;
  } catch { return null; }
}

function clean(raw) {
  const p = fresh();
  if (!raw || typeof raw !== "object") return p;
  if (raw.lang === "sw" || raw.lang === "en") p.lang = raw.lang;
  p.sound = raw.sound === true;
  if (raw.stars && typeof raw.stars === "object") {
    for (const [k, v] of Object.entries(raw.stars)) {
      const n = Number(v);
      if (/^[1-7]$/.test(k) && Number.isInteger(n) && n >= 0 && n <= 3) p.stars[k] = n;
    }
  }
  if (Array.isArray(raw.badges)) p.badges = [...new Set(raw.badges.filter((b) => typeof b === "string"))].slice(0, 14);
  return p;
}

export function loadProgress() {
  const s = store();
  if (!s) return fresh();
  try {
    const raw = s.getItem(KEY);
    if (!raw) return fresh();
    return clean(JSON.parse(raw));
  } catch { return fresh(); }
}

export function saveProgress(p) {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(KEY, JSON.stringify(clean(p)));
    return true;
  } catch { return false; }
}

// Stop n opens when stop n-1 earned at least one star. Stop 1 is always open.
export const isUnlocked = (p, n) => n === 1 || (p.stars[String(n - 1)] || 0) > 0;

export function awardStars(p, n, stars) {
  const k = String(n);
  p.stars[k] = Math.max(p.stars[k] || 0, Math.min(3, Math.max(0, Math.round(stars))));
  saveProgress(p);
  return p.stars[k];
}

export function awardBadge(p, id) {
  if (!p.badges.includes(id)) {
    p.badges.push(id);
    saveProgress(p);
    return true;
  }
  return false;
}

export const totalStars = (p) => Object.values(p.stars).reduce((a, b) => a + b, 0);
