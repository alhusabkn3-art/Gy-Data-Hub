import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { normalizeNigerianNumber } from '../components/PhoneInputWithContacts';

// ── Shared sub-components ─────────────────────────────────────────────────────
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

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

// ── Validation ────────────────────────────────────────────────────────────────
function validateStep1(name: string, email: string, phone: string): string | null {
  if (!name.trim() || name.trim().length < 2) return 'Please enter your full name.';
  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (!phone || !/^0[7-9][01]\d{8}$/.test(phone.replace(/\D/g, ''))) return 'Please enter a valid 11-digit Nigerian mobile number.';
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Step = 'details' | 'set-pin' | 'confirm-pin' | 'success';

export default function RegisterScreen() {
  const { register, accountExists } = useAppContext();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const handleDetailsNext = async () => {
    const err = validateStep1(name, email, phone);
    if (err) { setFieldErrors(err); return; }
    setIsCheckingPhone(true);
    const exists = await accountExists(phone.replace(/\D/g, '').slice(0, 11));
    setIsCheckingPhone(false);
    if (exists) {
      setFieldErrors('An account with this phone number already exists. Please sign in instead.');
      return;
    }
    setFieldErrors('');
    setStep('set-pin');
  };

  const handleSetPinKey = (key: string) => {
    if (key === 'backspace') { setNewPin(p => p.slice(0, -1)); return; }
    if (newPin.length >= 6) return;
    const next = newPin + key;
    setNewPin(next);
    if (next.length === 6) setTimeout(() => setStep('confirm-pin'), 200);
  };

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
        setIsCreating(true);
        const result = await register(
          name.trim(),
          phone.replace(/\D/g, '').slice(0, 11),
          email.trim(),
          newPin,
        );
        if (result === 'phone_taken') {
          toast.error('An account with this phone number already exists.');
          setIsCreating(false);
          setStep('details');
          setNewPin('');
          setConfirmPin('');
        } else if (result === 'error') {
          toast.error('Registration failed. Please try again.');
          setIsCreating(false);
        } else {
          setStep('success');
          setTimeout(() => setLocation('/'), 2200);
        }
      }
    }
  };

  const goBack = () => {
    if (step === 'details') { setLocation('/'); return; }
    if (step === 'set-pin') { setStep('details'); setNewPin(''); return; }
    if (step === 'confirm-pin') { setStep('set-pin'); setNewPin(''); setConfirmPin(''); setPinError(false); return; }
  };

  const stepLabel: Record<Step, string> = {
    details: 'Personal Details', 'set-pin': 'Set Your PIN',
    'confirm-pin': 'Confirm Your PIN', success: 'Account Created!',
  };

  const stepProgress: Record<Step, number> = {
    details: 1, 'set-pin': 2, 'confirm-pin': 3, success: 4,
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start pt-12 p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)' }}
    >
      {/* Background orbs */}
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
          <h1 className="text-xl font-bold text-white">Create Account</h1>
          <p className="text-xs font-medium" style={{ color: 'rgba(147,197,253,0.75)' }}>{stepLabel[step]}</p>
        </div>
      </div>

      {/* Progress bar */}
      {step !== 'success' && (
        <div className="w-full max-w-sm z-10 flex gap-1.5 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="h-1 rounded-full flex-1 transition-all duration-300"
              style={{ background: s <= stepProgress[step] - 1 || (s === 1 && step === 'details')
                ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)' }} />
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
        {/* ── Step 1: Personal details ─────────────────────────────────── */}
        {step === 'details' && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Your Details</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Let's set up your GY DATA account</p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#6B7FA3' }}>Full Name</label>
                <input
                  type="text" value={name}
                  onChange={e => { setName(e.target.value); setFieldErrors(''); }}
                  placeholder="Your full name"
                  autoComplete="name"
                  className="w-full h-12 rounded-xl px-4 text-sm font-medium outline-none transition-colors"
                  style={{ border: '2px solid #DDEAFF', background: '#F8FAFF', color: '#0B1F4E' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.background = '#EFF6FF'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#DDEAFF'; e.currentTarget.style.background = '#F8FAFF'; }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#6B7FA3' }}>Email Address</label>
                <input
                  type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setFieldErrors(''); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full h-12 rounded-xl px-4 text-sm font-medium outline-none transition-colors"
                  style={{ border: '2px solid #DDEAFF', background: '#F8FAFF', color: '#0B1F4E' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.background = '#EFF6FF'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#DDEAFF'; e.currentTarget.style.background = '#F8FAFF'; }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#6B7FA3' }}>Phone Number</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-sm font-semibold" style={{ color: '#6B7FA3' }}>
                    🇳🇬 +234
                  </span>
                  <input
                    ref={phoneInputRef}
                    type="tel" inputMode="numeric" value={phone}
                    onChange={e => { setPhone(normalizeNigerianNumber(e.target.value)); setFieldErrors(''); }}
                    onPaste={e => {
                      e.preventDefault();
                      setPhone(normalizeNigerianNumber(e.clipboardData.getData('text')));
                      setFieldErrors('');
                    }}
                    placeholder="0803 456 7890"
                    autoComplete="tel"
                    className="w-full h-12 rounded-xl text-sm font-medium outline-none transition-colors"
                    style={{ border: '2px solid #DDEAFF', background: '#F8FAFF', color: '#0B1F4E', paddingLeft: '6rem', paddingRight: phone.length > 0 ? '5.5rem' : '4rem' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.background = '#EFF6FF'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#DDEAFF'; e.currentTarget.style.background = '#F8FAFF'; }}
                  />
                  {/* Paste button — visible when field is empty */}
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
                            const text = await navigator.clipboard.readText();
                            if (text) { setPhone(normalizeNigerianNumber(text)); setFieldErrors(''); }
                          } catch { /* clipboard denied */ }
                          phoneInputRef.current?.focus();
                        }}
                        className="absolute right-2 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all active:scale-90"
                        style={{ color: '#2563EB', background: 'rgba(37,99,235,0.09)' }}
                        aria-label="Paste phone number"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
                        </svg>
                        Paste
                      </motion.button>
                    )}
                  </AnimatePresence>
                  {/* Copy button — visible when valid number entered */}
                  <AnimatePresence>
                    {/^0[7-9][01]\d{8}$/.test(phone) && (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.12 }}
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(phone); setPhoneCopied(true); setTimeout(() => setPhoneCopied(false), 1800); } catch { /* silent */ }
                        }}
                        className="absolute right-2 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all active:scale-90"
                        style={{ color: phoneCopied ? '#16a34a' : '#2563EB', background: phoneCopied ? 'rgba(22,163,74,0.09)' : 'rgba(37,99,235,0.09)' }}
                        aria-label="Copy phone number"
                      >
                        {phoneCopied ? (
                          <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copied</>
                        ) : (
                          <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                        )}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {fieldErrors && (
              <motion.p
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs font-medium text-center mb-4 px-2 py-2 rounded-lg"
                style={{ color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA' }}
              >
                {fieldErrors}
              </motion.p>
            )}

            <GradientButton onClick={handleDetailsNext} disabled={isCheckingPhone}>
              {isCheckingPhone ? 'Checking…' : 'Continue'}
            </GradientButton>

            <div className="text-center mt-5">
              <button onClick={() => setLocation('/')}
                className="text-sm font-medium transition-colors" style={{ color: '#6B7FA3' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#0B1F4E'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7FA3'; }}>
                Already have an account? <span style={{ color: '#2563EB', fontWeight: 600 }}>Sign In</span>
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Set PIN ───────────────────────────────────────────── */}
        {step === 'set-pin' && (
          <>
            <div className="text-center mb-7">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Create Your PIN</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Choose a 6-digit PIN to secure your account</p>
            </div>
            <PinIndicators pin={newPin} isError={false} />
            <Keypad onPress={handleSetPinKey} />
            <p className="text-xs text-center" style={{ color: '#9BA8C0' }}>
              Keep your PIN private. Do not share it with anyone.
            </p>
          </>
        )}

        {/* ── Step 3: Confirm PIN ───────────────────────────────────────── */}
        {step === 'confirm-pin' && (
          <motion.div animate={pinError ? { x: [-10, 10, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.45 }}>
            <div className="text-center mb-7">
              <h2 className="text-xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Confirm Your PIN</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Enter your 6-digit PIN one more time</p>
            </div>
            <PinIndicators pin={confirmPin} isError={pinError} />
            <Keypad onPress={handleConfirmPinKey} />
            {isCreating && (
              <p className="text-xs text-center mt-2" style={{ color: '#9BA8C0' }}>Creating your account…</p>
            )}
          </motion.div>
        )}

        {/* ── Step 4: Success ───────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="flex flex-col items-center text-center py-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'linear-gradient(135deg, #1A3D8F 0%, #2563EB 100%)', boxShadow: '0 12px 36px rgba(37,99,235,0.4)' }}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </motion.div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#0B1F4E' }}>Welcome to GY DATA!</h2>
            <p className="text-sm mb-1" style={{ color: '#6B7FA3' }}>
              Hi <span className="font-semibold" style={{ color: '#0B1F4E' }}>{name.trim().split(' ')[0]}</span>, your account is ready.
            </p>
            <p className="text-xs mb-8" style={{ color: '#9BA8C0' }}>
              Taking you to your dashboard…
            </p>
            <GradientButton onClick={() => setLocation('/')}>Go to Dashboard</GradientButton>
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
