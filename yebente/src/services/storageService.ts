import { Transaction, UserWallet } from '../types';

// What this phone keeps: which wallet the app shows, and, for the person's own
// Lightning wallet (not the Ye₿ente wallet, whose balance and history come from
// the server), a log of the payments made in this app.
const WALLET_STORAGE_KEY = 'altradits_user_wallet_v1';
const TXS_STORAGE_KEY = 'altradits_transactions_v1';

const DEFAULT_WALLET: UserWallet = {
  isConnected: true,
  type: 'custodial',
  satsBalance: 0,
  btcBalance: 0,
  nonCustodialAddress: '',
  blinkUsername: '',
  blinkAddress: '',
};

const DISCONNECTED_WALLET: UserWallet = { ...DEFAULT_WALLET, isConnected: false, type: 'non-custodial' };

// Older versions saved stand-in addresses: blink@blink.sv (someone else's Blink
// account) and two sample on-chain addresses. They are never shown or used.
const STAND_INS = new Set(['blink@blink.sv', 'bc1q9x38n7c4g2lpxym56d2t8k0l09a2q8u9478f7e', 'bc1q78p9k6e0r3g52al5vxwtu402r8k8y44a7q39d2']);
const real = (a?: string) => (a && !STAND_INS.has(a.trim().toLowerCase()) ? a : '');

const satsIn = (t: Transaction) => Number(t.toCurrency === 'SATS' ? t.toAmount : t.fromCurrency === 'SATS' ? t.fromAmount : 0) || 0;
const satsOut = (t: Transaction) =>
  (Number(t.fromCurrency === 'SATS' ? t.fromAmount : 0) || 0) + (Number(t.realFeeSats ?? (t.feeCurrency === 'SATS' ? t.fee : 0)) || 0);

// The person's own wallet: what this app's log says came in and went out.
export function logBalance(txs: Transaction[]): number {
  let n = 0;
  for (const t of txs) {
    if (t.status !== 'completed') continue;
    if (t.type === 'receive_btc' || t.type === 'buy_btc') n += satsIn(t);
    else if (t.type === 'send_btc' || t.type === 'send_mpesa') n -= satsOut(t);
  }
  return Math.max(0, n);
}

export function getStoredTransactions(): Transaction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TXS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    // Only payments that happened: older versions also saved "queued offline"
    // payments that were never sent.
    const kept = parsed.filter((t) => t && typeof t === 'object' && !t.isOffline && t.status === 'completed'
      && typeof t.referenceNumber === 'string' && t.referenceNumber.trim() && typeof t.timestamp === 'number');
    if (kept.length !== parsed.length) saveStoredTransactions(kept);
    return kept;
  } catch {
    return [];
  }
}

export function saveStoredTransactions(txs: Transaction[]): void {
  try {
    localStorage.setItem(TXS_STORAGE_KEY, JSON.stringify(txs));
  } catch {
    // private mode: nothing kept
  }
}

export function getStoredWallet(): UserWallet {
  try {
    const parsed = JSON.parse(localStorage.getItem(WALLET_STORAGE_KEY) || 'null');
    if (!parsed) return { ...DEFAULT_WALLET };
    if (parsed.isConnected === false) return { ...DISCONNECTED_WALLET };
    const own = parsed.type === 'non-custodial';
    const logged = own ? logBalance(getStoredTransactions()) : 0;
    // The Ye₿ente wallet starts at 0 here and is filled in by the server.
    const sats = own && parsed.onChainVerified && typeof parsed.satsBalance === 'number' ? Math.max(logged, parsed.satsBalance) : logged;
    return {
      ...DEFAULT_WALLET,
      ...parsed,
      isConnected: true,
      nonCustodialAddress: real(parsed.nonCustodialAddress),
      blinkUsername: parsed.blinkUsername === 'blink' ? '' : parsed.blinkUsername || '',
      blinkAddress: real(parsed.blinkAddress),
      satsBalance: sats,
      btcBalance: sats / 100_000_000,
    };
  } catch {
    return { ...DEFAULT_WALLET };
  }
}

export function saveStoredWallet(wallet: UserWallet): void {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // private mode: nothing kept
  }
}

export function ejectWallet(): UserWallet {
  saveStoredWallet(DISCONNECTED_WALLET);
  return { ...DISCONNECTED_WALLET };
}

export function wipeWallet(): UserWallet {
  try {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    localStorage.removeItem(TXS_STORAGE_KEY);
  } catch {
    // private mode: nothing kept
  }
  return { ...DISCONNECTED_WALLET };
}

// A payment made from the person's own wallet, added to this app's log.
export function addTransaction(
  newTx: Omit<Transaction, 'id' | 'timestamp'>,
  currentWallet: UserWallet
): { updatedWallet: UserWallet; updatedTransactions: Transaction[] } {
  const fullTx: Transaction = {
    ...newTx,
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    status: newTx.status || 'completed',
  };
  const updatedTransactions = [fullTx, ...getStoredTransactions()];
  saveStoredTransactions(updatedTransactions);

  const updatedWallet: UserWallet = { ...currentWallet };
  if (updatedWallet.type === 'non-custodial') {
    const logged = logBalance(updatedTransactions);
    let sats = updatedWallet.satsBalance || 0;
    if (fullTx.status === 'completed') sats = fullTx.type === 'receive_btc' || fullTx.type === 'buy_btc' ? sats + satsIn(fullTx) : Math.max(0, sats - satsOut(fullTx));
    updatedWallet.satsBalance = updatedWallet.onChainVerified ? Math.max(sats, logged) : logged;
    updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
  }
  saveStoredWallet(updatedWallet);
  return { updatedWallet, updatedTransactions };
}
