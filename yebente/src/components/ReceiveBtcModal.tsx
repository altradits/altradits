import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, Transaction } from '../types';
import { ArrowLeft, AlertCircle, Loader2, Copy, Check, Share2, Receipt } from 'lucide-react';
import { hasServerWallet } from '../services/altraditsWallet';
import { addressQrText } from '../services/paymentQr';
import { templateQrDataUrl } from '../services/templateQr';
import { SatsMotion, CountUp } from './SatsMotion';
import { celebrate } from '../services/celebrate';
import {
  createDepositInvoice,
  checkInvoiceStatus,
  createLightningInvoice,
  isLightningAddress,
  resolveLightningAddress,
} from '../services/lightningService';
import { isNetworkOnline } from '../services/offlineService';

interface ReceiveBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
  onOpenWalletSettings: () => void;
}

type Step = 'address' | 'amount' | 'invoice' | 'success' | 'error';

// One tap copies; the tick shows for two seconds.
function useCopy() {
  const [copied, setCopied] = useState('');
  const copy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? '' : c)), 2000);
  };
  return { copied, copy };
}

// Share sheet where the phone has one; otherwise a copy.
async function shareText(text: string, fallback: () => void) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch { return; /* the owner closed the share sheet */ }
  fallback();
}

// Receive, full screen: the wallet's own address as a big QR code, the address
// right under it (one tap copies), the LNURL to copy, Share, and Create invoice.
// An invoice then fills the screen until it is paid.
export const ReceiveBtcModal: React.FC<ReceiveBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onSuccess,
  onOpenWalletSettings,
}) => {
  const [step, setStep] = useState<Step>('address');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { copied, copy } = useCopy();

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const currentSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const isCustodialWallet = wallet.type === 'custodial';
  const configuredLightningAddress = !isCustodialWallet && isLightningAddress(wallet.nonCustodialAddress)
    ? wallet.nonCustodialAddress
    : '';

  // Only this wallet's own address gets a QR code (not the shared fallback address).
  const ownAddress = hasServerWallet() ? wallet.blinkAddress || '' : configuredLightningAddress;
  const qrText = ownAddress ? addressQrText(ownAddress) : null; // LIGHTNING:LNURL1...
  const lnurl = qrText ? qrText.replace(/^LIGHTNING:/, '') : '';
  const [addressQrUrl, setAddressQrUrl] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !qrText) { setAddressQrUrl(''); return; }
    templateQrDataUrl(qrText)
      .then(setAddressQrUrl)
      .catch(() => setAddressQrUrl(''));
  }, [isOpen, qrText]);

  // No address yet (no wallet): straight to the invoice amount.
  useEffect(() => {
    if (isOpen && !ownAddress && step === 'address') setStep('amount');
  }, [isOpen, ownAddress, step]);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Stop polling when the screen closes or unmounts
  useEffect(() => {
    if (!isOpen) stopPolling();
    return stopPolling;
  }, [isOpen]);

  const handleBack = () => {
    stopPolling();
    if (step === 'invoice') setStep('amount');
    else if ((step === 'amount' || step === 'error') && ownAddress) { setStep('address'); setErrorMessage(''); }
    else onClose();
  };

  const handleCreateLightningInvoice = async () => {
    if (numericSats <= 0) {
      setErrorMessage('Please enter an amount of 1 satoshi or more.');
      return;
    }

    if (!isNetworkOnline()) {
      setErrorMessage("You're offline. Share your Lightning address to receive payments.");
      setStep('error');
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');

    try {
      let res: {
        success: boolean;
        invoice?: string;
        paymentHash?: string;
        error?: string;
      };

      if (configuredLightningAddress) {
        const details = await resolveLightningAddress(configuredLightningAddress);
        if (!details.success) {
          setErrorMessage(details.error || 'Could not reach the Lightning address saved in Wallet Settings.');
          setStep('error');
          return;
        }

        const externalInvoice = await createLightningInvoice(
          configuredLightningAddress,
          numericSats,
          'Ye₿ente Sats Deposit'
        );
        res = {
          success: externalInvoice.success,
          invoice: externalInvoice.invoice,
          error: externalInvoice.error,
        };
      } else if (hasServerWallet()) {
        // The Altradits wallet: an invoice on the Altradits node, credited to this wallet.
        res = await createDepositInvoice(numericSats, 'Ye₿ente Lightning Deposit');
      } else {
        // No wallet yet: log in or create one first.
        setIsGenerating(false);
        onOpenWalletSettings();
        return;
      }

      if (!res.success || !res.invoice) {
        setErrorMessage(
          res.error ||
            'Could not make an invoice. Check your internet connection and try again.'
        );
        setStep('error');
        return;
      }

      setInvoice(res.invoice);

      const qrData = await templateQrDataUrl(res.invoice.toUpperCase());
      setQrCodeUrl(qrData);
      setStep('invoice');

      if (res.paymentHash) {
        startPollingSettlement(res.paymentHash, numericSats);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error generating invoice';
      setErrorMessage(message);
      setStep('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const startPollingSettlement = (hash: string, sats: number) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await checkInvoiceStatus(hash);
        if (res.paid || res.settled) {
          stopPolling();
          triggerSuccess(hash, sats);
        }
      } catch {
        // Continue polling
      }
    }, 2500);
  };

  const triggerSuccess = (hash: string, sats: number) => {
    celebrate({ kind: 'receive', sats, label: 'Lightning', ref: hash });
    setStep('success');
    onSuccess({
      type: 'receive_btc',
      title: 'Received Lightning Sats',
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: sats,
      toCurrency: 'SATS',
      toAmount: sats,
      fee: 0,
      feeCurrency: 'SATS',
      realFeeSats: 0,
      realFeeFiat: 0,
      realFeeCurrency: 'KES',
      referenceNumber: hash,
      walletType: 'custodial',
      note: 'Lightning deposit',
    });
  };

  if (!isOpen) return null;

  // A QR code as big as the screen allows, on white with a quiet margin, so other
  // phones and scanners read it at a glance.
  const bigQr = (src: string, alt: string) => (
    <div className="bg-white rounded-3xl p-3 shadow-lg">
      <img src={src} alt={alt} className="block w-[min(84vw,58vh)] h-[min(84vw,58vh)] max-w-[30rem] max-h-[30rem] object-contain [image-rendering:pixelated]" />
    </div>
  );
  const iconBtn = 'w-12 h-12 rounded-full bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] flex items-center justify-center';

  return (
    <div className="fixed inset-0 z-50 bg-[var(--yb-surface-container-low)] flex flex-col" role="dialog" aria-modal="true" aria-label="Receive">
      {/* Back, and the balance in digits */}
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={handleBack} className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-mono font-bold text-[var(--yb-on-surface)]" aria-label={`${currentSats.toLocaleString()} sats`}>
          {currentSats.toLocaleString()} <span className="text-xs font-semibold text-[var(--yb-secondary)]">sats</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-5 text-center">
        {/* The wallet's address: big QR, the address under it, copy, share, invoice */}
        {step === 'address' && ownAddress && (
          <>
            {addressQrUrl ? bigQr(addressQrUrl, `QR code for ${ownAddress}`) : <Loader2 className="w-8 h-8 animate-spin text-[var(--yb-primary)]" />}
            <button type="button" onClick={() => copy('address', ownAddress)} className="max-w-full font-mono text-lg sm:text-xl font-bold text-[var(--yb-on-surface)] break-all flex items-center gap-2" aria-label={`Copy ${ownAddress}`}>
              <span>{ownAddress}</span>
              {copied === 'address' ? <Check className="w-5 h-5 shrink-0 text-emerald-400" /> : <Copy className="w-4 h-4 shrink-0 text-[var(--yb-secondary)]" />}
            </button>
            <div className="flex items-center gap-4">
              {lnurl && (
                <button type="button" onClick={() => copy('lnurl', lnurl)} className="h-12 px-4 rounded-full bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] text-xs font-mono font-bold flex items-center gap-2" aria-label="Copy LNURL">
                  {copied === 'lnurl' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} LNURL
                </button>
              )}
              <button type="button" onClick={() => shareText(lnurl ? `${ownAddress}\n${lnurl}` : ownAddress, () => copy('address', ownAddress))} className={iconBtn} aria-label="Share">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
            <button type="button" onClick={() => { setErrorMessage(''); setStep('amount'); }}
              className="w-full max-w-sm h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center gap-2">
              <Receipt className="w-4 h-4" /> Create invoice
            </button>
          </>
        )}

        {/* The invoice amount: one empty box, no label */}
        {step === 'amount' && (
          <div className="w-full max-w-sm space-y-4">
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                autoFocus
                value={satsAmountStr}
                onChange={(e) => setSatsAmountStr(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                onKeyDown={(e) => { if (e.key === 'Enter' && numericSats > 0 && !isGenerating) handleCreateLightningInvoice(); }}
                aria-label="Amount in sats"
                className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-4 text-2xl text-center font-mono font-bold text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-[var(--yb-secondary)]">sats</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSatsAmountStr(preset.toString())}
                  className={`py-2 rounded-xl border text-xs font-mono font-medium ${
                    numericSats === preset
                      ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                      : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
                  }`}
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
            {errorMessage && <p className="text-xs text-red-300">{errorMessage}</p>}
            <button
              type="button"
              onClick={handleCreateLightningInvoice}
              disabled={numericSats <= 0 || isGenerating}
              className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Create invoice
            </button>
          </div>
        )}

        {/* The invoice fills the screen until it is paid */}
        {step === 'invoice' && (
          <>
            <p className="font-mono text-2xl font-bold text-[var(--yb-on-surface)]">{numericSats.toLocaleString()} <span className="text-sm text-[var(--yb-secondary)]">sats</span></p>
            {qrCodeUrl && bigQr(qrCodeUrl, 'QR code of the invoice')}
            <button type="button" onClick={() => copy('invoice', invoice)} className="w-full max-w-sm flex items-center gap-2 text-left" aria-label="Copy invoice">
              <span className="flex-1 min-w-0 font-mono text-[11px] text-[var(--yb-secondary)] truncate">{invoice}</span>
              {copied === 'invoice' ? <Check className="w-5 h-5 shrink-0 text-emerald-400" /> : <Copy className="w-4 h-4 shrink-0 text-[var(--yb-secondary)]" />}
            </button>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => copy('invoice', invoice)} className={iconBtn} aria-label="Copy invoice">
                {copied === 'invoice' ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
              <button type="button" onClick={() => shareText(invoice, () => copy('invoice', invoice))} className={iconBtn} aria-label="Share invoice">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
            <Loader2 className="w-5 h-5 animate-spin text-[var(--yb-primary)]" aria-label="Waiting for payment" />
          </>
        )}

        {/* Paid */}
        {step === 'success' && (
          <div className="w-full max-w-sm space-y-4">
            <SatsMotion mode="received" />
            <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Payment Received</h3>
            <p className="font-mono text-2xl font-bold text-emerald-400">+<CountUp value={numericSats} /> <span className="text-sm">sats</span></p>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center"
            >
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="w-full max-w-sm space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Invoice Unavailable</h3>
            <p className="text-xs text-red-300 px-2 leading-relaxed">{errorMessage}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep('amount'); setErrorMessage(''); }}
                className="flex-1 h-11 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center">
                Retry
              </button>
              <button type="button" onClick={() => { onClose(); onOpenWalletSettings(); }}
                className="flex-1 h-11 rounded-2xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center">
                Wallet Settings
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
