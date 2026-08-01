import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowDownLeft, ArrowUpRight, Copy, Activity, Gift, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FundWalletModal from '@/components/FundWalletModal';
import { toast } from 'sonner';

export default function WalletScreen() {
  const {
    user, balance, cashbackBalance, cashbackSettings,
    balanceHidden, toggleBalanceHidden, transactions,
    transferCashback, refreshCashbackWallet,
  } = useAppContext();
  const [isFundWalletOpen, setIsFundWalletOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [isTransferring, setIsTransferring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Guard — defensive against null user (screen is behind auth gate)
  if (!user) return null;

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

  const totalSpent    = walletActivity.filter(t => t.type !== 'wallet_fund' && t.status === 'success').reduce((acc, t) => acc + t.amount, 0);
  const totalReceived = walletActivity.filter(t => t.type === 'wallet_fund' && t.status === 'success').reduce((acc, t) => acc + t.amount, 0);

  const minTransfer     = cashbackSettings?.minTransferAmount ?? 100;
  const canTransfer     = cashbackSettings?.enabled && cashbackSettings?.transferMode === 'manual' && cashbackBalance >= minTransfer;
  const isAutoTransfer  = cashbackSettings?.transferMode === 'auto';

  const handleTransfer = async () => {
    if (!canTransfer) return;
    setIsTransferring(true);
    try {
      const result = await transferCashback();
      if (result.ok) {
        toast.success(`₦${result.transferred?.toLocaleString('en-NG') ?? cashbackBalance.toLocaleString('en-NG')} transferred to main wallet!`);
      } else {
        toast.error(result.error ?? 'Transfer failed');
      }
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRefreshCashback = async () => {
    setIsRefreshing(true);
    try {
      await refreshCashbackWallet();
      toast.success('Cashback balance refreshed');
    } finally {
      setIsRefreshing(false);
    }
  };

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

      {/* ── Main Wallet Card ─────────────────────────────────────────────── */}
      <Card className="bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] border-none shadow-lg mb-4 overflow-hidden relative">
        <div className="absolute right-0 top-0 w-32 h-32 rounded-full bg-white/10 blur-2xl translate-x-1/2 -translate-y-1/2"></div>
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-100/80 font-medium">Main Wallet</span>
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

      {/* ── Cashback Wallet Card ─────────────────────────────────────────── */}
      <Card className="border border-amber-500/20 bg-gradient-to-br from-amber-900/20 to-orange-900/10 mb-6 overflow-hidden relative">
        <div className="absolute right-0 top-0 w-24 h-24 rounded-full bg-amber-500/5 blur-2xl translate-x-1/2 -translate-y-1/2" />
        <CardContent className="p-5 relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Gift className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-sm font-semibold text-amber-300">Cashback Wallet</span>
            </div>
            <button
              onClick={handleRefreshCashback}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Refresh cashback balance"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mb-4">
            <p className="text-2xl font-bold text-amber-300">
              {balanceHidden ? '••••••' : `₦ ${cashbackBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
            </p>
            <p className="text-xs text-amber-500/70 mt-0.5">Earned from eligible purchases</p>
          </div>

          {/* Transfer info */}
          <AnimatePresence>
            {cashbackSettings?.enabled ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                {isAutoTransfer ? (
                  <div className="flex items-center gap-2 bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-amber-400">A</span>
                    </div>
                    <p className="text-xs text-amber-300/80">
                      Auto-transfer is active — cashback is moved to your main wallet automatically when balance reaches ₦{minTransfer.toLocaleString('en-NG')}.
                    </p>
                  </div>
                ) : (
                  <>
                    {cashbackBalance > 0 && cashbackBalance < minTransfer && (
                      <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                        <p className="text-xs text-amber-300/70">
                          Minimum transfer: <span className="font-semibold text-amber-300">₦{minTransfer.toLocaleString('en-NG')}</span>
                          {' · '}Need <span className="font-semibold text-amber-300">₦{(minTransfer - cashbackBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span> more
                        </p>
                        {/* Progress bar */}
                        <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((cashbackBalance / minTransfer) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold h-10 text-sm disabled:opacity-50"
                      disabled={!canTransfer || isTransferring}
                      onClick={handleTransfer}
                    >
                      {isTransferring ? (
                        <span className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                          Transferring…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <ArrowRight className="w-4 h-4" />
                          Transfer to Main Wallet
                        </span>
                      )}
                    </Button>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="text-xs text-amber-500/50 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" />
                Cashback program is currently inactive
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
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

      {/* ── Wallet Activity ───────────────────────────────────────────────── */}
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
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    txn.type === 'wallet_fund' && txn.service === 'Cashback'
                      ? 'bg-amber-500/10 text-amber-500'
                      : txn.type === 'wallet_fund'
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-red-500/10 text-red-500'
                  }`}>
                    {txn.type === 'wallet_fund' && txn.service === 'Cashback'
                      ? <Gift className="w-5 h-5" />
                      : txn.type === 'wallet_fund'
                        ? <ArrowDownLeft className="w-5 h-5" />
                        : <ArrowUpRight className="w-5 h-5" />
                    }
                  </div>
                  <div>
                    <p className="font-medium text-sm">{txn.description || txn.service}</p>
                    <p className="text-xs text-muted-foreground">{txn.date}, {txn.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold text-sm ${
                    txn.type === 'wallet_fund' && txn.service === 'Cashback'
                      ? 'text-amber-500'
                      : txn.type === 'wallet_fund'
                        ? 'text-green-500'
                        : ''
                  }`}>
                    {txn.type === 'wallet_fund' ? '+' : '-'}₦{txn.amount.toLocaleString()}
                  </p>
                  {txn.service === 'Cashback' && (
                    <p className="text-[10px] text-amber-500/60">Cashback</p>
                  )}
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
