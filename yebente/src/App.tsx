import { useState, useEffect, useCallback, useRef } from 'react';
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
import { isNetworkOnline, onNetworkChange } from './services/offlineService';
import { TopBar } from './components/TopBar';
import { forgetBiometric } from './services/biometric';
import { celebrate, markCelebrated, wasCelebrated, onCelebrate, Celebration } from './services/celebrate';
import { SatsCelebration } from './components/SatsCelebration';
import { BalanceCard } from './components/BalanceCard';
import { ActionGrid } from './components/ActionGrid';
import { TransactionHistory } from './components/TransactionHistory';
import { BuyBtcModal } from './components/BuyBtcModal';
import { CardTopupModal } from './components/CardTopupModal';
import { ReceiveBtcModal } from './components/ReceiveBtcModal';
import { SendBtcModal } from './components/SendBtcModal';
import { SendMpesaModal } from './components/SendMpesaModal';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { WalletSettingsModal } from './components/WalletSettingsModal';
import { WalletGate } from './components/WalletGate';
import { access, Access, hasServerWallet, fetchServerWallet, fetchServerHistory, forgetServerWallet, lockServerWallet } from './services/altraditsWallet';

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

  const [isOnline, setIsOnline] = useState<boolean>(isNetworkOnline);

  // Modals
  const [activeModal, setActiveModal] = useState<
    'none' | 'buy_btc' | 'receive_btc' | 'send_btc' | 'send_mpesa' | 'card_topup' | 'wallet_settings'
  >('none');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Opened from a recovery email (/yebente#recover=..., older links ?recover=...):
  // the start screen asks for a new PIN.
  const [recoveryToken, setRecoveryToken] = useState<string>(() => {
    try {
      return new URLSearchParams(window.location.hash.slice(1)).get('recover')
        || new URLSearchParams(window.location.search).get('recover') || '';
    } catch { return ''; }
  });
  useEffect(() => {
    if (!recoveryToken) return;
    // The link's token stays out of the address bar and history from here on.
    window.history.replaceState(null, '', window.location.pathname);
  }, [recoveryToken]);

  // Open, locked (this phone is trusted, PIN or fingerprint opens it) or none
  // (log in, create, or recover). Locked hides the balance and history.
  const [walletAccess, setWalletAccess] = useState<Access>(access);
  const [gateOpen, setGateOpen] = useState(false); // an external-wallet user asked for the start screen
  const [externalSetup, setExternalSetup] = useState(false); // chose "my own Lightning wallet"
  const walletType = useRef(wallet.type);
  walletType.current = wallet.type;
  useEffect(() => {
    const update = () => {
      const a = access();
      setWalletAccess(a);
      if (a === 'open') return;
      // Nothing of the wallet stays on screen or in memory while it's locked.
      if (walletType.current !== 'custodial') return;
      setWallet((cur) => ({ ...cur, satsBalance: 0, btcBalance: 0 }));
      setTransactions([]);
    };
    window.addEventListener('yebente:access', update);
    return () => window.removeEventListener('yebente:access', update);
  }, []);
  const external = wallet.isConnected && wallet.type === 'non-custodial';
  const showGate = Boolean(recoveryToken) || gateOpen || (walletAccess !== 'open' && !external && !externalSetup);

  // Locks itself after 3 minutes away from the app, like a banking app.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 3 * 60_000 && hasServerWallet()) { setActiveModal('none'); lockServerWallet(); }
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

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

  // The full-screen sats show: played here, asked for by the payment sheets, and
  // by the sync below when sats arrive while the app is open.
  const [show, setShow] = useState<{ c: Celebration; id: number } | null>(null);
  useEffect(() => onCelebrate((c) => setShow({ c, id: Date.now() })), []);
  const firstSync = useRef(true);

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
        blinkUsername: w.handle,
        blinkAddress: w.address,
        recoveryEmail: w.email || (w.emailPending ? `${w.emailPending} (unconfirmed)` : ''),
        frozen: w.frozen === true,
        pendingRecovery: w.pendingRecovery || null,
        emailChange: w.emailChange || null,
        hold: w.hold || null,
      }));
      // Sats that came in since the last look: the receiver's show.
      if (firstSync.current) markCelebrated(txs.map((t) => t.referenceNumber));
      else {
        const fresh = txs.filter((t) => t.type === 'receive_btc' && t.status === 'completed' && !wasCelebrated(t.referenceNumber));
        if (fresh.length) {
          markCelebrated(fresh.map((t) => t.referenceNumber));
          celebrate({ kind: 'receive', sats: fresh.reduce((n, t) => n + (t.toAmount || t.fromAmount || 0), 0), label: fresh.length === 1 ? fresh[0].recipient : undefined });
        }
      }
      firstSync.current = false;
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

  // The Offline badge in the top bar.
  useEffect(() => onNetworkChange(setIsOnline), []);

  const handleUpdateWallet = (updated: UserWallet) => {
    setWallet(updated);
    saveStoredWallet(updated);
  };

  const handleEjectWallet = () => {
    const ejected = ejectWallet();
    setWallet(ejected);
  };

  const handleWipeWallet = () => {
    void forgetServerWallet();
    const wiped = wipeWallet();
    setWallet(wiped);
    setTransactions([]);
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
  };

  return (
    <div className="h-dvh overflow-hidden bg-[var(--yb-surface)] text-[var(--yb-on-surface)] flex flex-col items-center justify-start md:justify-center p-0 md:p-6 select-none font-sans">
      {/* A phone-sized column, framed on wide screens. It always fits the
          screen: the page never scrolls, only the content inside the app. */}
      <div className="w-full max-w-[440px] md:border md:border-[var(--yb-outline-variant)] md:rounded-[40px] md:shadow-2xl md:shadow-black/90 overflow-hidden bg-[var(--yb-surface)] flex flex-col h-full md:max-h-[860px]">
        {/* Top Bar with brand yebente, offline badge, and settings */}
        <TopBar
          wallet={wallet}
          onOpenWalletSettings={() => { if (!showGate) setActiveModal('wallet_settings'); }}
          isOnline={isOnline}
        />

        {showGate ? (
          <WalletGate
            key={recoveryToken ? 'recover' : 'gate'}
            locked={walletAccess === 'locked'}
            recoveryToken={recoveryToken}
            onOpen={() => { setGateOpen(false); setExternalSetup(false); setWalletAccess(access()); firstSync.current = true; syncServerWallet(); }}
            onRecoveryDone={() => setRecoveryToken('')}
            onHold={() => setGateOpen(true)}
            onUseExternal={() => { setGateOpen(false); setExternalSetup(true); setWallet((w) => ({ ...w, type: 'non-custodial' })); setActiveModal('wallet_settings'); }}
          />
        ) : (
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 pb-6">
          {ratesError && rates.btcUsd === 0 && (
            <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs font-mono">
              <p className="font-semibold">Exchange Rates Offline</p>
              <p className="text-[11px] text-amber-400/90 mt-0.5">{ratesError}</p>
            </div>
          )}

          {/* Sending was frozen from an email link. A phone trusted before the
              freeze lifts it by logging in again; otherwise recover by email. */}
          {wallet.type === 'custodial' && wallet.frozen && (
            <div className="p-3 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs">
              <p className="font-semibold">Sending is frozen</p>
              <p className="text-[11px] text-red-300/90 mt-0.5">Receiving still works. Log in again on your old phone, or recover by email to unfreeze it.</p>
            </div>
          )}

          {/* A recovery link is live. The Cancel button is in Settings. */}
          {wallet.type === 'custodial' && wallet.pendingRecovery && (
            <div className="p-3 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs">
              <p className="font-semibold">Recovery in progress</p>
              <p className="text-[11px] text-red-300/90 mt-0.5">A link was sent to your email. Cancel it in Settings if that wasn't you.</p>
            </div>
          )}

          {/* 1. Main Balance Portfolio Card (visible whenever wallet is connected) */}
          {wallet.isConnected && (
            <BalanceCard
              wallet={wallet}
              rates={rates}
              onOpenWalletSettings={() => setActiveModal('wallet_settings')}
              onUpdateWallet={handleUpdateWallet}
              onRefreshServer={syncServerWallet}
            />
          )}

          {/* Core wallet and payment actions */}
          <ActionGrid
            onBuyBtc={() => setActiveModal(hasServerWallet() ? 'buy_btc' : 'wallet_settings')}
            onSendMpesa={() => handleRequireWalletAction(() => setActiveModal('send_mpesa'))}
            onReceiveBtc={() => handleRequireWalletAction(() => setActiveModal('receive_btc'))}
            onSendBtc={() => handleRequireWalletAction(() => setActiveModal('send_btc'))}
            onCardTopup={() => setActiveModal(hasServerWallet() ? 'card_topup' : 'wallet_settings')}
          />

          {/* 3. Secure Transaction History */}
          <TransactionHistory
            transactions={transactions}
            onSelectTransaction={(tx) => setSelectedTx(tx)}
          />
        </main>
        )}
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

      <CardTopupModal
        key={activeModal === 'card_topup' ? 'card_topup-open' : 'card_topup'}
        isOpen={activeModal === 'card_topup'}
        onClose={() => setActiveModal('none')}
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

      {show && <SatsCelebration key={show.id} c={show.c} onDone={() => setShow(null)} />}

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
        onOpenGate={() => setGateOpen(true)}
        onEjectWallet={handleEjectWallet}
        onWipeWallet={handleWipeWallet}
      />
    </div>
  );
}
