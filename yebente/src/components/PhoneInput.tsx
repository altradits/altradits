import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// A mobile number: the country code is fixed (+254, +251…), people type or paste
// the rest in any form (07…, 2547…, +254 7…).
const subscriber = (dial: string, digits: number, phone: string) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith(dial)) d = d.slice(dial.length);
  return d.replace(/^0+/, '').slice(0, digits);
};

interface PhoneInputProps {
  dial: string; // country code without +, e.g. 254
  digits: number; // subscriber digits after it
  example: string; // e.g. 707 172 370
  value: string;
  onChange: (fullPhone: string, rawDigits: string) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  dial,
  digits: length,
  example,
  value,
  onChange,
  label = 'Phone number',
  ariaLabel,
  disabled = false,
}) => {
  const [digits, setDigits] = useState<string>(() => subscriber(dial, length, value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep internal digits synced if value prop changes externally
  useEffect(() => {
    const extracted = subscriber(dial, length, value);
    if (extracted !== digits) {
      setDigits(extracted);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = subscriber(dial, length, raw);
    setDigits(cleanDigits);

    const fullPhone = cleanDigits.length > 0 ? `${dial}${cleanDigits}` : '';
    onChange(fullPhone, cleanDigits);
  };

  const handleClear = () => {
    setDigits('');
    onChange('', '');
    inputRef.current?.focus();
  };

  // Formatter for display: "707 172 370"
  const formatDisplayDigits = (val: string) => {
    if (!val) return '';
    if (val.length <= 3) return val;
    if (val.length <= 6) return `${val.slice(0, 3)} ${val.slice(3)}`;
    return `${val.slice(0, 3)} ${val.slice(3, 6)} ${val.slice(6)}`;
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-[var(--yb-secondary)]">
          {label}
        </label>
      )}

      {/* The country code is fixed */}
      <div
        className="flex items-center rounded-2xl bg-[var(--yb-surface)] border border-[var(--yb-outline-variant)] focus-within:border-[var(--yb-primary)] overflow-hidden"
      >
        {/* Country Code Prefix Badge */}
        <div className="flex items-center px-3 py-2.5 bg-[var(--yb-surface-container-low)] border-r border-[var(--yb-outline-variant)] shrink-0 select-none">
          <span className="text-xs font-mono font-bold text-[var(--yb-on-surface)]">+{dial}</span>
        </div>

        {/* The subscriber number */}
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            type="tel"
            aria-label={ariaLabel || label || 'Phone number'}
            disabled={disabled}
            value={formatDisplayDigits(digits)}
            onChange={handleInputChange}
            placeholder={example}
            maxLength={20} // Allows pasting full international formats
            className="w-full bg-transparent pl-3.5 pr-10 py-2.5 text-sm font-mono font-bold text-[var(--yb-on-surface)] placeholder-[#554653] focus:outline-none disabled:opacity-50"
          />

          <div className="absolute right-2.5 flex items-center gap-1.5">
            {/* Quick Clear / Delete Button */}
            {digits.length > 0 && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                title="Clear phone number"
                className="w-5 h-5 rounded-full bg-[var(--yb-surface-container-high)] text-[var(--yb-on-surface-variant)] hover:text-[var(--yb-on-surface)] hover:bg-[#3D2B50] flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            )}

          </div>
        </div>
      </div>

    </div>
  );
};
