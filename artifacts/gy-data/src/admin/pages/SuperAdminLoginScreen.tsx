import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Crown, Loader2, ShieldAlert } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

export default function SuperAdminLoginScreen() {
  const { adminLogin, adminLogout, isAdminLoggedIn, isSuperAdmin } = useAdminContext();
  const [email, setEmail]     = useState('');
  const [pin, setPin]         = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake]     = useState(false);

  // If someone logged in as a regular admin through this screen, reject them.
  useEffect(() => {
    if (isAdminLoggedIn && !isSuperAdmin) {
      toast.error('Access denied. Super Admin credentials required.');
      adminLogout();
    }
  }, [isAdminLoggedIn, isSuperAdmin]);

  const handleLogin = async () => {
    if (!email.trim() || !pin.trim()) {
      toast.error('Please enter your email and PIN.');
      return;
    }
    setIsLoading(true);
    try {
      const ok = await adminLogin(email.trim().toLowerCase(), pin);
      if (!ok) {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        toast.error('Invalid Super Admin credentials.');
        setPin('');
      }
      // Role enforcement is handled by the useEffect above.
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
        background: 'linear-gradient(150deg, #150800 0%, #1F0E00 40%, #2C1500 100%)',
      }}
    >
      {/* Dot-grid texture */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(245,158,11,0.10) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Glow blobs */}
      <div
        className="fixed top-[-15%] right-[-10%] w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.12) 0%, transparent 70%)' }}
      />
      <div
        className="fixed bottom-[-15%] left-[-10%] w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(180,83,9,0.10) 0%, transparent 70%)' }}
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
              background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
              boxShadow: '0 0 48px rgba(217,119,6,0.45), 0 8px 24px rgba(0,0,0,0.45)',
            }}
          >
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: '#FEF3C7', letterSpacing: '-0.02em' }}
          >
            GY DATA
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'rgba(252,211,77,0.55)' }}>
            Super Admin portal — elevated access
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
              style={{ color: 'rgba(252,211,77,0.55)' }}
            >
              Super Admin Email
            </label>
            <input
              type="email"
              placeholder="Super admin email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full rounded-xl px-4 text-sm outline-none transition-all"
              style={{
                height: '52px',
                background: 'rgba(255,255,255,0.04)',
                border: '1.5px solid rgba(245,158,11,0.20)',
                color: '#FEF3C7',
              }}
              onFocus={e => {
                e.currentTarget.style.border = '1.5px solid rgba(245,158,11,0.60)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }}
              onBlur={e => {
                e.currentTarget.style.border = '1.5px solid rgba(245,158,11,0.20)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              }}
            />
          </div>

          {/* PIN */}
          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'rgba(252,211,77,0.55)' }}
            >
              Super Admin PIN
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
                  background: 'rgba(255,255,255,0.04)',
                  border: '1.5px solid rgba(245,158,11,0.20)',
                  color: '#FEF3C7',
                }}
                onFocus={e => {
                  e.currentTarget.style.border = '1.5px solid rgba(245,158,11,0.60)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
                onBlur={e => {
                  e.currentTarget.style.border = '1.5px solid rgba(245,158,11,0.20)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: 'rgba(245,158,11,0.50)' }}
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
                ? 'rgba(217,119,6,0.55)'
                : 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
              boxShadow: '0 4px 24px rgba(217,119,6,0.38)',
            }}
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Crown className="w-4 h-4" />}
            {isLoading ? 'Authenticating…' : 'Sign In as Super Admin'}
          </button>
        </motion.div>

        {/* Security notice */}
        <div className="mt-8 flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'rgba(245,158,11,0.40)' }} />
          <p className="text-xs" style={{ color: 'rgba(245,158,11,0.40)' }}>
            This portal is for super administrators only. All access attempts are logged and audited.
          </p>
        </div>

        {/* Divider */}
        <div className="my-6" style={{ borderTop: '1px solid rgba(245,158,11,0.08)' }} />

        {/* Footer link */}
        <p className="text-center text-xs" style={{ color: 'rgba(245,158,11,0.40)' }}>
          Regular admin?{' '}
          <a
            href="/admin-login"
            className="hover:underline transition-colors"
            style={{ color: 'rgba(245,158,11,0.70)' }}
          >
            Sign in here
          </a>
        </p>
      </motion.div>
    </div>
  );
}
