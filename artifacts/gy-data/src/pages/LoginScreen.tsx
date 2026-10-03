import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { normalizeNigerianNumber } from '../components/PhoneInputWithContacts';

const ADMIN_HOLD_MS = 2000;
const SUPER_ADMIN_HOLD_MS = 2000;

function CreateAccountButton({
  onTap,
  onSuperAdmin,
}: {
  onTap: () => void;
  onSuperAdmin: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const didUnlockRef = useRef(false);
  const onTapRef = useRef(onTap);
  const onSuperRef = useRef(onSuperAdmin);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  useEffect(() => {
    onSuperRef.current = onSuperAdmin;
  }, [onSuperAdmin]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    const stopRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const startHold = () => {
      if (timerRef.current) return;

      didUnlockRef.current = false;
      startRef.current = performance.now();

      const tick = () => {
        const p = Math.min(
          (performance.now() - startRef.current) /
            SUPER_ADMIN_HOLD_MS,
          1,
        );

        setProgress(p);

        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      rafRef.current = requestAnimationFrame(tick);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        stopRaf();
        setProgress(0);
        didUnlockRef.current = true;
        onSuperRef.current();
      }, SUPER_ADMIN_HOLD_MS);
    };

    const cancelHold = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      stopRaf();
      setProgress(0);
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      startHold();
    };

    el.addEventListener('pointerdown', onDown, {
      passive: false,
    });
    el.addEventListener('pointerup', cancelHold);
    el.addEventListener('pointercancel', cancelHold);
    el.addEventListener('pointerleave', cancelHold);

    return () => {
      cancelHold();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', cancelHold);
      el.removeEventListener('pointercancel', cancelHold);
      el.removeEventListener('pointerleave', cancelHold);
    };
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => {
        if (didUnlockRef.current) {
          didUnlockRef.current = false;
          return;
        }

        onTapRef.current();
      }}
      className="relative font-semibold"
      style={{
        color: 'rgba(147,197,253,0.85)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      Create Account

      <span
        className="absolute bottom-[-2px] left-0 h-[2px] rounded-full"
        style={{
          width: `${progress * 100}%`,
          background: '#60A5FA',
        }}
      />
    </button>
  );
}

function HiddenAdminTrigger({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    const start = (e: PointerEvent) => {
      e.preventDefault();

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onUnlock();
      }, ADMIN_HOLD_MS);
    };

    const cancel = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    el.addEventListener('pointerdown', start, {
      passive: false,
    });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);

    return () => {
      cancel();
      el.removeEventListener('pointerdown', start);
      el.removeEventListener('pointerup', cancel);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('pointerleave', cancel);
    };
  }, [onUnlock]);

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="Admin access"
      className="absolute left-0 top-0 z-50 h-16 w-16"
      style={{
        background: 'transparent',
        border: 0,
        outline: 'none',
        opacity: 0,
        touchAction: 'none',
      }}
    />
  );
}

