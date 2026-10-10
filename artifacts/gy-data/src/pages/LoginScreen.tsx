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
import {
  normalizeNigerianNumber,
  isValidNigerianNumber,
} from '../components/PhoneInputWithContacts';

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
        e.currentTarget.style.color = '#0F2D70';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = '#183B8C';
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
  const [isError, setIsError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  /*
   * The UI displays +234 separately.
   * Therefore the user enters only the 10 local digits:
   * 8012345678
   */
  const phoneDigits = phone.replace(/\D/g, '');

  const normalizedPhone = normalizeNigerianNumber(
    phoneDigits.length === 10
      ? `0${phoneDigits}`
      : phoneDigits,
  );

  const phoneValid =
    phoneDigits.length === 10 &&
    isValidNigerianNumber(normalizedPhone);

  /*
   * Automatically move from phone number to PIN
   * immediately after the 10th phone digit.
   */
  useEffect(() => {
    if (
      phoneDigits.length === 10 &&
      phoneValid &&
      !isLoggingIn
    ) {
      requestAnimationFrame(() => {
        pinInputRef.current?.focus();
      });
    }
  }, [
    phoneDigits.length,
    phoneValid,
    isLoggingIn,
  ]);

  const handleLogin = useCallback(async () => {
    if (isLoggingIn) return;

    if (!phoneValid) {
      setPhoneError(
        'Enter a valid Nigerian mobile number.',
      );

      phoneInputRef.current?.focus();
      return;
    }

    if (pin.length < 6) {
      setIsError(true);

      toast.error('Enter your 6-digit PIN.');

      pinInputRef.current?.focus();
      return;
    }

    setPhoneError('');
    setIsError(false);
    setIsLoggingIn(true);

    try {
      const result = await login(
        normalizedPhone,
        pin,
      );

      if (result.success) {
        setIsLoggingIn(false);
        setIsError(false);
        setPin('');

        // Always take the user to the Home page after a successful login.
        setLocation('/');

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
        }, 1800);

        return;
      }

      if (result.error === 'wrong_pin') {
        toast.error(
          'Incorrect PIN. Please try again.',
        );

        setPin('');
        setIsLoggingIn(false);

        requestAnimationFrame(() => {
          pinInputRef.current?.focus();
        });

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
    normalizedPhone,
    phoneValid,
    pin,
  ]);

  /*
   * Automatically login after the 6th PIN digit.
   *
   * This is intentionally done inside useEffect so React
   * has already updated the PIN state before handleLogin()
   * reads it.
   */
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

  const handlePhoneChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits = e.target.value.replace(/\D/g, '');

    setPhoneError('');
    setIsError(false);

    /*
     * Since +234 is already displayed outside the input,
     * keep only the 10 local digits.
     *
     * Accepting 0XXXXXXXXXX as well prevents problems
     * when a number is pasted with the leading zero.
     */
    const localDigits = digits.startsWith('0')
      ? digits.slice(1)
      : digits;

    if (localDigits.length <= 10) {
      setPhone(localDigits);
    }
  };

  const handlePinChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const digits = e.target.value.replace(/\D/g, '');

    setIsError(false);

    if (digits.length <= 6) {
      setPin(digits);
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

  return (
    <div
      className="min-h-[100dvh] w-full relative overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 55%, #F3F6FB 100%)',
      }}
    >
      <HiddenAdminTrigger onUnlock={handleAdmin} />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 12%, rgba(37,99,235,0.07), transparent 38%)',
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 pt-10 pb-8">
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
            style={{ color: '#111827' }}
          >
            GY DATA
          </h1>

          <p
            className="mt-1 text-sm"
            style={{
              color: 'rgba(17,24,39,0.58)',
            }}
          >
            Endless Joy
          </p>

          <div
            className="w-full mt-8 rounded-[28px] p-5 sm:p-6"
            style={{
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid rgba(15,23,42,0.08)',
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

              <div
                className="flex items-center rounded-2xl px-4"
                style={{
                  height: 58,
                  background: '#FFFFFF',
                  border: phoneError
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
                  maxLength={10}
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="8012345678"
                  className="flex-1 bg-transparent outline-none text-base"
                  style={{
                    color: '#111827',
                    caretColor: '#183B8C',
                  }}
                  disabled={isLoggingIn}
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
            </div>

            {/* PIN */}
            <div className="w-full mt-5">
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-sm font-semibold"
                  style={{
                    color: '#172033',
                  }}
                >
                  Login PIN
                </label>

                <button
                  type="button"
                  onClick={handleForgotPin}
                  className="text-xs font-semibold"
                  style={{
                    color: '#183B8C',
                  }}
                  disabled={isLoggingIn}
                >
                  Forgot PIN?
                </button>
              </div>

              <div
                className="flex items-center rounded-2xl px-4"
                style={{
                  height: 58,
                  background: '#FFFFFF',
                  border: isError
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
                  autoComplete="current-password"
                  maxLength={6}
                  value={pin}
                  onChange={handlePinChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      void handleLogin();
                    }
                  }}
                  placeholder="Enter 6-digit PIN"
                  className="flex-1 bg-transparent outline-none text-base tracking-[0.15em]"
                  style={{
                    color: '#111827',
                    caretColor: '#183B8C',
                  }}
                  disabled={isLoggingIn}
                />
              </div>
            </div>

            {/* SIGN IN */}
            <motion.button
              type="button"
              onClick={() => void handleLogin()}
              disabled={isLoggingIn}
              whileTap={{ scale: 0.985 }}
              className="w-full mt-5 rounded-2xl flex items-center justify-center text-base font-bold"
              style={{
                height: 56,
                background: isLoggingIn
                  ? '#64748B'
                  : '#183B8C',
                color: '#FFFFFF',
                boxShadow:
                  '0 8px 20px rgba(24,59,140,0.20)',
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
                onTap={handleCreateAccount}
                onSuperAdmin={handleSuperAdmin}
              />
            </div>
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

