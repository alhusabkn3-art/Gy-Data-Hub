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

    function stopAnimation() {
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

      const tick = () => {
        const elapsed =
          performance.now() - startRef.current;

        const value = Math.min(
          elapsed / SUPER_ADMIN_HOLD_MS,
          1,
        );

        setProgress(value);

        if (value < 1) {
          rafRef.current =
            requestAnimationFrame(tick);
        }
      };

      rafRef.current =
        requestAnimationFrame(tick);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        stopAnimation();
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

      stopAnimation();
      setProgress(0);
    }

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      startHold();
    };

    const onPointerUp = () => cancelHold();
    const onPointerCancel = () => cancelHold();
    const onPointerLeave = () => cancelHold();
    const onContextMenu = (event: Event) =>
      event.preventDefault();

    el.addEventListener(
      'pointerdown',
      onPointerDown,
      { passive: false },
    );

    el.addEventListener(
      'pointerup',
      onPointerUp,
    );

    el.addEventListener(
      'pointercancel',
      onPointerCancel,
    );

    el.addEventListener(
      'pointerleave',
      onPointerLeave,
    );

    el.addEventListener(
      'contextmenu',
      onContextMenu,
    );

    return () => {
      cancelHold();

      el.removeEventListener(
        'pointerdown',
        onPointerDown,
      );

      el.removeEventListener(
        'pointerup',
        onPointerUp,
      );

      el.removeEventListener(
        'pointercancel',
        onPointerCancel,
      );

      el.removeEventListener(
        'pointerleave',
        onPointerLeave,
      );

      el.removeEventListener(
        'contextmenu',
        onContextMenu,
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
        outline: 'none',
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
          opacity: progress > 0 ? 0.7 : 0,
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
  const btnRef = useRef<HTMLButtonElement>(null);

  const timerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const onUnlockRef = useRef(onUnlock);

  const [pressing, setPressing] =
    useState(false);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    const startHold = () => {
      if (timerRef.current) return;

      setPressing(true);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPressing(false);
        onUnlockRef.current();
      }, ADMIN_HOLD_MS);
    };

    const cancelHold = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setPressing(false);
    };

    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      startHold();
    };

    const onUp = () => cancelHold();
    const onCancel = () => cancelHold();
    const onLeave = () => cancelHold();
    const noContextMenu = (event: Event) =>
      event.preventDefault();

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
      noContextMenu,
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
        noContextMenu,
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
  const [, setLocation] = useLocation();

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [isLoggingIn, setIsLoggingIn] =
    useState(false);

  const [pinKeypadVisible, setPinKeypadVisible] =
    useState(false);

  const phoneInputRef =
    useRef<HTMLInputElement>(null);

  const pinSectionRef =
    useRef<HTMLDivElement>(null);

  const pinInputRef =
    useRef<HTMLInputElement>(null);

  const phoneDigits =
    phone.replace(/\D/g, '');

  const phoneValid =
    /^0[7-9][01]\d{8}$/.test(
      phoneDigits,
    );

  const resetPin = useCallback(() => {
    setPin('');
    setPinError('');
  }, []);

  const handleLogin = useCallback(
    async () => {
      if (isLoggingIn) return;

      if (!phoneValid) {
        setPhoneError(
          'Enter a valid 11-digit Nigerian phone number.',
        );

        phoneInputRef.current?.focus();
        return;
      }

      if (
        pin.length !==
        PIN_DIGITS_REQUIRED
      ) {
        setPinError(
          'Enter your 6-digit PIN.',
        );
        return;
      }

      setPhoneError('');
      setPinError('');
      setIsLoggingIn(true);

      try {
        /*
         * IMPORTANT:
         * Keep the user's 080... number.
         * normalizeNigerianNumber() handles the
         * backend format.
         */
        const normalizedPhone =
          normalizeNigerianNumber(
            phoneDigits,
          );

        const result = await login(
          normalizedPhone || phoneDigits,
          pin,
        );

        if (result.success) {
          setIsLoggingIn(false);
          setPin('');
          return;
        }

        if (
          result.error ===
          'no_account'
        ) {
          toast.error(
            'No account found with this phone number.',
          );

          setPin('');
          setPinError('');
          setIsLoggingIn(false);
          setPinKeypadVisible(false);

          window.setTimeout(() => {
            phoneInputRef.current?.focus();
          }, 100);

          return;
        }

        if (
          result.error ===
          'account_suspended'
        ) {
          toast.error(
            'Account suspended. Please contact support.',
            {
              duration: 5000,
            },
          );

          setPin('');
          setIsLoggingIn(false);
          return;
        }

        if (
          result.error ===
          'account_closed'
        ) {
          toast.error(
            'This account has been closed.',
            {
              duration: 5000,
            },
          );

          setPin('');
          setIsLoggingIn(false);
          return;
        }

        if (
          result.error ===
          'wrong_pin'
        ) {
          setPinError(
            'Incorrect PIN. Please try again.',
          );

          toast.error(
            'Incorrect PIN.',
          );

          setPin('');
          setIsLoggingIn(false);

          window.setTimeout(() => {
            pinInputRef.current?.focus();
          }, 50);

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

        toast.error(
          'Unable to sign in right now. Please try again.',
        );

        setPin('');
        setIsLoggingIn(false);
      }
    },
    [
      isLoggingIn,
      phoneDigits,
      phoneValid,
      pin,
      login,
    ],
  );

  const handlePhoneChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits =
      event.target.value.replace(
        /\D/g,
        '',
      );

    setPhoneError('');
    setPinError('');

    if (
      digits.length >
      PHONE_DIGITS_REQUIRED
    ) {
      return;
    }

    setPhone(digits);

    /*
     * Once 080XXXXXXXX is complete,
     * reveal the PIN keypad and move
     * focus to PIN automatically.
     */
    if (
      digits.length ===
      PHONE_DIGITS_REQUIRED
    ) {
      if (
        /^0[7-9][01]\d{8}$/.test(
          digits,
        )
      ) {
        setPinKeypadVisible(true);

        window.setTimeout(() => {
          pinSectionRef.current?.scrollIntoView(
            {
              behavior: 'smooth',
              block: 'center',
            },
          );

          pinInputRef.current?.focus();
        }, 100);
      } else {
        setPinKeypadVisible(false);
        setPhoneError(
          'Enter a valid Nigerian phone number.',
        );
      }
    } else {
      setPinKeypadVisible(false);
      setPin('');
    }
  };

  const handlePinDigit = (
    digit: string,
  ) => {
    if (
      isLoggingIn ||
      pin.length >= PIN_DIGITS_REQUIRED
    ) {
      return;
    }

    setPinError('');

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

    setPinError('');

    setPin(current =>
      current.slice(0, -1),
    );
  };

  const handlePinInput = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits =
      event.target.value.replace(
        /\D/g,
        '',
      );

    if (
      digits.length >
      PIN_DIGITS_REQUIRED
    ) {
      return;
    }

    setPinError('');
    setPin(digits);

    if (
      digits.length ===
      PIN_DIGITS_REQUIRED
    ) {
      window.setTimeout(() => {
        void handleLogin();
      }, 120);
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
            {/* PHONE NUMBER */}
            <div className="w-full">
              <label
                className="block text-sm font-semibold mb-2"
                style={{
                  color: '#172033',
                }}
              >
                Phone Number
              </label>

              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel"
                value={phone}
                onChange={
                  handlePhoneChange
                }
                placeholder="08012345678"
                maxLength={
                  PHONE_DIGITS_REQUIRED
                }
                disabled={
                  isLoggingIn
                }
                className="w-full rounded-2xl px-4 outline-none text-base"
                style={{
                  height: 58,
                  background: '#FFFFFF',
                  border:
                    phoneError
                      ? '1.5px solid #EF4444'
                      : '1px solid #CBD5E1',
                  color: '#111827',
                  caretColor:
                    '#183B8C',
                  boxShadow:
                    '0 2px 8px rgba(15,23,42,0.035)',
                }}
              />

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
            </div>

            {/* PIN BOX — ALWAYS BELOW PHONE */}
            <div
              ref={pinSectionRef}
              className="w-full mt-5"
            >
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-sm font-semibold"
                  style={{
                    color: '#172033',
                  }}
                >
                  PIN
                </label>

                <button
                  type="button"
                  onClick={
                    handleForgotPin
                  }
                  disabled={
                    isLoggingIn
                  }
                  className="text-xs font-semibold"
                  style={{
                    color: '#183B8C',
                  }}
                >
                  Forgot PIN?
                </button>
              </div>

              {/* PIN INPUT BOX */}
              <div
                className="relative rounded-2xl"
                style={{
                  height: 60,
                  background:
                    '#FFFFFF',
                  border:
                    pinError
                      ? '1.5px solid #EF4444'
                      : '1px solid #CBD5E1',
                  boxShadow:
                    '0 2px 8px rgba(15,23,42,0.035)',
                }}
              >
                <input
                  ref={pinInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={pin}
                  onChange={
                    handlePinInput
                  }
                  maxLength={
                    PIN_DIGITS_REQUIRED
                  }
                  disabled={
                    isLoggingIn ||
                    !pinKeypadVisible
                  }
                  placeholder={
                    pinKeypadVisible
                      ? 'Enter 6-digit PIN'
                      : 'Enter phone number first'
                  }
                  className="w-full h-full bg-transparent px-4 outline-none text-base"
                  style={{
                    color: '#111827',
                    caretColor:
                      '#183B8C',
                  }}
                />

                {pin.length > 0 && (
                  <div
                    className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1.5 pointer-events-none"
                    aria-hidden="true"
                  >
                    {Array.from({
                      length:
                        PIN_DIGITS_REQUIRED,
                    }).map(
                      (_, index) => (
                        <span
                          key={index}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius:
                              '50%',
                            background:
                              index <
                              pin.length
                                ? '#183B8C'
                                : '#CBD5E1',
                          }}
                        />
                      ),
                    )}
                  </div>
                )}
              </div>

              {pinError && (
                <p
                  className="mt-2 text-xs"
                  style={{
                    color: '#DC2626',
                  }}
                >
                  {pinError}
                </p>
              )}
            </div>

            {/* NUMERIC PIN KEYPAD */}
            <AnimatePresence>
              {pinKeypadVisible && (
                <motion.div
                  initial={{
                    opacity: 0,
                    height: 0,
                  }}
                  animate={{
                    opacity: 1,
                    height: 'auto',
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                  }}
                  transition={{
                    duration: 0.22,
                  }}
                  className="overflow-hidden"
                >
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
                            handlePinDigit(
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

                    <button
                      type="button"
                      onClick={() => {
                        setPin('');
                        setPinError('');
                      }}
                      disabled={
                        isLoggingIn ||
                        pin.length === 0
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

                    <button
                      type="button"
                      onClick={() =>
                        handlePinDigit(
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

                    <button
                      type="button"
                      onClick={
                        handleBackspace
                      }
                      disabled={
                        isLoggingIn ||
                        pin.length === 0
                      }
                      aria-label="Delete PIN digit"
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
                </motion.div>
              )}
            </AnimatePresence>

            {/* SIGN IN */}
            <motion.button
              type="button"
              onClick={() =>
                void handleLogin()
              }
              disabled={
                isLoggingIn ||
                !phoneValid ||
                pin.length !==
                  PIN_DIGITS_REQUIRED
              }
              whileTap={{
                scale: 0.985,
              }}
              className="w-full mt-5 rounded-2xl flex items-center justify-center text-base font-bold"
              style={{
                height: 56,
                background:
                  isLoggingIn
                    ? '#64748B'
                    : phoneValid &&
                        pin.length ===
                          PIN_DIGITS_REQUIRED
                      ? '#183B8C'
                      : '#CBD5E1',
                color: '#FFFFFF',
                boxShadow:
                  phoneValid &&
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

            {/* CREATE ACCOUNT */}
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
          </div>
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
