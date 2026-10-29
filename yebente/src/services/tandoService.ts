/**
 * Tando API Service (bitcoin.co.ke)
 * Official integration for paying Kenyan M-Pesa phone numbers over Bitcoin Lightning.
 * Specification: https://bitcoin.co.ke/send-money-to-kenya/docs/developer-api.html
 */

export const TANDO_BASE_URL = 'https://bitcoin.co.ke';

export interface TandoCurrencyBounds {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  minSendable: number; // e.g. 15 KES
  maxSendable: number; // e.g. 50000 KES
  multiplier: number; // msat per KES (e.g. 8932)
}

export interface TandoBoundsResult {
  success: boolean;
  phone: string;
  lightningAddress: string;
  callback: string;
  minSendableMsat: number;
  maxSendableMsat: number;
  minSendableSats: number;
  maxSendableSats: number;
  currency?: TandoCurrencyBounds;
  isClaimed: boolean;
  metadata?: string;
  error?: string;
}

export interface TandoInvoiceResult {
  success: boolean;
  pr?: string; // BOLT11 Lightning Invoice
  paymentHash?: string;
  successAction?: {
    tag: string;
    description: string;
    url: string; // https://bitcoin.co.ke/receipt/{paymentHash}
  };
  convertedKes?: number;
  error?: string;
}

export interface TandoTransactionDetails {
  status: 'pending' | 'received' | 'completed' | 'failed';
  isPaid: boolean;
  paymentNetworkReceipt?: string; // Safaricom M-Pesa confirmation code (e.g. TIA7QK4M2P)
  payToAccount?: string; // 2547XXXXXXXX
  merchantName?: string | null; // Safaricom registered name of recipient
  currencyAmount?: number;
  currencyAmountSent?: number;
  baseCurrency?: string;
  satsAmount?: number;
  tandoFees?: number; // 1% fee in sats
  totalSatsAmount?: number;
  exchangeRate?: number;
  paymentHash?: string;
  dateTime?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface TandoPaymentStatusResponse {
  success: boolean;
  transaction?: TandoTransactionDetails;
  error?: {
    errorCode: string;
    message: string;
  };
}

/**
 * Normalizes any Kenyan phone number to international 254 format without + or spaces
 * Formats supported: 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX
 */
export function normalizeTandoPhone(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return clean;
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return `254${clean.slice(1)}`;
  }
  if (clean.length === 9) {
    return `254${clean}`;
  }
  return clean;
}

/**
 * Validates if the phone number is an eligible Safaricom prefix accepted by Tando:
 * Range: 25470x-25479x, 25411x, 25414x (12 digits total)
 */
export function isValidTandoPhone(phone: string): boolean {
  const normalized = normalizeTandoPhone(phone);
  if (normalized.length !== 12 || !normalized.startsWith('254')) {
    return false;
  }
  const prefix = normalized.slice(3, 5); // 2 digits after 254
  // 70-79
  if (normalized[3] === '7') return true;
  // 11, 14
  if (prefix === '11' || prefix === '14') return true;
  return false;
}

export const isValidKenyanPhone = isValidTandoPhone;

/**
 * Formats a Kenyan phone number for display (+254 7XX XXX XXX)
 */
