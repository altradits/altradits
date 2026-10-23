// Scan-to-pay over Lightning.
// POST /api/pay { id, t }          -> invoice + QR for the proposal's amount due
// GET  /api/pay?id=&t=             -> has it been paid? (auto-confirms on LND)
// GET  /api/pay?qr=address         -> QR of the public Lightning address (homepage)
import { json, readBody, clean, clientIp, safeEqual } from "../lib/http.js";
import { hit } from "../lib/store.js";
import { getProposal, saveProposal, getLead, logEvent, saveLead, confirmPayment } from "../lib/crm.js";
import { emailOwner } from "../lib/email.js";
import { createInvoice, invoicePaid, qrSvg, lightningMode, newOnchainAddress, onchainFeeRates, addressReceived } from "../lib/lightning.js";
import { PAYMENTS } from "../data/catalog.js";
import { encodeLnurl } from "../lib/lnurl.js";
import { siteUrl } from "../lib/http.js";

async function load(id, t) {
  const p = await getProposal(clean(id, 40));
  return p && safeEqual(p.token, t) ? p : null;
}

const fresh = (inv, usd) => inv && inv.usd === usd && Date.parse(inv.expiresAt) - Date.now() > 3 * 60e3;

async function publicInvoice(inv) {
  return {
    bolt11: inv.bolt11, sats: inv.sats, usd: inv.usd, rate: inv.rate, expiresAt: inv.expiresAt,
    autoConfirm: inv.autoConfirm, qr: await qrSvg(`lightning:${inv.bolt11}`.toUpperCase()),
  };
}

export async function POST(request) {
  const body = await readBody(request);
  if ((await hit(`rl:pay:${clientIp(request)}`, 600)) > 30) return json({ error: "Too many requests, try again in a few minutes." }, 429);
  const p = await load(body.id, body.t);
  if (!p) return json({ error: "Proposal not found." }, 404);
  if (!["accepted", "paid_claimed"].includes(p.status)) return json({ error: "Accept the proposal first." }, 409);
  if (!lightningMode()) return json({ error: "Lightning payments aren't set up yet." }, 503);

  const usd = p.totals.dueNow;
  if (!fresh(p.lightning, usd)) {
    try {
      p.lightning = await createInvoice({ usd, memo: `Altradits: ${p.title} (proposal ${p.id})` });
    } catch (err) {
      console.error("lightning invoice", err);
      return json({ error: "Couldn't create a Lightning invoice right now. Please use another payment method or try again shortly." }, 502);
    }
    await saveProposal(p);
  }
  // A fixed-amount LNURL for wallets that prefer it (needs our own node).
  const fromNode = p.lightning.provider === "lnd";
  const lnurl = fromNode ? encodeLnurl(`${siteUrl(request)}/api/lnurl?p=${p.id}&t=${p.token}`) : (PAYMENTS.lnurl || "").toUpperCase();
  const sats = p.lightning.sats;
  const btc = (sats / 1e8).toFixed(8);

  // On-chain: one address per proposal from the node, for wallets and exchanges
  // without Lightning (and amounts above channel capacity).
  let onchain = null;
  if (lightningMode() === "lnd") {
    try {
      if (!p.onchain?.address) p.onchain = { address: await newOnchainAddress(), createdAt: new Date().toISOString() };
      p.onchain.sats = sats;
      await saveProposal(p);
      const uri = `bitcoin:${p.onchain.address}?amount=${btc}&label=Altradits`;
      onchain = { address: p.onchain.address, btc, uri, qr: await qrSvg(uri) };
    } catch (err) { console.error("onchain address", err.message); }
  }

  // Fees the client should know about. We add none; networks charge the payer.
  const rates = onchain ? await onchainFeeRates() : null;
  const usdPerSat = p.lightning.rate ? p.lightning.rate / 1e8 : usd / sats;
  const TX_VBYTES = 141; // typical single-input native segwit payment
  const fees = {
    altradits: 0,
    lightning: { maxSats: Math.ceil(sats * 0.01) + 10, note: "Your wallet may add a small routing fee, usually well under 1%." },
    onchain: rates ? Object.fromEntries(Object.entries(rates).map(([k, r]) => [k, { satPerVb: r, sats: r * TX_VBYTES, usd: Math.round(r * TX_VBYTES * usdPerSat * 100) / 100 }])) : null,
  };

  // One QR any wallet understands: on-chain address + Lightning invoice (BIP21).
  const unified = onchain ? { uri: `${onchain.uri}&lightning=${p.lightning.bolt11}` } : null;
  if (unified) unified.qr = await qrSvg(unified.uri);

  return json({ invoice: { ...(await publicInvoice(p.lightning)), lnurl, lnurlFixedAmount: fromNode }, onchain, unified, fees });
}

