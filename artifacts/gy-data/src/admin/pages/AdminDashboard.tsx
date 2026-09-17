import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
  ChevronRight,
  Grid3X3,
  Activity,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { SERVICE_CONFIG } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import {
  adminApi,
  apiGetDashboardExtended,
  type DashboardExtended,
} from '../utils/adminApi';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse bg-white/[0.06] rounded-lg ${
        className ?? ''
      }`}
      style={style}
    />
  );
}

function toSafeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function safeDate(value: unknown): Date | null {
  if (!value) return null;

  const date = new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAmount(value: unknown): string {
  return toSafeNumber(value).toLocaleString();
}

function getWeeklyAmount(item: unknown): number {
  if (!item || typeof item !== 'object') {
    return 0;
  }

  const value = item as Record<string, unknown>;

  return toSafeNumber(
    value.amount ??
      value.revenue ??
      value.total ??
      0,
  );
}

function getWeeklyDay(item: unknown): string {
  if (!item || typeof item !== 'object') {
    return '';
  }

  const value = item as Record<string, unknown>;

  const rawDay =
    value.day ??
    value.date ??
    '';

  if (!rawDay) {
    return '';
  }

  const date = safeDate(rawDay);

  if (date) {
    return date.toLocaleDateString('en-NG', {
      weekday: 'short',
    });
  }

  return String(rawDay).slice(0, 10);
}

function getTransactionValue(
  transaction: unknown,
  ...keys: string[]
): unknown {
  if (!transaction || typeof transaction !== 'object') {
    return undefined;
  }

  const value = transaction as Record<string, unknown>;

  for (const key of keys) {
    if (
      value[key] !== undefined &&
      value[key] !== null
    ) {
      return value[key];
    }
  }

  return undefined;
}

function getTransactionAmount(transaction: unknown): number {
  return toSafeNumber(
    getTransactionValue(
      transaction,
      'amount',
      'totalAmount',
      'total_amount',
    ),
  );
}

function getTransactionUser(transaction: unknown): string {
  const value = getTransactionValue(
    transaction,
    'userName',
    'user_name',
    'name',
  );

  if (value) {
    return String(value);
  }

  return 'User';
}

function getTransactionService(transaction: unknown): string {
  const value = getTransactionValue(
    transaction,
    'service',
    'serviceName',
    'service_name',
    'type',
  );

  if (value) {
    return String(value);
  }

  return 'Transaction';
}

function getTransactionProvider(transaction: unknown): string {
  const value = getTransactionValue(
    transaction,
    'provider',
    'network',
    'operator',
  );

  return value ? String(value) : '';
}

function getTransactionStatus(transaction: unknown): string {
  const value = getTransactionValue(
    transaction,
    'status',
  );

  return value ? String(value) : 'pending';
}

function getTransactionTime(transaction: unknown): string {
  const value = getTransactionValue(
    transaction,
    'time',
    'createdAt',
    'created_at',
    'date',
  );

  if (!value) {
    return '';
  }

  const date = safeDate(value);

  if (date) {
    return date.toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return String(value);
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  loading,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: {
    bg: string;
    icon: string;
    border: string;
    bar: string;
  };
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3 text-left w-full transition-all duration-200 border ${
        onClick
          ? 'cursor-pointer hover:translate-y-[-1px] hover:shadow-lg active:scale-[0.99]'
          : 'cursor-default'
      }`}
      style={{
        background:
          'linear-gradient(135deg, #0B1B35 0%, #0D1F3C 100%)',
        borderColor: accent.border,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
        style={{ background: accent.bar }}
      />

      <div className="flex items-start justify-between gap-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent.bg }}
        >
          <Icon
            className="w-5 h-5"
            style={{ color: accent.icon }}
          />
        </div>

        {onClick && (
          <ChevronRight className="w-4 h-4 text-white/20 mt-1 flex-shrink-0" />
        )}
      </div>

      {loading ? (
        <div>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {value}
          </p>

          <p className="text-xs text-white/40 mt-0.5">
            {label}
          </p>

          {sub && (
            <p
              className="text-xs mt-1.5 font-medium"
              style={{ color: accent.icon }}
            >
              {sub}
            </p>
          )}
        </div>
      )}
    </button>
  );
}

