import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { WalletAction } from '../services/features';

interface ActionGridProps {
  // Only the server-enabled actions, in display order (visibleActions).
  actions: WalletAction[];
  // Set up but waiting on the node: shown greyed out, not clickable.
  paused?: WalletAction[];
  // The server hasn't answered yet: placeholders, so nothing pops in and out.
  loading?: boolean;
  onBuyBtc: () => void;
  onSendMpesa: () => void;
  onReceiveBtc: () => void;
  onSendBtc: () => void;
  onCardTopup: () => void;
}

// Material 3 tonal tiles: an icon in a primary container above the label.
const tile =
  'group flex flex-col items-center justify-center gap-2.5 p-4 rounded-[24px] bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] border border-[var(--yb-outline-variant)]/60 text-center min-h-[112px]';
const wide =
  'group col-span-2 flex flex-row items-center justify-start gap-4 p-4 px-5 rounded-[24px] bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] border border-[var(--yb-outline-variant)]/60 text-left';
const badge =
  'flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--yb-primary-container)] text-[var(--yb-on-primary-container)] shrink-0';
const label = 'text-[15px] font-semibold tracking-tight text-[var(--yb-on-surface)]';

export const ActionGrid: React.FC<ActionGridProps> = ({
  actions,
  paused = [],
  loading = false,
  onBuyBtc,
  onSendMpesa,
  onReceiveBtc,
  onSendBtc,
  onCardTopup,
}) => {
  const tiles: { key: WalletAction; label: string; sub?: string; icon: React.ReactNode; onClick: () => void }[] = [
    // Send and Receive side by side on top; M-Pesa below them (full width when alone).
    { key: 'send', label: 'Send', icon: <ArrowUpRight className="w-6 h-6" />, onClick: onSendBtc },
    { key: 'receive', label: 'Receive', icon: <ArrowDownLeft className="w-6 h-6" />, onClick: onReceiveBtc },
    { key: 'sendMobile', label: 'M-Pesa', icon: <Smartphone className="w-6 h-6" />, onClick: onSendMpesa },
    { key: 'buy', label: 'Buy Sats', icon: <Banknote className="w-6 h-6" />, onClick: onBuyBtc },
    { key: 'cardTopup', label: 'Top up with card', sub: 'Bank or card, on a secure page', icon: <CreditCard className="w-6 h-6" />, onClick: onCardTopup },
  ];
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3" aria-busy="true" aria-label="Loading wallet actions">
        {[0, 1].map((k) => (
          <div key={k} className="min-h-[112px] rounded-[24px] bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)]/60 animate-pulse" />
        ))}
      </div>
    );
  }
  const shown = tiles.filter((t) => actions.includes(t.key) || paused.includes(t.key));
  const anyPaused = shown.some((t) => paused.includes(t.key) && !actions.includes(t.key));
  return (
    <div className="space-y-3">
      {anyPaused && (
        <p role="status" className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-100 text-xs">
          Payments are paused while the wallet reconnects. Your balance is safe. The buttons turn back on by themselves.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {shown.map((t, i) => {
          const off = paused.includes(t.key) && !actions.includes(t.key);
          const cls = `${i === shown.length - 1 && shown.length % 2 === 1 ? wide : tile}${off ? ' opacity-50 cursor-not-allowed' : ''}`;
          const body = i === shown.length - 1 && shown.length % 2 === 1 ? (
            // Alone in its row: full width, icon left of the label. No empty holes.
            <>
              <span className={badge} aria-hidden="true">{t.icon}</span>
              <span><span className={label}>{t.label}</span>{t.sub && <><br /><span className="text-[13px] text-[var(--yb-on-surface-variant)]">{t.sub}</span></>}</span>
            </>
          ) : (
            <>
              <span className={badge} aria-hidden="true">{t.icon}</span>
              <span className={label}>{t.label}</span>
            </>
          );
          return (
            <button key={t.key} type="button" onClick={off ? undefined : t.onClick} disabled={off} aria-disabled={off} className={cls}>
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
};
