import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function LoginScreen() {
  const { login } = useAppContext();
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);

  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      setPin(prev => prev.slice(0, -1));
      setIsError(false);
    } else if (pin.length < 6) {
      setPin(prev => prev + key);
      setIsError(false);
    }
  };

  const handleLogin = () => {
    if (pin.length !== 6) return;
    const success = login(pin);
    if (!success) {
      setIsError(true);
      toast.error('Incorrect PIN. Try again.');
      setPin('');
    }
  };

  React.useEffect(() => {
    if (pin.length === 6) {
      handleLogin();
    }
  }, [pin]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)' }}
    >
      {/* ── Background decorative layer ─────────────────────────────── */}
      {/* Large glow orbs */}
      <div className="absolute top-[-120px] left-[-100px] w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-100px] right-[-80px] w-[340px] h-[340px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
      <div className="absolute top-[40%] left-[60%] w-[200px] h-[200px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 70%)' }} />

      {/* Subtle abstract wave arc — top right */}
      <svg className="absolute top-0 right-0 pointer-events-none opacity-[0.07]" width="320" height="320" viewBox="0 0 320 320" fill="none">
        <circle cx="320" cy="0" r="180" stroke="white" strokeWidth="1.5" />
        <circle cx="320" cy="0" r="230" stroke="white" strokeWidth="1" />
        <circle cx="320" cy="0" r="280" stroke="white" strokeWidth="0.8" />
      </svg>
      {/* Bottom left arc */}
      <svg className="absolute bottom-0 left-0 pointer-events-none opacity-[0.06]" width="260" height="260" viewBox="0 0 260 260" fill="none">
        <circle cx="0" cy="260" r="160" stroke="white" strokeWidth="1.2" />
        <circle cx="0" cy="260" r="210" stroke="white" strokeWidth="0.8" />
      </svg>

      {/* ── Logo area ───────────────────────────────────────────────── */}
      <div className="w-full max-w-sm z-10 flex flex-col items-center mb-7">
        {/* Wi-Fi icon mark */}
        <div className="mb-4 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 32px rgba(37,99,235,0.45), 0 2px 8px rgba(0,0,0,0.2)' }}
          >
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

      {/* ── Login card ──────────────────────────────────────────────── */}
      <motion.div
        animate={isError ? { x: [-10, 10, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.45 }}
        className="w-full max-w-sm z-10"
        style={{
          background: '#ffffff',
          borderRadius: '28px',
          boxShadow: '0 24px 60px rgba(11,31,78,0.35), 0 8px 24px rgba(11,31,78,0.2)',
          padding: '32px 24px 28px',
        }}
      >
        {/* Card header */}
        <div className="text-center mb-7">
          <h2 className="text-2xl font-bold mb-1" style={{ color: '#0B1F4E' }}>Welcome Back</h2>
          <p className="text-sm" style={{ color: '#6B7FA3' }}>Enter your 6-digit PIN to continue</p>
        </div>

        {/* ── PIN indicators ──────────────────────────────────────── */}
        <div className="flex justify-center gap-2.5 mb-7">
          {[...Array(6)].map((_, i) => {
            const isFilled = i < pin.length;
            const isActive = i === pin.length;
            const isErrorDot = isError;

            return (
              <motion.div
                key={i}
                animate={isFilled ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={{ duration: 0.18 }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isFilled
                    ? '2px solid #1D4ED8'
                    : isActive
                      ? '2px solid #2563EB'
                      : isErrorDot
                        ? '2px solid #EF4444'
                        : '2px solid #BFCFEE',
                  background: isFilled
                    ? 'linear-gradient(135deg, #1A3D8F 0%, #2563EB 100%)'
                    : isActive
                      ? '#EFF6FF'
                      : isErrorDot
                        ? '#FEF2F2'
                        : '#F8FAFF',
                  boxShadow: isActive
                    ? '0 0 0 4px rgba(37,99,235,0.12)'
                    : isFilled
                      ? '0 4px 12px rgba(37,99,235,0.3)'
                      : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                <AnimatePresence>
                  {isFilled && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffffff' }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* ── Numeric keypad ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {keys.map((key, i) => (
            <motion.button
              key={i}
              whileTap={key ? { scale: 0.93 } : {}}
              onClick={() => key && handleKeyPress(key)}
              disabled={!key}
              style={key ? {
                height: 56,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: key === 'backspace' ? undefined : 22,
                fontWeight: 600,
                color: '#0B1F4E',
                background: '#F0F5FF',
                border: '1.5px solid #DDEAFF',
                boxShadow: '0 2px 8px rgba(11,31,78,0.08)',
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              } : {
                opacity: 0,
                cursor: 'default',
                height: 56,
              }}
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

        {/* ── Login button ─────────────────────────────────────────── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleLogin}
          className="w-full font-bold text-white text-base"
          style={{
            height: 52,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
            boxShadow: '0 6px 24px rgba(37,99,235,0.38)',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Login
        </motion.button>

        {/* ── Bottom actions ───────────────────────────────────────── */}
        <div className="flex justify-between mt-5 text-sm">
          <button
            className="font-medium transition-colors"
            style={{ color: '#6B7FA3' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#0B1F4E'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7FA3'; }}
          >
            Forgot PIN?
          </button>
          <button
            className="font-semibold transition-colors"
            style={{ color: '#2563EB' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1D4ED8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#2563EB'; }}
          >
            Create Account
          </button>
        </div>
      </motion.div>

    </div>
  );
}
