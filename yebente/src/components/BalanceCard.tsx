import React, { useState } from 'react';
import { UserWallet, ExchangeRates } from '../types';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { queryWebLNBalance } from '../services/lightningService';
import { logBalance, getStoredTransactions } from '../services/storageService';

interface BalanceCardProps {
  wallet: UserWallet;
  rates: ExchangeRates;
  onOpenWalletSettings: () => void;
  onUpdateWallet?: (updated: UserWallet) => void;
  onRefreshServer?: () => Promise<void>; // the Ye₿ente wallet: ask the server again
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  wallet,
  rates,
  onOpenWalletSettings,
  onUpdateWallet,
  onRefreshServer,
}) => {
  const [hideBalances, setHideBalances] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // If wallet is not connected / ejected, do not render balance card
  if (!wallet.isConnected) {
    return null;
  }

  const handleSyncBalance = async () => {
    setIsSyncing(true);
    try {
      // The Ye₿ente wallet: the balance is the server's, never worked out here.
      if (wallet.type === 'custodial') {
        await onRefreshServer?.();
        return;
      }
      // Your own wallet: what its browser extension (WebLN) reports, else this app's log.
      const logged = logBalance(getStoredTransactions());
      const webln = await queryWebLNBalance();
      const sats = webln.available && typeof webln.sats === 'number' ? Math.max(logged, webln.sats) : logged;
      onUpdateWallet?.({ ...wallet, satsBalance: sats, btcBalance: sats / 100_000_000 });
    } finally {
      setIsSyncing(false);
    }
  };

  const sats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const btcEquiv = sats / 100_000_000;
  const btcValueKes = btcEquiv * rates.btcKes;
  const btcValueEtb = btcEquiv * rates.btcEtb;

  const formatNumber = (num: number, maximumFractionDigits = 2) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits > 2 ? 2 : maximumFractionDigits,
    }).format(num);
  };

  const formattedKes = hideBalances
    ? '••••'
    : `KES ${formatNumber(btcValueKes, btcValueKes > 0 && btcValueKes < 10 ? 2 : 0)}`;

  const formattedEtb = hideBalances
    ? '••••'
    : `ETB ${formatNumber(btcValueEtb, btcValueEtb > 0 && btcValueEtb < 10 ? 2 : 0)}`;

  return (
    <div className="rounded-[28px] p-5 bg-[linear-gradient(145deg,var(--yb-primary-container),#4A1E63)] text-[var(--yb-on-primary-container)]">
      {/* Top row: Sats indicator on the left, controls on the right */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[40px] leading-none font-extrabold tracking-tight text-[var(--yb-on-primary-container)] font-mono tabular-nums">
            {hideBalances ? '••••••' : sats.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-[var(--yb-on-primary-container)]/80">
            Sats
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="p-2 rounded-full text-[var(--yb-on-primary-container)]/85 hover:text-[var(--yb-on-primary-container)] hover:bg-white/10"
            aria-label={hideBalances ? 'Show digits' : 'Hide digits'}
          >
            {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={handleSyncBalance}
            disabled={isSyncing}
            className="p-2 rounded-full text-[var(--yb-on-primary-container)]/85 hover:text-[var(--yb-on-primary-container)] hover:bg-white/10 disabled:opacity-50"
            aria-label="Sync Sats"
            title="Sync Sats"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[var(--yb-primary)]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Country currency indicators alongside each other without button borders */}
      <div className="grid grid-cols-2 gap-2.5 mt-4 pt-3 border-t border-white/15">
        <div className="text-center font-mono text-sm font-semibold text-[var(--yb-on-primary-container)]/90">
          {formattedKes}
        </div>
        <div className="text-center font-mono text-sm font-semibold text-[var(--yb-on-primary-container)]/90">
          {formattedEtb}
        </div>
      </div>
    </div>
  );
};
