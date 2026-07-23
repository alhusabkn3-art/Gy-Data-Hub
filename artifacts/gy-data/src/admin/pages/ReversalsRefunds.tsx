import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Search, RefreshCw, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { apiGetReversals, ReversalRecord } from '../utils/adminApi';
import { fmtNaira } from '../utils/format';
import { toast } from 'sonner';

// ── Skeleton helper ────────────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className}`} />;
}

// ── Type emoji map ─────────────────────────────────────────────────────────────
const TYPE_EMOJI: Record<string, string> = {
  data:         '📶',
  airtime:      '📞',
  electricity:  '⚡',
  cable:        '📺',
  betting:      '🎯',
  exam:         '📝',
  wallet_fund:  '💰',
};

function txEmoji(type: string) {
  return TYPE_EMOJI[type] ?? '💳';
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReversalsRefunds() {
  const [reversals, setReversals]   = useState<ReversalRecord[]>([]);
  const [total, setTotal]           = useState(0);
  const [pages, setPages]           = useState(1);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');

  const fetchReversals = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetReversals({ page: p });
      setReversals(data.reversals);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load reversals';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReversals(page);
  }, [page, fetchReversals]);

  // Client-side search filter
  const filtered = reversals.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.userName.toLowerCase().includes(q) ||
      r.userPhone.includes(q) ||
      (r.txReference ?? '').toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q)
    );
  });

  // Summary values
  const totalAmount = reversals.reduce((s, r) => s + r.amount, 0);
  const latestDate = reversals.length > 0
    ? new Date(reversals[0].createdAt).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : 'None';

  function handlePageChange(next: number) {
    if (next < 1 || next > pages || loading) return;
    setPage(next);
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <RotateCcw className="text-amber-400" size={24} />
            <h1 className="text-2xl font-bold text-white">Reversals &amp; Refunds</h1>
          </div>
          <p className="text-sm text-zinc-400">
            Full history of reversed transactions and wallet refunds
          </p>
        </div>
        <button
          onClick={() => fetchReversals(page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-border text-sm text-zinc-300 hover:bg-white/[0.1] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Reversals */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight size={16} className="text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Total Reversals</p>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-3xl font-bold text-white">{total.toLocaleString()}</p>
          )}
        </div>

        {/* Total Amount Reversed */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw size={16} className="text-amber-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Total Reversed</p>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <p className="text-3xl font-bold text-amber-400">{fmtNaira(totalAmount)}</p>
          )}
        </div>

        {/* Latest Date */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={16} className="text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Latest Reversal</p>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <p className="text-xl font-bold text-white">{latestDate}</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by name, phone, reference, or reason…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/[0.05] border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-center justify-between">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchReversals(page)}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-white/[0.02]">
                {['Original TX', 'User', 'Amount', 'Reason', 'Performed By', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center">
                    <RotateCcw size={36} className="mx-auto mb-4 text-zinc-600" />
                    <p className="text-zinc-500 font-medium">No reversals recorded yet</p>
                    {search && (
                      <p className="text-zinc-600 text-xs mt-1">Try adjusting your search</p>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(r => {
                  const shortTxId = r.originalTransactionId.length > 12
                    ? `${r.originalTransactionId.slice(0, 12)}…`
                    : r.originalTransactionId;
                  const reason = r.reason.length > 40
                    ? `${r.reason.slice(0, 40)}…`
                    : r.reason;
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.025] transition-colors">
                      {/* Original TX */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{txEmoji(r.txType)}</span>
                          <div>
                            <p className="text-zinc-300 font-mono text-xs leading-tight">{shortTxId}</p>
                            <p className="text-zinc-500 text-[11px] capitalize">{r.txType}</p>
                          </div>
                        </div>
                      </td>
                      {/* User */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-white leading-tight">{r.userName}</p>
                        <p className="text-xs text-zinc-500 font-mono">{r.userPhone}</p>
                      </td>
                      {/* Amount */}
                      <td className="px-4 py-3">
                        <span className="font-bold text-amber-400">{fmtNaira(r.amount)}</span>
                      </td>
                      {/* Reason */}
                      <td className="px-4 py-3 text-zinc-400 max-w-[180px]">
                        {reason}
                      </td>
                      {/* Performed By */}
                      <td className="px-4 py-3 text-zinc-400 text-xs">{r.performedByName}</td>
                      {/* Date */}
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString('en-NG', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Page {page} of {pages} · {total} total
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => handlePageChange(page - 1)}
                className="p-1.5 rounded-lg border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={page >= pages || loading}
                onClick={() => handlePageChange(page + 1)}
                className="p-1.5 rounded-lg border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
