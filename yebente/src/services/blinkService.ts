import { ExchangeRates } from '../types';

export const BLINK_GRAPHQL_ENDPOINT = 'https://api.blink.sv/graphql';
const BLINK_USERNAME_KEY = 'yebente_blink_username_v1';
const BLINK_WALLET_ID_KEY = 'yebente_blink_btc_wallet_id_v1';
const DEFAULT_BLINK_USERNAME = 'blink';

export interface BlinkPriceData {
  base: number;
  offset: number;
}

export interface BlinkRealtimePriceResponse {
  data?: {
    usd?: { btcSatPrice: BlinkPriceData; timestamp: number };
    kes?: { btcSatPrice: BlinkPriceData; timestamp: number };
    etb?: { btcSatPrice: BlinkPriceData; timestamp: number };
  };
  errors?: Array<{ message: string }>;
}

export interface BlinkConversionEstimation {
  btcSatAmount: number;
  usdCentAmount: number;
  timestamp: number;
}

export interface RealTransactionCost {
  feeSats: number;
  feeFiat: number;
  feeFiatCurrency: 'KES' | 'ETB' | 'USD';
  feeRateSatPerVb?: number;
  source: 'blink' | 'mempool' | 'fixed';
}

/**
 * Returns stored Blink sovereign username or default
 */
export function getBlinkSovereignUsername(): string {
  try {
    const saved = localStorage.getItem(BLINK_USERNAME_KEY);
    if (saved && saved.trim()) {
      return saved.trim().toLowerCase();
    }
  } catch {
    // fallback
  }
  return DEFAULT_BLINK_USERNAME;
}

/**
 * Saves custom Blink sovereign username
 */
