import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Shield, Loader2 } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

export default function AdminLoginScreen() {
  const { adminLogin } = useAdminContext();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#3B82F6 1px, transparent 1px), linear-gradient(90deg, #3B82F6 1px, transparent 1px)',
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
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">GY DATA Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">Restricted access — authorised personnel only</p>
        </div>

        {/* Form Card */}
        <motion.div
          animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6 shadow-xl"
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Admin Email
              </label>
              <input
                type="email"
                placeholder="admin@gyd.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-12 px-4 text-sm outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Admin PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  placeholder="Enter your PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-12 px-4 pr-12 text-sm outline-none transition-colors tracking-widest font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-sm mt-2 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(59,130,246,0.3)]"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? 'Authenticating…' : 'Sign In to Admin'}
            </button>
          </div>
        </motion.div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Customer app?{' '}
          <a href="/" className="text-primary hover:underline">
            Back to GY DATA
          </a>
        </p>
      </motion.div>
    </div>
  );
}
