import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { ArrowLeft, Smartphone, CheckCircle2, Loader2, AlertTriangle, Zap, Copy, Check, RefreshCw } from 'lucide-react';
import {
  initiateStkPush,
  queryStkStatus,
  isValidKenyanPhone,
  formatKenyanDisplayPhone,
} from '../services/mpesaService';
import { fetchBuyProvider, startBitikaBuy, bitikaStatus, BuyProvider } from '../services/bitikaService';
import { fetchServerWallet } from '../services/altraditsWallet';
import { isLightningAddress, resolveLightningAddress, createLightningInvoice } from '../services/lightningService';
import { PhoneInput } from './PhoneInput';
import { SatsMotion } from './SatsMotion';
import { celebrate } from '../services/celebrate';

interface BuyBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const BuyBtcModal: React.FC<BuyBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [amountFiat, setAmountFiat] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'awaiting_pin' | 'waiting_sats' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [activeCheckoutId, setActiveCheckoutId] = useState<string>('');
  const [isVerifyingStatus, setIsVerifyingStatus] = useState<boolean>(false);
  const [pinSecondsLeft, setPinSecondsLeft] = useState<number>(120);
  const [inFlightStatus, setInFlightStatus] = useState<string>('Safaricom has dispatched a payment prompt to your phone.');
  const [lightningInvoice, setLightningInvoice] = useState<string>('');
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  // Bitika (M-Pesa or Airtel Money through a partner) while the server offers
  // it; otherwise the Daraja STK flow below runs unchanged.
  const [provider, setProvider] = useState<BuyProvider | 'loading'>('loading');
  const [bitikaCode, setBitikaCode] = useState<string>('');
  const [bitikaSats, setBitikaSats] = useState<number>(0);
  const [bitikaFeeKes, setBitikaFeeKes] = useState<number>(0);
  const [satsReceived, setSatsReceived] = useState<number>(0);
  const [paidTimedOut, setPaidTimedOut] = useState<boolean>(false);
  const isCustodialWallet = wallet.type === 'custodial';
  const configuredDestination = isCustodialWallet
    ? 'In-App Vault'
    : wallet.nonCustodialAddress;

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const balancePollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (balancePollRef.current) {
        clearInterval(balancePollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setProvider('loading');
    fetchBuyProvider().then((p) => setProvider(p || 'mpesa'));
  }, [isOpen]);

  if (!isOpen) return null;

  const viaBitika = provider === 'bitika';

  // Only the live rate: with none, the amount in sats isn't shown or bought.
  const currentRate = rates.btcKes;
  const currencyCode = 'KES';
  const numericFiat = parseFloat(amountFiat) || 0;
  const satsAmount = currentRate > 0 ? Math.round((numericFiat / currentRate) * 100_000_000) : 0;
  const estimatedFee = 0; // Lipa Na M-Pesa STK push has no receiving fee
  // Bitika celebrates only the rise actually seen on the balance.
  const successSats = viaBitika ? satsReceived : satsAmount;

  const displayPhone = formatKenyanDisplayPhone(phone);

  const handleCopyInvoice = () => {
    if (lightningInvoice) {
      navigator.clipboard.writeText(lightningInvoice);
      setCopiedInvoice(true);
      setTimeout(() => setCopiedInvoice(false), 2000);
    }
  };

  const handleManualVerify = async () => {
    if (viaBitika) {
      if (!bitikaCode || isVerifyingStatus) return;
      setIsVerifyingStatus(true);
      try {
        const st = await bitikaStatus(bitikaCode);
        processBitikaResponse(st);
      } finally {
        setIsVerifyingStatus(false);
      }
      return;
    }
    if (!activeCheckoutId || isVerifyingStatus) return;
    setIsVerifyingStatus(true);
    try {
      const queryRes = await queryStkStatus(activeCheckoutId);
      processQueryResponse(queryRes);
    } finally {
      setIsVerifyingStatus(false);
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (balancePollRef.current) {
      clearInterval(balancePollRef.current);
      balancePollRef.current = null;
    }
  };

  // A Bitika status answer: paid means the phone money moved, not that sats
  // arrived. "Sats received" shows only when the wallet balance actually rises.
  const processBitikaResponse = (st: any) => {
    if (!st?.success) return; // unclear answer: keep polling
    if (st.inProgress) {
      setInFlightStatus(st.message || 'Check your phone for the M-Pesa prompt.');
      return;
    }
    if (st.state === 'fulfilled') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setInFlightStatus('Paid. Waiting for your sats to arrive.');
      setStep('waiting_sats');
      watchBalance();
      return;
    }
    stopPolling();
    setErrorMessage(st.message || 'The payment did not go through. No sats were sent.');
    setStep('error');
  };

  // The balance is the only proof sats arrived: watch it rise above what it
  // was before the buy, then celebrate the actual rise.
  const watchBalance = async () => {
    let before = wallet.satsBalance || 0;
    try {
      before = (await fetchServerWallet()).balance ?? before;
    } catch {
      // Keep the last known balance.
    }
    let remaining = 180;
    if (balancePollRef.current) clearInterval(balancePollRef.current);
    balancePollRef.current = setInterval(async () => {
      remaining -= 3;
      try {
        const w = await fetchServerWallet();
        if (w.balance > before) {
          const received = w.balance - before;
          stopPolling();
          setSatsReceived(received);
          onSuccess({
            type: 'buy_btc',
            title: 'Buy Sats via M-Pesa',
            status: 'completed',
            fromCurrency: 'KES',
            fromAmount: numericFiat,
            toCurrency: 'SATS',
            toAmount: received,
            rateUsed: currentRate,
            fee: bitikaFeeKes,
            feeCurrency: 'KES',
            realFeeSats: 0,
            realFeeFiat: bitikaFeeKes,
            realFeeCurrency: 'KES',
            recipient: 'Your Ye₿ente wallet',
            referenceNumber: bitikaCode,
            walletType: 'custodial',
            note: 'Bitika purchase to In-App Vault',
          });
          celebrate({ kind: 'receive', sats: received, label: 'M-Pesa', ref: bitikaCode });
          setStep('success');
          return;
        }
      } catch {
        // Offline or locked: keep watching until the window ends.
      }
      if (remaining <= 0) {
        stopPolling();
        setPaidTimedOut(true); // paid, but the sats are still on their way
      }
    }, 3000);
  };

  const handleBitikaConfirm = async () => {
    setStep('processing');
    setErrorMessage('');
    setPaidTimedOut(false);
    const res = await startBitikaBuy(numericFiat, phone);
    if (!res.success || !res.code) {
      setErrorMessage(res.error || 'Bitika did not start the payment.');
      setStep('error');
      return;
    }
    setBitikaCode(res.code);
    setRealReference(res.code);
    setBitikaSats(res.sats || 0);
    setBitikaFeeKes(res.feeKes || 0);
    setPinSecondsLeft(180);
    setInFlightStatus('Check your phone for the M-Pesa prompt.');
    setStep('awaiting_pin');
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    let remaining = 180;
    pollIntervalRef.current = setInterval(async () => {
      remaining -= 3;
      setPinSecondsLeft(Math.max(0, remaining));
      try {
        const st = await bitikaStatus(res.code as string);
        processBitikaResponse(st);
      } catch {
        // Continue polling until timeout
      }
      if (remaining <= 0) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        try {
          const finalRes = await bitikaStatus(res.code as string);
          processBitikaResponse(finalRes);
        } catch {
          // Keep window accessible for manual verification
        }
        setInFlightStatus('Verification window paused. If you entered your PIN, click "Check Status Now".');
      }
    }, 3000);
  };

  const processQueryResponse = (queryRes: any) => {
    const code = queryRes?.resultCode;

    // 1. ResultCode 0 or '0' indicates confirmed settlement by Safaricom
    if (code === 0 || code === '0') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      const refCode = queryRes.mpesaReceiptNumber || activeCheckoutId;
      setRealReference(refCode);

      onSuccess({
        type: 'buy_btc',
        title: 'Buy Sats via M-Pesa',
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: numericFiat,
        toCurrency: 'SATS',
        toAmount: satsAmount,
        rateUsed: currentRate,
        fee: estimatedFee,
        feeCurrency: 'KES',
        realFeeSats: 0,
        realFeeFiat: estimatedFee,
        realFeeCurrency: 'KES',
        recipient: isCustodialWallet ? 'Your Ye₿ente wallet' : configuredDestination,
        referenceNumber: refCode,
        walletType: 'custodial',
        note: `Daraja STK purchase to ${configuredDestination}`,
      });

      celebrate({ kind: 'receive', sats: satsAmount, label: 'M-Pesa', ref: refCode });
      setStep('success');
      return;
    }

    // 2. In-flight / pending PIN entry: keep polling smoothly
    if (
      queryRes?.inProgress ||
      code === 49 ||
      code === '49' ||
      (typeof queryRes?.resultDesc === 'string' && queryRes.resultDesc.toLowerCase().includes('processing'))
    ) {
      setInFlightStatus('Payment prompt open on phone. Please enter your PIN to authorize.');
      return;
    }

    // 3. Explicit terminal Safaricom cancellation or error codes
    const numCode = Number(code);
    if (numCode === 1032) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setErrorMessage('M-Pesa payment prompt was cancelled on your phone (M-Pesa 1032). No Sats were credited.');
      setStep('error');
    } else if (numCode === 1037) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setErrorMessage('M-Pesa PIN prompt timed out without PIN entry (M-Pesa 1037). No Sats were credited.');
      setStep('error');
    } else if (numCode === 2001) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setErrorMessage('Incorrect M-Pesa PIN was entered (M-Pesa 2001). No Sats were credited.');
      setStep('error');
    } else if (numCode === 1) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setErrorMessage('Insufficient M-Pesa balance on your handset (M-Pesa 1). No Sats were credited.');
      setStep('error');
    } else if (code !== undefined && code !== null && code !== '' && code !== 49 && code !== '49') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setErrorMessage(queryRes.resultDesc || 'M-Pesa payment was not completed by Safaricom.');
      setStep('error');
    }
  };

  const handleConfirm = async () => {
    if (numericFiat <= 0) return;

    if (currentRate <= 0) {
      setErrorMessage('Live Bitcoin exchange rates are unavailable. Connect to the internet to calculate Sats purchase.');
      setStep('error');
      return;
    }

    if (!isValidKenyanPhone(phone)) {
      setErrorMessage(viaBitika
        ? 'Please enter a valid Kenyan number: 07XXXXXXXX or 01XXXXXXXX'
        : 'Please enter a valid Safaricom number: 07XXXXXXXX or 01XXXXXXXX');
      setStep('error');
      return;
    }

    if (viaBitika) {
      await handleBitikaConfirm();
      return;
    }

    setStep('processing');
    setErrorMessage('');

    const res = await initiateStkPush({
      phone,
      amount: numericFiat,
      accountReference: 'BuySats',
      transactionDesc: 'Bitcoin Purchase',
    });

    if (!res.success || !res.checkoutRequestId) {
      setErrorMessage(res.error || 'Failed to dispatch M-Pesa STK Push prompt: No CheckoutRequestID returned.');
      setStep('error');
      return;
    }

    const refCode = res.checkoutRequestId;
    setActiveCheckoutId(refCode);
    setRealReference(refCode);
    setPinSecondsLeft(120);
    setInFlightStatus('Safaricom has dispatched a payment prompt to your phone.');

    if (!isCustodialWallet && isLightningAddress(configuredDestination)) {
      try {
        const details = await resolveLightningAddress(configuredDestination);
        if (details.success) {
          const invRes = await createLightningInvoice(configuredDestination, satsAmount, 'Ye₿ente Sats Purchase');
          if (invRes.success && invRes.invoice) {
            setLightningInvoice(invRes.invoice);
          }
        }
      } catch {
        // Safe fallback
      }
    }

    setStep('awaiting_pin');

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let remaining = 120;
    pollIntervalRef.current = setInterval(async () => {
      remaining -= 2;
      setPinSecondsLeft(Math.max(0, remaining));

      try {
        const queryRes = await queryStkStatus(refCode);
        processQueryResponse(queryRes);
      } catch {
        // Continue polling until timeout
      }

      if (remaining <= 0) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        try {
          const finalRes = await queryStkStatus(refCode);
          processQueryResponse(finalRes);
        } catch {
          // Keep window accessible for manual verification
        }
        setInFlightStatus('Verification window paused. If you entered your PIN, click "Check Status Now" to credit your Sats.');
      }
    }, 2500);
  };

  const handleResetAndClose = () => {
    stopPolling();
    setStep('input');
    setErrorMessage('');
    setLightningInvoice('');
    setActiveCheckoutId('');
    setBitikaCode('');
    setCopiedInvoice(false);
    setPaidTimedOut(false);
    onClose();
  };

  const handleBack = () => {
    if (step === 'awaiting_pin' || step === 'waiting_sats' || step === 'error' || step === 'success') {
      stopPolling();
      setStep('input');
      setErrorMessage('');
      setPaidTimedOut(false);
      return;
    }
    handleResetAndClose();
  };

  const isFormValid =
    numericFiat > 0 &&
    currentRate > 0 &&
    isValidKenyanPhone(phone);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--yb-outline-variant)]/60">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">Buy Sats</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {viaBitika && (
                <div className="px-1">
                  <p className="text-sm font-bold text-[var(--yb-on-surface)]">Pay with M-Pesa or Airtel Money</p>
                  <p className="text-[11px] text-[var(--yb-on-surface-variant)] mt-0.5">
                    Through Bitika. Read their{' '}
                    <a href="https://bitika.xyz/terms" target="_blank" rel="noreferrer" className="underline text-[var(--yb-secondary)]">
                      terms
                    </a>.
                  </p>
                </div>
              )}
              {/* Amount to spend */}
              <div>
                <label className="block text-xs font-semibold text-[var(--yb-secondary)] mb-1.5">
                  Amount ({currencyCode})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountFiat}
                    onChange={(e) => setAmountFiat(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[var(--yb-secondary)]">
                    {currencyCode}
                  </span>
                </div>
              </div>

              {/* Sats preview */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">You Receive{viaBitika ? ' (estimate)' : ''}</span>
                <span className="font-mono font-bold text-[var(--yb-on-surface)]">
                  +{satsAmount.toLocaleString()} Sats
                </span>
              </div>

              {/* Phone input component */}
              <PhoneInput
                dial="254"
                digits={9}
                example="712 345 678"
                value={phone}
                onChange={(full) => setPhone(full)}
                label={viaBitika ? 'M-Pesa or Airtel Money Number' : 'M-Pesa Phone Number'}
                ariaLabel={viaBitika ? 'M-Pesa or Airtel Money number' : 'M-Pesa phone number'}
              />

              {/* Receiving fee summary */}
              <div className="flex justify-between items-center text-xs text-[var(--yb-on-surface-variant)] px-1 font-mono">
                <span>Receiving Fee</span>
                {viaBitika ? (
                  <span className="text-[var(--yb-secondary)] font-semibold">3% Bitika fee</span>
                ) : (
                  <span className="text-emerald-400 font-semibold">0 {currencyCode} (Free)</span>
                )}
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isFormValid || provider === 'loading'}
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center disabled:opacity-50 mt-2"
              >
                {currentRate <= 0 ? 'Rates Unavailable' : 'Buy Sats'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--yb-primary-container)]/20 border border-[var(--yb-primary)]/40 flex items-center justify-center text-[var(--yb-secondary)]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">
                  Dispatching M-Pesa Prompt
                </h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)] font-mono mt-1">
                  {viaBitika ? 'Connecting to Bitika...' : 'Connecting to Safaricom...'}
                </p>
              </div>
            </div>
          )}

          {step === 'awaiting_pin' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-[var(--yb-primary-container)]/25 border border-[var(--yb-primary)]/50 flex items-center justify-center text-[var(--yb-secondary)]">
                  <Smartphone className="w-8 h-8 animate-pulse text-[var(--yb-on-surface)]" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--yb-surface-container-high)] border border-[var(--yb-primary)] flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--yb-secondary)]" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">
                  {viaBitika ? 'Check your phone for the M-Pesa prompt' : 'Enter M-Pesa PIN on Phone'}
                </h3>
                <p className="text-xs text-[var(--yb-secondary)] mt-1 max-w-xs">
                  {viaBitika ? 'Bitika prompt sent to ' : 'Safaricom prompt dispatched to '}
                  <span className="font-mono font-bold text-[var(--yb-on-surface)]">{formatKenyanDisplayPhone(phone)}</span>.
                </p>
                <p className="text-[11px] text-[var(--yb-secondary)] mt-0.5">
                  {inFlightStatus}
                </p>
              </div>

              <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Amount</span>
                  <span className="text-[var(--yb-on-surface)] font-bold">{numericFiat.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Sats to Receive{viaBitika ? ' (estimate)' : ''}</span>
                  <span className="text-[var(--yb-secondary)] font-bold">+{(viaBitika && bitikaSats > 0 ? bitikaSats : satsAmount).toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Receiving Fee</span>
                  {viaBitika ? (
                    <span className="text-[var(--yb-secondary)] font-semibold">3% Bitika fee ({bitikaFeeKes.toLocaleString()} KES)</span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">0 KES (Free)</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">{viaBitika ? 'Bitika Code' : 'Checkout Request ID'}</span>
                  <span className="text-[var(--yb-on-surface-variant)] text-[10px] truncate max-w-[170px]">{viaBitika ? bitikaCode : activeCheckoutId}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[var(--yb-outline-variant)]/60">
                  <span className="text-[var(--yb-on-surface-variant)]">Verification Window</span>
                  <span className="text-amber-400 font-bold">
                    {pinSecondsLeft > 0 ? `${pinSecondsLeft}s` : 'Paused'}
                  </span>
                </div>
              </div>

              <div className="w-full flex gap-2">
                <button
                  type="button"
                  onClick={handleManualVerify}
                  disabled={isVerifyingStatus}
                  className="flex-1 h-11 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingStatus ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingStatus ? 'Checking...' : 'Check Status Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="h-11 px-4 rounded-2xl bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)] font-medium text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'waiting_sats' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--yb-primary-container)]/25 border border-[var(--yb-primary)]/50 flex items-center justify-center text-[var(--yb-secondary)]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Paid. Waiting for your sats.</h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)] font-mono mt-1 max-w-xs">
                  {paidTimedOut
                    ? 'Paid. Your sats are still on their way. They will appear in your balance.'
                    : 'Bitika is paying your wallet over Lightning. This usually takes seconds.'}
                </p>
              </div>
              <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Paid Amount</span>
                  <span className="text-[var(--yb-on-surface)]">{numericFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Bitika Code</span>
                  <span className="text-[var(--yb-secondary)] font-mono text-[10px] truncate max-w-[180px]">{bitikaCode}</span>
                </div>
              </div>
              {paidTimedOut && (
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="w-full h-11 rounded-2xl bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] text-[var(--yb-on-surface)] font-medium text-sm"
                >
                  Done
                </button>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <SatsMotion mode="received" />
              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">
                  {viaBitika ? 'Sats received' : 'Payment Verified & Sats Credited'}
                </h3>
                <p className="text-xs text-emerald-400 font-mono mt-0.5">
                  {viaBitika ? 'Bitika paid your wallet' : 'Safaricom confirmed the payment'}
                </p>
              </div>

              <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Sats Acquired</span>
                  <span className="text-[var(--yb-secondary)] font-bold">+{successSats.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Credited To</span>
                  <span className="text-emerald-400 font-semibold">Ye₿ente Portfolio (+{successSats.toLocaleString()} Sats)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Paid Amount</span>
                  <span className="text-[var(--yb-on-surface)]">{numericFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Receiving Fee</span>
                  {viaBitika ? (
                    <span className="text-[var(--yb-secondary)] font-semibold">3% Bitika fee ({bitikaFeeKes.toLocaleString()} KES)</span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">0 {currencyCode} (Free)</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Phone Number</span>
                  <span className="text-[var(--yb-secondary)] font-mono">{displayPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--yb-on-surface-variant)]">Destination</span>
                  <span className="text-[var(--yb-secondary)] truncate max-w-[180px]">
                    {configuredDestination}
                  </span>
                </div>
                {realReference && (
                  <div className="flex justify-between">
                    <span className="text-[var(--yb-on-surface-variant)]">{viaBitika ? 'Bitika Code' : 'Safaricom Reference'}</span>
                    <span className="text-[var(--yb-secondary)] font-mono text-[10px] truncate max-w-[180px]">{realReference}</span>
                  </div>
                )}
              </div>

              {lightningInvoice ? (
                <div className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl p-3 space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--yb-secondary)] font-semibold">
                      <Zap className="w-3.5 h-3.5 text-[var(--yb-secondary)]" />
                      <span>Wallet of Satoshi Invoice</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyInvoice}
                      className="px-2 py-1 rounded-lg bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] text-[11px] font-mono text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)] flex items-center gap-1"
                    >
                      {copiedInvoice ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedInvoice ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-[var(--yb-on-surface-variant)] break-all select-all bg-[#0E0A13] p-2 rounded-xl border border-[var(--yb-surface-container-high)]">
                    {lightningInvoice}
                  </p>
                  <p className="text-[10px] text-[var(--yb-on-surface-variant)] leading-relaxed">
                    Sats have been credited to your Ye₿ente vault balance. Automated node settlement requires configuring LNBITS_URL or LND_REST_URL in .env.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs w-full text-left">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{successSats.toLocaleString()} Sats added to your Ye₿ente balance.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full h-11 rounded-2xl bg-[var(--yb-surface-container)] hover:bg-[var(--yb-surface-container-high)] text-[var(--yb-on-surface)] font-medium text-sm"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#946069]">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">Transaction Incomplete</h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)] font-mono mt-1 px-4">{errorMessage}</p>
              </div>

              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full h-11 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-medium text-sm"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