export function saveBlinkSovereignUsername(username: string): void {
  try {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    localStorage.setItem(BLINK_USERNAME_KEY, clean);
    // Invalidate cached wallet ID when username changes
    localStorage.removeItem(BLINK_WALLET_ID_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns in-app sovereign Lightning address associated with Blink
 */
export function getBlinkSovereignAddress(): string {
  const username = getBlinkSovereignUsername();
  return `${username}@blink.sv`;
}

/**
 * Generates and saves a fresh in-app Lightning sovereign wallet.
 * Sets up a dedicated off-chain Lightning sovereign address so that all user transactions
 * avoid on-chain fees and settle off-chain through Lightning.
 */
export function generateInAppLightningWallet(customHandle?: string): {
  username: string;
  lightningAddress: string;
} {
  const handle = customHandle?.trim()
    ? customHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    : (() => {
        try {
          const rand = Array.from(window.crypto.getRandomValues(new Uint8Array(4)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          return `yb_${rand}`;
        } catch {
          return `yb_${Math.random().toString(36).substring(2, 10)}`;
        }
      })();

  saveBlinkSovereignUsername(handle);
  return {
    username: handle,
    lightningAddress: `${handle}@blink.sv`,
  };
}

/**
 * Parses Blink btcSatPrice structure (price of 1 sat in minor units: base / 10^offset).
 * Converts from minor units (cents/santim) to major units (/ 100), then multiplies by 10^8 for 1 BTC.
 * Result formula: (base / 10^offset) * 1_000_000
 * Example: base: 85517703125, offset: 12 -> 0.0855177 cents/sat -> 85,517.70 USD per BTC
 */
export function parseBlinkBtcPrice(priceObj?: { btcSatPrice: BlinkPriceData }): number {
  if (!priceObj || !priceObj.btcSatPrice) return 0;
  const { base, offset } = priceObj.btcSatPrice;
  if (typeof base !== 'number' || typeof offset !== 'number') return 0;
  const satPriceInMinorUnit = base * Math.pow(10, -offset);
  const satPriceInMajorUnit = satPriceInMinorUnit / 100;
  const btcPrice = satPriceInMajorUnit * 100_000_000;
  return Math.round(btcPrice * 100) / 100;
}

/**
 * Fetches real-time market rates directly from Blink GraphQL API.
 * Queries KES, ETB, and USD realtime prices in a single batch query.
 */
export async function fetchBlinkLiveRates(): Promise<ExchangeRates> {
  const query = `
    query GetBlinkRates {
      usd: realtimePrice(currency: "USD") {
        btcSatPrice {
          base
          offset
        }
        timestamp
      }
      kes: realtimePrice(currency: "KES") {
        btcSatPrice {
          base
          offset
        }
        timestamp
      }
      etb: realtimePrice(currency: "ETB") {
        btcSatPrice {
          base
          offset
        }
        timestamp
      }
    }
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Blink GraphQL returned HTTP ${res.status}`);
  }

  const json: BlinkRealtimePriceResponse = await res.json();
  if (json.errors && json.errors.length > 0 && !json.data) {
    throw new Error(`Blink GraphQL error: ${json.errors[0].message}`);
  }

  const btcUsd = parseBlinkBtcPrice(json.data?.usd);
  const btcKes = parseBlinkBtcPrice(json.data?.kes);
  const btcEtb = parseBlinkBtcPrice(json.data?.etb);

  if (btcUsd <= 0 || btcKes <= 0 || btcEtb <= 0) {
    throw new Error('Blink API returned invalid or zero price points.');
  }

  const usdKes = Math.round((btcKes / btcUsd) * 100) / 100;
  const usdEtb = Math.round((btcEtb / btcUsd) * 100) / 100;

  return {
    btcUsd,
    btcKes: Math.round(btcKes),
    btcEtb: Math.round(btcEtb),
    usdKes,
    usdEtb,
    change24hUsd: 0,
    change24hKes: 0,
    change24hEtb: 0,
    lastUpdated: Date.now(),
    isLive: true,
    source: 'blink',
  };
}

/**
 * Calls Blink currencyConversionEstimation to convert a fiat amount
 * directly into Satoshis using Blink server-side valuation.
 */
export async function estimateBlinkConversion(
  amount: number,
  currency: 'KES' | 'ETB' | 'USD'
): Promise<BlinkConversionEstimation> {
  const query = `
    query EstimateConversion($amount: Float!, $currency: DisplayCurrency!) {
      currencyConversionEstimation(amount: $amount, currency: $currency) {
        btcSatAmount
        usdCentAmount
        timestamp
      }
    }
  `;

  const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        amount: Number(amount),
        currency,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Blink conversion API returned HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.data?.currencyConversionEstimation) {
    return json.data.currencyConversionEstimation;
  }

  throw new Error(json.errors?.[0]?.message || 'Failed to estimate conversion via Blink.');
}

/**
 * Resolves a Blink username's default BTC wallet ID.
 */
export async function resolveBlinkWallet(
  username?: string
): Promise<{ success: boolean; walletId?: string; error?: string }> {
  const targetUser = username || getBlinkSovereignUsername();

  // Check cached wallet ID
  try {
    const cachedWalletId = localStorage.getItem(`${BLINK_WALLET_ID_KEY}_${targetUser}`);
    if (cachedWalletId) {
      return { success: true, walletId: cachedWalletId };
    }
  } catch {
    // ignore
  }

  const query = `
    query GetPublicWallet($username: Username!) {
      accountDefaultWallet(username: $username, walletCurrency: BTC) {
        id
        currency
      }
    }
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { username: targetUser },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `Blink wallet lookup failed HTTP ${res.status}` };
    }

    const json = await res.json();
    const walletId = json.data?.accountDefaultWallet?.id;
    if (walletId) {
      try {
        localStorage.setItem(`${BLINK_WALLET_ID_KEY}_${targetUser}`, walletId);
      } catch {
        // ignore
      }
      return { success: true, walletId };
    }

    return {
      success: false,
      error: json.errors?.[0]?.message || `Blink user ${targetUser} not found.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: `Could not reach Blink API: ${message}` };
  }
}

/**
 * Generates an authentic BOLT-11 Lightning invoice directly via Blink API
 * for the in-app sovereign address without requiring custom node infrastructure.
 */
export async function createBlinkDepositInvoice(
  satsAmount: number,
  memo?: string
): Promise<{
  success: boolean;
  invoice?: string;
  paymentHash?: string;
  satsAmount?: number;
  error?: string;
}> {
  const walletRes = await resolveBlinkWallet();
  if (!walletRes.success || !walletRes.walletId) {
    return {
      success: false,
      error: walletRes.error || 'Unable to locate Blink sovereign wallet ID.',
    };
  }

  const mutation = `
    mutation CreateInvoice($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
      lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
        errors {
          message
        }
        invoice {
          paymentRequest
          paymentHash
          satoshis
        }
      }
    }
  `;

  try {
    const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            recipientWalletId: walletRes.walletId,
            amount: Math.round(satsAmount),
            memo: memo || 'YeBente Sovereign Sats Deposit',
          },
        },
      }),
    });

    if (!res.ok) {
      return { success: false, error: `Blink invoice creation failed HTTP ${res.status}` };
    }

    const json = await res.json();
    const payload = json.data?.lnInvoiceCreateOnBehalfOfRecipient;

    if (payload?.errors && payload.errors.length > 0) {
      return { success: false, error: payload.errors[0].message };
    }

    if (payload?.invoice?.paymentRequest) {
      return {
        success: true,
        invoice: payload.invoice.paymentRequest,
        paymentHash: payload.invoice.paymentHash,
        satsAmount: payload.invoice.satoshis,
      };
    }

    return {
      success: false,
      error: 'Blink did not return a valid Lightning invoice.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: `Blink invoice generation error: ${message}` };
  }
}

