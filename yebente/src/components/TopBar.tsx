import React from 'react';
import { UserWallet } from '../types';
import { Settings, WifiOff } from 'lucide-react';

interface TopBarProps {
  wallet: UserWallet;
  onOpenWalletSettings: () => void;
  isOnline?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  wallet,
  onOpenWalletSettings,
  isOnline = true,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[var(--yb-surface)]/90 border-b border-[#372A42] px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex flex-col justify-center select-none">
          <div className="flex items-center tracking-tight leading-none">
            <span className="font-banana font-black text-[26px] text-[var(--yb-on-surface)] drop-shadow-sm">
              Ye
            </span>
            <span
              className="font-black text-[25px] text-[var(--yb-secondary)] px-[0.5px] leading-none inline-flex items-center justify-center font-sans"
              style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              ₿
            </span>
            <span className="font-banana font-black text-[26px] text-[var(--yb-on-surface)] drop-shadow-sm">
              ente
            </span>
          </div>
        </div>

        {/* Action Zone */}
        <div className="flex items-center gap-2">
          {/* Offline status indicator */}
          {!isOnline && (
            <div className="px-2 py-1 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[11px] font-mono text-amber-300 flex items-center gap-1">
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span>Offline</span>
            </div>
          )}

          {/* Wallet State: Connected (Settings) or Connect */}
          {wallet.isConnected ? (
            <button
              type="button"
              onClick={onOpenWalletSettings}
              className="w-9 h-9 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] flex items-center justify-center text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)] active:scale-95"
              title="Wallet settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenWalletSettings}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-xs font-semibold text-[var(--yb-on-surface)] active:scale-95"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
