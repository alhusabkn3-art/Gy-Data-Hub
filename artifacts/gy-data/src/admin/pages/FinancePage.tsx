import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, CheckCircle2, XCircle, Clock, AlertCircle,
  RefreshCw, Search, X, DollarSign, TrendingUp, History, Filter,
} from 'lucide-react';
import {
  apiGetFundingRequests, apiGetFundingStats, apiApproveFunding, apiRejectFunding,
  exportToCsv,
  type FundingRequest, type FundingStats,
} from '../utils/adminApi';
import { fmtNaira } from '../utils/format';
import { toast } from 'sonner';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

function GatewayBadge({ gateway }: { gateway: string }) {
  const colorMap: Record<string, string> = {
    paystack:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
    flutterwave: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    manual:    'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  const cls = colorMap[gateway.toLowerCase()] ?? 'bg-white/5 text-muted-foreground border-white/10';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${cls}`}>
      {gateway}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    approved: 'bg-green-500/10 text-green-400 border-green-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const cls = map[status.toLowerCase()] ?? 'bg-white/5 text-muted-foreground border-white/10';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${cls}`}>
      {status}
    </span>
  );
}

// ── Stat Cards ─────────────────────────────────────────────────────────────────

interface StatsRowProps {
  stats: FundingStats | null;
  loading: boolean;
}

