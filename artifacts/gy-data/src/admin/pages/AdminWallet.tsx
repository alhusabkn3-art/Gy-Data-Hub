import React from 'react';
import { Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle, Building2 } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';

const bankBreakdown = [
  { bank: 'GTBank', users: 312, totalFunded: 4820000, color: '#F97316' },
  { bank: 'Access Bank', users: 287, totalFunded: 3940000, color: '#3B82F6' },
  { bank: 'UBA', users: 241, totalFunded: 3210000, color: '#EF4444' },
  { bank: 'Zenith Bank', users: 198, totalFunded: 2880000, color: '#8B5CF6' },
  { bank: 'First Bank', users: 156, totalFunded: 2140000, color: '#10B981' },
  { bank: 'Others', users: 53, totalFunded: 1460000, color: '#6B7280' },
];

const totalFunded = bankBreakdown.reduce((a, b) => a + b.totalFunded, 0);

export default function AdminWallet() {
  const { transactions, stats } = useAdminContext();

  const fundingTxns = transactions.filter(t => t.type === 'wallet_fund');
  const debitTxns = transactions.filter(t => t.type !== 'wallet_fund' && t.status === 'success');

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Wallet Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Aggregated wallet data across all users</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <Wallet className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold">₦{(stats.totalWalletBalance / 1_000_000).toFixed(1)}M</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Wallet Balance</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
            <ArrowDownCircle className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold">₦{(totalFunded / 1_000_000).toFixed(1)}M</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Funded (All Time)</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
            <ArrowUpCircle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold">₦{(stats.totalRevenue / 1_000_000).toFixed(1)}M</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Spent (Services)</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold">₦{stats.todayRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Today's Revenue</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Bank breakdown */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-bold text-sm">Funding by Bank</h2>
          </div>
          <div className="space-y-3">
            {bankBreakdown.map(b => {
              const pct = Math.round((b.totalFunded / totalFunded) * 100);
              return (
                <div key={b.bank}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="text-sm font-medium">{b.bank}</span>
                      <span className="text-xs text-muted-foreground">({b.users} users)</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold">₦{(b.totalFunded / 1000).toFixed(0)}K</span>
                      <span className="text-xs text-muted-foreground ml-1">· {pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: b.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue periods */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-bold text-sm mb-4">Revenue Breakdown</h2>
          <div className="space-y-3">
            {[
              { label: 'Today', amount: stats.todayRevenue, color: 'text-blue-400', bg: 'bg-blue-400' },
              { label: 'This Week', amount: stats.weekRevenue, color: 'text-green-400', bg: 'bg-green-400' },
              { label: 'This Month', amount: stats.monthRevenue, color: 'text-purple-400', bg: 'bg-purple-400' },
              { label: 'All Time', amount: stats.totalRevenue, color: 'text-amber-400', bg: 'bg-amber-400' },
            ].map(({ label, amount, color, bg }) => {
              const pct = Math.round((amount / stats.totalRevenue) * 100);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">{label}</span>
                    <span className={`text-sm font-bold ${color}`}>₦{(amount / 1000).toFixed(0)}K</span>
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
              <p className="text-lg font-bold">₦{stats.avgTransactionValue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Avg. Transaction</p>
            </div>
            <div className="bg-background rounded-xl p-3 border border-border text-center">
              <p className="text-lg font-bold">{Math.round(stats.totalRevenue / stats.totalUsers).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue / User (₦)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent wallet fundings */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-sm">Recent Wallet Fundings</h2>
          <span className="text-xs text-muted-foreground">{fundingTxns.length} found</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Bank</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {fundingTxns.map(txn => (
                <tr key={txn.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{txn.userName}</p>
                    <p className="text-xs text-muted-foreground">{txn.userId}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{txn.provider}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-400">+₦{txn.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={txn.status} /></td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">{txn.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
