// Send Mobile's payout options: each pays a mobile-money number through a
// partner that gives every number a Lightning address (number@host) and quotes
// in the local currency over LNURL-pay, the way Tando does for M-Pesa.
//
// The app draws one button per option that is switched on, from this list
// (GET /api/yebente/rails). Adding a country is one entry here; switching it on
// is a setting, so the buttons appear without changing or rebuilding the app.
//
//   dial      the country code; numbers are stored as dial + subscriber digits
//   digits    subscriber digits after the country code (no leading 0)
//   starts    accepted first digits of the subscriber number
//   receipt   the partner's payment-status path (number@host's receipt), if it has one
import { switchOn } from "./ywallet.js";
import { b2cOn } from "./mpesa-b2c.js";

const env = (k) => String(process.env[k] || "").trim();

// Read on every call, so a changed setting needs only a restart, never a deploy.
const rails = () => [
  {
    id: "mpesa", name: "M-Pesa", country: "Kenya", currency: "KES",
    partner: "Tando", host: "bitcoin.co.ke", feePercent: 1, receipt: "/api/payment/",
    dial: "254", digits: 9, starts: ["7", "11", "14"], example: "707 172 370",
    on: true,
  },
  {
    // M-Pesa paid by Ye₿ente itself from its own B2C shortcode (#510): no partner
    // in between, so it still works when the partner above is down. The app sends
    // it to wallet/mobile instead of a Lightning address. Off until YEBENTE_B2C=on
    // with the B2C settings in lib/mpesa-b2c.js.
    id: "mpesa-direct", name: "M-Pesa", country: "Kenya", currency: "KES",
    partner: "Ye₿ente", host: "", direct: true,
    feePercent: Math.min(10, Math.max(0, Number(process.env.YEBENTE_B2C_FEE_PCT ?? 1) || 0)), receipt: "",
    dial: "254", digits: 9, starts: ["7", "1"], example: "707 172 370",
    on: b2cOn(),
  },
  {
    // Ready for a Telebirr partner: set YEBENTE_TELEBIRR_HOST (and, if they differ,
    // the partner's name, fee and receipt path), then YEBENTE_TELEBIRR=on.
    id: "telebirr", name: "Telebirr", country: "Ethiopia", currency: "ETB",
    partner: env("YEBENTE_TELEBIRR_PARTNER") || "Partner", host: env("YEBENTE_TELEBIRR_HOST").toLowerCase(),
    feePercent: Number(env("YEBENTE_TELEBIRR_FEE_PERCENT")) || 0, receipt: env("YEBENTE_TELEBIRR_RECEIPT"),
    dial: "251", digits: 9, starts: ["9", "7"], example: "912 345 678",
    on: switchOn("YEBENTE_TELEBIRR") && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(env("YEBENTE_TELEBIRR_HOST")),
  },
];

// What the app may show: switched-on options only, without the switch itself.
export const railsOn = () => rails().filter((r) => r.on).map(({ on, ...r }) => r);

// A partner host whose option is switched off: nothing is paid to it, even when
// someone types number@host into Send Sats or calls the server directly.
export const railHostOff = (host) => {
  const h = String(host || "").toLowerCase();
  return rails().some((r) => r.host && r.host === h && !r.on);
};

// ---- is a partner answering? (cached a minute)
// A partner that doesn't answer is listed with down: true and after the working
// options, so the app opens on one that works. Direct options have no partner to ask.
let railFetch = (u, o) => import("./netsafe.js").then((n) => n.publicFetch(u, o));
export const setRailFetcher = (f) => { railFetch = f; health.clear(); }; // tests
const health = new Map(); // host -> { up, at }
async function partnerUp(host) {
  const h = health.get(host);
  if (h && Date.now() - h.at < 60e3) return h.up;
  let up = false;
  try {
    const r = await railFetch(`https://${host}/`, { signal: AbortSignal.timeout(5000), maxBytes: 65536 });
    up = r.status < 500;
  } catch { up = false; }
  health.set(host, { up, at: Date.now() });
  return up;
}
export async function railsWithHealth() {
  const list = await Promise.all(railsOn().map(async (r) => (r.direct || !r.host ? r : { ...r, down: !(await partnerUp(r.host)) })));
  return [...list.filter((r) => !r.down), ...list.filter((r) => r.down)];
}
