import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Building2, CreditCard, Copy, CheckCircle2, Wallet } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';
import { toast } from 'sonner';

export default function BankAccountScreen() {
  const [, setLocation] = useLocation();
  const { user, balance } = useAppContext();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const copyAccountNumber = () => {
    navigator.clipboard.writeText(user.accountNumber);
    setCopied(true);
    toast.success('Account number copied!');
    setTimeout(() => setCopied(false), 2000);
  };

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
        <h1 className="text-xl font-bold">Bank Account</h1>
      </div>

      {/* Wallet card */}
      <div
        className="rounded-2xl p-5 mb-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0B1F4E 0%, #1E4DB7 100%)', boxShadow: '0 8px 32px rgba(11,31,78,0.3)' }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">GY DATA Wallet</p>
        <p className="text-3xl font-bold mb-4">₦{balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-white/60 text-[10px] uppercase tracking-wider mb-0.5">Account Number</p>
            <p className="text-lg font-mono font-bold tracking-widest">{user.accountNumber}</p>
          </div>
          <button
            onClick={copyAccountNumber}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 rounded-lg text-xs font-semibold"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Account details */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">Account Details</h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-6">
        <div className="flex items-center gap-3 p-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Bank / Institution</p>
            <p className="text-sm font-semibold">{user.bankName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Account Number</p>
            <p className="text-sm font-semibold font-mono tracking-wider">{user.accountNumber}</p>
          </div>
          <button onClick={copyAccountNumber} className="text-primary">
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Account Name</p>
            <p className="text-sm font-semibold">{user.name}</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground px-4">
        This is your GY DATA virtual wallet account. Use these details to receive transfers from any Nigerian bank.
      </p>
    </motion.div>
  );
}