export function formatKenyanDisplayPhone(phone: string): string {
  const normalized = normalizeTandoPhone(phone);
  if (normalized.length === 12 && normalized.startsWith('254')) {
    return `+254 ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`;
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/**
 * Returns the canonical Tando Lightning Address for a Kenyan phone number:
 * e.g. 254712345678@bitcoin.co.ke
 */
export function getTandoLightningAddress(phone: string): string {
  const normalized = normalizeTandoPhone(phone);
  return `${normalized}@bitcoin.co.ke`;
}

/**
 * Checks whether an input string is a Tando Lightning address
 */
export function isTandoLightningAddress(input: string): boolean {
  const clean = input.trim().toLowerCase().replace(/^lightning:/i, '');
  if (clean.endsWith('@bitcoin.co.ke')) {
    const username = clean.replace('@bitcoin.co.ke', '');
    return isValidTandoPhone(username);
  }
  return false;
}

/**
 * Step 1: Read the bounds & live rate from Tando API
 * Endpoint: GET https://bitcoin.co.ke/.well-known/lnurlp/{phone}
 */
export async function fetchTandoBounds(phone: string): Promise<TandoBoundsResult> {
  const normalized = normalizeTandoPhone(phone);

  if (!isValidTandoPhone(normalized)) {
    return {
      success: false,
      phone: normalized,
      lightningAddress: `${normalized}@bitcoin.co.ke`,
      callback: '',
      minSendableMsat: 0,
      maxSendableMsat: 0,
      minSendableSats: 0,
      maxSendableSats: 0,
      isClaimed: false,
      error: 'Invalid Safaricom number. Must be a Kenyan mobile number (07XX or 01XX).',
    };
  }

  const url = `${TANDO_BASE_URL}/.well-known/lnurlp/${normalized}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        phone: normalized,
        lightningAddress: `${normalized}@bitcoin.co.ke`,
        callback: '',
        minSendableMsat: 0,
        maxSendableMsat: 0,
        minSendableSats: 0,
        maxSendableSats: 0,
        isClaimed: false,
        error: `Tando API returned HTTP ${res.status}. Please try again shortly.`,
      };
    }

    const data = await res.json();

    if (data.status === 'ERROR') {
      return {
        success: false,
        phone: normalized,
        lightningAddress: `${normalized}@bitcoin.co.ke`,
        callback: '',
        minSendableMsat: 0,
        maxSendableMsat: 0,
        minSendableSats: 0,
        maxSendableSats: 0,
        isClaimed: false,
        error: data.reason || 'Could not fetch Tando payment bounds.',
      };
    }

    const callback = data.callback || url;
    const isClaimed = Boolean(callback.includes('fwd='));
    const minMsat = Number(data.minSendable) || 135000;
    const maxMsat = Number(data.maxSendable) || 450000000;

    return {
      success: true,
      phone: normalized,
      lightningAddress: `${normalized}@bitcoin.co.ke`,
      callback,
      minSendableMsat: minMsat,
      maxSendableMsat: maxMsat,
      minSendableSats: Math.ceil(minMsat / 1000),
      maxSendableSats: Math.floor(maxMsat / 1000),
      currency: data.currency
        ? {
            code: data.currency.code || 'KES',
            name: data.currency.name || 'Kenyan Shillings',
            symbol: data.currency.symbol || 'KSh',
            decimals: Number(data.currency.decimals) || 0,
            minSendable: Number(data.currency.minSendable) || 15,
            maxSendable: Number(data.currency.maxSendable) || 50000,
            multiplier: Number(data.currency.multiplier) || 9000,
          }
        : undefined,
      isClaimed,
      metadata: data.metadata,
    };
  } catch (err: unknown) {
    return {
      success: false,
      phone: normalized,
      lightningAddress: `${normalized}@bitcoin.co.ke`,
      callback: '',
      minSendableMsat: 0,
      maxSendableMsat: 0,
      minSendableSats: 0,
      maxSendableSats: 0,
      isClaimed: false,
      error: err instanceof Error ? err.message : 'Network error reaching Tando API.',
    };
  }
}

/**
 * Step 2: Request an invoice priced in KES (or millisatoshis)
 * Endpoint: GET https://bitcoin.co.ke/.well-known/lnurlp/{phone}?amount={kes}&currency=KES
 */
export async function requestTandoInvoice(params: {
  phone: string;
  amount: number;
  mode?: 'KES' | 'SATS';
  callbackUrl?: string;
}): Promise<TandoInvoiceResult> {
  const normalized = normalizeTandoPhone(params.phone);
  const mode = params.mode || 'KES';
  const callback = params.callbackUrl || `${TANDO_BASE_URL}/.well-known/lnurlp/${normalized}`;

  const separator = callback.includes('?') ? '&' : '?';
  const targetUrl =
    mode === 'KES'
      ? `${callback}${separator}amount=${params.amount}&currency=KES`
      : `${callback}${separator}amount=${Math.round(params.amount * 1000)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await res.json();

    if (data.status === 'ERROR') {
      return {
        success: false,
        error: data.reason || 'Tando returned an error issuing Lightning invoice.',
      };
    }

    if (!data.pr) {
      return {
        success: false,
        error: 'No Lightning payment request (pr) returned by Tando.',
      };
    }

    // Extract payment hash from successAction URL: https://bitcoin.co.ke/receipt/{paymentHash}
    let paymentHash: string | undefined;
    if (data.successAction?.url) {
      const parts = data.successAction.url.split('/');
      paymentHash = parts[parts.length - 1];
    }

    return {
      success: true,
      pr: data.pr,
      paymentHash,
      successAction: data.successAction,
      convertedKes: data.converted,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error requesting Tando invoice.',
    };
  }
}

/**
 * Step 3: Poll for M-Pesa receipt confirmation
 * Endpoint: GET https://bitcoin.co.ke/api/payment/{paymentHash}
 * Follows Tando's recommended polling loop (3-second cadence, 120s timeout, handles early 404s).
 */
export async function pollTandoReceipt(
  paymentHash: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onUpdate?: (tx: TandoTransactionDetails) => void;
  } = {}
): Promise<{ success: boolean; transaction?: TandoTransactionDetails; error?: string }> {
  const { intervalMs = 3000, timeoutMs = 120000, onUpdate } = options;
  const url = `${TANDO_BASE_URL}/api/payment/${paymentHash}`;
  const deadline = Date.now() + timeoutMs;
  let notFoundStreak = 0;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);

      if (res.status === 404) {
        // Tando row is written moments after invoice is paid. Allow up to 7 404s.
        notFoundStreak++;
        if (notFoundStreak > 7) {
          return { success: false, error: 'Unknown payment hash on Tando.' };
        }
      } else if (res.ok) {
        notFoundStreak = 0;
        const data = await res.json();
        const tx: TandoTransactionDetails = data.transaction;

        if (tx) {
          if (onUpdate) onUpdate(tx);

          if (tx.status === 'completed' && tx.isPaid && tx.paymentNetworkReceipt) {
            return {
              success: true,
              transaction: tx,
            };
          }

          if (tx.status === 'failed') {
            return {
              success: false,
              transaction: tx,
              error: `M-Pesa payout failed: ${tx.failureReason || 'Declined by Safaricom'}`,
            };
          }
        }
      }
    } catch {
      // transient network glitch during polling
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    success: false,
    error: 'Timed out waiting for M-Pesa receipt confirmation from Safaricom.',
  };
}
