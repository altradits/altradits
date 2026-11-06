// Opcode Circuit achievements: fixed list, checked after each solve.
export const ACHIEVEMENTS = [
  { id: "first-solve", title: "First circuit", desc: "Solve any puzzle." },
  { id: "ch-bytes", title: "Byte reader", desc: "Clear chapter 1." },
  { id: "ch-work", title: "Proof of work", desc: "Clear chapter 2." },
  { id: "ch-merkle", title: "Root builder", desc: "Clear chapter 3." },
  { id: "ch-script", title: "Stack master", desc: "Clear chapter 4." },
  { id: "ch-segwit", title: "Soft fork", desc: "Clear chapter 5." },
  { id: "ch-fees", title: "Block packer", desc: "Clear chapter 6." },
  { id: "ch-bugs", title: "Chain doctor", desc: "Clear chapter 7." },
  { id: "ch-lightning", title: "Channel surfer", desc: "Clear chapter 8." },
  { id: "campaign-clear", title: "Full node", desc: "Solve all 43 puzzles." },
  { id: "miner", title: "Miner", desc: "Mine the toy block in 2-2." },
  { id: "patcher", title: "Patcher", desc: "Patch both consensus bugs (7-2 and 7-4)." },
  { id: "perfectionist", title: "Perfectionist", desc: "Earn 3 stars on 10 puzzles." },
];
// Returns ids newly unlocked by this state. Pure: no storage here.
export function checkAchievements(state, allPuzzles) {
  const out = [];
  const solved = (id) => !!state.solved[id];
  const has = (id) => state.achievements.includes(id);
  const chDone = (ch) => allPuzzles.filter((p) => p.ch === ch).every((p) => solved(p.id));
  if (!has("first-solve") && allPuzzles.some((p) => solved(p.id))) out.push("first-solve");
  for (const [ch, id] of [["bytes", "ch-bytes"], ["work", "ch-work"], ["merkle", "ch-merkle"], ["script", "ch-script"], ["segwit", "ch-segwit"], ["fees", "ch-fees"], ["bugs", "ch-bugs"], ["lightning", "ch-lightning"]]) {
    if (!has(id) && chDone(ch)) out.push(id);
  }
  if (!has("campaign-clear") && allPuzzles.every((p) => solved(p.id))) out.push("campaign-clear");
  if (!has("miner") && solved("2-2")) out.push("miner");
  if (!has("patcher") && solved("7-2") && solved("7-4")) out.push("patcher");
  const three = Object.values(state.stars).filter((s) => s === 3).length;
  if (!has("perfectionist") && three >= 10) out.push("perfectionist");
  return out;
}
