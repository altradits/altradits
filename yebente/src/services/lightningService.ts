export interface LightningAddressDetails {
  success: boolean;
  address: string;
  username: string;
  domain: string;
  provider: string;
  minSendableSats: number;
  maxSendableSats: number;
  callbackUrl: string;
  commentAllowed: number;
  currency?: {
    code: string;
    minSendable: number;
    maxSendable: number;
    multiplier: number;
  };
  error?: string;
}

export interface WebLNBalanceResult {
  available: boolean;
  sats?: number;
  error?: string;
}

/**
 * Decodes a bech32-encoded string (such as lnurl1...) to an actual HTTP/HTTPS URL
 */
export function decodeLnurl(lnurlStr: string): string | null {
  const clean = lnurlStr.trim().toLowerCase().replace(/^lightning:/i, '');
  if (!clean.startsWith('lnurl1')) {
    return null;
  }

  const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const sep = clean.lastIndexOf('1');
  if (sep === -1) return null;

  const dataPart = clean.substring(sep + 1);
  const words: number[] = [];
  // Skip the 6-character checksum at the end
  for (let i = 0; i < dataPart.length - 6; i++) {
    const idx = ALPHABET.indexOf(dataPart[i]);
    if (idx === -1) return null;
    words.push(idx);
  }

  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const v of words) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }

  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

import { normalizeTandoPhone, isValidTandoPhone } from './tandoService';

/**
 * Checks if input is a valid Lightning Address (user@domain.com), encoded LNURL (lnurl1...),
 * or a Kenyan phone number (which functions natively as a Tando Lightning address: <phone>@bitcoin.co.ke).
 */
export function isLightningAddress(input: string): boolean {
  const clean = input.trim().toLowerCase().replace(/^lightning:/i, '');
  if (clean.startsWith('lnurl1')) {
    return true;
  }
  if (isValidTandoPhone(clean)) {
    return true;
  }
  const lightningRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
  return lightningRegex.test(clean);
}

/**
 * Resolves a Lightning Address (such as user@walletofsatoshi.com, user@blink.sv, or phone@bitcoin.co.ke)
 * via the LNURL-pay protocol (RFC-LNURL) to verify the wallet is authentic and active.
 */
