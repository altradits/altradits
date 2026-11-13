import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserWallet, Transaction, ExchangeRates } from '../types';
import { ArrowLeft, AlertCircle, Loader2, ScanLine, ClipboardPaste, Fingerprint, X } from 'lucide-react';
import { payInvoiceWithWebLN,
  isLightningAddress,
  resolveLightningAddress,
  createLightningInvoice,
} from '../services/lightningService';
import { isNetworkOnline } from '../services/offlineService';
import { hasServerWallet, sendFromServerWallet } from '../services/altraditsWallet';
import { parsePaymentText, bolt11Sats } from '../services/paymentQr';
import { QrScanner } from './QrScanner';
import { HoldNotice } from './HoldNotice';
import { SatsMotion, CountUp } from './SatsMotion';
import { celebrate } from '../services/celebrate';
import { biometricOn, approveWithBiometric } from '../services/biometric';

// A Ye₿ente wallet handle (another Altradits wallet): sent through the ledger, free.
const isYebenteHandle = (s: string) => /^[a-z0-9][a-z0-9._-]{1,18}[a-z0-9]$/i.test(s.trim());

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
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  // The node took the payment but hasn't confirmed it: never shown as sent.
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resolvedProvider, setResolvedProvider] = useState<string>('');
  const [recipientType, setRecipientType] = useState<'unknown' | 'lightning_address' | 'lightning_invoice' | 'invalid_onchain'>('unknown');
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string>('');
  const [txReference, setTxReference] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  // Send opens on the scanner; the amount step unfolds only once a destination is captured.
  const [scanning, setScanning] = useState(true);
  const amountRef = useRef<HTMLInputElement>(null);
  const [usePin, setUsePin] = useState(false);
  // The last step before money leaves: the PIN, in its own pop-up (fingerprint first where it's on).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState('');
  const server = hasServerWallet();
  // Fingerprint / face on this phone: no PIN typed on screen.
  const useBio = server && biometricOn() && !usePin;
  const toYebente = server && isYebenteHandle(sanitizeLightningInput(recipient));
  // An invoice carries its own amount: it fills the amount and can't be changed.
  const invoiceSats = recipientType === 'lightning_invoice' ? bolt11Sats(sanitizeLightningInput(recipient)) : null;
  const amountlessInvoice = server && recipientType === 'lightning_invoice' && !invoiceSats;

  // A scanned or pasted QR code: invoice, Lightning address, LNURL or bitcoin: link.
  const applyPaymentText = useCallback((text: string) => {
    setScanning(false);
    const p = parsePaymentText(text);
    if (p) setRecipient(p.to);
    // The amount is next (an invoice brings its own).
    setTimeout(() => amountRef.current?.focus(), 50);
  }, []);

  const pasteDestination = async () => {
    try {
      applyPaymentText(await navigator.clipboard.readText());
    } catch {
      setErrorMessage('Paste is blocked here. Long-press the field and paste instead.');
    }
  };

  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  // Free between Ye₿ente wallets. Otherwise the server holds back a routing fee
  // reserve (1%, at least 10 sats) and refunds what the payment didn't use.
  // (Your own wallet sets its own fee: nothing to show for it here.)
  const satsFee = !server || toYebente ? 0 : Math.max(10, Math.ceil(numericSats * 0.01));
  const btcKes = rates?.btcKes || 0;
  const feeKes = btcKes > 0 ? Math.round((satsFee / 100_000_000) * btcKes * 100) / 100 : 0;
  const totalDeducted = numericSats + satsFee;
  const isInsufficientSats = totalDeducted > availableSats;
  const currentlyOnline = isNetworkOnline();

  // Auto-detect and resolve recipient format on change
  useEffect(() => {
    const clean = sanitizeLightningInput(recipient);
    if (!clean) {
      setRecipientType('unknown');
      setResolvedProvider('');
      setResolvedAddress('');
      setErrorMessage('');
      return;
    }

    if (hasServerWallet() && isYebenteHandle(clean)) {
      setRecipientType('lightning_address');
      setResolvedProvider('Ye₿ente');
      setResolvedAddress('');
      setErrorMessage('');
      return;
    }

    if (isOnChainAddress(clean)) {
      setRecipientType('invalid_onchain');
      setResolvedProvider('On-Chain Bitcoin (Unsupported)');
      setResolvedAddress('');
      setErrorMessage('On-chain Bitcoin addresses are not supported. Ye₿ente operates exclusively on Lightning. Please enter a Lightning Address (e.g. name@walletofsatoshi.com) or a BOLT-11 invoice (lnbc...).');
      return;
    }

    if (clean.toLowerCase().startsWith('lnbc')) {
      setRecipientType('lightning_invoice');
      setResolvedProvider('Lightning Invoice (BOLT-11)');
      const sats = bolt11Sats(clean);
      if (sats) setSatsAmountStr(String(sats));
      setErrorMessage(sats || !hasServerWallet() ? '' : 'This invoice has no amount. Ask for an invoice with an amount, or their Lightning address.');
      return;
    }

    if (isLightningAddress(clean) || /^lnurlp:\/\//i.test(clean)) {
      setRecipientType('lightning_address');
      setErrorMessage('');
      if (currentlyOnline) {
        setIsResolving(true);
        resolveLightningAddress(clean)
          .then((res) => {
            if (res.success) {
              setResolvedProvider(res.provider || 'Lightning Address');
              setResolvedAddress(clean);
            } else {
              setResolvedProvider('Lightning Address');
              setResolvedAddress('');
            }
          })
          .finally(() => setIsResolving(false));
      } else {
        setResolvedProvider('Lightning Address');
      }
      return;
    }

    setRecipientType('unknown');
    setResolvedProvider('');
    setResolvedAddress('');
  }, [recipient, currentlyOnline]);

  if (!isOpen) return null;

  const handleBack = () => {
    if (step === 'processing') return;
    if (step === 'error') {
      setStep('input');
      setErrorMessage('');
    } else {
      onClose();
    }
  };

  // Pays from the Altradits wallet with the PIN or the fingerprint approval.
  const dispatch = async (to: string, pinValue: string, passkey?: unknown) => {
    setConfirmOpen(false);
    setStep('processing');
    setErrorMessage('');
    try {
      const res = await sendFromServerWallet(to, numericSats, pinValue, passkey);
      setTxReference(res.ref);
      completeTransaction(res.ref, to, res.status === 'pending');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error dispatching payment');
      setStep('error');
    } finally {
      setPin('');
    }
  };

  const handleSend = async () => {
    const cleanRecipient = sanitizeLightningInput(recipient);
    if (!cleanRecipient) {
      setErrorMessage('Please enter a Lightning Address (e.g. name@walletofsatoshi.com) or BOLT-11 invoice (lnbc...).');
      return;
    }

    if (recipientType === 'invalid_onchain' || isOnChainAddress(cleanRecipient)) {
      setErrorMessage('On-chain Bitcoin addresses are not supported. Ye₿ente operates exclusively on Lightning. Please enter a Lightning Address or a BOLT-11 invoice.');
      return;
    }

    if (recipientType !== 'lightning_address' && recipientType !== 'lightning_invoice') {
      setErrorMessage('Please enter a valid Lightning Address (e.g. name@walletofsatoshi.com) or a BOLT-11 invoice (lnbc...).');
      return;
    }

    if (numericSats <= 0) {
      setErrorMessage('Please enter an amount of 1 satoshi or more.');
      return;
    }

    if (isInsufficientSats) {
      setErrorMessage(`Insufficient balance. Required: ${totalDeducted.toLocaleString()} Sats (including fee). Available: ${availableSats.toLocaleString()} Sats.`);
      return;
    }

    if (!isNetworkOnline()) {
      setErrorMessage("You're offline. Connect to the internet to send.");
      return;
    }

    // The Altradits wallet: approve last, after the amount. Fingerprint / face
    // where it's on for this phone; otherwise (or if it's cancelled) the PIN pop-up.
    if (server) {
      if (biometricOn() && !usePin) {
        let passkey: unknown;
        try {
          passkey = await approveWithBiometric();
        } catch (err: unknown) {
          setConfirmNote(err instanceof Error ? err.message : 'Fingerprint not confirmed.');
          setPin('');
          setConfirmOpen(true);
          return;
        }
        await dispatch(cleanRecipient, '', passkey);
        return;
      }
      setConfirmNote('');
      setPin('');
      setConfirmOpen(true);
      return;
    }

    setStep('processing');
    setErrorMessage('');

    try {
      let finalInvoice = cleanRecipient;

      // 1. If recipient is a Lightning Address, ask our server for an invoice for it
      if (recipientType === 'lightning_address' && resolvedAddress === cleanRecipient) {
        try {
          const invRes = await createLightningInvoice(cleanRecipient, numericSats, 'Ye₿ente Payout');
          if (invRes.success && invRes.invoice) {
            finalInvoice = invRes.invoice;
          }
        } catch {
          setErrorMessage("Could not reach the recipient's Lightning server. Try again.");
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

      // No Lightning wallet in this browser: Ye₿ente never pays for an external wallet.
      setErrorMessage(ownWallet.error || 'No Lightning wallet was found in this browser. Pay from your own wallet app, or use a Ye₿ente wallet.');
      setStep('error');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error dispatching payment';
      setErrorMessage(message);
      setStep('error');
    }
  };

  const completeTransaction = (ref: string, targetRecipient: string, notYet = false) => {
    setPending(notYet);
    if (!notYet) celebrate({ kind: 'send', sats: numericSats, label: targetRecipient.length > 40 ? undefined : targetRecipient, ref });
    setStep('success');
    onSuccess({
      type: 'send_btc',
      title: notYet ? 'Sending Lightning Sats' : 'Sent Lightning Sats',
      status: notYet ? 'pending' : 'completed',
      fromCurrency: 'SATS',
      fromAmount: numericSats,
      fee: satsFee,
      feeCurrency: 'SATS',
      realFeeSats: satsFee,
      realFeeFiat: feeKes,
      realFeeCurrency: 'KES',
      recipient: targetRecipient,
      referenceNumber: ref,
      walletType: 'custodial',
      note: `Dispatched to ${resolvedProvider || targetRecipient}`,
    });
  };

  const isFormValid =
    (recipientType === 'lightning_address' || recipientType === 'lightning_invoice') &&
    numericSats > 0 &&
    !isInsufficientSats &&
    !amountlessInvoice;

  if (scanning) return (
    <QrScanner
      onResult={applyPaymentText}
      onType={() => setScanning(false)}
      // Closing the first scan closes Send; a rescan goes back to the form.
      onClose={() => (recipient ? setScanning(false) : onClose())}
    />
  );

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
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">Send</h2>
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
              {server && wallet.hold && <HoldNotice hold={wallet.hold} />}

              {/* Destination: no label or placeholder, just the box (read aloud as "Send to") */}
              <div>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    aria-label="Send to"
                    autoFocus={!recipient}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl pl-4 pr-24 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isResolving && <Loader2 className="w-4 h-4 animate-spin text-[var(--yb-primary)]" />}
                    <button
                      type="button"
                      onClick={pasteDestination}
                      className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                      aria-label="Paste"
                      title="Paste"
                    >
                      <ClipboardPaste className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanning(true)}
                      className="p-1.5 rounded-lg bg-[var(--yb-primary-container)] text-[var(--yb-on-surface)]"
                      aria-label="Scan QR Code"
                      title="Scan QR Code"
                    >
                      <ScanLine className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Auto-detected Recipient Badge */}
                {resolvedProvider && (
                  <div className={`mt-1.5 px-1 text-[11px] font-mono text-right ${
                    recipientType === 'invalid_onchain' ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {resolvedProvider}
                  </div>
                )}
              </div>

              {/* Everything after the destination unfolds once there is one. */}
              {recipient.trim() && (<>
              {/* Amount: no label or placeholder (read aloud as "Amount in sats") */}
              <div className="relative">
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="numeric"
                  step="500"
                  min="1"
                  value={satsAmountStr}
                  readOnly={Boolean(invoiceSats)}
                  onChange={(e) => setSatsAmountStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  aria-label="Amount in sats"
                  className="w-full read-only:opacity-70 bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl pl-4 pr-24 py-3 text-lg font-mono font-bold text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {!invoiceSats && (
                    <button
                      type="button"
                      onClick={() => setSatsAmountStr(String(Math.max(0, availableSats - satsFee)))}
                      className="text-[var(--yb-secondary)] hover:underline font-mono text-[11px]"
                    >
                      MAX
                    </button>
                  )}
                  <span className="font-mono text-sm font-semibold text-[var(--yb-secondary)]">Sats</span>
                </div>
              </div>

              {/* Presets */}
              {!invoiceSats && <div className="grid grid-cols-4 gap-2">
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
              </div>}

              {/* Real Transaction Cost Readouts (borderless typographic rows) */}
              {server && (
                <div className="space-y-1.5 px-1 pt-1 text-xs">
                  <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                    <span>{toYebente ? 'Fee (free between Ye₿ente wallets)' : 'Routing fee (at most; unused part refunded)'}</span>
                    <span className="font-mono text-[var(--yb-secondary)]">
                      {satsFee.toLocaleString()} Sat{feeKes > 0 ? ` (~${feeKes} KES)` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[var(--yb-on-surface-variant)]">
                    <span>Total deducted (at most)</span>
                    <span className="font-mono font-bold text-[var(--yb-on-surface)]">{totalDeducted.toLocaleString()} Sats</span>
                  </div>
                </div>
              )}

              </>)}

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
                className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {useBio && <Fingerprint className="w-4 h-4" />}
                Send
              </button>

              {/* The final pop-up: the PIN, after the amount, before any money moves. */}
              {confirmOpen && (
                <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); setPin(''); }}>
                  <div role="dialog" aria-modal="true" aria-label="Approve payment" onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-bold font-mono text-[var(--yb-on-surface)]">{totalDeducted.toLocaleString()} Sats</p>
                        <p className="text-xs text-[var(--yb-on-surface-variant)] truncate">{resolvedProvider && recipient.length > 40 ? resolvedProvider : sanitizeLightningInput(recipient)}</p>
                      </div>
                      <button type="button" onClick={() => { setConfirmOpen(false); setPin(''); }} className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)]" aria-label="Cancel">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {confirmNote && <p className="text-xs text-amber-300">{confirmNote}</p>}
                    <input
                      type="password"
                      aria-label="PIN"
                      inputMode="numeric"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      autoFocus
                      maxLength={6}
                      value={pin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPin(v);
                        // Six digits send it: no extra tap.
                        if (v.length === 6) dispatch(sanitizeLightningInput(recipient), v);
                      }}
                      className="yb-sensitive w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-center text-2xl font-mono tracking-[0.6em] text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                    />
                    {biometricOn() && (
                      <button type="button" onClick={() => { setConfirmOpen(false); setUsePin(false); setTimeout(handleSend, 0); }}
                        className="w-full h-11 rounded-full border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] font-semibold text-sm flex items-center justify-center gap-2">
                        <Fingerprint className="w-4 h-4" /> Use fingerprint
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <SatsMotion mode="sending" />
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
              {pending ? <SatsMotion mode="sending" /> : <SatsMotion mode="sent" />}

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--yb-on-surface)]">{pending ? 'Not confirmed yet' : 'Payment Sent'}</h3>
                <p className="text-xs text-[var(--yb-on-surface-variant)]">
                  {pending
                    ? 'The network hasn\'t confirmed this payment yet. Check History in a few minutes. If it doesn\'t go through, your sats come back.'
                    : `Sent to ${resolvedProvider || recipient}.`}
                </p>
              </div>

              <div className="p-3.5 bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl space-y-2 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">{pending ? 'Amount' : 'Amount Sent'}</span>
                  <span className={`text-sm font-mono font-bold ${pending ? 'text-[var(--yb-secondary)]' : 'text-emerald-400'}`}>
                    -<CountUp value={numericSats} /> Sats
                  </span>
                </div>
                {server && !toYebente && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--yb-on-surface-variant)]">Fee held (unused part refunded)</span>
                    <span className="text-xs font-mono text-[var(--yb-secondary)]">{satsFee.toLocaleString()} Sat</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--yb-on-surface-variant)]">Reference</span>
                  <span className="text-xs font-mono text-[var(--yb-secondary)] break-all">
                    {txReference}
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
                <button
                  type="button"
                  onClick={() => {
                    setStep('input');
                    setErrorMessage('');
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
