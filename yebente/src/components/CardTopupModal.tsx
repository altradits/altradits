import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, CreditCard, ExternalLink } from 'lucide-react';
import { Transaction } from '../types';
import { orderCardTopup, cardTopupStatus } from '../services/cardService';
import { celebrate } from '../services/celebrate';

interface CardTopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

// Card or bank top-up: the amount and receipt email go to our server, which
// opens a provider order; the buyer pays on the provider's secure page while
// this screen waits for the provider's own confirmation.
export const CardTopupModal: React.FC<CardTopupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [kes, setKes] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [step, setStep] = useState<'input' | 'waiting' | 'success' | 'error'>('input');
  const [message, setMessage] = useState<string>('');
  const [checkoutUrl, setCheckoutUrl] = useState<string>('');
  const [sats, setSats] = useState<number>(0);
  const [paidKes, setPaidKes] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitedRef = useRef<number>(0);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  useEffect(() => stopPolling, []);
  if (!isOpen) return null;

  const close = () => { stopPolling(); onClose(); };

  const startOrder = async () => {
    const amount = Math.floor(Number(kes));
    if (!Number.isInteger(amount) || amount < 10) { setMessage('Enter at least 10 shillings.'); setStep('error'); return; }
    if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/.test(email.trim())) { setMessage('Check the email address for the card receipt.'); setStep('error'); return; }
    setMessage('');
    let order;
    try {
      order = await orderCardTopup(amount, email.trim());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Card top-ups are unavailable right now.');
      setStep('error');
      return;
    }
    setCheckoutUrl(order.redirectUrl);
    setSats(order.satsAmount);
    setPaidKes(order.kes);
    setStep('waiting');
    waitedRef.current = 0;
    stopPolling();
    pollRef.current = setInterval(async () => {
      waitedRef.current += 4;
      let st;
      try {
        st = await cardTopupStatus(order.trackingId);
      } catch {
        return; // an unclear answer: keep waiting
      }
      if (st.state === 'paid') {
        stopPolling();
        onSuccess({ type: 'buy_btc', title: 'Card top-up', status: 'completed', fromCurrency: 'KES', fromAmount: order.kes,
          toCurrency: 'SATS', toAmount: st.satsAmount, fee: 0, feeCurrency: 'KES', recipient: 'Your Ye₿ente wallet',
          referenceNumber: order.trackingId, walletType: 'custodial', note: 'Card top-up' });
        celebrate({ kind: 'receive', sats: st.satsAmount, label: 'Card', ref: order.trackingId });
        setStep('success');
      } else if (st.state === 'failed') {
        stopPolling();
        setMessage('The card payment did not go through. No money left your account.');
        setStep('error');
      } else if (waitedRef.current >= 300) {
        stopPolling();
        setMessage('Still processing. If the money left your card, it will land shortly; check your history.');
        setStep('error');
      }
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--yb-outline-variant)]/60">
          <button type="button" onClick={close} className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold tracking-tight">Top up with card</h2>
          <span className="w-8" aria-hidden="true" />
        </div>
        <div className="p-5 overflow-y-auto">
          {step === 'input' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[var(--yb-on-surface-variant)]">Pay by card or bank on a secure page. The money lands in your account once the payment confirms.</p>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Shillings (KES)
                <input value={kes} onChange={(e) => setKes(e.target.value)} inputMode="numeric" placeholder="500"
                  className="rounded-2xl border border-[var(--yb-outline-variant)] bg-[var(--yb-surface)] px-4 py-3 text-base font-normal" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Email for the receipt
                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@example.com"
                  className="rounded-2xl border border-[var(--yb-outline-variant)] bg-[var(--yb-surface)] px-4 py-3 text-base font-normal" />
              </label>
              <button type="button" onClick={startOrder}
                className="rounded-full bg-[var(--yb-primary)] text-[var(--yb-on-primary)] font-bold py-3.5 flex items-center justify-center gap-2">
                <CreditCard className="w-5 h-5" aria-hidden="true" /> Continue
              </button>
            </div>
          )}
          {step === 'waiting' && (
            <div className="flex flex-col items-center gap-4 text-center py-4">
              <Loader2 className="w-10 h-10 animate-spin text-[var(--yb-primary)]" aria-hidden="true" />
              <p className="font-bold">Pay {paidKes.toLocaleString('en-US')} shillings on the secure page, then wait here.</p>
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                className="rounded-full bg-[var(--yb-primary)] text-[var(--yb-on-primary)] font-bold px-6 py-3 flex items-center gap-2">
                Open secure payment <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
              <p className="text-sm text-[var(--yb-on-surface-variant)]">About {sats.toLocaleString('en-US')} sats will land in your account. This screen updates on its own.</p>
            </div>
          )}
          {step === 'success' && (
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-[var(--yb-primary)]" aria-hidden="true" />
              <p className="font-bold text-lg">Received.</p>
              <button type="button" onClick={close} className="rounded-full bg-[var(--yb-primary)] text-[var(--yb-on-primary)] font-bold px-6 py-3">Done</button>
            </div>
          )}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <AlertTriangle className="w-12 h-12 text-[var(--yb-error)]" aria-hidden="true" />
              <p className="font-semibold">{message || 'Something went wrong.'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setMessage(''); setStep('input'); }} className="rounded-full border border-[var(--yb-outline)] font-bold px-6 py-3">Try again</button>
                <button type="button" onClick={close} className="rounded-full bg-[var(--yb-primary)] text-[var(--yb-on-primary)] font-bold px-6 py-3">Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
