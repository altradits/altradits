import React, { useEffect, useState } from 'react';
import { Fingerprint, Lock, ArrowLeft, Download, Eye, Copy, Check, Share2 } from 'lucide-react';
import {
  needsMove, unlockServerWallet, moveToDeviceKey, startLogin, finishLogin, createServerWallet,
  restoreServerWallet, requestEmailRecovery, finishEmailRecovery, forgetServerWallet, typoHintOf,
} from '../services/altraditsWallet';
import { biometricOn, approveUnlock } from '../services/biometric';
import { downloadRecoveryCard, shareRecoveryCard, canShareCard } from '../services/recoveryCard';

// The screen before the wallet. One secret for people: the 6-digit PIN (or the
// fingerprint once it's on). Log in comes first; recovery is only for a lost
// phone or a forgotten PIN.
type Mode = 'start' | 'unlock' | 'login' | 'create' | 'words' | 'recover' | 'newpin';

interface Props {
  locked: boolean; // this phone is trusted: unlock instead of log in
  externalEnabled: boolean; // the server's features: offer "my own Lightning wallet"
  recoveryToken?: string;
  onOpen: () => void;
  onRecoveryDone?: () => void;
  onUseExternal: () => void;
  onHold: () => void; // keep this screen up after the wallet opens (to show the recovery words)
}

const field = 'w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-3 text-sm text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)]';
const primary = 'w-full h-12 rounded-full bg-[var(--yb-primary-container)] hover:bg-[var(--yb-primary-container-hover)] text-[var(--yb-on-surface)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50';
const secondary = 'w-full h-12 rounded-full border border-[var(--yb-outline-variant)] text-[var(--yb-on-surface)] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[var(--yb-surface-container-high)] disabled:opacity-50';
const link = 'text-xs font-semibold text-[var(--yb-primary)] hover:underline';
// Links from altradits.com open a screen directly: /yebente#create (the navbar's
// Wallet link) or /yebente#login. A phone that already has a wallet still unlocks.
const linked = (): Mode | null => {
  try { const h = window.location.hash.slice(1); return h === 'create' || h === 'login' ? h : null; } catch { return null; }
};
const digits = (v: string, n = 6) => v.replace(/\D/g, '').slice(0, n);

const PinInput: React.FC<{ value: string; onChange: (v: string) => void; label: string; name: string; autoFocus?: boolean }> = ({ value, onChange, label, name, autoFocus }) => (
  <label className="block">
    <span className="block text-xs text-[var(--yb-on-surface-variant)] mb-1.5">{label}</span>
    <input type="password" inputMode="numeric" maxLength={6} name={name} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true"
      autoFocus={autoFocus} value={value} onChange={(e) => onChange(digits(e.target.value))}
      className={`yb-sensitive ${field} font-mono tracking-[0.5em] text-center`} />
  </label>
);