export default function LoginScreen() {
  const { login } = useAppContext();
  const [, setLocation] = useLocation();

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid = /^0[7-9][01]\d{8}$/.test(phoneDigits);

  const handleLogin = useCallback(async () => {
    if (isLoggingIn || pin.length !== 6) return;

    if (!phoneValid) {
      setPhoneError(
        'Enter a valid 11-digit Nigerian mobile number.',
      );
      phoneInputRef.current?.focus();
      return;
    }

    setPhoneError('');
    setIsError(false);
    setIsLoggingIn(true);

    try {
      const normalizedPhone =
        normalizeNigerianNumber(phone);

      const result = await login(
        normalizedPhone || phone,
        pin,
      );

      if (result.success) {
        setIsLoggingIn(false);
        setIsError(false);
        setPin('');
        return;
      }

      setIsError(true);

      if (result.error === 'no_account') {
        toast.error(
          'No account found with this number.',
        );

        setPin('');
        setIsLoggingIn(false);
        pinInputRef.current?.focus();
        return;
      }

      if (result.error === 'account_suspended') {
        toast.error(
          'Account suspended. Please contact support.',
          { duration: 5000 },
        );

        setPin('');
        setIsLoggingIn(false);
        return;
      }

      if (result.error === 'account_closed') {
        toast.error(
          'This account has been closed.',
          { duration: 5000 },
        );

        setPin('');
        setIsLoggingIn(false);
        return;
      }

      if (result.error === 'wrong_pin') {
        toast.error(
          'Incorrect PIN. Please try again.',
        );

        setPin('');
        setIsLoggingIn(false);
        pinInputRef.current?.focus();
        return;
      }

      toast.error(
        result.error ||
          'Unable to sign in. Please try again.',
      );

      setPin('');
      setIsLoggingIn(false);
    } catch (error) {
      console.error('Login error:', error);

      setIsError(true);
      setPin('');
      setIsLoggingIn(false);

      toast.error(
        'Unable to sign in right now. Please check your connection and try again.',
      );
    }
  }, [
    isLoggingIn,
    login,
    phone,
    pin,
    phoneValid,
  ]);

  useEffect(() => {
    if (
      pin.length === 6 &&
      phoneValid &&
      !isLoggingIn
    ) {
      void handleLogin();
    }
  }, [
    pin,
    phoneValid,
    isLoggingIn,
    handleLogin,
  ]);

  const handlePinChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits = e.target.value.replace(/\D/g, '');

    setIsError(false);

    if (digits.length <= 6) {
      setPin(digits);
    }
  };

  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits =
      e.target.value.replace(/\D/g, '');

    setPhoneError('');
    setPhoneCopied(false);

    if (digits.length <= 11) {
      setPhone(digits);
    }
  };

  const handlePastePhone = async () => {
    try {
      const text =
        await navigator.clipboard.readText();

      const digits =
        text.replace(/\D/g, '');

      setPhone(
        digits.length > 11
          ? digits.slice(-11)
          : digits,
      );

      setPhoneCopied(true);

      setTimeout(() => {
        setPhoneCopied(false);
      }, 1200);
    } catch {
      // Clipboard permission denied.
    }
  };

  const keys = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '',
    '0',
    'backspace',
  ];

  const handleKey = (key: string) => {
    if (isLoggingIn) return;

    if (key === 'backspace') {
      setPin(value => value.slice(0, -1));
      setIsError(false);
      return;
    }

    if (pin.length < 6) {
      setPin(value => value + key);
      setIsError(false);
      pinInputRef.current?.focus();
    }
  };

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, #061B3A 0%, #07346A 48%, #061B3A 100%)',
      }}
    >
      <HiddenAdminTrigger
        onUnlock={() =>
          setLocation('/admin-login')
        }
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(37,99,235,0.28), transparent 42%)',
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pb-6 pt-12">
        <motion.div
          initial={{
            opacity: 0,
            y: -18,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.45,
          }}
          className="flex w-full max-w-[420px] flex-col items-center"
        >
          <div
            className="flex items-center justify-center overflow-hidden rounded-[28px]"
            style={{
              width: 112,
              height: 112,
              background:
                'rgba(255,255,255,0.08)',
              border:
                '1px solid rgba(255,255,255,0.14)',
              boxShadow:
                '0 18px 50px rgba(0,0,0,0.25)',
            }}
          >
            <img
              src="/gy-data-logo.svg"
              alt="GY DATA"
              className="h-[82px] w-[82px] object-contain"
            />
          </div>

          <h1
            className="mt-5 text-[28px] font-extrabold tracking-tight"
            style={{
              color: '#FFFFFF',
            }}
          >
            GY DATA
          </h1>

          <p
            className="mt-1 text-sm"
            style={{
              color:
                'rgba(255,255,255,0.68)',
            }}
          >
            Endless Joy
          </p>

          {/* PHONE */}
          <div className="mt-8 w-full">
            <label
              className="mb-2 block text-sm font-semibold"
              style={{
                color:
                  'rgba(255,255,255,0.86)',
              }}
            >
              Phone Number
            </label>

            <div
              className="flex items-center rounded-2xl px-4"
              style={{
                height: 56,
                background:
                  'rgba(255,255,255,0.09)',
                border: phoneError
                  ? '1px solid #EF4444'
                  : '1px solid rgba(255,255,255,0.14)',
              }}
            >
              <span
                className="mr-3 text-sm font-semibold"
                style={{
                  color:
                    'rgba(255,255,255,0.7)',
                }}
              >
                +234
              </span>

              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="8012345678"
                className="flex-1 bg-transparent text-base outline-none"
                style={{
                  color: '#FFFFFF',
                }}
                disabled={isLoggingIn}
              />

              {phone.length > 0 && (
                <button
                  type="button"
                  onClick={handlePastePhone}
                  className="text-xs font-semibold"
                  style={{
                    color:
                      'rgba(147,197,253,0.95)',
                  }}
                  disabled={isLoggingIn}
                >
                  {phoneCopied
                    ? 'Pasted'
                    : 'Paste'}
                </button>
              )}
            </div>

            {phoneError && (
              <p
                className="mt-2 text-xs"
                style={{
                  color: '#FCA5A5',
                }}
              >
                {phoneError}
              </p>
            )}
          </div>

          {/* PIN */}
          <div className="mt-5 w-full">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="login-pin"
                className="text-sm font-semibold"
                style={{
                  color:
                    'rgba(255,255,255,0.86)',
                }}
              >
                Login PIN
              </label>

              <button
                type="button"
                onClick={() =>
                  setLocation('/forgot-pin')
                }
                className="text-xs font-semibold"
                style={{
                  color:
                    'rgba(147,197,253,0.95)',
                }}
                disabled={isLoggingIn}
              >
                Forgot PIN?
              </button>
            </div>

            {/* PIN IS NOW A REAL DIGIT INPUT */}
            <div
              className="flex w-full items-center rounded-2xl px-4"
              style={{
                height: 56,
                background:
                  'rgba(255,255,255,0.09)',
                border: isError
                  ? '1px solid #EF4444'
                  : '1px solid rgba(255,255,255,0.14)',
              }}
            >
              <input
                id="login-pin"
                ref={pinInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={handlePinChange}
                onKeyDown={e => {
                  if (
                    e.key === 'Enter' &&
                    pin.length === 6
                  ) {
                    void handleLogin();
                  }
                }}
                placeholder="Enter 6-digit PIN"
                className="w-full bg-transparent text-center text-xl font-bold tracking-[0.35em] outline-none"
                style={{
                  color: '#FFFFFF',
                  caretColor: '#60A5FA',
                }}
                disabled={isLoggingIn}
              />
            </div>
          </div>

          {/* NUMBER KEYPAD */}
          <div className="mt-5 grid w-full grid-cols-3 gap-3">
            {keys.map((key, index) => {
              if (key === '') {
                return (
                  <div
                    key={`empty-${index}`}
                    className="h-14"
                  />
                );
              }

              if (key === 'backspace') {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      handleKey(key)
                    }
                    disabled={
                      isLoggingIn ||
                      pin.length === 0
                    }
                    className="flex h-14 items-center justify-center rounded-2xl transition-transform active:scale-95 disabled:opacity-40"
                    style={{
                      background:
                        'rgba(255,255,255,0.07)',
                      color: '#FFFFFF',
                      border:
                        '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <span className="text-xl">
                      ←
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    handleKey(key)
                  }
                  disabled={
                    isLoggingIn ||
                    pin.length >= 6
                  }
                  className="flex h-14 items-center justify-center rounded-2xl text-lg font-bold transition-transform active:scale-95 disabled:opacity-40"
                  style={{
                    background:
                      'rgba(255,255,255,0.09)',
                    color: '#FFFFFF',
                    border:
                      '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {isLoggingIn && (
              <motion.div
                initial={{
                  opacity: 0,
                  y: 6,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 6,
                }}
                className="mt-5 flex items-center gap-2"
              >
                <div
                  className="h-4 w-4 animate-spin rounded-full border-2"
                  style={{
                    borderColor:
                      'rgba(255,255,255,0.35)',
                    borderTopColor:
                      'transparent',
                  }}
                />

                <span
                  className="text-sm"
                  style={{
                    color:
                      'rgba(255,255,255,0.75)',
                  }}
                >
                  Signing in...
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-7">
            <CreateAccountButton
              onTap={() =>
                setLocation('/register')
              }
              onSuperAdmin={() =>
                setLocation(
                  '/super-admin-login',
                )
              }
            />
          </div>
        </motion.div>
      </div>

      <div className="relative z-10 pb-5 text-center">
        <p
          className="text-[11px]"
          style={{
            color:
              'rgba(255,255,255,0.42)',
          }}
        >
          Secure • Fast • Reliable
        </p>
      </div>
    </div>
  );
}
