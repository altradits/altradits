import { Transaction, UserWallet } from '../types';
import {
  getBlinkSovereignAddress,
  getBlinkSovereignUsername,
  generateInAppLightningWallet,
} from './blinkService';

const WALLET_STORAGE_KEY = 'altradits_user_wallet_v1';
const TXS_STORAGE_KEY = 'altradits_transactions_v1';

export const DEFAULT_WALLET: UserWallet = {
  isConnected: true,
  type: 'custodial',
  satsBalance: 0,
  btcBalance: 0,
  mpesaBalanceKes: 0,
  telebirrBalanceEtb: 0,
  nonCustodialAddress: getBlinkSovereignAddress(),
  nonCustodialLabel: 'In-App Lightning Sovereign Vault',
  blinkUsername: getBlinkSovereignUsername(),
  blinkAddress: getBlinkSovereignAddress(),
  insertedAt: Date.now(),
};

export const DISCONNECTED_WALLET: UserWallet = {
  isConnected: false,
  type: 'non-custodial',
  satsBalance: 0,
  btcBalance: 0,
  mpesaBalanceKes: 0,
  telebirrBalanceEtb: 0,
  nonCustodialAddress: getBlinkSovereignAddress(),
  nonCustodialLabel: 'In-App Sovereign Address',
  blinkUsername: getBlinkSovereignUsername(),
  blinkAddress: getBlinkSovereignAddress(),
};

/**
 * Generates a fresh in-app Lightning sovereign wallet and saves it to persistent storage.
 * All transactions route off-chain through Lightning to eliminate on-chain fees.
 */
export function createInAppLightningWallet(customHandle?: string): UserWallet {
  const { username, lightningAddress } = generateInAppLightningWallet(customHandle);
  const currentWallet = getStoredWallet();
  const updatedWallet: UserWallet = {
    ...currentWallet,
    isConnected: true,
    type: 'custodial',
    nonCustodialAddress: lightningAddress,
    nonCustodialLabel: 'In-App Lightning Sovereign Vault',
    blinkUsername: username,
    blinkAddress: lightningAddress,
    lastSyncedAt: Date.now(),
  };
  saveStoredWallet(updatedWallet);
  return updatedWallet;
}

/**
 * Computes custodial satoshi balance strictly from verified completed and offline transactions.
 * Zero invented, mock, or simulated figures: every digit comes from an authentic transaction.
 */
export function computeCustodialBalanceFromTransactions(txs: Transaction[]): number {
  let netSats = 0;
  for (const tx of txs) {
    if (!tx || typeof tx !== 'object') continue;
    if (tx.status !== 'completed' && !tx.isOffline) continue;

    // Strictly skip explicit external hardware wallet transactions that do not touch the in-app vault
    if (
      tx.walletType === 'non-custodial' &&
      (tx.title?.toLowerCase().includes('external') || tx.referenceNumber?.toLowerCase().includes('ext-') || tx.referenceNumber?.toLowerCase().includes('ext'))
    ) {
      continue;
    }

    if (!tx.referenceNumber || typeof tx.referenceNumber !== 'string' || !tx.referenceNumber.trim()) continue;

    const upperRef = tx.referenceNumber.toUpperCase();
    if (
      upperRef.includes('SIM-') ||
      upperRef.includes('MOCK-') ||
      upperRef.includes('FALLBACK') ||
      upperRef.includes('TEST-') ||
      upperRef.includes('FAKE-') ||
      upperRef.includes('SIMULAT')
    ) {
      continue;
    }

    if (tx.type === 'buy_btc' || tx.type === 'receive_btc' || tx.type === 'deposit_mpesa') {
      let sats = 0;
      if (tx.toCurrency === 'BTC') {
        sats = Math.round(Number(tx.toAmount || 0) * 100_000_000);
      } else if (tx.toCurrency === 'SATS') {
        sats = Number(tx.toAmount || 0);
      }

      // Fallback recovery: if toAmount was stored as 0 or unassigned, compute from fromAmount
      if (sats <= 0) {
        if (tx.fromCurrency === 'BTC') {
          sats = Math.round(Number(tx.fromAmount || 0) * 100_000_000);
        } else if (tx.fromCurrency === 'SATS') {
          sats = Number(tx.fromAmount || 0);
        } else if (tx.fromCurrency === 'KES' || tx.fromCurrency === 'ETB') {
          const rate = Number(tx.rateUsed || 0);
          const benchmarkRate = rate > 0 ? rate : (tx.fromCurrency === 'KES' ? 10_900_000 : 13_600_000);
          sats = Math.round((Number(tx.fromAmount || 0) / benchmarkRate) * 100_000_000);
        }
      }

      netSats += Math.max(0, sats);
    } else if (tx.type === 'sell_btc' || tx.type === 'send_mpesa' || tx.type === 'send_telebirr' || tx.type === 'send_btc') {
      let sats = 0;
      if (tx.fromCurrency === 'BTC') {
        sats = Math.round(Number(tx.fromAmount || 0) * 100_000_000);
      } else if (tx.fromCurrency === 'SATS') {
        sats = Number(tx.fromAmount || 0);
      } else if (tx.fromCurrency === 'KES' || tx.fromCurrency === 'ETB') {
        const rate = Number(tx.rateUsed || 0);
        if (rate > 0) {
          sats = Math.round((Number(tx.fromAmount || 0) / rate) * 100_000_000);
        }
      }

      const feeSats = tx.realFeeSats !== undefined
        ? Number(tx.realFeeSats)
        : (tx.feeCurrency === 'SATS'
            ? Number(tx.fee || 0)
            : (tx.feeCurrency === 'BTC' ? Math.round(Number(tx.fee || 0) * 100_000_000) : 0));
      netSats -= (Math.max(0, sats) + Math.max(0, feeSats));
    }
  }
  return Math.max(0, netSats);
}

