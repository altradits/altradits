import { getWalletToken } from './altraditsWallet';
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
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      return {
        ok: false,
        data: {
          error:
            response.status === 502 || response.status === 504 || response.status === 503
              ? `Backend Daraja bridge is unreachable (${response.status}). Please run 'node server.js' to start the backend.`
              : `Empty response from server (Status ${response.status}).`,
        } as T,
      };
    }
    const json = JSON.parse(text);
    return { ok: response.ok, data: json };
  } catch {
    const isProxyDown = response.status === 502 || response.status === 504 || response.status === 503;
    return {
      ok: false,
      data: {
        error: isProxyDown
          ? 'Backend Daraja bridge on port 3002 is offline. Start it with `node server.js`.'
          : `Server returned non-JSON response (Status ${response.status}).`,
      } as T,
    };
  }
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
    const message = err instanceof Error ? err.message : 'Network error reaching M-Pesa bridge';
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
    const message = err instanceof Error ? err.message : 'Network error querying M-Pesa status';
    return {
      success: false,
      error: message,
    };
  }
}

export interface VerifyC2BResponse {
  success: boolean;
  verified: boolean;
  shortCode?: string;
  name?: string;
  accountNumber?: string;
  provider?: string;
  error?: string;
}

/**
 * Verifies Paybill / Till merchant name via Safaricom C2B Hakikisha API
 */
export async function verifyC2BHakikisha(
  shortCode: string,
  accountNumber?: string,
  phone?: string
): Promise<VerifyC2BResponse> {
  const cleanShortcode = shortCode.trim();
  if (!cleanShortcode) {
    return {
      success: false,
      verified: false,
      error: 'ShortCode is required.',
    };
  }

  try {
    const response = await fetch('/api/yebente/mpesa/hakikisha/c2b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shortCode: cleanShortcode,
        accountNumber: accountNumber?.trim() || '',
        phone: phone ? formatKenyanPhone(phone) : '',
      }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        verified: false,
        error: data?.error || 'Failed to verify merchant via C2B Hakikisha.',
      };
    }

    return {
      success: true,
      verified: Boolean(data.verified),
      shortCode: data.shortCode,
      name: data.name,
      accountNumber: data.accountNumber,
      provider: data.provider,
    };
  } catch (err: unknown) {
    return {
      success: false,
      verified: false,
      error: err instanceof Error ? err.message : 'Network error verifying C2B merchant.',
    };
  }
}

import { requestTandoInvoice, pollTandoReceipt } from './tandoService';

export interface SendPayoutParams {
  phone: string;
  amount: number;
  currency?: string;
  satsAmount?: number;
  note?: string;
}

export interface SendPayoutResponse {
  success: boolean;
  referenceNumber?: string;
  phone?: string;
  amount?: number;
  currency?: string;
  satsAmount?: number;
  message?: string;
  receiptUrl?: string;
  error?: string;
}

/**
 * Dispatches an M-Pesa payout directly to a recipient phone number via Tando Lightning rail
 */
export async function sendMpesaPayout(params: SendPayoutParams): Promise<SendPayoutResponse> {
  const formattedPhone = formatKenyanPhone(params.phone);

  // 1. Primary Engine: Tando LNURL-pay API (zero credentials required, direct to Safaricom phone)
  try {
    const invoiceRes = await requestTandoInvoice({
      phone: formattedPhone,
      amount: params.amount,
      mode: 'KES',
    });

    if (invoiceRes.success && invoiceRes.paymentHash) {
      const receiptUrl = invoiceRes.successAction?.url || `https://bitcoin.co.ke/receipt/${invoiceRes.paymentHash}`;
      const pollRes = await pollTandoReceipt(invoiceRes.paymentHash, { timeoutMs: 30000 });

      if (pollRes.success && pollRes.transaction) {
        return {
          success: true,
          referenceNumber: pollRes.transaction.paymentNetworkReceipt || invoiceRes.paymentHash.slice(0, 10).toUpperCase(),
          phone: formattedPhone,
          amount: pollRes.transaction.currencyAmountSent || params.amount,
          currency: 'KES',
          satsAmount: pollRes.transaction.satsAmount || params.satsAmount,
          receiptUrl,
          message: `M-Pesa payout confirmed via Tando. Code: ${pollRes.transaction.paymentNetworkReceipt}`,
        };
      }

      return {
        success: true,
        referenceNumber: invoiceRes.paymentHash.slice(0, 10).toUpperCase(),
        phone: formattedPhone,
        amount: params.amount,
        currency: 'KES',
        satsAmount: params.satsAmount,
        receiptUrl,
        message: 'M-Pesa payout dispatched via Tando Lightning rail.',
      };
    }
  } catch {
    // fall through to backend bridge if offline or error
  }

  // 2. Fallback to local Daraja bridge if configured
  try {
    const response = await fetch('/api/yebente/mpesa/payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        amount: params.amount,
        currency: params.currency || 'KES',
        satsAmount: params.satsAmount || 0,
        note: params.note,
      }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to process M-Pesa disbursement.',
      };
    }

    return {
      success: true,
      referenceNumber: data.referenceNumber,
      phone: data.phone,
      amount: data.amount,
      currency: data.currency,
      satsAmount: data.satsAmount,
      message: data.message,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during M-Pesa payout.',
    };
  }
}


