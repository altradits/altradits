// Profit and loss (admin), in sats, over a period. What the node earns and
// spends, and what is yours once Ye₿ente's wallet holders are counted.
// - Earned: routing fees for others' payments, the spread on M-Pesa buys
//   (YEBENTE_BUY_SPREAD_PCT, 0 by default), and support payments on /donate.
// - Spent: routing fees on the node's own payments that nobody repaid (Ye₿ente
//   users pay their own routing fee: the 1% reserve is refunded down to the
//   real fee), and on-chain fees (opening or closing channels).
// - Yours now: sats on your side of the channels plus on-chain, minus what
//   Ye₿ente wallets hold. Top-ups aren't profit: they move your own sats in.
import { getMany, listIds, keysWithPrefix, getJSON } from "./store.js";

export async function profitLoss({ days = 30, now = Date.now() } = {}) {
  const since = now - days * 864e5;
  const { nodeMoney } = await import("./lightning.js");
  const node = await nodeMoney({ days, now }).catch(() => null);
  // Ye₿ente in the period: fees users paid on sends (passed on to the routes), and M-Pesa buys.
  const wallets = await getMany("yw", await listIds("ywallets", 100000));
  let userFees = 0, buys = 0, buySats = 0, buyKes = 0;
  for (const w of wallets) {
    for (const e of await getMany("ywe", await listIds(`ywtx:${w.id}`, 5000))) {
      if (e.status !== "completed" || Date.parse(e.at) < since) continue;
      if (e.kind === "send") userFees += Number(e.fee) || 0;
      if (e.kind === "buy") { buys++; buySats += Number(e.sats) || 0; buyKes += Number(e.kes) || 0; }
    }
  }
  const spreadPct = Math.min(20, Math.max(0, Number(process.env.YEBENTE_BUY_SPREAD_PCT ?? 0)));
  const spreadSats = spreadPct ? Math.round((buySats * spreadPct) / (100 - spreadPct)) : 0;
  const tips = (await Promise.all((await keysWithPrefix("tip:")).map((k) => getJSON(k)))).filter((t) => t?.paidAt && Date.parse(t.paidAt) >= since);
  const support = tips.reduce((t, x) => t + (Number(x.sats) || 0), 0);
  const owed = wallets.reduce((t, w) => t + (Number(w.balance) || 0), 0);

  const routedFees = node?.routed?.feeSats ?? 0, paidFees = node?.paid?.feeSats ?? 0, chainFees = node?.onchainFees ?? 0;
  const ownRouteFees = Math.max(0, paidFees - userFees);
  const earned = routedFees + spreadSats + support, spent = ownRouteFees + chainFees;
  const assets = node && node.localSats !== null && node.onchainSats !== null ? node.localSats + node.onchainSats : null;
  return {
    days, nodeRead: Boolean(node),
    earned: { total: earned, routing: routedFees, routed: node?.routed?.count ?? 0, spread: spreadSats, spreadPct, buys, buyKes, support, supportCount: tips.length },
    spent: { total: spent, routeFees: ownRouteFees, routeFeesAll: paidFees, routeFeesRepaid: Math.min(userFees, paidFees), onchain: chainFees },
    net: earned - spent,
    yours: { assets, channelSats: node?.localSats ?? null, onchainSats: node?.onchainSats ?? null, owed, net: assets === null ? null : assets - owed },
  };
}
