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
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(160deg, #1a0a00 0%, #2d1600 35%, #3d2000 65%, #1a0a00 100%)',
      }}
    >
      {/* Subtle amber grid */}
      <div
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#F59E0B 1px, transparent 1px), linear-gradient(90deg, #F59E0B 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
              boxShadow: '0 0 40px rgba(217,119,6,0.35)',
            }}
          >
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-amber-100">GY DATA Super Admin</h1>
          <p className="text-amber-400/60 text-sm mt-1">Elevated access — authorised personnel only</p>
        </div>

        {/* Form card */}
        <motion.div
          animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="rounded-2xl p-6 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(245,158,11,0.25)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2 block">
                Super Admin Email
              </label>
              <input
                type="email"
                placeholder="Super admin email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full rounded-xl h-12 px-4 text-sm outline-none transition-all text-amber-50 placeholder-amber-100/30"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '2px solid rgba(245,158,11,0.2)',
                }}
                onFocus={e => (e.currentTarget.style.border = '2px solid rgba(245,158,11,0.6)')}
                onBlur={e => (e.currentTarget.style.border = '2px solid rgba(245,158,11,0.2)')}
              />
            </div>

            {/* PIN */}
            <div>
              <label className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2 block">
                Super Admin PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  placeholder="Enter your PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full rounded-xl h-12 px-4 pr-12 text-sm outline-none transition-all tracking-widest font-mono text-amber-50 placeholder-amber-100/30"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '2px solid rgba(245,158,11,0.2)',
                  }}
                  onFocus={e => (e.currentTarget.style.border = '2px solid rgba(245,158,11,0.6)')}
                  onBlur={e => (e.currentTarget.style.border = '2px solid rgba(245,158,11,0.2)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors p-1"
                  style={{ color: 'rgba(245,158,11,0.5)' }}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full h-12 rounded-xl font-bold text-sm mt-2 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-white"
              style={{
                background: isLoading
                  ? 'rgba(217,119,6,0.6)'
                  : 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                boxShadow: '0 4px 20px rgba(217,119,6,0.35)',
              }}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
              {isLoading ? 'Authenticating…' : 'Sign In as Super Admin'}
            </button>
          </div>
        </motion.div>

        {/* Security notice */}
        <div className="mt-4 flex items-start gap-2 px-1">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500/50 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-500/50">
            This portal is for super administrators only. All access attempts are logged and audited.
          </p>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'rgba(245,158,11,0.4)' }}>
          Regular admin?{' '}
          <a href="/admin-login" className="hover:underline" style={{ color: 'rgba(245,158,11,0.7)' }}>
            Sign in here
          </a>
        </p>
      </motion.div>
    </div>
  );
}
