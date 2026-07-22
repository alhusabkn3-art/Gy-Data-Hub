import React from 'react';
import { Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} />;
}

export default function AdminWallet() {
  const { transactions, stats, statsLoading, refreshStats } = useAdminContext();
  const isLoading = statsLoading && !stats;

  const fundingTxns = transactions.filter(t => t.type === 'wallet_fund').slice(0, 20);

  // Revenue breakdown — derive from real stats
  const revenueRows = stats
    ? [
        { label: 'Today',      amount: stats.todayRevenue,  color: 'text-blue-400',   bg: 'bg-blue-400' },
        { label: 'This Week',  amount: stats.weekRevenue,   color: 'text-green-400',  bg: 'bg-green-400' },
        { label: 'This Month', amount: stats.monthRevenue,  color: 'text-purple-400', bg: 'bg-purple-400' },
        { label: 'All Time',   amount: stats.totalRevenue,  color: 'text-amber-400',  bg: 'bg-amber-400' },
      ]
    : [];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Wallet Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aggregated wallet data across all users</p>
        </div>
        <button
          onClick={() => refreshStats()}
          disabled={statsLoading}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <Wallet className="w-5 h-5 text-blue-400" />
          </div>
          {isLoading
            ? <Skeleton className="h-7 w-24 mb-1" />
            : <p className="text-2xl font-bold">₦{stats ? (stats.totalWalletBalance / 1_000_000).toFixed(2) : '—'}M</p>
          }
          <p className="text-xs text-muted-foreground mt-0.5">Total Wallet Balance</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
            <ArrowDownCircle className="w-5 h-5 text-green-400" />
          </div>
          {isLoading
            ? <Skeleton className="h-7 w-24 mb-1" />
            : <p className="text-2xl font-bold">₦{stats ? (stats.totalRevenue / 1_000_000).toFixed(2) : '—'}M</p>
          }
          <p className="text-xs text-muted-foreground mt-0.5">Total Funded (All Time)</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
            <ArrowUpCircle className="w-5 h-5 text-red-400" />
          </div>
          {isLoading
            ? <Skeleton className="h-7 w-24 mb-1" />
            : <p className="text-2xl font-bold">₦{stats ? (stats.totalRevenue / 1_000_000).toFixed(2) : '—'}M</p>
          }
          <p className="text-xs text-muted-foreground mt-0.5">Total Spent (Services)</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          {isLoading
            ? <Skeleton className="h-7 w-24 mb-1" />
            : <p className="text-2xl font-bold">₦{stats?.todayRevenue.toLocaleString() ?? '—'}</p>
          }
          <p className="text-xs text-muted-foreground mt-0.5">Today's Revenue</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Revenue periods */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">Revenue Breakdown</h2>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1.5">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : revenueRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No revenue data yet.</p>
          ) : (
            <>
              <div className="space-y-3">
                {revenueRows.map(({ label, amount, color, bg }) => {
                  const totalRev = stats!.totalRevenue;
                  const pct = totalRev > 0 ? Math.round((amount / totalRev) * 100) : 0;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{label}</span>
                        <span className={`text-sm font-bold ${color}`}>
                          ₦{amount >= 1_000_000
                            ? `${(amount / 1_000_000).toFixed(2)}M`
                            : amount >= 1_000
                            ? `${(amount / 1_000).toFixed(0)}K`
                            : amount.toLocaleString()
                          }
                        </span>
                      </div>
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${bg} opacity-70`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="bg-background rounded-xl p-3 border border-border text-center">
                  <p className="text-lg font-bold">₦{(stats?.avgTransactionValue ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Avg. Transaction</p>
                </div>
                <div className="bg-background rounded-xl p-3 border border-border text-center">
                  <p className="text-lg font-bold">
                    {stats && stats.totalUsers > 0
                      ? `₦${Math.round(stats.totalRevenue / stats.totalUsers).toLocaleString()}`
                      : '—'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Revenue / User</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Wallet user stats */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">User Wallet Summary</h2>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2.5 border-b border-border/50">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0">
              {[
                { label: 'Total Users',       value: stats?.totalUsers.toLocaleString() ?? '—' },
                { label: 'Active Users',      value: stats?.activeUsers.toLocaleString() ?? '—' },
                { label: 'Suspended Users',   value: stats?.suspendedUsers.toLocaleString() ?? '—' },
                { label: 'KYC Verified',      value: stats?.verifiedUsers.toLocaleString() ?? '—' },
                { label: 'Wallet Balance',    value: stats ? `₦${(stats.totalWalletBalance / 1_000_000).toFixed(2)}M` : '—' },
                { label: 'Avg. Balance/User', value: stats && stats.totalUsers > 0 ? `₦${Math.round(stats.totalWalletBalance / stats.totalUsers).toLocaleString()}` : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-3 border-b border-border/50 last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-semibold">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent wallet fundings */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-sm">Recent Wallet Fundings</h2>
          <span className="text-xs text-muted-foreground">
            {fundingTxns.length > 0 ? `${fundingTxns.length} most recent` : 'No fundings yet'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Provider</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {fundingTxns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    No wallet funding transactions yet.
                  </td>
                </tr>
              ) : (
                fundingTxns.map(txn => (
                  <tr key={txn.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{txn.userName}</p>
                      <p className="text-xs text-muted-foreground">{txn.phone ?? txn.userId.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{txn.provider}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-400">+₦{txn.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={txn.status} /></td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">{txn.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
