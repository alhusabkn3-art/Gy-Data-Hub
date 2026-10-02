import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Users,
  ArrowLeftRight,
  TrendingUp,
  Clock,
  UserCheck,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Activity,
  Wallet,
  ChevronRight,
} from 'lucide-react';

import { toast } from 'sonner';

import {
  useAdminContext,
  adminApi,
} from '../context/AdminContext';

import { fmtNaira } from '../utils/format';

import type {
  AdminStats,
} from '../data/adminMockData';

function safeText(
  value: unknown,
  fallback = '',
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(
  value: unknown,
): number {
  const number = Number(value ?? 0);

  return Number.isFinite(number)
    ? number
    : 0;
}

function safeDate(
  value: unknown,
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    new Date(String(value));

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function getValue(
  transaction: unknown,
  ...keys: string[]
): unknown {
  if (
    !transaction ||
    typeof transaction !== 'object'
  ) {
    return undefined;
  }

  const record =
    transaction as Record<
      string,
      unknown
    >;

  for (const key of keys) {
    if (
      record[key] !== undefined &&
      record[key] !== null
    ) {
      return record[key];
    }
  }

  return undefined;
}

function getUser(
  transaction: unknown,
): string {
  return safeText(
    getValue(
      transaction,
      'userName',
      'user_name',
      'username',
      'user',
      'name',
    ),
    'Unknown User',
  );
}

function getPhone(
  transaction: unknown,
): string {
  return safeText(
    getValue(
      transaction,
      'phone',
      'userPhone',
      'user_phone',
    ),
    '—',
  );
}

function getAmount(
  transaction: unknown,
): number {
  return safeNumber(
    getValue(
      transaction,
      'amount',
      'totalAmount',
      'total_amount',
    ),
  );
}

function getStatus(
  transaction: unknown,
): string {
  return safeText(
    getValue(
      transaction,
      'status',
    ),
    'pending',
  ).toLowerCase();
}

function getService(
  transaction: unknown,
): string {
  return safeText(
    getValue(
      transaction,
      'service',
      'serviceName',
      'service_name',
      'type',
    ),
    'Transaction',
  );
}

function getReference(
  transaction: unknown,
): string {
  return safeText(
    getValue(
      transaction,
      'reference',
      'transactionReference',
      'transaction_reference',
      'id',
    ),
    '—',
  );
}

function getDate(
  transaction: unknown,
): string {
  const date =
    safeDate(
      getValue(
        transaction,
        'createdAt',
        'created_at',
        'date',
      ),
    );

  if (!date) {
    return '—';
  }

  return date.toLocaleString(
    'en-NG',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

function getStatusClass(
  status: string,
): string {
  switch (
    safeText(
      status,
      'pending',
    ).toLowerCase()
  ) {
    case 'success':
      return 'bg-green-500/10 text-green-400 border-green-500/20';

    case 'failed':
      return 'bg-red-500/10 text-red-400 border-red-500/20';

    case 'pending':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';

    default:
      return 'bg-white/5 text-white/60 border-white/10';
  }
}

export function StatusBadge({
  status,
}: {
  status: string;
}) {
  const value =
    safeText(
      status,
      'pending',
    ).toLowerCase();

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold uppercase ${getStatusClass(
        value,
      )}`}
    >
      {value === 'success' && (
        <CheckCircle className="w-3 h-3" />
      )}

      {value === 'failed' && (
        <XCircle className="w-3 h-3" />
      )}

      {value === 'pending' && (
        <Clock className="w-3 h-3" />
      )}

      {value}
    </span>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/45">
            {title}
          </p>

          {loading ? (
            <div className="mt-3 h-7 w-24 bg-white/5 rounded-lg animate-pulse" />
          ) : (
            <p className="mt-2 text-xl font-bold text-white truncate">
              {value}
            </p>
          )}

          {subtitle && (
            <p className="mt-1 text-[10px] text-white/30">
              {subtitle}
            </p>
          )}
        </div>

        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}

function normalizeStats(
  value: AdminStats | null,
): AdminStats {
  const source =
    value ??
    ({} as AdminStats);

  return {
    totalUsers:
      safeNumber(
        source.totalUsers,
      ),

    activeUsers:
      safeNumber(
        source.activeUsers,
      ),

    suspendedUsers:
      safeNumber(
        source.suspendedUsers,
      ),

    verifiedUsers:
      safeNumber(
        source.verifiedUsers,
      ),

    pendingKycUsers:
      safeNumber(
        source.pendingKycUsers,
      ),

    unverifiedUsers:
      safeNumber(
        source.unverifiedUsers,
      ),

    totalTransactions:
      safeNumber(
        source.totalTransactions,
      ),

    successfulTransactions:
      safeNumber(
        source.successfulTransactions,
      ),

    pendingTransactions:
      safeNumber(
        source.pendingTransactions,
      ),

    failedTransactions:
      safeNumber(
        source.failedTransactions,
      ),

    totalRevenue:
      safeNumber(
        source.totalRevenue,
      ),

    todayRevenue:
      safeNumber(
        source.todayRevenue,
      ),

    weekRevenue:
      safeNumber(
        source.weekRevenue,
      ),

    monthRevenue:
      safeNumber(
        source.monthRevenue,
      ),

    totalWalletBalance:
      safeNumber(
        source.totalWalletBalance,
      ),

    avgTransactionValue:
      safeNumber(
        source.avgTransactionValue,
      ),
  };
}

async function readResponse(
  response: Response,
): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchAllTransactions(): Promise<
  unknown[]
> {
  const firstResponse =
    await adminApi(
      '/api/admin/transactions?page=1&limit=100',
    );

  if (!firstResponse.ok) {
    throw new Error(
      'Failed to load transactions.',
    );
  }

  const first =
    await readResponse(
      firstResponse,
    );

  const firstRows =
    Array.isArray(
      first?.transactions,
    )
      ? first.transactions
      : [];

  const totalPages =
    Math.max(
      1,
      Number(
        first?.totalPages ?? 1,
      ),
    );

  if (totalPages <= 1) {
    return firstRows;
  }

  const allRows = [
    ...firstRows,
  ];

  const pageNumbers =
    Array.from(
      {
        length:
          totalPages - 1,
      },
      (_, index) =>
        index + 2,
    );

  const batchSize = 6;

  for (
    let start = 0;
    start <
    pageNumbers.length;
    start += batchSize
  ) {
    const batch =
      pageNumbers.slice(
        start,
        start + batchSize,
      );

    const responses =
      await Promise.all(
        batch.map(
          (page) =>
            adminApi(
              `/api/admin/transactions?page=${page}&limit=100`,
            ),
        ),
      );

    for (
      const response of responses
    ) {
      if (!response.ok) {
        continue;
      }

      const data =
        await readResponse(
          response,
        );

      if (
        Array.isArray(
          data?.transactions,
        )
      ) {
        allRows.push(
          ...data.transactions,
        );
      }
    }
  }

  return allRows;
}

export default function AdminDashboard({
  onNavigate,
}: {
  onNavigate?: (
    page: string,
  ) => void;
}) {
  const {
    stats,
    statsLoading,
    weeklyRevenue,
    revenueLoading,
    servicesData,
    servicesLoading,
    refreshStats,
    fetchWeeklyRevenue,
    fetchServices,
  } = useAdminContext();

  const [
    dashboardTransactions,
    setDashboardTransactions,
  ] = useState<
    unknown[]
  >([]);

  const [
    transactionsLoading,
    setTransactionsLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const safeStats =
    useMemo(
      () =>
        normalizeStats(stats),
      [stats],
    );

  const maxRevenue =
    useMemo(() => {
      if (
        !Array.isArray(
          weeklyRevenue,
        )
      ) {
        return 1;
      }

      const values =
        weeklyRevenue.map(
          (item) =>
            safeNumber(
              (
                item as unknown as Record<
                  string,
                  unknown
                >
              ).amount ??
                (
                  item as unknown as Record<
                    string,
                    unknown
                  >
                ).revenue,
            ),
        );

      return Math.max(
        1,
        ...values,
      );
    }, [weeklyRevenue]);

  const serviceSummary =
    useMemo(() => {
      let total = 0;
      let successful = 0;
      let revenue = 0;

      for (
        const item of
          servicesData ?? []
      ) {
        total += safeNumber(
          (
            item as any
          ).total,
        );

        successful +=
          safeNumber(
            (
              item as any
            ).successful,
          );

        revenue +=
          safeNumber(
            (
              item as any
            ).revenue,
          );
      }

      return {
        total,
        successful,
        revenue,
      };
    }, [servicesData]);

  async function loadDashboardTransactions() {
    setTransactionsLoading(
      true,
    );

    try {
      const rows =
        await fetchAllTransactions();

      setDashboardTransactions(
        rows,
      );
    } catch {
      setDashboardTransactions(
        [],
      );

      toast.error(
        'Failed to load transactions.',
      );
    } finally {
      setTransactionsLoading(
        false,
      );
    }
  }

  async function refreshDashboard() {
    setRefreshing(true);

    try {
      await Promise.all([
        refreshStats(),
        fetchWeeklyRevenue(),
        fetchServices(),
        loadDashboardTransactions(),
      ]);

      toast.success(
        'Dashboard refreshed',
      );
    } catch {
      toast.error(
        'Failed to refresh dashboard',
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      refreshStats(),
      fetchWeeklyRevenue(),
      fetchServices(),
      loadDashboardTransactions(),
    ]);

    // Intentionally run only once when dashboard mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-white font-semibold text-lg">
              Super Admin Dashboard
            </h1>

            <p className="text-sm text-white/40 mt-1">
              Complete overview of users,
              transactions, revenue and services.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void refreshDashboard()
            }
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                refreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />

            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={safeStats.totalUsers.toLocaleString(
              'en-NG',
            )}
            icon={Users}
            subtitle={`${safeStats.activeUsers.toLocaleString(
              'en-NG',
            )} active`}
            loading={statsLoading}
          />

          <StatCard
            title="Total Transactions"
            value={safeStats.totalTransactions.toLocaleString(
              'en-NG',
            )}
            icon={ArrowLeftRight}
            subtitle={`${safeStats.successfulTransactions.toLocaleString(
              'en-NG',
            )} successful`}
            loading={statsLoading}
          />

          <StatCard
            title="Total Revenue"
            value={fmtNaira(
              safeStats.totalRevenue,
            )}
            icon={TrendingUp}
            subtitle={`Today ${fmtNaira(
              safeStats.todayRevenue,
            )}`}
            loading={statsLoading}
          />

          <StatCard
            title="Wallet Balance"
            value={fmtNaira(
              safeStats.totalWalletBalance,
            )}
            icon={Wallet}
            subtitle={`Avg txn ${fmtNaira(
              safeStats.avgTransactionValue,
            )}`}
            loading={statsLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-semibold">
                  Weekly Revenue
                </h2>

                <p className="text-xs text-white/35 mt-1">
                  Revenue for the current reporting period
                </p>
              </div>

              <TrendingUp className="w-5 h-5 text-primary" />
            </div>

            {revenueLoading ? (
              <div className="h-52 flex items-end gap-3">
                {Array.from({
                  length: 7,
                }).map((_, index) => (
                  <div
                    key={index}
                    className="flex-1 bg-white/5 rounded-t-xl animate-pulse"
                    style={{
                      height: `${
                        30 +
                        index * 7
                      }%`,
                    }}
                  />
                ))}
              </div>
            ) : weeklyRevenue.length ===
              0 ? (
              <div className="h-52 flex items-center justify-center text-white/30 text-sm">
                No revenue data available.
              </div>
            ) : (
              <div className="h-52 flex items-end gap-3">
                {weeklyRevenue.map(
                  (
                    item,
                    index,
                  ) => {
                    const record =
                      item as unknown as Record<
                        string,
                        unknown
                      >;

                    const amount =
                      safeNumber(
                        record.amount ??
                          record.revenue ??
                          record.total,
                      );

                    const day =
                      safeText(
                        record.day ??
                          record.date,
                        `Day ${
                          index + 1
                        }`,
                      );

                    const height =
                      Math.max(
                        4,
                        (amount /
                          maxRevenue) *
                          100,
                      );

                    return (
                      <div
                        key={`${day}-${index}`}
                        className="flex-1 h-full flex flex-col justify-end items-center gap-2 min-w-0"
                      >
                        <div className="w-full flex items-end justify-center h-full">
                          <div
                            className="w-full max-w-12 bg-primary/70 rounded-t-lg min-h-1"
                            style={{
                              height: `${height}%`,
                            }}
                            title={fmtNaira(
                              amount,
                            )}
                          />
                        </div>

                        <span className="text-[10px] text-white/35 truncate max-w-full">
                          {day}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>

          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-semibold">
                  Transaction Status
                </h2>

                <p className="text-xs text-white/35 mt-1">
                  Complete transaction summary
                </p>
              </div>

              <Activity className="w-5 h-5 text-primary" />
            </div>

            <div className="space-y-4">
              {[
                {
                  label: 'Successful',
                  value:
                    safeStats.successfulTransactions,
                  className:
                    'text-green-400',
                  bar:
                    'bg-green-500',
                },
                {
                  label: 'Pending',
                  value:
                    safeStats.pendingTransactions,
                  className:
                    'text-amber-400',
                  bar:
                    'bg-amber-500',
                },
                {
                  label: 'Failed',
                  value:
                    safeStats.failedTransactions,
                  className:
                    'text-red-400',
                  bar:
                    'bg-red-500',
                },
              ].map(
                (item) => {
                  const percentage =
                    safeStats.totalTransactions >
                    0
                      ? Math.min(
                          100,
                          (item.value /
                            safeStats.totalTransactions) *
                            100,
                        )
                      : 0;

                  return (
                    <div
                      key={item.label}
                    >
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-white/50">
                          {item.label}
                        </span>

                        <span
                          className={
                            item.className
                          }
                        >
                          {item.value.toLocaleString(
                            'en-NG',
                          )}
                        </span>
                      </div>

                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full ${item.bar} rounded-full`}
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <h2 className="text-white font-semibold">
                All Transactions
              </h2>

              <p className="text-xs text-white/35 mt-1">
                All transaction records from the database
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40">
                {dashboardTransactions.length.toLocaleString(
                  'en-NG',
                )}{' '}
                loaded
              </span>

              <ArrowLeftRight className="w-5 h-5 text-primary" />
            </div>
          </div>

          {transactionsLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({
                length: 8,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 bg-white/5 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : dashboardTransactions.length ===
            0 ? (
            <div className="py-16 text-center text-white/30 text-sm">
              No transactions found.
            </div>
          ) : (
            <div className="max-h-[650px] overflow-auto">
              <table className="w-full min-w-[900px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#0D1F3C] border-b border-white/[0.06]">
                    <th className="px-5 py-3 text-left text-[10px] uppercase text-white/35">
                      User
                    </th>

                    <th className="px-5 py-3 text-left text-[10px] uppercase text-white/35">
                      Service
                    </th>

                    <th className="px-5 py-3 text-left text-[10px] uppercase text-white/35">
                      Amount
                    </th>

                    <th className="px-5 py-3 text-left text-[10px] uppercase text-white/35">
                      Status
                    </th>

                    <th className="px-5 py-3 text-left text-[10px] uppercase text-white/35">
                      Reference
                    </th>

                    <th className="px-5 py-3 text-left text-[10px] uppercase text-white/35">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {dashboardTransactions.map(
                    (
                      transaction,
                      index,
                    ) => {
                      const id =
                        safeText(
                          getValue(
                            transaction,
                            'id',
                            'reference',
                          ),
                          String(index),
                        );

                      return (
                        <tr
                          key={`${id}-${index}`}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <UserCheck className="w-4 h-4 text-primary" />
                              </div>

                              <div className="min-w-0">
                                <p className="text-xs text-white font-medium truncate max-w-[180px]">
                                  {getUser(
                                    transaction,
                                  )}
                                </p>

                                <p className="text-[10px] text-white/30">
                                  {getPhone(
                                    transaction,
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 text-xs text-white/60">
                            {getService(
                              transaction,
                            )}
                          </td>

                          <td className="px-5 py-4 text-xs font-semibold text-white">
                            {fmtNaira(
                              getAmount(
                                transaction,
                              ),
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <StatusBadge
                              status={getStatus(
                                transaction,
                              )}
                            />
                          </td>

                          <td className="px-5 py-4 text-[10px] font-mono text-white/40 max-w-[180px] truncate">
                            {getReference(
                              transaction,
                            )}
                          </td>

                          <td className="px-5 py-4 text-[10px] text-white/35 whitespace-nowrap">
                            {getDate(
                              transaction,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <h2 className="text-white font-semibold">
                All Services
              </h2>

              <p className="text-xs text-white/35 mt-1">
                Complete service performance from all transactions
              </p>
            </div>

            <ChevronRight className="w-5 h-5 text-white/30" />
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-white/[0.06]">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4">
              <p className="text-[10px] text-white/35">
                Service Transactions
              </p>

              <p className="text-lg font-bold text-white mt-1">
                {serviceSummary.total.toLocaleString(
                  'en-NG',
                )}
              </p>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4">
              <p className="text-[10px] text-white/35">
                Successful
              </p>

              <p className="text-lg font-bold text-green-400 mt-1">
                {serviceSummary.successful.toLocaleString(
                  'en-NG',
                )}
              </p>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4">
              <p className="text-[10px] text-white/35">
                Service Revenue
              </p>

              <p className="text-lg font-bold text-white mt-1">
                {fmtNaira(
                  serviceSummary.revenue,
                )}
              </p>
            </div>
          </div>

          {servicesLoading ? (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {Array.from({
                length: 8,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 bg-white/5 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : servicesData.length ===
            0 ? (
            <div className="py-12 text-center text-white/30 text-sm">
              No service data available.
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {servicesData.map(
                (
                  service,
                  index,
                ) => {
                  const item =
                    service as unknown as Record<
                      string,
                      unknown
                    >;

                  const name =
                    safeText(
                      item.type ??
                        item.service ??
                        item.name,
                      `Service ${
                        index + 1
                      }`,
                    );

                  const total =
                    safeNumber(
                      item.total ??
                        item.count,
                    );

                  const successful =
                    safeNumber(
                      item.successful ??
                        item.successfulTransactions,
                    );

                  const pending =
                    safeNumber(
                      item.pending,
                    );

                  const failed =
                    safeNumber(
                      item.failed,
                    );

                  const revenue =
                    safeNumber(
                      item.revenue ??
                        item.amount,
                    );

                  const successRate =
                    safeNumber(
                      item.successRate,
                    );

                  return (
                    <div
                      key={`${name}-${index}`}
                      className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-white font-medium capitalize truncate">
                          {name}
                        </p>

                        <Activity className="w-4 h-4 text-primary flex-shrink-0" />
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div>
                          <p className="text-[10px] text-white/30">
                            Transactions
                          </p>

                          <p className="text-sm text-white font-semibold mt-1">
                            {total.toLocaleString(
                              'en-NG',
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-white/30">
                            Successful
                          </p>

                          <p className="text-sm text-green-400 font-semibold mt-1">
                            {successful.toLocaleString(
                              'en-NG',
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-white/30">
                            Pending
                          </p>

                          <p className="text-xs text-amber-400 font-semibold mt-1">
                            {pending.toLocaleString(
                              'en-NG',
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-white/30">
                            Failed
                          </p>

                          <p className="text-xs text-red-400 font-semibold mt-1">
                            {failed.toLocaleString(
                              'en-NG',
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-white/30">
                            Revenue
                          </p>

                          <p className="text-xs text-white font-semibold mt-1">
                            {fmtNaira(
                              revenue,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] text-white/30">
                            Success Rate
                          </p>

                          <p className="text-xs text-primary font-semibold mt-1">
                            {successRate.toFixed(
                              1,
                            )}
                            %
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>

            <div>
              <p className="text-[10px] text-white/35">
                Verified Users
              </p>

              <p className="text-lg font-bold text-white">
                {safeStats.verifiedUsers.toLocaleString(
                  'en-NG',
                )}
              </p>
            </div>
          </div>

          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>

            <div>
              <p className="text-[10px] text-white/35">
                Pending KYC
              </p>

              <p className="text-lg font-bold text-white">
                {safeStats.pendingKycUsers.toLocaleString(
                  'en-NG',
                )}
              </p>
            </div>
          </div>

          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-400" />
            </div>

            <div>
              <p className="text-[10px] text-white/35">
                Failed Transactions
              </p>

              <p className="text-lg font-bold text-white">
                {safeStats.failedTransactions.toLocaleString(
                  'en-NG',
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
