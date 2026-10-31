import React, { useState } from 'react';
import { Transaction } from '../types';
import { ArrowLeft, Copy, Check, ExternalLink } from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

const TYPE_TITLES: Record<string, string> = {
  buy_btc: 'Buy Sats',
  send_mpesa: 'Send M-Pesa',
  receive_btc: 'Receive Sats',
  send_btc: 'Send Sats',
};

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);

  if (!transaction) return null;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(transaction.referenceNumber);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const dateStr = new Date(transaction.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getAmountDisplay = () => {
    if (transaction.type === 'buy_btc' || transaction.type === 'receive_btc') {
      const sats = transaction.toCurrency === 'BTC'
        ? Math.round(Number(transaction.toAmount || 0) * 100_000_000)
        : Number(transaction.toAmount || 0);
      return { text: `+${sats.toLocaleString()} Sats`, isPositive: true };
    }
    if (transaction.type === 'send_btc') {
      const sats = transaction.fromCurrency === 'BTC'
        ? Math.round(Number(transaction.fromAmount || 0) * 100_000_000)
        : Number(transaction.fromAmount || 0);
      return { text: `-${sats.toLocaleString()} Sats`, isPositive: false };
    }
    if (transaction.type === 'send_mpesa') {
      return { text: `-${Number(transaction.toAmount || 0).toLocaleString()} KES`, isPositive: false };
    }
    return { text: `${Number(transaction.fromAmount || 0).toLocaleString()} ${transaction.fromCurrency}`, isPositive: false };
  };

  const amount = getAmountDisplay();
  const feeSats = transaction.realFeeSats ?? (transaction.feeCurrency === 'SATS' ? transaction.fee : 0);
  const feeFiat = transaction.realFeeFiat;
  const feeCurrency = transaction.realFeeCurrency || 'KES';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-sm overflow-hidden flex flex-col"
      >
        {/* Stan Style Header with Textless Back Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--yb-outline-variant)]/60">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">Details</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Main Amount and Title */}
          <div className="text-center py-2">
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                amount.isPositive ? 'text-emerald-400' : 'text-[var(--yb-on-surface)]'
              }`}
            >
              {amount.text}
            </div>
            <div className="text-sm font-semibold text-[var(--yb-secondary)] mt-1">
              {TYPE_TITLES[transaction.type] || transaction.title}
            </div>
            <div className="text-xs text-[var(--yb-on-surface-variant)] font-mono mt-0.5">
              {dateStr}
            </div>
          </div>

          {/* Details list */}
          <div className="bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3.5 font-mono text-xs space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[var(--yb-on-surface-variant)]">Reference</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--yb-on-surface)] font-semibold truncate max-w-[150px]">
                  {transaction.referenceNumber}
                </span>
                <button
                  onClick={handleCopyRef}
                  className="p-1 text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                  title="Copy reference"
                >
                  {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {transaction.recipient && (
              <div className="flex justify-between items-center">
                <span className="text-[var(--yb-on-surface-variant)]">Recipient</span>
                <span className="text-[var(--yb-on-surface)] truncate max-w-[180px]">
                  {transaction.recipient}
                </span>
              </div>
            )}

            {transaction.type === 'send_mpesa' && transaction.fromCurrency === 'SATS' && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--yb-on-surface-variant)]">Sats Debited</span>
                  <span className="text-[var(--yb-on-surface)] font-bold">
                    -{(Number(transaction.fromAmount || 0) + feeSats).toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--yb-on-surface-variant)]">Fiat Delivered</span>
                  <span className="text-[var(--yb-secondary)]">
                    {Number(transaction.toAmount || 0).toLocaleString()} {transaction.toCurrency || 'KES'}
                  </span>
                </div>
              </>
            )}

            {Boolean(transaction.rateUsed && transaction.rateUsed > 0) && (
              <div className="flex justify-between items-center">
                <span className="text-[var(--yb-on-surface-variant)]">Rate</span>
                <span className="text-[var(--yb-on-surface-variant)]">
                  1 BTC = {Math.round(transaction.rateUsed!).toLocaleString()} {transaction.toCurrency || 'KES'}
                </span>
              </div>
            )}

            {/* Real Transaction Cost */}
            <div className="flex justify-between items-center">
              <span className="text-[var(--yb-on-surface-variant)]">Fee</span>
              <span className="text-[var(--yb-on-surface)]">
                {feeSats > 0 ? (
                  `${feeSats.toLocaleString()} Sats${feeFiat ? ` (~${feeFiat} ${feeCurrency})` : ''}`
                ) : (
                  '0 Sats'
                )}
              </span>
            </div>

            {/* Official Tando / M-Pesa Receipt */}
            {transaction.receiptUrl && (
              <div className="flex justify-between items-center pt-1 border-t border-[var(--yb-outline-variant)]/60">
                <span className="text-[var(--yb-on-surface-variant)]">Receipt</span>
                <a
                  href={transaction.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline flex items-center gap-1 text-[11px]"
                >
                  <span>bitcoin.co.ke</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:bg-[#2C2138] text-[var(--yb-on-surface)] font-medium text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
