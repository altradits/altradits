import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// Tells the person the moment a payment they sent earlier settles, wherever
// they are in the app. A success also gets the usual celebration; a failure
// says why and that the sats are back.
export interface Notice { id: string; ok: boolean; title: string; text: string }

export const PaymentNotice: React.FC<{ notice: Notice; onClose: () => void }> = ({ notice, onClose }) => {
  useEffect(() => {
    const t = window.setTimeout(onClose, notice.ok ? 8000 : 20000);
    return () => window.clearTimeout(t);
  }, [notice.id, notice.ok, onClose]);
  return (
    <div role={notice.ok ? 'status' : 'alert'} className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[70] w-[min(92vw,26rem)] rounded-2xl border border-[var(--yb-outline-variant)] bg-[var(--yb-surface-container-high)] p-4 pr-10 text-left">
      <p className={`text-sm font-bold ${notice.ok ? 'text-emerald-400' : 'text-red-400'}`}>{notice.title}</p>
      <p className="mt-1 text-xs text-[var(--yb-on-surface-variant)]">{notice.text}</p>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-1 rounded-full text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]">
        <X size={16} />
      </button>
    </div>
  );
};
