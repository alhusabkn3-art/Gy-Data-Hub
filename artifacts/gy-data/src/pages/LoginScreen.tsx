import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion } from 'framer-motion';
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
    <div className="min-h-screen bg-gradient-to-b from-[#0A1628] to-[#0F2044] flex flex-col items-center justify-center p-6 text-foreground relative overflow-hidden">
      {/* Decorative background blurs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <div className="w-full max-w-sm z-10 flex flex-col items-center mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">GY DATA</h1>
        </div>
        <p className="text-muted-foreground text-sm">Your Digital Life, Simplified</p>
      </div>

      <motion.div 
        animate={isError ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm bg-card/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-muted-foreground text-sm">Enter your 6-digit PIN to continue</p>
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i} 
              className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all ${
                i === pin.length 
                  ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                  : i < pin.length 
                    ? 'border-primary bg-primary' 
                    : isError 
                      ? 'border-destructive bg-destructive/10'
                      : 'border-white/10 bg-black/20'
              }`}
            >
              {i < pin.length && (
                <div className="w-3 h-3 bg-white rounded-full" />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {keys.map((key, i) => (
            <button
              key={i}
              onClick={() => key && handleKeyPress(key)}
              disabled={!key}
              className={`h-14 rounded-2xl flex items-center justify-center text-xl font-medium transition-all ${
                key ? 'bg-white/5 hover:bg-white/10 active:scale-95 text-white' : 'opacity-0 cursor-default'
              }`}
            >
              {key === 'backspace' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
              ) : (
                key
              )}
            </button>
          ))}
        </div>

        <button 
          onClick={handleLogin}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-xl font-bold active:scale-[0.98] transition-transform"
        >
          Login
        </button>

        <div className="flex justify-between mt-6 text-sm">
          <button className="text-muted-foreground hover:text-white transition-colors">Forgot PIN?</button>
          <button className="text-primary hover:text-primary/80 transition-colors">Create Account</button>
        </div>
      </motion.div>

      <div className="mt-8">
        <button 
          onClick={() => setPin('123456')}
          className="text-xs text-muted-foreground bg-white/5 px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors"
        >
          Demo PIN: 123456 — tap to autofill
        </button>
      </div>
    </div>
  );
}
