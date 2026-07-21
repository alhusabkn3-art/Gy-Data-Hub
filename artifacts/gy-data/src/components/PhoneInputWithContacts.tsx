import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookUser, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Nigerian number normalizer
// Handles: +234XXXXXXXXXX, 234XXXXXXXXXX, 0XXXXXXXXXX, loose digit strings
// Always returns up to 11 digits, digits-only.
// ---------------------------------------------------------------------------
export function normalizeNigerianNumber(raw: string): string {
  // Strip everything except digits and leading +
  let s = raw.replace(/[\s\-\(\)\.]/g, '');
  if (s.startsWith('+234')) {
    s = '0' + s.slice(4);
  } else if (/^234\d{9,}$/.test(s)) {
    // 234XXXXXXXXX (13 digits) → 0XXXXXXXXXX
    s = '0' + s.slice(3);
  }
  // Keep digits only, cap at 11
  return s.replace(/\D/g, '').slice(0, 11);
}

// Validate: Nigerian numbers are 11 digits starting with 0
export function isValidNigerianNumber(num: string): boolean {
  return /^0[7-9][01]\d{8}$/.test(num);
}

// Friendly display formatter: 08031234567 → 0803 123 4567
function formatDisplay(digits: string): string {
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PhoneInputWithContactsProps {
  value: string;                   // raw digit string (stored in parent)
  onChange: (val: string) => void; // always called with digit-only string
  placeholder?: string;
  label?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PhoneInputWithContacts({
  value,
  onChange,
  placeholder = 'e.g. 0803 456 7890',
  label = 'Phone Number',
  className = '',
}: PhoneInputWithContactsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard/paste input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const normalized = normalizeNigerianNumber(raw);
    onChange(normalized);
  };

  // Contact Picker API — silent fallback on unsupported browsers
  const handlePickContact = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (!nav.contacts) return; // API not available — silent no-op
      const results = await nav.contacts.select(['tel'], { multiple: false });
      if (results && results.length > 0 && results[0].tel?.length > 0) {
        const raw = results[0].tel[0] as string;
        onChange(normalizeNigerianNumber(raw));
        inputRef.current?.focus();
      }
    } catch {
      // User dismissed the picker, or permission denied — silently do nothing
    }
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
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

      {/* Input wrapper */}
      <div className="relative flex items-center">
        {/* Nigerian flag / country indicator */}
        <div className="absolute left-4 flex items-center gap-1.5 pointer-events-none select-none">
          <span className="text-base leading-none">🇳🇬</span>
          <span className="text-sm font-semibold text-muted-foreground">+234</span>
          <div className="w-px h-4 bg-border ml-0.5" />
        </div>

        {/* Text input — padded left to clear flag, right to clear action buttons */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={placeholder}
          value={formatDisplay(value)}
          onChange={handleInputChange}
          className={`
            w-full bg-card border-2 rounded-xl h-14 text-base font-medium outline-none transition-colors
            pl-[7.5rem] pr-24
            ${showValidation
              ? isValid
                ? 'border-primary/60 focus:border-primary'
                : 'border-amber-400/60 focus:border-amber-400'
              : 'border-border focus:border-primary'
            }
          `}
        />

        {/* Right-side action buttons */}
        <div className="absolute right-2 flex items-center gap-1">
          {/* Clear button — shown when there's input */}
          <AnimatePresence>
            {value.length > 0 && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                onClick={handleClear}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 active:scale-90 transition-all"
                aria-label="Clear number"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Contact picker button */}
          <button
            type="button"
            onClick={handlePickContact}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 active:scale-90 active:bg-primary/30 transition-all"
            aria-label="Pick from contacts"
          >
            <BookUser className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Inline validation hint */}
      <AnimatePresence>
        {showValidation && !isValid && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-amber-600 mt-2 pl-1"
          >
            Enter a valid 11-digit Nigerian mobile number (e.g. 08031234567)
          </motion.p>
        )}
        {isValid && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-primary mt-2 pl-1 font-medium"
          >
            ✓ {formatDisplay(value)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
