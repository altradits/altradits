import React, { useState } from 'react';
import { Transaction } from '../types';
import { ChevronDown } from 'lucide-react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
}

const TYPE_TITLES: Record<string, string> = {
  buy_btc: 'Buy Sats',
  send_mpesa: 'Send M-Pesa',
  receive_btc: 'Receive Sats',
  send_btc: 'Send Sats',
};

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  onSelectTransaction,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const validTransactions = transactions.filter((tx) => {
    if (!tx || typeof tx !== 'object') return false;
    if (tx.status !== 'completed') return false;
    if (!tx.referenceNumber || typeof tx.referenceNumber !== 'string' || !tx.referenceNumber.trim()) return false;
    const fromAmt = Number(tx.fromAmount || 0);
    const toAmt = Number(tx.toAmount || 0);
    if (fromAmt <= 0 && toAmt <= 0) return false;
    return true;
  });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getAmountDisplay = (tx: Transaction) => {
    if (tx.type === 'buy_btc' || tx.type === 'receive_btc') {
      const sats = tx.toCurrency === 'BTC'
        ? Math.round(Number(tx.toAmount || 0) * 100_000_000)
        : Number(tx.toAmount || 0);
      return { text: `+${sats.toLocaleString()} Sats`, isPositive: true };
    }
    if (tx.type === 'send_btc') {
      const sats = tx.fromCurrency === 'BTC'
        ? Math.round(Number(tx.fromAmount || 0) * 100_000_000)
        : Number(tx.fromAmount || 0);
      return { text: `-${sats.toLocaleString()} Sats`, isPositive: false };
    }
    if (tx.type === 'send_mpesa') {
      return { text: `-${Number(tx.toAmount || 0).toLocaleString()} KES`, isPositive: false };
    }
    return { text: `${Number(tx.fromAmount || 0).toLocaleString()} ${tx.fromCurrency}`, isPositive: false };
  };

  return (
    <div className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] rounded-3xl p-4">
      {/* Title & Collapse Toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-left group focus:outline-none"
          aria-expanded={!isCollapsed}
        >
          <ChevronDown
            className={`w-4 h-4 text-[var(--yb-secondary)] ${
              isCollapsed ? '-rotate-90' : 'rotate-0'
            }`}
          />
          <h2 className="text-sm font-bold text-[var(--yb-on-surface)] group-hover:text-[var(--yb-secondary)]">
            History
          </h2>
        </button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="mt-3 pt-2 border-t border-[var(--yb-outline-variant)]/50">
          {validTransactions.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--yb-on-surface-variant)] font-mono">
              No transactions yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--yb-surface-container-high)]/50">
              {validTransactions.map((tx) => {
                const amount = getAmountDisplay(tx);
                return (
                  <button
                    key={tx.id}
                    onClick={() => onSelectTransaction(tx)}
                    className="w-full py-3 flex items-center justify-between text-left hover:bg-[var(--yb-surface-container)]/40 px-2 rounded-xl group"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[var(--yb-on-surface)] group-hover:text-[var(--yb-secondary)]">
                          {TYPE_TITLES[tx.type] || tx.title}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--yb-on-surface-variant)] font-mono mt-0.5">
                        {formatDate(tx.timestamp)}
                      </div>
                    </div>

                    <div
                      className={`text-sm font-bold font-mono tabular-nums ${
                        amount.isPositive ? 'text-emerald-400' : 'text-[var(--yb-on-surface)]'
                      }`}
                    >
                      {amount.text}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
