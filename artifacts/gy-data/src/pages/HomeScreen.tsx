import React, { useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { motion } from 'framer-motion';
import {
  Wifi,
  Phone,
  Clock,
  Grid,
  Zap,
  Tv,
  GraduationCap,
  Book,
  Trophy,
  Globe,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FundWalletModal from '@/components/FundWalletModal';
import ServicesModal from '@/components/ServicesModal';
import { toast } from 'sonner';

function getDisplayProvider(provider: string): string {
  const value = String(provider ?? '').trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

export default function HomeScreen() {
  const {
    user,
    balance,
    balanceHidden,
    toggleBalanceHidden,
    transactions,
    notifications,
    setActiveTab,
  } = useAppContext();

  const [, setLocation] = useLocation();
  const [isFundWalletOpen, setIsFundWalletOpen] = useState(false);
  const [isServicesOpen, setIsServicesOpen] = useState(false);

  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  if (!user) return null;

  const hour = new Date().getHours();

  let greeting = 'Good Evening';

  if (hour < 12) {
    greeting = 'Good Morning';
  } else if (hour < 18) {
    greeting = 'Good Afternoon';
  }

  const unreadNotifications = notifications.filter(
    (n) => !n.read,
  ).length;

  const recentTransactions = transactions.slice(0, 4);

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleWalletPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement | null;

    if (
      target?.closest(
        'button, a, input, textarea, select, [role="button"]',
      )
    ) {
      return;
    }

    longPressTriggered.current = false;
    clearLongPressTimer();

    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      setLocation('/super-admin-login');
    }, 2000);
  };

  const handleWalletPointerUp = () => {
    clearLongPressTimer();
  };

  const handleWalletPointerCancel = () => {
    clearLongPressTimer();
  };

  const handleWalletPointerLeave = () => {
    clearLongPressTimer();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="p-4 sm:p-6 max-w-md mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">
            {greeting}, @{user.username} 👋
          </h1>

          <p className="text-sm text-muted-foreground">
            Welcome back
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/notifications')}
            className="relative p-2 bg-card rounded-full border border-border"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>

            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full border border-background" />
            )}
          </button>

          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
            {user.firstName[0]}
            {user.name.split(' ')[1]?.[0] ?? ''}
          </div>
        </div>
      </div>

      <Card
        className="bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] border-none shadow-xl mb-6 overflow-hidden relative select-none"
        onPointerDown={handleWalletPointerDown}
        onPointerUp={handleWalletPointerUp}
        onPointerCancel={handleWalletPointerCancel}
        onPointerLeave={handleWalletPointerLeave}
      >
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <CardContent className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-100/80 font-medium">
              Wallet Balance
            </span>

            <button
              onClick={toggleBalanceHidden}
              className="text-white/80 hover:text-white transition-colors"
            >
              {balanceHidden ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {balanceHidden
                ? '₦ ••••••'
                : `₦ ${balance.toLocaleString('en-NG', {
                    minimumFractionDigits: 2,
                  })}`}
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
              onClick={() =>
                toast.info('Withdraw feature coming soon!')
              }
            >
              Withdraw
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <button
          onClick={() => setActiveTab('data')}
          className="flex flex-col items-center justify-center gap-2 p-3 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Wifi className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium">Data</span>
        </button>

        <button
          onClick={() => setActiveTab('airtime')}
          className="flex flex-col items-center justify-center gap-2 p-3 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
            <Phone className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium">Airtime</span>
        </button>

        <button
          onClick={() => setLocation('/transactions')}
          className="flex flex-col items-center justify-center gap-2 p-3 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium">History</span>
        </button>

        <button
          onClick={() => setIsServicesOpen(true)}
          className="flex flex-col items-center justify-center gap-2 p-3 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Grid className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium">More</span>
        </button>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Quick Services</h3>
              <p className="text-xs text-muted-foreground">
                Get things done quickly
              </p>
            </div>

            <button
              onClick={() => setIsServicesOpen(true)}
              className="text-xs text-primary font-medium"
            >
              View all
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <button
              onClick={() => setActiveTab('data')}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Wifi className="w-5 h-5" />
              </div>
              <span className="text-xs">Data</span>
            </button>

            <button
              onClick={() => setActiveTab('airtime')}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400">
                <Phone className="w-5 h-5" />
              </div>
              <span className="text-xs">Airtime</span>
            </button>

            <button
              onClick={() =>
                toast.info('Betting wallet funding coming soon!')
              }
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-xs">Betting</span>
            </button>

            <button
              onClick={() =>
                toast.info('TV subscription coming soon!')
              }
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Tv className="w-5 h-5" />
              </div>
              <span className="text-xs">TV</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Education & More</h3>
              <p className="text-xs text-muted-foreground">
                Explore available services
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <button
              onClick={() =>
                toast.info('Education service coming soon!')
              }
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="text-xs">Education</span>
            </button>

            <button
              onClick={() =>
                toast.info('JAMB service coming soon!')
              }
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Book className="w-5 h-5" />
              </div>
              <span className="text-xs">JAMB</span>
            </button>

            <button
              onClick={() =>
                toast.info('Betting service coming soon!')
              }
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center text-pink-600 dark:text-pink-400">
                <Trophy className="w-5 h-5" />
              </div>
              <span className="text-xs">Betting</span>
            </button>

            <button
              onClick={() =>
                toast.info('Internet service coming soon!')
              }
              className="flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                <Globe className="w-5 h-5" />
              </div>
              <span className="text-xs">Internet</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Recent Transactions</h3>
              <p className="text-xs text-muted-foreground">
                Your latest activity
              </p>
            </div>

            <button
              onClick={() => setLocation('/transactions')}
              className="text-xs text-primary font-medium"
            >
              View all
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No transactions yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        txn.type === 'wallet_fund'
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-600'
                          : 'bg-blue-100 dark:bg-blue-900/20 text-blue-600'
                      }`}
                    >
                      {txn.type === 'wallet_fund' ? (
                        <Zap className="w-4 h-4" />
                      ) : (
                        <Wifi className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        {txn.type === 'wallet_fund'
                          ? 'Wallet Funding'
                          : getDisplayProvider(
                              txn.provider ?? '',
                            )}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {new Date(
                          txn.createdAt,
                        ).toLocaleDateString('en-NG')}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        txn.type === 'wallet_fund'
                          ? 'text-green-600'
                          : 'text-foreground'
                      }`}
                    >
                      {txn.type === 'wallet_fund' ? '+' : '-'}₦
                      {Number(txn.amount).toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                      })}
                    </p>

                    <p className="text-xs text-muted-foreground capitalize">
                      {txn.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FundWalletModal
        open={isFundWalletOpen}
        onOpenChange={setIsFundWalletOpen}
      />

      <ServicesModal
        open={isServicesOpen}
        onOpenChange={setIsServicesOpen}
      />
    </motion.div>
  );
}

function getTransactionIcon(type: string) {
  switch (type) {
    case 'wallet_fund':
      return <Zap className="w-4 h-4" />;

    case 'data_purchase':
      return <Wifi className="w-4 h-4" />;

    case 'airtime_purchase':
      return <Phone className="w-4 h-4" />;

    case 'tv_subscription':
      return <Tv className="w-4 h-4" />;

    default:
      return <Grid className="w-4 h-4" />;
  }
}

function getTransactionLabel(type: string) {
  switch (type) {
    case 'wallet_fund':
      return 'Wallet Funding';

    case 'data_purchase':
      return 'Data Purchase';

    case 'airtime_purchase':
      return 'Airtime Purchase';

    case 'tv_subscription':
      return 'TV Subscription';

    default:
      return 'Transaction';
  }
}
