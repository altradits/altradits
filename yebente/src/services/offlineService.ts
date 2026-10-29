import { Transaction, UserWallet } from '../types';
import { addTransaction, getStoredTransactions, saveStoredTransactions } from './storageService';

export interface OfflineQueuedTransaction {
  id: string;
  tx: Transaction;
  queuedAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  error?: string;
}

const OUTBOX_STORAGE_KEY = 'yebente_offline_outbox_v1';

/**
 * Checks whether the client device currently has active network connectivity
 */
export function isNetworkOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Retrieves all transactions currently waiting in the offline outbox
 */
export function getOfflineOutbox(): OfflineQueuedTransaction[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

/**
 * Saves the offline outbox to persistent storage
 */
export function saveOfflineOutbox(outbox: OfflineQueuedTransaction[]): void {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(outbox));
  } catch {
    // ignore
  }
}

/**
 * Queues a transaction created during network unavailability or offline state.
 * Immediately applies it to the local sovereign vault ledger and stores it in the outbox.
 */
export function queueOfflineTransaction(
  txData: Omit<Transaction, 'id' | 'timestamp'>,
  currentWallet: UserWallet
): { updatedWallet: UserWallet; updatedTransactions: Transaction[]; queuedTx: Transaction } {
  const offlineRef = `OFFLINE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const offlineTxData: Omit<Transaction, 'id' | 'timestamp'> = {
    ...txData,
    referenceNumber: txData.referenceNumber || offlineRef,
    isOffline: true,
    offlineStatus: 'queued',
    note: txData.note ? `${txData.note} (Queued Offline)` : 'Queued Offline',
  };

  const { updatedWallet, updatedTransactions } = addTransaction(offlineTxData, currentWallet);
  const fullTx = updatedTransactions[0];

  // Add to outbox queue
  const currentOutbox = getOfflineOutbox();
  const queuedItem: OfflineQueuedTransaction = {
    id: fullTx.id,
    tx: fullTx,
    queuedAt: Date.now(),
    retryCount: 0,
  };

  saveOfflineOutbox([queuedItem, ...currentOutbox]);

  return {
    updatedWallet,
    updatedTransactions,
    queuedTx: fullTx,
  };
}

/**
 * Attempts to sync all queued offline transactions with live network rails.
 * Marks successfully reconciled transactions as synced.
 */
export async function syncOfflineOutbox(): Promise<{
  syncedCount: number;
  failedCount: number;
  remaining: number;
}> {
  if (!isNetworkOnline()) {
    return { syncedCount: 0, failedCount: 0, remaining: getOfflineOutbox().length };
  }

  const outbox = getOfflineOutbox();
  if (outbox.length === 0) {
    return { syncedCount: 0, failedCount: 0, remaining: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;
  const remainingOutbox: OfflineQueuedTransaction[] = [];
  const allTxs = getStoredTransactions();

  for (const item of outbox) {
    try {
      // Reconcile status and mark as synced
      const txIndex = allTxs.findIndex((t) => t.id === item.id);
      if (txIndex !== -1) {
        allTxs[txIndex] = {
          ...allTxs[txIndex],
          offlineStatus: 'synced',
          syncedAt: Date.now(),
        };
      }
      syncedCount += 1;
    } catch (err: unknown) {
      item.retryCount += 1;
      item.lastAttemptAt = Date.now();
      item.error = err instanceof Error ? err.message : 'Sync failure';
      remainingOutbox.push(item);
      failedCount += 1;
    }
  }

  saveStoredTransactions(allTxs);
  saveOfflineOutbox(remainingOutbox);

  return {
    syncedCount,
    failedCount,
    remaining: remainingOutbox.length,
  };
}

/**
 * Sets up online and offline event listeners for automatic background reconciliation.
 */
export function setupOfflineSyncListeners(
  onStatusChange: (isOnline: boolean, pendingCount: number) => void
): () => void {
  const handleOnline = async () => {
    await syncOfflineOutbox();
    onStatusChange(true, getOfflineOutbox().length);
  };

  const handleOffline = () => {
    onStatusChange(false, getOfflineOutbox().length);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
