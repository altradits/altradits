import { payInvoiceWithWebLN } from '../services/lightningService';
import { hasServerWallet, sendFromServerWallet } from '../services/altraditsWallet';
import { biometricOn, approveWithBiometric } from '../services/biometric';
import { SatsMotion, CountUp } from './SatsMotion';
import { celebrate } from '../services/celebrate';
import React, { useState, useEffect } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import {
  ArrowLeft,
  AlertTriangle,
  WifiOff,
  Copy,
  Check,
  ExternalLink,
  Fingerprint,
} from 'lucide-react';
import {
  isValidKenyanPhone,
  formatKenyanDisplayPhone,
  normalizeTandoPhone,
  getTandoLightningAddress,
  fetchTandoBounds,
  requestTandoInvoice,
  pollTandoReceipt,
  TandoBoundsResult,
} from '../services/tandoService';
import {
  sendTelebirrPayout,
  formatEthiopianDisplayPhone,
  isValidEthiopianPhone,
} from '../services/telebirrService';
import { isNetworkOnline, queueOfflineTransaction } from '../services/offlineService';
import { KenyaPhoneInput } from './KenyaPhoneInput';
import { EthiopiaPhoneInput } from './EthiopiaPhoneInput';

interface SendMpesaModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const SendMpesaModal: React.FC<SendMpesaModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [rail, setRail] = useState<'mpesa' | 'telebirr'>('mpesa');
  const [amountMode, setAmountMode] = useState<'fiat' | 'sats'>('fiat');
  const [phone, setPhone] = useState<string>('');
  const [fiatAmountStr, setFiatAmountStr] = useState<string>('500');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [processingStatus, setProcessingStatus] = useState<string>('Initiating Lightning Transfer...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [merchantRecipientName, setMerchantRecipientName] = useState<string>('');
  const [tandoReceiptUrl, setTandoReceiptUrl] = useState<string>('');
  const [isNetworkFailure, setIsNetworkFailure] = useState<boolean>(false);
  const [wasOfflineQueued, setWasOfflineQueued] = useState<boolean>(false);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('');
  const server = hasServerWallet();
  const [usePin, setUsePin] = useState(false);
  // Fingerprint / face on this phone: no PIN typed on screen.
  const useBio = server && rail === 'mpesa' && biometricOn() && !usePin;

  // Tando live bounds state
  const [tandoBounds, setTandoBounds] = useState<TandoBoundsResult | null>(null);

  // Fetch live Tando bounds when phone changes. Hooks run before the early
  // return below, in the same order on every render (React error #310).
  useEffect(() => {
    if (isOpen && rail === 'mpesa' && isValidKenyanPhone(phone) && isNetworkOnline()) {
      fetchTandoBounds(phone).then((bounds) => {
        if (bounds.success) {
          setTandoBounds(bounds);
        }
      });
    } else {
      setTandoBounds(null);
    }
  }, [isOpen, phone, rail]);

  if (!isOpen) return null;

  const currentRate = rail === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = rail === 'mpesa' ? 'KES' : 'ETB';
  const amountValue = parseFloat(amountMode === 'fiat' ? fiatAmountStr : satsAmountStr) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  // Multiplier from Tando: msat per KES (e.g. 9207 msat/KES ~ 9.207 sats/KES)
  const tandoMultiplier = tandoBounds?.currency?.multiplier;

  // Calculate fiat and sats amounts using Tando's live rate when on M-Pesa
  let numericAmount = 0;
  let satsRequired = 0;

  if (rail === 'mpesa') {
    if (amountMode === 'fiat') {
      numericAmount = amountValue;
      satsRequired = tandoMultiplier
        ? Math.ceil((numericAmount * tandoMultiplier) / 1000)
        : currentRate > 0
          ? Math.round((numericAmount / currentRate) * 100_000_000)
          : 0;
    } else {
      satsRequired = Math.round(amountValue);
      numericAmount = tandoMultiplier
        ? Math.floor((satsRequired * 1000) / tandoMultiplier)
        : currentRate > 0
          ? Math.round((satsRequired / 100_000_000) * currentRate)
          : 0;
    }
  } else {
    // Telebirr
    numericAmount = amountMode === 'fiat'
      ? amountValue
      : currentRate > 0
        ? Math.round((amountValue / 100_000_000) * currentRate)
        : 0;

    satsRequired = currentRate > 0
      ? amountMode === 'fiat'
        ? Math.round((numericAmount / currentRate) * 100_000_000)
        : Math.round(amountValue)
      : 0;
  }

  // Tando charges a flat 1% conversion fee
  const satsFee = rail === 'mpesa'
    ? Math.max(1, Math.ceil(satsRequired * 0.01))
    : 250;

  const feeFiat = currentRate > 0 ? Math.round((satsFee / 100_000_000) * currentRate * 100) / 100 : 0;
  const totalSatsDeducted = satsRequired + satsFee;
  const isInsufficientSats = totalSatsDeducted > availableSats;
  const currentlyOnline = isNetworkOnline();

  const getRecipientDisplay = () =>
    rail === 'mpesa' ? formatKenyanDisplayPhone(phone) : formatEthiopianDisplayPhone(phone);

  const isPhoneValid = rail === 'mpesa' ? isValidKenyanPhone(phone) : isValidEthiopianPhone(phone);
  const tandoLightningAddress = rail === 'mpesa' && isPhoneValid ? getTandoLightningAddress(phone) : '';

  const handleQueueOffline = () => {
    setWasOfflineQueued(true);
    const offlineTxData: Omit<Transaction, 'id' | 'timestamp'> = {
      type: rail === 'mpesa' ? 'send_mpesa' : 'send_telebirr',
      title: `${rail === 'mpesa' ? 'Send M-Pesa' : 'Send Telebirr'} (${getRecipientDisplay()})`,
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: satsRequired,
      toCurrency: currencyCode,
      toAmount: numericAmount,
      fee: satsFee,
      feeCurrency: 'SATS',
      realFeeSats: satsFee,
      realFeeFiat: feeFiat,
      realFeeCurrency: currencyCode,
      feeSource: 'blink',
      rateUsed: currentRate,
      recipient: getRecipientDisplay(),
      referenceNumber: `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
      walletType: 'custodial',
      note: `Queued offline payout to ${getRecipientDisplay()}`,
      isOffline: true,
      offlineStatus: 'queued',
    };

    const { queuedTx } = queueOfflineTransaction(offlineTxData, wallet);
    setRealReference(queuedTx.referenceNumber);
    setStep('success');
  };

  const handleConfirm = async () => {
    if (numericAmount <= 0) return;

    if (!isPhoneValid) {
      setErrorMessage(
        rail === 'mpesa'
          ? 'Enter a valid Kenyan Safaricom phone number: 07XXXXXXXX or 01XXXXXXXX.'
          : 'Enter a valid Ethiopian Telebirr phone number: 09XXXXXXXX or 07XXXXXXXX.'
      );
      setStep('error');
      setIsNetworkFailure(false);
      return;
    }

    if (isInsufficientSats) {
      setErrorMessage(
        `Insufficient Sats balance. Required: ${totalSatsDeducted.toLocaleString()} Sats, Available: ${availableSats.toLocaleString()} Sats.`
      );
      setStep('error');
      setIsNetworkFailure(false);
      return;
    }

    if (!isNetworkOnline()) {
      handleQueueOffline();
      return;
    }

    // Fingerprint / face first, before anything is shown as sending.
    let passkey: unknown;
    if (useBio) {
      try {
        passkey = await approveWithBiometric();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Fingerprint not confirmed.');
        setStep('error');
        setIsNetworkFailure(false);
        return;
      }
    }

    setStep('processing');
    setErrorMessage('');
    setIsNetworkFailure(false);
    setWasOfflineQueued(false);
    setMerchantRecipientName('');
    setTandoReceiptUrl('');

    try {
      if (rail === 'mpesa') {
        // --- PURE TANDO LIGHTNING INTEGRATION (bitcoin.co.ke) ---
        setProcessingStatus('Requesting Tando Lightning Invoice...');

        // Step 1: Request BOLT11 invoice priced in KES directly from Tando
        const invoiceRes = await requestTandoInvoice({
          phone,
          amount: numericAmount,
          mode: 'KES',
          callbackUrl: tandoBounds?.callback,
        });

        if (!invoiceRes.success || !invoiceRes.pr) {
          setErrorMessage(invoiceRes.error || 'Failed to request Lightning invoice from Tando API.');
          setStep('error');
          setIsNetworkFailure(true);
          return;
        }

        const paymentHash = invoiceRes.paymentHash;
        const receiptUrl = invoiceRes.successAction?.url || (paymentHash ? `https://bitcoin.co.ke/receipt/${paymentHash}` : '');
        setTandoReceiptUrl(receiptUrl);

        // Step 2: Settle payment off-chain: from the Altradits wallet (with the PIN),
        // or from the user's own wallet (WebLN)
        let paid: { paid: boolean; error?: string };
        if (server) {
          try {
            await sendFromServerWallet(invoiceRes.pr, 0, pin, passkey);
            setPin('');
            paid = { paid: true };
          } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Lightning payment route unavailable.');
            setStep('error');
            setIsNetworkFailure(false);
            return;
          }
        } else {
          paid = await payInvoiceWithWebLN(invoiceRes.pr);
        }
        if (!paid.paid) {
          setErrorMessage('Lightning payment route unavailable. You can queue this transaction offline to broadcast upon reconnect.');
          setStep('error');
          setIsNetworkFailure(true);
          return;
        }
        setProcessingStatus('Delivering Shillings to M-Pesa handset...');

        // Step 3: Poll Tando receipt endpoint for the confirmed Safaricom receipt code
        if (paymentHash) {
          const pollRes = await pollTandoReceipt(paymentHash, {
            timeoutMs: 90000,
            intervalMs: 3000,
            onUpdate: (tx) => {
              if (tx.merchantName) setMerchantRecipientName(tx.merchantName);
            },
          });

          if (pollRes.success && pollRes.transaction) {
            const tx = pollRes.transaction;
            const refCode = tx.paymentNetworkReceipt || paymentHash.slice(0, 10).toUpperCase();
            setRealReference(refCode);
            if (tx.merchantName) setMerchantRecipientName(tx.merchantName);

            onSuccess({
              type: 'send_mpesa',
              title: `Send M-Pesa (${formatKenyanDisplayPhone(phone)})`,
              status: 'completed',
              fromCurrency: 'SATS',
              fromAmount: satsRequired,
              toCurrency: 'KES',
              toAmount: tx.currencyAmountSent || numericAmount,
              fee: satsFee,
              feeCurrency: 'SATS',
              realFeeSats: satsFee,
              realFeeFiat: feeFiat,
              realFeeCurrency: 'KES',
              feeSource: 'blink',
              rateUsed: currentRate,
              recipient: tx.merchantName ? `${tx.merchantName} (${formatKenyanDisplayPhone(phone)})` : formatKenyanDisplayPhone(phone),
              referenceNumber: refCode,
              receiptUrl,
              paymentHash,
              walletType: 'custodial',
              note: `Tando M-Pesa delivery to ${formatKenyanDisplayPhone(phone)}`,
            });

            celebrate({ kind: 'send', sats: totalSatsDeducted, label: `M-Pesa ${formatKenyanDisplayPhone(phone)}`, ref: paymentHash });
            setStep('success');
            return;
          }
        }

        // Fallback: If status poll times out, payment is in flight on M-Pesa side
        const fallbackRef = paymentHash ? paymentHash.slice(0, 10).toUpperCase() : `LN-${Date.now().toString(36).toUpperCase()}`;
        setRealReference(fallbackRef);

        onSuccess({
          type: 'send_mpesa',
          title: `Send M-Pesa (${formatKenyanDisplayPhone(phone)})`,
          status: 'pending',
          fromCurrency: 'SATS',
          fromAmount: satsRequired,
          toCurrency: 'KES',
          toAmount: numericAmount,
          fee: satsFee,
          feeCurrency: 'SATS',
          realFeeSats: satsFee,
          realFeeFiat: feeFiat,
          realFeeCurrency: 'KES',
          feeSource: 'blink',
          rateUsed: currentRate,
          recipient: formatKenyanDisplayPhone(phone),
          referenceNumber: fallbackRef,
          receiptUrl,
          paymentHash,
          walletType: 'custodial',
          note: `Tando M-Pesa transfer to ${formatKenyanDisplayPhone(phone)}`,
        });

        celebrate({ kind: 'send', sats: totalSatsDeducted, label: `M-Pesa ${formatKenyanDisplayPhone(phone)}`, ref: paymentHash });
        setStep('success');
      } else {
        // --- TELEBIRR INTEGRATION (ETHIOPIA) ---
        setProcessingStatus('Dispatching Telebirr Payment...');
        const res = await sendTelebirrPayout({
          phone,
          amount: numericAmount,
          currency: 'ETB',
          satsAmount: satsRequired,
          note: 'Sats to Telebirr Transfer',
        });

        if (!res.success) {
          setIsNetworkFailure(true);
          setErrorMessage(res.error || 'Failed to dispatch Telebirr payment.');
          setStep('error');
          return;
        }

        const refCode = res.referenceNumber || `TB-${Date.now().toString(36).toUpperCase()}`;
        setRealReference(refCode);

        onSuccess({
          type: 'send_telebirr',
          title: `Send Telebirr (${formatEthiopianDisplayPhone(phone)})`,
          status: 'completed',
          fromCurrency: 'SATS',
          fromAmount: satsRequired,
          toCurrency: 'ETB',
          toAmount: numericAmount,
          fee: satsFee,
          feeCurrency: 'SATS',
          realFeeSats: satsFee,
          realFeeFiat: feeFiat,
          realFeeCurrency: 'ETB',
          feeSource: 'blink',
          rateUsed: currentRate,
          recipient: getRecipientDisplay(),
          referenceNumber: refCode,
          walletType: 'custodial',
          note: `Telebirr payout to ${formatEthiopianDisplayPhone(phone)}`,
        });

        setStep('success');
      }
    } catch (err: unknown) {
      setIsNetworkFailure(true);
      setErrorMessage(err instanceof Error ? err.message : 'Error processing transfer.');
      setStep('error');
    }
  };

  const handleResetAndClose = () => {
    setStep('input');
    setErrorMessage('');
    setIsNetworkFailure(false);
    onClose();
  };

  const handleBack = () => {
    if (step === 'error') {
      setStep('input');
      setErrorMessage('');
      setIsNetworkFailure(false);
      return;
    }
    handleResetAndClose();
  };

  const handleCopyRef = () => {
    if (!realReference) return;
    navigator.clipboard.writeText(realReference);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const headerTitle = rail === 'mpesa' ? 'Send M-Pesa' : 'Send Telebirr';
  const ctaLabel = isInsufficientSats
    ? 'Insufficient Sats Balance'
    : !currentlyOnline
      ? 'Queue Offline'
      : headerTitle;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header with Textless Back Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--yb-outline-variant)]/60">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">{headerTitle}</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Rail Selection */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select mobile network">
                <button
                  type="button"
                  onClick={() => {
                    setRail('mpesa');
                    setPhone('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold ${
                    rail === 'mpesa'
                      ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                      : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
                  }`}
                >
                  M-Pesa (Kenya)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRail('telebirr');
                    setPhone('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold ${
                    rail === 'telebirr'
                      ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                      : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
                  }`}
                >
                  Telebirr (Ethiopia)
                </button>
              </div>

              {/* Balance Display */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Available</span>
                <span className="font-mono font-semibold text-[var(--yb-secondary)]">
                  {availableSats.toLocaleString()} Sats (~{Math.round((availableSats / 100_000_000) * currentRate).toLocaleString()} {currencyCode})
                </span>
              </div>

              {/* Phone Input */}
              {rail === 'mpesa' ? (
                <div>
                  <KenyaPhoneInput
                    value={phone}
                    onChange={(full) => setPhone(full)}
                    label="M-Pesa Recipient Phone"
                    ariaLabel="M-Pesa recipient phone"
                  />
                  {tandoLightningAddress && (
                    <div className="flex justify-between items-center px-1 pt-1 text-[11px] font-mono">
                      <span className="text-[var(--yb-on-surface-variant)]">Lightning Address</span>
                      <span className="text-emerald-400 truncate max-w-[220px]">{tandoLightningAddress}</span>
                    </div>
                  )}
                </div>
              ) : (
                <EthiopiaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Telebirr Recipient Phone"
                  ariaLabel="Telebirr recipient phone"
                />
              )}

              {/* Currency vs Sats toggle */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Amount entry mode">
                <button
                  type="button"
                  onClick={() => setAmountMode('fiat')}
                  aria-pressed={amountMode === 'fiat'}
                  className={`h-10 rounded-xl border text-xs font-semibold ${
                    amountMode === 'fiat'
                      ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                      : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
                  }`}
                >
                  Enter {currencyCode}
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode('sats')}
                  aria-pressed={amountMode === 'sats'}
                  className={`h-10 rounded-xl border text-xs font-semibold ${
                    amountMode === 'sats'
                      ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                      : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
                  }`}
                >
                  Enter Sats
                </button>
              </div>

              {/* Amount input */}
              <div>
                <label className="block text-xs font-semibold text-[var(--yb-secondary)] mb-1.5">
                  {amountMode === 'fiat' ? `${headerTitle} amount` : 'Sats to send'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountMode === 'fiat' ? fiatAmountStr : satsAmountStr}
                    onChange={(e) => {
                      if (amountMode === 'fiat') {
                        setFiatAmountStr(e.target.value);
                      } else {
                        setSatsAmountStr(e.target.value);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    min="1"
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[var(--yb-secondary)]">
                    {amountMode === 'fiat' ? currencyCode : 'Sats'}
                  </span>
                </div>
              </div>

              {/* Tando Rail & Limits Details */}
              {rail === 'mpesa' && tandoBounds?.currency && (
                <div className="flex justify-between items-center px-1 text-[11px] font-mono text-[var(--yb-on-surface-variant)]">
                  <span>Tando Limits</span>
                  <span className="text-[var(--yb-secondary)]">
                    {tandoBounds.currency.minSendable} - {tandoBounds.currency.maxSendable.toLocaleString()} KES
                  </span>
                </div>
              )}

              {/* Real cost summary */}
              <div className="space-y-1.5 px-1 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--yb-on-surface-variant)]">Sats deducted</span>
                  <span className="font-bold text-[var(--yb-on-surface)]">
                    {totalSatsDeducted.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                  <span>{rail === 'mpesa' ? 'M-Pesa payout' : 'Telebirr payout'}</span>
                  <span>{numericAmount.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                  <span>{rail === 'mpesa' ? 'Tando Fee (1%)' : 'Real Transaction Cost'}</span>
                  <span>{satsFee} Sats (~{feeFiat} {currencyCode})</span>
                </div>
              </div>

              {/* Every payment is approved on its own, even while the app is open. */}
              {server && rail === 'mpesa' && (
                <p className="text-[11px] text-[var(--yb-on-surface-variant)]">Every payment needs your {biometricOn() ? 'fingerprint, face or ' : ''}PIN, even while the app is open. If someone picks up your phone, they still can't send.</p>
              )}
              {/* PIN for the Altradits wallet */}
              {server && rail === 'mpesa' && !useBio && (
                <div>
                  <div className="text-xs text-[var(--yb-secondary)] mb-1.5 font-semibold">PIN</div>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="yb-sensitive w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-lg font-mono tracking-[0.5em] text-[var(--yb-on-surface)] focus:outline-none"
                  />
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  amountValue <= 0 ||
                  !isPhoneValid ||
                  isInsufficientSats ||
                  (server && rail === 'mpesa' && !useBio && !/^\d{6}$/.test(pin))
                }
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {useBio && <Fingerprint className="w-4 h-4" />}
                {ctaLabel}
              </button>
              {server && rail === 'mpesa' && biometricOn() && (
                <button
                  type="button"
                  onClick={() => { setUsePin(!usePin); setPin(''); }}
                  className="w-full text-center text-[11px] font-semibold text-[var(--yb-primary)] hover:underline"
                >
                  {usePin ? 'Use fingerprint instead' : 'Use PIN instead'}
                </button>
              )}
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <SatsMotion mode="sending" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">
                  {rail === 'mpesa' ? 'Sending M-Pesa via Tando' : 'Sending Telebirr'}
                </h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)] font-mono">{processingStatus}</p>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-950/30 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Transfer Failed</h3>
                <p className="text-xs text-red-300 mt-1 max-w-xs">{errorMessage}</p>
              </div>

              <div className="flex gap-2 w-full">
                {isNetworkFailure && (
                  <button
                    type="button"
                    onClick={handleQueueOffline}
                    className="flex-1 h-11 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center"
                  >
                    Queue Offline
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="flex-1 h-11 rounded-2xl bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] text-[var(--yb-on-surface)] font-medium text-xs"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <SatsMotion mode="sent" />
              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">
                  {wasOfflineQueued
                    ? 'Queued Offline'
                    : rail === 'mpesa'
                      ? 'M-Pesa Delivered'
                      : 'Telebirr Sent'}
                </h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)] font-mono mt-0.5">
                  {wasOfflineQueued
                    ? 'Transaction recorded locally and will synchronize upon reconnect'
                    : '100% Settled via Bitcoin Lightning Rail'}
                </p>
              </div>

              <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Delivered</span>
                  <span className="text-emerald-400 font-bold"><CountUp value={numericAmount} /> {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Recipient</span>
                  <span className="text-[var(--yb-secondary)]">
                    {merchantRecipientName ? `${merchantRecipientName} (${getRecipientDisplay()})` : getRecipientDisplay()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Sats Deducted</span>
                  <span className="text-[var(--yb-secondary)] font-bold">{totalSatsDeducted.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">{rail === 'mpesa' ? 'Tando Fee (1%)' : 'Real Cost'}</span>
                  <span className="text-[var(--yb-secondary)]">{satsFee} Sats (~{feeFiat} {currencyCode})</span>
                </div>
                {realReference && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--yb-on-surface-variant)]">M-Pesa Code</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-300 font-bold text-xs truncate max-w-[150px]">{realReference}</span>
                      <button
                        type="button"
                        onClick={handleCopyRef}
                        className="p-1 text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                        title="Copy code"
                      >
                        {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
                {tandoReceiptUrl && (
                  <div className="flex justify-between items-center pt-1 border-t border-[var(--yb-outline-variant)]/60">
                    <span className="text-[var(--yb-on-surface-variant)]">Receipt</span>
                    <a
                      href={tandoReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--yb-secondary)] hover:text-[var(--yb-on-surface)] underline flex items-center gap-1"
                    >
                      <span>bitcoin.co.ke</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full h-11 rounded-2xl bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] text-[var(--yb-on-surface)] font-medium text-sm"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
