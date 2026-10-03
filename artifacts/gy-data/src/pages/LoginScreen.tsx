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

    function stopRaf() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function startHold() {
      if (timerRef.current) return;

      didUnlockRef.current = false;
      startRef.current = performance.now();
      setProgress(0);

      function tick() {
        const p = Math.min(
          (performance.now() - startRef.current) /
            SUPER_ADMIN_HOLD_MS,
          1,
        );

        setProgress(p);

        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      }

      rafRef.current = requestAnimationFrame(tick);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        stopRaf();
        setProgress(0);
        didUnlockRef.current = true;
        onSuperRef.current();
      }, SUPER_ADMIN_HOLD_MS);
    }

    function cancelHold() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      stopRaf();
      setProgress(0);
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      startHold();
    };

    const onUp = () => cancelHold();
    const onCancel = () => cancelHold();
    const onLeave = () => cancelHold();
    const noCtx = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown, {
      passive: false,
    });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('contextmenu', noCtx);

    return () => {
      cancelHold();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('contextmenu', noCtx);
    };
  }, []);

  const handleClick = () => {
    if (didUnlockRef.current) {
      didUnlockRef.current = false;
      return;
    }

    onTapRef.current();
  };

  const pressing = progress > 0;

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      className="font-semibold relative"
      style={{
        color: pressing
          ? 'rgba(255,255,255,0.96)'
          : 'rgba(147,197,253,0.9)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition:
          'color 0.15s ease, transform 0.15s ease',
        outline: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color =
          'rgba(255,255,255,0.96)';
      }}
      onMouseLeave={e => {
        if (!pressing) {
          e.currentTarget.style.color =
            'rgba(147,197,253,0.9)';
        }
      }}
    >
      Create Account

      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -4,
          left: 0,
          height: 2,
          width: `${progress * 100}%`,
          background:
            'linear-gradient(90deg, #38BDF8, #2563EB)',
          borderRadius: 999,
          opacity: pressing ? 0.85 : 0,
          transition: pressing
            ? 'none'
            : 'opacity 0.2s ease',
          pointerEvents: 'none',
          boxShadow:
            '0 0 10px rgba(37,99,235,0.75)',
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activeIdRef = useRef<number | null>(null);
  const onUnlockRef = useRef(onUnlock);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    function startHold() {
      if (activeIdRef.current !== null) return;

      activeIdRef.current = 1;
      setPressing(true);

      timerRef.current = setTimeout(() => {
        activeIdRef.current = null;
        timerRef.current = null;
        setPressing(false);
        onUnlockRef.current();
      }, ADMIN_HOLD_MS);
    }

    function cancelHold() {
      if (
        !timerRef.current &&
        activeIdRef.current === null
      ) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      activeIdRef.current = null;
      setPressing(false);
    }

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      startHold();
    };

    const onUp = () => cancelHold();
    const onCancel = () => cancelHold();
    const onLeave = () => cancelHold();
    const noCtx = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown, {
      passive: false,
    });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('contextmenu', noCtx);

    return () => {
      cancelHold();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('contextmenu', noCtx);
    };
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="Admin access"
      className="absolute top-0 left-0 w-16 h-16"
      style={{
        background: 'transparent',
        border: 0,
        outline: 'none',
        touchAction: 'none',
        opacity: pressing ? 0.18 : 0,
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
  const [pinActive, setPinActive] = useState(false);

  const phoneInputRef =
    useRef<HTMLInputElement>(null);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid =
    /^0[7-9][01]\d{8}$/.test(phoneDigits);

  const handleLogin = useCallback(async () => {
    if (isLoggingIn || pin.length < 6) {
      return;
    }

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
        setPinActive(false);

        return;
      }

      setIsError(true);

      if (result.error === 'no_account') {
        toast.error(
          'No account found with this number.',
        );

        setTimeout(() => {
          setPin('');
          setIsError(false);
          setIsLoggingIn(false);
          setPinActive(false);
          phoneInputRef.current?.focus();
        }, 1400);

        return;
      }

      if (result.error === 'account_suspended') {
        toast.error(
          'Account suspended. Please contact support.',
          { duration: 5000 },
        );

        setTimeout(() => {
          setPin('');
          setIsError(false);
          setIsLoggingIn(false);
          setPinActive(false);
        }, 1800);

        return;
      }

      if (result.error === 'account_closed') {
        toast.error(
          'This account has been closed.',
          { duration: 5000 },
        );

        setTimeout(() => {
          setPin('');
          setIsError(false);
          setIsLoggingIn(false);
          setPinActive(false);
        }, 1800);

        return;
      }

      if (result.error === 'wrong_pin') {
        toast.error(
          'Incorrect PIN. Please try again.',
        );

        setPin('');
        setIsLoggingIn(false);
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

  const handleKey = (key: string) => {
    if (isLoggingIn) {
      return;
    }

    if (key === 'backspace') {
      setPin(p => p.slice(0, -1));
      setIsError(false);
      return;
    }

    if (pin.length < 6) {
      setPin(p => p + key);
      setIsError(false);
    }
  };

  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '');

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

      if (digits.length <= 11) {
        setPhone(digits);
      } else {
        setPhone(digits.slice(-11));
      }

      setPhoneCopied(true);

      setTimeout(() => {
        setPhoneCopied(false);
      }, 1200);
    } catch {
      // Clipboard permission denied.
    }
  };

  const handleCreateAccount = () => {
    setLocation('/register');
  };

  const handleForgotPin = () => {
    setLocation('/forgot-pin');
  };

  const handleAdmin = () => {
    setLocation('/admin-login');
  };

  const handleSuperAdmin = () => {
    setLocation('/super-admin-login');
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

  return (
    <div
      className="min-h-[100dvh] w-full overflow-hidden relative flex flex-col"
      style={{
        background:
          'radial-gradient(circle at 50% 12%, rgba(37,99,235,0.22) 0%, rgba(37,99,235,0.06) 26%, transparent 48%), linear-gradient(180deg, #020B22 0%, #061B3A 46%, #03102B 100%)',
      }}
    >
      <HiddenAdminTrigger
        onUnlock={handleAdmin}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(30,144,255,0.08), transparent 38%)',
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 pt-12 pb-6">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-[420px] flex flex-col items-center"
        >
          <div
            className="flex items-center justify-center rounded-[28px] overflow-hidden"
            style={{
              width: 112,
              height: 112,
              background:
                'rgba(255,255,255,0.045)',
              border:
                '1px solid rgba(255,255,255,0.10)',
              boxShadow:
                '0 20px 55px rgba(0,0,0,0.28), 0 0 35px rgba(37,99,235,0.10)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <img
              src="/gy-data-logo.svg"
              alt="GY DATA"
              className="w-[82px] h-[82px] object-contain"
            />
          </div>

          <h1
            className="mt-5 text-[28px] font-extrabold tracking-tight"
            style={{
              color: '#FFFFFF',
              textShadow:
                '0 4px 20px rgba(0,0,0,0.25)',
            }}
          >
            GY DATA
          </h1>

          <p
            className="mt-1 text-sm"
            style={{
              color: 'rgba(255,255,255,0.68)',
              letterSpacing: '0.12em',
            }}
          >
            Endless Joy
          </p>

          <div className="w-full mt-8">
            <label
              className="block text-sm font-semibold mb-2"
              style={{
                color: 'rgba(255,255,255,0.88)',
              }}
            >
              Phone Number
            </label>

            <div
              className="flex items-center rounded-2xl px-4"
              style={{
                height: 56,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.055))',
                border: phoneError
                  ? '1px solid rgba(239,68,68,0.9)'
                  : '1px solid rgba(96,165,250,0.30)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 25px rgba(0,0,0,0.16)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
              }}
            >
              <span
                className="text-sm font-semibold mr-3"
                style={{
                  color:
                    'rgba(255,255,255,0.78)',
                }}
              >
                +234
              </span>

              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="8012345678"
                className="flex-1 bg-transparent outline-none text-base placeholder:text-blue-200/35"
                style={{
                  color: '#FFFFFF',
                }}
                disabled={isLoggingIn}
              />

              {phone.length > 0 && (
                <button
                  type="button"
                  onClick={handlePastePhone}
                  className="text-xs font-semibold px-2 py-1 rounded-lg transition-all active:scale-95"
                  style={{
                    color:
                      'rgba(191,219,254,0.98)',
                    background:
                      'rgba(37,99,235,0.16)',
                    border:
                      '1px solid rgba(96,165,250,0.20)',
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
                style={{ color: '#FCA5A5' }}
              >
                {phoneError}
              </p>
            )}
          </div>

          <div className="w-full mt-5">
            <div className="flex items-center justify-between mb-2">
              <label
                className="text-sm font-semibold"
                style={{
                  color:
                    'rgba(255,255,255,0.88)',
                }}
              >
                Login PIN
              </label>

              <button
                type="button"
                onClick={handleForgotPin}
                className="text-xs font-semibold transition-colors"
                style={{
                  color:
                    'rgba(96,165,250,0.98)',
                }}
                disabled={isLoggingIn}
              >
                Forgot PIN?
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPinActive(true)}
              className="w-full rounded-2xl px-4 flex items-center justify-center transition-all"
              style={{
                height: 56,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.055))',
                border: isError
                  ? '1px solid rgba(239,68,68,0.95)'
                  : pinActive
                    ? '1px solid rgba(96,165,250,0.85)'
                    : '1px solid rgba(96,165,250,0.30)',
                boxShadow: pinActive
                  ? '0 0 22px rgba(37,99,235,0.18), inset 0 1px 0 rgba(255,255,255,0.07)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 25px rgba(0,0,0,0.16)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
              }}
              disabled={isLoggingIn}
            >
              <div className="flex gap-3">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <span
                    key={i}
                    className="w-3 h-3 rounded-full transition-all duration-150"
                    style={{
                      background:
                        i < pin.length
                          ? '#FFFFFF'
                          : 'rgba(255,255,255,0.23)',
                      boxShadow:
                        i < pin.length
                          ? '0 0 9px rgba(147,197,253,0.75)'
                          : 'none',
                      transform:
                        i < pin.length
                          ? 'scale(1.05)'
                          : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </button>
          </div>

          <div className="w-full grid grid-cols-3 gap-3 mt-5">
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
                    disabled={isLoggingIn}
                    className="h-14 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.035))',
                      color: '#FFFFFF',
                      border:
                        '1px solid rgba(96,165,250,0.24)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.055), 0 7px 20px rgba(0,0,0,0.14)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter:
                        'blur(10px)',
                    }}
                  >
                    <span
                      className="text-xl"
                      style={{
                        color:
                          'rgba(191,219,254,0.95)',
                      }}
                    >
                      ←
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKey(key)}
                  disabled={isLoggingIn}
                  className="h-14 rounded-2xl flex items-center justify-center text-lg font-bold active:scale-95 transition-all"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(37,99,235,0.17), rgba(30,64,175,0.12))',
                    color: '#FFFFFF',
                    border:
                      '1px solid rgba(96,165,250,0.28)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.06), 0 7px 20px rgba(0,0,0,0.15)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter:
                      'blur(10px)',
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
                  className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{
                    borderColor:
                      'rgba(147,197,253,0.45)',
                    borderTopColor:
                      'transparent',
                    boxShadow:
                      '0 0 10px rgba(37,99,235,0.35)',
                  }}
                />

                <span
                  className="text-sm"
                  style={{
                    color:
                      'rgba(255,255,255,0.76)',
                  }}
                >
                  Signing in...
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-7">
            <CreateAccountButton
              onTap={handleCreateAccount}
              onSuperAdmin={handleSuperAdmin}
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
            letterSpacing: '0.03em',
          }}
        >
          Secure • Fast • Reliable
        </p>
      </div>
    </div>
  );
}
