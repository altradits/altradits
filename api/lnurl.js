// LNURL-pay (LUD-06) for proposals: a fixed-amount LNURL a client can copy or
// scan instead of an invoice. GET with ?p=&t= returns the pay request; the
// wallet then calls back with &amount= and receives an invoice from our node,
// which the proposal page detects like any other payment.
import crypto from "node:crypto";
import { clean, safeEqual, siteUrl } from "../lib/http.js";
import { getProposal, saveProposal } from "../lib/crm.js";
import { lightningMode, usdToSats, createInvoice, inboundSats } from "../lib/lightning.js";
import { hit } from "../lib/store.js";

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
const error = (reason) => reply({ status: "ERROR", reason });

export async function GET(request) {
  const u = new URL(request.url);
  const p = await getProposal(clean(u.searchParams.get("p"), 40));
  if (!p || !safeEqual(p.token, u.searchParams.get("t"))) return error("Unknown payment link.");
  if (!["accepted", "paid_claimed"].includes(p.status)) return error(p.status === "paid" ? "This proposal is already paid." : "Accept the proposal first.");
  if (lightningMode() !== "lnd") return error("Lightning payments are temporarily unavailable.");
  if ((await hit(`rl:lnurl:${p.id}`, 600)) > 60) return error("Too many requests.");

  const usd = p.totals.dueNow;
  const fixed = p.donation?.sats; // a donation in sats: exactly that many
  const sats = fixed || (await usdToSats(usd));
  // A payment bigger than the channels can receive would just fail in the
  // wallet; point the client at the on-chain option instead.
  const inbound = await inboundSats();
  if (inbound !== null && sats > inbound * 0.9) return error("This amount is too large for Lightning right now. Please use the On-chain tab on the payment page.");
  // Allow ~2% for BTC price movement between the two wallet requests.
  const min = (fixed ? sats : Math.floor(sats * 0.98)) * 1000, max = (fixed ? sats : Math.ceil(sats * 1.02)) * 1000;
  const metadata = JSON.stringify([["text/plain", `Altradits: ${p.title} (${fixed ? `${sats} sats` : `$${usd}`})`]]);
  const amount = u.searchParams.get("amount");

  if (!amount) {
    const callback = `${siteUrl(request)}/api/lnurl?p=${p.id}&t=${p.token}`;
    return reply({ tag: "payRequest", callback, minSendable: min, maxSendable: max, metadata, commentAllowed: 0 });
  }
  const msats = Number(amount);
  if (!Number.isInteger(msats) || msats < min || msats > max || msats % 1000) return error(`Please pay ${sats.toLocaleString("en-US")} sats.`);
  const reqSats = msats / 1000;
  const descHash = crypto.createHash("sha256").update(metadata).digest("hex");
  const now = Date.now();
  const active = (p.lnurlInvoices || []).filter((i) => !i.expiresAt || Date.parse(i.expiresAt) > now);
  const existing = active.find((i) => i.sats === reqSats && i.descriptionHash === descHash && (!i.expiresAt || Date.parse(i.expiresAt) - now > 300e3));
  if (existing) return reply({ pr: existing.bolt11, routes: [] });
  const inv = await createInvoice({ sats: reqSats, memo: "", descriptionHash: descHash, expiry: 3600 });
  p.lnurlInvoices = [...active.slice(-19), { ...inv, descriptionHash: descHash, viaLnurl: true, usd: p.totals.dueNow, coupon: p.coupon ? { ...p.coupon } : null }];
  await saveProposal(p);
  return reply({ pr: inv.bolt11, routes: [] });
}
