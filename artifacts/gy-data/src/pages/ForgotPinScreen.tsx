import React, {
  useState,
  useEffect,
  useRef,
} from 'react';

import {
  motion,
  AnimatePresence,
} from 'framer-motion';

import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { apiUrl } from '../lib/apiBase';

const KEYS = [
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

type Step =
  | 'email'
  | 'otp'
  | 'new-pin'
  | 'confirm-pin'
  | 'success';

type ApiResult = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function Keypad({
  onPress,
}: {
  onPress: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {KEYS.map(
        (key, index) => (
          <motion.button
            key={index}
            type="button"
            whileTap={
              key
                ? {
                    scale: 0.93,
                  }
                : {}
            }
            onClick={() =>
              key &&
              onPress(key)
            }
            disabled={!key}
            style={
              key
                ? {
                    height: 56,
                    borderRadius: 16,
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    fontSize:
                      key ===
                      'backspace'
                        ? undefined
                        : 22,
                    fontWeight: 600,
                    color:
                      '#0B1F4E',
                    background:
                      '#F0F5FF',
                    border:
                      '1.5px solid #DDEAFF',
                    boxShadow:
                      '0 2px 8px rgba(11,31,78,0.08)',
                    cursor:
                      'pointer',
                  }
                : {
                    opacity: 0,
                    height: 56,
                  }
            }
          >
            {key ===
            'backspace' ? (
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
                <line
                  x1="18"
                  y1="9"
                  x2="12"
                  y2="15"
                />
                <line
                  x1="12"
                  y1="9"
                  x2="18"
                  y2="15"
                />
              </svg>
            ) : (
              key
            )}
          </motion.button>
        ),
      )}
    </div>
  );
}

function PinIndicators({
  pin,
  error,
}: {
  pin: string;
  error: boolean;
}) {
  return (
    <div className="flex justify-center gap-2.5 mb-7">
      {Array.from({
        length: 6,
      }).map(
        (_, index) => (
          <motion.div
            key={index}
            animate={
              error
                ? {
                    x: [
                      0,
                      -4,
                      4,
                      -4,
                      4,
                      0,
                    ],
                  }
                : {}
            }
            style={{
              width: 14,
              height: 14,
              borderRadius:
                '50%',
              background:
                index <
                pin.length
                  ? error
                    ? '#EF4444'
                    : '#2563EB'
                  : '#DDEAFF',
              border:
                '2px solid #CBD5E1',
            }}
          />
        ),
      )}
    </div>
  );
}

function GradientButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full"
      style={{
        height: 54,
        borderRadius: 15,
        border: 'none',
        background:
          disabled
            ? '#CBD5E1'
            : 'linear-gradient(135deg,#0B1F4E 0%,#2563EB 100%)',
        color: 'white',
        fontSize: 15,
        fontWeight: 800,
        cursor: disabled
          ? 'not-allowed'
          : 'pointer',
        boxShadow:
          disabled
            ? 'none'
            : '0 10px 24px rgba(37,99,235,0.25)',
      }}
    >
      {children}
    </button>
  );
}

function useCountdown(
  seconds: number,
) {
  const [
    count,
    setCount,
  ] = useState(seconds);

  const timerRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const reset = () => {
    if (timerRef.current) {
      clearInterval(
        timerRef.current,
      );
    }

    setCount(seconds);

    timerRef.current =
      setInterval(() => {
        setCount(
          current => {
            if (
              current <= 1
            ) {
              if (
                timerRef.current
              ) {
                clearInterval(
                  timerRef.current,
                );
              }

              return 0;
            }

            return current - 1;
          },
        );
      }, 1000);
  };

  useEffect(() => {
    return () => {
      if (
        timerRef.current
      ) {
        clearInterval(
          timerRef.current,
        );
      }
    };
  }, []);

  return {
    count,
    reset,
    expired:
      count === 0,
  };
}

async function postApi(
  path: string,
  body: Record<
    string,
    unknown
  >,
): Promise<ApiResult> {
  const response =
    await fetch(
      apiUrl(path),
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        credentials:
          'include',
        body: JSON.stringify(
          body,
        ),
      },
    );

  let data: ApiResult =
    {};

  try {
    data =
      (await response.json()) as ApiResult;
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      error:
        data.error ??
        data.message ??
        'Request failed. Please try again.',
    };
  }

  return data;
}

