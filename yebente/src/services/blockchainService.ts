import { isLightningAddress, resolveLightningAddress } from './lightningService';

export interface AddressBalanceResult {
  sats: number;
  btc: number;
  confirmedSats: number;
  unconfirmedSats: number;
  txCount: number;
  success: boolean;
  isLightning?: boolean;
  lightningProvider?: string;
  lightningAddress?: string;
  minSendableSats?: number;
  maxSendableSats?: number;
  callbackUrl?: string;
  error?: string;
}

/**
 * Strips URI schemes (lightning:, bitcoin:) and query parameters (?amount=...)
 */
export function sanitizeBitcoinAddress(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^(lightning|bitcoin):/i, '');
  if (clean.includes('?')) {
    clean = clean.split('?')[0];
  }
  return clean.trim();
}

/**
 * Validates Lightning Address (user@domain) or LNURL format.
 * On-chain Bitcoin addresses are rejected to enforce 100% off-chain Lightning transactions.
 */
export function isValidBitcoinAddress(address: string): boolean {
  const clean = sanitizeBitcoinAddress(address);
  if (!clean) return false;
  return isLightningAddress(clean);
}

/**
 * Resolves Lightning wallets and balances.
 * All on-chain L1 wallets have been removed to eliminate on-chain miner fees.
 */
export async function fetchBitcoinAddressBalance(
  address: string
): Promise<AddressBalanceResult> {
  const clean = sanitizeBitcoinAddress(address);
  if (!clean) {
    return {
      sats: 0,
      btc: 0,
      confirmedSats: 0,
      unconfirmedSats: 0,
      txCount: 0,
      success: false,
      error: 'Empty address',
    };
  }

  // Layer 2 Lightning Address verification (e.g. user@walletofsatoshi.com or user@blink.sv)
  if (isLightningAddress(clean)) {
    const lnDetails = await resolveLightningAddress(clean);
    if (!lnDetails.success) {
      return {
        sats: 0,
        btc: 0,
        confirmedSats: 0,
        unconfirmedSats: 0,
        txCount: 0,
        success: false,
        error: lnDetails.error || 'Failed to resolve Lightning Address.',
      };
    }
    return {
      sats: 0,
      btc: 0,
      confirmedSats: 0,
      unconfirmedSats: 0,
      txCount: 0,
      success: true,
      isLightning: true,
      lightningProvider: lnDetails.provider,
      lightningAddress: lnDetails.address,
      minSendableSats: lnDetails.minSendableSats,
      maxSendableSats: lnDetails.maxSendableSats,
      callbackUrl: lnDetails.callbackUrl,
    };
  }

  // Reject on-chain L1 addresses
  const btcRegex = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i;
  if (btcRegex.test(clean)) {
    return {
      sats: 0,
      btc: 0,
      confirmedSats: 0,
      unconfirmedSats: 0,
      txCount: 0,
      success: false,
      error: 'On-chain Bitcoin wallets have been removed. Only Lightning wallet integrations are supported.',
    };
  }

  return {
    sats: 0,
    btc: 0,
    confirmedSats: 0,
    unconfirmedSats: 0,
    txCount: 0,
    success: false,
    error: 'Invalid Lightning Address format. Example: user@walletofsatoshi.com',
  };
}
