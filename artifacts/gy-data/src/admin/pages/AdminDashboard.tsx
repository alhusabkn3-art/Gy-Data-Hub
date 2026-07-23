import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Users, ArrowLeftRight, TrendingUp, Clock,
  UserCheck, AlertCircle, CheckCircle, XCircle, RefreshCw,
  ChevronRight, Grid3X3,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { SERVICE_CONFIG } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import { apiGetDashboardExtended, type DashboardExtended } from '../utils/adminApi';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} style={style} />;
}

/** Clickable stat card — navigates to `target` page when clicked. */
function StatCard({
  label, value, sub, icon: Icon, color, loading, onClick,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 text-left w-full transition-all ${
        onClick ? 'cursor-pointer hover:border-primary/40 hover:bg-white/[0.04] active:scale-[0.98]' : 'cursor-default'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
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
      {onClick && (
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 self-end -mb-1" />
      )}
    </button>
  );
}

/** Clickable mini stat (success / pending / failed counts). */
function MiniStatCard({
  icon: Icon, iconClass, bgClass, value, label, loading, onClick,
}: {
  icon: React.ElementType; iconClass: string; bgClass: string;
  value: string | number | undefined; label: string; loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-card border border-border rounded-2xl p-4 flex items-center gap-3 w-full text-left transition-all ${
        onClick ? 'cursor-pointer hover:border-primary/40 hover:bg-white/[0.04] active:scale-[0.98]' : 'cursor-default'
      }`}
    >
      <div className={`w-9 h-9 rounded-full ${bgClass} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        {loading
          ? <Skeleton className="h-5 w-12 mb-1" />
          : <p className={`text-base font-bold ${iconClass}`}>{value ?? '—'}</p>
        }
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      {onClick && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AdminDashboardProps {
  /** Called when a dashboard card is clicked — navigates to that admin page. */
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
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to load dashboard analytics'));
  }, []);

  const recentTxns = transactions.slice(0, 8);
  const isLoading  = statsLoading;

  const maxRevenue   = weeklyRevenue.length > 0 ? Math.max(...weeklyRevenue.map(d => d.amount), 1) : 1;
  const topServices  = servicesData.slice(0, 5);
  const totalSvcRevenue = topServices.reduce((a, s) => a + s.revenue, 0);

  const handleRefresh = () => {
    void refreshStats();
    void fetchWeeklyRevenue();
    void fetchServices();
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
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

      {/* ── Primary stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Users"
          value={stats ? stats.totalUsers.toLocaleString() : '—'}
          sub={stats ? `${stats.activeUsers.toLocaleString()} active` : undefined}
          icon={Users}
          color="bg-blue-500/10 text-blue-400"
          loading={isLoading && !stats}
          onClick={() => onNavigate('users')}
        />
        <StatCard
          label="Total Transactions"
          value={stats ? stats.totalTransactions.toLocaleString() : '—'}
          sub={stats ? `${stats.pendingTransactions} pending` : undefined}
          icon={ArrowLeftRight}
          color="bg-purple-500/10 text-purple-400"
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
        <StatCard
          label="Total Revenue"
          value={stats ? fmtNaira(stats.totalRevenue) : '—'}
          sub={stats ? `${fmtNaira(stats.todayRevenue)} today` : undefined}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-400"
          loading={isLoading && !stats}
          onClick={() => onNavigate('wallet')}
        />
        <StatCard
          label="Pending Transactions"
          value={stats ? stats.pendingTransactions.toString() : '—'}
          sub={stats ? `${stats.failedTransactions} failed` : undefined}
          icon={Clock}
          color="bg-amber-500/10 text-amber-400"
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
      </div>

      {/* ── Transaction status breakdown ────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStatCard
          icon={CheckCircle}
          iconClass="text-green-400"
          bgClass="bg-green-500/10"
          value={stats?.successfulTransactions.toLocaleString()}
          label="Successful"
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
        <MiniStatCard
          icon={Clock}
          iconClass="text-amber-400"
          bgClass="bg-amber-500/10"
          value={stats?.pendingTransactions}
          label="Pending"
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
        <MiniStatCard
          icon={XCircle}
          iconClass="text-red-400"
          bgClass="bg-red-500/10"
          value={stats?.failedTransactions}
          label="Failed"
          loading={isLoading && !stats}
          onClick={() => onNavigate('transactions')}
        />
      </div>

      {/* ── Revenue Analytics ────────────────────────────────────────────── */}
      {extData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06]">
            <p className="text-sm font-semibold mb-4">Daily Revenue (14 days)</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={extData.dailyRevenue}>
                <defs>
                  <linearGradient id="rev14" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="day" tick={{fill:'#6b7280',fontSize:10}} tickFormatter={(v)=>v.slice(5)}/>
                <YAxis tick={{fill:'#6b7280',fontSize:10}} tickFormatter={(v: number)=>`₦${v>=1000?`${(v/1000).toFixed(0)}k`:v}`}/>
                <Tooltip contentStyle={{background:'#0D1F3C',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'12px',color:'#fff'}} formatter={(v: number)=>[`₦${v.toLocaleString()}`,'Revenue']}/>
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#rev14)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06]">
            <p className="text-sm font-semibold mb-4">Monthly Revenue (6 months)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={extData.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="month" tick={{fill:'#6b7280',fontSize:10}} tickFormatter={(v)=>v.slice(0,7)}/>
                <YAxis tick={{fill:'#6b7280',fontSize:10}} tickFormatter={(v: number)=>`₦${v>=1000?`${(v/1000).toFixed(0)}k`:v}`}/>
                <Tooltip contentStyle={{background:'#0D1F3C',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'12px',color:'#fff'}} formatter={(v: number)=>[`₦${v.toLocaleString()}`,'Revenue']}/>
                <Bar dataKey="revenue" fill="#3B82F6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Profit / Activity analytics ──────────────────────────────────── */}
      {extData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Net Profit (est.)', value: `₦${extData.netProfit.toLocaleString()}`, color: 'text-green-400', sub: `${extData.profitMargin.toFixed(1)}% margin` },
            { label: 'Active Users Today', value: extData.activeUsersToday.toString(), color: 'text-blue-400', sub: 'made a transaction' },
            { label: 'New Users This Week', value: extData.newUsersThisWeek.toString(), color: 'text-purple-400', sub: 'registered' },
          ].map(c => (
            <div key={c.label} className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06]">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Weekly Revenue chart — clicking navigates to Wallet */}
        <button
          type="button"
          onClick={() => onNavigate('wallet')}
          className="bg-card border border-border rounded-2xl p-4 text-left w-full cursor-pointer hover:border-primary/40 hover:bg-white/[0.04] transition-all active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm">Weekly Revenue</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats ? `${fmtNaira(stats.weekRevenue)} this week` : 'Loading…'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
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
        </button>

        {/* Top services — clicking navigates to Services */}
        <button
          type="button"
          onClick={() => onNavigate('services')}
          className="bg-card border border-border rounded-2xl p-4 text-left w-full cursor-pointer hover:border-primary/40 hover:bg-white/[0.04] transition-all active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm">Top Services</h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Grid3X3 className="w-3.5 h-3.5" />
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

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
                        {pct}% · {fmtNaira(s.revenue)}
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
        </button>
      </div>

      {/* ── Recent transactions ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => onNavigate('transactions')}
          className="w-full flex items-center justify-between p-4 border-b border-border hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <h2 className="font-bold text-sm">Recent Transactions</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{recentTxns.length > 0 ? `${recentTxns.length} most recent` : 'No transactions yet'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </button>

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
                  <tr
                    key={txn.id}
                    onClick={() => onNavigate('transactions')}
                    className="border-b border-border/50 hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
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

        {/* "View all" footer row */}
        {recentTxns.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-primary hover:bg-primary/5 transition-colors border-t border-border"
          >
            View all transactions <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── KYC summary ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <button
          type="button"
          onClick={() => onNavigate('users')}
          className="w-full flex items-center justify-between mb-4 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <h2 className="font-bold text-sm">User KYC Status</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </button>

        <div className="grid grid-cols-3 gap-3">
          {/* Verified */}
          <button
            type="button"
            onClick={() => onNavigate('users')}
            className="text-center p-3 bg-green-500/5 border border-green-500/20 rounded-xl cursor-pointer hover:bg-green-500/10 hover:border-green-500/40 transition-all active:scale-[0.97]"
          >
            <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <UserCheck className="w-4 h-4 text-green-400" />
            </div>
            {isLoading && !stats
              ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
              : <p className="text-lg font-bold text-green-400">{stats?.verifiedUsers ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Verified</p>
          </button>

          {/* Pending KYC */}
          <button
            type="button"
            onClick={() => onNavigate('users')}
            className="text-center p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl cursor-pointer hover:bg-amber-500/10 hover:border-amber-500/40 transition-all active:scale-[0.97]"
          >
            <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            {isLoading && !stats
              ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
              : <p className="text-lg font-bold text-amber-400">{stats?.pendingKycUsers ?? '—'}</p>
            }
            <p className="text-xs text-muted-foreground">Pending</p>
          </button>

          {/* Unverified / Suspended */}
          <button
            type="button"
            onClick={() => onNavigate('users')}
            className="text-center p-3 bg-red-500/5 border border-red-500/20 rounded-xl cursor-pointer hover:bg-red-500/10 hover:border-red-500/40 transition-all active:scale-[0.97]"
          >
            <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            {isLoading && !stats
              ? <Skeleton className="h-6 w-10 mx-auto mb-1" />
              : <p className="text-lg font-bold text-red-400">
                  {stats ? stats.suspendedUsers + stats.unverifiedUsers : '—'}
                </p>
            }
            <p className="text-xs text-muted-foreground">Unverified / Suspended</p>
          </button>
        </div>
      </div>

      {/* ── Recent Admin Activity feed ────────────────────────────────────── */}
      {extData && extData.recentActivity.length > 0 && (
        <div className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold">Recent Admin Activity</p>
            <button onClick={() => onNavigate('auditLogs')} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="space-y-3">
            {extData.recentActivity.slice(0, 8).map(a => (
              <div key={a.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                  {a.adminEmail?.[0]?.toUpperCase() ?? 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{a.action}{a.targetLabel ? ` · ${a.targetLabel}` : ''}</p>
                  <p className="text-[10px] text-muted-foreground">{a.adminEmail}</p>
                </div>
                <p className="text-[10px] text-muted-foreground flex-shrink-0">{new Date(a.createdAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatusBadge — shared across admin pages ───────────────────────────────────
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