export default function ForgotPinScreen() {
  const [, setLocation] =
    useLocation();

  const [
    step,
    setStep,
  ] = useState<Step>(
    'email',
  );

  const [
    email,
    setEmail,
  ] = useState('');

  const [
    emailError,
    setEmailError,
  ] = useState('');

  const [
    isSending,
    setIsSending,
  ] = useState(false);

  const [
    otp,
    setOtp,
  ] = useState('');

  const [
    otpError,
    setOtpError,
  ] = useState(false);

  const [
    newPin,
    setNewPin,
  ] = useState('');

  const [
    confirmPin,
    setConfirmPin,
  ] = useState('');

  const [
    pinError,
    setPinError,
  ] = useState(false);

  const {
    count: otpTimer,
    reset: resetTimer,
    expired: otpExpired,
  } = useCountdown(300);

  const validEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email.trim(),
    );

  const sendOtp =
    async () => {
      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          cleanEmail,
        )
      ) {
        setEmailError(
          'Enter a valid registered email address.',
        );
        return;
      }

      setEmailError('');
      setIsSending(true);

      try {
        const result =
          await postApi(
            '/api/auth/forgot-pin-email/request',
            {
              email:
                cleanEmail,
            },
          );

        if (!result.ok) {
          setEmailError(
            result.error ??
              'Unable to send verification code.',
          );

          toast.error(
            result.error ??
              'Unable to send verification code.',
          );

          return;
        }

        setEmail(
          cleanEmail,
        );
        setOtp('');
        setOtpError(false);
        resetTimer();
        setStep('otp');

        toast.success(
          'Verification code sent to your registered email.',
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to send verification code.';

        setEmailError(
          message,
        );

        toast.error(
          message,
        );
      } finally {
        setIsSending(false);
      }
    };

  const resendOtp =
    async () => {
      setIsSending(true);

      try {
        const result =
          await postApi(
            '/api/auth/forgot-pin-email/request',
            {
              email:
                email
                  .trim()
                  .toLowerCase(),
            },
          );

        if (!result.ok) {
          toast.error(
            result.error ??
              'Unable to resend verification code.',
          );
          return;
        }

        setOtp('');
        setOtpError(false);
        resetTimer();

        toast.success(
          'A new verification code has been sent.',
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Unable to resend verification code.',
        );
      } finally {
        setIsSending(false);
      }
    };

  const handleOtpKey =
    (key: string) => {
      if (
        key ===
        'backspace'
      ) {
        setOtp(
          value =>
            value.slice(
              0,
              -1,
            ),
        );
        setOtpError(false);
        return;
      }

      if (
        otp.length >= 6 ||
        otpExpired
      ) {
        return;
      }

      const next =
        otp + key;

      setOtp(next);
      setOtpError(false);

      if (
        next.length === 6
      ) {
        setTimeout(
          () =>
            setStep(
              'new-pin',
            ),
          200,
        );
      }
    };

  const handleNewPinKey =
    (key: string) => {
      if (
        key ===
        'backspace'
      ) {
        setNewPin(
          value =>
            value.slice(
              0,
              -1,
            ),
        );
        return;
      }

      if (
        newPin.length >= 6
      ) {
        return;
      }

      const next =
        newPin + key;

      setNewPin(next);

      if (
        next.length === 6
      ) {
        setTimeout(
          () =>
            setStep(
              'confirm-pin',
            ),
          200,
        );
      }
    };

  const handleConfirmPinKey =
    async (
      key: string,
    ) => {
      if (
        key ===
        'backspace'
      ) {
        setConfirmPin(
          value =>
            value.slice(
              0,
              -1,
            ),
        );
        setPinError(false);
        return;
      }

      if (
        confirmPin.length >= 6
      ) {
        return;
      }

      const next =
        confirmPin + key;

      setConfirmPin(next);

      if (
        next.length !== 6
      ) {
        return;
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            200,
          ),
      );

      if (
        next !== newPin
      ) {
        setPinError(true);

        toast.error(
          "PINs don't match.",
        );

        setConfirmPin('');
        return;
      }

      if (otpExpired) {
        toast.error(
          'Verification code has expired. Request a new code.',
        );

        setStep('otp');
        setConfirmPin('');
        setOtpError(true);
        return;
      }

      setIsSending(true);

      try {
        const result =
          await postApi(
            '/api/auth/forgot-pin-email/reset',
            {
              email:
                email
                  .trim()
                  .toLowerCase(),
              otp,
              newPin,
            },
          );

        if (!result.ok) {
          toast.error(
            result.error ??
              'Verification failed.',
          );

          setStep('otp');
          setOtp('');
          setNewPin('');
          setConfirmPin('');
          setOtpError(true);
          setPinError(false);

          return;
        }

        setStep('success');
        setOtpError(false);
        setPinError(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Unable to reset your PIN.',
        );

        setStep('otp');
        setOtp('');
        setNewPin('');
        setConfirmPin('');
        setOtpError(true);
      } finally {
        setIsSending(false);
      }
    };

  const goBack = () => {
    if (
      step === 'email'
    ) {
      setLocation('/');
      return;
    }

    if (
      step === 'otp'
    ) {
      setStep('email');
      setOtp('');
      setOtpError(false);
      return;
    }

    if (
      step === 'new-pin'
    ) {
      setStep('otp');
      setNewPin('');
      return;
    }

    if (
      step === 'confirm-pin'
    ) {
      setStep('new-pin');
      setConfirmPin('');
      setPinError(false);
    }
  };

  const titles: Record<
    Step,
    {
      title: string;
      sub: string;
    }
  > = {
    email: {
      title:
        'Forgot PIN?',
      sub:
        'Enter your registered email address',
    },
    otp: {
      title:
        'Verify Identity',
      sub:
        `Code sent to ${email}`,
    },
    'new-pin': {
      title:
        'Create New PIN',
      sub:
        'Choose a new 6-digit PIN',
    },
    'confirm-pin': {
      title:
        'Confirm New PIN',
      sub:
        'Enter your new PIN one more time',
    },
    success: {
      title:
        'PIN Reset!',
      sub:
        'Your PIN has been updated successfully',
    },
  };

  const progress: Record<
    Step,
    number
  > = {
    email: 1,
    otp: 2,
    'new-pin': 3,
    'confirm-pin': 4,
    success: 4,
  };

  const minutes =
    Math.floor(
      otpTimer / 60,
    );

  const seconds =
    otpTimer % 60;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start pt-12 p-5 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg,#0B1F4E 0%,#102B6A 35%,#1A3D8F 65%,#1E4DB7 100%)',
      }}
    >
      <div
        className="absolute top-[-120px] left-[-100px] w-[380px] h-[380px] rounded-full"
        style={{
          background:
            'radial-gradient(circle,rgba(59,130,246,.22) 0%,transparent 70%)',
        }}
      />

      <div
        className="w-full max-w-md relative z-10"
      >
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 text-white/80 hover:text-white mb-8"
          style={{
            background:
              'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ← Back
        </button>

        <div
          className="rounded-[28px] p-6 sm:p-8"
          style={{
            background:
              'rgba(255,255,255,.98)',
            boxShadow:
              '0 24px 80px rgba(0,0,0,.25)',
          }}
        >
          <div className="text-center mb-7">
            <div
              className="mx-auto mb-5 flex items-center justify-center"
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background:
                  'linear-gradient(135deg,#0B1F4E 0%,#2563EB 100%)',
              }}
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect
                  x="3"
                  y="11"
                  width="18"
                  height="10"
                  rx="2"
                />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                <circle
                  cx="12"
                  cy="16"
                  r="1"
                />
              </svg>
            </div>

            <h1
              className="text-2xl font-extrabold"
              style={{
                color:
                  '#0B1F4E',
              }}
            >
              {titles[step].title}
            </h1>

            <p
              className="mt-2 text-sm"
              style={{
                color:
                  '#64748B',
              }}
            >
              {titles[step].sub}
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            {[1, 2, 3, 4].map(
              item => (
                <div
                  key={item}
                  style={{
                    width:
                      item ===
                      progress[step]
                        ? 32
                        : 8,
                    height: 6,
                    borderRadius:
                      999,
                    background:
                      item <=
                      progress[step]
                        ? '#2563EB'
                        : '#DDEAFF',
                  }}
                />
              ),
            )}
          </div>

          <AnimatePresence mode="wait">
            {step ===
              'email' && (
              <motion.div
                key="email"
                initial={{
                  opacity: 0,
                  x: 20,
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                }}
                exit={{
                  opacity: 0,
                  x: -20,
                }}
              >
                <label
                  className="block text-sm font-bold mb-2"
                  style={{
                    color:
                      '#0B1F4E',
                  }}
                >
                  Registered Email
                  Address
                </label>

                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => {
                    setEmail(
                      event.target.value,
                    );
                    setEmailError('');
                  }}
                  onKeyDown={event => {
                    if (
                      event.key ===
                      'Enter'
                    ) {
                      void sendOtp();
                    }
                  }}
                  placeholder="you@example.com"
                  className="w-full px-4 outline-none"
                  style={{
                    height: 52,
                    borderRadius: 14,
                    border:
                      emailError
                        ? '1.5px solid #EF4444'
                        : '1.5px solid #DDEAFF',
                    background:
                      '#F8FAFF',
                    color:
                      '#0B1F4E',
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                />

                {emailError && (
                  <p
                    className="mt-2 text-xs font-semibold"
                    style={{
                      color:
                        '#EF4444',
                    }}
                  >
                    {emailError}
                  </p>
                )}

                <p
                  className="mt-3 text-xs mb-6"
                  style={{
                    color:
                      '#7C8DAA',
                  }}
                >
                  We will send a
                  6-digit
                  verification code
                  to this registered
                  email address.
                </p>

                <GradientButton
                  onClick={() =>
                    void sendOtp()
                  }
                  disabled={
                    isSending ||
                    !validEmail
                  }
                >
                  {isSending
                    ? 'Sending...'
                    : 'Send Verification Code'}
                </GradientButton>
              </motion.div>
            )}

            {step ===
              'otp' && (
              <motion.div
                key="otp"
                initial={{
                  opacity: 0,
                  x: 20,
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                }}
                exit={{
                  opacity: 0,
                  x: -20,
                }}
              >
                <p
                  className="text-sm text-center mb-5"
                  style={{
                    color:
                      '#64748B',
                  }}
                >
                  Enter the 6-digit
                  code sent to your
                  registered email
                  address.
                </p>

                <PinIndicators
                  pin={otp}
                  error={otpError}
                />

                <Keypad
                  onPress={
                    handleOtpKey
                  }
                />

                <div className="text-center">
                  {!otpExpired ? (
                    <p
                      className="text-sm font-semibold"
                      style={{
                        color:
                          '#64748B',
                      }}
                    >
                      Code expires in{' '}
                      <span
                        style={{
                          color:
                            '#2563EB',
                        }}
                      >
                        {minutes}:
                        {seconds
                          .toString()
                          .padStart(
                            2,
                            '0',
                          )}
                      </span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void resendOtp()
                      }
                      disabled={
                        isSending
                      }
                      className="text-sm font-bold"
                      style={{
                        color:
                          '#2563EB',
                        background:
                          'transparent',
                        border:
                          'none',
                        cursor:
                          'pointer',
                      }}
                    >
                      {isSending
                        ? 'Sending...'
                        : 'Resend verification code'}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {step ===
              'new-pin' && (
              <motion.div
                key="new-pin"
                initial={{
                  opacity: 0,
                  x: 20,
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                }}
                exit={{
                  opacity: 0,
                  x: -20,
                }}
              >
                <p
                  className="text-sm text-center mb-5"
                  style={{
                    color:
                      '#64748B',
                  }}
                >
                  Enter your new
                  6-digit PIN.
                </p>

                <PinIndicators
                  pin={newPin}
                  error={false}
                />

                <Keypad
                  onPress={
                    handleNewPinKey
                  }
                />
              </motion.div>
            )}

            {step ===
              'confirm-pin' && (
              <motion.div
                key="confirm-pin"
                initial={{
                  opacity: 0,
                  x: 20,
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                }}
                exit={{
                  opacity: 0,
                  x: -20,
                }}
              >
                <p
                  className="text-sm text-center mb-5"
                  style={{
                    color:
                      '#64748B',
                  }}
                >
                  Enter your new PIN
                  again to confirm.
                </p>

                <PinIndicators
                  pin={
                    confirmPin
                  }
                  error={pinError}
                />

                <Keypad
                  onPress={
                    key =>
                      void handleConfirmPinKey(
                        key,
                      )
                  }
                />

                {isSending && (
                  <p
                    className="text-center text-sm font-semibold"
                    style={{
                      color:
                        '#2563EB',
                    }}
                  >
                    Updating PIN...
                  </p>
                )}
              </motion.div>
            )}

            {step ===
              'success' && (
              <motion.div
                key="success"
                initial={{
                  opacity: 0,
                  scale: 0.95,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                }}
                className="text-center"
              >
                <div
                  className="mx-auto mb-6 flex items-center justify-center"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius:
                      '50%',
                    background:
                      '#DCFCE7',
                    color:
                      '#16A34A',
                    fontSize: 36,
                    fontWeight: 900,
                  }}
                >
                  ✓
                </div>

                <p
                  className="text-sm mb-7"
                  style={{
                    color:
                      '#64748B',
                  }}
                >
                  Your login PIN has
                  been changed
                  successfully.
                </p>

                <GradientButton
                  onClick={() =>
                    setLocation('/')
                  }
                >
                  Continue to Login
                </GradientButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{
            color:
              'rgba(255,255,255,.62)',
          }}
        >
          GY DATA • Endless Joy
        </p>
      </div>
    </div>
  );
}
