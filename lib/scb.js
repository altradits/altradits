// Static channel backup (SCB) freshness. The dashboard can never copy the file
// (channel.backup lives on Stanley's Mac), but it remembers when he last said
// he did, and notices when the channel set changed since: any open or close
// makes the old copy stale, and channels it never saw are unrecoverable.
import { getJSON, setJSON } from "./store.js";

export const BACKUP_KEY = "backup:scb";

// Pure: which channel points appeared or vanished since the marked copy.
export function compareBackupPoints(marked, current) {
  const was = new Set(marked || []), now = new Set(current || []);
  return {
    opened: (current || []).filter((p) => !was.has(p)),
    closed: (marked || []).filter((p) => !now.has(p)),
  };
}

export async function markBackup(points) {
  const record = { at: new Date().toISOString(), points: [...new Set(points || [])] };
  await setJSON(BACKUP_KEY, record);
  return record;
}

export async function backupStatus(currentPoints) {
  const marked = await getJSON(BACKUP_KEY);
  if (!marked) return { markedAt: null, stale: null, opened: [], closed: [], current: (currentPoints || []).length };
  const { opened, closed } = compareBackupPoints(marked.points, currentPoints);
  return { markedAt: marked.at, stale: opened.length > 0 || closed.length > 0, opened, closed, current: (currentPoints || []).length };
}
