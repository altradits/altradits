// Receipt numbers are minted year-tagged (ALT-2026-0001) since Nov 2026.
// Earlier receipts were stored plain (ALT-0001); they display year-tagged
// from their payment date, and both forms unlock the download. Stored values
// are never rewritten: already-sent emails keep working as they are.
const OLD_RE = /^ALT-(\d{4})$/;

// The number the dashboard, the statement and the download page show.
export function displayReceipt(receipt, paidAt) {
  const m = OLD_RE.exec(String(receipt ?? ""));
  const year = String(paidAt || "").slice(0, 4);
  if (m && /^\d{4}$/.test(year)) return `ALT-${year}-${m[1]}`;
  return receipt ?? null;
}

// A download link unlocks its record by the stored number or the displayed one.
export function receiptMatches(m, no) {
  return m?.receipt === no || displayReceipt(m?.receipt, m?.paidAt || m?.at) === no;
}
