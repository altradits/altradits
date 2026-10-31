// Support Stanley's open-source work in sats: an invoice on our own node, any
// amount. Nothing is sold and nothing is asked of the payer.
// POST /api/tip { sats }     -> { bolt11, qr, hash, sats, expiresAt }
// GET  /api/tip?hash=        -> { paid } (only for invoices made here)
// GET  /api/tip              -> { address, qr }: the public Lightning address, for when the node is offline
import { json, readBody, clean, clientIp } from "../lib/http.js";
import { hit, getJSON, setJSON } from "../lib/store.js";
import { createInvoice, invoicePaid, qrSvg, PAYMENTS } from "../lib/lightning.js";

export const TIP = { min: 10, max: 5_000_000 };

export async function POST(request) {
  const body = await readBody(request);
  const sats = Number(body.sats);
  if (!(Number.isInteger(sats) && sats >= TIP.min && sats <= TIP.max)) return json({ error: `Choose a whole number of sats from ${TIP.min} to ${TIP.max.toLocaleString("en-US")}.` }, 400);
  if ((await hit(`rl:tip:${clientIp(request)}`, 3600)) > 20) return json({ error: "Too many invoices. Try again in an hour." }, 429);
  if ((await hit(`rl:tip:all:${new Date().toISOString().slice(0, 13)}`, 3600)) > 200) return json({ error: "Busy right now. Please try again in a few minutes." }, 429);
  let inv;
  try { inv = await createInvoice({ sats, memo: "Support for Stanley's open-source Bitcoin work", nodeOnly: true }); }
  catch { return json({ error: "The node is offline. Use the Lightning address below instead.", offline: true }, 503); }
  await setJSON(`tip:${inv.paymentHash}`, { sats, at: inv.createdAt });
  return json({ bolt11: inv.bolt11, qr: await qrSvg(`lightning:${inv.bolt11}`.toUpperCase()), hash: inv.paymentHash, sats, expiresAt: inv.expiresAt });
}

export async function GET(request) {
  const hash = clean(new URL(request.url).searchParams.get("hash"), 64);
  if (!hash) return json({ address: PAYMENTS.lightningAddress, qr: await qrSvg(`lightning:${PAYMENTS.lightningAddress}`.toUpperCase()) });
  if ((await hit(`rl:tipcheck:${clientIp(request)}`, 600)) > 300) return json({ error: "Too many checks." }, 429);
  if (!/^[0-9a-f]{64}$/.test(hash) || !(await getJSON(`tip:${hash}`))) return json({ error: "Unknown invoice." }, 404);
  return json({ paid: (await invoicePaid({ provider: "lnd", paymentHash: hash })) === true });
}
