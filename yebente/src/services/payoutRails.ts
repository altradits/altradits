// Send Mobile's payout options, as the server lists them (lib/rails.js): each
// pays a mobile-money number through a partner that gives every number a
// Lightning address (number@host) and quotes in the local currency over
// LNURL-pay. M-Pesa through Tando (bitcoin.co.ke) is the first; a new country
// appears here when the server switches it on, with no change to the app.
// Tando's API: https://bitcoin.co.ke/send-money-to-kenya/docs/developer-api.html

export interface Rail {
  id: string;
  name: string; // M-Pesa
  country: string; // Kenya
  currency: string; // KES
  partner: string; // Tando
  host: string; // bitcoin.co.ke
  feePercent: number; // the partner's fee
  receipt: string; // the partner's payment-status path, or '' if it has none
  dial: string; // 254
  digits: number; // subscriber digits after the country code
  starts: string[]; // accepted first digits
  example: string; // 707 172 370
}

let listed: Promise<Rail[]> | null = null;
export function fetchRails(): Promise<Rail[]> {
  listed ??= fetch('/api/yebente/rails')
    .then((r) => r.json())
    .then((d) => (Array.isArray(d.rails) ? d.rails : []))
    .catch(() => {
      listed = null; // try again next time
      return [];
    });
  return listed;
}

// ---- phone numbers: 07..., +254 7..., 2547... all become dial + subscriber digits
export function subscriberDigits(rail: Rail, phone: string): string {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith(rail.dial)) d = d.slice(rail.dial.length);
  return d.replace(/^0+/, '').slice(0, rail.digits);
}
export const fullNumber = (rail: Rail, phone: string) => {
  const d = subscriberDigits(rail, phone);
  return d ? `${rail.dial}${d}` : '';
};
export const isValidNumber = (rail: Rail, phone: string) => {
  const d = subscriberDigits(rail, phone);
  return d.length === rail.digits && rail.starts.some((s) => d.startsWith(s));
};
export const displayNumber = (rail: Rail, phone: string) => {
  const d = subscriberDigits(rail, phone);
  return d.length === rail.digits ? `+${rail.dial} ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : phone;
};
export const railAddress = (rail: Rail, phone: string) => `${fullNumber(rail, phone)}@${rail.host}`;

// ---- the partner's LNURL-pay: its limits and live rate, then an invoice in its currency
export interface RailQuote {
  success: boolean;
  callback: string;
  currency?: { code: string; minSendable: number; maxSendable: number; multiplier: number }; // multiplier: msat per unit
  error?: string;
}

const getJson = async (url: string, ms: number) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

export async function fetchQuote(rail: Rail, phone: string): Promise<RailQuote> {
  if (!isValidNumber(rail, phone)) return { success: false, callback: '', error: `Enter a valid ${rail.name} number.` };
  const url = `https://${rail.host}/.well-known/lnurlp/${fullNumber(rail, phone)}`;
  try {
    const { ok, status, data } = await getJson(url, 7000);
    if (!ok || data.status === 'ERROR') return { success: false, callback: '', error: data.reason || `${rail.partner} answered ${status}. Try again shortly.` };
    const c = data.currency;
    return {
      success: true,
      callback: data.callback || url,
      currency: c && c.code === rail.currency && Number(c.multiplier) > 0
        ? { code: c.code, minSendable: Number(c.minSendable) || 0, maxSendable: Number(c.maxSendable) || 0, multiplier: Number(c.multiplier) }
        : undefined,
    };
  } catch (err: unknown) {
    return { success: false, callback: '', error: err instanceof Error ? err.message : `Could not reach ${rail.partner}.` };
  }
}

export interface RailInvoice {
  success: boolean;
  pr?: string;
  paymentHash?: string;
  receiptUrl?: string;
  error?: string;
}

export async function requestInvoice(rail: Rail, p: { phone: string; amount: number; callbackUrl?: string }): Promise<RailInvoice> {
  const callback = p.callbackUrl || `https://${rail.host}/.well-known/lnurlp/${fullNumber(rail, p.phone)}`;
  const url = `${callback}${callback.includes('?') ? '&' : '?'}amount=${p.amount}&currency=${encodeURIComponent(rail.currency)}`;
  try {
    const { data } = await getJson(url, 8000);
    if (data.status === 'ERROR') return { success: false, error: data.reason || `${rail.partner} could not make an invoice.` };
    if (!data.pr) return { success: false, error: `${rail.partner} returned no invoice.` };
    // The receipt link ends with the payment hash (Tando: https://bitcoin.co.ke/receipt/<hash>).
    const receiptUrl: string | undefined = data.successAction?.url;
    const last = receiptUrl?.split('/').pop() || '';
    return { success: true, pr: data.pr, receiptUrl, paymentHash: /^[0-9a-f]{64}$/i.test(last) ? last : undefined };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : `Could not reach ${rail.partner}.` };
  }
}

export interface RailPayment {
  status: 'pending' | 'received' | 'completed' | 'failed';
  isPaid: boolean;
  paymentNetworkReceipt?: string; // e.g. the Safaricom M-Pesa code
  merchantName?: string | null; // the registered name of the recipient
  currencyAmountSent?: number;
  failureReason?: string;
}

// Waits for the partner to confirm the payout (3 s apart, up to 2 minutes; the
// record appears a moment after the invoice is paid, so early 404s are expected).
export async function pollReceipt(
  rail: Rail,
  paymentHash: string,
  { intervalMs = 3000, timeoutMs = 120000, onUpdate }: { intervalMs?: number; timeoutMs?: number; onUpdate?: (p: RailPayment) => void } = {}
): Promise<{ success: boolean; payment?: RailPayment; error?: string }> {
  if (!rail.receipt) return { success: false, error: 'No receipt from this partner.' };
  const url = `https://${rail.host}${rail.receipt}${paymentHash}`;
  const deadline = Date.now() + timeoutMs;
  let missing = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        if (++missing > 7) return { success: false, error: `${rail.partner} doesn't know this payment.` };
      } else if (res.ok) {
        missing = 0;
        const payment: RailPayment | undefined = (await res.json()).transaction;
        if (payment) {
          onUpdate?.(payment);
          if (payment.status === 'completed' && payment.isPaid && payment.paymentNetworkReceipt) return { success: true, payment };
          if (payment.status === 'failed') return { success: false, payment, error: `${rail.name} payout failed: ${payment.failureReason || 'declined'}` };
        }
      }
    } catch {
      // a passing network glitch: keep waiting
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { success: false, error: `Still waiting for ${rail.partner} to confirm.` };
}
