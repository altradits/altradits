// Opcode Circuit scoring: fewer bytes, fewer ops, fewer sats. Each puzzle
// names which dims count (scored) and a par triple. Stars come from the worst
// scored dim: at par or better is 3, within 1.5x is 2, a solve is 1.
export function dimStars(cost, par) {
  if (par <= 0) return 3;
  const ratio = cost / par;
  if (ratio <= 1) return 3;
  if (ratio <= 1.5) return 2;
  return 1;
}
export function starsFor(cost, par, scored = ["bytes", "ops", "sats"]) {
  let worst = 3;
  for (const dim of scored) worst = Math.min(worst, dimStars(cost[dim] || 0, par[dim] || 0));
  return worst;
}
// Compare two solves of one puzzle. Higher stars first, then lower total
// ratio, then a stable tiebreak. Returns negative when a ranks better.
export function compareCost(a, b, par, scored = ["bytes", "ops", "sats"]) {
  const sa = starsFor(a, par, scored), sb = starsFor(b, par, scored);
  if (sa !== sb) return sb - sa;
  const ra = totalRatio(a, par, scored), rb = totalRatio(b, par, scored);
  if (ra !== rb) return ra - rb;
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : 1;
}
function totalRatio(cost, par, scored) {
  let sum = 0, n = 0;
  for (const dim of scored) {
    if ((par[dim] || 0) > 0) { sum += (cost[dim] || 0) / par[dim]; n++; }
  }
  return n ? sum / n : 0;
}
export function formatCost(cost) {
  return `${cost.bytes || 0} bytes, ${cost.ops || 0} ops, ${cost.sats || 0} sats`;
}
