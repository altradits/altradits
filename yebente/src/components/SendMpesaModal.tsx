import { payInvoiceWithWebLN } from '../services/lightningService';
import { hasServerWallet, sendFromServerWallet } from '../services/altraditsWallet';
import { biometricOn, approveWithBiometric } from '../services/biometric';
import { HoldNotice } from './HoldNotice';
import { SatsMotion, CountUp } from './SatsMotion';
import { celebrate } from '../services/celebrate';
import React, { useState, useEffect } from 'react';
import { UserWallet, ExchangeRates, Transaction, Currency } from '../types';
import {
  ArrowLeft,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Fingerprint,
} from 'lucide-react';
import {
  Rail,
  RailQuote,
  fetchRails,
  isValidNumber,
  displayNumber,
  railAddress,
  fetchQuote,
  requestInvoice,
  pollReceipt,
} from '../services/payoutRails';
import { isNetworkOnline } from '../services/offlineService';
import { PhoneInput } from './PhoneInput';

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
  const [amountMode, setAmountMode] = useState<'fiat' | 'sats'>('fiat');
  const [phone, setPhone] = useState<string>('');
  const [fiatAmountStr, setFiatAmountStr] = useState<string>('');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  // Paid, but the partner hasn't confirmed delivery: never shown as delivered.
  const [pending, setPending] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('Initiating Lightning Transfer...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [merchantRecipientName, setMerchantRecipientName] = useState<string>('');
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('');
  const server = hasServerWallet();
  const [usePin, setUsePin] = useState(false);
  // Fingerprint / face on this phone: no PIN typed on screen.
  const useBio = server && biometricOn() && !usePin;

  // The payout options the server has switched on (lib/rails.js): one button each.
  const [rails, setRails] = useState<Rail[]>([]);
  const [railId, setRailId] = useState('');
  const rail = rails.find((r) => r.id === railId) || rails[0];
  // The partner's live limits and rate for this number.
  const [quote, setQuote] = useState<RailQuote | null>(null);

  // Hooks run before the early return below, in the same order on every
  // render (React error #310).
  useEffect(() => {
    if (isOpen) fetchRails().then(setRails);
  }, [isOpen]);
  useEffect(() => {
    setQuote(null);
    if (isOpen && rail && isValidNumber(rail, phone) && isNetworkOnline()) {
      fetchQuote(rail, phone).then((q) => {
        if (q.success) setQuote(q);
      });
    }
  }, [isOpen, phone, rail?.id]);

  if (!isOpen) return null;
  if (!rail) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onClick={onClose}>
        <div className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-md p-6 text-center text-sm text-[var(--yb-on-surface-variant)]">
          Loading the mobile-money options…
        </div>
      </div>
    );
  }

  // The app's live rate for this currency, if it has one; the partner's own rate wins when known.
  const currentRate = ({ KES: rates.btcKes, ETB: rates.btcEtb, USD: rates.btcUsd } as Record<string, number>)[rail.currency] || 0;
  const currencyCode = rail.currency;
  const currency = rail.currency as Currency;
  const amountValue = parseFloat(amountMode === 'fiat' ? fiatAmountStr : satsAmountStr) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  // The partner's rate: msat per unit of its currency (e.g. 9207 msat per KES)
  const partnerMultiplier = quote?.currency?.multiplier;

  let numericAmount = 0;
  let satsRequired = 0;

  if (amountMode === 'fiat') {
    numericAmount = amountValue;
    satsRequired = partnerMultiplier
      ? Math.ceil((numericAmount * partnerMultiplier) / 1000)
      : currentRate > 0
        ? Math.round((numericAmount / currentRate) * 100_000_000)
        : 0;
  } else {
    satsRequired = Math.round(amountValue);
    numericAmount = partnerMultiplier
      ? Math.floor((satsRequired * 1000) / partnerMultiplier)
      : currentRate > 0
        ? Math.round((satsRequired / 100_000_000) * currentRate)
        : 0;
  }

  // The partner's fee (Tando: 1%), as the server's list states it
  const satsFee = rail.feePercent > 0 ? Math.max(1, Math.ceil((satsRequired * rail.feePercent) / 100)) : 0;

  const feeFiat = currentRate > 0 ? Math.round((satsFee / 100_000_000) * currentRate * 100) / 100 : 0;
  const totalSatsDeducted = satsRequired + satsFee;
  const isInsufficientSats = totalSatsDeducted > availableSats;
  const currentlyOnline = isNetworkOnline();

  const getRecipientDisplay = () => displayNumber(rail, phone);

  const isPhoneValid = isValidNumber(rail, phone);
  const recipientAddress = isPhoneValid ? railAddress(rail, phone) : '';

  const handleConfirm = async () => {
    if (numericAmount <= 0) return;

    if (!isPhoneValid) {
      setErrorMessage(`Enter a valid ${rail.name} number in ${rail.country}, like +${rail.dial} ${rail.example}.`);
      setStep('error');
      return;
    }

    if (isInsufficientSats) {
      setErrorMessage(
        `Insufficient Sats balance. Required: ${totalSatsDeducted.toLocaleString()} Sats, Available: ${availableSats.toLocaleString()} Sats.`
      );
      setStep('error');
      return;
    }

    if (!isNetworkOnline()) {
      setErrorMessage("You're offline. Connect to the internet to send.");
      setStep('error');
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
        return;
      }
    }

    setStep('processing');
    setErrorMessage('');
    setMerchantRecipientName('');
    setReceiptUrl('');

    try {
      setProcessingStatus(`Asking ${rail.partner} for an invoice...`);

      // Step 1: an invoice priced in the local currency, from the partner
      const invoiceRes = await requestInvoice(rail, {
        phone,
        amount: numericAmount,
        callbackUrl: quote?.callback,
      });

      if (!invoiceRes.success || !invoiceRes.pr) {
        setErrorMessage(invoiceRes.error || `${rail.partner} could not make an invoice.`);
        setStep('error');
        return;
      }

      const paymentHash = invoiceRes.paymentHash;
      const receipt = invoiceRes.receiptUrl || '';
      setReceiptUrl(receipt);

      // Step 2: Settle payment off-chain: from the Altradits wallet (with the PIN),
      // or from the user's own wallet (WebLN)
      let paid: { paid: boolean; error?: string };
      let paymentPending = false;
      if (server) {
        try {
          const sent = await sendFromServerWallet(invoiceRes.pr, 0, pin, passkey);
          setPin('');
          if (sent.status === 'pending') paymentPending = true;
          paid = { paid: true };
        } catch (err: unknown) {
          setErrorMessage(err instanceof Error ? err.message : 'Lightning payment route unavailable.');
          setStep('error');
          return;
        }
      } else {
        paid = await payInvoiceWithWebLN(invoiceRes.pr);
      }
      if (!paid.paid) {
        setErrorMessage(paid.error || 'No Lightning wallet was found in this browser to pay with.');
        setStep('error');
        return;
      }
      setProcessingStatus(`Delivering to ${rail.name}...`);

      // Step 3: wait for the partner's confirmation (e.g. the M-Pesa code)
      if (paymentHash && rail.receipt && !paymentPending) {
        const pollRes = await pollReceipt(rail, paymentHash, {
          timeoutMs: 90000,
          intervalMs: 3000,
          onUpdate: (tx) => {
            if (tx.merchantName) setMerchantRecipientName(tx.merchantName);
          },
        });

        if (pollRes.success && pollRes.payment) {
          const tx = pollRes.payment;
          const refCode = tx.paymentNetworkReceipt || paymentHash.slice(0, 10).toUpperCase();
          setRealReference(refCode);
          if (tx.merchantName) setMerchantRecipientName(tx.merchantName);

          onSuccess({
            type: 'send_mpesa',
            title: `Send ${rail.name}`,
            status: 'completed',
            fromCurrency: 'SATS',
            fromAmount: satsRequired,
            toCurrency: currency,
            toAmount: tx.currencyAmountSent || numericAmount,
            fee: satsFee,
            feeCurrency: 'SATS',
            realFeeSats: satsFee,
            realFeeFiat: feeFiat,
            realFeeCurrency: currency,
                  rateUsed: currentRate,
            recipient: tx.merchantName ? `${tx.merchantName} (${getRecipientDisplay()})` : getRecipientDisplay(),
            referenceNumber: refCode,
            receiptUrl: receipt,
            paymentHash,
            walletType: 'custodial',
            note: `${rail.name} delivery through ${rail.partner}`,
          });

          celebrate({ kind: 'send', sats: totalSatsDeducted, label: `${rail.name} ${getRecipientDisplay()}`, ref: paymentHash });
          setPending(false);
          setStep('success');
          return;
        }
      }

      // No confirmation yet: the payout is still on its way on the partner's side
      const fallbackRef = paymentHash ? paymentHash.slice(0, 10).toUpperCase() : `LN-${Date.now().toString(36).toUpperCase()}`;
      setRealReference(fallbackRef);

      onSuccess({
        type: 'send_mpesa',
        title: `Send ${rail.name}`,
        status: 'pending',
        fromCurrency: 'SATS',
        fromAmount: satsRequired,
        toCurrency: currency,
        toAmount: numericAmount,
        fee: satsFee,
        feeCurrency: 'SATS',
        realFeeSats: satsFee,
        realFeeFiat: feeFiat,
        realFeeCurrency: currency,
          rateUsed: currentRate,
        recipient: getRecipientDisplay(),
        referenceNumber: fallbackRef,
        receiptUrl: receipt,
        paymentHash,
        walletType: 'custodial',
        note: `${rail.name} payment through ${rail.partner}`,
      });

      // No confirmation: on its way, not delivered. No celebration.
      setPending(true);
      setStep('success');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error processing transfer.');
      setStep('error');
    }
  };

  const handleResetAndClose = () => {
    setStep('input');
    setErrorMessage('');
    onClose();
  };

  const handleBack = () => {
    if (step === 'error') {
      setStep('input');
      setErrorMessage('');
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

  const headerTitle = `Send ${rail.name}`;
  const ctaLabel = isInsufficientSats
    ? 'Insufficient Sats Balance'
    : !currentlyOnline
      ? "You're offline"
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
              {/* One button per switched-on payout option (from the server's list) */}
              {rails.length > 1 && (
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mobile money">
                  {rails.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={r.id === rail.id}
                      onClick={() => { setRailId(r.id); setPhone(''); setQuote(null); }}
                      className={`p-2.5 rounded-xl border text-xs font-semibold ${
                        r.id === rail.id
                          ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                          : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
                      }`}
                    >
                      {r.name} ({r.country})
                    </button>
                  ))}
                </div>
              )}

              {/* Balance Display */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Available</span>
                <span className="font-mono font-semibold text-[var(--yb-secondary)]">
                  {availableSats.toLocaleString()} Sats (~{Math.round((availableSats / 100_000_000) * currentRate).toLocaleString()} {currencyCode})
                </span>
              </div>
              {server && wallet.hold && <HoldNotice hold={wallet.hold} />}

              {/* Phone Input */}
              <div>
                <PhoneInput
                  key={rail.id}
                  dial={rail.dial}
                  digits={rail.digits}
                  example={rail.example}
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label={`${rail.name} recipient phone`}
                  ariaLabel={`${rail.name} recipient phone`}
                />
                {recipientAddress && (
                  <div className="flex justify-between items-center px-1 pt-1 text-[11px] font-mono">
                    <span className="text-[var(--yb-on-surface-variant)]">Lightning Address</span>
                    <span className="text-emerald-400 truncate max-w-[220px]">{recipientAddress}</span>
                  </div>
                )}
              </div>

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

              {/* The partner's limits */}
              {quote?.currency && (
                <div className="flex justify-between items-center px-1 text-[11px] font-mono text-[var(--yb-on-surface-variant)]">
                  <span>{rail.partner} limits</span>
                  <span className="text-[var(--yb-secondary)]">
                    {quote.currency.minSendable} - {quote.currency.maxSendable.toLocaleString()} {currencyCode}
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
                  <span>{rail.name} payout</span>
                  <span>{numericAmount.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                  <span>{rail.partner} fee ({rail.feePercent}%)</span>
                  <span>{satsFee} Sats (~{feeFiat} {currencyCode})</span>
                </div>
              </div>

              {/* Every payment is approved on its own, even while the app is open. */}
              {server && (
                <p className="text-[11px] text-[var(--yb-on-surface-variant)]">Every payment needs your {biometricOn() ? 'fingerprint, face or ' : ''}PIN, even while the app is open. If someone picks up your phone, they still can't send.</p>
              )}
              {/* PIN for the Altradits wallet */}
              {server && !useBio && (
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
                  (server && !useBio && !/^\d{6}$/.test(pin))
                }
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {useBio && <Fingerprint className="w-4 h-4" />}
                {ctaLabel}
              </button>
              {server && biometricOn() && (
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
                  Sending {rail.name} through {rail.partner}
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
              {pending ? <SatsMotion mode="sending" /> : <SatsMotion mode="sent" />}
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">
                  {pending ? `${rail.name} not confirmed yet` : `${rail.name} delivered`}
                </h3>
                {pending && (
                  <p className="text-xs text-[var(--yb-on-surface-variant)]">
                    {rail.partner} hasn't confirmed delivery yet. Check History in a few minutes.
                  </p>
                )}
              </div>

              <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">{pending ? 'Amount' : 'Delivered'}</span>
                  <span className={`${pending ? 'text-[var(--yb-secondary)]' : 'text-emerald-400'} font-bold`}><CountUp value={numericAmount} /> {currencyCode}</span>
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
                  <span className="text-[var(--yb-on-surface-variant)]">{rail.partner} fee ({rail.feePercent}%)</span>
                  <span className="text-[var(--yb-secondary)]">{satsFee} Sats (~{feeFiat} {currencyCode})</span>
                </div>
                {realReference && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--yb-on-surface-variant)]">{rail.name} code</span>
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
                {receiptUrl && (
                  <div className="flex justify-between items-center pt-1 border-t border-[var(--yb-outline-variant)]/60">
                    <span className="text-[var(--yb-on-surface-variant)]">Receipt</span>
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--yb-secondary)] hover:text-[var(--yb-on-surface)] underline flex items-center gap-1"
                    >
                      <span>{rail.host}</span>
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
