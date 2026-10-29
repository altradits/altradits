export interface TelebirrDepositParams {
  phone: string;
  amount: number;
  satsAmount?: number;
}

export interface TelebirrDepositResponse {
  success: boolean;
  transactionId?: string;
  referenceNumber?: string;
  phone?: string;
  amount?: number;
  currency?: string;
  satsAmount?: number;
  message?: string;
  error?: string;
}

export interface TelebirrPayoutParams {
  phone: string;
  amount: number;
  currency?: string;
  satsAmount?: number;
  note?: string;
}

export interface TelebirrPayoutResponse {
  success: boolean;
  referenceNumber?: string;
  phone?: string;
  amount?: number;
  currency?: string;
  satsAmount?: number;
  message?: string;
  error?: string;
}

/**
 * Extracts 9 subscriber digits from any Ethiopian phone input (09..., 07..., 2519..., +2519...)
 */
export function extractEthiopianSubscriberDigits(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('251')) {
    clean = clean.slice(3);
  }
  while (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  return clean.slice(0, 9);
}

/**
 * Validates Ethiopian mobile subscriber numbers (Ethio Telecom 09XX / Safaricom Ethiopia 07XX)
 */
export function isValidEthiopianPhone(phone: string): boolean {
  const digits = extractEthiopianSubscriberDigits(phone);
  return digits.length === 9 && ['9', '7'].includes(digits[0]);
}

/**
 * Formats to standard international wire format: 2519XXXXXXXX or 2517XXXXXXXX
 */
export function formatEthiopianPhone(phone: string): string {
  const digits = extractEthiopianSubscriberDigits(phone);
  return digits ? `251${digits}` : '';
}

/**
 * Formats to user-friendly display: +251 911 234 567
 */
export function formatEthiopianDisplayPhone(phone: string): string {
  const digits = extractEthiopianSubscriberDigits(phone);
  if (!digits) return '';
  if (digits.length <= 3) return `+251 ${digits}`;
  if (digits.length <= 6) return `+251 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `+251 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

async function parseSafeJson<T>(response: Response): Promise<{ ok: boolean; data: T | null }> {
  try {
    const text = await response.text();
    if (!text) return { ok: response.ok, data: null };
    return { ok: response.ok, data: JSON.parse(text) as T };
  } catch {
    return { ok: response.ok, data: null };
  }
}

/**
 * Dispatches a Telebirr deposit request to load Sats into the sovereign wallet
 */
export async function initiateTelebirrDeposit(
  params: TelebirrDepositParams
): Promise<TelebirrDepositResponse> {
  const formattedPhone = formatEthiopianPhone(params.phone);

  try {
    const response = await fetch('/api/yebente/telebirr/deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        amount: params.amount,
        satsAmount: params.satsAmount || 0,
      }),
    });

    const { ok, data } = await parseSafeJson<TelebirrDepositResponse>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to dispatch Telebirr deposit.',
      };
    }

    return {
      success: true,
      transactionId: data.transactionId,
      referenceNumber: data.referenceNumber || data.transactionId,
      phone: data.phone || formattedPhone,
      amount: data.amount,
      currency: 'ETB',
      satsAmount: data.satsAmount,
      message: data.message || 'Telebirr deposit request processed successfully.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error initiating Telebirr deposit.',
    };
  }
}

/**
 * Dispatches a Telebirr payout to disburse ETB to a recipient phone from wallet Sats
 */
export async function sendTelebirrPayout(
  params: TelebirrPayoutParams
): Promise<TelebirrPayoutResponse> {
  const formattedPhone = formatEthiopianPhone(params.phone);

  try {
    const response = await fetch('/api/yebente/telebirr/payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        amount: params.amount,
        currency: params.currency || 'ETB',
        satsAmount: params.satsAmount || 0,
        note: params.note || 'YeBente Sats to Telebirr Transfer',
      }),
    });

    const { ok, data } = await parseSafeJson<TelebirrPayoutResponse>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to process Telebirr disbursement.',
      };
    }

    return {
      success: true,
      referenceNumber: data.referenceNumber,
      phone: data.phone || formattedPhone,
      amount: data.amount,
      currency: 'ETB',
      satsAmount: data.satsAmount,
      message: data.message || 'Telebirr payout dispatched successfully.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error processing Telebirr payout.',
    };
  }
}
