import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { normalizeNigerianNumber } from '../components/PhoneInputWithContacts';

const ADMIN_HOLD_MS = 2000;
const SUPER_ADMIN_HOLD_MS = 2000;
const PHONE_DIGITS_REQUIRED = 11;
const PIN_DIGITS_REQUIRED = 6;

function CreateAccountButton({
  onTap,
  onSuperAdmin,
}: {
  onTap: () => void;
  onSuperAdmin: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const timerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
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
          rafRef.current =
            requestAnimationFrame(tick);
        }
      }

      rafRef.current =
        requestAnimationFrame(tick);

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

    el.addEventListener(
      'pointerdown',
      onDown,
      { passive: false },
    );
    el.addEventListener(
      'pointerup',
      onUp,
    );
    el.addEventListener(
      'pointercancel',
      onCancel,
    );
    el.addEventListener(
      'pointerleave',
      onLeave,
    );
    el.addEventListener(
      'contextmenu',
      noCtx,
    );

    return () => {
      cancelHold();

      el.removeEventListener(
        'pointerdown',
        onDown,
      );
      el.removeEventListener(
        'pointerup',
        onUp,
      );
      el.removeEventListener(
        'pointercancel',
        onCancel,
      );
      el.removeEventListener(
        'pointerleave',
        onLeave,
      );
      el.removeEventListener(
        'contextmenu',
        noCtx,
      );
    };
  }, []);

  const handleClick = () => {
    if (didUnlockRef.current) {
      didUnlockRef.current = false;
      return;
    }

    onTapRef.current();
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      className="font-semibold relative"
      style={{
        color: '#183B8C',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'color 0.15s ease',
        outline: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color =
          '#0F2D70';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color =
          '#183B8C';
      }}
    >
      Create Account

      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -2,
          left: 0,
          height: 2,
          width: `${progress * 100}%`,
          background: '#183B8C',
          borderRadius: 1,
          opacity:
            progress > 0 ? 0.7 : 0,
          pointerEvents: 'none',
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
  const btnRef =
    useRef<HTMLButtonElement>(null);

  const timerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const activeIdRef =
    useRef<number | null>(null);

  const onUnlockRef =
    useRef(onUnlock);

  const [pressing, setPressing] =
    useState(false);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    function startHold() {
      if (
        activeIdRef.current !== null
      ) {
        return;
      }

      activeIdRef.current = 1;
      setPressing(true);

      timerRef.current =
        setTimeout(() => {
          activeIdRef.current = null;
          timerRef.current = null;
          setPressing(false);
          onUnlockRef.current();
        }, ADMIN_HOLD_MS);
    }

    function cancelHold() {
      if (timerRef.current) {
        clearTimeout(
          timerRef.current,
        );

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
    const noCtx = (e: Event) =>
      e.preventDefault();

    el.addEventListener(
      'pointerdown',
      onDown,
      { passive: false },
    );
    el.addEventListener(
      'pointerup',
      onUp,
    );
    el.addEventListener(
      'pointercancel',
      onCancel,
    );
    el.addEventListener(
      'pointerleave',
      onLeave,
    );
    el.addEventListener(
      'contextmenu',
      noCtx,
    );

    return () => {
      cancelHold();

      el.removeEventListener(
        'pointerdown',
        onDown,
      );
      el.removeEventListener(
        'pointerup',
        onUp,
      );
      el.removeEventListener(
        'pointercancel',
        onCancel,
      );
      el.removeEventListener(
        'pointerleave',
        onLeave,
      );
      el.removeEventListener(
        'contextmenu',
        noCtx,
      );
    };
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="Admin access"
      className="absolute top-0 left-0 w-16 h-16 z-50"
      style={{
        background: 'transparent',
        border: 0,
        outline: 'none',
        touchAction: 'none',
        opacity: pressing ? 0.08 : 0,
      }}
    />
  );
}

export default function LoginScreen() {
  const { login } = useAppContext();
  const [, setLocation] =
    useLocation();

  const [phone, setPhone] =
    useState('');

  const [phoneError, setPhoneError] =
    useState('');

  const [pin, setPin] =
    useState('');

  const [isError, setIsError] =
    useState(false);

  const [isLoggingIn, setIsLoggingIn] =
    useState(false);

  const [pinVisible, setPinVisible] =
    useState(false);

  const [pinStep, setPinStep] =
    useState(false);

  const phoneInputRef =
    useRef<HTMLInputElement>(null);

  const pinSectionRef =
    useRef<HTMLDivElement>(null);

  const phoneDigits =
    phone.replace(/\D/g, '');

  const phoneValid =
    /^0[7-9][01]\d{8}$/.test(
      phoneDigits,
    );

  const resetPinStep = useCallback(() => {
    setPin('');
    setPinStep(false);
    setIsError(false);
  }, []);

  const handleLogin =
    useCallback(async () => {
      if (isLoggingIn) return;

      if (!phoneValid) {
        setPhoneError(
          'Enter a valid 11-digit Nigerian mobile number.',
        );

        phoneInputRef.current?.focus();
        return;
      }

      if (
        pin.length !==
        PIN_DIGITS_REQUIRED
      ) {
        setIsError(true);

        toast.error(
          'Enter your 6-digit PIN.',
        );

        return;
      }

      setPhoneError('');
      setIsError(false);
      setIsLoggingIn(true);

      try {
        const normalizedPhone =
          normalizeNigerianNumber(
            phone,
          );

        const result =
          await login(
            normalizedPhone ||
              phone,
            pin,
          );

        if (result.success) {
          setIsLoggingIn(false);
          setIsError(false);
          setPin('');
          return;
        }

        setIsError(true);

        if (
          result.error ===
          'no_account'
        ) {
          toast.error(
            'No account found with this number.',
          );

          setTimeout(() => {
            setPin('');
            setIsError(false);
            setIsLoggingIn(false);
            setPinStep(false);
            phoneInputRef.current?.focus();
          }, 1400);

          return;
        }

        if (
          result.error ===
          'account_suspended'
        ) {
          toast.error(
            'Account suspended. Please contact support.',
            { duration: 5000 },
          );

          setTimeout(() => {
            setPin('');
            setIsError(false);
            setIsLoggingIn(false);
          }, 1800);

          return;
        }

        if (
          result.error ===
          'account_closed'
        ) {
          toast.error(
            'This account has been closed.',
            { duration: 5000 },
          );

          setTimeout(() => {
            setPin('');
            setIsError(false);
            setIsLoggingIn(false);
          }, 1800);

          return;
        }

        if (
          result.error ===
          'wrong_pin'
        ) {
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
        console.error(
          'Login error:',
          error,
        );

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

  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits =
      e.target.value.replace(
        /\D/g,
        '',
      );

    setPhoneError('');
    setIsError(false);

    if (
      digits.length <=
      PHONE_DIGITS_REQUIRED
    ) {
      setPhone(digits);

      if (
        digits.length ===
          PHONE_DIGITS_REQUIRED &&
        /^0[7-9][01]\d{8}$/.test(
          digits,
        )
      ) {
        setPinStep(true);

        window.setTimeout(() => {
          pinSectionRef.current?.scrollIntoView(
            {
              behavior: 'smooth',
              block: 'center',
            },
          );
        }, 80);
      } else {
        setPinStep(false);
      }
    }
  };

  const handlePinKey = (
    digit: string,
  ) => {
    if (
      isLoggingIn ||
      pin.length >= PIN_DIGITS_REQUIRED
    ) {
      return;
    }

    setIsError(false);

    const nextPin =
      `${pin}${digit}`;

    setPin(nextPin);

    if (
      nextPin.length ===
      PIN_DIGITS_REQUIRED
    ) {
      window.setTimeout(() => {
        void handleLogin();
      }, 120);
    }
  };

  const handleBackspace = () => {
    if (isLoggingIn) return;

    setIsError(false);

    setPin(current =>
      current.slice(0, -1),
    );
  };

  const handlePinInput = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits =
      e.target.value.replace(
        /\D/g,
        '',
      );

    if (
      digits.length <=
      PIN_DIGITS_REQUIRED
    ) {
      setPin(digits);

      if (digits.length === 6) {
        window.setTimeout(() => {
          void handleLogin();
        }, 120);
      }
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

  const keypadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  return (
    <div
      className="min-h-[100dvh] w-full relative overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 55%, #F3F6FB 100%)',
      }}
    >
      <HiddenAdminTrigger
        onUnlock={handleAdmin}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 12%, rgba(37,99,235,0.07), transparent 38%)',
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 pt-10 pb-8">
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
          className="w-full max-w-[420px] flex flex-col items-center"
        >
          {/* LOGO */}
          <div
            className="flex items-center justify-center rounded-[28px] overflow-hidden"
            style={{
              width: 112,
              height: 112,
              background:
                'rgba(255,255,255,0.08)',
              border:
                '1px solid rgba(255,255,255,0.14)',
              boxShadow:
                '0 18px 50px rgba(0,0,0,0.12)',
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
              color: '#111827',
            }}
          >
            GY DATA
          </h1>

          <p
            className="mt-1 text-sm"
            style={{
              color:
                'rgba(17,24,39,0.58)',
            }}
          >
            Endless Joy
          </p>

          {/* LOGIN CARD */}
          <div
            className="w-full mt-8 rounded-[28px] p-5 sm:p-6"
            style={{
              background:
                'rgba(255,255,255,0.96)',
              border:
                '1px solid rgba(15,23,42,0.08)',
              boxShadow:
                '0 18px 55px rgba(15,23,42,0.10)',
            }}
          >
            {/* PHONE */}
            <div className="w-full">
              <label
                className="block text-sm font-semibold mb-2"
                style={{
                  color: '#172033',
                }}
              >
                Phone Number
              </label>

              <div
                className="flex items-center rounded-2xl px-4"
                style={{
                  height: 58,
                  background: '#FFFFFF',
                  border:
                    phoneError
                      ? '1.5px solid #EF4444'
                      : '1px solid #CBD5E1',
                  boxShadow:
                    '0 2px 8px rgba(15,23,42,0.035)',
                }}
              >
                <span
                  className="text-sm font-semibold mr-3"
                  style={{
                    color: '#475569',
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
                  value={
                    phone.startsWith(
                      '0',
                    )
                      ? phone.slice(1)
                      : phone
                  }
                  onChange={
                    handlePhoneChange
                  }
                  placeholder="8012345678"
                  className="flex-1 bg-transparent outline-none text-base"
                  style={{
                    color: '#111827',
                    caretColor:
                      '#183B8C',
                  }}
                  disabled={
                    isLoggingIn
                  }
                  maxLength={10}
                />
              </div>

              {phoneError && (
                <p
                  className="mt-2 text-xs"
                  style={{
                    color: '#DC2626',
                  }}
                >
                  {phoneError}
                </p>
              )}

              {!phoneError &&
                phone.length ===
                  PHONE_DIGITS_REQUIRED && (
                  <p
                    className="mt-2 text-xs"
                    style={{
                      color:
                        '#16A34A',
                    }}
                  >
                    Phone number verified
                  </p>
                )}
            </div>

            {/* PIN */}
            <AnimatePresence>
              {pinStep && (
                <motion.div
                  ref={
                    pinSectionRef
                  }
                  initial={{
                    opacity: 0,
                    y: 12,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: 12,
                  }}
                  transition={{
                    duration: 0.25,
                  }}
                  className="w-full mt-6"
                >
                  <div className="flex items-center justify-between mb-3">
                    <label
                      className="text-sm font-semibold"
                      style={{
                        color:
                          '#172033',
                      }}
                    >
                      Enter 6-digit PIN
                    </label>

                    <button
                      type="button"
                      onClick={
                        handleForgotPin
                      }
                      className="text-xs font-semibold"
                      style={{
                        color:
                          '#183B8C',
                      }}
                      disabled={
                        isLoggingIn
                      }
                    >
                      Forgot PIN?
                    </button>
                  </div>

                  {/* PIN DISPLAY */}
                  <div
                    className="flex items-center justify-center gap-3 rounded-2xl"
                    style={{
                      minHeight: 64,
                      background:
                        '#F8FAFC',
                      border:
                        isError
                          ? '1.5px solid #EF4444'
                          : '1px solid #CBD5E1',
                    }}
                  >
                    {Array.from({
                      length:
                        PIN_DIGITS_REQUIRED,
                    }).map(
                      (_, index) => (
                        <span
                          key={index}
                          className="flex items-center justify-center"
                          style={{
                            width: 13,
                            height: 13,
                            borderRadius:
                              '50%',
                            background:
                              index <
                              pin.length
                                ? '#183B8C'
                                : '#CBD5E1',
                            boxShadow:
                              index <
                              pin.length
                                ? '0 2px 5px rgba(24,59,140,0.25)'
                                : 'none',
                          }}
                        />
                      ),
                    )}
                  </div>

                  {/* Hidden numeric input.
                      This keeps accessibility and autofill support
                      while the visible keypad controls the PIN. */}
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    value={pin}
                    onChange={
                      handlePinInput
                    }
                    aria-label="6 digit PIN"
                    tabIndex={-1}
                    className="absolute opacity-0 pointer-events-none w-0 h-0"
                  />

                  {/* NUMERIC KEYPAD */}
                  <div
                    className="mt-5 grid grid-cols-3 gap-3"
                    aria-label="PIN keypad"
                  >
                    {keypadRows
                      .flat()
                      .map(digit => (
                        <button
                          key={digit}
                          type="button"
                          onClick={() =>
                            handlePinKey(
                              digit,
                            )
                          }
                          disabled={
                            isLoggingIn ||
                            pin.length >=
                              PIN_DIGITS_REQUIRED
                          }
                          className="rounded-2xl flex items-center justify-center font-semibold text-xl transition-all active:scale-95 disabled:opacity-50"
                          style={{
                            height: 58,
                            background:
                              '#F8FAFC',
                            border:
                              '1px solid #E2E8F0',
                            color:
                              '#172033',
                            boxShadow:
                              '0 2px 6px rgba(15,23,42,0.04)',
                            touchAction:
                              'manipulation',
                          }}
                        >
                          {digit}
                        </button>
                      ))}

                    {/* CLEAR */}
                    <button
                      type="button"
                      onClick={
                        resetPinStep
                      }
                      disabled={
                        isLoggingIn
                      }
                      className="rounded-2xl flex items-center justify-center font-semibold text-sm transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        height: 58,
                        background:
                          '#F8FAFC',
                        border:
                          '1px solid #E2E8F0',
                        color:
                          '#64748B',
                        touchAction:
                          'manipulation',
                      }}
                    >
                      Clear
                    </button>

                    {/* ZERO */}
                    <button
                      type="button"
                      onClick={() =>
                        handlePinKey(
                          '0',
                        )
                      }
                      disabled={
                        isLoggingIn ||
                        pin.length >=
                          PIN_DIGITS_REQUIRED
                      }
                      className="rounded-2xl flex items-center justify-center font-semibold text-xl transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        height: 58,
                        background:
                          '#F8FAFC',
                        border:
                          '1px solid #E2E8F0',
                        color:
                          '#172033',
                        boxShadow:
                          '0 2px 6px rgba(15,23,42,0.04)',
                        touchAction:
                          'manipulation',
                      }}
                    >
                      0
                    </button>

                    {/* BACKSPACE */}
                    <button
                      type="button"
                      onClick={
                        handleBackspace
                      }
                      disabled={
                        isLoggingIn ||
                        pin.length ===
                          0
                      }
                      aria-label="Delete last PIN digit"
                      className="rounded-2xl flex items-center justify-center font-semibold text-sm transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        height: 58,
                        background:
                          '#F8FAFC',
                        border:
                          '1px solid #E2E8F0',
                        color:
                          '#DC2626',
                        touchAction:
                          'manipulation',
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  {/* SIGN IN */}
                  <motion.button
                    type="button"
                    onClick={() =>
                      void handleLogin()
                    }
                    disabled={
                      isLoggingIn ||
                      pin.length !==
                        PIN_DIGITS_REQUIRED
                    }
                    whileTap={{
                      scale: 0.985,
                    }}
                    className="w-full mt-4 rounded-2xl flex items-center justify-center text-base font-bold"
                    style={{
                      height: 56,
                      background:
                        isLoggingIn
                          ? '#64748B'
                          : pin.length ===
                              PIN_DIGITS_REQUIRED
                            ? '#183B8C'
                            : '#CBD5E1',
                      color:
                        '#FFFFFF',
                      boxShadow:
                        pin.length ===
                          PIN_DIGITS_REQUIRED
                          ? '0 8px 20px rgba(24,59,140,0.20)'
                          : 'none',
                    }}
                  >
                    {isLoggingIn ? (
                      <span className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border-2 animate-spin"
                          style={{
                            borderColor:
                              'rgba(255,255,255,0.45)',
                            borderTopColor:
                              '#FFFFFF',
                          }}
                        />
                        Signing in...
                      </span>
                    ) : (
                      'Sign In'
                    )}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CREATE ACCOUNT */}
            {!pinStep && (
              <div className="flex justify-center mt-6">
                <CreateAccountButton
                  onTap={
                    handleCreateAccount
                  }
                  onSuperAdmin={
                    handleSuperAdmin
                  }
                />
              </div>
            )}

            {pinStep && (
              <div className="flex justify-center mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setPhone('');
                    setPhoneError('');
                    setPin('');
                    setPinStep(false);
                    setIsError(false);

                    window.setTimeout(
                      () => {
                        phoneInputRef.current?.focus();
                      },
                      50,
                    );
                  }}
                  disabled={isLoggingIn}
                  className="text-xs font-semibold"
                  style={{
                    color:
                      '#64748B',
                  }}
                >
                  Change phone number
                </button>
              </div>
            )}
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
                className="mt-4"
              >
                <span
                  className="text-xs"
                  style={{
                    color:
                      'rgba(15,23,42,0.48)',
                  }}
                >
                  Please wait...
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="relative z-10 pb-5 text-center">
        <p
          className="text-[11px]"
          style={{
            color:
              'rgba(15,23,42,0.38)',
          }}
        >
          Secure • Fast • Reliable
        </p>
      </div>
    </div>
  );
}
