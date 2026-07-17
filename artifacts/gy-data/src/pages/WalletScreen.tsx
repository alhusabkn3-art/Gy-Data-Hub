import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion } from 'framer-motion';
import { Wallet, ArrowDownLeft, ArrowUpRight, Copy, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FundWalletModal from '@/components/FundWalletModal';
import { toast } from 'sonner';

export default function WalletScreen() {
  const { user, balance, balanceHidden, toggleBalanceHidden, transactions } = useAppContext();
  const [isFundWalletOpen, setIsFundWalletOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'credit' | 'debit'>('all');

  const handleCopy = () => {
    navigator.clipboard.writeText(user.accountNumber);
    toast.success('Account number copied to clipboard');
  };

  const walletActivity = transactions.filter(t => t.paymentMethod === 'Wallet' || t.type === 'wallet_fund');
  
  const filteredActivity = walletActivity.filter(t => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'credit') return t.type === 'wallet_fund';
    if (activeFilter === 'debit') return t.type !== 'wallet_fund';
    return true;
  });

  const totalSpent = walletActivity.filter(t => t.type !== 'wallet_fund' && t.status === 'success').reduce((acc, t) => acc + t.amount, 0);
  const totalReceived = walletActivity.filter(t => t.type === 'wallet_fund' && t.status === 'success').reduce((acc, t) => acc + t.amount, 0);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen"
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">My Wallet</h1>
      </div>

      <Card className="bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] border-none shadow-lg mb-6 overflow-hidden relative">
        <div className="absolute right-0 top-0 w-32 h-32 rounded-full bg-white/10 blur-2xl translate-x-1/2 -translate-y-1/2"></div>
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-100/80 font-medium">Available Balance</span>
            <button onClick={toggleBalanceHidden} className="text-white/80 hover:text-white transition-colors">
              {balanceHidden ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {balanceHidden ? '••••••' : `₦ ${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
            </h2>
          </div>
          
          <div className="flex items-center justify-between bg-black/20 rounded-xl p-3 mb-4 backdrop-blur-sm border border-white/10">
            <div>
              <p className="text-xs text-white/70 mb-0.5">Account Number • {user.bankName}</p>
              <p className="font-mono text-sm text-white font-medium tracking-wider">{user.accountNumber}</p>
            </div>
            <button onClick={handleCopy} className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>

          <Button 
            className="w-full bg-white text-[#1B3A6B] hover:bg-white/90 rounded-xl font-bold h-12"
            onClick={() => setIsFundWalletOpen(true)}
          >
            + Fund Wallet
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs text-muted-foreground font-medium">Spent (Month)</span>
          </div>
          <p className="text-lg font-bold">₦{totalSpent.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs text-muted-foreground font-medium">Received (Month)</span>
          </div>
          <p className="text-lg font-bold">₦{totalReceived.toLocaleString()}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Wallet Activity</h3>
        </div>

        <div className="flex gap-2 mb-4 p-1 bg-card rounded-lg border border-border w-fit">
          <button 
            onClick={() => setActiveFilter('all')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            All
          </button>
          <button 
            onClick={() => setActiveFilter('credit')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeFilter === 'credit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            In
          </button>
          <button 
            onClick={() => setActiveFilter('debit')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeFilter === 'debit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            Out
          </button>
        </div>

        <div className="space-y-3 pb-6">
          {filteredActivity.length > 0 ? (
            filteredActivity.map(txn => (
              <div key={txn.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${txn.type === 'wallet_fund' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    {txn.type === 'wallet_fund' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{txn.description || txn.service}</p>
                    <p className="text-xs text-muted-foreground">{txn.date}, {txn.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold text-sm ${txn.type === 'wallet_fund' ? 'text-green-500' : ''}`}>
                    {txn.type === 'wallet_fund' ? '+' : '-'}₦{txn.amount.toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 bg-card border border-border rounded-xl">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground text-sm">No recent activity found</p>
            </div>
          )}
        </div>
      </div>

      <FundWalletModal open={isFundWalletOpen} onOpenChange={setIsFundWalletOpen} />
    </motion.div>
  );
}
