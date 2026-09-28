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
import { useAppContext } from '../context/AppContext';

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

function Keypad({
  onPress,
}: {
  onPress: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {KEYS.map((key, i) => (
        <motion.button
          key={i}
          whileTap={
            key
              ? { scale: 0.93 }
              : {}
          }
          onClick={() =>
            key && onPress(key)
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
                    key === 'backspace'
                      ? undefined
                      : 22,
                  fontWeight: 600,
                  color: '#0B1F4E',
                  background:
                    '#F0F5FF',
                  border:
                    '1.5px solid #DDEAFF',
                  boxShadow:
                    '0 2px 8px rgba(11,31,78,0.08)',
                  cursor:
                    'pointer',
                  transition:
                    'background 0.12s ease',
                }
              : {
                  opacity: 0,
                  cursor:
                    'default',
                  height: 56,
                }
          }
          onMouseEnter={e => {
            if (key) {
              (
                e.currentTarget as HTMLButtonElement
              ).style.background =
                '#E0ECFF';
            }
          }}
          onMouseLeave={e => {
            if (key) {
              (
                e.currentTarget as HTMLButtonElement
              ).style.background =
                '#F0F5FF';
            }
          }}
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
      ))}
    </div>
  );
}

function PinIndicators({
  pin,
  isError,
}: {
  pin: string;
  isError: boolean;
}) {
  return (
    <div className="flex justify-center gap-2.5 mb-7">
      {[
        0,
        1,
        2,
        3,
        4,
        5,
      ].map(i => {
        const isFilled =
          i < pin.length;
        const isActive =
          i === pin.length;

        return (
          <motion.div
            key={i}
            animate={
              isFilled
                ? {
                    scale: [
                      1,
                      1.15,
                      1,
                    ],
                  }
                : {
                    scale: 1,
                  }
            }
            transition={{
              duration: 0.18,
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
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
              transition:
                'all 0.18s ease',
            }}
          >
            <AnimatePresence>
              {isFilled && (
                <motion.div
                  initial={{
                    scale: 0,
                  }}
                  animate={{
                    scale: 1,
                  }}
                  exit={{
                    scale: 0,
                  }}
                  transition={{
                    duration: 0.15,
                  }}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius:
                      '50%',
                    background:
                      '#ffffff',
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
      whileTap={
        disabled
          ? {}
          : { scale: 0.97 }
      }
      onClick={
        disabled
          ? undefined
          : onClick
      }
      disabled={disabled}
      className="w-full font-bold text-white text-base"
      style={{
        height: 52,
        borderRadius: 999,
        background: disabled
          ? 'linear-gradient(90deg, #9BA8C0 0%, #9BA8C0 100%)'
          : 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
        boxShadow: disabled
          ? 'none'
          : '0 6px 24px rgba(37,99,235,0.38)',
        border: 'none',
        cursor: disabled
          ? 'not-allowed'
          : 'pointer',
        letterSpacing:
          '0.02em',
        transition:
          'all 0.2s ease',
      }}
    >
      {children}
    </motion.button>
  );
}

function useCountdown(
  initial: number,
) {
  const [count, setCount] =
    useState(initial);

  const [running, setRunning] =
    useState(true);

  const ref =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  useEffect(() => {
    if (!running) {
      return;
    }

    ref.current =
      setInterval(() => {
        setCount(prev => {
          if (prev <= 1) {
            if (ref.current) {
              clearInterval(
                ref.current,
              );
            }

            setRunning(false);

            return 0;
          }

          return prev - 1;
        });
      }, 1000);

    return () => {
      if (ref.current) {
        clearInterval(
          ref.current,
        );
      }
    };
  }, [running]);

  const reset = () => {
    if (ref.current) {
      clearInterval(
        ref.current,
      );
    }

    setCount(initial);
    setRunning(true);
  };

  return {
    count,
    reset,
    expired:
      count === 0,
  };
}

type Step =
  | 'phone'
  | 'otp'
  | 'new-pin'
  | 'confirm-pin'
  | 'success';

export default function ForgotPinScreen() {
  const {
    requestPinReset,
    resetPin,
  } = useAppContext();

  const [, setLocation] =
    useLocation();

  const [step, setStep] =
    useState<Step>('phone');

  const [phone, setPhone] =
    useState('');

  const [
    phoneError,
    setPhoneError,
  ] = useState('');

  const [
    isSending,
    setIsSending,
  ] = useState(false);

  const [otp, setOtp] =
    useState('');

  const [
    otpError,
    setOtpError,
  ] = useState(false);

  const {
    count: otpTimer,
    reset: resetTimer,
    expired: otpExpired,
  } = useCountdown(300);

  const [newPin, setNewPin] =
    useState('');

  const [
    confirmPin,
    setConfirmPin,
  ] = useState('');

  const [
    pinError,
    setPinError,
  ] = useState(false);

  const handleSendOtp =
    async () => {
      const digits =
        phone.replace(
          /\D/g,
          '',
        );

      if (
        !/^0[7-9][01]\d{8}$/.test(
          digits,
        )
      ) {
        setPhoneError(
          'Enter a valid 11-digit Nigerian mobile number.',
        );
        return;
      }

      setPhoneError('');
      setIsSending(true);

      try {
        const result =
          await requestPinReset(
            digits,
          );

        if (!result.ok) {
          setPhoneError(
            result.error ??
              'Unable to send verification code. Please try again.',
          );

          toast.error(
            result.error ??
              'Unable to send verification code.',
          );

          return;
        }

        setStep('otp');
        setOtp('');
        setOtpError(false);
        resetTimer();

        toast.success(
          'A verification code has been sent to your registered email address.',
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to send verification code. Please try again.';

        setPhoneError(
          message,
        );

        toast.error(
          message,
        );
      } finally {
        setIsSending(false);
      }
    };

  const handleResendOtp =
    async () => {
      const digits =
        phone.replace(
          /\D/g,
          '',
        );

      if (
        !/^0[7-9][01]\d{8}$/.test(
          digits,
        )
      ) {
        setStep('phone');
        setPhoneError(
          'Enter a valid 11-digit Nigerian mobile number.',
        );
        return;
      }

      setIsSending(true);

      try {
        const result =
          await requestPinReset(
            digits,
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
          'A new verification code has been sent to your registered email address.',
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
          previous =>
            previous.slice(
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

      if (
        next.length === 6
      ) {
        setTimeout(() => {
          setOtpError(false);
          setStep(
            'new-pin',
          );
        }, 200);
      }
    };

  const handleNewPinKey =
    (key: string) => {
      if (
        key ===
        'backspace'
      ) {
        setNewPin(
          previous =>
            previous.slice(
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
          previous =>
            previous.slice(
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
          "PINs don't match. Try again.",
        );

        setConfirmPin('');

        return;
      }

      if (otpExpired) {
        toast.error(
          'Verification code has expired. Please request a new code.',
        );

        setStep('otp');
        setConfirmPin('');
        setPinError(false);
        setOtpError(true);

        return;
      }

      try {
        const result =
          await resetPin(
            phone.replace(
              /\D/g,
              '',
            ),
            otp,
            newPin,
          );

        if (!result.ok) {
          toast.error(
            result.error ??
              'Verification failed. Your code may have expired or is invalid.',
          );

          setStep('otp');
          setOtp('');
          setNewPin('');
          setConfirmPin('');
          setPinError(false);
          setOtpError(true);

          return;
        }

        setStep('success');
        setOtpError(false);
        setPinError(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Unable to reset your PIN right now. Please try again.',
        );

        setStep('otp');
        setOtp('');
        setNewPin('');
        setConfirmPin('');
        setPinError(false);
        setOtpError(true);
      }
    };

  const goBack = () => {
    if (
      step === 'phone'
    ) {
      setLocation('/');
      return;
    }

    if (
      step === 'otp'
    ) {
      setStep('phone');
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

  const stepTitles: Record<
    Step,
    {
      title: string;
      sub: string;
    }
  > = {
    phone: {
      title:
        'Forgot PIN?',
      sub:
        'Enter your registered phone number',
    },
    otp: {
      title:
        'Verify Identity',
      sub: `Code sent to ${phone.replace(
        /(\d{4})(\d{3})(\d{4})/,
        '$1 $2 $3',
      )}`,
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

  const progressStep: Record<
    Step,
    number
  > = {
    phone: 1,
    otp: 2,
    'new-pin': 3,
    'confirm-pin': 4,
    success: 4,
  };

  const otpMins =
    Math.floor(
      otpTimer / 60,
    );

  const otpSecs =
    otpTimer % 60;

  const otpLabel = `${otpMins}:${otpSecs
    .toString()
    .padStart(2, '0')}`;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start pt-12 p-5 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)',
      }}
    >
      <div
        className="absolute top-[-120px] left-[-100px] w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)',
        }}
      />

      <div
        className="absolute bottom-[-100px] right-[-80px] w-[340px] h-[340px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
        }}
      />

      <svg
        className="absolute top-0 right-0 pointer-events-none opacity-[0.07]"
        width="320"
        height="320"
        viewBox="0 0 320 320"
        fill="none"
      >
        <circle
          cx="320"
          cy="0"
          r="180"
          stroke="white"
          strokeWidth="1"
        />
        <circle
          cx="320"
          cy="0"
          r="130"
          stroke="white"
          strokeWidth="1"
        />
        <circle
          cx="320"
          cy="0"
          r="80"
          stroke="white"
          strokeWidth="1"
        />
      </svg>

      <div className="w-full max-w-md relative z-10">
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
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>

          Back
        </button>

        <div
          className="rounded-[28px] p-6 sm:p-8"
          style={{
            background:
              'rgba(255,255,255,0.98)',
            boxShadow:
              '0 24px 80px rgba(0,0,0,0.25)',
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
                  'linear-gradient(135deg, #0B1F4E 0%, #2563EB 100%)',
                boxShadow:
                  '0 10px 28px rgba(37,99,235,0.28)',
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
              {stepTitles[
                step
              ].title}
            </h1>

            <p
              className="mt-2 text-sm"
              style={{
                color:
                  '#64748B',
              }}
            >
              {stepTitles[
                step
              ].sub}
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
                      progressStep[
                        step
                      ]
                        ? 32
                        : 8,
                    height: 6,
                    borderRadius:
                      999,
                    background:
                      item <=
                      progressStep[
                        step
                      ]
                        ? '#2563EB'
                        : '#DDEAFF',
                    transition:
                      'all 0.2s ease',
                  }}
                />
              ),
            )}
          </div>

          <AnimatePresence mode="wait">
            {step ===
              'phone' && (
              <motion.div
                key="phone"
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
                <div className="mb-6">
                  <label
                    className="block text-sm font-bold mb-2"
                    style={{
                      color:
                        '#0B1F4E',
                    }}
                  >
                    Registered Phone
                    Number
                  </label>

                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={e => {
                      setPhone(
                        e.target.value.replace(
                          /\D/g,
                          '',
                        ).slice(
                          0,
                          11,
                        ),
                      );
                      setPhoneError('');
                    }}
                    placeholder="08012345678"
                    className="w-full px-4 outline-none"
                    style={{
                      height: 52,
                      borderRadius: 14,
                      border:
                        phoneError
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

                  {phoneError && (
                    <p
                      className="mt-2 text-xs font-semibold"
                      style={{
                        color:
                          '#EF4444',
                      }}
                    >
                      {phoneError}
                    </p>
                  )}

                  <p
                    className="mt-3 text-xs"
                    style={{
                      color:
                        '#7C8DAA',
                    }}
                  >
                    We will send a
                    6-digit
                    verification code
                    to the email
                    address registered
                    with this phone
                    number.
                  </p>
                </div>

                <GradientButton
                  onClick={
                    handleSendOtp
                  }
                  disabled={
                    isSending ||
                    phone.length !==
                      11
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
                <div className="text-center mb-5">
                  <p
                    className="text-sm"
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
                </div>

                <PinIndicators
                  pin={otp}
                  isError={
                    otpError
                  }
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
                        {otpLabel}
                      </span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={
                        handleResendOtp
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
                        border: 'none',
                        cursor:
                          isSending
                            ? 'not-allowed'
                            : 'pointer',
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
                <PinIndicators
                  pin={newPin}
                  isError={
                    false
                  }
                />

                <Keypad
                  onPress={
                    handleNewPinKey
                  }
                />

                <p
                  className="text-center text-xs"
                  style={{
                    color:
                      '#7C8DAA',
                  }}
                >
                  Your new PIN must
                  contain exactly 6
                  digits.
                </p>
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
                <PinIndicators
                  pin={
                    confirmPin
                  }
                  isError={
                    pinError
                  }
                />

                <Keypad
                  onPress={
                    handleConfirmPinKey
                  }
                />

                <p
                  className="text-center text-xs"
                  style={{
                    color:
                      pinError
                        ? '#EF4444'
                        : '#7C8DAA',
                  }}
                >
                  {pinError
                    ? 'The PINs do not match.'
                    : 'Enter the same PIN again to confirm.'}
                </p>
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
                <motion.div
                  initial={{
                    scale: 0,
                  }}
                  animate={{
                    scale: 1,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 220,
                    damping: 16,
                  }}
                  className="mx-auto mb-6 flex items-center justify-center"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: '50%',
                    background:
                      '#DCFCE7',
                    color:
                      '#16A34A',
                  }}
                >
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </motion.div>

                <h2
                  className="text-xl font-extrabold mb-2"
                  style={{
                    color:
                      '#0B1F4E',
                  }}
                >
                  PIN Reset
                  Successful
                </h2>

                <p
                  className="text-sm mb-7"
                  style={{
                    color:
                      '#64748B',
                  }}
                >
                  Your login PIN has
                  been updated. You
                  can now log in with
                  your new PIN.
                </p>

                <GradientButton
                  onClick={() =>
                    setLocation(
                      '/',
                    )
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
              'rgba(255,255,255,0.62)',
          }}
        >
          GY DATA • Endless Joy
        </p>
      </div>
    </div>
  );
}
