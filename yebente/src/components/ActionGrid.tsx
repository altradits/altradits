import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Smartphone } from 'lucide-react';

interface ActionGridProps {
  onBuyBtc: () => void;
  onSendMpesa: () => void;
  onReceiveBtc: () => void;
  onSendBtc: () => void;
  onCardTopup: () => void;
}

// Material 3 tonal tiles: an icon in a primary container above the label.
const tile =
  'group flex flex-col items-center justify-center gap-2.5 p-4 rounded-[24px] bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] border border-[var(--yb-outline-variant)]/60 text-center min-h-[112px]';
const badge =
  'flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--yb-primary-container)] text-[var(--yb-on-primary-container)]';
const label = 'text-[15px] font-semibold tracking-tight text-[var(--yb-on-surface)]';

export const ActionGrid: React.FC<ActionGridProps> = ({
  onBuyBtc,
  onSendMpesa,
  onReceiveBtc,
  onSendBtc,
  onCardTopup,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Row 1: M-Pesa Rails (Buy Sats & Send M-Pesa) */}
      <button type="button" onClick={onBuyBtc} className={tile}>
        <span className={badge} aria-hidden="true"><Banknote className="w-6 h-6" /></span>
        <span className={label}>Buy Sats</span>
      </button>

      <button type="button" onClick={onSendMpesa} className={tile}>
        <span className={badge} aria-hidden="true"><Smartphone className="w-6 h-6" /></span>
        <span className={label}>Send Mobile</span>
      </button>

      {/* Row 2: Bitcoin Rails (Receive Sats & Send Sats) */}
      <button type="button" onClick={onReceiveBtc} className={tile}>
        <span className={badge} aria-hidden="true"><ArrowDownLeft className="w-6 h-6" /></span>
        <span className={label}>Receive Sats</span>
      </button>

      <button type="button" onClick={onSendBtc} className={tile}>
        <span className={badge} aria-hidden="true"><ArrowUpRight className="w-6 h-6" /></span>
        <span className={label}>Send Sats</span>
      </button>

      <button type="button" onClick={onCardTopup} className="group col-span-2 flex flex-row items-center justify-start gap-4 p-4 px-5 rounded-[24px] bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] border border-[var(--yb-outline-variant)]/60 text-left">
        <span className={badge} aria-hidden="true"><CreditCard className="w-6 h-6" /></span>
        <span><span className={label}>Top up with card</span><br /><span className="text-[13px] text-[var(--yb-on-surface-variant)]">Bank or card, on a secure page</span></span>
      </button>
    </div>
  );
};
