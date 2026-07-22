import React from 'react';
import {
  Users, ArrowLeftRight, TrendingUp, Clock,
  UserCheck, AlertCircle, CheckCircle, XCircle, RefreshCw,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { SERVICE_CONFIG } from '../data/adminMockData';

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} style={style} />;
}

function StatCard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        {loading ? (
          <>
            <Skeleton className="h-7 w-20 mb-1.5" />
            <Skeleton className="h-3 w-28" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            {sub && <p className="text-xs text-primary mt-1 font-medium">{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const {
    stats, statsLoading, refreshStats,
    transactions, txnsLoading,
    weeklyRevenue, revenueLoading,
    servicesData, servicesLoading,
    fetchWeeklyRevenue, fetchServices,
  } = useAdminContext();

  const recentTxns = transactions.slice(0, 8);
  const isLoading  = statsLoading;

  // Revenue chart helpers
  const maxRevenue = weeklyRevenue.length > 0 ? Math.max(...weeklyRevenue.map(d => d.amount), 1) : 1;

  // Services sorted by revenue
  const topServices = servicesData.slice(0, 5);
  const totalSvcRevenue = topServices.reduce((a, s) => a + s.revenue, 0);

  const handleRefresh = () => {
    void refreshStats();
    void fetchWeeklyRevenue();
    void fetchServices();
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-card border border-border rounded-xl px-3 py-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Users"
          value={stats ? stats.totalUsers.toLocaleString() : '—'}
          sub={stats ? `${stats.activeUsers.toLocaleString()} active` : undefined}
          icon={Users}
          color="bg-blue-500/10 text-blue-400"
          loading={isLoading && !stats}
        />
        <StatCard
          label="Total Transactions"
          value={stats ? stats.totalTransactions.toLocaleString() : '—'}
          sub={stats ? `${stats.pendingTransactions} pending` : undefined}
          icon={ArrowLeftRight}
          color="bg-purple-500/10 text-purple-400"
          loading={isLoading && !stats}
        />
        <StatCard
          label="Total Revenue"
          value={stats ? `₦${(stats.totalRevenue / 1_000_000).toFixed(2)}M` : '—'}
          sub={stats ? `₦${stats.todayRevenue.toLocaleString()} today` : undefined}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-400"
          loading={isLoading && !stats}
        />
        <StatCard
          label="Pending Transactions"
          value={stats ? stats.pendingTransactions.toString() : '—'}
          sub={stats ? `${stats.failedTransactions} failed` : undefined}
          icon={Clock}
          color="bg-amber-500/10 text-amber-400"
          loading={isLoading && !stats}
        />
      </div>

      {/* Transaction status breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-green-400" />
          </div>
          <div>
            {isLoading && !stats
              ? <Skeleton className="h-5 w-12 mb-1" />
              : <p className="text-base font-bold text-green-400">{stats?.successfulTransactions.toLocaleString() ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Successful</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            {isLoading && !stats
              ? <Skeleton className="h-5 w-10 mb-1" />
              : <p className="text-base font-bold text-amber-400">{stats?.pendingTransactions ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            {isLoading && !stats
              ? <Skeleton className="h-5 w-10 mb-1" />
              : <p className="text-base font-bold text-red-400">{stats?.failedTransactions ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Weekly Revenue chart */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm">Weekly Revenue</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats ? `₦${(stats.weekRevenue / 1000).toFixed(0)}K this week` : 'Loading…'}
              </p>
            </div>
          </div>

          {revenueLoading ? (
            <div className="flex items-end gap-2 h-28">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <Skeleton className="w-full" style={{ height: `${30 + Math.random() * 50}px` } as React.CSSProperties} />
                  <Skeleton className="h-2 w-5" />
                </div>
              ))}
            </div>
          ) : weeklyRevenue.length === 0 ? (
            <div className="h-28 flex flex-col items-center justify-center text-muted-foreground">
              <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No revenue data for the past 7 days</p>
            </div>
          ) : (
            <div className="flex items-end gap-2 h-28">
              {weeklyRevenue.map(d => {
                const pct = maxRevenue > 0 ? (d.amount / maxRevenue) * 100 : 0;
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-background rounded-lg flex items-end overflow-hidden" style={{ height: '88px' }}>
                      <div
                        className="w-full bg-primary/70 hover:bg-primary transition-colors rounded-lg"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                        title={`₦${d.amount.toLocaleString()}`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{d.day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top services */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">Top Services</h2>

          {servicesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : topServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ArrowLeftRight className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No service data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topServices.map(s => {
                const cfg = SERVICE_CONFIG[s.type];
                const pct = totalSvcRevenue > 0 ? Math.round((s.revenue / totalSvcRevenue) * 100) : 0;
                return (
                  <div key={s.type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{cfg?.icon ?? '💳'}</span>
                        <span className="text-sm font-medium">{cfg?.label ?? s.type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {pct}% · ₦{(s.revenue / 1000).toFixed(0)}K
                      </span>
                    </div>
                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
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
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-sm">Recent Transactions</h2>
          <span className="text-xs text-muted-foreground">
            {recentTxns.length > 0 ? `${recentTxns.length} most recent` : 'No transactions yet'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Service</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {txnsLoading && recentTxns.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></td>
                  </tr>
                ))
              ) : recentTxns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                recentTxns.map(txn => (
                  <tr key={txn.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm truncate max-w-[120px]">{txn.userName}</p>
                      <p className="text-xs text-muted-foreground">{txn.time}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-sm">{txn.service}</p>
                      <p className="text-xs text-muted-foreground">{txn.provider}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">₦{txn.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={txn.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* KYC summary */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h2 className="font-bold text-sm mb-4">User KYC Status</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
            <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <UserCheck className="w-4 h-4 text-green-400" />
            </div>
            {isLoading && !stats
              ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
              : <p className="text-lg font-bold text-green-400">{stats?.verifiedUsers ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Verified</p>
          </div>
          <div className="text-center p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            {isLoading && !stats
              ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
              : <p className="text-lg font-bold text-amber-400">{stats?.pendingKycUsers ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="text-center p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
            <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            {isLoading && !stats
              ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
              : <p className="text-lg font-bold text-red-400">{stats ? stats.suspendedUsers + stats.unverifiedUsers : '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Unverified / Suspended</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StatusBadge — shared across admin pages ────────────────────────────────────
export function StatusBadge({ status }: {
  status: 'success' | 'pending' | 'failed' | 'active' | 'suspended' | 'sent' | 'draft' | 'scheduled' | string;
}) {
  const map: Record<string, string> = {
    success:   'bg-green-500/10 text-green-400 border-green-500/20',
    active:    'bg-green-500/10 text-green-400 border-green-500/20',
    sent:      'bg-green-500/10 text-green-400 border-green-500/20',
    pending:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    scheduled: 'bg-blue-500/10  text-blue-400  border-blue-500/20',
    failed:    'bg-red-500/10   text-red-400   border-red-500/20',
    suspended: 'bg-red-500/10   text-red-400   border-red-500/20',
    draft:     'bg-zinc-500/10  text-zinc-400  border-zinc-500/20',
    unverified:'bg-zinc-500/10  text-zinc-400  border-zinc-500/20',
    verified:  'bg-green-500/10 text-green-400 border-green-500/20',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${map[status] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
      {status}
    </span>
  );
}
