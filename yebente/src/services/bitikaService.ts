import { getWalletToken } from './altraditsWallet';

export type BuyProvider = 'bitika' | 'mpesa' | null;

// Which Buy provider the server offers. Bitika (M-Pesa or Airtel Money through
// a partner) while it is switched on, else the Daraja STK flow, else none.
export async function fetchBuyProvider(): Promise<BuyProvider> {
  try {
    const res = await fetch('/api/yebente/health');
    const data = await res.json().catch(() => ({}));
    return data?.buyProvider === 'bitika' || data?.buyProvider === 'mpesa' ? data.buyProvider : null;
  } catch {
    return null;
  }
}

export interface BitikaBuyResponse {
  success: boolean;
  code?: string;
  sats?: number;
  feeKes?: number;
  kes?: number;
  starting?: boolean;
  error?: string;
}

export interface BitikaStatusResponse {
  success: boolean;
  code?: string;
  state?: string;
  sats?: number;
  kes?: number;
  feeKes?: number;
  inProgress?: boolean;
  message?: string;
  error?: string;
}

async function authed(path: string, init?: RequestInit): Promise<Response> {
  const token = getWalletToken();
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

// Starts a Bitika buy: the server quotes and calls Bitika. Answers with the
// transaction code plus the sats estimate and the fee in shillings.
export async function startBitikaBuy(kes: number, phone: string): Promise<BitikaBuyResponse> {
  try {
    const res = await authed('/api/yebente/wallet/buy/bitika', {
      method: 'POST',
      body: JSON.stringify({ kes: Math.round(Number(kes)), phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { success: false, starting: Boolean(data?.starting), error: data?.error || 'Bitika did not start the payment.' };
    }
    return { success: true, code: data.code, sats: data.sats, feeKes: data.feeKes, kes: data.kes };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error reaching the wallet server.' };
  }
}

// One buy's display status, from the server (the browser never calls Bitika).
export async function bitikaStatus(code: string): Promise<BitikaStatusResponse> {
  try {
    const res = await authed(`/api/yebente/wallet/buy/bitika/${encodeURIComponent(code)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || 'Could not check the payment.' };
    }
    return {
      success: true,
      code: data.code,
      state: data.state,
      sats: data.sats,
      kes: data.kes,
      feeKes: data.feeKes,
      inProgress: data.inProgress,
      message: data.message,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error checking the payment.' };
  }
}
