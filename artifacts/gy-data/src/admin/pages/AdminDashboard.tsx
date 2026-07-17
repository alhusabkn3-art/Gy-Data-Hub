import React from 'react';
import { Users, ArrowLeftRight, TrendingUp, Clock, UserCheck, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { serviceStats, revenueChart } from '../data/adminMockData';

function StatCard({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; trend?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className="text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-primary mt-1 font-medium">{sub}</p>}
      </div>
    </div>
  );
}

const maxRevenue = Math.max(...revenueChart.map(d => d.amount));

export default function AdminDashboard() {
  const { stats, transactions } = useAdminContext();

  const recentTxns = transactions.slice(0, 8);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">July 17, 2024 · All figures are live mock data</p>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Users"
          value={stats.totalUsers.toLocaleString()}
          sub={`${stats.activeUsers.toLocaleString()} active`}
          icon={Users}
          color="bg-blue-500/10 text-blue-400"
          trend="+12%"
        />
        <StatCard
          label="Total Transactions"
          value={stats.totalTransactions.toLocaleString()}
          sub={`${stats.pendingTransactions} pending`}
          icon={ArrowLeftRight}
          color="bg-purple-500/10 text-purple-400"
          trend="+8%"
        />
        <StatCard
          label="Total Revenue"
          value={`₦${(stats.totalRevenue / 1_000_000).toFixed(1)}M`}
          sub={`₦${stats.todayRevenue.toLocaleString()} today`}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-400"
          trend="+21%"
        />
        <StatCard
          label="Pending Transactions"
          value={stats.pendingTransactions.toString()}
          sub={`${stats.failedTransactions} failed`}
          icon={Clock}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-base font-bold text-green-400">{stats.successfulTransactions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Successful</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-base font-bold text-amber-400">{stats.pendingTransactions}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="text-base font-bold text-red-400">{stats.failedTransactions}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Revenue chart */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm">Weekly Revenue</h2>
              <p className="text-xs text-muted-foreground mt-0.5">₦{(stats.weekRevenue / 1000).toFixed(0)}K this week</p>
            </div>
            <span className="text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">+18% vs last week</span>
          </div>
          <div className="flex items-end gap-2 h-28">
            {revenueChart.map(d => {
              const pct = (d.amount / maxRevenue) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-background rounded-lg flex items-end overflow-hidden" style={{ height: '88px' }}>
                    <div
                      className="w-full bg-primary/70 hover:bg-primary transition-colors rounded-lg"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top services */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">Top Services</h2>
          <div className="space-y-3">
            {serviceStats.slice(0, 5).map(s => {
              const totalRevenue = serviceStats.reduce((a, b) => a + b.revenue, 0);
              const pct = Math.round((s.revenue / totalRevenue) * 100);
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{s.icon}</span>
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{pct}% · ₦{(s.revenue / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: s.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-sm">Recent Transactions</h2>
          <span className="text-xs text-muted-foreground">Last 8 transactions</span>
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
              {recentTxns.map(txn => (
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
              ))}
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
            <p className="text-lg font-bold text-green-400">1,089</p>
            <p className="text-xs text-muted-foreground">Verified</p>
          </div>
          <div className="text-center p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-lg font-bold text-amber-400">115</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="text-center p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
            <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-lg font-bold text-red-400">43</p>
            <p className="text-xs text-muted-foreground">Failed / Suspended</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: 'success' | 'pending' | 'failed' | 'active' | 'suspended' | 'sent' | 'draft' | 'scheduled' | string }) {
  const map: Record<string, string> = {
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    sent: 'bg-green-500/10 text-green-400 border-green-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
    draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${map[status] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
      {status}
    </span>
  );
}