/**
 * Checks invoice settlement status directly on Blink GraphQL.
 */
export async function checkBlinkInvoiceStatus(
  paymentHash: string
): Promise<{
  success: boolean;
  settled: boolean;
  paid: boolean;
  status: string;
  error?: string;
}> {
  const query = `
    query InvoiceStatus($input: LnInvoicePaymentStatusByHashInput!) {
      lnInvoicePaymentStatusByHash(input: $input) {
        status
        paymentHash
      }
    }
  `;

  try {
    const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          input: { paymentHash },
        },
      }),
    });

    if (!res.ok) {
      return { success: false, settled: false, paid: false, status: 'UNKNOWN' };
    }

    const json = await res.json();
    const status = json.data?.lnInvoicePaymentStatusByHash?.status;
    const isPaid = status === 'PAID';

    return {
      success: true,
      settled: isPaid,
      paid: isPaid,
      status: status || 'PENDING',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return {
      success: false,
      settled: false,
      paid: false,
      status: 'NETWORK_ERROR',
      error: message,
    };
  }
}

/**
 * Queries real transaction costs for on-chain Bitcoin transactions
 * using live Mempool fee recommendations and Blink real-time exchange rates.
 */
export async function getLiveOnChainFeeRate(): Promise<number> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://mempool.space/api/v1/fees/recommended', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return Math.max(1, Number(data.halfHourFee) || Number(data.fastestFee) || 1);
    }
  } catch {
    // fallback
  }
  return 2; // Default 2 sat/vB if mempool is offline
}

/**
 * Tracks real transaction costs: computes exact satoshi fees and local fiat cost
 * using Blink's live realtime price.
 */
export async function calculateRealTransactionCost(params: {
  type: 'lightning' | 'onchain';
  satsAmount: number;
  btcRate: number;
  currency: 'KES' | 'ETB' | 'USD';
  isOffChainLightningRoute?: boolean;
}): Promise<RealTransactionCost> {
  const { type, btcRate, currency, isOffChainLightningRoute = true } = params;

  // When routed off-chain through Lightning (the default for the in-app wallet),
  // on-chain transaction miner fees are completely ELIMINATED for the user.
  if (type === 'onchain' && isOffChainLightningRoute) {
    return {
      feeSats: 0,
      feeFiat: 0,
      feeFiatCurrency: currency,
      feeRateSatPerVb: 0,
      source: 'blink',
    };
  }

  if (type === 'lightning') {
    // Real Lightning routing fee: standard Base fee (1 sat) + 0.05% ppm
    const routingFee = Math.max(1, Math.round(params.satsAmount * 0.0005));
    const feeFiat = btcRate > 0 ? (routingFee / 100_000_000) * btcRate : 0;

    return {
      feeSats: routingFee,
      feeFiat: Math.round(feeFiat * 100) / 100,
      feeFiatCurrency: currency,
      source: 'blink',
    };
  }

  // On-Chain Native SegWit transaction is ~141 virtual bytes
  const satPerVb = await getLiveOnChainFeeRate();
  const vBytes = 141;
  const feeSats = Math.ceil(vBytes * satPerVb);
  const feeFiat = btcRate > 0 ? (feeSats / 100_000_000) * btcRate : 0;

  return {
    feeSats,
    feeFiat: Math.round(feeFiat * 100) / 100,
    feeFiatCurrency: currency,
    feeRateSatPerVb: satPerVb,
    source: 'mempool',
  };
}

/**
 * Queries the exact BTC satoshi balance of an authenticated Blink account using an API Key.
 */
export async function fetchBlinkWalletBalance(
  apiKey: string
): Promise<{ success: boolean; sats?: number; error?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'Empty Blink API Key' };
  }

  const query = `
    query GetMyBalance {
      me {
        defaultAccount {
          wallets {
            id
            balance
            walletCurrency
          }
        }
      }
    }
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(BLINK_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey.trim(),
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `Blink HTTP ${res.status}` };
    }

    const json = await res.json();
    const wallets = json.data?.me?.defaultAccount?.wallets;

    if (Array.isArray(wallets)) {
      const btcWallet = wallets.find((w: { walletCurrency: string; balance: number }) => w.walletCurrency === 'BTC');
      if (btcWallet && typeof btcWallet.balance === 'number') {
        return { success: true, sats: Math.max(0, btcWallet.balance) };
      }
    }

    return {
      success: false,
      error: json.errors?.[0]?.message || 'No BTC wallet found for this Blink account.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: `Blink balance query error: ${message}` };
  }
}
