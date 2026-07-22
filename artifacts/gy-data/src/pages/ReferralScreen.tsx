import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Copy, CheckCircle2, Share2, Gift, Users, Wallet } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';
import { toast } from 'sonner';

export default function ReferralScreen() {
  const [, setLocation] = useLocation();
  const { user } = useAppContext();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const copyCode = () => {
    navigator.clipboard.writeText(user.referralCode);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareCode = async () => {
    const text = `Join GY DATA and get instant data at the best prices! Use my referral code: ${user.referralCode}\n\nDownload the app and start saving today.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join GY DATA', text });
      } catch { /* dismissed */ }
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Referral message copied to clipboard!');
    }
  };

  const benefits = [
    { icon: Wallet, title: 'Earn Wallet Credit',  desc: 'Get credited when a referred friend makes their first purchase' },
    { icon: Users,  title: 'Unlimited Referrals',  desc: 'Refer as many friends as you like — no cap on earnings' },
    { icon: Gift,   title: 'Exclusive Rewards',    desc: 'Top referrers unlock special bonuses and premium perks' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background pb-20"
    >
      <div className="flex items-center gap-3 mb-8 pt-2">
        <button
          onClick={() => setLocation('/')}
          className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Referral Program</h1>
      </div>

      {/* Hero card */}
      <div
        className="rounded-2xl p-6 mb-6 text-white text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0B1F4E 0%, #1E4DB7 100%)', boxShadow: '0 8px 32px rgba(11,31,78,0.3)' }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
        <div className="w-14 h-14 bg-white/15 rounded-full flex items-center justify-center mx-auto mb-3">
          <Gift className="w-7 h-7 text-white" />
        </div>
        <p className="text-white/70 text-sm mb-1">Invite friends and earn</p>
        <p className="text-2xl font-bold mb-4">Wallet Bonuses</p>

        {/* Code display */}
        <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="font-mono text-lg font-bold tracking-widest text-white">{user.referralCode}</span>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors px-3 py-1.5 rounded-lg text-xs font-semibold"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={shareCode}
        className="w-full h-13 py-3.5 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors active:scale-[0.98] mb-8"
      >
        <Share2 className="w-5 h-5" />
        Share Your Code
      </button>

      {/* Benefits */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">How It Works</h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {benefits.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Icon className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
