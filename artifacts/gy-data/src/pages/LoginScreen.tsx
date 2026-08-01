import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { normalizeNigerianNumber } from '../components/PhoneInputWithContacts';

// ── Hidden admin long-press trigger ──────────────────────────────────────────
// Looks like a subtle design element — small circle with a tiny dot.
// Hold 2 s to navigate to /admin-login; quick tap does nothing.
// Uses native DOM listeners (not React synthetic events) for reliable
// mobile/desktop pointer tracking.
const ADMIN_HOLD_MS = 2000;

// ── Create Account long-press → Super Admin ───────────────────────────────────
// Quick tap  → onTap()  (normal registration, unchanged)
// Hold 2 000 ms → onSuperAdmin()  (silent, no label change)
// Release before 2 s → cancels; only feedback is a thin underline growing
// left-to-right beneath the text.
const SUPER_ADMIN_HOLD_MS = 2000;

function CreateAccountButton({
  onTap,
  onSuperAdmin,
}: {
  onTap: () => void;
  onSuperAdmin: () => void;
}) {
  const btnRef         = useRef<HTMLButtonElement>(null);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef         = useRef<number | null>(null);
  const startRef       = useRef<number>(0);
  const didUnlockRef   = useRef(false);
  const onTapRef       = useRef(onTap);
  const onSuperRef     = useRef(onSuperAdmin);
  const [progress, setProgress] = useState(0); // 0..1 drives underline width

  useEffect(() => { onTapRef.current = onTap; },        [onTap]);
  useEffect(() => { onSuperRef.current = onSuperAdmin; }, [onSuperAdmin]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    function stopRaf() {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }

    function startHold() {
      if (timerRef.current) return;           // already counting
      didUnlockRef.current = false;
      startRef.current = performance.now();
      setProgress(0);

      // Animate underline width
      function tick() {
        const p = Math.min((performance.now() - startRef.current) / SUPER_ADMIN_HOLD_MS, 1);
        setProgress(p);
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
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
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      stopRaf();
      setProgress(0);
    }

    const onDown   = (e: PointerEvent) => { e.preventDefault(); startHold(); };
    const onUp     = () => cancelHold();
    const onCancel = () => cancelHold();
    const onLeave  = () => cancelHold();
    const noCtx    = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown',   onDown,   { passive: false });
    el.addEventListener('pointerup',     onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave',  onLeave);
    el.addEventListener('contextmenu',   noCtx);

    return () => {
      cancelHold();
      el.removeEventListener('pointerdown',   onDown);
      el.removeEventListener('pointerup',     onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave',  onLeave);
      el.removeEventListener('contextmenu',   noCtx);
    };
  }, []);

  // onClick fires after pointerup — if the hold completed we swallow it.
  const handleClick = () => {
    if (didUnlockRef.current) { didUnlockRef.current = false; return; }
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
        color:            pressing ? 'rgba(255,255,255,0.9)' : 'rgba(147,197,253,0.85)',
        touchAction:      'none',
        userSelect:       'none',
        WebkitUserSelect: 'none',
        transition:       'color 0.15s ease',
        outline:          'none',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)'; }}
      onMouseLeave={e => {
        if (!pressing) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(147,197,253,0.85)';
      }}
    >
      Create Account
      {/* Thin underline that expands left-to-right during the hold.
          Completely unremarkable — could be mistaken for a hover effect. */}
      <span
        aria-hidden="true"
        style={{
          position:     'absolute',
          bottom:       -1,
          left:         0,
          height:       2,
          width:        `${progress * 100}%`,
          background:   'linear-gradient(90deg, #2563EB, #1D4ED8)',
          borderRadius: 1,
          opacity:      pressing ? 0.7 : 0,
          transition:   pressing ? 'none' : 'opacity 0.2s ease',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
}

function HiddenAdminTrigger({ onUnlock }: { onUnlock: () => void }) {
  const btnRef        = useRef<HTMLButtonElement>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef   = useRef<number | null>(null);   // tracked pointer id
  const onUnlockRef   = useRef(onUnlock);
  const [pressing, setPressing] = useState(false);

  // Keep onUnlock stable inside the effect without re-attaching listeners
  useEffect(() => { onUnlockRef.current = onUnlock; }, [onUnlock]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    // No setPointerCapture — keeping it absent lets pointerleave fire normally
    // when the finger/cursor moves off the element mid-hold.
    function startHold() {
      if (activeIdRef.current !== null) return;  // guard against duplicate events
      activeIdRef.current = 1;                   // sentinel — just marks "active"
      setPressing(true);
      timerRef.current = setTimeout(() => {
        activeIdRef.current = null;
        timerRef.current    = null;
        setPressing(false);
        onUnlockRef.current();                   // ← navigate to /admin-login
      }, ADMIN_HOLD_MS);
    }

    function cancelHold() {
      if (!timerRef.current && activeIdRef.current === null) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      activeIdRef.current = null;
      setPressing(false);
    }

    const onDown   = (e: PointerEvent) => { e.preventDefault(); startHold(); };
    const onUp     = ()                 => cancelHold();
    const onCancel = ()                 => cancelHold();
    const onLeave  = ()                 => cancelHold();
    const noCtx    = (e: Event)        => e.preventDefault();

    el.addEventListener('pointerdown',   onDown,   { passive: false });
    el.addEventListener('pointerup',     onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave',  onLeave);
    el.addEventListener('contextmenu',   noCtx);

    return () => {
      cancelHold();
      el.removeEventListener('pointerdown',   onDown);
      el.removeEventListener('pointerup',     onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave',  onLeave);
      el.removeEventListener('contextmenu',   noCtx);
    };
  }, []); // attach once — onUnlock read through onUnlockRef

  return (
    <button
      ref={btnRef}
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      style={{
        position:         'absolute',
        bottom:           28,
        left:             '50%',
        transform:        'translateX(-50%)',
        width:            52,
        height:           52,
        borderRadius:     '50%',
        background:       pressing ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        border:           '1px solid rgba(255,255,255,0.18)',
        outline:          'none',
        cursor:           'default',
        touchAction:      'none',
        userSelect:       'none',
        WebkitUserSelect: 'none',
        boxShadow:        pressing
          ? '0 0 14px rgba(255,255,255,0.18), 0 0 28px rgba(99,130,246,0.22)'
          : '0 0 8px rgba(255,255,255,0.08)',
        display:          'flex',
        alignItems:       'center',
        justifyContent:   'center',
        transition:       'background 0.15s ease, box-shadow 0.15s ease',
        overflow:         'hidden',
      }}
    >
      {/* Tiny centre dot */}
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: pressing ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)',
        transition: 'background 0.15s ease',
        position: 'relative', zIndex: 1,
      }} />
      {/* Ripple ring — expands from centre while pressing, resets on release */}
      <AnimatePresence>
        {pressing && (
          <motion.div
            key="ripple"
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 2.8, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: ADMIN_HOLD_MS / 1000, ease: 'linear' }}
            style={{
              position:     'absolute',
              width:        '100%',
              height:       '100%',
              borderRadius: '50%',
              background:   'rgba(255,255,255,0.25)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
    </button>
  );
}

// ── Login Screen ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { login } = useAppContext();
  const [, setLocation] = useLocation();

  const [phone,       setPhone]       = useState('');
  const [phoneError,  setPhoneError]  = useState('');
  const [pin,         setPin]         = useState('');
  const [isError,     setIsError]     = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  // Controls whether the custom numpad is visible.
  // Starts false so the numpad doesn't appear until the user taps the PIN area.
  const [pinActive,   setPinActive]   = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid  = /^0[7-9][01]\d{8}$/.test(phoneDigits);

  // ── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    if (isLoggingIn || pin.length < 6) return;

    // Validate phone before attempting
    if (!phoneValid) {
      setPhoneError('Enter a valid 11-digit Nigerian mobile number.');
      phoneInputRef.current?.focus();
      return;
    }

    setPhoneError('');
    setIsLoggingIn(true);

    const result = await login(phone, pin);

    if (result === 'success') {
      // AppContext sets isLoggedIn → CustomerRouter redirects automatically
      return;
    }

    setIsError(true);
    if (result === 'no_account') {
      toast.error('No account found with this number.');
      setTimeout(() => {
        setPin('');
        setIsError(false);
        setIsLoggingIn(false);
        setPinActive(false);
        phoneInputRef.current?.focus();
      }, 1400);
    } else if (result === 'account_suspended') {
      toast.error('Account suspended. Please contact support.', { duration: 5000 });
      setTimeout(() => {
        setPin('');
        setIsError(false);
        setIsLoggingIn(false);
        setPinActive(false);
      }, 1800);
    } else if (result === 'account_closed') {
      toast.error('This account has been closed.', { duration: 5000 });
      setTimeout(() => {
        setPin('');
        setIsError(false);
        setIsLoggingIn(false);
        setPinActive(false);
      }, 1800);
    } else {
      toast.error('Incorrect PIN. Please try again.');
      setPin('');
      setIsLoggingIn(false);
    }
  }, [isLoggingIn, login, phone, pin, phoneValid]);

  // Auto-submit when PIN fills and phone is valid
  useEffect(() => {
    if (pin.length === 6 && phoneValid && !isLoggingIn) {
      void handleLogin();
    }
  }, [pin, phoneValid, isLoggingIn, handleLogin]);

  // ── Keypad handler ────────────────────────────────────────────────────────
  const handleKey = (key: string) => {
    if (isLoggingIn) return;
    if (key === 'backspace') {
      setPin(p => p.slice(0, -1));
      setIsError(false);
    } else if (pin.length < 6) {
      setPin(p => p + key);
      setIsError(false);
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','backspace'];

  return (
    <div
      className="min-h-screen flex flex-col items-center p-5 pt-14 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)' }}
    >

      {/* ── Background decorative layer ──────────────────────────────── */}
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

      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm z-10 flex flex-col items-center mb-4">
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
          <h1
            className="text-4xl font-black tracking-tight text-white leading-none"
            style={{ letterSpacing: '-0.5px', textShadow: '0 2px 12px rgba(37,99,235,0.4)' }}
          >
            GY DATA
          </h1>
          <p className="text-sm mt-1.5 font-medium tracking-[0.18em] uppercase"
            style={{ color: 'rgba(147,197,253,0.85)' }}>
            endless joy
          </p>
        </div>
      </div>

      {/* ── Login form — rendered directly on the background (no white card) ── */}
      <motion.div
        animate={isError ? { x: [-10, 10, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.45 }}
        className="w-full max-w-sm z-10"
      >
        {/* Header */}
        <div className="text-center mb-7">
          <h2 className="text-2xl font-bold mb-1 text-white">Welcome Back</h2>
          <p className="text-sm" style={{ color: 'rgba(147,197,253,0.7)' }}>Sign in to your account</p>
        </div>

        {/* ── Phone number field ────────────────────────────────────── */}
        <div className="mb-5">
          <label
            className="block text-xs font-semibold mb-2 uppercase tracking-wider"
            style={{ color: 'rgba(147,197,253,0.65)' }}
          >
            Phone Number
          </label>
          <div className="relative flex items-center">
            <span
              className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-sm font-semibold"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
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
              onKeyDown={e => { if (e.key === 'Enter' && phoneValid) phoneInputRef.current?.blur(); }}
              placeholder="0803 456 7890"
              autoComplete="tel"
              className="w-full h-12 rounded-xl text-sm font-medium outline-none transition-all"
              style={{
                border:       `1.5px solid ${phoneError ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.15)'}`,
                background:   phoneError ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.08)',
                color:        '#ffffff',
                paddingLeft:  '6rem',
                paddingRight: phone.length > 0 ? '5.5rem' : '4rem',
              }}
              onFocus={e => {
                setPinActive(false);
                e.currentTarget.style.borderColor = phoneError ? 'rgba(239,68,68,0.8)' : 'rgba(99,166,246,0.7)';
                e.currentTarget.style.background  = phoneError ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.12)';
                e.currentTarget.style.boxShadow   = phoneError ? 'none' : '0 0 0 3px rgba(37,99,235,0.18)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = phoneError ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.15)';
                e.currentTarget.style.background  = phoneError ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.08)';
                e.currentTarget.style.boxShadow   = 'none';
              }}
            />
            {/* Paste button — shown when field is empty */}
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
                  style={{ color: 'rgba(147,197,253,0.9)', background: 'rgba(255,255,255,0.1)' }}
                  aria-label="Paste phone number"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
                  </svg>
                  Paste
                </motion.button>
              )}
            </AnimatePresence>
            {/* Copy button — shown when a valid number is entered */}
            <AnimatePresence>
              {phoneValid && (
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
                  style={{ color: phoneCopied ? 'rgba(74,222,128,0.9)' : 'rgba(147,197,253,0.9)', background: 'rgba(255,255,255,0.1)' }}
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
                className="text-xs mt-2 pl-1" style={{ color: '#FCA5A5' }}
              >
                {phoneError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* ── PIN label ─────────────────────────────────────────────── */}
        <label
          className="block text-xs font-semibold mb-3 uppercase tracking-wider"
          style={{ color: 'rgba(147,197,253,0.65)' }}
        >
          6-Digit PIN
        </label>

        {/* PIN dot indicators — tapping this row opens the numpad */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Tap to enter PIN"
          onClick={() => { phoneInputRef.current?.blur(); setPinActive(true); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { phoneInputRef.current?.blur(); setPinActive(true); } }}
          className="flex justify-center gap-2.5 mb-5"
          style={{ cursor: pinActive ? 'default' : 'pointer' }}
        >
          {[...Array(6)].map((_, i) => {
            const isFilled = i < pin.length;
            const isActive = pinActive && i === pin.length;
            return (
              <motion.div
                key={i}
                animate={isFilled ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={{ duration: 0.18 }}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: isFilled   ? '2px solid rgba(99,166,246,0.8)'
                        : isActive   ? '2px solid rgba(99,166,246,0.6)'
                        : isError    ? '2px solid rgba(239,68,68,0.7)'
                        : '2px solid rgba(255,255,255,0.18)',
                  background: isFilled ? 'linear-gradient(135deg, rgba(29,78,216,0.9) 0%, rgba(37,99,235,0.9) 100%)'
                            : isActive ? 'rgba(255,255,255,0.12)'
                            : isError  ? 'rgba(239,68,68,0.1)'
                            : 'rgba(255,255,255,0.07)',
                  boxShadow: isActive ? '0 0 0 3px rgba(37,99,235,0.2)'
                           : isFilled ? '0 4px 14px rgba(37,99,235,0.4)' : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                <AnimatePresence>
                  {isFilled && (
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffffff' }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* "Tap to enter PIN" hint — visible only before the numpad is opened */}
        <AnimatePresence>
          {!pinActive && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="text-center text-xs mb-5 -mt-3"
              style={{ color: 'rgba(147,197,253,0.5)' }}
            >
              Tap the boxes above to enter your PIN
            </motion.p>
          )}
        </AnimatePresence>

        {/* ── Number keypad — slides in when PIN area is tapped ─────── */}
        <AnimatePresence>
          {pinActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {keys.map((key, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    whileTap={key ? { scale: 0.93 } : {}}
                    onClick={() => key && handleKey(key)}
                    disabled={!key || isLoggingIn}
                    style={key ? {
                      height: 52, borderRadius: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: key === 'backspace' ? undefined : 22, fontWeight: 600,
                      color: 'rgba(255,255,255,0.9)',
                      background: 'rgba(255,255,255,0.09)',
                      border: '1.5px solid rgba(255,255,255,0.13)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                      transition: 'background 0.12s ease',
                    } : { opacity: 0, cursor: 'default', height: 52 }}
                    onMouseEnter={e => { if (key) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
                    onMouseLeave={e => { if (key) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.09)'; }}
                  >
                    {key === 'backspace' ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                        <line x1="18" y1="9" x2="12" y2="15"/>
                        <line x1="12" y1="9" x2="18" y2="15"/>
                      </svg>
                    ) : key}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Login button ──────────────────────────────────────────── */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleLogin}
          disabled={isLoggingIn || pin.length < 6}
          className="w-full font-bold text-white text-base"
          style={{
            height: 52, borderRadius: 999, border: 'none',
            cursor: (isLoggingIn || pin.length < 6) ? 'not-allowed' : 'pointer',
            background: isLoggingIn
              ? 'rgba(107,127,163,0.5)'
              : pin.length < 6
                ? 'rgba(255,255,255,0.15)'
                : 'linear-gradient(90deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%)',
            boxShadow: (isLoggingIn || pin.length < 6) ? 'none' : '0 6px 28px rgba(37,99,235,0.5)',
            letterSpacing: '0.02em', transition: 'all 0.2s ease',
            color: pin.length < 6 && !isLoggingIn ? 'rgba(255,255,255,0.4)' : '#ffffff',
          }}
        >
          {isLoggingIn ? 'Signing in…' : 'Login'}
        </motion.button>

        {/* ── Footer links ──────────────────────────────────────────── */}
        <div className="flex justify-between mt-5 text-sm">
          <button
            type="button"
            onClick={() => setLocation('/forgot-pin')}
            className="font-medium transition-colors"
            style={{ color: 'rgba(147,197,253,0.65)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(147,197,253,0.65)'; }}
          >
            Forgot PIN?
          </button>
          <CreateAccountButton
            onTap={() => setLocation('/register')}
            onSuperAdmin={() => setLocation('/super-admin-login')}
          />
        </div>
      </motion.div>

      {/* ── Hidden admin entry point ──────────────────────────────────
          Completely invisible 48×48 px target in the bottom-right corner.
          No visible icon, ring, or label — only discoverable by those who
          know it exists. Hold for 2.5 s to open the admin portal.        ── */}
      <HiddenAdminTrigger onUnlock={() => setLocation('/admin-login')} />

    </div>
  );
}
