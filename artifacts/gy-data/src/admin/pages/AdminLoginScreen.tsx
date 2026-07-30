import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Zap, Loader2, ShieldCheck } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

export default function AdminLoginScreen() {
  const { adminLogin } = useAdminContext();
  const [email, setEmail]     = useState('');
  const [pin, setPin]         = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake]     = useState(false);

  const handleLogin = async () => {
    if (!email || !pin) {
      toast.error('Please enter your email and PIN.');
      return;
    }
    setIsLoading(true);
    try {
      const ok = await adminLogin(email, pin);
      if (!ok) {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        toast.error('Invalid admin credentials.');
        setPin('');
      }
    } catch {
      toast.error('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5 py-10"
      style={{
        background: 'linear-gradient(150deg, #050E1F 0%, #081426 40%, #0D1F3C 100%)',
      }}
    >
      {/* Dot-grid texture */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.12) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Glow blobs */}
      <div
        className="fixed top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)' }}
      />
      <div
        className="fixed bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-12">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              boxShadow: '0 0 48px rgba(37,99,235,0.40), 0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            <Zap className="w-8 h-8 text-white" fill="white" />
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: '#EEF2FF', letterSpacing: '-0.02em' }}
          >
            GY DATA
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'rgba(148,163,184,0.8)' }}>
            Admin portal — authorised access only
          </p>
        </div>

        {/* Fields — no card wrapper */}
        <motion.div
          animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="space-y-5"
        >
          {/* Email */}
          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'rgba(148,163,184,0.7)' }}
            >
              Admin Email
            </label>
            <input
              type="email"
              placeholder="Enter admin email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full h-13 rounded-xl px-4 text-sm outline-none transition-all"
              style={{
                height: '52px',
                background: 'rgba(255,255,255,0.05)',
                border: '1.5px solid rgba(59,130,246,0.18)',
                color: '#E2E8F0',
              }}
              onFocus={e => {
                e.currentTarget.style.border = '1.5px solid rgba(59,130,246,0.55)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
              }}
              onBlur={e => {
                e.currentTarget.style.border = '1.5px solid rgba(59,130,246,0.18)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
            />
          </div>

          {/* PIN */}
          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'rgba(148,163,184,0.7)' }}
            >
              Admin PIN
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                placeholder="Enter your PIN"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full rounded-xl px-4 pr-12 text-sm outline-none transition-all tracking-widest font-mono"
                style={{
                  height: '52px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1.5px solid rgba(59,130,246,0.18)',
                  color: '#E2E8F0',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1.5px solid rgba(59,130,246,0.55)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1.5px solid rgba(59,130,246,0.18)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: 'rgba(148,163,184,0.6)' }}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white"
            style={{
              height: '52px',
              marginTop: '8px',
              background: isLoading
                ? 'rgba(37,99,235,0.6)'
                : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              boxShadow: '0 4px 24px rgba(37,99,235,0.38)',
            }}
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ShieldCheck className="w-4 h-4" />}
            {isLoading ? 'Authenticating…' : 'Sign In to Admin'}
          </button>
        </motion.div>

        {/* Divider */}
        <div className="my-8" style={{ borderTop: '1px solid rgba(59,130,246,0.10)' }} />

        {/* Footer links */}
        <p className="text-center text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>
          Customer app?{' '}
          <a
            href="/"
            className="hover:underline transition-colors"
            style={{ color: 'rgba(99,130,246,0.8)' }}
          >
            Back to GY DATA
          </a>
        </p>
      </motion.div>
    </div>
  );
}