export async function GET(request) {
  const u = new URL(request.url);

  if (u.searchParams.get("qr") === "address") {
    const target = PAYMENTS.lnurl || PAYMENTS.lightningAddress;
    if (!target) return new Response("Not configured", { status: 404 });
    return new Response(await qrSvg(`lightning:${target}`.toUpperCase()), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
  }

  const p = await load(u.searchParams.get("id"), u.searchParams.get("t"));
  if (!p) return json({ error: "Proposal not found." }, 404);
  if (p.status === "paid") return json({ status: "paid" });
  const candidates = [p.lightning, ...(p.lnurlInvoices || [])].filter(Boolean);
  if (!candidates.length && !p.onchain?.address) return json({ status: p.status, paid: false });

  // Paid either through the QR invoice or an invoice fetched via the LNURL.
  let paid = null, settled = null;
  for (const inv of candidates) {
    try {
      const r = await invoicePaid(inv);
      if (r) { paid = true; settled = inv; break; }
      if (r === false) paid = false;
    } catch (err) { console.error("lightning check", err); }
  }
  // On-chain: paid once the full amount has 1 confirmation (1% tolerance for
  // rounding); show the client that we've seen it before that.
  let onchainSeen = false;
  if (!paid && p.onchain?.address && p.onchain.sats) {
    try {
      const got = await addressReceived(p.onchain.address);
      const need = Math.floor(p.onchain.sats * 0.99);
      if (got.confirmed >= need) { paid = true; settled = { sats: got.confirmed, paymentHash: `onchain:${p.onchain.address}`, bolt11: "", onchain: true }; }
      else if (got.confirmed + got.unconfirmed >= need) onchainSeen = true;
      else if (got.confirmed + got.unconfirmed > 0) onchainSeen = "partial";
    } catch (err) { console.error("onchain check", err.message); }
  }
  if (paid) {
    const latest = await getProposal(p.id); // another check may have just confirmed it
    if (latest?.status === "paid") return json({ status: "paid" });
    const lead = await getLead(p.leadId);
    p.payment = { method: settled.onchain ? "Bitcoin (on-chain)" : "Bitcoin (Lightning)", reference: settled.paymentHash || settled.bolt11.slice(-24), claimedAt: new Date().toISOString(), sats: settled.sats };
    if (lead) {
      await confirmPayment(lead, p);
      // Work to start: one of the few things worth an email.
      await emailOwner(`Paid ⚡ ${settled.sats.toLocaleString("en-US")} sats: start work for ${lead.name || lead.email || p.order?.name || "a client"}`,
        `${lead.name || lead.email} paid $${p.totals.dueNow} (${settled.sats} sats) ${settled.onchain ? "on-chain" : "over Lightning"} for "${p.title}". It's confirmed${settled.onchain ? " on-chain" : " on your node"}${lead.email ? " and the client has their kick-off email" : ""}.${p.order ? `\n\nWebsite order: ${p.order.name}\nWhat they need: ${p.order.task || "(not given yet; they can add it from the order screen or the portal)"}\nThe ${p.order.kind === "service" ? "department agent has the task queued" : "client portal is open for their requests"}.` : ""}\n\nKick-off is promised within 48 hours.`,
        null, lead.id);
    } else {
      p.status = "paid";
      await saveProposal(p);
    }
    return json({ status: "paid" });
  }
  return json({ status: p.status, paid: false, verifiable: paid !== null || Boolean(p.onchain), onchainSeen });
}