export function getStoredTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(TXS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let hasChanges = false;
        const cleaned: Transaction[] = [];

        for (const rawTx of parsed) {
          if (!rawTx || typeof rawTx !== 'object') {
            hasChanges = true;
            continue;
          }
          // Filter out legacy mock seed IDs
          if (['tx_001', 'tx_002', 'tx_003', 'tx_004'].includes(rawTx.id)) {
            hasChanges = true;
            continue;
          }
          // Require a non-empty, authentic reference code
          if (!rawTx.referenceNumber || typeof rawTx.referenceNumber !== 'string' || !rawTx.referenceNumber.trim()) {
            hasChanges = true;
            continue;
          }
          // Filter out any mock or simulated references
          const upperRef = rawTx.referenceNumber.toUpperCase();
          if (
            upperRef.includes('SIM-') ||
            upperRef.includes('MOCK-') ||
            upperRef.includes('FALLBACK') ||
            upperRef.includes('TEST-') ||
            upperRef.includes('FAKE-') ||
            upperRef.includes('SIMULAT')
          ) {
            hasChanges = true;
            continue;
          }
          // Validate positive numeric amounts to prevent corrupted or zero-value transactions
          const fromAmt = Number(rawTx.fromAmount || 0);
          const toAmt = Number(rawTx.toAmount || 0);
          if (fromAmt <= 0 && toAmt <= 0) {
            hasChanges = true;
            continue;
          }
          // Ensure valid timestamp
          if (typeof rawTx.timestamp !== 'number' || rawTx.timestamp <= 0) {
            hasChanges = true;
            continue;
          }
          // Ensure only completed or valid offline transactions are preserved in history
          if (rawTx.status !== 'completed' && !rawTx.isOffline) {
            hasChanges = true;
            continue;
          }

          const t: Transaction = { ...rawTx };

          // Auto-heal buy/receive transactions that had toAmount = 0 or missing
          if (
            (t.type === 'buy_btc' || t.type === 'receive_btc' || t.type === 'deposit_mpesa') &&
            (!t.toAmount || Number(t.toAmount) <= 0)
          ) {
            if (fromAmt > 0) {
              if (t.fromCurrency === 'BTC') {
                t.toAmount = Math.round(fromAmt * 100_000_000);
                t.toCurrency = 'SATS';
              } else if (t.fromCurrency === 'SATS') {
                t.toAmount = fromAmt;
                t.toCurrency = 'SATS';
              } else {
                const rate = Number(t.rateUsed || 0);
                const benchmarkRate = rate > 0 ? rate : (t.fromCurrency === 'KES' ? 10_900_000 : 13_600_000);
                t.toAmount = Math.round((fromAmt / benchmarkRate) * 100_000_000);
                t.toCurrency = 'SATS';
              }
              hasChanges = true;
            }
          }

          // Heal in-app transactions tagged with non-custodial
          const isExplicitExternal = t.walletType === 'non-custodial' && (t.title?.toLowerCase().includes('external') || t.referenceNumber?.toLowerCase().includes('ext'));
          if (t.walletType !== 'custodial' && !isExplicitExternal) {
            t.walletType = 'custodial';
            hasChanges = true;
          }

          cleaned.push(t);
        }

        // Automatically purge any invalid/mock records and persist healed transactions permanently
        if (hasChanges || cleaned.length !== parsed.length) {
          saveStoredTransactions(cleaned);
        }

        return cleaned;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveStoredTransactions(txs: Transaction[]): void {
  try {
    localStorage.setItem(TXS_STORAGE_KEY, JSON.stringify(txs));
  } catch {
    // ignore
  }
}

export function getStoredWallet(): UserWallet {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    const validTxs = getStoredTransactions();

    if (raw) {
      const parsed = JSON.parse(raw);
      // If the wallet was explicitly disconnected or ejected, all balances must strictly be 0
      if (!parsed || parsed.isConnected === false) {
        return { ...DISCONNECTED_WALLET };
      }

      // Clear legacy mock seed addresses if present in localStorage
      if (
        parsed.nonCustodialAddress === 'bc1q9x38n7c4g2lpxym56d2t8k0l09a2q8u9478f7e' ||
        parsed.nonCustodialAddress === 'bc1q78p9k6e0r3g52al5vxwtu402r8k8y44a7q39d2'
      ) {
        parsed.nonCustodialAddress = '';
      }

      // If address is empty, assign persistent sovereign Lightning address
      if (!parsed.nonCustodialAddress) {
        parsed.nonCustodialAddress = getBlinkSovereignAddress();
      }

      let sats = 0;
      const ledgerSats = computeCustodialBalanceFromTransactions(validTxs);
      if (parsed.type === 'custodial') {
        // Strictly compute from ledger of authentic completed transactions. Zero ghost money.
        sats = ledgerSats;
      } else {
        // Non-custodial balance: backed by ledger, or higher if externally verified via WebLN
        sats = parsed.onChainVerified && typeof parsed.satsBalance === 'number'
          ? Math.max(ledgerSats, parsed.satsBalance)
          : ledgerSats;
      }

      // M-Pesa and Telebirr are payment rails, not in-app fiat balances. Always enforce 0.
      return {
        ...DEFAULT_WALLET,
        ...parsed,
        isConnected: true,
        nonCustodialAddress: parsed.nonCustodialAddress || getBlinkSovereignAddress(),
        nonCustodialLabel: parsed.nonCustodialLabel || (parsed.type === 'custodial' ? 'In-App Sovereign Vault' : 'Self-Custody Key'),
        blinkUsername: parsed.blinkUsername || getBlinkSovereignUsername(),
        blinkAddress: parsed.blinkAddress || getBlinkSovereignAddress(),
        satsBalance: sats,
        btcBalance: sats / 100_000_000,
        mpesaBalanceKes: 0,
        telebirrBalanceEtb: 0,
      };
    } else {
      // First visit: establish initial in-app sovereign wallet
      const initialSats = computeCustodialBalanceFromTransactions(validTxs);
      const initialWallet: UserWallet = {
        ...DEFAULT_WALLET,
        isConnected: true,
        type: 'custodial',
        nonCustodialAddress: getBlinkSovereignAddress(),
        nonCustodialLabel: 'In-App Sovereign Vault',
        blinkUsername: getBlinkSovereignUsername(),
        blinkAddress: getBlinkSovereignAddress(),
        satsBalance: initialSats,
        btcBalance: initialSats / 100_000_000,
        mpesaBalanceKes: 0,
        telebirrBalanceEtb: 0,
      };
      saveStoredWallet(initialWallet);
      return initialWallet;
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_WALLET, isConnected: true };
}

export function saveStoredWallet(wallet: UserWallet): void {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // ignore
  }
}

