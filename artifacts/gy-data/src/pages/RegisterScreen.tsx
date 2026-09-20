import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { normalizeNigerianNumber } from '../components/PhoneInputWithContacts';

// ── Shared sub-components ─────────────────────────────────────────────────────
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

function PinIndicators({
  pin,
  isError,
  length = 6,
}: {
  pin: string;
  isError: boolean;
  length?: number;
}) {
  return (
    <div className="flex justify-center gap-2.5 mb-7">
      {[...Array(length)].map((_, i) => {
        const isFilled = i < pin.length;
        const isActive = i === pin.length;

        return (
          <motion.div
            key={i}
            animate={isFilled ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.18 }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isFilled
                ? '2px solid #1D4ED8'
                : isActive
                  ? '2px solid #2563EB'
                  : isError
                    ? '2px solid #EF4444'
                    : '2px solid #BFCFEE',
              background: isFilled
                ? 'linear-gradient(135deg, #1A3D8F 0%, #2563EB 100%)'
                : isActive
                  ? '#EFF6FF'
                  : isError
                    ? '#FEF2F2'
                    : '#F8FAFF',
              boxShadow: isActive
                ? '0 0 0 4px rgba(37,99,235,0.12)'
                : isFilled
                  ? '0 4px 12px rgba(37,99,235,0.3)'
                  : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <AnimatePresence>
              {isFilled && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#ffffff',
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {KEYS.map((key, i) => (
        <motion.button
          key={i}
          type="button"
          whileTap={key ? { scale: 0.93 } : {}}
          onClick={() => key && onPress(key)}
          disabled={!key}
          style={
            key
              ? {
                  height: 56,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: key === 'backspace' ? undefined : 22,
                  fontWeight: 600,
                  color: '#0B1F4E',
                  background: '#F0F5FF',
                  border: '1.5px solid #DDEAFF',
                  boxShadow: '0 2px 8px rgba(11,31,78,0.08)',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                }
              : {
                  opacity: 0,
                  cursor: 'default',
                  height: 56,
                }
          }
          onMouseEnter={e => {
            if (key) {
              (e.currentTarget as HTMLButtonElement).style.background = '#E0ECFF';
            }
          }}
          onMouseLeave={e => {
            if (key) {
              (e.currentTarget as HTMLButtonElement).style.background = '#F0F5FF';
            }
          }}
        >
          {key === 'backspace' ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0B1F4E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          ) : (
            key
          )}
        </motion.button>
      ))}
    </div>
  );
}

function GradientButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full font-bold text-white text-base"
      style={{
        height: 52,
        borderRadius: 999,
        background: disabled
          ? 'linear-gradient(90deg, #9BA8C0 0%, #9BA8C0 100%)'
          : 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
        boxShadow: disabled ? 'none' : '0 6px 24px rgba(37,99,235,0.38)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.02em',
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </motion.button>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateStep1(name: string, email: string, phone: string): string | null {
  if (!name.trim() || name.trim().length < 2) {
    return 'Please enter your full name.';
  }

  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address.';
  }

  if (!phone || !/^0[7-9][01]\d{8}$/.test(phone.replace(/\D/g, ''))) {
    return 'Please enter a valid 11-digit Nigerian mobile number.';
  }

  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Step =
  | 'details'
  | 'choose-username'
  | 'set-pin'
  | 'confirm-pin'
  | 'set-purchase-pin'
  | 'confirm-purchase-pin'
  | 'success';

type UsernameStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid';

export default function RegisterScreen() {
  const { register, accountExists, checkUsernameAvailable } = useAppContext();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] =
    useState<UsernameStatus>('idle');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [purchasePin, setPurchasePin] = useState('');
  const [confirmPurchasePin, setConfirmPurchasePin] = useState('');
  const [purchasePinError, setPurchasePinError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const handleDetailsNext = async () => {
    const err = validateStep1(name, email, phone);

    if (err) {
      setFieldErrors(err);
      return;
    }

    setIsCheckingPhone(true);

    try {
      const exists = await accountExists(
        phone.replace(/\D/g, '').slice(0, 11),
      );

      if (exists) {
        setFieldErrors(
          'An account with this phone number already exists. Please sign in instead.',
        );
        return;
      }

      setFieldErrors('');
      setStep('choose-username');
    } catch {
      setFieldErrors(
        'Could not check this phone number. Please try again.',
      );
    } finally {
      setIsCheckingPhone(false);
    }
  };

  const handleUsernameNext = async () => {
    const normalized = username.toLowerCase().trim();

    if (!/^[a-z]{4,15}$/.test(normalized)) {
      setUsernameStatus('invalid');
      return;
    }

    setIsCheckingUsername(true);
    setUsernameStatus('checking');

    try {
      const status = await checkUsernameAvailable(normalized);

      if (status === 'error') {
        setUsernameStatus('idle');
        toast.error(
          'Could not check username availability. Please try again.',
        );
        return;
      }

      setUsernameStatus(status);

      if (status !== 'available') {
        return;
      }

      setStep('set-pin');
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const handleSetPinKey = (key: string) => {
    if (key === 'backspace') {
      setNewPin(p => p.slice(0, -1));
      return;
    }

    if (newPin.length >= 6) {
      return;
    }

    const next = newPin + key;
    setNewPin(next);

    if (next.length === 6) {
      setTimeout(() => setStep('confirm-pin'), 200);
    }
  };

  const handleConfirmPinKey = async (key: string) => {
    if (key === 'backspace') {
      setConfirmPin(p => p.slice(0, -1));
      setPinError(false);
      return;
    }

    if (confirmPin.length >= 6 || isCreating) {
      return;
    }

    const next = confirmPin + key;
    setConfirmPin(next);

    if (next.length !== 6) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    if (next !== newPin) {
      setPinError(true);
      toast.error("PINs don't match. Try again.");
      setConfirmPin('');
      return;
    }

    setConfirmPin('');
    setPinError(false);
    setStep('set-purchase-pin');
  };

  const handleSetPurchasePinKey = (key: string) => {
    if (key === 'backspace') {
      setPurchasePin(p => p.slice(0, -1));
      return;
    }

    if (purchasePin.length >= 4) {
      return;
    }

    const next = purchasePin + key;
    setPurchasePin(next);

    if (next.length === 4) {
      setTimeout(() => setStep('confirm-purchase-pin'), 200);
    }
  };

  const handleConfirmPurchasePinKey = async (key: string) => {
    if (key === 'backspace') {
      setConfirmPurchasePin(p => p.slice(0, -1));
      setPurchasePinError(false);
      return;
    }

    if (confirmPurchasePin.length >= 4 || isCreating) {
      return;
    }

    const next = confirmPurchasePin + key;
    setConfirmPurchasePin(next);

    if (next.length !== 4) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    if (next !== purchasePin) {
      setPurchasePinError(true);
      toast.error("Purchase PINs don't match. Try again.");
      setConfirmPurchasePin('');
      return;
    }

    setIsCreating(true);

    try {
      const result = await register(
        name.trim(),
        email.trim(),
        phone.replace(/\D/g, '').slice(0, 11),
        username.toLowerCase().trim(),
        newPin,
        purchasePin,
      );

      if (!result.success) {
        if (result.error === 'phone_taken') {
          toast.error(
            'An account with this phone number already exists.',
          );
          setStep('details');
          setNewPin('');
          setConfirmPin('');
          setPurchasePin('');
          setConfirmPurchasePin('');
          setPinError(false);
          setPurchasePinError(false);
          return;
        }

        if (result.error === 'username_taken') {
          toast.error(
            'Username was just taken. Please choose another.',
          );
          setStep('choose-username');
          setUsername('');
          setUsernameStatus('idle');
          setNewPin('');
          setConfirmPin('');
          setPurchasePin('');
          setConfirmPurchasePin('');
          setPinError(false);
          setPurchasePinError(false);
          return;
        }

        toast.error(
          result.error || 'Could not create your account. Please try again.',
        );
        setPurchasePinError(true);
        return;
      }

      setStep('success');

      setTimeout(() => {
        setLocation('/');
      }, 1800);
    } catch {
      toast.error('Could not create your account. Please try again.');
      setPurchasePinError(true);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-8"
      style={{
        background:
          'linear-gradient(180deg, #F7FAFF 0%, #EEF4FF 55%, #E8F0FF 100%)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => {
              if (step === 'details') {
                setLocation('/');
              } else if (step === 'choose-username') {
                setStep('details');
              } else if (step === 'set-pin') {
                setStep('choose-username');
              } else if (step === 'confirm-pin') {
                setStep('set-pin');
                setConfirmPin('');
                setPinError(false);
              } else if (step === 'set-purchase-pin') {
                setStep('confirm-pin');
                setPurchasePin('');
                setConfirmPurchasePin('');
                setPurchasePinError(false);
              } else if (step === 'confirm-purchase-pin') {
                setStep('set-purchase-pin');
                setConfirmPurchasePin('');
                setPurchasePinError(false);
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid #DDEAFF',
              color: '#0B1F4E',
            }}
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <p
              className="text-xs font-bold tracking-[0.18em] uppercase"
              style={{ color: '#2563EB' }}
            >
              GY DATA
            </p>
            <p
              className="text-[11px]"
              style={{ color: '#9BA8C0' }}
            >
              Create Account
            </p>
          </div>

          <div className="w-10" />
        </div>

        <div
          className="rounded-3xl p-6 sm:p-8"
          style={{
            background: 'rgba(255,255,255,0.94)',
            border: '1px solid rgba(221,234,255,0.95)',
            boxShadow: '0 20px 60px rgba(11,31,78,0.10)',
          }}
        >
          <div className="mb-7">
            <div className="flex gap-1.5">
              {[
                'details',
                'choose-username',
                'set-pin',
                'confirm-pin',
                'set-purchase-pin',
                'confirm-purchase-pin',
              ].map((item, index) => {
                const order = [
                  'details',
                  'choose-username',
                  'set-pin',
                  'confirm-pin',
                  'set-purchase-pin',
                  'confirm-purchase-pin',
                  'success',
                ];
                const current = order.indexOf(step);
                const active = index <= current;

                return (
                  <div
                    key={item}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      background: active
                        ? '#2563EB'
                        : '#E5EDFA',
                    }}
                  />
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
            >
              {/* ── Step 1: Personal details ─────────────────────────────── */}
              {step === 'details' && (
                <>
                  <div className="text-center mb-6">
                    <h1
                      className="text-2xl font-bold mb-1"
                      style={{ color: '#0B1F4E' }}
                    >
                      Create Your Account
                    </h1>
                    <p
                      className="text-sm"
                      style={{ color: '#6B7FA3' }}
                    >
                      Enter your details to get started
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                        style={{ color: '#6B7FA3' }}
                      >
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={e => {
                          setName(e.target.value);
                          setFieldErrors('');
                        }}
                        placeholder="Your full name"
                        autoComplete="name"
                        className="w-full h-12 rounded-xl px-4 text-sm font-medium outline-none transition-colors"
                        style={{
                          border: '2px solid #DDEAFF',
                          background: '#F8FAFF',
                          color: '#0B1F4E',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = '#2563EB';
                          e.currentTarget.style.background = '#EFF6FF';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = '#DDEAFF';
                          e.currentTarget.style.background = '#F8FAFF';
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                        style={{ color: '#6B7FA3' }}
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => {
                          setEmail(e.target.value);
                          setFieldErrors('');
                        }}
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="w-full h-12 rounded-xl px-4 text-sm font-medium outline-none transition-colors"
                        style={{
                          border: '2px solid #DDEAFF',
                          background: '#F8FAFF',
                          color: '#0B1F4E',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = '#2563EB';
                          e.currentTarget.style.background = '#EFF6FF';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = '#DDEAFF';
                          e.currentTarget.style.background = '#F8FAFF';
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                        style={{ color: '#6B7FA3' }}
                      >
                        Phone Number
                      </label>

                      <div className="relative">
                        <input
                          ref={phoneInputRef}
                          type="tel"
                          inputMode="numeric"
                          value={phone}
                          onChange={e => {
                            const val = e.target.value
                              .replace(/\D/g, '')
                              .slice(0, 11);

                            setPhone(val);
                            setFieldErrors('');
                          }}
                          placeholder="08012345678"
                          autoComplete="tel"
                          className="w-full h-12 rounded-xl px-4 text-sm font-medium outline-none transition-colors"
                          style={{
                            border: '2px solid #DDEAFF',
                            background: '#F8FAFF',
                            color: '#0B1F4E',
                            paddingRight:
                              phone.length > 0 ? '5.5rem' : '4rem',
                          }}
                          onFocus={e => {
                            e.currentTarget.style.borderColor = '#2563EB';
                            e.currentTarget.style.background = '#EFF6FF';
                          }}
                          onBlur={e => {
                            e.currentTarget.style.borderColor = '#DDEAFF';
                            e.currentTarget.style.background = '#F8FAFF';
                          }}
                        />

                        {/* Paste button */}
                        <AnimatePresence>
                          {phone.length === 0 && (
                            <motion.button
                              type="button"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.12 }}
                              onClick={async () => {
                                try {
                                  const text =
                                    await navigator.clipboard.readText();

                                  if (text) {
                                    setPhone(
                                      normalizeNigerianNumber(text),
                                    );
                                    setFieldErrors('');
                                  }
                                } catch {
                                  // Clipboard permission denied.
                                }

                                phoneInputRef.current?.focus();
                              }}
                              className="absolute right-2 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all active:scale-90"
                              style={{
                                color: '#2563EB',
                                background: 'rgba(37,99,235,0.09)',
                              }}
                              aria-label="Paste phone number"
                            >
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect
                                  x="9"
                                  y="2"
                                  width="6"
                                  height="4"
                                  rx="1"
                                />
                                <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
                              </svg>
                              Paste
                            </motion.button>
                          )}
                        </AnimatePresence>

                        {/* Copy button */}
                        <AnimatePresence>
                          {/^\d{11}$/.test(phone) &&
                            /^0[7-9][01]\d{8}$/.test(phone) && (
                              <motion.button
                                type="button"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.12 }}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(
                                      phone,
                                    );
                                    setPhoneCopied(true);

                                    setTimeout(
                                      () => setPhoneCopied(false),
                                      1800,
                                    );
                                  } catch {
                                    // Clipboard permission denied.
                                  }
                                }}
                                className="absolute right-2 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all active:scale-90"
                                style={{
                                  color: phoneCopied
                                    ? '#16a34a'
                                    : '#2563EB',
                                  background: phoneCopied
                                    ? 'rgba(22,163,74,0.09)'
                                    : 'rgba(37,99,235,0.09)',
                                }}
                                aria-label="Copy phone number"
                              >
                                {phoneCopied ? (
                                  <>
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect
                                        x="9"
                                        y="9"
                                        width="13"
                                        height="13"
                                        rx="2"
                                      />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    Copy
                                  </>
                                )}
                              </motion.button>
                            )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {fieldErrors && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-medium text-center mb-4 px-2 py-2 rounded-lg"
                      style={{
                        color: '#DC2626',
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                      }}
                    >
                      {fieldErrors}
                    </motion.p>
                  )}

                  <GradientButton
                    onClick={handleDetailsNext}
                    disabled={isCheckingPhone}
                  >
                    {isCheckingPhone ? 'Checking…' : 'Continue'}
                  </GradientButton>

                  <div className="text-center mt-5">
                    <button
                      type="button"
                      onClick={() => setLocation('/')}
                      className="text-sm font-medium transition-colors"
                      style={{ color: '#6B7FA3' }}
                      onMouseEnter={e => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.color = '#0B1F4E';
                      }}
                      onMouseLeave={e => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.color = '#6B7FA3';
                      }}
                    >
                      Already have an account?{' '}
                      <span style={{ color: '#2563EB', fontWeight: 600 }}>
                        Sign In
                      </span>
                    </button>
                  </div>
                </>
              )}

              {/* ── Step 2: Choose username ───────────────────────────────────── */}
              {step === 'choose-username' && (
                <>
                  <div className="text-center mb-6">
                    <h2
                      className="text-xl font-bold mb-1"
                      style={{ color: '#0B1F4E' }}
                    >
                      Choose a Username
                    </h2>

                    <p
                      className="text-sm"
                      style={{ color: '#6B7FA3' }}
                    >
                      This is how you'll appear across GY DATA
                    </p>
                  </div>

                  <div className="mb-5">
                    <label
                      className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                      style={{ color: '#6B7FA3' }}
                    >
                      Username
                    </label>

                    <div className="relative flex items-center">
                      <span
                        className="absolute left-3 text-base font-bold select-none"
                        style={{ color: '#9BA8C0' }}
                      >
                        @
                      </span>

                      <input
                        type="text"
                        value={username}
                        onChange={e => {
                          const val = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z]/g, '')
                            .slice(0, 15);

                          setUsername(val);
                          setUsernameStatus('idle');
                        }}
                        placeholder="yourname"
                        autoComplete="username"
                        spellCheck={false}
                        className="w-full h-12 rounded-xl text-sm font-semibold outline-none transition-colors"
                        style={{
                          border: `2px solid ${
                            usernameStatus === 'available'
                              ? '#16a34a'
                              : usernameStatus === 'taken' ||
                                  usernameStatus === 'invalid'
                                ? '#DC2626'
                                : '#DDEAFF'
                          }`,
                          background: '#F8FAFF',
                          color: '#0B1F4E',
                          paddingLeft: '2rem',
                          paddingRight: '2.5rem',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.background = '#EFF6FF';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.background = '#F8FAFF';
                        }}
                      />

                      <div className="absolute right-3 flex items-center">
                        {usernameStatus === 'checking' && (
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        )}

                        {usernameStatus === 'available' && (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#16a34a"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}

                        {(usernameStatus === 'taken' ||
                          usernameStatus === 'invalid') && (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#DC2626"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5 min-h-[18px]">
                      {usernameStatus === 'available' && (
                        <p
                          className="text-xs font-semibold"
                          style={{ color: '#16a34a' }}
                        >
                          ✓ @{username} is available
                        </p>
                      )}

                      {usernameStatus === 'taken' && (
                        <p
                          className="text-xs font-semibold"
                          style={{ color: '#DC2626' }}
                        >
                          @{username} is already taken. Try another.
                        </p>
                      )}

                      {usernameStatus === 'invalid' && (
                        <p
                          className="text-xs font-semibold"
                          style={{ color: '#DC2626' }}
                        >
                          4–15 letters only — no numbers, spaces or symbols.
                        </p>
                      )}
                    </div>

                    <p
                      className="text-[11px] mt-2"
                      style={{ color: '#9BA8C0' }}
                    >
                      4–15 letters only (A–Z) · no numbers or symbols ·
                      cannot be changed for 30 days
                    </p>
                  </div>

                  <GradientButton
                    onClick={handleUsernameNext}
                    disabled={isCheckingUsername}
                  >
                    {isCheckingUsername ? 'Checking…' : 'Continue'}
                  </GradientButton>
                </>
              )}

              {/* ── Step 3: Set PIN ───────────────────────────────────────────── */}
              {step === 'set-pin' && (
                <>
                  <div className="text-center mb-7">
                    <h2
                      className="text-xl font-bold mb-1"
                      style={{ color: '#0B1F4E' }}
                    >
                      Create Your PIN
                    </h2>

                    <p
                      className="text-sm"
                      style={{ color: '#6B7FA3' }}
                    >
                      Choose a 6-digit PIN to secure your account
                    </p>
                  </div>

                  <PinIndicators pin={newPin} isError={false} />

                  <Keypad onPress={handleSetPinKey} />

                  <p
                    className="text-xs text-center"
                    style={{ color: '#9BA8C0' }}
                  >
                    Keep your PIN private. Do not share it with anyone.
                  </p>
                </>
              )}

              {/* ── Step 4: Confirm PIN ───────────────────────────────────────── */}
              {step === 'confirm-pin' && (
                <motion.div
                  animate={
                    pinError
                      ? { x: [-10, 10, -8, 8, -5, 5, 0] }
                      : {}
                  }
                  transition={{ duration: 0.45 }}
                >
                  <div className="text-center mb-7">
                    <h2
                      className="text-xl font-bold mb-1"
                      style={{ color: '#0B1F4E' }}
                    >
                      Confirm Your PIN
                    </h2>

                    <p
                      className="text-sm"
                      style={{ color: '#6B7FA3' }}
                    >
                      Enter your 6-digit PIN one more time
                    </p>
                  </div>

                  <PinIndicators
                    pin={confirmPin}
                    isError={pinError}
                  />

                  <Keypad onPress={handleConfirmPinKey} />
                </motion.div>
              )}

              {/* ── Step 5: Set Purchase PIN ─────────────────────────────────── */}
              {step === 'set-purchase-pin' && (
                <>
                  <div className="text-center mb-7">
                    <h2
                      className="text-xl font-bold mb-1"
                      style={{ color: '#0B1F4E' }}
                    >
                      Create Your Purchase PIN
                    </h2>

                    <p
                      className="text-sm"
                      style={{ color: '#6B7FA3' }}
                    >
                      Choose a 4-digit PIN for data and airtime purchases
                    </p>
                  </div>

                  <PinIndicators
                    pin={purchasePin}
                    isError={false}
                    length={4}
                  />

                  <Keypad onPress={handleSetPurchasePinKey} />

                  <p
                    className="text-xs text-center"
                    style={{ color: '#9BA8C0' }}
                  >
                    Keep your Purchase PIN private. Do not share it with anyone.
                  </p>
                </>
              )}

              {/* ── Step 6: Confirm Purchase PIN ─────────────────────────────── */}
              {step === 'confirm-purchase-pin' && (
                <motion.div
                  animate={
                    purchasePinError
                      ? { x: [-10, 10, -8, 8, -5, 5, 0] }
                      : {}
                  }
                  transition={{ duration: 0.45 }}
                >
                  <div className="text-center mb-7">
                    <h2
                      className="text-xl font-bold mb-1"
                      style={{ color: '#0B1F4E' }}
                    >
                      Confirm Purchase PIN
                    </h2>

                    <p
                      className="text-sm"
                      style={{ color: '#6B7FA3' }}
                    >
                      Enter your 4-digit Purchase PIN one more time
                    </p>
                  </div>

                  <PinIndicators
                    pin={confirmPurchasePin}
                    isError={purchasePinError}
                    length={4}
                  />

                  <Keypad onPress={handleConfirmPurchasePinKey} />

                  {isCreating && (
                    <p
                      className="text-xs text-center mt-2"
                      style={{ color: '#9BA8C0' }}
                    >
                      Creating your account…
                    </p>
                  )}
                </motion.div>
              )}

              {/* ── Step 5: Success ───────────────────────────────────────────── */}
              {step === 'success' && (
                <div className="flex flex-col items-center text-center py-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 200,
                      damping: 18,
                    }}
                    className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                    style={{
                      background:
                        'linear-gradient(135deg, #1A3D8F 0%, #2563EB 100%)',
                      boxShadow:
                        '0 12px 36px rgba(37,99,235,0.4)',
                    }}
                  >
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </motion.div>

                  <h2
                    className="text-2xl font-bold mb-2"
                    style={{ color: '#0B1F4E' }}
                  >
                    Welcome to GY DATA!
                  </h2>

                  <p
                    className="text-sm mb-1"
                    style={{ color: '#6B7FA3' }}
                  >
                    Hi{' '}
                    <span
                      className="font-semibold"
                      style={{ color: '#0B1F4E' }}
                    >
                      {name.trim().split(' ')[0]}
                    </span>
                    , your account is ready.
                  </p>

                  <p
                    className="text-xs mb-8"
                    style={{ color: '#9BA8C0' }}
                  >
                    Taking you to your dashboard…
                  </p>

                  <GradientButton onClick={() => setLocation('/')}>
                    Go to Dashboard
                  </GradientButton>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <p
        className="z-10 mt-8 text-xs font-medium tracking-[0.18em] uppercase"
        style={{ color: 'rgba(147,197,253,0.5)' }}
      >
        GY DATA · endless joy
      </p>
    </div>
  );
}
