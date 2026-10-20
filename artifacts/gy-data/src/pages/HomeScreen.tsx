// artifacts/gy-data/src/pages/HomeScreen.tsx

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
  Award,
  Users,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FundWalletModal from '@/components/FundWalletModal';
import ServicesModal from '@/components/ServicesModal';
import { toast } from 'sonner';

function getDisplayProvider(provider: unknown): string {
  const value = String(provider ?? '').trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function getTransactionIcon(type: string) {
  switch (type) {
    case 'wallet_fund':
      return <Zap className="w-4 h-4" />;

    case 'data_purchase':
    case 'data':
      return <Wifi className="w-4 h-4" />;

    case 'airtime_purchase':
    case 'airtime':
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
    case 'data':
      return 'Data Purchase';

    case 'airtime_purchase':
    case 'airtime':
      return 'Airtime Purchase';

    case 'tv_subscription':
      return 'TV Subscription';

    default:
      return 'Transaction';
  }
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

  const [isFundWalletOpen, setIsFundWalletOpen] =
    useState(false);

  const [isServicesOpen, setIsServicesOpen] =
    useState(false);

  const longPressTimer =
    useRef<number | null>(null);

  const longPressTriggered =
    useRef(false);

  if (!user) {
    return null;
  }

  /*
   * The previous HomeScreen directly used:
   *
   *   user.firstName[0]
   *
   * firstName is optional in the frontend User type.
   * If the session response does not contain firstName,
   * that expression throws during render and the whole
   * HomeScreen becomes blank/white.
   */
  const safeName =
    String(user.name ?? '').trim();

  const safeFirstName =
    String(user.firstName ?? '').trim();

  const safeUsername =
    String(user.username ?? '').trim();

  const nameParts =
    safeName.split(/\s+/).filter(Boolean);

  const avatarFirstInitial =
    (
      safeFirstName ||
      nameParts[0] ||
      safeUsername ||
      'U'
    ).charAt(0).toUpperCase();

  const avatarSecondInitial =
    (
      nameParts[1] ||
      String(user.lastName ?? '').trim()
    ).charAt(0).toUpperCase();

  const displayUsername =
    safeUsername || 'user';

  const numericBalance =
    Number(balance);

  const safeBalance =
    Number.isFinite(numericBalance)
      ? numericBalance
      : 0;

  const hour =
    new Date().getHours();

  let greeting =
    'Good Evening';

  if (hour < 12) {
    greeting = 'Good Morning';
  } else if (hour < 18) {
    greeting = 'Good Afternoon';
  }

  const safeNotifications =
    Array.isArray(notifications)
      ? notifications
      : [];

  const unreadNotifications =
    safeNotifications.filter(
      (notification) =>
        notification &&
        notification.read !== true &&
        notification.isRead !== true,
    ).length;

  const safeTransactions =
    Array.isArray(transactions)
      ? transactions
      : [];

  const recentTransactions =
    safeTransactions.slice(0, 4);

  /*
   * IMPORTANT:
   *
   * The old HomeScreen did:
   *
   *   setActiveTab('data')
   *
   * and:
   *
   *   setActiveTab('airtime')
   *
   * while remaining on "/".
   *
   * MainApp has no "/" rendering branch for "data"
   * or "airtime", so React rendered nothing and the
   * user saw a white screen.
   *
   * Data and Airtime must navigate to their actual
   * routes.
   */
  const openData = () => {
    setLocation('/data');
  };

  const openAirtime = () => {
    setLocation('/airtime');
  };

  /*
   * TransactionHistoryScreen is rendered by the "/"
   * route when activeTab === "history".
   *
   * Therefore we intentionally return to "/" instead
   * of navigating to the old/non-existent "/transactions"
   * route.
   */
  const openHistory = () => {
    setActiveTab('history');
    setLocation('/');
  };

  const openHome = () => {
    setActiveTab('home');
    setLocation('/');
  };

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(
        longPressTimer.current,
      );

      longPressTimer.current = null;
    }
  };

  const handleWalletPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const target =
      event.target as HTMLElement | null;

    if (
      target?.closest(
        'button, a, input, textarea, select, [role="button"]',
      )
    ) {
      return;
    }

    longPressTriggered.current = false;

    clearLongPressTimer();

    longPressTimer.current =
      window.setTimeout(() => {
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
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      exit={{
        opacity: 0,
      }}
      className="p-3 sm:p-5 max-w-md mx-auto"
    >
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">
            {greeting}, @{displayUsername} 👋
          </h1>

          <p className="text-sm text-muted-foreground">
            Welcome back
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() =>
              setLocation('/notifications')
            }
            className="relative p-2 bg-card rounded-full border border-border"
            aria-label="Notifications"
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
            {avatarFirstInitial}
            {avatarSecondInitial}
          </div>
        </div>
      </div>

      {/* WALLET CARD */}
      <Card
        className="bg-[#0B1F3A] border border-[#263B56] shadow-sm mb-4 overflow-hidden relative select-none"
        onPointerDown={
          handleWalletPointerDown
        }
        onPointerUp={
          handleWalletPointerUp
        }
        onPointerCancel={
          handleWalletPointerCancel
        }
        onPointerLeave={
          handleWalletPointerLeave
        }
      >
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />

        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <CardContent className="p-4 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-300 font-medium">
              Wallet Balance
            </span>

            <button
              type="button"
              onClick={toggleBalanceHidden}
              className="text-slate-300 hover:text-white transition-colors"
              aria-label={
                balanceHidden
                  ? 'Show balance'
                  : 'Hide balance'
              }
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
                  <line
                    x1="2"
                    x2="22"
                    y1="2"
                    y2="22"
                  />
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
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                  />
                </svg>
              )}
            </button>
          </div>

          <div className="mb-4">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {balanceHidden
                ? '₦ ••••••'
                : `₦ ${safeBalance.toLocaleString(
                    'en-NG',
                    {
                      minimumFractionDigits: 2,
                    },
                  )}`}
            </h2>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              className="flex-1 bg-[#D8B638] text-[#0B1F3A] hover:bg-[#C8A72F] rounded-full font-semibold"
              onClick={() =>
                setIsFundWalletOpen(true)
              }
            >
              + Fund Wallet
            </Button>

            <Button
              type="button"
              variant="outline"
              className="flex-1 border-white/30 text-white hover:bg-white/10 rounded-full bg-transparent font-semibold"
              onClick={() =>
                toast.info(
                  'Withdraw feature coming soon!',
                )
              }
            >
              Withdraw
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SALES TRACKING */}
      <button
        type="button"
        onClick={openHistory}
        className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-[#E8EDF6] px-3 py-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.99]"
        aria-label="Open Sales Tracking and transaction history"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]">
          <Clock className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Sales Tracking</span>
          <span className="mt-0.5 block text-xs text-slate-500">Track sales and transaction status</span>
        </span>
        <span className="shrink-0 rounded-full bg-[#D8B638] px-3 py-1.5 text-xs font-semibold text-[#0B1F3A]">
          Track
        </span>
      </button>

      {/* SERVICES */}
      <section className="mb-4">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
          <span className="h-6 w-1 rounded-full bg-[#D8B638]" />
          Services
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={openData}
            className="flex min-h-[64px] items-center gap-2 rounded-xl border border-slate-200 bg-[#E8EDF6] p-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]"><Wifi className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Data</span>
          </button>

          <button
            type="button"
            onClick={openAirtime}
            className="flex min-h-[64px] items-center gap-2 rounded-xl border border-slate-200 bg-[#E8EDF6] p-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]"><Phone className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Airtime</span>
          </button>

          <button
            type="button"
            onClick={() => toast.info('Electricity service coming soon!')}
            className="flex min-h-[64px] items-center gap-2 rounded-xl border border-slate-200 bg-[#E8EDF6] p-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]"><Zap className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Electricity</span>
          </button>

          <button
            type="button"
            onClick={() => toast.info('TV subscription coming soon!')}
            className="flex min-h-[64px] items-center gap-2 rounded-xl border border-slate-200 bg-[#E8EDF6] p-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]"><Tv className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Cable TV</span>
          </button>

          <button
            type="button"
            onClick={() => toast.info('Exam PIN service coming soon!')}
            className="flex min-h-[64px] items-center gap-2 rounded-xl border border-slate-200 bg-[#E8EDF6] p-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]"><Award className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Exam PIN</span>
          </button>

          <button
            type="button"
            onClick={() => toast.info('Referrals service coming soon!')}
            className="flex min-h-[64px] items-center gap-2 rounded-xl border border-slate-200 bg-[#E8EDF6] p-2.5 text-left text-[#0B1F3A] shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]"><Users className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">Referrals</span>
          </button>
        </div>
      </section>


      {/* RECENT TRANSACTIONS */}
      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#0B1F3A]">
            <span className="h-6 w-1 rounded-full bg-[#D8B638]" />
            Recent Transactions
          </h2>
          <button
            type="button"
            onClick={openHistory}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E8EDF6]"
          >
            View all
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <button
            type="button"
            onClick={openHistory}
            className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm text-slate-500 shadow-sm"
          >
            No transactions yet. Tap to open transaction history.
          </button>
        ) : (
          <div className="space-y-1.5">
            {recentTransactions.map((txn, index) => {
              const item = txn as Record<string, unknown>;
              const type = String(item.type ?? item.serviceType ?? 'transaction');
              const amountValue = Number(item.amount ?? 0);
              const amount = Number.isFinite(amountValue)
                ? amountValue.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '0.00';
              const status = String(item.status ?? 'pending');
              const statusLower = status.toLowerCase();
              const statusClass = ['success', 'successful', 'completed'].includes(statusLower)
                ? 'bg-emerald-100 text-emerald-700'
                : ['failed', 'failure', 'rejected', 'cancelled', 'canceled'].includes(statusLower)
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700';
              const description = String(item.description ?? item.service ?? getTransactionLabel(type));
              const recipient = String(item.phone ?? item.recipientPhone ?? item.reference ?? '').trim();
              const date = String(item.date ?? item.createdAt ?? item.created_at ?? '').trim();

              return (
                <button
                  key={String(item.id ?? item.reference ?? `${type}-${index}`)}
                  type="button"
                  onClick={openHistory}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition-colors hover:bg-[#F5F7FB] active:scale-[0.99]"
                  aria-label={`Open transaction history for ${description}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A] text-[#D8B638]">
                    {getTransactionIcon(type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#0B1F3A]">{description}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {[getDisplayProvider(item.provider), recipient, date].filter(Boolean).join(' · ')}
                    </span>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClass}`}>
                      {status}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold text-[#0B1F3A]">₦{amount}</span>
                    <span className="mt-1 block text-xs text-slate-400">View <span aria-hidden="true">›</span></span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <FundWalletModal
        open={isFundWalletOpen}
        onOpenChange={
          setIsFundWalletOpen
        }
      />

      <ServicesModal
        open={isServicesOpen}
        onOpenChange={
          setIsServicesOpen
        }
      />
    </motion.div>
  );
}


