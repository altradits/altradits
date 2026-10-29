import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { extractEthiopianSubscriberDigits } from '../services/telebirrService';

interface EthiopiaPhoneInputProps {
  value: string;
  onChange: (fullPhone: string, rawDigits: string) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
}

export const EthiopiaPhoneInput: React.FC<EthiopiaPhoneInputProps> = ({
  value,
  onChange,
  label = 'Telebirr phone number',
  ariaLabel,
  disabled = false,
}) => {
  const [digits, setDigits] = useState<string>(() => extractEthiopianSubscriberDigits(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const extracted = extractEthiopianSubscriberDigits(value);
    if (extracted !== digits) {
      setDigits(extracted);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = extractEthiopianSubscriberDigits(raw);
    setDigits(cleanDigits);

    const fullPhone = cleanDigits.length > 0 ? `251${cleanDigits}` : '';
    onChange(fullPhone, cleanDigits);
  };

  const handleClear = () => {
    setDigits('');
    onChange('', '');
    inputRef.current?.focus();
  };

  const formatDisplayDigits = (val: string) => {
    if (!val) return '';
    if (val.length <= 3) return val;
    if (val.length <= 6) return `${val.slice(0, 3)} ${val.slice(3)}`;
    return `${val.slice(0, 3)} ${val.slice(3, 6)} ${val.slice(6, 9)}`;
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-[var(--yb-secondary)]">
          {label}
        </label>
      )}

      {/* Input container with fixed Ethiopia prefix */}
      <div className="flex items-center rounded-2xl bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] focus-within:border-[var(--yb-primary)] overflow-hidden">
        {/* Country Code Prefix Badge */}
        <div className="flex items-center px-3 py-2.5 bg-[var(--yb-surface-container-low)] border-r border-[var(--yb-outline-variant)] shrink-0 select-none">
          <span className="text-xs font-mono font-bold text-[var(--yb-on-surface)]">+251</span>
        </div>

        {/* 9-digit Subscriber Number input */}
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            type="tel"
            aria-label={ariaLabel || label || 'Ethiopian phone number'}
            disabled={disabled}
            value={formatDisplayDigits(digits)}
            onChange={handleInputChange}
            placeholder="9XX XXX XXX"
            maxLength={20}
            className="w-full bg-transparent pl-3.5 pr-10 py-2.5 text-sm font-mono font-bold text-[var(--yb-on-surface)] placeholder-[#554653] focus:outline-none disabled:opacity-50"
          />

          {digits.length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 p-1 rounded-full text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)] hover:bg-[var(--yb-surface-container)]"
              aria-label="Clear phone input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
