import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { WalletAction } from '../services/features';

interface ActionGridProps {
  // Only the server-enabled actions, in display order (visibleActions).
  actions: WalletAction[];
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
  onBuyBtc,
  onSendMpesa,
  onReceiveBtc,
  onSendBtc,
  onCardTopup,
}) => {
  const tiles: { key: WalletAction; label: string; sub?: string; icon: React.ReactNode; onClick: () => void }[] = [
    { key: 'buy', label: 'Buy Sats', icon: <Banknote className="w-6 h-6" />, onClick: onBuyBtc },
    { key: 'sendMobile', label: 'Send Mobile', icon: <Smartphone className="w-6 h-6" />, onClick: onSendMpesa },
    { key: 'receive', label: 'Receive Sats', icon: <ArrowDownLeft className="w-6 h-6" />, onClick: onReceiveBtc },
    { key: 'send', label: 'Send Sats', icon: <ArrowUpRight className="w-6 h-6" />, onClick: onSendBtc },
    { key: 'cardTopup', label: 'Top up with card', sub: 'Bank or card, on a secure page', icon: <CreditCard className="w-6 h-6" />, onClick: onCardTopup },
  ];
  const shown = tiles.filter((t) => actions.includes(t.key));
  return (
    <div className="grid grid-cols-2 gap-3">
      {shown.map((t, i) =>
        // Alone in its row: full width, icon left of the label. No empty holes.
        i === shown.length - 1 && shown.length % 2 === 1 ? (
          <button key={t.key} type="button" onClick={t.onClick} className={wide}>
            <span className={badge} aria-hidden="true">{t.icon}</span>
            <span><span className={label}>{t.label}</span>{t.sub && <><br /><span className="text-[13px] text-[var(--yb-on-surface-variant)]">{t.sub}</span></>}</span>
          </button>
        ) : (
          <button key={t.key} type="button" onClick={t.onClick} className={tile}>
            <span className={badge} aria-hidden="true">{t.icon}</span>
            <span className={label}>{t.label}</span>
          </button>
        )
      )}
    </div>
  );
};
