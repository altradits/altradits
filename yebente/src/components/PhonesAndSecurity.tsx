import React, { useEffect, useState } from 'react';
import { Smartphone, ShieldCheck } from 'lucide-react';
import { fetchSecurity, removeDevice, SecurityInfo } from '../services/altraditsWallet';

// The phones signed in to this wallet and what happened to it lately, so the
// owner can spot a phone or a recovery they don't recognise and remove it.
const when = (iso: string) => {
  try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};

export const PhonesAndSecurity: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [removing, setRemoving] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => fetchSecurity().then(setInfo).catch(() => setInfo(null));
  useEffect(() => { load(); }, []);
  if (!info) return null;

  const remove = async () => {
    setBusy(true); setError('');
    try { await removeDevice(removing, pin); setRemoving(''); setPin(''); await load(); onChanged?.(); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not remove that phone.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <span className="font-semibold text-xs text-[var(--yb-secondary)] flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Phones and security</span>
      <p className="text-[11px] text-[var(--yb-on-surface-variant)]">Each phone stays signed in with its own security key, which can't be copied off it. The app locks itself after a few minutes away; your PIN or fingerprint opens it.</p>
      <ul className="space-y-1.5">
        {info.devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)]">
            <span className="flex items-center gap-2 min-w-0">
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{d.current ? 'This phone' : `Phone added ${when(d.at)}`}<span className="block text-[10px] text-[var(--yb-on-surface-variant)]">Last used {when(d.lastSeen)}</span></span>
            </span>
            <button type="button" onClick={() => { setRemoving(removing === d.id ? '' : d.id); setPin(''); setError(''); }} className="text-[11px] font-semibold text-[var(--yb-primary)] hover:underline shrink-0">Remove</button>
          </li>
        ))}
      </ul>
      {info.olderDevices > 0 && <p className="text-[11px] text-[var(--yb-on-surface-variant)]">{info.olderDevices} older sign-in(s) from before phone keys; they end when you change your PIN or recover.</p>}
      {removing && (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <input type="password" inputMode="numeric" maxLength={6} name="yb-remove-pin" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true"
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN"
            className="yb-sensitive w-full bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] rounded-2xl px-4 py-2.5 text-xs font-mono text-[var(--yb-on-surface)] focus:outline-none focus:border-[var(--yb-primary)] tracking-[0.3em]" />
          <button type="button" disabled={busy || pin.length !== 6} onClick={remove}
            className="w-full h-10 rounded-full border border-[var(--yb-outline-variant)] hover:border-red-500/60 text-[var(--yb-on-surface)] font-semibold text-xs flex items-center justify-center disabled:opacity-50">Remove phone</button>
        </div>
      )}
      {error && <p className="text-xs text-red-300 px-1">{error}</p>}
      {info.log.length > 0 && (
        <details>
          <summary className="text-[11px] text-[var(--yb-on-surface-variant)] cursor-pointer">Recent activity</summary>
          <ul className="mt-1.5 space-y-1">
            {info.log.slice(0, 15).map((e, i) => (
              <li key={i} className="text-[11px] flex justify-between gap-2"><span>{e.text}</span><span className="text-[var(--yb-on-surface-variant)] shrink-0">{when(e.at)}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