function StatusCard({
  icon: Icon,
  iconColor,
  bgColor,
  borderColor,
  value,
  label,
  loading,
  onClick,
}: {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  value: string | number | undefined;
  label: string;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-2xl border w-full text-left transition-all cursor-pointer hover:translate-y-[-1px] active:scale-[0.99]"
      style={{
        background: bgColor,
        borderColor,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        <Icon
          className="w-4 h-4"
          style={{ color: iconColor }}
        />
      </div>

      <div className="flex-1 min-w-0">
        {loading ? (
          <Skeleton className="h-5 w-12 mb-1" />
        ) : (
          <p
            className="text-lg font-bold"
            style={{ color: iconColor }}
          >
            {value ?? '—'}
          </p>
        )}

        <p className="text-xs text-white/40">
          {label}
        </p>
      </div>
    </button>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
      <p className="text-xs text-white/40 mb-2">
        {label}
      </p>

      <p
        className="text-2xl font-bold"
        style={{ color }}
      >
        {value}
      </p>

      <p className="text-xs text-white/30 mt-1">
        {sub}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  sub,
  onClick,
  children,
}: {
  title: string;
  sub?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5 ${
        onClick
          ? 'cursor-pointer hover:border-white/20 transition-colors'
          : ''
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-white">
            {title}
          </p>

          {sub && (
            <p className="text-xs text-white/40 mt-0.5">
              {sub}
            </p>
          )}
        </div>

        {onClick && (
          <ChevronRight className="w-4 h-4 text-white/20" />
        )}
      </div>

      {children}
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status:
    | 'success'
    | 'pending'
    | 'failed'
    | 'active'
    | 'suspended'
    | 'sent'
    | 'draft'
    | 'scheduled'
    | string;
}) {
  const styles: Record<
    string,
    {
      bg: string;
      text: string;
      border: string;
    }
  > = {
    success: {
      bg: 'rgba(34,197,94,0.1)',
      text: '#4ade80',
      border: 'rgba(34,197,94,0.25)',
    },

    active: {
      bg: 'rgba(34,197,94,0.1)',
      text: '#4ade80',
      border: 'rgba(34,197,94,0.25)',
    },

    sent: {
      bg: 'rgba(34,197,94,0.1)',
      text: '#4ade80',
      border: 'rgba(34,197,94,0.25)',
    },

    verified: {
      bg: 'rgba(34,197,94,0.1)',
      text: '#4ade80',
      border: 'rgba(34,197,94,0.25)',
    },

    pending: {
      bg: 'rgba(234,179,8,0.1)',
      text: '#facc15',
      border: 'rgba(234,179,8,0.25)',
    },

    scheduled: {
      bg: 'rgba(59,130,246,0.1)',
      text: '#60a5fa',
      border: 'rgba(59,130,246,0.25)',
    },

    failed: {
      bg: 'rgba(239,68,68,0.1)',
      text: '#f87171',
      border: 'rgba(239,68,68,0.25)',
    },

    suspended: {
      bg: 'rgba(239,68,68,0.1)',
      text: '#f87171',
      border: 'rgba(239,68,68,0.25)',
    },

    draft: {
      bg: 'rgba(113,113,122,0.1)',
      text: '#a1a1aa',
      border: 'rgba(113,113,122,0.25)',
    },

    unverified: {
      bg: 'rgba(113,113,122,0.1)',
      text: '#a1a1aa',
      border: 'rgba(113,113,122,0.25)',
    },
  };

  const style =
    styles[status] ?? {
      bg: 'rgba(113,113,122,0.1)',
      text: '#a1a1aa',
      border: 'rgba(113,113,122,0.25)',
    };

  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize inline-flex items-center"
      style={{
        background: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
    >
      {status}
    </span>
  );
}

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
}

export default function AdminDashboard({
  onNavigate,
}: AdminDashboardProps) {
  const {
    stats,
    statsLoading,
    refreshStats,
    transactions,
    txnsLoading,
    weeklyRevenue,
    revenueLoading,
    servicesData,
    servicesLoading,
    fetchWeeklyRevenue,
    fetchServices,
  } = useAdminContext();

  const [
    extData,
    setExtData,
  ] = useState<DashboardExtended | null>(null);

  const [smeApiBalance, setSmeApiBalance] =
    useState<number | null>(null);

  const [smeApiLoading, setSmeApiLoading] =
    useState(true);

  const [smeApiError, setSmeApiError] =
    useState<string | null>(null);

  const fetchSmeApiBalance = async () => {
    setSmeApiLoading(true);
    setSmeApiError(null);

    try {
      const response = await adminApi(
        '/api/admin/smeapi/wallet',
      );

      const data = (await response.json()) as {
        ok?: boolean;
        balance?: number | string;
        error?: string;
      };

      if (
        !response.ok ||
        data.ok === false
      ) {
        throw new Error(
          data.error ??
            'Failed to load SME API wallet balance.',
        );
      }

      const balance = Number(
        data.balance ?? 0,
      );

      if (!Number.isFinite(balance)) {
        throw new Error(
          'Invalid SME API wallet balance.',
        );
      }

      setSmeApiBalance(balance);
    } catch (err: unknown) {
      setSmeApiBalance(null);

      setSmeApiError(
        err instanceof Error
          ? err.message
          : 'Failed to load SME API wallet balance.',
      );
    } finally {
      setSmeApiLoading(false);
    }
  };

  useEffect(() => {
    void fetchSmeApiBalance();
  }, []);

  useEffect(() => {
    let mounted = true;

    apiGetDashboardExtended()
      .then((data) => {
        if (mounted) {
          setExtData(data);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to load analytics',
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const recentTxns =
    transactions.slice(0, 8);

  const isLoading =
    statsLoading;

  const normalizedWeeklyRevenue =
    weeklyRevenue.map(
      (item) => ({
        raw: item,
        day: getWeeklyDay(item),
        amount: getWeeklyAmount(item),
      }),
    );

  const maxRevenue =
    normalizedWeeklyRevenue.length > 0
      ? Math.max(
          ...normalizedWeeklyRevenue.map(
            (item) => item.amount,
          ),
          1,
        )
      : 1;

  const topServices =
    servicesData.slice(0, 5);

  const totalSvcRev =
    topServices.reduce(
      (total, service) =>
        total +
        toSafeNumber(
          service.revenue,
        ),
      0,
    );

  const handleRefresh = () => {
    void refreshStats();
    void fetchWeeklyRevenue();
    void fetchServices();
    void fetchSmeApiBalance();

    apiGetDashboardExtended()
      .then(setExtData)
      .catch(() => undefined);
  };

  const accents = {
    users: {
      bg: 'rgba(59,130,246,0.15)',
      icon: '#60a5fa',
      border: 'rgba(59,130,246,0.12)',
      bar: 'linear-gradient(90deg,#3b82f6,#60a5fa)',
    },

    txns: {
      bg: 'rgba(139,92,246,0.15)',
      icon: '#a78bfa',
      border: 'rgba(139,92,246,0.12)',
      bar: 'linear-gradient(90deg,#8b5cf6,#a78bfa)',
    },

    revenue: {
      bg: 'rgba(34,197,94,0.15)',
      icon: '#4ade80',
      border: 'rgba(34,197,94,0.12)',
      bar: 'linear-gradient(90deg,#22c55e,#4ade80)',
    },

    pending: {
      bg: 'rgba(234,179,8,0.15)',
      icon: '#facc15',
      border: 'rgba(234,179,8,0.12)',
      bar: 'linear-gradient(90deg,#eab308,#facc15)',
    },
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
            Overview
          </h1>

          <p className="text-sm text-white/40 mt-0.5">
            {new Date().toLocaleDateString(
              'en-US',
              {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              },
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 text-xs font-medium text-white/50 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-xl px-3 py-2 transition-all disabled:opacity-40"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isLoading
                ? 'animate-spin'
                : ''
            }`}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="SME API Wallet"
          value={
            smeApiLoading
              ? '—'
              : smeApiBalance !== null
                ? fmtNaira(
                    smeApiBalance,
                  )
                : 'Error'
          }
          sub={
            smeApiError
              ? 'Tap Refresh to retry'
              : 'Live provider balance'
          }
          icon={Activity}
          accent={{
            bg: 'rgba(16,185,129,0.15)',
            icon: '#34d399',
            border: 'rgba(16,185,129,0.12)',
            bar: 'linear-gradient(90deg,#10b981,#34d399)',
          }}
          loading={smeApiLoading}
        />

        <StatCard
          label="Total Users"
          value={
            stats
              ? toSafeNumber(
                  stats.totalUsers,
                ).toLocaleString()
              : '—'
          }
          sub={
            stats
              ? `${toSafeNumber(
                  stats.activeUsers,
                ).toLocaleString()} active`
              : undefined
          }
          icon={Users}
          accent={accents.users}
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('users')
          }
        />

        <StatCard
          label="Transactions"
          value={
            stats
              ? toSafeNumber(
                  stats.totalTransactions,
                ).toLocaleString()
              : '—'
          }
          sub={
            stats
              ? `${toSafeNumber(
                  stats.pendingTransactions,
                )} pending`
              : undefined
          }
          icon={ArrowLeftRight}
          accent={accents.txns}
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('transactions')
          }
        />

        <StatCard
          label="Total Revenue"
          value={
            stats
              ? fmtNaira(
                  toSafeNumber(
                    stats.totalRevenue,
                  ),
                )
              : '—'
          }
          sub={
            stats
              ? `${fmtNaira(
                  toSafeNumber(
                    stats.todayRevenue,
                  ),
                )} today`
              : undefined
          }
          icon={TrendingUp}
          accent={accents.revenue}
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('wallet')
          }
        />

        <StatCard
          label="Pending"
          value={
            stats
              ? String(
                  toSafeNumber(
                    stats.pendingTransactions,
                  ),
                )
              : '—'
          }
          sub={
            stats
              ? `${toSafeNumber(
                  stats.failedTransactions,
                )} failed`
              : undefined
          }
          icon={Clock}
          accent={accents.pending}
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('transactions')
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          icon={CheckCircle}
          iconColor="#4ade80"
          bgColor="rgba(34,197,94,0.05)"
          borderColor="rgba(34,197,94,0.15)"
          value={
            stats
              ? toSafeNumber(
                  stats.successfulTransactions,
                ).toLocaleString()
              : undefined
          }
          label="Successful"
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('transactions')
          }
        />

        <StatusCard
          icon={Clock}
          iconColor="#facc15"
          bgColor="rgba(234,179,8,0.05)"
          borderColor="rgba(234,179,8,0.15)"
          value={
            stats
              ? toSafeNumber(
                  stats.pendingTransactions,
                )
              : undefined
          }
          label="Pending"
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('transactions')
          }
        />

        <StatusCard
          icon={XCircle}
          iconColor="#f87171"
          bgColor="rgba(239,68,68,0.05)"
          borderColor="rgba(239,68,68,0.15)"
          value={
            stats
              ? toSafeNumber(
                  stats.failedTransactions,
                )
              : undefined
          }
          label="Failed"
          loading={
            isLoading && !stats
          }
          onClick={() =>
            onNavigate('transactions')
          }
        />
      </div>

      {extData && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Est. Net Profit"
              value={`₦${toSafeNumber(
                extData.netProfit,
              ).toLocaleString()}`}
              sub={`${toSafeNumber(
                extData.profitMargin,
              ).toFixed(1)}% margin`}
              color="#4ade80"
            />

            <MetricCard
              label="Active Users Today"
              value={String(
                toSafeNumber(
                  extData.activeUsersToday,
                ),
              )}
              sub="made a transaction"
              color="#60a5fa"
            />

            <MetricCard
              label="New Users This Week"
              value={String(
                toSafeNumber(
                  extData.newUsersThisWeek,
                ),
              )}
              sub="registrations"
              color="#a78bfa"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Daily Revenue"
              sub="Last 14 days"
            >
              <ResponsiveContainer
                width="100%"
                height={180}
              >
                <AreaChart
                  data={
                    extData.dailyRevenue ??
                    []
                  }
                >
                  <defs>
                    <linearGradient
                      id="revGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#3b82f6"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                  />

                  <XAxis
                    dataKey="day"
                    tick={{
                      fill: '#ffffff40',
                      fontSize: 10,
                    }}
                    tickFormatter={(
                      value,
                    ) =>
                      String(
                        value,
                      ).slice(5)
                    }
                  />

                  <YAxis
                    tick={{
                      fill: '#ffffff40',
                      fontSize: 10,
                    }}
                    tickFormatter={(
                      value: number,
                    ) =>
                      `₦${
                        value >= 1000
                          ? `${(
                              value /
                              1000
                            ).toFixed(
                              0,
                            )}k`
                          : value
                      }`
                    }
                  />

                  <Tooltip
                    contentStyle={{
                      background:
                        '#0B1B35',
                      border:
                        '1px solid rgba(255,255,255,0.1)',
                      borderRadius:
                        '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    formatter={(
                      value: unknown,
                    ) => [
                      `₦${formatAmount(
                        value,
                      )}`,
                      'Revenue',
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Monthly Revenue"
              sub="Last 6 months"
            >
              <ResponsiveContainer
                width="100%"
                height={180}
              >
                <BarChart
                  data={
                    extData.monthlyRevenue ??
                    []
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                  />

                  <XAxis
                    dataKey="month"
                    tick={{
                      fill: '#ffffff40',
                      fontSize: 10,
                    }}
                    tickFormatter={(
                      value,
                    ) =>
                      String(
                        value,
                      ).slice(0, 7)
                    }
                  />

                  <YAxis
                    tick={{
                      fill: '#ffffff40',
                      fontSize: 10,
                    }}
                    tickFormatter={(
                      value: number,
                    ) =>
                      `₦${
                        value >= 1000
                          ? `${(
                              value /
                              1000
                            ).toFixed(
                              0,
                            )}k`
                          : value
                      }`
                    }
                  />

                  <Tooltip
                    contentStyle={{
                      background:
                        '#0B1B35',
                      border:
                        '1px solid rgba(255,255,255,0.1)',
                      borderRadius:
                        '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    formatter={(
                      value: unknown,
                    ) => [
                      `₦${formatAmount(
                        value,
                      )}`,
                      'Revenue',
                    ]}
                  />

                  <Bar
                    dataKey="revenue"
                    fill="#8b5cf6"
                    radius={[
                      4,
                      4,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Weekly Revenue"
          sub="Last 7 days"
          onClick={() =>
            onNavigate('transactions')
          }
        >
          <div className="space-y-3">
            {revenueLoading ? (
              Array.from({
                length: 7,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3"
                  >
                    <Skeleton className="w-10 h-3" />
                    <Skeleton className="flex-1 h-2" />
                    <Skeleton className="w-16 h-3" />
                  </div>
                ),
              )
            ) : normalizedWeeklyRevenue.length ? (
              normalizedWeeklyRevenue.map(
                (
                  item,
                  index,
                ) => {
                  const width =
                    maxRevenue > 0
                      ? Math.max(
                          4,
                          (item.amount /
                            maxRevenue) *
                            100,
                        )
                      : 4;

                  return (
                    <div
                      key={`${item.day}-${index}`}
                      className="flex items-center gap-3"
                    >
                      <span className="text-[10px] text-white/40 w-9">
                        {item.day}
                      </span>

                      <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${width}%`,
                            background:
                              'linear-gradient(90deg,#3b82f6,#60a5fa)',
                          }}
                        />
                      </div>

                      <span className="text-[10px] text-white/60 w-20 text-right">
                        {fmtNaira(
                          item.amount,
                        )}
                      </span>
                    </div>
                  );
                },
              )
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs text-white/30">
                  No revenue data
                </p>
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Top Services"
          sub="By revenue"
          onClick={() =>
            onNavigate('services')
          }
        >
          <div className="space-y-3">
            {servicesLoading ? (
              Array.from({
                length: 5,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3"
                  >
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="w-24 h-3 mb-1" />
                      <Skeleton className="w-full h-2" />
                    </div>
                    <Skeleton className="w-16 h-3" />
                  </div>
                ),
              )
            ) : topServices.length ? (
              topServices.map(
                (
                  service,
                  index,
                ) => {
                  const revenue =
                    toSafeNumber(
                      service.revenue,
                    );

                  const percentage =
                    totalSvcRev > 0
                      ? (revenue /
                          totalSvcRev) *
                        100
                      : 0;

                  const config =
                    SERVICE_CONFIG[
                      service.service
                    ];

                  return (
                    <div
                      key={`${service.service}-${index}`}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background:
                            config?.bg ??
                            'rgba(255,255,255,0.05)',
                        }}
                      >
                        <Grid3X3
                          className="w-4 h-4"
                          style={{
                            color:
                              config?.color ??
                              '#94a3b8',
                          }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-white/70 truncate">
                            {service.service}
                          </p>

                          <span className="text-[10px] text-white/40">
                            {percentage.toFixed(
                              0,
                            )}%
                          </span>
                        </div>

                        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${percentage}%`,
                              background:
                                config?.color ??
                                '#64748b',
                            }}
                          />
                        </div>
                      </div>

                      <span className="text-[10px] text-white/60 w-20 text-right">
                        {fmtNaira(
                          revenue,
                        )}
                      </span>
                    </div>
                  );
                },
              )
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs text-white/30">
                  No service data
                </p>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Recent Transactions"
        sub="Latest activity"
        onClick={() =>
          onNavigate('transactions')
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium pb-3">
                  User
                </th>

                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium pb-3">
                  Service
                </th>

                <th className="text-left text-[10px] uppercase tracking-wider text-white/30 font-medium pb-3">
                  Provider
                </th>

                <th className="text-right text-[10px] uppercase tracking-wider text-white/30 font-medium pb-3">
                  Amount
                </th>

                <th className="text-right text-[10px] uppercase tracking-wider text-white/30 font-medium pb-3">
                  Status
                </th>

                <th className="text-right text-[10px] uppercase tracking-wider text-white/30 font-medium pb-3">
                  Time
                </th>
              </tr>
            </thead>

            <tbody>
              {txnsLoading ? (
                Array.from({
                  length: 5,
                }).map(
                  (_, index) => (
                    <tr
                      key={index}
                      className="border-b border-white/[0.04]"
                    >
                      <td className="py-3">
                        <Skeleton className="w-24 h-3" />
                      </td>

                      <td className="py-3">
                        <Skeleton className="w-20 h-3" />
                      </td>

                      <td className="py-3">
                        <Skeleton className="w-16 h-3" />
                      </td>

                      <td className="py-3">
                        <div className="flex justify-end">
                          <Skeleton className="w-16 h-3" />
                        </div>
                      </td>

                      <td className="py-3">
                        <div className="flex justify-end">
                          <Skeleton className="w-14 h-5 rounded-full" />
                        </div>
                      </td>

                      <td className="py-3">
                        <div className="flex justify-end">
                          <Skeleton className="w-12 h-3" />
                        </div>
                      </td>
                    </tr>
                  ),
                )
              ) : recentTxns.length ? (
                recentTxns.map(
                  (
                    transaction,
                    index,
                  ) => {
                    const status =
                      getTransactionStatus(
                        transaction,
                      ).toLowerCase();

                    return (
                      <tr
                        key={
                          String(
                            getTransactionValue(
                              transaction,
                              'id',
                              'reference',
                            ) ??
                              index,
                          )
                        }
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-white/[0.05] flex items-center justify-center">
                              <UserCheck className="w-3.5 h-3.5 text-white/40" />
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs text-white/70 font-medium truncate max-w-[130px]">
                                {getTransactionUser(
                                  transaction,
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3">
                          <p className="text-xs text-white/60">
                            {getTransactionService(
                              transaction,
                            )}
                          </p>
                        </td>

                        <td className="py-3">
                          <p className="text-xs text-white/40">
                            {getTransactionProvider(
                              transaction,
                            ) || '—'}
                          </p>
                        </td>

                        <td className="py-3 text-right">
                          <p className="text-xs font-medium text-white/70">
                            {fmtNaira(
                              getTransactionAmount(
                                transaction,
                              ),
                            )}
                          </p>
                        </td>

                        <td className="py-3 text-right">
                          <StatusBadge
                            status={
                              status
                            }
                          />
                        </td>

                        <td className="py-3 text-right">
                          <p className="text-[10px] text-white/30">
                            {getTransactionTime(
                              transaction,
                            )}
                          </p>
                        </td>
                      </tr>
                    );
                  },
                )
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center"
                  >
                    <div className="flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 text-white/10 mb-2" />

                      <p className="text-xs text-white/30">
                        No recent transactions
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-400" />
            </div>

            <div>
              <p className="text-sm font-semibold text-white">
                System Activity
              </p>

              <p className="text-xs text-white/30">
                Current platform status
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">
                API Server
              </span>

              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-green-400">
                  Online
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">
                Database
              </span>

              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-green-400">
                  Connected
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">
                SME API
              </span>

              <div className="flex items-center gap-2">
                {smeApiBalance !== null ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-xs text-green-400">
                      Connected
                    </span>
                  </>
                ) : smeApiLoading ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-xs text-yellow-400">
                      Checking
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="text-xs text-red-400">
                      Error
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>

            <div>
              <p className="text-sm font-semibold text-white">
                Provider Wallet
              </p>

              <p className="text-xs text-white/30">
                SME API account balance
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-white/30 mb-1">
                Current balance
              </p>

              {smeApiLoading ? (
                <Skeleton className="w-32 h-8" />
              ) : (
                <p className="text-2xl font-bold text-white">
                  {smeApiBalance !== null
                    ? fmtNaira(
                        smeApiBalance,
                      )
                    : 'Unavailable'}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                void fetchSmeApiBalance()
              }
              disabled={smeApiLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.07] disabled:opacity-40 transition-all"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  smeApiLoading
                    ? 'animate-spin'
                    : ''
                }`}
              />
              Refresh
            </button>
          </div>

          {smeApiError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/10 bg-red-500/5 px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />

              <p className="text-[10px] text-red-300/80">
                {smeApiError}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
