import React, {
  useState,
} from 'react';

import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Copy,
  Gift,
  RefreshCw,
} from 'lucide-react';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';

import {
  useAppContext,
} from '../context/AppContext';

import {
  Button,
} from '@/components/ui/button';

import {
  Card,
  CardContent,
} from '@/components/ui/card';

import FundWalletModal from '@/components/FundWalletModal';

import {
  toast,
} from 'sonner';

export default function WalletScreen() {
  const {
    user,
    balance,
    cashbackBalance,
    cashbackSettings,
    balanceHidden,
    toggleBalanceHidden,
    transactions,
    transferCashback,
    refreshCashbackWallet,
  } = useAppContext();

  const [
    isFundWalletOpen,
    setIsFundWalletOpen,
  ] = useState(false);

  const [
    activeFilter,
    setActiveFilter,
  ] = useState<
    'all' | 'credit' | 'debit'
  >('all');

  const [
    isTransferring,
    setIsTransferring,
  ] = useState(false);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  if (!user) {
    return null;
  }

  const handleCopy =
    () => {
      if (
        user.accountNumber
      ) {
        void navigator.clipboard.writeText(
          user.accountNumber,
        );

        toast.success(
          'Account number copied to clipboard',
        );
      }
    };

  const walletActivity =
    transactions.filter(
      transaction =>
        transaction.paymentMethod ===
          'Wallet' ||
        transaction.type ===
          'wallet_fund',
    );

  const filteredActivity =
    walletActivity.filter(
      transaction => {
        if (
          activeFilter ===
          'all'
        ) {
          return true;
        }

        if (
          activeFilter ===
          'credit'
        ) {
          return (
            transaction.type ===
            'wallet_fund'
          );
        }

        if (
          activeFilter ===
          'debit'
        ) {
          return (
            transaction.type !==
            'wallet_fund'
          );
        }

        return true;
      },
    );

  const totalSpent =
    walletActivity
      .filter(
        transaction =>
          transaction.type !==
            'wallet_fund' &&
          transaction.status ===
            'success',
      )
      .reduce(
        (
          total,
          transaction,
        ) =>
          total +
          Number(
            transaction.amount ??
              0,
          ),
        0,
      );

  const totalReceived =
    walletActivity
      .filter(
        transaction =>
          transaction.type ===
            'wallet_fund' &&
          transaction.status ===
            'success',
      )
      .reduce(
        (
          total,
          transaction,
        ) =>
          total +
          Number(
            transaction.amount ??
              0,
          ),
        0,
      );

  const minTransfer =
    Number(
      cashbackSettings?.minTransferAmount ??
        100,
    );

  const canTransfer =
    Boolean(
      cashbackSettings?.enabled &&
        cashbackSettings?.transferMode ===
          'manual' &&
        cashbackBalance >=
          minTransfer,
    );

  const isAutoTransfer =
    cashbackSettings?.transferMode ===
    'auto';

  const handleTransfer =
    async () => {
      if (
        !canTransfer ||
        isTransferring
      ) {
        return;
      }

      const amountToTransfer =
        cashbackBalance;

      setIsTransferring(true);

      try {
        const result =
          await transferCashback(
            amountToTransfer,
          );

        if (result.ok) {
          toast.success(
            `₦${amountToTransfer.toLocaleString(
              'en-NG',
            )} transferred to main wallet!`,
          );
        } else {
          toast.error(
            result.error ??
              'Transfer failed',
          );
        }
      } finally {
        setIsTransferring(
          false,
        );
      }
    };

  const handleRefreshCashback =
    async () => {
      setIsRefreshing(true);

      try {
        await refreshCashbackWallet();

        toast.success(
          'Cashback balance refreshed',
        );
      } finally {
        setIsRefreshing(
          false,
        );
      }
    };

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: 20,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: -20,
      }}
      className="mx-auto min-h-screen max-w-md p-4 sm:p-6"
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          My Wallet
        </h1>
      </div>

      {/* MAIN WALLET */}

      <Card className="relative mb-4 overflow-hidden border-none bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] shadow-lg">
        <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-2xl" />

        <CardContent className="relative z-10 p-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-100/80">
              Main Wallet
            </span>

            <button
              onClick={
                toggleBalanceHidden
              }
              className="text-white/80 transition-colors hover:text-white"
              aria-label="Toggle balance visibility"
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

          <div className="mb-6">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              {balanceHidden
                ? '••••••'
                : `₦ ${balance.toLocaleString(
                    'en-NG',
                    {
                      minimumFractionDigits: 2,
                    },
                  )}`}
            </h2>
          </div>

          <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
            <div>
              <p className="mb-0.5 text-xs text-white/70">
                Account Number •{' '}
                {user.bankName ??
                  'Wallet'}
              </p>

              <p className="font-mono text-sm font-medium tracking-wider text-white">
                {user.accountNumber ??
                  'Not assigned'}
              </p>
            </div>

            <button
              onClick={
                handleCopy
              }
              disabled={
                !user.accountNumber
              }
              className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          <Button
            className="h-12 w-full rounded-xl bg-white font-bold text-[#1B3A6B] hover:bg-white/90"
            onClick={() =>
              setIsFundWalletOpen(
                true,
              )
            }
          >
            + Fund Wallet
          </Button>
        </CardContent>
      </Card>

      {/* CASHBACK WALLET */}

      <Card className="relative mb-6 overflow-hidden border border-amber-500/20 bg-gradient-to-br from-amber-900/20 to-orange-900/10">
        <div className="absolute right-0 top-0 h-24 w-24 translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/5 blur-2xl" />

        <CardContent className="relative z-10 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20">
                <Gift className="h-4 w-4 text-amber-400" />
              </div>

              <span className="text-sm font-semibold text-amber-300">
                Cashback Wallet
              </span>
            </div>

            <button
              onClick={
                handleRefreshCashback
              }
              disabled={
                isRefreshing
              }
              className="rounded-lg p-1.5 text-amber-400/60 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
              title="Refresh cashback balance"
            >
              <RefreshCw
                className={`
                  h-3.5
                  w-3.5
                  ${
                    isRefreshing
                      ? 'animate-spin'
                      : ''
                  }
                `}
              />
            </button>
          </div>

          <div className="mb-4">
            <p className="text-2xl font-bold text-amber-300">
              {balanceHidden
                ? '••••••'
                : `₦ ${cashbackBalance.toLocaleString(
                    'en-NG',
                    {
                      minimumFractionDigits: 2,
                    },
                  )}`}
            </p>

            <p className="mt-0.5 text-xs text-amber-500/70">
              Earned from eligible purchases
            </p>
          </div>

          <AnimatePresence>
            {cashbackSettings?.enabled ? (
              <motion.div
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: 1,
                }}
                className="space-y-3"
              >
                {isAutoTransfer ? (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                      <span className="text-[9px] font-bold text-amber-400">
                        A
                      </span>
                    </div>

                    <p className="text-xs text-amber-300/80">
                      Auto-transfer is active — cashback is moved to your main wallet automatically when balance reaches ₦
                      {minTransfer.toLocaleString(
                        'en-NG',
                      )}
                      .
                    </p>
                  </div>
                ) : (
                  <>
                    {cashbackBalance >
                      0 &&
                      cashbackBalance <
                        minTransfer && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                          <p className="text-xs text-amber-300/70">
                            Minimum transfer:{' '}
                            <span className="font-semibold text-amber-300">
                              ₦
                              {minTransfer.toLocaleString(
                                'en-NG',
                              )}
                            </span>
                            {' · '}
                            Need{' '}
                            <span className="font-semibold text-amber-300">
                              ₦
                              {(
                                minTransfer -
                                cashbackBalance
                              ).toLocaleString(
                                'en-NG',
                                {
                                  minimumFractionDigits: 2,
                                },
                              )}
                            </span>{' '}
                            more
                          </p>

                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all duration-500"
                              style={{
                                width: `${Math.min(
                                  (cashbackBalance /
                                    minTransfer) *
                                    100,
                                  100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                    <Button
                      className="h-10 w-full rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      disabled={
                        !canTransfer ||
                        isTransferring
                      }
                      onClick={
                        handleTransfer
                      }
                    >
                      {isTransferring ? (
                        <span className="flex items-center gap-2">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white border-t-transparent" />
                          Transferring…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <ArrowRight className="h-4 w-4" />
                          Transfer to Main Wallet
                        </span>
                      )}
                    </Button>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-500/50">
                <Gift className="h-3.5 w-3.5" />
                Cashback program is currently inactive
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* STATS */}

      <div className="mb-8 grid grid-cols-2 gap-3">
        <div className="flex flex-col justify-center rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>

            <span className="text-xs font-medium text-muted-foreground">
              Spent
            </span>
          </div>

          <p className="text-lg font-bold">
            ₦
            {totalSpent.toLocaleString(
              'en-NG',
            )}
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10 text-green-500">
              <ArrowDownLeft className="h-3.5 w-3.5" />
            </div>

            <span className="text-xs font-medium text-muted-foreground">
              Received
            </span>
          </div>

          <p className="text-lg font-bold">
            ₦
            {totalReceived.toLocaleString(
              'en-NG',
            )}
          </p>
        </div>
      </div>

      {/* ACTIVITY */}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">
            Wallet Activity
          </h3>
        </div>

        <div className="mb-4 flex w-fit gap-2 rounded-lg border border-border bg-card p-1">
          {(
            [
              [
                'all',
                'All',
              ],
              [
                'credit',
                'In',
              ],
              [
                'debit',
                'Out',
              ],
            ] as const
          ).map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setActiveFilter(
                    value,
                  )
                }
                className={`
                  rounded-md
                  px-4
                  py-1.5
                  text-xs
                  font-medium
                  transition-colors
                  ${
                    activeFilter ===
                    value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground'
                  }
                `}
              >
                {label}
              </button>
            ),
          )}
        </div>

        <div className="space-y-3 pb-6">
          {filteredActivity.length >
          0 ? (
            filteredActivity.map(
              transaction => (
                <div
                  key={
                    String(
                      transaction.id,
                    )
                  }
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                        flex
                        h-10
                        w-10
                        items-center
                        justify-center
                        rounded-full
                        ${
                          transaction.type ===
                            'wallet_fund' &&
                          transaction.service ===
                            'Cashback'
                            ? 'bg-amber-500/10 text-amber-500'
                            : transaction.type ===
                                'wallet_fund'
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-red-500/10 text-red-500'
                        }
                      `}
                    >
                      {transaction.type ===
                        'wallet_fund' &&
                      transaction.service ===
                        'Cashback' ? (
                        <Gift className="h-5 w-5" />
                      ) : transaction.type ===
                        'wallet_fund' ? (
                        <ArrowDownLeft className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        {String(
                          transaction.description ??
                            transaction.service ??
                            'Wallet activity',
                        )}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {String(
                          transaction.date ??
                            '',
                        )}
                        {transaction.time
                          ? `, ${String(
                              transaction.time,
                            )}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className={`
                        text-sm
                        font-semibold
                        ${
                          transaction.type ===
                            'wallet_fund' &&
                          transaction.service ===
                            'Cashback'
                            ? 'text-amber-500'
                            : transaction.type ===
                                'wallet_fund'
                              ? 'text-green-500'
                              : ''
                        }
                      `}
                    >
                      {transaction.type ===
                      'wallet_fund'
                        ? '+'
                        : '-'}
                      ₦
                      {Number(
                        transaction.amount ??
                          0,
                      ).toLocaleString(
                        'en-NG',
                      )}
                    </p>

                    {transaction.service ===
                      'Cashback' && (
                      <p className="text-[10px] text-amber-500/60">
                        Cashback
                      </p>
                    )}
                  </div>
                </div>
              ),
            )
          ) : (
            <div className="rounded-xl border border-border bg-card py-10 text-center">
              <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-50" />

              <p className="text-sm text-muted-foreground">
                No recent activity found
              </p>
            </div>
          )}
        </div>
      </div>

      <FundWalletModal
        open={
          isFundWalletOpen
        }
        onOpenChange={
          setIsFundWalletOpen
        }
      />
    </motion.div>
  );
}
