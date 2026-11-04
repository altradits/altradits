import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, Transaction } from '../types';
import { ArrowLeft, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import { hasServerWallet } from '../services/altraditsWallet';
import QRCode from 'qrcode';
import { addressQrText } from '../services/paymentQr';
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

export const ReceiveBtcModal: React.FC<ReceiveBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onSuccess,
  onOpenWalletSettings,
}) => {
  const [step, setStep] = useState<'input' | 'invoice' | 'success' | 'error'>('input');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const currentSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const isCustodialWallet = wallet.type === 'custodial';
  const configuredLightningAddress = !isCustodialWallet && isLightningAddress(wallet.nonCustodialAddress)
    ? wallet.nonCustodialAddress
    : '';

  // Only this wallet's own address gets a QR code (not the shared fallback address).
  const ownAddress = hasServerWallet() ? wallet.blinkAddress || '' : configuredLightningAddress;
  const [addressQrUrl, setAddressQrUrl] = useState<string>('');

  useEffect(() => {
    const text = isOpen && ownAddress ? addressQrText(ownAddress) : null;
    if (!text) { setAddressQrUrl(''); return; }
    QRCode.toDataURL(text, { margin: 2, width: 280, color: { dark: '#000000', light: '#FFFFFF' } })
      .then(setAddressQrUrl)
      .catch(() => setAddressQrUrl(''));
  }, [isOpen, ownAddress]);

  // Stop polling when modal closes or unmounts
  useEffect(() => {
    if (!isOpen && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOpen]);

  const handleBack = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (step === 'invoice' || step === 'error') {
      setStep('input');
      setErrorMessage('');
    } else {
      onClose();
    }
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
        if (!details.success || !details.callbackUrl) {
          setErrorMessage(details.error || 'Could not reach the Lightning address saved in Wallet Settings.');
          setStep('error');
          return;
        }

        const externalInvoice = await createLightningInvoice(
          details.callbackUrl,
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

      const qrData = await QRCode.toDataURL(res.invoice.toUpperCase(), {
        margin: 2,
        width: 280,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
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
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await checkInvoiceStatus(hash);
        if (res.paid || res.settled) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
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

  const handleCopyInvoice = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopiedInvoice(true);
    setTimeout(() => setCopiedInvoice(false), 2000);
  };

  const handleCopyAddress = () => {
    if (!ownAddress) return;
    navigator.clipboard.writeText(ownAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBack}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Stan Style Header with Textless Back Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--yb-outline-variant)]/60">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">Receive Lightning Sats</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Current balance readout */}
          <div className="flex justify-between items-center px-1 text-xs">
            <span className="text-[var(--yb-on-surface-variant)]">Current Balance</span>
            <span className="font-mono font-bold text-[var(--yb-on-surface)]">
              {currentSats.toLocaleString()} Sats
            </span>
          </div>

          {/* This wallet's own Lightning address (never a stand-in) */}
          {ownAddress && (
            <div className="flex justify-between items-center px-1 text-[11px]">
              <span className="text-[var(--yb-on-surface-variant)]">Lightning Address</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {ownAddress}
              </span>
            </div>
          )}

          {/* STEP 1: Input */}
          {step === 'input' && (
            <div className="space-y-4">
              {/* This wallet's Lightning address */}
              {ownAddress && <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] p-3 rounded-2xl text-left space-y-2">
                <div className="flex justify-between items-center text-[11px] text-[var(--yb-on-surface-variant)]">
                  <span>Static Lightning Address</span>
                  <span className="font-mono text-[10px] text-emerald-400">LNURL-pay</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--yb-on-surface)] select-all">
                    {ownAddress}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="p-1.5 rounded-lg bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                    title="Copy Lightning Address"
                  >
                    {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {addressQrUrl && (
                  <div className="flex justify-center pt-1">
                    <div className="p-2.5 bg-white rounded-2xl">
                      <img
                        src={addressQrUrl}
                        alt="Lightning Address QR Code"
                        className="w-44 h-44 rounded-lg object-contain block"
                      />
                    </div>
                  </div>
                )}
              </div>}

              {/* Sats to Receive */}
              <div>
                <label className="block text-xs font-semibold text-[var(--yb-secondary)] mb-1.5">
                  Sats to Receive via Invoice
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={satsAmountStr}
                    onChange={(e) => setSatsAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="1"
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[var(--yb-secondary)]">
                    Sats
                  </span>
                </div>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-6 gap-1.5">
                {[1, 10, 100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSatsAmountStr(preset.toString())}
                    className={`py-2 rounded-xl border text-xs font-mono font-medium ${
                      numericSats === preset
                        ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                        : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)] hover:border-[#554653]'
                    }`}
                  >
                    {preset === 1 ? '1 Sat' : preset.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center px-1 text-xs font-mono text-[var(--yb-on-surface-variant)]">
                <span>Routing Fee</span>
                <span className="text-emerald-400 font-semibold">0 Sats (Sender pays routing)</span>
              </div>

              <button
                type="button"
                onClick={handleCreateLightningInvoice}
                disabled={numericSats <= 0 || isGenerating}
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center disabled:opacity-50"
              >
                {isGenerating ? 'Generating...' : 'Create Invoice'}
              </button>
            </div>
          )}

          {/* STEP 2: Lightning Invoice Display */}
          {step === 'invoice' && (
            <div className="space-y-4 flex flex-col items-center text-center">
              <div className="w-full flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Invoice Amount</span>
                <span className="font-mono font-bold text-lg text-[var(--yb-on-surface)]">
                  {numericSats.toLocaleString()} Sats
                </span>
              </div>

              <div className="w-full flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Receiving Fee</span>
                <span className="font-mono font-semibold text-emerald-400">0 Sats (Free)</span>
              </div>

              {qrCodeUrl && (
                <div className="p-3.5 bg-white rounded-3xl shadow-xl border border-white/20 my-1">
                  <img
                    src={qrCodeUrl}
                    alt="Lightning Invoice QR Code"
                    className="w-56 h-56 rounded-xl object-contain block"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs font-mono text-[var(--yb-secondary)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--yb-primary)]" />
                <span>
                  Awaiting payment...
                </span>
              </div>

              <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] p-3 rounded-2xl text-left space-y-2">
                <div className="flex justify-between items-center text-[11px] text-[var(--yb-on-surface-variant)]">
                  <span>Lightning Invoice</span>
                  <span className="font-mono text-[10px]">BOLT-11</span>
                </div>
                <div className="font-mono text-[11px] text-[var(--yb-secondary)] break-all max-h-16 overflow-y-auto select-all leading-relaxed">
                  {invoice}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyInvoice}
                className="w-full h-11 rounded-2xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center"
              >
                {copiedInvoice ? 'Invoice Copied' : 'Copy Invoice'}
              </button>
            </div>
          )}

          {/* STEP 3: Success Screen */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-4">
              <SatsMotion mode="received" />

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Payment Received</h3>
              </div>

              <div className="p-3.5 bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl space-y-2 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">Amount Added</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    +<CountUp value={numericSats} /> Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">Receiving Fee</span>
                  <span className="text-xs font-mono font-semibold text-emerald-400">
                    0 Sats (Free)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">New Balance</span>
                  <span className="text-xs font-mono font-bold text-[var(--yb-on-surface)]">
                    {(currentSats + numericSats).toLocaleString()} Sats
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center"
              >
                Done
              </button>
            </div>
          )}

          {/* STEP 4: Error Screen */}
          {step === 'error' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Invoice Unavailable</h3>
                <p className="text-xs text-red-300 px-2 leading-relaxed">
                  {errorMessage}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('input');
                    setErrorMessage('');
                  }}
                  className="flex-1 h-11 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWalletSettings();
                  }}
                  className="flex-1 h-11 rounded-2xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center"
                >
                  Wallet Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
