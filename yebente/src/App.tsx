import { useState, useEffect, useCallback } from 'react';
import { UserWallet, ExchangeRates, Transaction } from './types';
import { fetchLiveRates, getCachedRates } from './services/ratesService';
import {
  getStoredWallet,
  saveStoredWallet,
  getStoredTransactions,
  addTransaction,
  ejectWallet,
  wipeWallet,
} from './services/storageService';
import {
  isNetworkOnline,
  getOfflineOutbox,
  syncOfflineOutbox,
  setupOfflineSyncListeners,
} from './services/offlineService';
import { TopBar } from './components/TopBar';
import { forgetBiometric } from './services/biometric';
import { BalanceCard } from './components/BalanceCard';
import { ActionGrid } from './components/ActionGrid';
import { TransactionHistory } from './components/TransactionHistory';
import { BuyBtcModal } from './components/BuyBtcModal';
import { ReceiveBtcModal } from './components/ReceiveBtcModal';
import { SendBtcModal } from './components/SendBtcModal';
import { SendMpesaModal } from './components/SendMpesaModal';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { WalletSettingsModal } from './components/WalletSettingsModal';
import { hasServerWallet, fetchServerWallet, fetchServerHistory, forgetServerWallet } from './services/altraditsWallet';

export default function App() {
  const [wallet, setWallet] = useState<UserWallet>(getStoredWallet);
  const [transactions, setTransactions] = useState<Transaction[]>(getStoredTransactions);
  const [rates, setRates] = useState<ExchangeRates>(
    () =>
      getCachedRates() || {
        btcUsd: 0,
        btcKes: 0,
        btcEtb: 0,
        usdKes: 0,
        usdEtb: 0,
        change24hUsd: 0,
        change24hKes: 0,
        change24hEtb: 0,
        lastUpdated: 0,
        isLive: false,
      }
  );
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [isFrameMode, setIsFrameMode] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(isNetworkOnline);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() => getOfflineOutbox().length);

  // Modals
  const [activeModal, setActiveModal] = useState<
    'none' | 'buy_btc' | 'receive_btc' | 'send_btc' | 'send_mpesa' | 'wallet_settings'
  >('none');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Opened from a recovery email (/yebente?recover=...): Settings asks for a new PIN.
  const [recoveryToken, setRecoveryToken] = useState<string>(() => {
    try { return new URLSearchParams(window.location.search).get('recover') || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (!recoveryToken) return;
    // The link's token stays out of the address bar and history from here on.
    window.history.replaceState(null, '', window.location.pathname);
    setActiveModal('wallet_settings');
  }, [recoveryToken]);

  // Load live rates with Blink as primary engine
  const loadRates = useCallback(async () => {
    try {
      const data = await fetchLiveRates();
      setRates(data);
      setRatesError(null);
    } catch (err: unknown) {
      setRatesError(err instanceof Error ? err.message : 'Unable to reach Blink rate feed.');
    }
  }, []);

  useEffect(() => {
    loadRates();
    const interval = setInterval(loadRates, 30000);
    return () => clearInterval(interval);
  }, [loadRates]);

  // Privacy: whenever the app isn't in front (app switcher, notification shade,
  // screen-recording controls), PINs and the recovery phrase blur. A web page
  // can't tell that a recording is running, so this is the closest it can get.
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) root.dataset.private = '1';
      else delete root.dataset.private;
    };
    const events = ['visibilitychange', 'blur', 'focus', 'pagehide', 'pageshow'] as const;
    events.forEach((e) => (e === 'visibilitychange' ? document : window).addEventListener(e, update));
    return () => events.forEach((e) => (e === 'visibilitychange' ? document : window).removeEventListener(e, update));
  }, []);

  // The Altradits wallet: balance, address and history come from the server.
  const syncServerWallet = useCallback(async () => {
    if (!hasServerWallet()) return;
    try {
      const [w, txs] = await Promise.all([fetchServerWallet(), fetchServerHistory()]);
      if (!w.passkeys) forgetBiometric(); // turned off elsewhere, or reset by email recovery
      setWallet((cur) => ({
        ...cur,
        isConnected: true,
        type: 'custodial',
        satsBalance: w.balance,
        btcBalance: w.balance / 100_000_000,
        nonCustodialAddress: w.address,
        nonCustodialLabel: 'In-App Lightning Sovereign Vault',
        blinkUsername: w.handle,
        blinkAddress: w.address,
        recoveryEmail: w.email || (w.emailPending ? `${w.emailPending} (unconfirmed)` : ''),
        lastSyncedAt: Date.now(),
      }));
      setTransactions(txs);
    } catch {
      // Signed out (token revoked) or offline: keep what is on screen.
    }
  }, []);

  useEffect(() => {
    syncServerWallet();
    const interval = setInterval(syncServerWallet, 20000);
    return () => clearInterval(interval);
  }, [syncServerWallet]);

  // Set up automatic offline listeners and sync reconciliation
  useEffect(() => {
    const cleanup = setupOfflineSyncListeners((onlineStatus, count) => {
      setIsOnline(onlineStatus);
      setPendingOfflineCount(count);
      setTransactions(getStoredTransactions());
      setWallet(getStoredWallet());
    });
    return cleanup;
  }, []);

  const handleUpdateWallet = (updated: UserWallet) => {
    setWallet(updated);
    saveStoredWallet(updated);
  };

  const handleEjectWallet = () => {
    const ejected = ejectWallet(wallet);
    setWallet(ejected);
  };

  const handleWipeWallet = () => {
    forgetServerWallet();
    const wiped = wipeWallet();
    setWallet(wiped);
    setTransactions([]);
    setPendingOfflineCount(0);
  };

  const handleRequireWalletAction = (action: () => void) => {
    if (!wallet.isConnected) {
      setActiveModal('wallet_settings');
      return;
    }
    action();
  };

  const handleTransactionSuccess = (txData: Omit<Transaction, 'id' | 'timestamp'>) => {
    if (hasServerWallet()) {
      syncServerWallet();
      return;
    }
    const { updatedWallet, updatedTransactions } = addTransaction(txData, wallet);
    setWallet(updatedWallet);
    setTransactions(updatedTransactions);
    setPendingOfflineCount(getOfflineOutbox().length);
  };

  const handleManualSyncOffline = async () => {
    await syncOfflineOutbox();
    setPendingOfflineCount(getOfflineOutbox().length);
    setTransactions(getStoredTransactions());
    setWallet(getStoredWallet());
  };

  return (
    <div className="min-h-screen bg-[var(--yb-surface)] text-[var(--yb-on-surface)] flex flex-col items-center justify-start p-0 md:p-6 select-none font-sans">
      {/* Outer Mobile Frame container or full width */}
      <div
        className={`w-full ${
          isFrameMode
            ? 'max-w-[440px] md:my-4 md:border md:border-[var(--yb-outline-variant)] md:rounded-[40px] md:shadow-2xl md:shadow-black/90 md:overflow-hidden bg-[var(--yb-surface)] flex flex-col min-h-screen md:min-h-[860px]'
            : 'max-w-2xl bg-[var(--yb-surface)] flex flex-col min-h-screen'
        }`}
      >
        {/* Top Bar with brand yebente, offline badge, and settings */}
        <TopBar
          wallet={wallet}
          onOpenWalletSettings={() => setActiveModal('wallet_settings')}
          isFrameMode={isFrameMode}
          onToggleFrameMode={() => setIsFrameMode(!isFrameMode)}
          isOnline={isOnline}
          pendingOfflineCount={pendingOfflineCount}
          onSyncOffline={handleManualSyncOffline}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-6">
          {ratesError && rates.btcUsd === 0 && (
            <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs font-mono">
              <p className="font-semibold">Exchange Rates Offline</p>
              <p className="text-[11px] text-amber-400/90 mt-0.5">{ratesError}</p>
            </div>
          )}

          {/* 1. Main Balance Portfolio Card (visible whenever wallet is connected) */}
          {wallet.isConnected && (
            <BalanceCard
              wallet={wallet}
              rates={rates}
              onOpenWalletSettings={() => setActiveModal('wallet_settings')}
              onUpdateWallet={handleUpdateWallet}
            />
          )}

          {/* Core wallet and payment actions */}
          <ActionGrid
            onBuyBtc={() => setActiveModal(hasServerWallet() ? 'buy_btc' : 'wallet_settings')}
            onSendMpesa={() => handleRequireWalletAction(() => setActiveModal('send_mpesa'))}
            onReceiveBtc={() => handleRequireWalletAction(() => setActiveModal('receive_btc'))}
            onSendBtc={() => handleRequireWalletAction(() => setActiveModal('send_btc'))}
          />

          {/* 3. Secure Transaction History */}
          <TransactionHistory
            transactions={transactions}
            onSelectTransaction={(tx) => setSelectedTx(tx)}
          />
        </main>
      </div>

      {/* Modals. Each action starts fresh when opened (the key changes), so
          Done after a payment leaves nothing behind for the next one. */}
      <BuyBtcModal
        key={activeModal === 'buy_btc' ? 'buy_btc-open' : 'buy_btc'}
        isOpen={activeModal === 'buy_btc'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        rates={rates}
        onSuccess={handleTransactionSuccess}
      />

      <ReceiveBtcModal
        key={activeModal === 'receive_btc' ? 'receive_btc-open' : 'receive_btc'}
        isOpen={activeModal === 'receive_btc'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        onSuccess={handleTransactionSuccess}
        onOpenWalletSettings={() => setActiveModal('wallet_settings')}
      />

      <SendBtcModal
        key={activeModal === 'send_btc' ? 'send_btc-open' : 'send_btc'}
        isOpen={activeModal === 'send_btc'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        rates={rates}
        onSuccess={handleTransactionSuccess}
      />

      <SendMpesaModal
        key={activeModal === 'send_mpesa' ? 'send_mpesa-open' : 'send_mpesa'}
        isOpen={activeModal === 'send_mpesa'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        rates={rates}
        onSuccess={handleTransactionSuccess}
      />

      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />

      <WalletSettingsModal
        isOpen={activeModal === 'wallet_settings'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        onUpdateWallet={handleUpdateWallet}
        onServerWalletChange={syncServerWallet}
        recoveryToken={recoveryToken}
        onRecoveryDone={() => { setRecoveryToken(''); syncServerWallet(); }}
        onEjectWallet={handleEjectWallet}
        onWipeWallet={handleWipeWallet}
      />
    </div>
  );
}
