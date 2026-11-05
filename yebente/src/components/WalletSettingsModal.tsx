import React, { useState, useEffect } from 'react';
import { UserWallet, WalletType } from '../types';
import {
  isLightningAddress,
  resolveLightningAddress,
  queryWebLNBalance,
  LightningAddressDetails,
} from '../services/lightningService';
import { hasServerWallet, setRecoveryEmail, cancelPendingEmailChange, lockServerWallet, forgetServerWallet } from '../services/altraditsWallet';
import { PhonesAndSecurity } from './PhonesAndSecurity';
import { biometricSupported, biometricOn, enableBiometric, disableBiometric } from '../services/biometric';
import { Fingerprint } from 'lucide-react';
import {
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';

interface WalletSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onUpdateWallet: (updated: UserWallet) => void;
  onServerWalletChange?: () => void;
  onOpenGate?: () => void;
  onEjectWallet: () => void;
  onWipeWallet: () => void;
}

export const WalletSettingsModal: React.FC<WalletSettingsModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onUpdateWallet,
  onServerWalletChange,
  onOpenGate,
  onEjectWallet,
  onWipeWallet,
}) => {
  const [selectedType, setSelectedType] = useState<WalletType>(wallet.type || 'custodial');
  const [address, setAddress] = useState(
    wallet.type === 'non-custodial' ? wallet.nonCustodialAddress : ''
  );
  const [verifiedSats, setVerifiedSats] = useState<number>(
    wallet.isConnected && wallet.type === 'non-custodial' ? wallet.satsBalance : 0
  );
  const [weblnDetectedSats, setWeblnDetectedSats] = useState<number | null>(null);
  const [isVerifyingWebln, setIsVerifyingWebln] = useState(false);
  const [weblnStatusMessage, setWeblnStatusMessage] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  const [copiedOwn, setCopiedOwn] = useState(false);
  const [copiedExternal, setCopiedExternal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lightningResult, setLightningResult] = useState<LightningAddressDetails | null>(null);


  // The Ye₿ente wallet (custodial, on the Altradits node)
  const server = hasServerWallet();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMsg, setWalletMsg] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailPin, setEmailPin] = useState('');
  const [bioSupported, setBioSupported] = useState(false);
  const [bioActive, setBioActive] = useState(biometricOn());
  const [bioPin, setBioPin] = useState('');
  const [bioMsg, setBioMsg] = useState('');
  useEffect(() => { biometricSupported().then(setBioSupported); }, []);

  if (!isOpen) return null;

  const handleVerifyLightning = async () => {
    const cleanAddr = address.trim();
    if (!cleanAddr) {
      setValidationError('Please enter a Lightning Address (e.g. user@domain.com).');
      return;
    }

    // Explicitly reject on-chain Bitcoin addresses
    const isL1 = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(cleanAddr);
    if (isL1) {
      setValidationError(
        'On-chain Bitcoin addresses are not supported. Only Lightning addresses (e.g. user@domain.com) and WebLN are supported.'
      );
      return;
    }

    if (!isLightningAddress(cleanAddr)) {
      setValidationError('Invalid Lightning Address format. Example: user@walletofsatoshi.com');
      return;
    }

    setValidationError('');
    setIsVerifying(true);
    setLightningResult(null);

    try {
      const res = await resolveLightningAddress(cleanAddr);
      setLightningResult(res);
      if (res.success) {
        setAddress(res.address);
        setVerifiedSats(0);
      } else {
        setValidationError(res.error || 'Failed to resolve Lightning Address.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDetectWebLN = async () => {
    setIsVerifyingWebln(true);
    setWeblnStatusMessage('');
    setValidationError('');
    try {
      const res = await queryWebLNBalance();
      if (res.available && typeof res.sats === 'number') {
        setWeblnDetectedSats(res.sats);
        setVerifiedSats(res.sats);
        setWeblnStatusMessage(`Connected: ${res.sats.toLocaleString()} Sats detected via WebLN`);
      } else {
        setWeblnStatusMessage(res.error || 'No active WebLN provider detected in this browser.');
      }
    } finally {
      setIsVerifyingWebln(false);
    }
  };

  const handleInsertOrUpdate = () => {
    setValidationError('');
    // The Altradits wallet lives on the server: nothing to save here.
    if (selectedType === 'custodial' && server) {
      onServerWalletChange?.();
      onClose();
      return;
    }
    // No Ye₿ente wallet yet: log in or create one (never a stand-in address).
    if (selectedType === 'custodial') {
      onOpenGate?.();
      onClose();
      return;
    }
    const rawAddress = address.trim();

    if (selectedType === 'non-custodial') {
      if (!rawAddress && weblnDetectedSats === null) {
        setValidationError('Please enter a Lightning Address or connect a WebLN extension.');
        return;
      }

      const isL1 = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(rawAddress);
      if (isL1) {
        setValidationError(
          'On-chain Bitcoin addresses are not supported. Only Lightning addresses (e.g. user@domain.com) and WebLN are supported.'
        );
        return;
      }

      if (rawAddress && !isLightningAddress(rawAddress) && weblnDetectedSats === null) {
        setValidationError('Invalid Lightning Address format. Example: user@walletofsatoshi.com');
        return;
      }
    }

    // An external wallet: only the address the user gave (never a stand-in).
    let finalSats = 0;
    if (weblnDetectedSats !== null) {
      finalSats = weblnDetectedSats;
    } else if (wallet.type === 'non-custodial' && wallet.satsBalance > 0 && wallet.onChainVerified) {
      finalSats = wallet.satsBalance;
    }

    onUpdateWallet({
      ...wallet,
      isConnected: true,
      type: 'non-custodial',
      nonCustodialAddress: rawAddress,
      blinkUsername: '',
      blinkAddress: '',
      satsBalance: finalSats,
      btcBalance: finalSats / 100_000_000,
      onChainVerified: Boolean(
        lightningResult?.success ||
        weblnDetectedSats !== null ||
        (wallet.onChainVerified && wallet.satsBalance > 0)
      ),
    });

    onClose();
  };

  const handleEject = () => {
    onEjectWallet();
    onClose();
  };

  const handleWipe = () => {
    if (confirm('Permanently wipe and remove all wallet keys and balances from this device?')) {
      onWipeWallet();
      onClose();
    }
  };

  const serverEmail = wallet.recoveryEmail || '';
  // The Ye₿ente wallet's own address (shown only when signed in).
  const ownAddress = server ? (wallet.blinkAddress || '') : '';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] yb-sheet rounded-t-[28px] sm:rounded-[28px] w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header with Textless Back Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--yb-outline-variant)]/60">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[var(--yb-on-surface)]">Settings</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Custody Switcher: Pure Lightning Rails */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedType('custodial');
                setValidationError('');
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold ${
                selectedType === 'custodial'
                  ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                  : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
              }`}
            >
              Ye₿ente wallet
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedType('non-custodial');
                setValidationError('');
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold ${
                selectedType === 'non-custodial'
                  ? 'bg-[var(--yb-surface-container-high)] border-[var(--yb-primary)] text-[var(--yb-on-surface)]'
                  : 'bg-[var(--yb-surface)] border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)]'
              }`}
            >
              My own Lightning wallet
            </button>
          </div>

          {/* In-App Lightning Section */}
          {selectedType === 'custodial' && (
            <div className="space-y-3">
              {!server && (
                <div className="p-3 rounded-2xl bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] space-y-2">
                  <p className="text-xs text-[var(--yb-on-surface-variant)]">Log in to your Ye₿ente wallet, or create one, from the start screen.</p>
                  <button type="button" onClick={() => { onOpenGate?.(); onClose(); }} className="w-full h-10 rounded-full border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center hover:bg-[var(--yb-surface-container-high)]">Log in or create a wallet</button>
                </div>
              )}

              {server && (
                <div>
                  <div className="flex justify-between items-center text-xs text-[var(--yb-secondary)] mb-1.5">
                    <span className="font-semibold">Your Lightning address</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={ownAddress}
                      className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none pr-10 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(ownAddress);
                        setCopiedOwn(true);
                        setTimeout(() => setCopiedOwn(false), 2000);
                      }}
                      className="absolute right-3 top-3 text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                    >
                      {copiedOwn ? <Check className="w-3.5 h-3.5 text-[var(--yb-secondary)]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {server && bioSupported && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-[var(--yb-secondary)]">
                    <span className="font-semibold flex items-center gap-1.5"><Fingerprint className="w-3.5 h-3.5" /> Fingerprint / Face</span>
                    <span className={`font-mono text-[10px] ${bioActive ? 'text-emerald-400' : 'text-[var(--yb-on-surface-variant)]'}`}>{bioActive ? 'On for this phone' : 'Off'}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      name="yb-settings-bio-pin"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      maxLength={6}
                      value={bioPin}
                      onChange={(e) => setBioPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="PIN"
                      className="yb-sensitive w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] tracking-[0.3em]"
                    />
                    <button
                      type="button"
                      disabled={walletBusy || !/^\d{6}$/.test(bioPin)}
                      onClick={async () => {
                        setWalletBusy(true); setValidationError(''); setBioMsg('');
                        try {
                          if (bioActive) { await disableBiometric(bioPin); setBioActive(false); setBioMsg('Payments now need the PIN.'); }
                          else { await enableBiometric(bioPin); setBioActive(true); setBioMsg('Approve payments with your fingerprint or face.'); }
                          setBioPin(''); onServerWalletChange?.();
                        } catch (err: unknown) { setValidationError(err instanceof Error ? err.message : 'Fingerprint could not be set up.'); }
                        finally { setWalletBusy(false); }
                      }}
                      className="w-full h-10 rounded-full border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center hover:bg-[var(--yb-surface-container-high)] disabled:opacity-50"
                    >
                      {bioActive ? 'Turn off' : 'Turn on'}
                    </button>
                  </div>
                  {bioMsg && <p className="text-xs text-emerald-300 px-1">{bioMsg}</p>}
                </div>
              )}

              {server && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-[var(--yb-secondary)]">
                    <span className="font-semibold">Recovery email</span>
                    <span className="font-mono text-[10px] text-[var(--yb-on-surface-variant)]">{serverEmail}</span>
                  </div>
                  <p className="text-[11px] text-[var(--yb-on-surface-variant)]">A change takes 48 hours after you confirm the new address. Recovery keeps using the old address until then.</p>
                  {wallet.emailChange && (
                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 space-y-2">
                      <p className="text-xs font-semibold text-amber-200">Changing to {wallet.emailChange.newEmail}</p>
                      <p className="text-[11px] text-amber-300/90">Takes effect {(() => { try { return new Date(wallet.emailChange!.effectiveAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return 'in 48 hours'; } })()}. Enter your PIN, then cancel.</p>
                      <button
                        type="button"
                        disabled={walletBusy || !/^\d{6}$/.test(emailPin)}
                        onClick={async () => {
                          setWalletBusy(true); setValidationError(''); setWalletMsg('');
                          try { await cancelPendingEmailChange(emailPin); setWalletMsg('Email change cancelled.'); setEmailPin(''); onServerWalletChange?.(); }
                          catch (err: unknown) { setValidationError(err instanceof Error ? err.message : 'Wallet service unavailable.'); }
                          finally { setWalletBusy(false); }
                        }}
                        className="w-full h-10 rounded-full border border-amber-500/60 text-amber-100 font-semibold text-xs flex items-center justify-center disabled:opacity-50"
                      >
                        Cancel change
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <input
                      type="email"
                      name="yb-settings-email"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value.slice(0, 200))}
                      placeholder="you@email.com"
                      className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      name="yb-settings-email-pin"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      maxLength={6}
                      value={emailPin}
                      onChange={(e) => setEmailPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="PIN"
                      className="yb-sensitive w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] tracking-[0.3em]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={walletBusy || !emailInput.includes('@') || !/^\d{6}$/.test(emailPin)}
                    onClick={async () => {
                      setWalletBusy(true); setValidationError(''); setWalletMsg('');
                      try { const r = await setRecoveryEmail(emailInput.trim(), emailPin); setWalletMsg(`Check ${r.emailPending} to confirm.`); setEmailInput(''); setEmailPin(''); onServerWalletChange?.(); }
                      catch (err: unknown) { setValidationError(err instanceof Error ? err.message : 'Wallet service unavailable.'); }
                      finally { setWalletBusy(false); }
                    }}
                    className="w-full h-10 rounded-full border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center gap-2 hover:bg-[var(--yb-surface-container-high)] disabled:opacity-50"
                  >
                    Send confirmation
                  </button>
                  {walletMsg && <p className="text-xs text-emerald-300 px-1">{walletMsg}</p>}
                </div>
              )}

              {server && <PhonesAndSecurity onChanged={onServerWalletChange} />}
            </div>
          )}

          {/* External Lightning Section */}
          {selectedType === 'non-custodial' && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center text-xs text-[var(--yb-secondary)] mb-1.5">
                  <span className="font-semibold">Lightning Address</span>
                  <span className="font-mono text-[10px] text-emerald-400">LNURL-pay / WebLN</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setLightningResult(null);
                      setValidationError('');
                    }}
                    placeholder="user@walletofsatoshi.com or user@getalby.com"
                    className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] pr-10"
                  />
                  {address && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(address);
                        setCopiedExternal(true);
                        setTimeout(() => setCopiedExternal(false), 2000);
                      }}
                      className="absolute right-3 top-3 text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                    >
                      {copiedExternal ? <Check className="w-3.5 h-3.5 text-[var(--yb-secondary)]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Verification Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleVerifyLightning}
                  disabled={!address.trim() || isVerifying}
                  className="flex-1 py-2 px-3 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-secondary)] hover:text-[var(--yb-on-surface)] text-xs font-mono disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Lightning'}
                </button>
                <button
                  type="button"
                  onClick={handleDetectWebLN}
                  disabled={isVerifyingWebln}
                  className="py-2 px-3 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-secondary)] hover:text-[var(--yb-on-surface)] text-xs font-mono disabled:opacity-50"
                >
                  {isVerifyingWebln ? 'Detecting...' : 'Detect WebLN'}
                </button>
              </div>

              {/* Status outputs */}
              {lightningResult && lightningResult.success && (
                <div className="flex items-center justify-between text-xs font-mono text-emerald-400 px-1">
                  <span>Verified</span>
                  <span>{lightningResult.provider} ({lightningResult.address})</span>
                </div>
              )}

              {weblnStatusMessage && (
                <div className="text-xs font-mono text-[var(--yb-secondary)] px-1">
                  {weblnStatusMessage}
                </div>
              )}

              {/* Verified Sats Balance readout */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Verified Balance</span>
                <span className="font-mono font-bold text-[var(--yb-on-surface)]">
                  {verifiedSats.toLocaleString()} Sats
                </span>
              </div>
            </div>
          )}

          {/* Validation error display */}
          {validationError && (
            <div className="p-2.5 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Primary Action Button: Save / Connect */}
          <button
            type="button"
            onClick={handleInsertOrUpdate}
            className="w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center mt-2"
          >
            {wallet.isConnected ? 'Save Settings' : 'Connect Wallet'}
          </button>

          {/* This phone: lock or forget the Ye₿ente wallet; disconnect or wipe an external one */}
          {server ? (
            <div className="pt-2 border-t border-[var(--yb-outline-variant)]/60 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => { await lockServerWallet(); onClose(); }}
                className="h-10 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] font-medium text-xs flex items-center justify-center"
              >
                Lock now
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Remove the wallet from this phone? Your sats stay safe; log in again with your email and PIN, or your recovery words.')) return;
                  try { await lockServerWallet(); } catch { /* offline: forget locally anyway */ }
                  await forgetServerWallet(); onWipeWallet(); onClose();
                }}
                className="h-10 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-red-500/60 text-[var(--yb-on-surface-variant)] hover:text-red-400 font-medium text-xs flex items-center justify-center"
              >
                Remove from this phone
              </button>
            </div>
          ) : wallet.isConnected && (
            <div className="pt-2 border-t border-[var(--yb-outline-variant)]/60 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleEject}
                className="h-10 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[#946069] text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)] font-medium text-xs flex items-center justify-center"
              >
                Disconnect
              </button>

              <button
                type="button"
                onClick={handleWipe}
                className="h-10 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-red-500/60 text-[var(--yb-on-surface-variant)] hover:text-red-400 font-medium text-xs flex items-center justify-center"
              >
                Wipe Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
