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

  const recentTxns = transactions.slice(0, 8);

  const isLoading = statsLoading;

  const normalizedWeeklyRevenue = weeklyRevenue.map(
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

  const topServices = servicesData.slice(0, 5);

  const totalSvcRev = topServices.reduce(
    (total, service) =>
      total + toSafeNumber(service.revenue),
    0,
  );

  const handleRefresh = () => {
    void refreshStats();
    void fetchWeeklyRevenue();
    void fetchServices();

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
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
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
              isLoading ? 'animate-spin' : ''
            }`}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('users')}
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('wallet')}
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
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
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
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
                    extData.dailyRevenue ?? []
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
                    tickFormatter={(value) =>
                      String(value).slice(5)
                    }
                  />

                  <YAxis
                    tick={{
                      fill: '#ffffff40',
                      fontSize: 10,
                    }}
                    tickFormatter={(value: number) =>
                      `₦${
                        value >= 1000
                          ? `${(
                              value / 1000
                            ).toFixed(0)}k`
                          : value
                      }`
                    }
                  />

                  <Tooltip
                    contentStyle={{
                      background: '#0B1B35',
                      border:
                        '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) => [
                      `₦${formatAmount(value)}`,
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
                    extData.monthlyRevenue ?? []
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
                    tickFormatter={(value) =>
                      String(value).slice(0, 7)
                    }
                  />

                  <YAxis
                    tick={{
                      fill: '#ffffff40',
                      fontSize: 10,
                    }}
                    tickFormatter={(value: number) =>
                      `₦${
                        value >= 1000
                          ? `${(
                              value / 1000
                            ).toFixed(0)}k`
                          : value
                      }`
                    }
                  />

                  <Tooltip
                    contentStyle={{
                      background: '#0B1B35',
                      border:
                        '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) => [
                      `₦${formatAmount(value)}`,
                      'Revenue',
                    ]}
                  />

                  <Bar
                    data={
                      extData.monthlyRevenue ?? []
                    }
                    dataKey="revenue"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Weekly Revenue"
          sub={
            stats
              ? `${fmtNaira(
                  toSafeNumber(
                    stats.weekRevenue,
                  ),
                )} this week`
              : undefined
          }
          onClick={() => onNavigate('wallet')}
        >
          {revenueLoading ? (
            <div className="flex items-end gap-2 h-28">
              {Array.from({ length: 7 }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <Skeleton
                      className="w-full"
                      style={{
                        height: `${
                          30 +
                          (index * 7) % 50
                        }px`,
                      }}
                    />

                    <Skeleton className="h-2 w-5" />
                  </div>
                ),
              )}
            </div>
          ) : normalizedWeeklyRevenue.length ===
            0 ? (
            <div className="h-28 flex flex-col items-center justify-center text-white/25">
              <TrendingUp className="w-8 h-8 mb-2 opacity-40" />

              <p className="text-xs">
                No data for the past 7 days
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-2 h-28">
              {normalizedWeeklyRevenue.map(
                (item, index) => {
                  const pct =
                    maxRevenue > 0
                      ? (item.amount /
                          maxRevenue) *
                        100
                      : 0;

                  return (
                    <div
                      key={`${item.day}-${index}`}
                      className="flex-1 flex flex-col items-center gap-1.5"
                    >
                      <div
                        className="w-full bg-white/[0.05] rounded-lg flex items-end overflow-hidden"
                        style={{
                          height: '88px',
                        }}
                      >
                        <div
                          className="w-full rounded-lg transition-all"
                          style={{
                            height: `${Math.max(
                              pct,
                              3,
                            )}%`,
                            background:
                              'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                            opacity: 0.85,
                          }}
                          title={`₦${item.amount.toLocaleString()}`}
                        />
                      </div>

                      <span className="text-[10px] text-white/30">
                        {item.day}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Top Services"
          onClick={() => onNavigate('services')}
        >
          {servicesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map(
                (_, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>

                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                ),
              )}
            </div>
          ) : topServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-white/25">
              <Grid3X3 className="w-8 h-8 mb-2 opacity-40" />

              <p className="text-xs">
                No service data yet
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {topServices.map((service) => {
                const config =
                  SERVICE_CONFIG[
                    service.type
                  ];

                const revenue =
                  toSafeNumber(
                    service.revenue,
                  );

                const pct =
                  totalSvcRev > 0
                    ? Math.round(
                        (revenue /
                          totalSvcRev) *
                          100,
                      )
                    : 0;

                return (
                  <div
                    key={service.type}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {config?.icon ?? '💳'}
                        </span>

                        <span className="text-sm font-medium text-white/80">
                          {config?.label ??
                            service.type}
                        </span>
                      </div>

                      <span className="text-xs text-white/40">
                        {pct}% ·{' '}
                        {fmtNaira(revenue)}
                      </span>
                    </div>

                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            config?.color ??
                            '#3B82F6',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-white/40" />

            <h2 className="font-semibold text-sm text-white">
              Recent Transactions
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              onNavigate('transactions')
            }
            className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                  User
                </th>

                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider hidden sm:table-cell">
                  Service
                </th>

                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                  Amount
                </th>

                <th className="text-center px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {txnsLoading &&
              recentTxns.length === 0 ? (
                Array.from({ length: 5 }).map(
                  (_, index) => (
                    <tr
                      key={index}
                      className="border-b border-white/[0.04]"
                    >
                      <td className="px-5 py-3.5">
                        <Skeleton className="h-4 w-28" />
                      </td>

                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <Skeleton className="h-4 w-16 ml-auto" />
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <Skeleton className="h-5 w-16 mx-auto rounded-full" />
                      </td>
                    </tr>
                  ),
                )
              ) : recentTxns.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center py-14 text-white/25 text-sm"
                  >
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />

                    No transactions yet
                  </td>
                </tr>
              ) : (
                recentTxns.map(
                  (transaction, index) => {
                    const amount =
                      getTransactionAmount(
                        transaction,
                      );

                    const user =
                      getTransactionUser(
                        transaction,
                      );

                    const service =
                      getTransactionService(
                        transaction,
                      );

                    const provider =
                      getTransactionProvider(
                        transaction,
                      );

                    const time =
                      getTransactionTime(
                        transaction,
                      );

                    const status =
                      getTransactionStatus(
                        transaction,
                      );

                    const transactionId =
                      getTransactionValue(
                        transaction,
                        'id',
                      );

                    return (
                      <tr
                        key={
                          transactionId
                            ? String(
                                transactionId,
                              )
                            : `transaction-${index}`
                        }
                        onClick={() =>
                          onNavigate(
                            'transactions',
                          )
                        }
                        className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer ${
                          index % 2 === 0
                            ? ''
                            : 'bg-white/[0.01]'
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-sm text-white/80 truncate max-w-[130px]">
                            {user}
                          </p>

                          <p className="text-[11px] text-white/30 mt-0.5">
                            {time}
                          </p>
                        </td>

                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          <p className="text-sm text-white/70">
                            {service}
                          </p>

                          <p className="text-[11px] text-white/30">
                            {provider}
                          </p>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <span className="text-sm font-bold text-white/90">
                            ₦
                            {amount.toLocaleString()}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-center">
                          <StatusBadge
                            status={status}
                          />
                        </td>
                      </tr>
                    );
                  },
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-white/40" />

            <h2 className="font-semibold text-sm text-white">
              KYC Status
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('users')}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            Manage
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: UserCheck,
              bg: 'rgba(34,197,94,0.08)',
              border:
                'rgba(34,197,94,0.2)',
              color: '#4ade80',
              label: 'Verified',
              value:
                isLoading && !stats
                  ? null
                  : stats?.verifiedUsers ??
                    '—',
            },

            {
              icon: Clock,
              bg: 'rgba(234,179,8,0.08)',
              border:
                'rgba(234,179,8,0.2)',
              color: '#facc15',
              label: 'Pending',
              value:
                isLoading && !stats
                  ? null
                  : stats?.pendingKycUsers ??
                    '—',
            },

            {
              icon: AlertCircle,
              bg: 'rgba(239,68,68,0.08)',
              border:
                'rgba(239,68,68,0.2)',
              color: '#f87171',
              label: 'Unverified',
              value:
                isLoading && !stats
                  ? null
                  : stats
                    ? toSafeNumber(
                        stats.suspendedUsers,
                      ) +
                      toSafeNumber(
                        stats.unverifiedUsers,
                      )
                    : '—',
            },
          ].map(
            ({
              icon: Icon,
              bg,
              border,
              color,
              label,
              value,
            }) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  onNavigate('users')
                }
                className="rounded-2xl p-4 text-center transition-all hover:opacity-80 active:scale-[0.97] border cursor-pointer"
                style={{
                  background: bg,
                  borderColor: border,
                }}
              >
                <div
                  className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center"
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                  }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color }}
                  />
                </div>

                {value === null ? (
                  <Skeleton className="h-6 w-10 mx-auto mb-1" />
                ) : (
                  <p
                    className="text-xl font-bold"
                    style={{ color }}
                  >
                    {value}
                  </p>
                )}

                <p className="text-xs text-white/40 mt-0.5">
                  {label}
                </p>
              </button>
            ),
          )}
        </div>
      </div>

      {extData &&
        extData.recentActivity.length >
          0 && (
          <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-white/40" />

                <h2 className="font-semibold text-sm text-white">
                  Recent Admin Activity
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  onNavigate('auditLogs')
                }
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                Audit Logs
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              {extData.recentActivity
                .slice(0, 8)
                .map((activity, index) => (
                  <div
                    key={activity.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                      index % 2 === 0
                        ? ''
                        : 'bg-white/[0.02]'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-blue-400">
                      {activity.adminEmail?.[0]?.toUpperCase() ??
                        'A'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/75 truncate">
                        {activity.action}
                        {activity.targetLabel
                          ? ` · ${activity.targetLabel}`
                          : ''}
                      </p>

                      <p className="text-[10px] text-white/30">
                        {activity.adminEmail}
                      </p>
                    </div>

                    <p className="text-[10px] text-white/25 flex-shrink-0">
                      {safeDate(
                        activity.createdAt,
                      )?.toLocaleTimeString(
                        'en-NG',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      ) ?? ''}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}
    </div>
  );
}
