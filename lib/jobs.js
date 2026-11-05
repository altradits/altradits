// Periodic jobs: claimed exactly once per period, even when several /healthz
// pings or timers arrive together. Each claim holds a short lock while it
// checks and stamps the marker, so two processes can't both see "due" and run.
import { getJSON, setJSON, acquireLock } from "./store.js";

// One daily run per UTC date. The 06:00 UTC start stays with the caller.
export async function claimDaily(today = new Date().toISOString().slice(0, 10)) {
  const release = await acquireLock("jobs:claim:daily", 30);
  if (!release) return false;
  try {
    if ((await getJSON("daily:last")) === today) return false;
    await setJSON("daily:last", today);
    return true;
  } finally { await release(); }
}

// One hourly run per rolling hour.
export async function claimHourly(now = Date.now()) {
  const release = await acquireLock("jobs:claim:hourly", 30);
  if (!release) return false;
  try {
    const last = await getJSON("hourly:last");
    if (last && now - Date.parse(last) < 3600e3) return false;
    await setJSON("hourly:last", new Date(now).toISOString());
    return true;
  } finally { await release(); }
}
