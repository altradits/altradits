// LNURL-pay (LUD-06) for proposals: a fixed-amount LNURL a client can copy or
// scan instead of an invoice. GET with ?p=&t= returns the pay request; the
// wallet then calls back with &amount= and receives an invoice from our node,
// which the proposal page detects like any other payment.
import crypto from "node:crypto";
import { clean, safeEqual, siteUrl } from "../lib/http.js";
import { getProposal, saveProposal } from "../lib/crm.js";
import { lightningMode, usdToSats, createInvoice } from "../lib/lightning.js";
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
  const sats = await usdToSats(usd);
  // Allow ~2% for BTC price movement between the two wallet requests.
  const min = Math.floor(sats * 0.98) * 1000, max = Math.ceil(sats * 1.02) * 1000;
  const metadata = JSON.stringify([["text/plain", `Altradits: ${p.title} ($${usd})`]]);
  const amount = u.searchParams.get("amount");

  if (!amount) {
    const callback = `${siteUrl(request)}/api/lnurl?p=${p.id}&t=${p.token}`;
    return reply({ tag: "payRequest", callback, minSendable: min, maxSendable: max, metadata, commentAllowed: 0 });
  }
  const msats = Number(amount);
  if (!Number.isInteger(msats) || msats < min || msats > max || msats % 1000) return error(`Please pay ${sats.toLocaleString("en-US")} sats.`);
  const inv = await createInvoice({ sats: msats / 1000, memo: "", descriptionHash: crypto.createHash("sha256").update(metadata).digest("hex"), expiry: 3600 });
  p.lnurlInvoices = [...(p.lnurlInvoices || []).slice(-9), { ...inv, viaLnurl: true }];
  await saveProposal(p);
  return reply({ pr: inv.bolt11, routes: [] });
}
