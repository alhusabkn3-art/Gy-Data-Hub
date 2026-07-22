import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// ── Keypad ────────────────────────────────────────────────────────────────────
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {KEYS.map((key, i) => (
        <motion.button
          key={i}
          whileTap={key ? { scale: 0.93 } : {}}
          onClick={() => key && onPress(key)}
          disabled={!key}
          style={key ? {
            height: 56, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: key === 'backspace' ? undefined : 22, fontWeight: 600,
            color: '#0B1F4E', background: '#F0F5FF',
            border: '1.5px solid #DDEAFF',
            boxShadow: '0 2px 8px rgba(11,31,78,0.08)', cursor: 'pointer',
            transition: 'background 0.12s ease',
          } : { opacity: 0, cursor: 'default', height: 56 }}
          onMouseEnter={e => { if (key) (e.currentTarget as HTMLButtonElement).style.background = '#E0ECFF'; }}
          onMouseLeave={e => { if (key) (e.currentTarget as HTMLButtonElement).style.background = '#F0F5FF'; }}
        >
          {key === 'backspace' ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1F4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
              <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          ) : key}
        </motion.button>
      ))}
    </div>
  );
}

function PinIndicators({ pin, isError }: { pin: string; isError: boolean }) {
  return (
    <div className="flex justify-center gap-2.5 mb-7">
      {[...Array(6)].map((_, i) => {
        const isFilled = i < pin.length;
        const isActive = i === pin.length;
        return (
          <motion.div
            key={i}
            animate={isFilled ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.18 }}
            style={{
              width: 44, height: 44, borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: isFilled ? '2px solid #1D4ED8'
                : isActive ? '2px solid #2563EB'
                : isError ? '2px solid #EF4444'
                : '2px solid #BFCFEE',
              background: isFilled ? 'linear-gradient(135deg, #1A3D8F 0%, #2563EB 100%)'
                : isActive ? '#EFF6FF'
                : isError ? '#FEF2F2'
                : '#F8FAFF',
              boxShadow: isActive ? '0 0 0 4px rgba(37,99,235,0.12)'
                : isFilled ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <AnimatePresence>
              {isFilled && (
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffffff' }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

function GradientButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full font-bold text-white text-base"
      style={{
        height: 52, borderRadius: 999,
        background: disabled
          ? 'linear-gradient(90deg, #9BA8C0 0%, #9BA8C0 100%)'
          : 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
        boxShadow: disabled ? 'none' : '0 6px 24px rgba(37,99,235,0.38)',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: '0.02em',
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </motion.button>
  );
}

// ── OTP countdown ─────────────────────────────────────────────────────────────
function useCountdown(initial: number) {
  const [count, setCount] = useState(initial);
  const [running, setRunning] = useState(true);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setCount(prev => {
        if (prev <= 1) { clearInterval(ref.current!); setRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current!);
  }, [running]);
  const reset = () => { setCount(initial); setRunning(true); };
  return { count, reset, expired: count === 0 };
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Step = 'phone' | 'otp' | 'new-pin' | 'confirm-pin' | 'success';

export default function ForgotPinScreen() {
  const { requestPinReset, resetPin } = useAppContext();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>('phone');

  const [phone,      setPhone]      = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isSending,  setIsSending]  = useState(false);

  // The OTP entered by the user (verified server-side in the reset step)
  const [otp,      setOtp]      = useState('');
  const [otpError, setOtpError] = useState(false);
  const { count: otpTimer, reset: resetTimer, expired: otpExpired } = useCountdown(300); // 5 min

  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError,   setPinError]   = useState(false);

  // ── Step 1: request OTP ───────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, '');
    if (!/^0[7-9][01]\d{8}$/.test(digits)) {
      setPhoneError('Enter a valid 11-digit Nigerian mobile number.');
      return;
    }
    setIsSending(true);
    const result = await requestPinReset(digits);
    setIsSending(false);

    // Always show success message regardless of whether the phone exists —
    // the backend does the same to avoid leaking account existence.
    setPhoneError('');
    setStep('otp');
    resetTimer();
    toast.success('A verification code has been sent to your number.');

    // Dev-only: show the OTP in a toast so developers can test without SMS
    if (result.devOtp) {
      toast.info(`Dev mode — your code is: ${result.devOtp}`, { duration: 60_000 });
    }
  };

  const handleResendOtp = async () => {
    const digits = phone.replace(/\D/g, '');
    setIsSending(true);
    const result = await requestPinReset(digits);
    setIsSending(false);
    resetTimer();
    toast.success('A new verification code has been sent.');
    if (result.devOtp) {
      toast.info(`Dev mode — your code is: ${result.devOtp}`, { duration: 60_000 });
    }
  };

  // ── Step 2: OTP entry (just collecting digits; verified in reset step) ────
  const handleOtpKey = (key: string) => {
    if (key === 'backspace') { setOtp(p => p.slice(0, -1)); setOtpError(false); return; }
    if (otp.length >= 6) return;
    const next = otp + key;
    setOtp(next);
    if (next.length === 6) {
      setTimeout(() => { setOtpError(false); setStep('new-pin'); }, 200);
    }
  };

  // ── Step 3: new PIN ───────────────────────────────────────────────────────
  const handleNewPinKey = (key: string) => {
    if (key === 'backspace') { setNewPin(p => p.slice(0, -1)); return; }
    if (newPin.length >= 6) return;
    const next = newPin + key;
    setNewPin(next);
    if (next.length === 6) setTimeout(() => setStep('confirm-pin'), 200);
  };

  // ── Step 4: confirm PIN + server-side OTP verification ────────────────────
  const handleConfirmPinKey = async (key: string) => {
    if (key === 'backspace') { setConfirmPin(p => p.slice(0, -1)); setPinError(false); return; }
    if (confirmPin.length >= 6) return;
    const next = confirmPin + key;
    setConfirmPin(next);
    if (next.length === 6) {
      await new Promise(r => setTimeout(r, 200));
      if (next !== newPin) {
        setPinError(true);
        toast.error("PINs don't match. Try again.");
        setConfirmPin('');
      } else {
        // Server verifies OTP hash + expiry + resets PIN atomically
        const ok = await resetPin(phone.replace(/\D/g, ''), otp, newPin);
        if (!ok) {
          toast.error('Verification failed — your code may have expired. Please start again.');
          setStep('phone');
          setOtp('');
          setNewPin('');
          setConfirmPin('');
          setPinError(false);
        } else {
          setStep('success');
        }
      }
    }
  };

  // ── Back nav ──────────────────────────────────────────────────────────────
  const goBack = () => {
    if (step === 'phone') { setLocation('/'); return; }
    if (step === 'otp') { setStep('phone'); setOtp(''); setOtpError(false); return; }
    if (step === 'new-pin') { setStep('otp'); setNewPin(''); return; }
    if (step === 'confirm-pin') { setStep('new-pin'); setNewPin(''); setConfirmPin(''); setPinError(false); return; }
  };

  const stepTitles: Record<Step, { title: string; sub: string }> = {
    phone: { title: 'Forgot PIN?', sub: 'Enter your registered phone number' },
    otp: { title: 'Verify Identity', sub: `Code sent to ${phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3')}` },
    'new-pin': { title: 'Create New PIN', sub: 'Choose a new 6-digit PIN' },
    'confirm-pin': { title: 'Confirm New PIN', sub: 'Enter your new PIN one more time' },
    success: { title: 'PIN Reset!', sub: 'Your PIN has been updated successfully' },
  };

  const progressStep: Record<Step, number> = {
    phone: 1, otp: 2, 'new-pin': 3, 'confirm-pin': 4, success: 4,
  };

  const otpMins = Math.floor(otpTimer / 60);
  const otpSecs = otpTimer % 60;
  const otpLabel = `${otpMins}:${otpSecs.toString().padStart(2, '0')}`;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start pt-12 p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)' }}
    >
      <div className="absolute top-[-120px] left-[-100px] w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-100px] right-[-80px] w-[340px] h-[340px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
      <svg className="absolute top-0 right-0 pointer-events-none opacity-[0.07]" width="320" height="320" viewBox="0 0 320 320" fill="none">
        <circle cx="320" cy="0" r="180" stroke="white" strokeWidth="1.5" />
        <circle cx="320" cy="0" r="230" stroke="white" strokeWidth="1" />
      </svg>

      {/* Header */}
      <div className="w-full max-w-sm z-10 flex items-center gap-3 mb-6">
        {step !== 'success' && (
          <button onClick={goBack}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        )}
        <div className={step === 'success' ? 'flex-1 text-center' : 'flex-1'}>
          <h1 className="text-xl font-bold text-white">{stepTitles[step].title}</h1>
          <p className="text-xs font-medium" style={{ color: 'rgba(147,197,253,0.75)' }}>{stepTitles[step].sub}</p>
        </div>
      </div>

      {/* Progress */}
      {step !== 'success' && (
        <div className="w-full max-w-sm z-10 flex gap-1.5 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="h-1 rounded-full flex-1 transition-all duration-300"
              style={{ background: s <= progressStep[step] ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
      )}

      {/* Card */}
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="w-full max-w-sm z-10"
        style={{
          background: '#ffffff', borderRadius: 28,
          boxShadow: '0 24px 60px rgba(11,31,78,0.35), 0 8px 24px rgba(11,31,78,0.2)',
          padding: '32px 24px 28px',
        }}
      >
        {/* ── Step 1: Phone ─────────────────────────────────────────────── */}
        {step === 'phone' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', border: '2px solid #BFDBFE' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3"/>
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Account Recovery</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Enter your registered phone number to receive a verification code.</p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#6B7FA3' }}>Phone Number</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-sm font-semibold" style={{ color: '#6B7FA3' }}>
                  🇳🇬 +234
                </span>
                <input
                  type="tel" inputMode="numeric" value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setPhoneError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendOtp(); }}
                  placeholder="0803 456 7890"
                  autoComplete="tel"
                  className="w-full h-12 rounded-xl text-sm font-medium outline-none"
                  style={{
                    border: `2px solid ${phoneError ? '#EF4444' : '#DDEAFF'}`,
                    background: phoneError ? '#FEF2F2' : '#F8FAFF',
                    color: '#0B1F4E', paddingLeft: '6rem', paddingRight: '1rem', transition: 'all 0.15s ease',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = phoneError ? '#EF4444' : '#2563EB'; e.currentTarget.style.background = phoneError ? '#FEF2F2' : '#EFF6FF'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = phoneError ? '#EF4444' : '#DDEAFF'; e.currentTarget.style.background = phoneError ? '#FEF2F2' : '#F8FAFF'; }}
                />
              </div>
              <AnimatePresence>
                {phoneError && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-xs mt-1.5 pl-1" style={{ color: '#DC2626' }}>
                    {phoneError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <GradientButton onClick={handleSendOtp} disabled={isSending || phone.length < 10}>
              {isSending ? 'Sending code…' : 'Send Verification Code'}
            </GradientButton>

            <div className="text-center mt-5">
              <button onClick={() => setLocation('/')} className="text-sm font-medium" style={{ color: '#2563EB' }}>
                ← Back to Sign In
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: OTP ───────────────────────────────────────────────── */}
        {step === 'otp' && (
          <>
            <div className="text-center mb-7">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Enter Code</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Enter the 6-digit code sent to your phone</p>
            </div>
            <motion.div animate={otpError ? { x: [-10, 10, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.45 }}>
              <PinIndicators pin={otp} isError={otpError} />
              <Keypad onPress={handleOtpKey} />
            </motion.div>
            <div className="text-center">
              {otpExpired ? (
                <button onClick={handleResendOtp} disabled={isSending}
                  className="text-sm font-semibold" style={{ color: '#2563EB' }}>
                  {isSending ? 'Sending…' : 'Resend Code'}
                </button>
              ) : (
                <p className="text-sm" style={{ color: '#9BA8C0' }}>
                  Code expires in <span className="font-semibold" style={{ color: '#0B1F4E' }}>{otpLabel}</span>
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Step 3: New PIN ───────────────────────────────────────────── */}
        {step === 'new-pin' && (
          <>
            <div className="text-center mb-7">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Create New PIN</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Choose a new 6-digit PIN for your account</p>
            </div>
            <PinIndicators pin={newPin} isError={false} />
            <Keypad onPress={handleNewPinKey} />
            <p className="text-xs text-center" style={{ color: '#9BA8C0' }}>
              Keep your PIN private. Do not share it with anyone.
            </p>
          </>
        )}

        {/* ── Step 4: Confirm PIN ───────────────────────────────────────── */}
        {step === 'confirm-pin' && (
          <motion.div animate={pinError ? { x: [-10, 10, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.45 }}>
            <div className="text-center mb-7">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Confirm New PIN</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Enter your new 6-digit PIN again to confirm</p>
            </div>
            <PinIndicators pin={confirmPin} isError={pinError} />
            <Keypad onPress={handleConfirmPinKey} />
          </motion.div>
        )}

        {/* ── Step 5: Success ───────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="flex flex-col items-center text-center py-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'linear-gradient(135deg, #1A3D8F 0%, #2563EB 100%)', boxShadow: '0 12px 36px rgba(37,99,235,0.4)' }}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4" strokeWidth="2.5"/>
              </svg>
            </motion.div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#0B1F4E' }}>PIN Reset Successful</h2>
            <p className="text-sm mb-8" style={{ color: '#6B7FA3' }}>
              Your PIN has been updated. Sign in with your new PIN to continue.
            </p>
            <GradientButton onClick={() => setLocation('/')}>Back to Sign In</GradientButton>
          </div>
        )}
      </motion.div>

      <p className="z-10 mt-8 text-xs font-medium tracking-[0.18em] uppercase"
        style={{ color: 'rgba(147,197,253,0.5)' }}>
        GY DATA · endless joy
      </p>
    </div>
  );
}
