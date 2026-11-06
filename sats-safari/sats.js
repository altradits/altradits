// Sats Safari: sats maths. One bitcoin is 100,000,000 sats (bitcoin.org
// vocabulary: "satoshi"). Amounts are whole sats in integers: a satoshi is
// the smallest unit, so nothing ever splits one. Pure JS: the game and the
// tests share this file.
export const SATS_PER_BTC = 100_000_000;
export const MAX_MONEY_SATS = 21_000_000 * SATS_PER_BTC;

export const isValidAmount = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_MONEY_SATS;

function check(n, what = "amount") {
  if (!isValidAmount(n)) throw new Error(`${what} is not a valid sats amount`);
  return n;
}

// 1 -> "0.00000001", 100_000_000 -> "1". Exact: string maths, no floats.
export function toBTC(sats) {
  check(sats);
  const whole = Math.floor(sats / SATS_PER_BTC);
  const frac = String(sats % SATS_PER_BTC).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

// "0.00000001" -> 1. Rejects more than 8 decimals and anything over 21M BTC.
export function toSats(text) {
  const m = String(text).trim().match(/^(\d+)(?:\.(\d{1,8}))?$/);
  if (!m) throw new Error("write the amount like 0.00000001");
  const sats = Number(m[1]) * SATS_PER_BTC + Number((m[2] || "").padEnd(8, "0"));
  return check(sats);
}

// 1234567 -> "1,234,567".
export function formatSats(n) {
  check(n);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Split into n parts that differ by at most 1 sat, adding up exactly.
export function divide(amount, n) {
  check(amount);
  if (!Number.isInteger(n) || n < 1) throw new Error("split into at least 1 part");
  const base = Math.floor(amount / n);
  const parts = Array(n).fill(base);
  for (let i = 0; i < amount % n; i++) parts[i]++;
  return parts;
}

// Combine parts back into one amount (whitepaper section 9: combining value).
export function combine(parts) {
  if (!Array.isArray(parts) || !parts.length) throw new Error("nothing to combine");
  return check(parts.reduce((a, b) => a + check(b, "part"), 0));
}
