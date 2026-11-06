// Opcode Circuit progress store. One flat key, like Sats Safari. Every read
// and write sits in try/catch, so private mode or quota never breaks play.
export const STORE_KEY = "opcode-circuit-v1";
export const STORE_VERSION = 1;
export function blankState() {
  return { version: STORE_VERSION, solved: {}, best: {}, stars: {}, achievements: [], seen: {} };
}
function backend() {
  try {
    if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  } catch { /* no storage */ }
  return null;
}
export function loadState(store = backend()) {
  if (!store) return blankState();
  try {
    const raw = store.getItem(STORE_KEY);
    if (!raw) return blankState();
    const s = JSON.parse(raw);
    if (!s || s.version !== STORE_VERSION || typeof s !== "object") return blankState();
    return { ...blankState(), ...s };
  } catch { return blankState(); }
}
export function saveState(state, store = backend()) {
  if (!store) return false;
  try {
    store.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}
export function resetState(store = backend()) {
  if (!store) return false;
  try { store.removeItem(STORE_KEY); return true; }
  catch { return false; }
}
// Record a solve. Keeps the best cost per puzzle. Returns the new state.
export function recordSolve(state, puzzleId, cost, stars) {
  const next = { ...state, solved: { ...state.solved }, best: { ...state.best }, stars: { ...state.stars } };
  next.solved[puzzleId] = true;
  const prev = next.best[puzzleId];
  if (!prev || costIsBetter(cost, prev)) {
    next.best[puzzleId] = cost;
    next.stars[puzzleId] = stars;
  }
  return next;
}
function costIsBetter(a, b) {
  const ka = (a.bytes || 0) + (a.ops || 0) + (a.sats || 0);
  const kb = (b.bytes || 0) + (b.ops || 0) + (b.sats || 0);
  if (ka !== kb) return ka < kb;
  return JSON.stringify(a) < JSON.stringify(b);
}
export function unlockAchievement(state, id) {
  if (state.achievements.includes(id)) return state;
  return { ...state, achievements: [...state.achievements, id] };
}
