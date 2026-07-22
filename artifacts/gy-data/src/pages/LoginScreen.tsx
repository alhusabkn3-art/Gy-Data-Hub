import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { normalizeNigerianNumber } from '../components/PhoneInputWithContacts';

// ── Long-press config ─────────────────────────────────────────────────────────
const LONG_PRESS_MS  = 2000;
const MOVE_THRESHOLD = 12;
const PROGRESS_FPS   = 60;

// ── Login flow has two steps: phone → PIN ─────────────────────────────────────
type LoginStep = 'phone' | 'pin';

export default function LoginScreen() {
  const { login } = useAppContext();
  const [, setLocation] = useLocation();

  // ── Step state ───────────────────────────────────────────────────────────
  const [step,       setStep]       = useState<LoginStep>('phone');
  const [phone,      setPhone]      = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [pin,        setPin]        = useState('');
  const [isError,    setIsError]    = useState(false);
  const [isLoggingIn,setIsLoggingIn]= useState(false);
  const [phoneCopied,setPhoneCopied]= useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // ── Long-press state ──────────────────────────────────────────────────────
  const [pressOrigin,   setPressOrigin]   = useState<{ x: number; y: number } | null>(null);
  const [pressProgress, setPressProgress] = useState(0);

  const lpTimer    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const lpProgress = useRef<ReturnType<typeof setInterval> | null>(null);
  const lpOrigin   = useRef<{ x: number; y: number } | null>(null);
  const lpStart    = useRef<number>(0);

  const cancelLongPress = useCallback(() => {
    if (lpTimer.current)    { clearTimeout(lpTimer.current);     lpTimer.current    = null; }
    if (lpProgress.current) { clearInterval(lpProgress.current); lpProgress.current = null; }
    lpOrigin.current = null;
    setPressOrigin(null);
    setPressProgress(0);
  }, []);

  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

  const handleBgPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const origin = { x: e.clientX, y: e.clientY };
    lpOrigin.current = origin;
    lpStart.current  = Date.now();
    setPressOrigin(origin);
    setPressProgress(0);
    lpProgress.current = setInterval(() => {
      const p = Math.min((Date.now() - lpStart.current) / LONG_PRESS_MS, 1);
      setPressProgress(p);
    }, 1000 / PROGRESS_FPS);
    lpTimer.current = setTimeout(() => { cancelLongPress(); setLocation('/admin'); }, LONG_PRESS_MS);
  }, [cancelLongPress, setLocation]);

  const handleBgPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!lpOrigin.current) return;
    const dx = e.clientX - lpOrigin.current.x;
    const dy = e.clientY - lpOrigin.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) cancelLongPress();
  }, [cancelLongPress]);

  const handleBgPointerUp     = useCallback(() => cancelLongPress(), [cancelLongPress]);
  const handleBgPointerCancel = useCallback(() => cancelLongPress(), [cancelLongPress]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (lpTimer.current !== null) e.preventDefault();
  }, []);

  // ── Step 1: phone Continue ────────────────────────────────────────────────
  const handlePhoneContinue = () => {
    const digits = phone.replace(/\D/g, '');
    if (!/^0[7-9][01]\d{8}$/.test(digits)) {
      setPhoneError('Enter a valid 11-digit Nigerian mobile number.');
      return;
    }
    setPhoneError('');
    setPin('');
    setIsError(false);
    setStep('pin');
  };

  // ── Step 2: PIN login ─────────────────────────────────────────────────────
  const handleKeyPress = (key: string) => {
    if (isLoggingIn) return;
    if (key === 'backspace') { setPin(p => p.slice(0, -1)); setIsError(false); }
    else if (pin.length < 6) { setPin(p => p + key); setIsError(false); }
  };

  const handleLogin = useCallback(async () => {
    if (isLoggingIn || pin.length < 6) return;
    setIsLoggingIn(true);
    const result = await login(phone, pin);
    if (result === 'success') {
      // AppContext sets isLoggedIn → CustomerRouter will redirect automatically
      return;
    }
    setIsError(true);
    if (result === 'no_account') {
      toast.error('No account found with this number.');
      // Go back to phone step so they can re-enter
      setTimeout(() => { setStep('phone'); setPin(''); setIsError(false); setIsLoggingIn(false); }, 1400);
    } else {
      toast.error('Incorrect PIN. Please try again.');
      setPin('');
      setIsLoggingIn(false);
    }
  }, [isLoggingIn, login, phone, pin]);

  useEffect(() => {
    if (step === 'pin' && pin.length === 6 && !isLoggingIn) handleLogin();
  }, [pin, step, isLoggingIn, handleLogin]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)' }}
      onPointerDown={handleBgPointerDown}
      onPointerMove={handleBgPointerMove}
      onPointerUp={handleBgPointerUp}
      onPointerCancel={handleBgPointerCancel}
      onContextMenu={handleContextMenu}
    >
      {/* ── Admin long-press ripple ──────────────────────────────────── */}
      <AnimatePresence>
        {pressOrigin && (
          <>
            <div className="pointer-events-none" style={{
              position: 'fixed', left: pressOrigin.x, top: pressOrigin.y,
              transform: 'translate(-50%, -50%)',
              width: `${80 + pressProgress * 120}px`, height: `${80 + pressProgress * 120}px`,
              borderRadius: '50%',
              border: `1.5px solid rgba(255,255,255,${0.06 + pressProgress * 0.18})`,
              background: `radial-gradient(circle, rgba(255,255,255,${pressProgress * 0.07}) 0%, transparent 65%)`,
              transition: 'none', zIndex: 6,
            }} />
            <div className="pointer-events-none" style={{
              position: 'fixed', left: pressOrigin.x, top: pressOrigin.y,
              transform: 'translate(-50%, -50%)',
              width: `${24 + pressProgress * 40}px`, height: `${24 + pressProgress * 40}px`,
              borderRadius: '50%',
              border: `2px solid rgba(255,255,255,${pressProgress * 0.32})`,
              transition: 'none', zIndex: 6,
            }} />
          </>
        )}
      </AnimatePresence>

      {/* ── Background decorative layer ─────────────────────────────── */}
      <div className="absolute top-[-120px] left-[-100px] w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-100px] right-[-80px] w-[340px] h-[340px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
      <div className="absolute top-[40%] left-[60%] w-[200px] h-[200px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 70%)' }} />
      <svg className="absolute top-0 right-0 pointer-events-none opacity-[0.07]" width="320" height="320" viewBox="0 0 320 320" fill="none">
        <circle cx="320" cy="0" r="180" stroke="white" strokeWidth="1.5" />
        <circle cx="320" cy="0" r="230" stroke="white" strokeWidth="1" />
        <circle cx="320" cy="0" r="280" stroke="white" strokeWidth="0.8" />
      </svg>
      <svg className="absolute bottom-0 left-0 pointer-events-none opacity-[0.06]" width="260" height="260" viewBox="0 0 260 260" fill="none">
        <circle cx="0" cy="260" r="160" stroke="white" strokeWidth="1.2" />
        <circle cx="0" cy="260" r="210" stroke="white" strokeWidth="0.8" />
      </svg>

      {/* ── Logo ────────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm z-10 flex flex-col items-center mb-7">
        <div className="mb-4 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 32px rgba(37,99,235,0.45), 0 2px 8px rgba(0,0,0,0.2)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3"/>
            </svg>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white leading-none"
            style={{ letterSpacing: '-0.5px', textShadow: '0 2px 12px rgba(37,99,235,0.4)' }}>
            GY DATA
          </h1>
          <p className="text-sm mt-1.5 font-medium tracking-[0.18em] uppercase"
            style={{ color: 'rgba(147,197,253,0.85)' }}>
            endless joy
          </p>
        </div>
      </div>

      {/* ── Card — animates between steps ───────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ── Step 1: Phone number ─────────────────────────────────── */}
        {step === 'phone' && (
          <motion.div
            key="phone"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.26 }}
            className="w-full max-w-sm z-10"
            style={{
              background: '#ffffff', borderRadius: 28,
              boxShadow: '0 24px 60px rgba(11,31,78,0.35), 0 8px 24px rgba(11,31,78,0.2)',
              padding: '32px 24px 28px',
            }}
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Welcome Back</h2>
              <p className="text-sm" style={{ color: '#6B7FA3' }}>Enter your registered phone number</p>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#6B7FA3' }}>
                Phone Number
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-sm font-semibold"
                  style={{ color: '#6B7FA3' }}>
                  🇳🇬 +234
                </span>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => { setPhone(normalizeNigerianNumber(e.target.value)); setPhoneError(''); }}
                  onPaste={e => {
                    e.preventDefault();
                    setPhone(normalizeNigerianNumber(e.clipboardData.getData('text')));
                    setPhoneError('');
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handlePhoneContinue(); }}
                  placeholder="0803 456 7890"
                  autoComplete="tel"
                  autoFocus
                  className="w-full h-12 rounded-xl text-sm font-medium outline-none transition-all"
                  style={{
                    border: `2px solid ${phoneError ? '#EF4444' : '#DDEAFF'}`,
                    background: phoneError ? '#FEF2F2' : '#F8FAFF',
                    color: '#0B1F4E',
                    paddingLeft: '6rem',
                    paddingRight: phone.length > 0 ? '5.5rem' : '4rem',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = phoneError ? '#EF4444' : '#2563EB';
                    e.currentTarget.style.background = phoneError ? '#FEF2F2' : '#EFF6FF';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = phoneError ? '#EF4444' : '#DDEAFF';
                    e.currentTarget.style.background = phoneError ? '#FEF2F2' : '#F8FAFF';
                  }}
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
                          if (text) { setPhone(normalizeNigerianNumber(text)); setPhoneError(''); }
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
                {/* Copy button — visible when a valid number is entered */}
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
              <AnimatePresence>
                {phoneError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-xs mt-2 pl-1" style={{ color: '#DC2626' }}
                  >
                    {phoneError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handlePhoneContinue}
              disabled={phone.length < 10}
              className="w-full font-bold text-white text-base"
              style={{
                height: 52, borderRadius: 999, border: 'none', cursor: phone.length < 10 ? 'not-allowed' : 'pointer',
                background: phone.length < 10
                  ? 'linear-gradient(90deg, #9BA8C0 0%, #9BA8C0 100%)'
                  : 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
                boxShadow: phone.length < 10 ? 'none' : '0 6px 24px rgba(37,99,235,0.38)',
                letterSpacing: '0.02em', transition: 'all 0.2s ease',
              }}
            >
              Continue
            </motion.button>

            <div className="flex justify-between mt-5 text-sm">
              <button
                onClick={() => setLocation('/forgot-pin')}
                className="font-medium transition-colors"
                style={{ color: '#6B7FA3' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#0B1F4E'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7FA3'; }}
              >
                Forgot PIN?
              </button>
              <button
                onClick={() => setLocation('/register')}
                className="font-semibold transition-colors"
                style={{ color: '#2563EB' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1D4ED8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#2563EB'; }}
              >
                Create Account
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: PIN ──────────────────────────────────────────── */}
        {step === 'pin' && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, y: 18 }}
            animate={isError ? { x: [-10, 10, -8, 8, -5, 5, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: isError ? 0.45 : 0.26 }}
            className="w-full max-w-sm z-10"
            style={{
              background: '#ffffff', borderRadius: 28,
              boxShadow: '0 24px 60px rgba(11,31,78,0.35), 0 8px 24px rgba(11,31,78,0.2)',
              padding: '32px 24px 28px',
            }}
          >
            {/* Back to phone step + header */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setStep('phone'); setPin(''); setIsError(false); }}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#F0F5FF', border: '1.5px solid #DDEAFF' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B1F4E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-bold leading-tight" style={{ color: '#0B1F4E' }}>Enter PIN</h2>
                <p className="text-xs" style={{ color: '#6B7FA3' }}>
                  {phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3')}
                </p>
              </div>
            </div>

            {/* PIN indicators */}
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

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {keys.map((key, i) => (
                <motion.button
                  key={i}
                  whileTap={key ? { scale: 0.93 } : {}}
                  onClick={() => key && handleKeyPress(key)}
                  disabled={!key || isLoggingIn}
                  style={key ? {
                    height: 56, borderRadius: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: key === 'backspace' ? undefined : 22, fontWeight: 600,
                    color: '#0B1F4E', background: '#F0F5FF',
                    border: '1.5px solid #DDEAFF',
                    boxShadow: '0 2px 8px rgba(11,31,78,0.08)',
                    cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                    transition: 'background 0.12s ease',
                  } : { opacity: 0, cursor: 'default', height: 56 }}
                  onMouseEnter={e => { if (key) (e.currentTarget as HTMLButtonElement).style.background = '#E0ECFF'; }}
                  onMouseLeave={e => { if (key) (e.currentTarget as HTMLButtonElement).style.background = '#F0F5FF'; }}
                >
                  {key === 'backspace' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1F4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                      <line x1="18" y1="9" x2="12" y2="15"/>
                      <line x1="12" y1="9" x2="18" y2="15"/>
                    </svg>
                  ) : key}
                </motion.button>
              ))}
            </div>

            {/* Login button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full font-bold text-white text-base"
              style={{
                height: 52, borderRadius: 999,
                background: isLoggingIn
                  ? 'linear-gradient(90deg, #6B7FA3 0%, #6B7FA3 100%)'
                  : 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
                boxShadow: isLoggingIn ? 'none' : '0 6px 24px rgba(37,99,235,0.38)',
                border: 'none', cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em', transition: 'all 0.2s ease',
              }}
            >
              {isLoggingIn ? 'Signing in…' : 'Login'}
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
