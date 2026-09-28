import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Wallet,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Activity,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

import {
  useAdminContext,
} from '../context/AdminContext';

import {
  StatusBadge,
} from './AdminDashboard';

import {
  fmtNaira,
  fmtNairaFull,
} from '../utils/format';

import {
  apiGetFinancialReport,
} from '../utils/adminApi';

interface FinancialData {
  totalRevenue: number;
  totalFunding: number;
  totalWithdrawals: number;
  netProfit: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
}

interface SmeApiBalanceData {
  balance: number;
}

function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] rounded-lg ${
        className ?? ''
      }`}
    />
  );
}

function safeNumber(
  value: unknown,
): number {
  const number =
    Number(value ?? 0);

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}

function money(
  value: unknown,
): string {
  return fmtNaira(
    safeNumber(value),
  );
}

export default function AdminWallet() {
  const {
    transactions,
    stats,
    statsLoading,
    refreshStats,
    isSuperAdmin,
  } = useAdminContext();

  const [
    financial,
    setFinancial,
  ] =
    useState<FinancialData | null>(
      null,
    );

  const [
    financialLoading,
    setFinancialLoading,
  ] = useState(true);

  const [
    financialError,
    setFinancialError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    smeApiBalance,
    setSmeApiBalance,
  ] =
    useState<number | null>(
      null,
    );

  const [
    smeLoading,
    setSmeLoading,
  ] = useState(true);

  const [
    smeError,
    setSmeError,
  ] =
    useState<string | null>(
      null,
    );

  const loadFinancial =
    useCallback(
      async () => {
        setFinancialLoading(
          true,
        );

        setFinancialError(
          null,
        );

        try {
          const result =
            await apiGetFinancialReport();

          setFinancial({
            totalRevenue:
              safeNumber(
                result.totalRevenue,
              ),

            totalFunding:
              safeNumber(
                result.totalFunding,
              ),

            totalWithdrawals:
              safeNumber(
                result.totalWithdrawals,
              ),

            netProfit:
              safeNumber(
                result.netProfit,
              ),

            totalTransactions:
              safeNumber(
                result.totalTransactions,
              ),

            successfulTransactions:
              safeNumber(
                result.successfulTransactions,
              ),

            failedTransactions:
              safeNumber(
                result.failedTransactions,
              ),

            pendingTransactions:
              safeNumber(
                result.pendingTransactions,
              ),
          });
        } catch (
          error
        ) {
          setFinancialError(
            error instanceof
              Error
              ? error.message
              : 'Failed to load financial data.',
          );
        } finally {
          setFinancialLoading(
            false,
          );
        }
      },
      [],
    );

  const loadSmeApiBalance =
    useCallback(
      async () => {
        if (
          !isSuperAdmin
        ) {
          setSmeLoading(
            false,
          );

          return;
        }

        setSmeLoading(
          true,
        );

        setSmeError(
          null,
        );

        try {
          const response =
            await fetch(
              '/api/admin/smeapi/wallet',
              {
                method: 'GET',

                credentials:
                  'include',

                headers: {
                  Accept:
                    'application/json',
                },
              },
            );

          const result =
            (await response
              .json()
              .catch(
                () => ({}),
              )) as {
              ok?: boolean;
              balance?: number;
              error?: string;
            };

          if (
            !response.ok ||
            result.ok === false
          ) {
            throw new Error(
              result.error ??
                'Unable to load SME API balance.',
            );
          }

          const balance =
            safeNumber(
              result.balance,
            );

          setSmeApiBalance(
            balance,
          );
        } catch (
          error
        ) {
          setSmeApiBalance(
            null,
          );

          setSmeError(
            error instanceof
              Error
              ? error.message
              : 'Unable to load SME API balance.',
          );
        } finally {
          setSmeLoading(
            false,
          );
        }
      },
      [
        isSuperAdmin,
      ],
    );

  useEffect(() => {
    void loadFinancial();
    void loadSmeApiBalance();
  }, [
    loadFinancial,
    loadSmeApiBalance,
  ]);

  const handleRefresh =
    async () => {
      await Promise.allSettled([
        refreshStats(),
        loadFinancial(),
        loadSmeApiBalance(),
      ]);
    };

  const fundingTxns =
    Array.isArray(
      transactions,
    )
      ? transactions
          .filter(
            transaction =>
              transaction.type ===
              'wallet_fund',
          )
          .slice(
            0,
            20,
          )
      : [];

  const totalUserWalletBalance =
    safeNumber(
      stats?.totalWalletBalance,
    );

  const totalSmeApiBalance =
    safeNumber(
      smeApiBalance,
    );

  const remainingCreditBalance =
    Math.max(
      0,
      Math.round(
        (
          totalSmeApiBalance -
          totalUserWalletBalance
        ) * 100,
      ) / 100,
    );

  const overAllocated =
    Math.max(
      0,
      Math.round(
        (
          totalUserWalletBalance -
          totalSmeApiBalance
        ) * 100,
      ) / 100,
    );

  const revenueRows =
    financial
      ? [
          {
            label: 'Today',
            amount:
              safeNumber(
                stats?.todayRevenue,
              ),
            color:
              'text-blue-400',
            bg:
              'bg-blue-400',
          },

          {
            label: 'This Week',
            amount:
              safeNumber(
                stats?.weekRevenue,
              ),
            color:
              'text-green-400',
            bg:
              'bg-green-400',
          },

          {
            label: 'This Month',
            amount:
              safeNumber(
                stats?.monthRevenue,
              ),
            color:
              'text-purple-400',
            bg:
              'bg-purple-400',
          },

          {
            label: 'All Time',
            amount:
              financial.totalRevenue,
            color:
              'text-amber-400',
            bg:
              'bg-amber-400',
          },
        ]
      : [];

  const isLoading =
    statsLoading ||
    financialLoading;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">

      {/* HEADER */}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">
            Wallet Overview
          </h1>

          <p className="text-sm text-muted-foreground mt-0.5">
            Live wallet, funding, spending and
            provider balance overview
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void handleRefresh()
          }
          disabled={
            statsLoading ||
            financialLoading ||
            smeLoading
          }
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              statsLoading ||
              financialLoading ||
              smeLoading
                ? 'animate-spin'
                : ''
            }`}
          />
        </button>
      </div>

      {/* SUPER ADMIN SME API BALANCE */}

      {isSuperAdmin && (
        <div className="rounded-2xl border border-amber-500/20 bg-[#0B1B35] p-4">

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />

                <h2 className="font-bold text-sm">
                  SME API Credit Control
                </h2>

                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                  LIVE
                </span>
              </div>

              <p className="text-[10px] text-white/35 mt-1">
                Live SME API balance compared
                with total customer wallet balances
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadSmeApiBalance()
              }
              disabled={
                smeLoading
              }
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white disabled:opacity-40"
            >
              <RefreshCw
                className={`w-3 h-3 ${
                  smeLoading
                    ? 'animate-spin'
                    : ''
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* SME API */}

            <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-green-400" />

                <p className="text-[10px] text-white/40 uppercase tracking-wider">
                  Total SME API Balance
                </p>
              </div>

              <p className="text-xl font-bold text-white">
                {smeLoading
                  ? '—'
                  : smeApiBalance !==
                      null
                    ? money(
                        smeApiBalance,
                      )
                    : 'Unavailable'}
              </p>
            </div>

            {/* CUSTOMER WALLETS */}

            <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-blue-400" />

                <p className="text-[10px] text-white/40 uppercase tracking-wider">
                  Customer Wallets
                </p>
              </div>

              <p className="text-xl font-bold text-white">
                {statsLoading
                  ? '—'
                  : money(
                      totalUserWalletBalance,
                    )}
              </p>
            </div>

            {/* REMAINING */}

            <div
              className={`rounded-xl p-3 border ${
                overAllocated >
                0
                  ? 'border-red-500/20 bg-red-500/[0.05]'
                  : 'border-amber-500/20 bg-amber-500/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {overAllocated >
                0 ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                )}

                <p className="text-[10px] text-white/40 uppercase tracking-wider">
                  Remaining Credit
                </p>
              </div>

              <p
                className={`text-xl font-bold ${
                  overAllocated >
                  0
                    ? 'text-red-400'
                    : 'text-amber-300'
                }`}
              >
                {smeLoading ||
                statsLoading
                  ? '—'
                  : money(
                      remainingCreditBalance,
                    )}
              </p>
            </div>
          </div>

          {overAllocated >
            0 && (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
              <p className="text-[10px] text-red-300">
                Customer wallet balances currently
                exceed the live SME API balance by{' '}
                {money(
                  overAllocated,
                )}
                . New customer credits should be
                blocked until this difference is resolved.
              </p>
            </div>
          )}

          {smeError && (
            <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
              <p className="text-[10px] text-red-300/80">
                {smeError}
              </p>
            </div>
          )}
        </div>
      )}

      {/* TOP FINANCIAL STATS */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* WALLET */}

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <Wallet className="w-5 h-5 text-blue-400" />
          </div>

          {isLoading ? (
            <Skeleton className="h-7 w-24 mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {stats
                ? money(
                    stats.totalWalletBalance,
                  )
                : '—'}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-0.5">
            Total Wallet Balance
          </p>
        </div>

        {/* TOTAL FUNDED */}

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
            <ArrowDownCircle className="w-5 h-5 text-green-400" />
          </div>

          {isLoading ? (
            <Skeleton className="h-7 w-24 mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {financial
                ? money(
                    financial.totalFunding,
                  )
                : '—'}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-0.5">
            Total Funded
          </p>
        </div>

        {/* TOTAL SPENT */}

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
            <ArrowUpCircle className="w-5 h-5 text-red-400" />
          </div>

          {isLoading ? (
            <Skeleton className="h-7 w-24 mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {financial
                ? money(
                    financial.totalRevenue,
                  )
                : '—'}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-0.5">
            Total Spent on Services
          </p>
        </div>

        {/* PROFIT */}

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>

          {isLoading ? (
            <Skeleton className="h-7 w-24 mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {financial
                ? money(
                    financial.netProfit,
                  )
                : '—'}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-0.5">
            Net Profit
          </p>
        </div>
      </div>

      {/* REVENUE BREAKDOWN + USER WALLET SUMMARY */}

      <div className="grid lg:grid-cols-2 gap-4">

        {/* REVENUE */}

        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">
            Revenue Breakdown
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({
                length: 4,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                  >
                    <div className="flex justify-between mb-1.5">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-16" />
                    </div>

                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                ),
              )}
            </div>
          ) : revenueRows.length ===
            0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No revenue data yet.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {revenueRows.map(
                  ({
                    label,
                    amount,
                    color,
                    bg,
                  }) => {
                    const totalRevenue =
                      safeNumber(
                        financial?.totalRevenue,
                      );

                    const percentage =
                      totalRevenue >
                      0
                        ? Math.round(
                            (amount /
                              totalRevenue) *
                              100,
                          )
                        : 0;

                    return (
                      <div
                        key={label}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium">
                            {label}
                          </span>

                          <span
                            className={`text-sm font-bold ${color}`}
                          >
                            {money(
                              amount,
                            )}
                          </span>
                        </div>

                        <div className="h-1.5 bg-background rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${bg} opacity-70`}
                            style={{
                              width: `${Math.min(
                                100,
                                percentage,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">

                <div className="bg-background rounded-xl p-3 border border-border text-center">
                  <p className="text-lg font-bold">
                    {money(
                      financial?.totalTransactions
                        ? financial.totalRevenue /
                            financial.totalTransactions
                        : 0,
                    )}
                  </p>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    Avg. Service Transaction
                  </p>
                </div>

                <div className="bg-background rounded-xl p-3 border border-border text-center">
                  <p className="text-lg font-bold">
                    {stats &&
                    stats.totalUsers >
                      0
                      ? money(
                          safeNumber(
                            stats.totalWalletBalance,
                          ) /
                            stats.totalUsers,
                        )
                      : '—'}
                  </p>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    Avg. Wallet / User
                  </p>
                </div>

              </div>
            </>
          )}
        </div>

        {/* USER WALLET SUMMARY */}

        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">
            User Wallet Summary
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({
                length: 6,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center py-2.5 border-b border-border/50"
                  >
                    <Skeleton className="h-4 w-32" />

                    <Skeleton className="h-4 w-16" />
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="space-y-0">
              {[
                {
                  label:
                    'Total Users',
                  value:
                    stats?.totalUsers.toLocaleString() ??
                    '—',
                },

                {
                  label:
                    'Active Users',
                  value:
                    stats?.activeUsers.toLocaleString() ??
                    '—',
                },

                {
                  label:
                    'Suspended Users',
                  value:
                    stats?.suspendedUsers.toLocaleString() ??
                    '—',
                },

                {
                  label:
                    'KYC Verified',
                  value:
                    stats?.verifiedUsers.toLocaleString() ??
                    '—',
                },

                {
                  label:
                    'Wallet Balance',
                  value:
                    stats
                      ? fmtNairaFull(
                          stats.totalWalletBalance,
                        )
                      : '—',
                },

                {
                  label:
                    'Avg. Balance / User',
                  value:
                    stats &&
                    stats.totalUsers >
                      0
                      ? money(
                          safeNumber(
                            stats.totalWalletBalance,
                          ) /
                            stats.totalUsers,
                        )
                      : '—',
                },
              ].map(
                ({
                  label,
                  value,
                }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center py-3 border-b border-border/50 last:border-0"
                  >
                    <span className="text-sm text-muted-foreground">
                      {label}
                    </span>

                    <span className="text-sm font-semibold">
                      {value}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* FINANCIAL STATUS */}

      {financialError && (
        <div className="rounded-xl border border-red-500/15 bg-red-500/[0.04] px-4 py-3">
          <p className="text-xs text-red-300">
            Financial data:
            {' '}
            {financialError}
          </p>
        </div>
      )}

      {/* RECENT FUNDINGS */}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-bold text-sm">
              Recent Wallet Fundings
            </h2>

            <p className="text-[10px] text-muted-foreground mt-0.5">
              Real wallet funding transactions
            </p>
          </div>

          <span className="text-xs text-muted-foreground">
            {fundingTxns.length >
            0
              ? `${fundingTxns.length} most recent`
              : 'No fundings yet'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                  User
                </th>

                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">
                  Provider
                </th>

                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                  Amount
                </th>

                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                  Status
                </th>

                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">
                  Date
                </th>
              </tr>
            </thead>

            <tbody>
              {fundingTxns.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    No wallet funding
                    transactions yet.
                  </td>
                </tr>
              ) : (
                fundingTxns.map(
                  txn => (
                    <tr
                      key={
                        txn.id
                      }
                      className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {
                            txn.userName
                          }
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {txn.phone ??
                            txn.userId.slice(
                              0,
                              8,
                            )}
                        </p>
                      </td>

                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                        {
                          txn.provider
                        }
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-green-400">
                        +
                        {money(
                          txn.amount,
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <StatusBadge
                          status={
                            txn.status
                          }
                        />
                      </td>

                      <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                        {
                          txn.date
                        }
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