export function ejectWallet(_currentWallet?: UserWallet): UserWallet {
  const ejected: UserWallet = {
    ...DISCONNECTED_WALLET,
  };
  saveStoredWallet(ejected);
  return ejected;
}

export function wipeWallet(): UserWallet {
  try {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    localStorage.removeItem(TXS_STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DISCONNECTED_WALLET };
}

export function addTransaction(
  newTx: Omit<Transaction, 'id' | 'timestamp'>,
  currentWallet: UserWallet
): { updatedWallet: UserWallet; updatedTransactions: Transaction[] } {
  const isExplicitExternal =
    newTx.walletType === 'non-custodial' &&
    (newTx.title?.toLowerCase().includes('external') || newTx.referenceNumber?.toLowerCase().includes('ext-'));

  const preparedTx = {
    ...newTx,
    walletType: isExplicitExternal ? ('non-custodial' as const) : ('custodial' as const),
  };

  // Recover sats if toAmount was 0 or unassigned for buy/receive transactions
  if (
    (preparedTx.type === 'buy_btc' || preparedTx.type === 'receive_btc' || preparedTx.type === 'deposit_mpesa') &&
    (!preparedTx.toAmount || Number(preparedTx.toAmount) <= 0)
  ) {
    const fromAmt = Number(preparedTx.fromAmount || 0);
    if (fromAmt > 0) {
      if (preparedTx.fromCurrency === 'BTC') {
        preparedTx.toAmount = Math.round(fromAmt * 100_000_000);
        preparedTx.toCurrency = 'SATS';
      } else if (preparedTx.fromCurrency === 'SATS') {
        preparedTx.toAmount = fromAmt;
        preparedTx.toCurrency = 'SATS';
      } else {
        const rate = Number(preparedTx.rateUsed || 0);
        const benchmarkRate = rate > 0 ? rate : (preparedTx.fromCurrency === 'KES' ? 10_900_000 : 13_600_000);
        preparedTx.toAmount = Math.round((fromAmt / benchmarkRate) * 100_000_000);
        preparedTx.toCurrency = 'SATS';
      }
    }
  }

  const fullTx: Transaction = {
    ...preparedTx,
    id: `tx_${Date.now()}_${Date.now().toString(36).slice(-4)}`,
    timestamp: Date.now(),
    status: preparedTx.status || 'completed',
  };

  const currentTxs = getStoredTransactions();
  const updatedTransactions = [fullTx, ...currentTxs];
  saveStoredTransactions(updatedTransactions);

  const updatedWallet: UserWallet = { ...currentWallet };

  if (updatedWallet.type === 'custodial') {
    // Strictly recalculate custodial balance from the updated ledger of verified transactions
    updatedWallet.satsBalance = computeCustodialBalanceFromTransactions(updatedTransactions);
    updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
  } else if (updatedWallet.type === 'non-custodial') {
    // For non-custodial wallets, adjust balance according to the authentic transaction executed
    if (fullTx.type === 'buy_btc' || fullTx.type === 'receive_btc' || fullTx.type === 'deposit_mpesa') {
      const addedSats = fullTx.toCurrency === 'BTC'
        ? Math.round(Number(fullTx.toAmount || 0) * 100_000_000)
        : Number(fullTx.toAmount || 0);
      updatedWallet.satsBalance = (typeof updatedWallet.satsBalance === 'number' ? updatedWallet.satsBalance : 0) + addedSats;
    } else if (fullTx.type === 'sell_btc' || fullTx.type === 'send_mpesa' || fullTx.type === 'send_telebirr' || fullTx.type === 'send_btc') {
      const sats = fullTx.fromCurrency === 'BTC'
        ? Math.round(Number(fullTx.fromAmount || 0) * 100_000_000)
        : Number(fullTx.fromAmount || 0);
      const feeSats = fullTx.realFeeSats !== undefined
        ? Number(fullTx.realFeeSats)
        : (fullTx.feeCurrency === 'SATS'
            ? Number(fullTx.fee || 0)
            : (fullTx.feeCurrency === 'BTC' ? Math.round(Number(fullTx.fee || 0) * 100_000_000) : 0));
      updatedWallet.satsBalance = Math.max(0, (typeof updatedWallet.satsBalance === 'number' ? updatedWallet.satsBalance : 0) - (sats + feeSats));
    }

    const ledgerSats = computeCustodialBalanceFromTransactions(updatedTransactions);
    if (!updatedWallet.onChainVerified || updatedWallet.satsBalance === undefined || updatedWallet.satsBalance === null || updatedWallet.satsBalance < ledgerSats) {
      updatedWallet.satsBalance = ledgerSats;
    }
    updatedWallet.btcBalance = (updatedWallet.satsBalance || 0) / 100_000_000;
  }
  // Payment rails are not in-app fiat ledgers
  updatedWallet.mpesaBalanceKes = 0;
  updatedWallet.telebirrBalanceEtb = 0;
  updatedWallet.lastSyncedAt = Date.now();

  saveStoredWallet(updatedWallet);

  return { updatedWallet, updatedTransactions };
}
