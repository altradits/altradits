import { getWalletToken } from './altraditsWallet';
export interface LightningAddressDetails {
  success: boolean;
  address: string;
  username: string;
  domain: string;
  provider: string;
  minSendableSats: number;
  maxSendableSats: number;
  commentAllowed: number;
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

import { formatKenyanPhone, isValidKenyanPhone } from './mpesaService';

/**
 * Checks if input is a valid Lightning Address (user@domain.com), encoded LNURL (lnurl1...),
 * or a Kenyan phone number (which functions natively as a Tando Lightning address: <phone>@bitcoin.co.ke).
 */
export function isLightningAddress(input: string): boolean {
  const clean = input.trim().toLowerCase().replace(/^lightning:/i, '');
  if (clean.startsWith('lnurl1')) {
    return true;
  }
  if (isValidKenyanPhone(clean)) {
    return true;
  }
  const lightningRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
  return lightningRegex.test(clean);
}

/**
 * Friendly provider name for a Lightning-address domain. Exact domains only:
 * a substring match would also rename blink.sv.evil.com (and CodeQL refuses
 * substring checks on hosts). Anything else shows as itself.
 */
const PROVIDERS: Record<string, string> = {
  'walletofsatoshi.com': 'Wallet of Satoshi',
  'blink.sv': 'Blink (Galoy)',
  'bitcoin.co.ke': 'Tando (M-Pesa)',
  'getalby.com': 'Alby',
  'strike.me': 'Strike',
  'coinos.io': 'CoinOS',
};
function providerFor(domain: string): string {
  return PROVIDERS[domain.toLowerCase()] || domain;
}

/**
 * Resolves a Lightning Address (such as user@walletofsatoshi.com, user@blink.sv, or phone@bitcoin.co.ke)
 * via the LNURL-pay protocol (RFC-LNURL) to verify the wallet is authentic and active.
 * The lookup runs on our server, so this page never calls outside hosts itself.
 */
export async function resolveLightningAddress(
  address: string
): Promise<LightningAddressDetails> {
  let clean = address.trim().toLowerCase().replace(/^lightning:/i, '');

  // If a Kenyan phone number is entered, normalize to Tando Lightning address
  if (isValidKenyanPhone(clean)) {
    clean = `${formatKenyanPhone(clean)}@bitcoin.co.ke`;
  }

  let defaultUsername = '';
  let defaultDomain = '';

  if (clean.startsWith('lnurl1')) {
    const decoded = decodeLnurl(clean);
    try {
      const parsed = new URL(decoded || '');
      defaultDomain = parsed.hostname;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      defaultUsername = pathParts[pathParts.length - 1] || 'user';
    } catch {
      defaultDomain = 'lightning';
      defaultUsername = 'user';
    }
  } else {
    const [username, domain] = clean.split('@');
    defaultUsername = username || '';
    defaultDomain = domain || '';
  }

  const fail = (error: string): LightningAddressDetails => ({
    success: false,
    address: clean,
    username: defaultUsername,
    domain: defaultDomain,
    provider: defaultDomain || 'Unknown',
    minSendableSats: 0,
    maxSendableSats: 0,
    commentAllowed: 0,
    error,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const token = getWalletToken();

    const res = await fetch('/api/yebente/address/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to: clean }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      return fail(data.error || `Could not reach Lightning wallet at ${defaultDomain}.`);
    }

    const domain = typeof data.domain === 'string' && data.domain ? data.domain : defaultDomain;
    return {
      success: true,
      address: typeof data.address === 'string' && data.address ? data.address : clean,
      username: typeof data.username === 'string' && data.username ? data.username : defaultUsername,
      domain,
      provider: providerFor(domain),
      minSendableSats: Number(data.minSendableSats) || 0,
      maxSendableSats: Number(data.maxSendableSats) || 0,
      commentAllowed: Number(data.commentAllowed) || 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return fail(`Network error connecting to ${defaultDomain}: ${message}`);
  }
}

/**
 * Creates an authentic BOLT-11 Lightning invoice for a Lightning address via
 * our server, which asks the address's own LNURL callback.
 */
export async function createLightningInvoice(
  to: string,
  satsAmount: number,
  comment?: string
): Promise<{ success: boolean; invoice?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const token = getWalletToken();

    const res = await fetch('/api/yebente/address/invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to, sats: satsAmount, comment }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !data.invoice) {
      return {
        success: false,
        error: data.error || 'Failed to generate BOLT-11 Lightning invoice from wallet.',
      };
    }

    return {
      success: true,
      invoice: data.invoice,
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
    // The Altradits wallet: an invoice on the node for this wallet.
    const token = getWalletToken();
    const res = token
      ? await fetch('/api/yebente/wallet/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sats: satsAmount }),
        })
      : await fetch('/api/yebente/lightning/create-invoice', {
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
    const token = getWalletToken();
    const res = token
      ? await fetch(`/api/yebente/wallet/invoice/${encodeURIComponent(paymentHash)}`, { headers: { Authorization: `Bearer ${token}` } })
      : await fetch(`/api/yebente/lightning/invoice-status/${encodeURIComponent(paymentHash)}`);
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
