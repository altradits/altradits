import React, { useState, useEffect } from 'react';
import { UserWallet, Transaction, ExchangeRates } from '../types';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, WifiOff } from 'lucide-react';
import { payInvoiceWithWebLN,
  isLightningAddress,
  resolveLightningAddress,
  createLightningInvoice,
} from '../services/lightningService';
import { calculateRealTransactionCost, RealTransactionCost } from '../services/blinkService';
import { isNetworkOnline, queueOfflineTransaction } from '../services/offlineService';

interface SendBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates?: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

function isOnChainAddress(input: string): boolean {
  const clean = input.trim().replace(/^(bitcoin|lightning):/i, '');
  const btcRegex = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i;
  return btcRegex.test(clean);
}

function sanitizeLightningInput(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^(lightning):/i, '');
  if (clean.includes('?')) {
    clean = clean.split('?')[0];
  }
  return clean.trim();
}

export const SendBtcModal: React.FC<SendBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [recipient, setRecipient] = useState<string>('');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('1000');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isNetworkFailure, setIsNetworkFailure] = useState<boolean>(false);
  const [resolvedProvider, setResolvedProvider] = useState<string>('');
  const [recipientType, setRecipientType] = useState<'unknown' | 'lightning_address' | 'lightning_invoice' | 'invalid_onchain'>('unknown');
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedCallback, setResolvedCallback] = useState<string>('');
  const [txReference, setTxReference] = useState<string>('');
  const [realCost, setRealCost] = useState<RealTransactionCost>({
    feeSats: 1,
    feeFiat: 0.11,
    feeFiatCurrency: 'KES',
    source: 'blink',
  });
  const [wasOfflineDispatched, setWasOfflineDispatched] = useState<boolean>(false);

  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const btcRate = rates?.btcKes || 11100000;

  // Real fee dynamically tracked via Blink
  const satsFee = realCost.feeSats;
  const totalDeducted = numericSats + satsFee;
  const isInsufficientSats = totalDeducted > availableSats;
  const currentlyOnline = isNetworkOnline();

  // Recalculate real transaction cost when amount changes
  useEffect(() => {
    calculateRealTransactionCost({
      type: 'lightning',
      satsAmount: numericSats,
      btcRate,
      currency: 'KES',
      isOffChainLightningRoute: true,
    }).then(setRealCost);
  }, [numericSats, btcRate]);

  // Auto-detect and resolve recipient format on change
  useEffect(() => {
    const clean = sanitizeLightningInput(recipient);
    if (!clean) {
      setRecipientType('unknown');
      setResolvedProvider('');
      setResolvedCallback('');
      setErrorMessage('');
      return;
    }

    if (isOnChainAddress(clean)) {
      setRecipientType('invalid_onchain');
      setResolvedProvider('On-Chain Bitcoin (Unsupported)');
      setResolvedCallback('');
      setErrorMessage('On-chain Bitcoin addresses are not supported. Ye₿ente operates exclusively on Lightning. Please enter a Lightning Address (e.g. name@blink.sv) or a BOLT-11 invoice (lnbc...).');
      return;
    }

    if (clean.toLowerCase().startsWith('lnbc')) {
      setRecipientType('lightning_invoice');
      setResolvedProvider('Lightning Invoice (BOLT-11)');
      setErrorMessage('');
      return;
    }

    if (isLightningAddress(clean)) {
      setRecipientType('lightning_address');
      setErrorMessage('');
      if (currentlyOnline) {
        setIsResolving(true);
        resolveLightningAddress(clean)
          .then((res) => {
            if (res.success) {
              setResolvedProvider(res.provider || 'Lightning Address');
              setResolvedCallback(res.callbackUrl || '');
            } else {
              setResolvedProvider('Lightning Address');
            }
          })
          .finally(() => setIsResolving(false));
      } else {
        setResolvedProvider('Lightning Address (Offline Mode)');
      }
      return;
    }

    setRecipientType('unknown');
    setResolvedProvider('');
    setResolvedCallback('');
  }, [recipient, currentlyOnline]);

  if (!isOpen) return null;

  const handleBack = () => {
    if (step === 'processing') return;
    if (step === 'error') {
      setStep('input');
      setErrorMessage('');
      setIsNetworkFailure(false);
    } else {
      onClose();
    }
  };

  const executeOfflineQueue = (targetRecipient: string) => {
    setWasOfflineDispatched(true);
    const offlineTxData: Omit<Transaction, 'id' | 'timestamp'> = {
      type: 'send_btc',
      title: 'Sent Lightning Sats',
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: numericSats,
      fee: satsFee,
      feeCurrency: 'SATS',
      realFeeSats: satsFee,
      realFeeFiat: realCost.feeFiat,
      realFeeCurrency: realCost.feeFiatCurrency,
      feeRateSatPerVb: 0,
      feeSource: 'blink',
      recipient: targetRecipient,
      referenceNumber: `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
      walletType: 'custodial',
      note: `Offline dispatch to ${resolvedProvider || targetRecipient}`,
      isOffline: true,
      offlineStatus: 'queued',
    };

    const { queuedTx } = queueOfflineTransaction(offlineTxData, wallet);
    setTxReference(queuedTx.referenceNumber);
    setStep('success');
  };

  const handleSend = async () => {
    const cleanRecipient = sanitizeLightningInput(recipient);
    if (!cleanRecipient) {
      setErrorMessage('Please enter a Lightning Address (e.g. name@blink.sv) or BOLT-11 invoice (lnbc...).');
      setIsNetworkFailure(false);
      return;
    }

    if (recipientType === 'invalid_onchain' || isOnChainAddress(cleanRecipient)) {
      setErrorMessage('On-chain Bitcoin addresses are not supported. Ye₿ente operates exclusively on Lightning. Please enter a Lightning Address or a BOLT-11 invoice.');
      setIsNetworkFailure(false);
      return;
    }

    if (recipientType !== 'lightning_address' && recipientType !== 'lightning_invoice') {
      setErrorMessage('Please enter a valid Lightning Address (e.g. user@blink.sv) or a BOLT-11 invoice (lnbc...).');
      setIsNetworkFailure(false);
      return;
    }

    if (numericSats <= 0) {
      setErrorMessage('Please enter an amount of 1 satoshi or more.');
      setIsNetworkFailure(false);
      return;
    }

    if (isInsufficientSats) {
      setErrorMessage(`Insufficient balance. Required: ${totalDeducted.toLocaleString()} Sats (including fee). Available: ${availableSats.toLocaleString()} Sats.`);
      setIsNetworkFailure(false);
      return;
    }

    // If device is strictly offline, immediately queue offline transaction
    if (!isNetworkOnline()) {
      executeOfflineQueue(cleanRecipient);
      return;
    }

    setStep('processing');
    setErrorMessage('');
    setIsNetworkFailure(false);

    try {
      let finalInvoice = cleanRecipient;

      // 1. If recipient is a Lightning Address, generate invoice via callback
      if (recipientType === 'lightning_address' && resolvedCallback) {
        try {
          const invRes = await createLightningInvoice(resolvedCallback, numericSats, 'Ye₿ente Payout');
          if (invRes.success && invRes.invoice) {
            finalInvoice = invRes.invoice;
          }
        } catch {
          // If network error resolving callback, fall back to offline queue
          setIsNetworkFailure(true);
          setErrorMessage('Could not reach recipient Lightning server. You can queue this transaction offline.');
          setStep('error');
          return;
        }
      }

      // 2. Pay from the user's own wallet (WebLN) when one is present
      const ownWallet = await payInvoiceWithWebLN(finalInvoice);
      if (ownWallet.paid) {
        const ref = `LN-${Date.now().toString(36).toUpperCase()}`;
        setTxReference(ref);
        completeTransaction(ref, cleanRecipient);
        return;
      }

      // 3. Dispatch via Lightning Backend
      try {
        const disburseRes = await fetch('/api/yebente/lightning/disburse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice: finalInvoice,
            satsAmount: numericSats,
            destination: cleanRecipient,
          }),
        });

        const disburseData = await disburseRes.json();

        if (disburseRes.ok && disburseData.success) {
          const ref = disburseData.paymentHash || `LN-${Date.now().toString(36).toUpperCase()}`;
          setTxReference(ref);
          completeTransaction(ref, cleanRecipient);
          return;
        }

        // Node unconfigured or unreachable: offer offline queue
        setIsNetworkFailure(true);
        setErrorMessage(
          disburseData.error ||
          'Lightning payment route unavailable. You can queue this transaction offline to broadcast upon reconnect.'
        );
        setStep('error');
        return;
      } catch (fetchErr: unknown) {
        setIsNetworkFailure(true);
        setErrorMessage('Network error communicating with payment router. You can queue this transaction offline.');
        setStep('error');
        return;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error dispatching payment';
      setIsNetworkFailure(true);
      setErrorMessage(message);
      setStep('error');
    }
  };

  const completeTransaction = (ref: string, targetRecipient: string) => {
    setWasOfflineDispatched(false);
    setStep('success');
    onSuccess({
      type: 'send_btc',
      title: 'Sent Lightning Sats',
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: numericSats,
      fee: satsFee,
      feeCurrency: 'SATS',
      realFeeSats: satsFee,
      realFeeFiat: realCost.feeFiat,
      realFeeCurrency: realCost.feeFiatCurrency,
      feeRateSatPerVb: 0,
      feeSource: 'blink',
      recipient: targetRecipient,
      referenceNumber: ref,
      walletType: 'custodial',
      note: `Dispatched to ${resolvedProvider || targetRecipient}`,
    });
  };

  const isFormValid =
    (recipientType === 'lightning_address' || recipientType === 'lightning_invoice') &&
    numericSats > 0 &&
    !isInsufficientSats;

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
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">Send Lightning Sats</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <div className="space-y-4">
              {/* Current balance readout without button box */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Available Balance</span>
                <span className="font-mono font-bold text-[var(--yb-on-surface)]">
                  {availableSats.toLocaleString()} Sats
                </span>
              </div>

              {/* Recipient Input */}
              <div>
                <label className="block text-xs font-semibold text-[var(--yb-secondary)] mb-1.5">
                  Lightning Destination
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="user@blink.sv, user@walletofsatoshi.com, or lnbc..."
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                  {isResolving && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--yb-primary)]" />
                    </div>
                  )}
                </div>

                {/* Auto-detected Recipient Badge */}
                {resolvedProvider && (
                  <div className={`flex items-center justify-between mt-1.5 px-1 text-[11px] font-mono ${
                    recipientType === 'invalid_onchain' ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    <span>Detected Destination</span>
                    <span>{resolvedProvider}</span>
                  </div>
                )}
              </div>

              {/* Sats Amount Input */}
              <div>
                <div className="flex justify-between items-center text-xs text-[var(--yb-secondary)] mb-1.5">
                  <span className="font-semibold">Sats to Send</span>
                  <button
                    type="button"
                    onClick={() => {
                      const maxSend = Math.max(0, availableSats - satsFee);
                      setSatsAmountStr(maxSend.toString());
                    }}
                    className="text-[var(--yb-secondary)] hover:underline font-mono text-[11px]"
                  >
                    MAX
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="500"
                    min="1"
                    value={satsAmountStr}
                    onChange={(e) => setSatsAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="1000"
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[var(--yb-secondary)]">
                    Sats
                  </span>
                </div>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 5000, 10000].map((preset) => (
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
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Real Transaction Cost Readouts (borderless typographic rows) */}
              <div className="space-y-1.5 px-1 pt-1 text-xs">
                <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                  <span>Lightning Routing Fee</span>
                  <span className="font-mono text-[var(--yb-secondary)]">
                    {satsFee.toLocaleString()} Sat (~{realCost.feeFiat} {realCost.feeFiatCurrency})
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                  <span>Total Deducted</span>
                  <span className="font-mono font-bold text-[var(--yb-on-surface)]">{totalDeducted.toLocaleString()} Sats</span>
                </div>
              </div>

              {/* Error message */}
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit CTA Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!isFormValid}
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center disabled:opacity-50"
              >
                Send Sats
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--yb-primary-container)]/20 border border-[var(--yb-primary)]/40 flex items-center justify-center text-[var(--yb-secondary)]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Routing Lightning Payment</h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)] font-mono">
                  Settling off-chain via Lightning Network...
                </p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Payment Sent</h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)]">
                  {wasOfflineDispatched
                    ? 'Transaction recorded in local vault. Will sync automatically upon reconnect.'
                    : `Dispatched to ${resolvedProvider || recipient}.`}
                </p>
              </div>

              <div className="p-3.5 bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl space-y-2 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">Amount Sent</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    -{numericSats.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">Routing Fee</span>
                  <span className="text-xs font-mono text-[var(--yb-secondary)]">
                    {satsFee.toLocaleString()} Sat (~{realCost.feeFiat} {realCost.feeFiatCurrency})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">Reference</span>
                  <span className="text-xs font-mono text-[var(--yb-secondary)] break-all">
                    {txReference}
                  </span>
                </div>
                {wasOfflineDispatched && (
                  <div className="flex justify-between items-center pt-1 border-t border-[var(--yb-outline-variant)]/60">
                    <span className="text-xs text-amber-400">Status</span>
                    <span className="text-xs font-mono text-amber-300">Queued Offline</span>
                  </div>
                )}
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

          {step === 'error' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Payment Failed</h3>
                <p className="text-xs text-red-300 px-2 leading-relaxed">
                  {errorMessage}
                </p>
              </div>

              <div className="space-y-2">
                {isNetworkFailure && (
                  <button
                    type="button"
                    onClick={() => executeOfflineQueue(recipient)}
                    className="w-full h-11 rounded-2xl bg-amber-600 hover:bg-amber-500 text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center gap-1.5"
                  >
                    <WifiOff className="w-4 h-4" />
                    <span>Queue Offline Settlement</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStep('input');
                    setErrorMessage('');
                    setIsNetworkFailure(false);
                  }}
                  className="w-full h-11 rounded-2xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