export const WalletGate: React.FC<Props> = ({ locked, externalEnabled, recoveryToken, onOpen, onRecoveryDone, onUseExternal, onHold }) => {
  const [mode, setMode] = useState<Mode>(recoveryToken ? 'newpin' : locked ? 'unlock' : linked() || 'start');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [handle, setHandle] = useState('');
  const [words, setWords] = useState('');
  const [newWords, setNewWords] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [wordsVisible, setWordsVisible] = useState(false);
  const [wroteDown, setWroteDown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [typo, setTypo] = useState<{ hint: string; address: string; resend: () => void } | null>(null);
  useEffect(() => { if (recoveryToken) setMode('newpin'); }, [recoveryToken]);
  useEffect(() => { if (linked()) window.history.replaceState(null, '', window.location.pathname); }, []);

  const go = (m: Mode) => { setMode(m); setError(''); setNote(''); setPin(''); setPin2(''); setTypo(null); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'); } finally { setBusy(false); }
  };
  // Sending to an email: when the server flags a misspelt domain, offer the
  // typed address anyway (some real domains look like typos).
  const runEmail = (fn: (confirmTypo: boolean) => Promise<void>) => {
    const attempt = (confirm: boolean) => {
      setBusy(true); setError(''); setTypo(null);
      fn(confirm).catch((err: unknown) => {
        const hint = !confirm && typoHintOf(err);
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        if (hint) setTypo({ hint, address: email.trim(), resend: () => attempt(true) });
      }).finally(() => setBusy(false));
    };
    attempt(false);
  };
  const twoPins = () => {
    if (!/^\d{6}$/.test(pin)) throw new Error('Choose a 6-digit PIN.');
    if (pin !== pin2) throw new Error("The two PINs don't match.");
  };

  const back = (to: Mode = 'start') => (
    <button type="button" onClick={() => go(to)} className="p-1.5 -ml-1.5 rounded-lg text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)]" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col [justify-content:safe_center] px-5 py-8 space-y-5 max-w-sm mx-auto w-full">
      {mode === 'unlock' && (
        <>
          <div className="text-center space-y-2">
            <Lock className="w-8 h-8 mx-auto text-[var(--yb-primary)]" />
            <h1 className="text-xl font-bold">{needsMove() ? 'One quick step' : 'Welcome back'}</h1>
            <p className="text-sm text-[var(--yb-on-surface-variant)]">{needsMove() ? 'Enter your PIN once, so this phone stays signed in securely from now on.' : 'Enter your PIN to open your wallet.'}</p>
          </div>
          <PinInput value={pin} onChange={setPin} label="PIN" name="yb-unlock-pin" autoFocus />
          <button type="button" className={primary} disabled={busy || pin.length !== 6}
            onClick={() => run(async () => { if (needsMove()) await moveToDeviceKey(pin); else await unlockServerWallet({ pin }); setPin(''); onOpen(); })}>
            Open wallet
          </button>
          {!needsMove() && biometricOn() && (
            <button type="button" className={secondary} disabled={busy}
              onClick={() => run(async () => { await unlockServerWallet({ passkey: approveUnlock }); onOpen(); })}>
              <Fingerprint className="w-4 h-4" /> Use fingerprint or face
            </button>
          )}
          <div className="flex justify-between">
            <button type="button" className={link} onClick={() => go('recover')}>Forgot your PIN?</button>
            <button type="button" className={link} onClick={() => run(async () => {
              if (!confirm('Use a different wallet on this phone? This phone will forget your wallet; you can log in again with your email and PIN.')) return;
              await forgetServerWallet(); go('start');
            })}>Use a different wallet</button>
          </div>
        </>
      )}

      {mode === 'start' && (
        <>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Ye₿ente</h1>
            <p className="text-sm text-[var(--yb-on-surface-variant)]">Bitcoin for your household. Send, receive and pay to M-Pesa.</p>
          </div>
          <button type="button" className={primary} onClick={() => go('login')}>Log in</button>
          <button type="button" className={secondary} onClick={() => go('create')}>Create a wallet</button>
          <div className="text-center space-y-3 pt-2">
            <button type="button" className={link} onClick={() => go('recover')}>Lost your phone or forgot your PIN?</button>
            {externalEnabled && (
              <div><button type="button" className="text-[11px] text-[var(--yb-on-surface-variant)] hover:underline" onClick={onUseExternal}>Use my own Lightning wallet instead</button></div>
            )}
          </div>
        </>
      )}

      {mode === 'login' && (
        <>
          <div className="flex items-center gap-2">{back()}<h1 className="text-lg font-bold">Log in</h1></div>
          {!codeSent ? (
            <>
              <p className="text-sm text-[var(--yb-on-surface-variant)]">Enter the email on your wallet. We'll send a code; then you enter your PIN. Nothing gets reset.</p>
              <input type="email" className={field} placeholder="5tan@altradits.com" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value.slice(0, 200)); setTypo(null); }} />
              <button type="button" className={primary} disabled={busy || !email.includes('@')}
                onClick={() => runEmail(async (confirmTypo) => { await startLogin(email.trim(), confirmTypo); setCodeSent(true); setNote('If that email is on a Ye₿ente wallet, a code is on its way. It works for 10 minutes.'); })}>
                Send me a code
              </button>
              <p className="text-xs text-[var(--yb-on-surface-variant)]">No email on your wallet? <button type="button" className={link} onClick={() => go('recover')}>Use your recovery words</button></p>
            </>
          ) : (
            <>
              {note && <p className="text-sm text-emerald-300">{note}</p>}
              <label className="block">
                <span className="block text-xs text-[var(--yb-on-surface-variant)] mb-1.5">Code from the email</span>
                <input inputMode="numeric" className={`${field} font-mono tracking-[0.3em] text-center`} value={code} autoComplete="one-time-code" onChange={(e) => setCode(digits(e.target.value, 8))} />
              </label>
              <PinInput value={pin} onChange={setPin} label="Your PIN" name="yb-login-pin" />
              <button type="button" className={primary} disabled={busy || code.length !== 8 || pin.length !== 6}
                onClick={() => run(async () => { await finishLogin(email.trim(), code, pin); setPin(''); onOpen(); })}>
                Log in
              </button>
              <button type="button" className={link} onClick={() => { setCodeSent(false); setCode(''); }}>Send a new code</button>
            </>
          )}
        </>
      )}

      {mode === 'create' && (
        <>
          <div className="flex items-center gap-2">{back()}<h1 className="text-lg font-bold">Create a wallet</h1></div>
          <p className="text-xs text-[var(--yb-on-surface-variant)]">Already have one? <button type="button" className={link} onClick={() => go('login')}>Log in</button> · New to Bitcoin? <a className={link} href="/">See the 1-minute guide</a></p>
          <PinInput value={pin} onChange={setPin} label="Choose a 6-digit PIN (avoid 123456 or 112233)" name="yb-new-pin" autoFocus />
          <PinInput value={pin2} onChange={setPin2} label="The same PIN again" name="yb-new-pin2" />
          <label className="block">
            <span className="block text-xs text-[var(--yb-on-surface-variant)] mb-1.5">Email (recommended: lets you log in on a new phone)</span>
            <input type="email" className={field} placeholder="5tan@altradits.com" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value.slice(0, 200))} />
          </label>
          <details>
            <summary className="text-xs text-[var(--yb-on-surface-variant)] cursor-pointer">Choose your Lightning address name (optional)</summary>
            <input type="text" className={`${field} font-mono mt-2`} placeholder="name" value={handle} autoComplete="off" spellCheck={false}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20))} />
          </details>
          <button type="button" className={primary} disabled={busy}
            onClick={() => run(async () => { twoPins(); onHold(); const r = await createServerWallet(pin, handle.trim(), email.trim()); setNewWords(r.recovery); setNewAddress(r.wallet.address); setPin(''); setPin2(''); setMode('words'); })}>
            Create my wallet
          </button>
        </>
      )}

      {mode === 'words' && (
        <>
          <h1 className="text-lg font-bold">Your recovery words</h1>
          <p className="text-sm text-[var(--yb-on-surface-variant)]">Write these 12 words on paper and keep them safe. You'll only need them if you lose your phone and can't use your email. Never type them anywhere else, never send them to anyone: Ye₿ente will never ask for them.</p>
          <button type="button" onClick={() => setWordsVisible(!wordsVisible)}
            className={`yb-sensitive w-full p-4 rounded-2xl bg-[var(--yb-surface-container-high)] border border-[var(--yb-primary)]/50 font-mono text-sm leading-relaxed text-left ${wordsVisible ? '' : 'yb-veiled'}`}>
            {newWords}
          </button>
          {!wordsVisible && <p className="text-xs text-[var(--yb-on-surface-variant)] flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Tap to show (make sure nobody is watching)</p>}
          <button type="button" className={secondary} onClick={() => downloadRecoveryCard({ address: newAddress, phrase: newWords })}><Download className="w-4 h-4" /> Save as a card to print</button>
          {/* Only here, while setting up: help people get the words somewhere safe. */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondary} onClick={async () => {
              try { await navigator.clipboard.writeText(newWords); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
            }}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy</button>
            {canShareCard() && (
              <button type="button" className={secondary} onClick={async () => setShared(await shareRecoveryCard({ address: newAddress, phrase: newWords }))}>
                {shared ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} Share
              </button>
            )}
          </div>
          <p className="text-[11px] text-[var(--yb-on-surface-variant)]">Copy or share only to somewhere you alone control (your own notes or saved messages). Anyone who sees these words can take your sats.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wroteDown} onChange={(e) => setWroteDown(e.target.checked)} /> I've written them down</label>
          <button type="button" className={primary} disabled={!wroteDown} onClick={() => { setNewWords(''); onOpen(); }}>Open my wallet</button>
        </>
      )}

      {mode === 'recover' && (
        <>
          <div className="flex items-center gap-2">{back(locked ? 'unlock' : 'start')}<h1 className="text-lg font-bold">Recover your wallet</h1></div>
          <p className="text-sm text-[var(--yb-on-surface-variant)]">For a lost phone or a forgotten PIN. You'll choose a new PIN, your other phones are signed out, and for 24 hours at most 1,000 sats can be sent, in case someone else is trying. Just using a new phone and you know your PIN? <button type="button" className={link} onClick={() => go('login')}>Log in instead</button>.</p>
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[var(--yb-secondary)]">With your email</span>
            <input type="email" className={field} placeholder="5tan@altradits.com" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value.slice(0, 200)); setTypo(null); }} />
            <button type="button" className={secondary} disabled={busy || !email.includes('@')}
              onClick={() => runEmail(async (confirmTypo) => { const r = await requestEmailRecovery(email.trim(), confirmTypo); setNote(r.message); })}>Email me a recovery link</button>
          </div>
          <div className="space-y-2 pt-2 border-t border-[var(--yb-outline-variant)]/60">
            <span className="block text-xs font-semibold text-[var(--yb-secondary)] pt-2">With your 12 recovery words</span>
            <textarea rows={3} className={`yb-sensitive ${field} font-mono resize-none`} value={words} autoComplete="off" spellCheck={false} onChange={(e) => setWords(e.target.value)} />
            <PinInput value={pin} onChange={setPin} label="New PIN" name="yb-words-pin" />
            <PinInput value={pin2} onChange={setPin2} label="The same new PIN again" name="yb-words-pin2" />
            <button type="button" className={primary} disabled={busy || words.trim().split(/\s+/).length < 12}
              onClick={() => run(async () => { twoPins(); await restoreServerWallet(words, pin); setWords(''); setPin(''); setPin2(''); onOpen(); })}>Recover with my words</button>
          </div>
          {note && <p className="text-sm text-emerald-300">{note}</p>}
        </>
      )}

      {mode === 'newpin' && (
        <>
          <h1 className="text-lg font-bold">Choose a new PIN</h1>
          <p className="text-sm text-[var(--yb-on-surface-variant)]">This finishes recovering your wallet on this phone. Your other phones will be signed out, and for 24 hours at most 1,000 sats can be sent.</p>
          <PinInput value={pin} onChange={setPin} label="New PIN" name="yb-rec-pin" autoFocus />
          <PinInput value={pin2} onChange={setPin2} label="The same new PIN again" name="yb-rec-pin2" />
          <button type="button" className={primary} disabled={busy}
            onClick={() => run(async () => { twoPins(); await finishEmailRecovery(recoveryToken || '', pin); setPin(''); setPin2(''); onRecoveryDone?.(); onOpen(); })}>
            Recover my wallet
          </button>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {typo && (
        <button type="button" className={secondary} disabled={busy} onClick={typo.resend}>
          Use {typo.address} anyway
        </button>
      )}
    </div>
  );
};
