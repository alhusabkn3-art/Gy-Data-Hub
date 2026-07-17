import React, { useState } from 'react';
import { Search, X, User, Hash, Calendar, CreditCard } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { AdminTransaction } from '../data/adminMockData';

type FilterStatus = 'all' | 'success' | 'pending' | 'failed';
type FilterType = 'all' | 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';

const typeLabels: Record<string, string> = {
  data: 'Data', airtime: 'Airtime', electricity: 'Electricity',
  cable: 'Cable TV', betting: 'Betting', exam: 'Exam Pin', wallet_fund: 'Wallet Fund',
};

const typeIcons: Record<string, string> = {
  data: '📶', airtime: '📞', electricity: '⚡', cable: '📺',
  betting: '🎯', exam: '📝', wallet_fund: '💰',
};

export default function AdminTransactions() {
  const { transactions, stats } = useAdminContext();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selected, setSelected] = useState<AdminTransaction | null>(null);

  const filtered = transactions.filter(t => {
    const matchSearch =
      t.userName.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.reference.toLowerCase().includes(search.toLowerCase()) ||
      t.provider.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchType = filterType === 'all' || t.type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const totalFiltered = filtered.reduce((acc, t) => acc + (t.status === 'success' ? t.amount : 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats.totalTransactions.toLocaleString()} total · ₦{(stats.totalRevenue / 1_000_000).toFixed(1)}M revenue
          </p>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-xl font-semibold">
            {stats.successfulTransactions.toLocaleString()} Success
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-xl font-semibold">
            {stats.pendingTransactions} Pending
          </div>
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl font-semibold">
            {stats.failedTransactions} Failed
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by user, ID, reference or provider…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl h-10 pl-9 pr-4 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">All Status</option>
          <option value="success">Successful</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as FilterType)}
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">All Types</option>
          <option value="data">Data</option>
          <option value="airtime">Airtime</option>
          <option value="electricity">Electricity</option>
          <option value="cable">Cable TV</option>
          <option value="betting">Betting</option>
          <option value="exam">Exam Pin</option>
          <option value="wallet_fund">Wallet Fund</option>
        </select>
      </div>

      {/* Summary row */}
      {search || filterStatus !== 'all' || filterType !== 'all' ? (
        <div className="flex items-center gap-3 text-sm bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
          <span className="text-muted-foreground">{filtered.length} results</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-primary">₦{totalFiltered.toLocaleString()} revenue</span>
        </div>
      ) : null}

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Transaction</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Service</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map(txn => (
                  <tr key={txn.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{typeIcons[txn.type] ?? '💳'}</span>
                        <div>
                          <p className="font-medium text-xs">{txn.id}</p>
                          <p className="text-[10px] text-muted-foreground">{txn.date} · {txn.time}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="font-medium truncate max-w-[120px]">{txn.userName}</p>
                      <p className="text-xs text-muted-foreground">{txn.userId}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p>{typeLabels[txn.type] ?? txn.service}</p>
                      <p className="text-xs text-muted-foreground">{txn.provider}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={txn.type === 'wallet_fund' ? 'text-green-400' : ''}>
                        {txn.type === 'wallet_fund' ? '+' : ''}₦{txn.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={txn.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelected(txn)}
                        className="text-xs text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors border border-primary/20"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>Showing {filtered.length} transactions</span>
            <span className="font-semibold text-foreground">
              ₦{filtered.reduce((a, t) => a + t.amount, 0).toLocaleString()} total volume
            </span>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selected && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-50 p-5 max-w-sm mx-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{typeIcons[selected.type] ?? '💳'}</span>
                <div>
                  <h2 className="font-bold text-sm">{selected.id}</h2>
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <Row icon={User} label="User" value={`${selected.userName} (${selected.userId})`} />
              <Row icon={Hash} label="Reference" value={selected.reference} mono />
              <Row icon={CreditCard} label="Service" value={`${typeLabels[selected.type]} · ${selected.provider}`} />
              <Row icon={Calendar} label="Date" value={`${selected.date} · ${selected.time}`} />

              <div className="bg-background rounded-xl p-4 border border-border text-center mt-2">
                <p className={`text-2xl font-bold ${selected.type === 'wallet_fund' ? 'text-green-400' : ''}`}>
                  {selected.type === 'wallet_fund' ? '+' : ''}₦{selected.amount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground w-20 flex-shrink-0 text-xs">{label}</span>
      <span className={`font-medium text-xs truncate ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
    </div>
  );
}
