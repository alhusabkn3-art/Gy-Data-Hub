import React, { useRef } from 'react';
import { BookUser, X } from 'lucide-react';

// Normalize Nigerian phone number
export function normalizeNigerianNumber(raw: string): string {
  let s = raw.replace(/[\s\-\(\)\.]/g, '');

  if (s.startsWith('+234')) {
    s = '0' + s.slice(4);
  } else if (/^234\d{9,}$/.test(s)) {
    s = '0' + s.slice(3);
  }

  return s.replace(/\D/g, '').slice(0, 11);
}

// Validate Nigerian mobile number
export function isValidNigerianNumber(num: string): boolean {
  return /^0[7-9][01]\d{8}$/.test(num);
}

function formatDisplay(digits: string): string {
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) {
    return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

interface PhoneInputWithContactsProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export default function PhoneInputWithContacts({
  value,
  onChange,
  placeholder = '0803 456 7890',
  label = 'Phone Number',
  className = '',
}: PhoneInputWithContactsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    onChange(normalizeNigerianNumber(e.target.value));
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handlePickContact = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;

      if (!nav.contacts) return;

      const results = await nav.contacts.select(
        ['tel'],
        { multiple: false },
      );

      if (
        results &&
        results.length > 0 &&
        results[0].tel?.length > 0
      ) {
        onChange(
          normalizeNigerianNumber(
            results[0].tel[0] as string,
          ),
        );

        inputRef.current?.focus();
      }
    } catch {
      // User cancelled or browser does not support Contacts API
    }
  };

  const isValid = isValidNigerianNumber(value);
  const showValidation = value.length >= 10;

  return (
    <div className={className}>
      {label && (
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          {label}
        </h2>
      )}

      <div className="relative flex items-center">
        {/* Country */}
        <div className="absolute left-4 flex items-center gap-2 pointer-events-none select-none z-10">
          <span className="text-base">🇳🇬</span>

          <span className="text-sm font-semibold text-muted-foreground">
            +234
          </span>

          <div className="w-px h-5 bg-border" />
        </div>

        {/* MANUAL PHONE INPUT */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={placeholder}
          value={formatDisplay(value)}
          onChange={handleInputChange}
          className={`
            w-full
            bg-card
            border-2
            rounded-xl
            h-14
            text-base
            font-medium
            outline-none
            transition-colors
            pl-[7.5rem]
            pr-24

            ${
              showValidation
                ? isValid
                  ? 'border-primary focus:border-primary'
                  : 'border-amber-400 focus:border-amber-400'
                : 'border-border focus:border-primary'
            }
          `}
        />

        {/* RIGHT SIDE — NO COPY / NO PASTE */}
        <div className="absolute right-2 flex items-center gap-1">
          {/* Clear */}
          {value.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-black/5 active:scale-90"
              aria-label="Clear number"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Contacts */}
          <button
            type="button"
            onClick={handlePickContact}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 active:scale-90"
            aria-label="Pick from contacts"
          >
            <BookUser className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showValidation && !isValid && (
        <p className="text-xs text-amber-600 mt-2 pl-1">
          Enter a valid 11-digit Nigerian mobile number.
        </p>
      )}

      {isValid && (
        <p className="text-xs text-primary mt-2 pl-1 font-medium">
          ✓ {formatDisplay(value)}
        </p>
      )}
    </div>
  );
}
