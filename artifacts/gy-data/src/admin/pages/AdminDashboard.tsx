import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Users, ArrowLeftRight, TrendingUp, Clock,
  UserCheck, AlertCircle, CheckCircle, XCircle, RefreshCw,
  ChevronRight, Grid3X3, Wallet, Activity, TrendingDown,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { SERVICE_CONFIG } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import { apiGetDashboardExtended, type DashboardExtended } from '../utils/adminApi';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-white/[0.06] rounded-lg ${className ?? ''}`} style={style} />;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent, loading, onClick,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType;
  accent: { bg: string; icon: string; border: string; bar: string };
  loading?: boolean; onClick?: () => void;
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
        background: 'linear-gradient(135deg, #0B1B35 0%, #0D1F3C 100%)',
        borderColor: accent.border,
      }}
    >
      {/* Coloured bar at top */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: accent.bar }} />

      <div className="flex items-start justify-between gap-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent.bg }}
        >
          <Icon className="w-5 h-5" style={{ color: accent.icon }} />
        </div>
        {onClick && <ChevronRight className="w-4 h-4 text-white/20 mt-1 flex-shrink-0" />}
      </div>

      {loading ? (
        <div>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
          <p className="text-xs text-white/40 mt-0.5">{label}</p>
          {sub && (
            <p className="text-xs mt-1.5 font-medium" style={{ color: accent.icon }}>{sub}</p>
          )}
        </div>
      )}
    </button>
  );
}

// ── Mini status card ──────────────────────────────────────────────────────────

function StatusCard({
  icon: Icon, iconColor, bgColor, borderColor, value, label, loading, onClick,
}: {
  icon: React.ElementType; iconColor: string; bgColor: string; borderColor: string;
  value: string | number | undefined; label: string; loading?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-2xl border w-full text-left transition-all cursor-pointer hover:translate-y-[-1px] active:scale-[0.99]"
      style={{ background: bgColor, borderColor }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: bgColor, border: `1px solid ${borderColor}` }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        {loading
          ? <Skeleton className="h-5 w-12 mb-1" />
          : <p className="text-lg font-bold" style={{ color: iconColor }}>{value ?? '—'}</p>
        }
        <p className="text-xs text-white/40">{label}</p>
      </div>
    </button>
  );
}

// ── Metric card (analytics row) ───────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
      <p className="text-xs text-white/40 mb-2">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-white/30 mt-1">{sub}</p>
    </div>
  );
}

// ── Chart container ───────────────────────────────────────────────────────────

function ChartCard({ title, sub, onClick, children }: {
  title: string; sub?: string; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5 ${onClick ? 'cursor-pointer hover:border-white/20 transition-colors' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
        </div>
        {onClick && <ChevronRight className="w-4 h-4 text-white/20" />}
      </div>
      {children}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: {
  status: 'success' | 'pending' | 'failed' | 'active' | 'suspended' | 'sent' | 'draft' | 'scheduled' | string;
}) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    success:   { bg: 'rgba(34,197,94,0.1)',  text: '#4ade80', border: 'rgba(34,197,94,0.25)'  },
    active:    { bg: 'rgba(34,197,94,0.1)',  text: '#4ade80', border: 'rgba(34,197,94,0.25)'  },
    sent:      { bg: 'rgba(34,197,94,0.1)',  text: '#4ade80', border: 'rgba(34,197,94,0.25)'  },
    verified:  { bg: 'rgba(34,197,94,0.1)',  text: '#4ade80', border: 'rgba(34,197,94,0.25)'  },
    pending:   { bg: 'rgba(234,179,8,0.1)',  text: '#facc15', border: 'rgba(234,179,8,0.25)'  },
    scheduled: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
    failed:    { bg: 'rgba(239,68,68,0.1)',  text: '#f87171', border: 'rgba(239,68,68,0.25)'  },
    suspended: { bg: 'rgba(239,68,68,0.1)',  text: '#f87171', border: 'rgba(239,68,68,0.25)'  },
    draft:     { bg: 'rgba(113,113,122,0.1)',text: '#a1a1aa', border: 'rgba(113,113,122,0.25)'},
    unverified:{ bg: 'rgba(113,113,122,0.1)',text: '#a1a1aa', border: 'rgba(113,113,122,0.25)'},
  };
  const s = styles[status] ?? { bg: 'rgba(113,113,122,0.1)', text: '#a1a1aa', border: 'rgba(113,113,122,0.25)' };
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize inline-flex items-center"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {status}
    </span>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const {
    stats, statsLoading, refreshStats,
    transactions, txnsLoading,
    weeklyRevenue, revenueLoading,
    servicesData, servicesLoading,
    fetchWeeklyRevenue, fetchServices,
  } = useAdminContext();

  const [extData, setExtData] = useState<DashboardExtended | null>(null);

  useEffect(() => {
    apiGetDashboardExtended()
      .then(setExtData)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to load analytics'));
  }, []);

  const recentTxns    = transactions.slice(0, 8);
  const isLoading     = statsLoading;
  const maxRevenue    = weeklyRevenue.length > 0 ? Math.max(...weeklyRevenue.map(d => d.amount), 1) : 1;
  const topServices   = servicesData.slice(0, 5);
  const totalSvcRev   = topServices.reduce((a, s) => a + s.revenue, 0);

  const handleRefresh = () => {
    void refreshStats();
    void fetchWeeklyRevenue();
    void fetchServices();
  };

  // ── Accent configs ──────────────────────────────────────────────────────────
  const accents = {
    users:    { bg: 'rgba(59,130,246,0.15)',  icon: '#60a5fa', border: 'rgba(59,130,246,0.12)',  bar: 'linear-gradient(90deg,#3b82f6,#60a5fa)' },
    txns:     { bg: 'rgba(139,92,246,0.15)',  icon: '#a78bfa', border: 'rgba(139,92,246,0.12)',  bar: 'linear-gradient(90deg,#8b5cf6,#a78bfa)' },
    revenue:  { bg: 'rgba(34,197,94,0.15)',   icon: '#4ade80', border: 'rgba(34,197,94,0.12)',   bar: 'linear-gradient(90deg,#22c55e,#4ade80)' },
    pending:  { bg: 'rgba(234,179,8,0.15)',   icon: '#facc15', border: 'rgba(234,179,8,0.12)',   bar: 'linear-gradient(90deg,#eab308,#facc15)' },
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">Overview</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 text-xs font-medium text-white/50 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-xl px-3 py-2 transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Primary stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Users"
          value={stats ? stats.totalUsers.toLocaleString() : '—'}
          sub={stats ? `${stats.activeUsers.toLocaleString()} active` : undefined}
          icon={Users} accent={accents.users} loading={isLoading && !stats}
          onClick={() => onNavigate('users')}
        />
        <StatCard
          label="Transactions"
          value={stats ? stats.totalTransactions.toLocaleString() : '—'}
          sub={stats ? `${stats.pendingTransactions} pending` : undefined}
          icon={ArrowLeftRight} accent={accents.txns} loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
        <StatCard
          label="Total Revenue"
          value={stats ? fmtNaira(stats.totalRevenue) : '—'}
          sub={stats ? `${fmtNaira(stats.todayRevenue)} today` : undefined}
          icon={TrendingUp} accent={accents.revenue} loading={isLoading && !stats}
          onClick={() => onNavigate('wallet')}
        />
        <StatCard
          label="Pending"
          value={stats ? stats.pendingTransactions.toString() : '—'}
          sub={stats ? `${stats.failedTransactions} failed` : undefined}
          icon={Clock} accent={accents.pending} loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
      </div>

      {/* ── Transaction status mini cards ────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          icon={CheckCircle} iconColor="#4ade80"
          bgColor="rgba(34,197,94,0.05)" borderColor="rgba(34,197,94,0.15)"
          value={stats?.successfulTransactions?.toLocaleString()} label="Successful"
          loading={isLoading && !stats} onClick={() => onNavigate('transactions')}
        />
        <StatusCard
          icon={Clock} iconColor="#facc15"
          bgColor="rgba(234,179,8,0.05)" borderColor="rgba(234,179,8,0.15)"
          value={stats?.pendingTransactions} label="Pending"
          loading={isLoading && !stats} onClick={() => onNavigate('transactions')}
        />
        <StatusCard
          icon={XCircle} iconColor="#f87171"
          bgColor="rgba(239,68,68,0.05)" borderColor="rgba(239,68,68,0.15)"
          value={stats?.failedTransactions} label="Failed"
          loading={isLoading && !stats} onClick={() => onNavigate('transactions')}
        />
      </div>

      {/* ── Analytics charts (extended data) ────────────────────────────────── */}
      {extData && (
        <>
          {/* Metric row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Est. Net Profit"
              value={`₦${extData.netProfit.toLocaleString()}`}
              sub={`${extData.profitMargin.toFixed(1)}% margin`}
              color="#4ade80"
            />
            <MetricCard
              label="Active Users Today"
              value={extData.activeUsersToday.toString()}
              sub="made a transaction"
              color="#60a5fa"
            />
            <MetricCard
              label="New Users This Week"
              value={extData.newUsersThisWeek.toString()}
              sub="registrations"
              color="#a78bfa"
            />
          </div>

          {/* Revenue charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Daily Revenue" sub="Last 14 days">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={extData.dailyRevenue}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={(v: number) => `₦${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ background: '#0B1B35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    formatter={(v: number) => [`₦${v.toLocaleString()}`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Monthly Revenue" sub="Last 6 months">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={extData.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={v => v.slice(0, 7)} />
                  <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={(v: number) => `₦${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ background: '#0B1B35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    formatter={(v: number) => [`₦${v.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {/* ── Weekly revenue + Top services ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Weekly revenue bars */}
        <ChartCard
          title="Weekly Revenue"
          sub={stats ? `${fmtNaira(stats.weekRevenue)} this week` : undefined}
          onClick={() => onNavigate('wallet')}
        >
          {revenueLoading ? (
            <div className="flex items-end gap-2 h-28">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <Skeleton className="w-full" style={{ height: `${30 + (i * 7) % 50}px` }} />
                  <Skeleton className="h-2 w-5" />
                </div>
              ))}
            </div>
          ) : weeklyRevenue.length === 0 ? (
            <div className="h-28 flex flex-col items-center justify-center text-white/25">
              <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">No data for the past 7 days</p>
            </div>
          ) : (
            <div className="flex items-end gap-2 h-28">
              {weeklyRevenue.map(d => {
                const pct = maxRevenue > 0 ? (d.amount / maxRevenue) * 100 : 0;
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full bg-white/[0.05] rounded-lg flex items-end overflow-hidden" style={{ height: '88px' }}>
                      <div
                        className="w-full rounded-lg transition-all"
                        style={{
                          height: `${Math.max(pct, 3)}%`,
                          background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                          opacity: 0.85,
                        }}
                        title={`₦${d.amount.toLocaleString()}`}
                      />
                    </div>
                    <span className="text-[10px] text-white/30">{d.day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        {/* Top services */}
        <ChartCard title="Top Services" onClick={() => onNavigate('services')}>
          {servicesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : topServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-white/25">
              <Grid3X3 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">No service data yet</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {topServices.map(s => {
                const cfg = SERVICE_CONFIG[s.type];
                const pct = totalSvcRev > 0 ? Math.round((s.revenue / totalSvcRev) * 100) : 0;
                return (
                  <div key={s.type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{cfg?.icon ?? '💳'}</span>
                        <span className="text-sm font-medium text-white/80">{cfg?.label ?? s.type}</span>
                      </div>
                      <span className="text-xs text-white/40">
                        {pct}% · {fmtNaira(s.revenue)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: cfg?.color ?? '#3B82F6' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Recent transactions table ─────────────────────────────────────────── */}
      <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-white/40" />
            <h2 className="font-semibold text-sm text-white">Recent Transactions</h2>
          </div>
          <button
            onClick={() => onNavigate('transactions')}
            className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider hidden sm:table-cell">Service</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">Amount</th>
                <th className="text-center px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {txnsLoading && recentTxns.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="px-5 py-3.5"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-5 py-3.5 hidden sm:table-cell"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-5 py-3.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-5 py-3.5 text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></td>
                  </tr>
                ))
              ) : recentTxns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-14 text-white/25 text-sm">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No transactions yet
                  </td>
                </tr>
              ) : (
                recentTxns.map((txn, idx) => (
                  <tr
                    key={txn.id}
                    onClick={() => onNavigate('transactions')}
                    className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer ${
                      idx % 2 === 0 ? '' : 'bg-white/[0.01]'
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-sm text-white/80 truncate max-w-[130px]">{txn.userName}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">{txn.time}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <p className="text-sm text-white/70">{txn.service}</p>
                      <p className="text-[11px] text-white/30">{txn.provider}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-bold text-white/90">₦{txn.amount.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusBadge status={txn.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── KYC summary ──────────────────────────────────────────────────────── */}
      <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-white/40" />
            <h2 className="font-semibold text-sm text-white">KYC Status</h2>
          </div>
          <button onClick={() => onNavigate('users')}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            Manage <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: UserCheck, bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)',
              color: '#4ade80', label: 'Verified',
              value: isLoading && !stats ? null : (stats?.verifiedUsers ?? '—'),
            },
            {
              icon: Clock, bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)',
              color: '#facc15', label: 'Pending',
              value: isLoading && !stats ? null : (stats?.pendingKycUsers ?? '—'),
            },
            {
              icon: AlertCircle, bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)',
              color: '#f87171', label: 'Unverified',
              value: isLoading && !stats ? null : (stats ? stats.suspendedUsers + stats.unverifiedUsers : '—'),
            },
          ].map(({ icon: Icon, bg, border, color, label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate('users')}
              className="rounded-2xl p-4 text-center transition-all hover:opacity-80 active:scale-[0.97] border cursor-pointer"
              style={{ background: bg, borderColor: border }}
            >
              <div className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: bg, border: `1px solid ${border}` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              {value === null
                ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
                : <p className="text-xl font-bold" style={{ color }}>{value}</p>
              }
              <p className="text-xs text-white/40 mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent admin activity ─────────────────────────────────────────────── */}
      {extData && extData.recentActivity.length > 0 && (
        <div className="bg-[#0B1B35] border border-white/[0.07] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/40" />
              <h2 className="font-semibold text-sm text-white">Recent Admin Activity</h2>
            </div>
            <button onClick={() => onNavigate('auditLogs')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
              Audit Logs <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {extData.recentActivity.slice(0, 8).map((a, idx) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  idx % 2 === 0 ? '' : 'bg-white/[0.02]'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-blue-400">
                  {a.adminEmail?.[0]?.toUpperCase() ?? 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white/75 truncate">
                    {a.action}{a.targetLabel ? ` · ${a.targetLabel}` : ''}
                  </p>
                  <p className="text-[10px] text-white/30">{a.adminEmail}</p>
                </div>
                <p className="text-[10px] text-white/25 flex-shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
