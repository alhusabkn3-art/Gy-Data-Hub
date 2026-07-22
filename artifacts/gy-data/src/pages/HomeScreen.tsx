import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion } from 'framer-motion';
import { Wifi, Phone, Clock, Grid, Zap, Tv, GraduationCap, Book, Trophy, Globe } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FundWalletModal from '@/components/FundWalletModal';
import ServicesModal from '@/components/ServicesModal';
import { toast } from 'sonner';

export default function HomeScreen() {
  const { user, balance, balanceHidden, toggleBalanceHidden, transactions, notifications, setActiveTab } = useAppContext();
  const [, setLocation] = useLocation();
  const [isFundWalletOpen, setIsFundWalletOpen] = useState(false);
  const [isServicesOpen, setIsServicesOpen] = useState(false);

  // Guard — this screen only renders behind the auth gate but be defensive
  if (!user) return null;

  const hour = new Date().getHours();
  let greeting = 'Good Evening';
  if (hour < 12) greeting = 'Good Morning';
  else if (hour < 18) greeting = 'Good Afternoon';

  const unreadNotifications = notifications.filter(n => !n.read).length;
  const recentTransactions = transactions.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="p-4 sm:p-6 max-w-md mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{greeting}, {user.firstName} 👋</h1>
          <p className="text-sm text-muted-foreground">Welcome back</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/notifications')}
            className="relative p-2 bg-card rounded-full border border-border"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full border border-background" />
            )}
          </button>
          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
            {user.firstName[0]}{user.name.split(' ')[1]?.[0] ?? ''}
          </div>
        </div>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] border-none shadow-xl mb-6 overflow-hidden relative">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-100/80 font-medium">Wallet Balance</span>
            <button onClick={toggleBalanceHidden} className="text-white/80 hover:text-white transition-colors">
              {balanceHidden ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                  <line x1="2" x2="22" y1="2" y2="22"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {balanceHidden ? '₦ ••••••' : `₦ ${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
            </h2>
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-white text-[#1B3A6B] hover:bg-white/90 rounded-full font-semibold"
              onClick={() => setIsFundWalletOpen(true)}
            >
              + Fund Wallet
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-white/30 text-white hover:bg-white/10 rounded-full bg-transparent font-semibold"
              onClick={() => toast.info('Withdraw feature coming soon!')}
            >
              Withdraw
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2 mb-8">
        <QuickAction icon={<Wifi className="w-6 h-6" />} label="Data" onClick={() => setLocation('/data')} />
        <QuickAction icon={<Phone className="w-6 h-6" />} label="Airtime" onClick={() => setLocation('/airtime')} />
        <QuickAction icon={<Clock className="w-6 h-6" />} label="History" onClick={() => setActiveTab('history')} />
        <QuickAction icon={<Grid className="w-6 h-6" />} label="More" onClick={() => setIsServicesOpen(true)} />
      </div>

      {/* Quick Services Grid */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">Quick Services</h3>
          <button
            onClick={() => setIsServicesOpen(true)}
            className="text-primary text-sm font-medium"
          >
            See All
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          <ServiceItem icon={<Zap className="w-5 h-5 text-orange-400" />} label="Electricity" onClick={() => toast.info('Electricity payment coming soon!')} />
          <ServiceItem icon={<Tv className="w-5 h-5 text-purple-400" />} label="Cable TV" onClick={() => toast.info('Cable TV subscription coming soon!')} />
          <ServiceItem icon={<GraduationCap className="w-5 h-5 text-yellow-400" />} label="WAEC" onClick={() => toast.info('WAEC PIN purchase coming soon!')} />
          <ServiceItem icon={<Book className="w-5 h-5 text-green-400" />} label="JAMB" onClick={() => toast.info('JAMB PIN purchase coming soon!')} />
          <ServiceItem icon={<Trophy className="w-5 h-5 text-red-400" />} label="Betting" onClick={() => toast.info('Betting wallet funding coming soon!')} />
          <ServiceItem icon={<Wifi className="w-5 h-5 text-cyan-400" />} label="Smile" onClick={() => setLocation('/data')} />
          <ServiceItem icon={<Globe className="w-5 h-5 text-blue-400" />} label="Internet" onClick={() => toast.info('Internet subscription coming soon!')} />
          <ServiceItem icon={<Grid className="w-5 h-5 text-gray-400" />} label="More" onClick={() => setIsServicesOpen(true)} />
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">Recent Transactions</h3>
          <button
            className="text-primary text-sm font-medium"
            onClick={() => setActiveTab('history')}
          >
            See All
          </button>
        </div>
        <div className="space-y-3">
          {recentTransactions.map(txn => (
            <div key={txn.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getTxnColor(txn.type)}`}>
                  {getTxnIcon(txn.type)}
                </div>
                <div>
                  <p className="font-medium text-sm">{txn.service} • {txn.provider}</p>
                  <p className="text-xs text-muted-foreground">{txn.date}, {txn.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-sm ${txn.type === 'wallet_fund' ? 'text-primary' : ''}`}>
                  {txn.type === 'wallet_fund' ? '+' : '-'}₦{txn.amount.toLocaleString()}
                </p>
                <p className={`text-[10px] uppercase font-bold tracking-wider mt-0.5 ${
                  txn.status === 'success' ? 'text-green-500' :
                  txn.status === 'pending' ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {txn.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <FundWalletModal open={isFundWalletOpen} onOpenChange={setIsFundWalletOpen} />
      <ServicesModal open={isServicesOpen} onOpenChange={setIsServicesOpen} />
    </motion.div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
      <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center text-primary group-hover:bg-card/80 transition-colors">
        {icon}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function ServiceItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-card active:scale-95 transition-all"
    >
      <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center">
        {icon}
      </div>
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

function getTxnColor(type: string) {
  switch (type) {
    case 'data': return 'bg-blue-500/10 text-blue-500';
    case 'airtime': return 'bg-orange-500/10 text-orange-500';
    case 'electricity': return 'bg-yellow-500/10 text-yellow-500';
    case 'cable': return 'bg-purple-500/10 text-purple-500';
    case 'wallet_fund': return 'bg-primary/10 text-primary';
    default: return 'bg-gray-500/10 text-gray-500';
  }
}

function getTxnIcon(type: string) {
  switch (type) {
    case 'data': return <Wifi className="w-5 h-5" />;
    case 'airtime': return <Phone className="w-5 h-5" />;
    case 'electricity': return <Zap className="w-5 h-5" />;
    case 'cable': return <Tv className="w-5 h-5" />;
    case 'wallet_fund': return <span className="text-base font-bold">₦</span>;
    default: return <Grid className="w-5 h-5" />;
  }
}
