import { getWalletToken } from './altraditsWallet';
import { readableError, serverError } from './errorText';
export interface StkPushParams {
  phone: string;
  amount: number;
  accountReference?: string;
  transactionDesc?: string;
}

export interface StkPushResponse {
  success: boolean;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  responseCode?: string;
  responseDescription?: string;
  customerMessage?: string;
  error?: string;
}

export interface StkQueryResponse {
  success: boolean;
  responseCode?: string;
  resultCode?: number | string;
  resultDesc?: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  mpesaReceiptNumber?: string;
  details?: any;
  error?: string;
}

/**
 * Extracts 9 subscriber digits from any Kenyan phone input (07..., 01..., 2547..., +2547...)
 * Allows seamless typing, backspacing, editing, and copy-pasting.
 */
export function extractKenyanSubscriberDigits(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  // If starts with 254 (Kenya international prefix), strip it
  if (clean.startsWith('254')) {
    clean = clean.slice(3);
  }
  // Strip leading 0 (trunk prefix, e.g. 07... or 01...) so +254 0 is never created
  while (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  return clean.slice(0, 9);
}

/**
 * Validates Kenyan mobile subscriber numbers (Safaricom format: 07XX, 01XX, 2547XX, 2541XX)
 */
export function isValidKenyanPhone(phone: string): boolean {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return ['7', '1'].includes(clean[3]);
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return ['7', '1'].includes(clean[1]);
  }
  if (clean.length === 9) {
    return ['7', '1'].includes(clean[0]);
  }
  return false;
}

/**
 * Formats a Kenyan phone number to international E.164 without plus sign (2547XXXXXXXX)
 */
export function formatKenyanPhone(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
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
 * Formats a Kenyan phone number for display with country code (+254 7XX XXX XXX)
 */
export function formatKenyanDisplayPhone(phone: string): string {
  const formatted = formatKenyanPhone(phone);
  if (formatted.length === 12 && formatted.startsWith('254')) {
    return `+254 ${formatted.slice(3, 6)} ${formatted.slice(6, 9)} ${formatted.slice(9)}`;
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/**
 * Safely parses response body as JSON without throwing unhandled exceptions if the server returns HTML/502
 */
async function parseSafeJson<T = any>(response: Response): Promise<{ ok: boolean; data: T }> {
  // No JSON (a gateway page or an empty body): say what the status means.
  const text = await response.text().catch(() => '');
  try {
    if (text.trim()) return { ok: response.ok, data: JSON.parse(text) };
  } catch { /* not JSON */ }
  return { ok: false, data: { error: serverError(response.status, null, true) } as T };
}

/**
 * Dispatches a real Lipa Na M-Pesa Online STK Push request to the backend bridge
 */
export async function initiateStkPush(params: StkPushParams): Promise<StkPushResponse> {
  const formattedPhone = formatKenyanPhone(params.phone);

  try {
    // Sats are bought into the Altradits wallet: the server sends the prompt and credits it.
    const token = getWalletToken();
    const response = await fetch('/api/yebente/wallet/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ phone: formattedPhone, kes: Math.round(Number(params.amount)) }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to dispatch M-Pesa STK Push prompt.',
      };
    }

    return {
      success: true,
      merchantRequestId: data.merchantRequestId,
      checkoutRequestId: data.checkoutRequestId,
      responseCode: data.responseCode,
      responseDescription: data.responseDescription,
      customerMessage: data.customerMessage,
    };
  } catch (err: unknown) {
    const message = readableError(err, "Couldn't start the M-Pesa payment.", true);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Queries final settlement status for a given CheckoutRequestID from Safaricom
 */
export async function queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse> {
  try {
    const token = getWalletToken();
    const response = await fetch(`/api/yebente/wallet/buy/${encodeURIComponent(checkoutRequestId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const { ok, data } = await parseSafeJson<any>(response);

    return {
      success: ok && Boolean(data?.success),
      responseCode: data?.responseCode,
      resultCode: data?.resultCode,
      resultDesc: data?.resultDesc,
      merchantRequestId: data?.merchantRequestId,
      checkoutRequestId: data?.checkoutRequestId,
      mpesaReceiptNumber: data?.mpesaReceiptNumber,
      details: data?.details,
      error: data?.error,
    };
  } catch (err: unknown) {
    const message = readableError(err, "Couldn't check the M-Pesa payment.", false);
    return {
      success: false,
      error: message,
    };
  }
}
