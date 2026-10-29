import React, { useState } from 'react';
import { UserWallet, WalletType } from '../types';
import {
  isLightningAddress,
  resolveLightningAddress,
  queryWebLNBalance,
  LightningAddressDetails,
} from '../services/lightningService';
import {
  computeCustodialBalanceFromTransactions,
  getStoredTransactions,
  createInAppLightningWallet,
} from '../services/storageService';
import {
  hasEncryptedVault,
  initializeOrUpdateVault,
  wipeVaultStorage,
} from '../services/vaultService';
import {
  getBlinkSovereignAddress,
  getBlinkSovereignUsername,
  saveBlinkSovereignUsername,
} from '../services/blinkService';
import { hasServerWallet, createServerWallet, restoreServerWallet } from '../services/altraditsWallet';
import {
  getOfflineOutbox,
  syncOfflineOutbox,
  isNetworkOnline,
} from '../services/offlineService';
import {
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface WalletSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onUpdateWallet: (updated: UserWallet) => void;
  onServerWalletChange?: () => void;
  onEjectWallet: () => void;
  onWipeWallet: () => void;
}

export const WalletSettingsModal: React.FC<WalletSettingsModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onUpdateWallet,
  onServerWalletChange,
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
  const [generatedMessage, setGeneratedMessage] = useState<string>('');

  const [copiedBlink, setCopiedBlink] = useState(false);
  const [copiedExternal, setCopiedExternal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lightningResult, setLightningResult] = useState<LightningAddressDetails | null>(null);

  // Blink Sovereign Username state
  const [blinkUsername, setBlinkUsername] = useState<string>(
    wallet.blinkUsername || getBlinkSovereignUsername()
  );

  // Offline Outbox state
  const [offlineCount, setOfflineCount] = useState<number>(() => getOfflineOutbox().length);
  const [isSyncingOutbox, setIsSyncingOutbox] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>('');

  // Vault Encryption and Master PIN state
  const [vaultProtected, setVaultProtected] = useState(hasEncryptedVault());
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinSuccessMessage, setPinSuccessMessage] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);

  // The Altradits wallet (custodial, on the Altradits node)
  const [server, setServer] = useState<boolean>(hasServerWallet());
  const [walletPin, setWalletPin] = useState('');
  const [walletPinConfirm, setWalletPinConfirm] = useState('');
  const [recoveryShown, setRecoveryShown] = useState('');
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [restoreMode, setRestoreMode] = useState(false);
  const [restorePhrase, setRestorePhrase] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  // A new wallet's handle starts empty (the server picks a free one when left empty).
  const [newHandle, setNewHandle] = useState('');

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

  const handleSyncOutbox = async () => {
    setIsSyncingOutbox(true);
    setSyncStatusMsg('');
    try {
      const res = await syncOfflineOutbox();
      const remaining = getOfflineOutbox().length;
      setOfflineCount(remaining);
      if (res.syncedCount > 0) {
        setSyncStatusMsg(`Successfully synchronized ${res.syncedCount} offline transaction(s).`);
      } else if (!isNetworkOnline()) {
        setSyncStatusMsg('Network offline. Reconnection required to sync.');
      } else {
        setSyncStatusMsg('Outbox is up to date.');
      }
      setTimeout(() => setSyncStatusMsg(''), 4000);
    } finally {
      setIsSyncingOutbox(false);
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

    // Save Blink sovereign username
    const cleanBlinkUser = blinkUsername.trim().toLowerCase().replace(/^@/, '');
    if (cleanBlinkUser) {
      saveBlinkSovereignUsername(cleanBlinkUser);
    }

    const sovereignAddr = `${cleanBlinkUser || getBlinkSovereignUsername()}@blink.sv`;
    const finalAddress = selectedType === 'custodial'
      ? sovereignAddr
      : (rawAddress || sovereignAddr);

    let finalSats = 0;
    if (selectedType === 'non-custodial') {
      if (weblnDetectedSats !== null) {
        finalSats = weblnDetectedSats;
      } else if (wallet.type === 'non-custodial' && wallet.satsBalance > 0 && wallet.onChainVerified) {
        finalSats = wallet.satsBalance;
      } else {
        finalSats = 0;
      }
    } else {
      finalSats = computeCustodialBalanceFromTransactions(getStoredTransactions());
    }

    const detectedLabel = selectedType === 'custodial'
      ? 'In-App Lightning Sovereign Vault'
      : (lightningResult?.provider ? `${lightningResult.provider} (Lightning)` : (weblnDetectedSats !== null ? 'WebLN Provider' : 'External Lightning'));

    onUpdateWallet({
      ...wallet,
      isConnected: true,
      type: selectedType,
      nonCustodialAddress: finalAddress,
      nonCustodialLabel: detectedLabel,
      blinkUsername: cleanBlinkUser || getBlinkSovereignUsername(),
      blinkAddress: sovereignAddr,
      satsBalance: finalSats,
      btcBalance: finalSats / 100_000_000,
      mpesaBalanceKes: 0,
      telebirrBalanceEtb: 0,
      insertedAt: wallet.insertedAt || Date.now(),
      lastSyncedAt: Date.now(),
      onChainVerified: selectedType === 'non-custodial' && Boolean(
        lightningResult?.success ||
        weblnDetectedSats !== null ||
        (wallet.onChainVerified && wallet.satsBalance > 0)
      ),
    });

    onClose();
  };

  const handleSavePin = async () => {
    if (pinInput.length < 4) {
      setValidationError('Master PIN must be at least 4 digits.');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setValidationError('PIN confirmation does not match.');
      return;
    }
    setValidationError('');
    const res = await initializeOrUpdateVault(pinInput, {
      inAppSecret: `sec_${Date.now().toString(36)}`,
      rootAddress: getBlinkSovereignAddress(),
    });
    if (res.success) {
      setVaultProtected(true);
      setShowPinSetup(false);
      setPinInput('');
      setConfirmPinInput('');
      setPinSuccessMessage('Vault encrypted with AES-256-GCM.');
      setTimeout(() => setPinSuccessMessage(''), 3000);
    } else {
      setValidationError(res.error || 'Failed to encrypt vault.');
    }
  };

  const handleEject = () => {
    onEjectWallet();
    onClose();
  };

  const handleWipe = () => {
    if (confirm('Permanently wipe and remove all wallet keys and balances from this device?')) {
      wipeVaultStorage();
      onWipeWallet();
      onClose();
    }
  };

  const handleGenerateInAppLightningWallet = async () => {
    setValidationError('');
    if (!/^\d{6}$/.test(walletPin)) {
      setValidationError('Master PIN must be 6 digits.');
      return;
    }
    if (!restoreMode && walletPin !== walletPinConfirm) {
      setValidationError('PIN confirmation does not match.');
      return;
    }
    setWalletBusy(true);
    try {
      if (restoreMode) {
        await restoreServerWallet(restorePhrase, walletPin);
      } else {
        const r = await createServerWallet(walletPin, newHandle.trim());
        setRecoveryShown(r.recovery);
      }
      setServer(true);
      setSelectedType('custodial');
      setWalletPin('');
      setWalletPinConfirm('');
      setRestorePhrase('');
      setGeneratedMessage('In-App Lightning Wallet Active: 100% off-chain with 0 on-chain fees.');
      setTimeout(() => setGeneratedMessage(''), 5000);
      onServerWalletChange?.();
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Wallet service unavailable.');
    } finally {
      setWalletBusy(false);
    }
  };

  const walletDomain = typeof window !== 'undefined' ? window.location.hostname : 'altradits.com';
  const sovereignBlinkAddress = server ? (wallet.blinkAddress || '') : `${blinkUsername || getBlinkSovereignUsername()}@blink.sv`;

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
              In-App Lightning
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
              External Lightning
            </button>
          </div>

          {/* In-App Lightning Section */}
          {selectedType === 'custodial' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[var(--yb-on-surface-variant)]">Vault Balance</span>
                <span className="font-mono font-bold text-[var(--yb-on-surface)]">
                  {(wallet.type === 'custodial' ? (wallet.satsBalance || 0) : 0).toLocaleString()} Sats
                </span>
              </div>

              {/* Off-Chain Zero Fee Indicator */}
              <div className="flex justify-between items-center px-1 text-[11px]">
                <span className="text-[var(--yb-on-surface-variant)]">Transaction Rail</span>
                <span className="font-mono text-emerald-400 font-semibold">100% Off-Chain Lightning (0 On-Chain Fees)</span>
              </div>

              {!server && (
                <div className="space-y-3">
                  {!restoreMode && (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--yb-secondary)] mb-1.5">
                        Custom Lightning Handle
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newHandle}
                          name="yb-handle"
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          spellCheck={false}
                          onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20))}
                          placeholder="username"
                          className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] pr-28"
                        />
                        <span className="absolute right-3 top-3 font-mono text-xs text-[var(--yb-on-surface-variant)]">
                          @{walletDomain}
                        </span>
                      </div>
                    </div>
                  )}

                  {restoreMode && (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--yb-secondary)] mb-1.5">Recovery phrase</label>
                      <textarea
                        rows={3}
                        value={restorePhrase}
                        onChange={(e) => setRestorePhrase(e.target.value)}
                        className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] resize-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--yb-on-surface-variant)] mb-1">Enter Master PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        name="yb-walletpin"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={walletPin}
                        onChange={(e) => setWalletPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] tracking-[0.4em]"
                      />
                    </div>
                    {!restoreMode && (
                      <div>
                        <label className="block text-[11px] text-[var(--yb-on-surface-variant)] mb-1">Confirm Master PIN</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          name="yb-walletpinconfirm"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={walletPinConfirm}
                          onChange={(e) => setWalletPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] tracking-[0.4em]"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateInAppLightningWallet}
                    disabled={walletBusy}
                    className="w-full h-11 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-xs flex items-center justify-center disabled:opacity-50"
                  >
                    {restoreMode ? 'Restore' : 'Generate In-App Lightning Wallet'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRestoreMode(!restoreMode); setValidationError(''); }}
                    className="w-full text-center text-[11px] font-semibold text-[var(--yb-primary)] hover:underline"
                  >
                    {restoreMode ? 'Generate In-App Lightning Wallet' : 'Restore'}
                  </button>
                </div>
              )}

              {recoveryShown && (
                <div className="p-3 rounded-2xl bg-[var(--yb-surface-container-high)] border border-[var(--yb-primary)]/50 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-[var(--yb-secondary)]">Recovery phrase</span>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(recoveryShown); setCopiedRecovery(true); setTimeout(() => setCopiedRecovery(false), 2000); }}
                      className="text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                    >
                      {copiedRecovery ? <Check className="w-3.5 h-3.5 text-[var(--yb-secondary)]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="font-mono text-sm leading-relaxed text-[var(--yb-on-surface)] select-all">{recoveryShown}</p>
                </div>
              )}

              {generatedMessage && (
                <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{generatedMessage}</span>
                </div>
              )}

              {server && (
                <div>
                  <div className="flex justify-between items-center text-xs text-[var(--yb-secondary)] mb-1.5">
                    <span className="font-semibold">Sovereign Lightning Address</span>
                    <span className="font-mono text-[10px] text-emerald-400">Zero On-Chain Fees</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={sovereignBlinkAddress}
                      className="w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none pr-10 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(sovereignBlinkAddress);
                        setCopiedBlink(true);
                        setTimeout(() => setCopiedBlink(false), 2000);
                      }}
                      className="absolute right-3 top-3 text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]"
                    >
                      {copiedBlink ? <Check className="w-3.5 h-3.5 text-[var(--yb-secondary)]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
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

          {/* Offline Outbox Section */}
          <div className="space-y-2 pt-2 border-t border-[var(--yb-outline-variant)]/60">
            <div className="flex justify-between items-center px-1 text-xs">
              <span className="text-[var(--yb-secondary)] font-semibold">Offline Outbox</span>
              <span className="font-mono text-[11px] text-[var(--yb-on-surface-variant)]">
                {offlineCount > 0 ? `${offlineCount} Queued` : 'Empty'}
              </span>
            </div>

            {syncStatusMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                {syncStatusMsg}
              </div>
            )}

            {offlineCount > 0 && (
              <button
                type="button"
                onClick={handleSyncOutbox}
                disabled={isSyncingOutbox}
                className="w-full py-2.5 px-3 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-secondary)] hover:text-[var(--yb-on-surface)] text-xs font-mono flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
                <span>{isSyncingOutbox ? 'Syncing...' : 'Sync Outbox Now'}</span>
              </button>
            )}
          </div>

          {/* Sovereign Vault Encryption Section */}
          <div className="space-y-2 pt-2 border-t border-[var(--yb-outline-variant)]/60">
            <div className="flex justify-between items-center px-1 text-xs">
              <span className="text-[var(--yb-secondary)] font-semibold">Vault Security</span>
              <span className="font-mono text-[11px] text-emerald-400">
                {vaultProtected ? 'AES-256-GCM Active' : 'Unencrypted'}
              </span>
            </div>

            {pinSuccessMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                {pinSuccessMessage}
              </div>
            )}

            {!showPinSetup ? (
              <button
                type="button"
                onClick={() => setShowPinSetup(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] hover:border-[var(--yb-primary)] text-[var(--yb-secondary)] hover:text-[var(--yb-on-surface)] text-xs font-mono text-center"
              >
                {vaultProtected ? 'Update Master PIN' : 'Set Master PIN'}
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-2xl bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)]">
                <div>
                  <label className="block text-[11px] text-[var(--yb-on-surface-variant)] mb-1">Enter Master PIN (4-6 digits)</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="••••••"
                    className="w-full bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--yb-on-surface-variant)] mb-1">Confirm Master PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="••••••"
                    className="w-full bg-[var(--yb-surface-container-low)] border border-[var(--yb-outline-variant)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinSetup(false);
                      setPinInput('');
                      setConfirmPinInput('');
                    }}
                    className="flex-1 py-2 rounded-xl bg-[var(--yb-surface-container)] border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface-variant)] text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePin}
                    className="flex-1 py-2 rounded-xl bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-semibold text-xs"
                  >
                    Save PIN
                  </button>
                </div>
              </div>
            )}
          </div>

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

          {/* Disconnect & Wipe Options */}
          {wallet.isConnected && (
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