export async function resolveLightningAddress(
  address: string
): Promise<LightningAddressDetails> {
  let clean = address.trim().toLowerCase().replace(/^lightning:/i, '');

  // If a Kenyan phone number is entered, normalize to Tando Lightning address
  if (isValidTandoPhone(clean)) {
    clean = `${normalizeTandoPhone(clean)}@bitcoin.co.ke`;
  }

  let targetUrl: string;
  let defaultUsername = '';
  let defaultDomain = '';

  if (clean.startsWith('lnurl1')) {
    const decoded = decodeLnurl(clean);
    if (!decoded) {
      return {
        success: false,
        address: clean,
        username: '',
        domain: '',
        provider: 'Unknown',
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: 'Invalid bech32 LNURL encoding.',
      };
    }
    targetUrl = decoded;
    try {
      const parsed = new URL(decoded);
      defaultDomain = parsed.hostname;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      defaultUsername = pathParts[pathParts.length - 1] || 'user';
    } catch {
      defaultDomain = 'lightning';
      defaultUsername = 'user';
    }
  } else {
    const [username, domain] = clean.split('@');
    if (!username || !domain) {
      return {
        success: false,
        address: clean,
        username: '',
        domain: '',
        provider: 'Unknown',
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: 'Invalid Lightning Address format.',
      };
    }
    defaultUsername = username;
    defaultDomain = domain;
    targetUrl = `https://${domain}/.well-known/lnurlp/${username}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        address: clean,
        username: defaultUsername,
        domain: defaultDomain,
        provider: defaultDomain,
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: `Could not reach Lightning wallet at ${defaultDomain}.`,
      };
    }

    const data = await res.json();

    if (data.status === 'ERROR') {
      return {
        success: false,
        address: clean,
        username: defaultUsername,
        domain: defaultDomain,
        provider: defaultDomain,
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: data.reason || 'Lightning address resolution returned error.',
      };
    }

    // Extract provider name from domain or metadata
    let provider = defaultDomain;
    if (defaultDomain.includes('walletofsatoshi')) {
      provider = 'Wallet of Satoshi';
    } else if (defaultDomain.includes('blink.sv')) {
      provider = 'Blink (Galoy)';
    } else if (defaultDomain.includes('bitcoin.co.ke')) {
      provider = 'Tando (M-Pesa)';
    } else if (defaultDomain.includes('getalby')) {
      provider = 'Alby';
    } else if (defaultDomain.includes('strike.me')) {
      provider = 'Strike';
    } else if (defaultDomain.includes('coinos.io')) {
      provider = 'CoinOS';
    }

    // Extract human-readable address from metadata if present (LUD-06 / LUD-16 spec)
    let standardAddress = `${defaultUsername}@${defaultDomain}`;
    let parsedMetadata = data.metadata;
    if (typeof parsedMetadata === 'string') {
      try {
        parsedMetadata = JSON.parse(parsedMetadata);
      } catch {
        parsedMetadata = [];
      }
    }
    if (Array.isArray(parsedMetadata)) {
      try {
        const idEntry = parsedMetadata.find(
          (m: unknown) => Array.isArray(m) && m[0] === 'text/identifier'
        );
        if (idEntry && typeof idEntry[1] === 'string') {
          standardAddress = idEntry[1];
        }
      } catch {
        // ignore
      }
    }

    const minSendableSats = Math.ceil((Number(data.minSendable) || 1000) / 1000);
    const maxSendableSats = Math.floor((Number(data.maxSendable) || 100000000000) / 1000);

    const currencyData = data.currency
      ? {
          code: data.currency.code || 'KES',
          minSendable: Number(data.currency.minSendable) || 15,
          maxSendable: Number(data.currency.maxSendable) || 50000,
          multiplier: Number(data.currency.multiplier) || 9000,
        }
      : undefined;

    return {
      success: true,
      address: standardAddress,
      username: defaultUsername,
      domain: defaultDomain,
      provider,
      minSendableSats,
      maxSendableSats,
      callbackUrl: data.callback || '',
      commentAllowed: Number(data.commentAllowed) || 0,
      currency: currencyData,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return {
      success: false,
      address: clean,
      username: defaultUsername,
      domain: defaultDomain,
      provider: defaultDomain,
      minSendableSats: 0,
      maxSendableSats: 0,
      callbackUrl: '',
      commentAllowed: 0,
      error: `Network error connecting to ${defaultDomain}: ${message}`,
    };
  }
}

/**
 * Creates an authentic BOLT-11 Lightning invoice directly from the resolved LNURL callback
 */
export async function createLightningInvoice(
  callbackUrl: string,
  satsAmount: number,
  comment?: string
): Promise<{ success: boolean; invoice?: string; paymentHash?: string; receiptUrl?: string; error?: string }> {
  try {
    const millisats = Math.round(satsAmount * 1000);
    const url = new URL(callbackUrl);
    url.searchParams.set('amount', String(millisats));
    if (comment) {
      url.searchParams.set('comment', comment);
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === 'ERROR' || !data.pr) {
      return {
        success: false,
        error: data.reason || 'Failed to generate BOLT-11 Lightning invoice from wallet.',
      };
    }

    let paymentHash: string | undefined;
    let receiptUrl: string | undefined;
    if (data.successAction?.url) {
      receiptUrl = data.successAction.url;
      const parts = data.successAction.url.split('/');
      paymentHash = parts[parts.length - 1];
    }

    return {
      success: true,
      invoice: data.pr,
      paymentHash,
      receiptUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reach invoice generator';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Inspects if a WebLN browser extension (Alby, Zeus, etc.) is connected,
 * and queries the live satoshi balance automatically without manual input.
 */
export async function queryWebLNBalance(): Promise<WebLNBalanceResult> {
  const anyWindow = window as unknown as {
    webln?: {
      enable: () => Promise<void>;
      getBalance?: () => Promise<{ balance: number }>;
    };
  };

  if (!anyWindow.webln) {
    return { available: false };
  }

  try {
    await anyWindow.webln.enable();
    if (anyWindow.webln.getBalance) {
      const data = await anyWindow.webln.getBalance();
      return {
        available: true,
        sats: Number(data.balance) || 0,
      };
    }
    return { available: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User rejected WebLN connection';
    return {
      available: false,
      error: message,
    };
  }
}

export interface DepositInvoiceResponse {
  success: boolean;
  configured?: boolean;
  invoice?: string;
  paymentHash?: string;
  satsAmount?: number;
  error?: string;
}

export interface InvoiceStatusResponse {
  success: boolean;
  settled: boolean;
  paid: boolean;
  satsAmount?: number;
  preimage?: string;
  error?: string;
}

/**
 * Creates a Lightning BOLT-11 deposit invoice via Ye₿ente backend
 * to accept sats from Wallet of Satoshi or any Lightning wallet.
 */
export async function createDepositInvoice(
  satsAmount: number,
  memo?: string
): Promise<DepositInvoiceResponse> {
  try {
    const res = await fetch('/api/yebente/lightning/create-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        satsAmount,
        memo: memo || 'Ye₿ente Sats Deposit',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        configured: data.configured,
        error: data.error || 'Failed to create Lightning invoice.',
      };
    }

    return {
      success: true,
      configured: true,
      invoice: data.invoice,
      paymentHash: data.paymentHash,
      satsAmount: data.satsAmount,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error creating invoice.';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Polls the payment status of an active Lightning invoice.
 */
export async function checkInvoiceStatus(
  paymentHash: string
): Promise<InvoiceStatusResponse> {
  try {
    const res = await fetch(`/api/yebente/lightning/invoice-status/${encodeURIComponent(paymentHash)}`);
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        settled: false,
        paid: false,
        error: data.error || 'Failed to query invoice status.',
      };
    }

    return {
      success: true,
      settled: Boolean(data.settled || data.paid),
      paid: Boolean(data.settled || data.paid),
      satsAmount: data.satsAmount,
      preimage: data.preimage,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error checking invoice.';
    return {
      success: false,
      settled: false,
      paid: false,
      error: message,
    };
  }
}


/**
 * Pays a BOLT-11 invoice from the user's own wallet through WebLN (a browser
 * wallet such as Alby). Nothing is paid by any server: the user's wallet asks
 * them to approve. Returns paid: false when no WebLN wallet is present.
 */
export async function payInvoiceWithWebLN(
  invoice: string
): Promise<{ paid: boolean; preimage?: string; error?: string }> {
  const anyWindow = window as unknown as {
    webln?: { enable: () => Promise<void>; sendPayment: (pr: string) => Promise<{ preimage?: string }> };
  };
  if (!anyWindow.webln) return { paid: false };
  try {
    await anyWindow.webln.enable();
    const res = await anyWindow.webln.sendPayment(invoice);
    return { paid: Boolean(res && res.preimage), preimage: res?.preimage };
  } catch (err: unknown) {
    return { paid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