function StatsRow({ stats, loading }: StatsRowProps) {
  const cards = [
    {
      label: 'Pending Requests',
      value: loading ? '—' : String(stats?.pendingCount ?? 0),
      sub: loading ? null : fmtNaira(stats?.pendingTotal ?? 0),
      icon: Clock,
      iconBg: 'bg-amber-500/10',
      color: 'text-amber-400',
      subColor: 'text-amber-400/70',
    },
    {
      label: 'Approved Today',
      value: loading ? '—' : String(stats?.approvedToday ?? 0),
      sub: loading ? null : fmtNaira(stats?.approvedTodayTotal ?? 0),
      icon: CheckCircle2,
      iconBg: 'bg-green-500/10',
      color: 'text-green-400',
      subColor: 'text-green-400/70',
    },
    {
      label: 'Rejected Today',
      value: loading ? '—' : String(stats?.rejectedToday ?? 0),
      sub: null,
      icon: XCircle,
      iconBg: 'bg-red-500/10',
      color: 'text-red-400',
      subColor: '',
    },
    {
      label: 'Total Funded All Time',
      value: loading ? '—' : fmtNaira(stats?.totalFundedAllTime ?? 0),
      sub: null,
      icon: TrendingUp,
      iconBg: 'bg-primary/10',
      color: 'text-primary',
      subColor: '',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06]">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-7 w-20 mb-1" />
            ) : (
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            {card.sub && !loading && (
              <p className={`text-xs mt-1 font-medium ${card.subColor}`}>{card.sub}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Approve Modal ──────────────────────────────────────────────────────────────

interface ApproveModalProps {
  request: FundingRequest;
  onClose: () => void;
  onApproved: (id: string, balanceAfter: number) => void;
}

function ApproveModal({ request, onClose, onApproved }: ApproveModalProps) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      const { balanceAfter } = await apiApproveFunding(request.id);
      onApproved(request.id, balanceAfter);
      toast.success(`Wallet credited ${fmtNaira(request.amount)}. New balance: ${fmtNaira(balanceAfter)}`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-lg w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">Approve Funding Request</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{request.userName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{request.userPhone}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{fmtNaira(request.amount)}</p>
              <GatewayBadge gateway={request.gateway} />
            </div>
          </div>

          <div className="bg-white/[0.03] rounded-xl p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Reference</span>
              <span className="text-white font-mono">{request.reference}</span>
            </div>
            <div className="flex justify-between">
              <span>Submitted</span>
              <span className="text-white">{fmtDate(request.createdAt)}</span>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-300">This will immediately credit the user's wallet.</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-xl transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? 'Approving…' : 'Confirm Approve'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Reject Modal ───────────────────────────────────────────────────────────────

interface RejectModalProps {
  request: FundingRequest;
  onClose: () => void;
  onRejected: (id: string) => void;
}

function RejectModal({ request, onClose, onRejected }: RejectModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const isValid = reason.trim().length >= 10;

  async function handleReject() {
    if (!isValid) { toast.error('Please provide a reason (min 10 characters)'); return; }
    setLoading(true);
    try {
      await apiRejectFunding(request.id, reason.trim());
      onRejected(request.id);
      toast.success('Request rejected');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-lg w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">Reject Funding Request</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white font-medium">{request.userName} — {fmtNaira(request.amount)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{request.reference}</p>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Reason for rejection <span className="text-red-400">*</span>
              <span className="ml-1 text-muted-foreground/60">({reason.trim().length}/10 min)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              placeholder="Explain why this funding request is being rejected…"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={loading || !isValid}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            {loading ? 'Rejecting…' : 'Reject Request'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Pending Tab ────────────────────────────────────────────────────────────────

interface PendingTabProps {
  requests: FundingRequest[];
  loading: boolean;
  onApprove: (r: FundingRequest) => void;
  onReject: (r: FundingRequest) => void;
}

function PendingTab({ requests, loading, onApprove, onReject }: PendingTabProps) {
  if (loading && requests.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  if (!loading && requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-white font-semibold text-lg mb-1">All caught up!</h3>
        <p className="text-muted-foreground text-sm">No pending funding requests.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Gateway</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Submitted</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm text-white font-medium">{req.userName}</p>
                  <p className="text-xs text-muted-foreground">{req.userPhone}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{req.reference}</td>
                <td className="px-4 py-3 text-sm font-semibold text-white">{fmtNaira(req.amount)}</td>
                <td className="px-4 py-3"><GatewayBadge gateway={req.gateway} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(req.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onApprove(req)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-500 rounded-xl transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => onReject(req)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── All Requests Tab ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

interface AllRequestsTabProps {
  requests: FundingRequest[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

function AllRequestsTab({ requests, loading, hasMore, onLoadMore }: AllRequestsTabProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filters: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-white/5 text-muted-foreground hover:text-white hover:bg-white/10'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && filtered.length === 0 ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Banknote className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No requests found</p>
        </div>
      ) : (
        <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Gateway</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => (
                  <tr key={req.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium">{req.userName}</p>
                      <p className="text-xs text-muted-foreground">{req.userPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{req.reference}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-white">{fmtNaira(req.amount)}</td>
                    <td className="px-4 py-3"><GatewayBadge gateway={req.gateway} /></td>
                    <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(req.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 flex justify-center border-t border-white/[0.06]">
              <button
                onClick={onLoadMore}
                className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────────

interface HistoryTabProps {
  history: FundingRequest[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onExport: () => void;
}

function HistoryTab({ history, loading, hasMore, onLoadMore, onExport }: HistoryTabProps) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
        >
          <History className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {loading && history.length === 0 ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <History className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No approved funding history</p>
        </div>
      ) : (
        <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Gateway</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Reviewed By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Review Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map(req => (
                  <tr key={req.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium">{req.userName}</p>
                      <p className="text-xs text-muted-foreground">{req.userPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{req.reference}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-white">{fmtNaira(req.amount)}</td>
                    <td className="px-4 py-3"><GatewayBadge gateway={req.gateway} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{req.reviewedByName ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {req.reviewedAt ? fmtDate(req.reviewedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 flex justify-center border-t border-white/[0.06]">
              <button
                onClick={onLoadMore}
                className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type FinanceTab = 'pending' | 'all' | 'history';

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<FinanceTab>('pending');

  // Stats
  const [stats, setStats] = useState<FundingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Pending
  const [pending, setPending] = useState<FundingRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // All Requests
  const [allRequests, setAllRequests] = useState<FundingRequest[]>([]);
  const [allPage, setAllPage] = useState(1);
  const [allTotal, setAllTotal] = useState(0);
  const [allLoading, setAllLoading] = useState(false);

  // History (approved)
  const [historyData, setHistoryData] = useState<FundingRequest[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Modals
  const [approveTarget, setApproveTarget] = useState<FundingRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FundingRequest | null>(null);

  // Auto-refresh interval
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const data = await apiGetFundingStats();
      setStats(data);
    } catch { /* silent */ }
    finally { setStatsLoading(false); }
  }

  async function loadPending() {
    setPendingLoading(true);
    try {
      const { requests } = await apiGetFundingRequests({ status: 'pending' });
      setPending(requests);
    } catch { /* silent */ }
    finally { setPendingLoading(false); }
  }

  async function loadAll(page = 1, append = false) {
    setAllLoading(true);
    try {
      const { requests, total } = await apiGetFundingRequests({ page });
      setAllRequests(prev => append ? [...prev, ...requests] : requests);
      setAllTotal(total);
      setAllPage(page);
    } catch { /* silent */ }
    finally { setAllLoading(false); }
  }

  async function loadHistory(page = 1, append = false) {
    setHistoryLoading(true);
    try {
      const { requests, total } = await apiGetFundingRequests({ status: 'approved', page });
      setHistoryData(prev => append ? [...prev, ...requests] : requests);
      setHistoryTotal(total);
      setHistoryPage(page);
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    void loadStats();
    void loadPending();
    void loadAll();
    void loadHistory();

    // Auto-refresh pending every 30s
    intervalRef.current = setInterval(() => {
      void loadPending();
      void loadStats();
    }, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function handleApproved(id: string, _balanceAfter: number) {
    setPending(prev => prev.filter(r => r.id !== id));
    setAllRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
    void loadStats();
  }

  function handleRejected(id: string) {
    setPending(prev => prev.filter(r => r.id !== id));
    setAllRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r));
    void loadStats();
  }

  function handleExportHistory() {
    const data = historyData.map(r => ({
      User: r.userName,
      Phone: r.userPhone,
      Reference: r.reference,
      Amount: r.amount,
      Gateway: r.gateway,
      'Reviewed By': r.reviewedByName ?? '',
      'Review Time': r.reviewedAt ?? '',
    }));
    exportToCsv(data as unknown as Record<string, unknown>[], 'funding-history');
  }

  const tabs: { key: FinanceTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'pending', label: 'Pending', icon: Clock, badge: pending.length },
    { key: 'all', label: 'All Requests', icon: Filter },
    { key: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg">Finance</h1>
              <p className="text-muted-foreground text-sm">Manage wallet funding requests &amp; approvals</p>
            </div>
          </div>
          <button
            onClick={() => { void loadStats(); void loadPending(); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <StatsRow stats={stats} loading={statsLoading} />
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex items-center gap-1 border-b border-white/[0.06]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'text-white border-primary bg-primary/5'
                  : 'text-muted-foreground border-transparent hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'pending' && (
              <PendingTab
                requests={pending}
                loading={pendingLoading}
                onApprove={setApproveTarget}
                onReject={setRejectTarget}
              />
            )}
            {activeTab === 'all' && (
              <AllRequestsTab
                requests={allRequests}
                loading={allLoading}
                hasMore={allRequests.length < allTotal}
                onLoadMore={() => void loadAll(allPage + 1, true)}
              />
            )}
            {activeTab === 'history' && (
              <HistoryTab
                history={historyData}
                loading={historyLoading}
                hasMore={historyData.length < historyTotal}
                onLoadMore={() => void loadHistory(historyPage + 1, true)}
                onExport={handleExportHistory}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {approveTarget && (
          <ApproveModal
            request={approveTarget}
            onClose={() => setApproveTarget(null)}
            onApproved={handleApproved}
          />
        )}
        {rejectTarget && (
          <RejectModal
            request={rejectTarget}
            onClose={() => setRejectTarget(null)}
            onRejected={handleRejected}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
