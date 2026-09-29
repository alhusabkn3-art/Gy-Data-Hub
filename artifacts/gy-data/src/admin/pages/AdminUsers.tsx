import React, { useState, useEffect } from 'react';
import {
  Search,
  UserCheck,
  UserX,
  Eye,
  X,
  Phone,
  Mail,
  CreditCard,
  Calendar,
  ShoppingBag,
  RefreshCw,
  Send,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Clipboard,
  Copy,
  Check,
  LogIn,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { AdminUser } from '../data/adminMockData';
import { toast } from 'sonner';
import {
  apiGetUserWallet,
  apiGetWalletLedger,
  apiGetUserTransactions,
  apiGetUserStatusHistory,
  apiChangeUserStatus,
  apiResetLoginPin,
  apiResetPurchasePin,
  WalletSummary,
  WalletLedgerEntry,
  UserTransaction,
  UserStatusHistoryEntry,
  apiGetUserLoginHistory,
  type UserLoginHistoryEntry,
} from '../utils/adminApi';
import { fmtNaira } from '../utils/format';

type FilterStatus = 'all' | 'active' | 'suspended' | 'pending';
type FilterKYC = 'all' | 'verified' | 'pending' | 'unverified' | 'failed';

function safeText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeInitials(value: unknown): string {
  const name = safeText(value, 'Unknown User').trim();
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  );
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function SendMessageModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const { sendTargetedNotification } = useAdminContext();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const e: Record<string, string> = {};

    if (!subject.trim()) e.subject = 'Subject is required';
    if (!body.trim()) e.body = 'Message body is required';

    setErrors(e);

    if (Object.keys(e).length > 0) return;

    setSending(true);

    try {
      const result = await sendTargetedNotification(
        [user.id],
        subject.trim(),
        body.trim(),
      );

      if (result.ok) {
        toast.success(`Message sent to ${safeText(user.name, 'user')}.`);
        onClose();
      } else {
        toast.error(result.error ?? 'Failed to send message.');
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to send message.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-[60] p-5 max-w-md mx-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="font-bold">Send Message</h2>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 p-3 bg-primary/5 border border-primary/15 rounded-xl mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary border border-primary/20 flex-shrink-0">
            {safeInitials(user.name)}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">
              {safeText(user.name, 'Unknown User')}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {safeText(user.phone)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Subject
            </label>

            <input
              type="text"
              value={subject}
              onChange={e => {
                setSubject(e.target.value);
                setErrors(p => ({ ...p, subject: '' }));
              }}
              placeholder="Message subject…"
              className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
            />

            {errors.subject && (
              <p className="text-xs text-red-400 mt-1">{errors.subject}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Message
            </label>

            <textarea
              value={body}
              onChange={e => {
                setBody(e.target.value);
                setErrors(p => ({ ...p, body: '' }));
              }}
              placeholder="Write your message here…"
              rows={4}
              className="w-full bg-background border border-border focus:border-primary rounded-xl px-3 py-3 text-sm outline-none transition-colors resize-none"
            />

            {errors.body && (
              <p className="text-xs text-red-400 mt-1">{errors.body}</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={submit}
              disabled={sending}
              className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Message
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] rounded-lg ${
        className ?? ''
      }`}
    />
  );
}

const txnEmoji: Record<string, string> = {
  data: '📶',
  airtime: '📞',
  electricity: '⚡',
  cable: '📺',
  betting: '🎯',
  exam: '📝',
  wallet_fund: '💰',
};

function getTxnEmoji(type: string): string {
  return txnEmoji[type] ?? '💳';
}

function LedgerTypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    credit: 'bg-green-500/15 text-green-400 border-green-500/25',
    debit: 'bg-red-500/15 text-red-400 border-red-500/25',
    reversal: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    wallet_fund: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    adjustment: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  };

  const cls = map[type] ?? 'bg-white/10 text-white/60 border-white/15';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

function UserDetailModal({
  user,
  onClose,
  onStatusChange,
}: {
  user: AdminUser;
  onClose: () => void;
  onStatusChange: (userId: string, status: 'active' | 'suspended') => void;
}) {
  const { isSuperAdmin } = useAdminContext();

  const [tab, setTab] = useState<
    'profile' | 'wallet' | 'transactions' | 'history' | 'loginHistory'
  >('profile');

  const [walletSummary, setWalletSummary] =
    useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  const [txns, setTxns] = useState<UserTransaction[]>([]);
  const [txnPage, setTxnPage] = useState(1);
  const [txnPages, setTxnPages] = useState(1);
  const [txnFilter, setTxnFilter] = useState('all');
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [txnsLoading, setTxnsLoading] = useState(false);

  const [statusHistory, setStatusHistory] = useState<
    UserStatusHistoryEntry[]
  >([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [statusAction, setStatusAction] = useState<
    'suspend' | 'activate' | null
  >(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const [pinModal, setPinModal] = useState<
    'login' | 'purchase' | null
  >(null);
  const [pinResult, setPinResult] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  const [loginHistory, setLoginHistory] = useState<
    UserLoginHistoryEntry[]
  >([]);
  const [loginHistLoading, setLoginHistLoading] = useState(false);

  useEffect(() => {
    if (tab === 'wallet' && !walletLoaded) {
      setWalletLoading(true);

      Promise.all([
        apiGetUserWallet(user.id),
        apiGetWalletLedger(user.id, 1),
      ])
        .then(([summary, ledgerData]) => {
          setWalletSummary(summary);
          setLedger(ledgerData.entries);
          setLedgerPages(ledgerData.pages);
          setLedgerPage(1);
          setWalletLoaded(true);
        })
        .catch(err => {
          toast.error(`Failed to load wallet: ${(err as Error).message}`);
        })
        .finally(() => setWalletLoading(false));
    }
  }, [tab, walletLoaded, user.id]);

  useEffect(() => {
    if (tab === 'transactions' && !txnsLoaded) {
      setTxnsLoading(true);

      apiGetUserTransactions(user.id, {
        page: 1,
        status: txnFilter,
      })
        .then(data => {
          setTxns(data.transactions);
          setTxnPages(data.pages);
          setTxnPage(1);
          setTxnsLoaded(true);
        })
        .catch(err => {
          toast.error(
            `Failed to load transactions: ${(err as Error).message}`,
          );
        })
        .finally(() => setTxnsLoading(false));
    }
  }, [tab, txnsLoaded, user.id, txnFilter]);

  useEffect(() => {
    if (tab === 'history' && !historyLoaded) {
      setHistoryLoading(true);

      apiGetUserStatusHistory(user.id)
        .then(data => {
          setStatusHistory(data.history);
          setHistoryLoaded(true);
        })
        .catch(err => {
          toast.error(
            `Failed to load history: ${(err as Error).message}`,
          );
        })
        .finally(() => setHistoryLoading(false));
    }
  }, [tab, historyLoaded, user.id]);

  useEffect(() => {
    if (tab !== 'loginHistory' || !user) return;

    setLoginHistLoading(true);

    apiGetUserLoginHistory(user.id)
      .then(r => setLoginHistory(r.history))
      .catch(console.error)
      .finally(() => setLoginHistLoading(false));
  }, [tab, user]);

  const goLedgerPage = async (p: number) => {
    setWalletLoading(true);

    try {
      const data = await apiGetWalletLedger(user.id, p);
      setLedger(data.entries);
      setLedgerPages(data.pages);
      setLedgerPage(p);
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      setWalletLoading(false);
    }
  };

  const fetchTxns = async (page: number, filter: string) => {
    setTxnsLoading(true);

    try {
      const data = await apiGetUserTransactions(user.id, {
        page,
        status: filter,
      });

      setTxns(data.transactions);
      setTxnPages(data.pages);
      setTxnPage(page);
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      setTxnsLoading(false);
    }
  };

  const handleTxnFilter = (f: string) => {
    setTxnFilter(f);
    setTxnsLoaded(false);
    void fetchTxns(1, f);
  };

  const confirmStatusChange = async () => {
    if (!statusAction) return;

    if (statusReason.trim().length < 5) {
      toast.error('Please provide a reason (at least 5 characters).');
      return;
    }

    const newStatus =
      statusAction === 'suspend' ? 'suspended' : 'active';

    setStatusSaving(true);

    try {
      await apiChangeUserStatus(
        user.id,
        newStatus,
        statusReason.trim(),
      );

      toast.success(
        `User ${
          newStatus === 'suspended' ? 'suspended' : 'activated'
        } successfully.`,
      );

      onStatusChange(user.id, newStatus);
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
      setStatusSaving(false);
      setStatusAction(null);
    }
  };

  const handlePinReset = async (
    type: 'login' | 'purchase',
  ) => {
    setPinLoading(true);
    setPinResult(null);

    try {
      const fn =
        type === 'login'
          ? apiResetLoginPin
          : apiResetPurchasePin;

      const res = await fn(user.id);

      setPinResult(res.tempPin);

      toast.success(
        `${
          type === 'login' ? 'Login' : 'Purchase'
        } PIN reset successfully.`,
      );
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
      setPinModal(null);
    } finally {
      setPinLoading(false);
    }
  };

  const copyPin = async () => {
    if (!pinResult) return;

    await navigator.clipboard.writeText(pinResult);
    setPinCopied(true);

    setTimeout(() => setPinCopied(false), 2000);
  };

  const initials = safeInitials(user.name);

  const renderProfile = () => (
    <div className="space-y-4">
      <div className="space-y-0">
        <DetailRow
          icon={Mail}
          label="Email"
          value={safeText(user.email)}
        />

        <DetailRow
          icon={Phone}
          label="Phone"
          value={safeText(user.phone)}
        />

        <DetailRow
          icon={CreditCard}
          label="Bank"
          value={`${safeText(user.bankName)} · ${safeText(
            user.accountNumber,
          )}`}
        />

        <DetailRow
          icon={Calendar}
          label="Joined"
          value={safeText(user.joinedDate)}
        />

        <DetailRow
          icon={ShoppingBag}
          label="Referral"
          value={safeText(user.referralCode)}
        />

        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <ShoppingBag className="w-4 h-4 text-muted-foreground flex-shrink-0" />

          <span className="text-muted-foreground w-24 flex-shrink-0 text-sm">
            KYC
          </span>

          <StatusBadge status={user.kycStatus} />
        </div>

        <DetailRow
          icon={ShoppingBag}
          label="Transactions"
          value={`${safeNumber(
            user.transactionCount,
          )} txns · ₦${safeNumber(
            user.totalSpent,
          ).toLocaleString()} spent`}
        />
      </div>

      <div className="bg-background border border-border rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-primary">
          ₦{safeNumber(user.balance).toLocaleString()}
        </p>

        <p className="text-xs text-muted-foreground mt-1">
          Wallet Balance
        </p>
      </div>

      {statusAction ? (
        <div className="bg-background border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold">
            {statusAction === 'suspend'
              ? '🚫 Suspend User'
              : '✅ Activate User'}
          </p>

          <input
            type="text"
            value={statusReason}
            onChange={e => setStatusReason(e.target.value)}
            placeholder="Reason (required, min 5 chars)…"
            className="w-full bg-card border border-border focus:border-primary rounded-xl h-10 px-3 text-sm outline-none transition-colors"
          />

          <div className="flex gap-2">
            <button
              onClick={() => {
                setStatusAction(null);
                setStatusReason('');
              }}
              className="flex-1 h-9 border border-border rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={confirmStatusChange}
              disabled={
                statusSaving ||
                statusReason.trim().length < 5
              }
              className={`flex-1 h-9 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                statusAction === 'suspend'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {statusSaving ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}

              Confirm{' '}
              {statusAction === 'suspend'
                ? 'Suspend'
                : 'Activate'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {user.status === 'active' && (
            <button
              onClick={() => setStatusAction('suspend')}
              className="flex-1 h-10 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-red-500/20 transition-colors"
            >
              <UserX className="w-3.5 h-3.5" />
              Suspend User
            </button>
          )}

          {user.status === 'suspended' && (
            <button
              onClick={() => setStatusAction('activate')}
              className="flex-1 h-10 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-green-500/20 transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Activate User
            </button>
          )}

          {user.status === 'pending' && (
            <button
              disabled
              className="flex-1 h-10 bg-white/5 text-muted-foreground border border-border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
            >
              Pending Account
            </button>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            PIN Management
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setPinModal('login');
                setPinResult(null);
              }}
              className="flex-1 h-10 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-colors"
            >
              Reset Login PIN
            </button>

            <button
              onClick={() => {
                setPinModal('purchase');
                setPinResult(null);
              }}
              className="flex-1 h-10 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-colors"
            >
              Reset Purchase PIN
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderWallet = () => {
    if (walletLoading && !walletSummary) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-20 rounded-xl"
              />
            ))}
          </div>

          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      );
    }

    if (!walletSummary) {
      return (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No wallet data available.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">
              Balance
            </p>
            <p className="text-lg font-bold mt-1">
              {fmtNaira(walletSummary.balance)}
            </p>
          </div>

          <div className="bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">
              Total Credit
            </p>
            <p className="text-lg font-bold text-green-400 mt-1">
              {fmtNaira(walletSummary.totalCredit)}
            </p>
          </div>

          <div className="bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">
              Total Debit
            </p>
            <p className="text-lg font-bold text-red-400 mt-1">
              {fmtNaira(walletSummary.totalDebit)}
            </p>
          </div>

          <div className="bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">
              Transactions
            </p>
            <p className="text-lg font-bold mt-1">
              {safeNumber(walletSummary.transactionCount)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Wallet Ledger
          </p>

          <button
            onClick={() => void goLedgerPage(1)}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-white/5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {ledger.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No wallet ledger entries.
            </div>
          ) : (
            ledger.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 bg-background border border-border rounded-xl p-3"
              >
                <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                  {getTxnEmoji(entry.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <LedgerTypePill type={entry.type} />
                  </div>

                  <p className="text-xs mt-1 truncate">
                    {safeText(entry.description)}
                  </p>

                  <p className="text-[10px] text-muted-foreground mt-1">
                    {entry.createdAt
                      ? new Date(
                          entry.createdAt,
                        ).toLocaleString('en-NG')
                      : '—'}
                  </p>
                </div>

                <p
                  className={`text-sm font-bold whitespace-nowrap ${
                    entry.type === 'debit'
                      ? 'text-red-400'
                      : 'text-green-400'
                  }`}
                >
                  {entry.type === 'debit' ? '-' : '+'}
                  {fmtNaira(entry.amount)}
                </p>
              </div>
            ))
          )}
        </div>

        {ledgerPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              disabled={ledgerPage <= 1 || walletLoading}
              onClick={() =>
                void goLedgerPage(ledgerPage - 1)
              }
              className="w-8 h-8 border border-border rounded-lg flex items-center justify-center disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs text-muted-foreground">
              Page {ledgerPage} of {ledgerPages}
            </span>

            <button
              disabled={
                ledgerPage >= ledgerPages ||
                walletLoading
              }
              onClick={() =>
                void goLedgerPage(ledgerPage + 1)
              }
              className="w-8 h-8 border border-border rounded-lg flex items-center justify-center disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderTransactions = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          ['all', 'All'],
          ['completed', 'Completed'],
          ['pending', 'Pending'],
          ['failed', 'Failed'],
          ['reversed', 'Reversed'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => handleTxnFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              txnFilter === value
                ? 'bg-primary text-white'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {txnsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : txns.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No transactions found.
        </div>
      ) : (
        <div className="space-y-2">
          {txns.map(tx => (
            <div
              key={tx.id}
              className="flex items-center gap-3 bg-background border border-border rounded-xl p-3"
            >
              <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                {getTxnEmoji(tx.type)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">
                  {safeText(tx.description)}
                </p>

                <p className="text-[10px] text-muted-foreground mt-1">
                  {tx.createdAt
                    ? new Date(
                        tx.createdAt,
                      ).toLocaleString('en-NG')
                    : '—'}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-bold">
                  {fmtNaira(tx.amount)}
                </p>

                <p
                  className={`text-[10px] mt-0.5 ${
                    tx.status === 'completed'
                      ? 'text-green-400'
                      : tx.status === 'failed'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}
                >
                  {safeText(tx.status)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {txnPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={txnPage <= 1 || txnsLoading}
            onClick={() =>
              void fetchTxns(
                txnPage - 1,
                txnFilter,
              )
            }
            className="w-8 h-8 border border-border rounded-lg flex items-center justify-center disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs text-muted-foreground">
            Page {txnPage} of {txnPages}
          </span>

          <button
            disabled={
              txnPage >= txnPages || txnsLoading
            }
            onClick={() =>
              void fetchTxns(
                txnPage + 1,
                txnFilter,
              )
            }
            className="w-8 h-8 border border-border rounded-lg flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-3">
      {historyLoading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))
      ) : statusHistory.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No status history available.
        </div>
      ) : (
        statusHistory.map(item => (
          <div
            key={item.id}
            className="bg-background border border-border rounded-xl p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`text-xs font-semibold ${
                  item.status === 'active'
                    ? 'text-green-400'
                    : item.status === 'suspended'
                    ? 'text-red-400'
                    : 'text-amber-400'
                }`}
              >
                {safeText(item.status)}
              </span>

              <span className="text-[10px] text-muted-foreground">
                {item.createdAt
                  ? new Date(
                      item.createdAt,
                    ).toLocaleString('en-NG')
                  : '—'}
              </span>
            </div>

            <p className="text-xs mt-2">
              {safeText(item.reason)}
            </p>

            <p className="text-[10px] text-muted-foreground mt-1">
              Changed by: {safeText(item.changedBy)}
            </p>
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-4 md:inset-y-6 md:left-1/2 md:-translate-x-1/2 md:w-[720px] bg-[#0A1628] border border-border rounded-2xl z-50 overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
              {initials}
            </div>

            <div className="min-w-0">
              <h2 className="font-bold truncate">
                {safeText(user.name, 'Unknown User')}
              </h2>

              <p className="text-xs text-muted-foreground truncate">
                {safeText(user.phone)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-3 border-b border-border overflow-x-auto">
          {[
            'profile',
            'wallet',
            'transactions',
            'history',
          ].map(t => (
            <button
              key={t}
              onClick={() => setTab(t as typeof tab)}
              className={`px-4 py-2 text-sm transition-colors capitalize rounded-t-lg whitespace-nowrap ${
                tab === t
                  ? 'bg-primary text-white font-semibold'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}

          <button
            onClick={() => setTab('loginHistory')}
            className={`px-4 py-2 text-sm transition-colors rounded-t-lg whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'loginHistory'
                ? 'bg-primary text-white font-semibold'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Login History
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'profile' && renderProfile()}
          {tab === 'wallet' && renderWallet()}
          {tab === 'transactions' && renderTransactions()}
          {tab === 'history' && renderHistory()}

          {tab === 'loginHistory' && (
            <div className="space-y-2">
              {loginHistLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse bg-white/5 rounded-lg h-12"
                  />
                ))
              ) : loginHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No login history available
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.03]">
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground">
                          Time
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground">
                          IP Address
                        </th>
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground">
                          Device
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {loginHistory.map(h => (
                        <tr
                          key={h.id}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                        >
                          <td className="px-3 py-2.5 text-xs">
                            {h.createdAt
                              ? new Date(
                                  h.createdAt,
                                ).toLocaleString('en-NG')
                              : '—'}
                          </td>

                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                h.status === 'success'
                                  ? 'bg-green-500/15 text-green-400'
                                  : 'bg-red-500/15 text-red-400'
                              }`}
                            >
                              {safeText(
                                h.status,
                                'unknown',
                              )}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 text-xs font-mono">
                            {safeText(h.ipAddress)}
                          </td>

                          <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
                            {safeText(
                              h.userAgent,
                              '',
                            ).slice(0, 50) || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {pinModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
            onClick={() => {
              if (!pinLoading) {
                setPinModal(null);
                setPinResult(null);
              }
            }}
          />

          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-[60] p-5 max-w-sm mx-auto shadow-2xl">
            {pinResult ? (
              <div className="space-y-4">
                <p className="font-bold text-sm">
                  {pinModal === 'login'
                    ? 'Login'
                    : 'Purchase'}{' '}
                  PIN Reset Successful
                </p>

                <p className="text-xs text-muted-foreground">
                  This is the user's new permanent PIN.
                  The previous PIN has been invalidated.
                </p>

                <div className="flex items-center gap-3 bg-background border border-border rounded-xl p-3">
                  <p className="text-2xl font-mono font-bold tracking-widest flex-1 text-center">
                    {pinResult}
                  </p>

                  <button
                    onClick={copyPin}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors"
                  >
                    {pinCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setPinModal(null);
                    setPinResult(null);
                  }}
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="font-bold text-sm">
                  Reset{' '}
                  {pinModal === 'login'
                    ? 'Login'
                    : 'Purchase'}{' '}
                  PIN
                </p>

                <p className="text-xs text-muted-foreground">
                  This will generate a new permanent PIN for{' '}
                  <strong>
                    {safeText(user.name, 'this user')}
                  </strong>
                  . The current PIN will be invalidated
                  immediately.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => setPinModal(null)}
                    disabled={pinLoading}
                    className="flex-1 h-10 border border-border rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={() =>
                      handlePinReset(pinModal)
                    }
                    disabled={pinLoading}
                    className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {pinLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{
    className?: string;
  }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      <span className="text-muted-foreground w-24 flex-shrink-0 text-sm">
        {label}
      </span>

      <span className="text-sm truncate">
        {value}
      </span>
    </div>
  );
}

export default function AdminUsers() {
  const {
    users,
    usersTotal,
    usersLoading,
    updateUserStatus,
    fetchUsers,
  } = useAdminContext();

  const [search, setSearch] = useState('');
  const [status, setStatus] =
    useState<FilterStatus>('all');
  const [kyc, setKyc] =
    useState<FilterKYC>('all');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] =
    useState<AdminUser | null>(null);
  const [messageUser, setMessageUser] =
    useState<AdminUser | null>(null);

  const pageSize = 20;

  useEffect(() => {
    void fetchUsers({
      page,
      limit: pageSize,
      search: search.trim() || undefined,
      status:
        status === 'all' ? undefined : status,
      kycStatus:
        kyc === 'all' ? undefined : kyc,
    });
  }, [
    page,
    search,
    status,
    kyc,
    fetchUsers,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      safeNumber(usersTotal) / pageSize,
    ),
  );

  const changeStatus = (
    userId: string,
    newStatus: 'active' | 'suspended',
  ) => {
    updateUserStatus(userId, newStatus);
    setSelectedUser(current =>
      current?.id === userId
        ? {
            ...current,
            status: newStatus,
          }
        : current,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">
            Users
          </h1>

          <p className="text-sm text-muted-foreground mt-1">
            Manage registered GY DATA users.
          </p>
        </div>

        <div className="text-sm text-muted-foreground">
          {safeNumber(usersTotal).toLocaleString()} users
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, phone or email…"
              className="w-full h-11 bg-background border border-border focus:border-primary rounded-xl pl-10 pr-3 text-sm outline-none"
            />
          </div>

          <select
            value={status}
            onChange={e => {
              setStatus(
                e.target.value as FilterStatus,
              );
              setPage(1);
            }}
            className="h-11 bg-background border border-border rounded-xl px-3 text-sm outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">
              Suspended
            </option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={kyc}
            onChange={e => {
              setKyc(
                e.target.value as FilterKYC,
              );
              setPage(1);
            }}
            className="h-11 bg-background border border-border rounded-xl px-3 text-sm outline-none"
          >
            <option value="all">All KYC</option>
            <option value="verified">
              Verified
            </option>
            <option value="pending">Pending</option>
            <option value="unverified">
              Unverified
            </option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={() => {
              void fetchUsers({
                page,
                limit: pageSize,
                search:
                  search.trim() || undefined,
                status:
                  status === 'all'
                    ? undefined
                    : status,
                kycStatus:
                  kyc === 'all' ? undefined : kyc,
              });
            }}
            className="h-11 px-4 bg-primary text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {usersLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map(
              (_, i) => (
                <Skeleton
                  key={i}
                  className="h-16"
                />
              ),
            )}
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-border">
                    <th className="px-4 py-3 text-left text-xs text-muted-foreground">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-muted-foreground">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-muted-foreground">
                      Wallet
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-muted-foreground">
                      KYC
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {users.map(user => (
                    <tr
                      key={user.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                            {safeInitials(
                              user.name,
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold truncate max-w-[180px]">
                              {safeText(
                                user.name,
                                'Unknown User',
                              )}
                            </p>

                            <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {safeText(user.email)}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs">
                        {safeText(user.phone)}
                      </td>

                      <td className="px-4 py-3 text-xs font-semibold">
                        ₦
                        {safeNumber(
                          user.balance,
                        ).toLocaleString()}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge
                          status={user.status}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge
                          status={user.kycStatus}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end items-center gap-1.5">
                          <button
                            onClick={() =>
                              setSelectedUser(user)
                            }
                            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-white/5"
                            title="View user"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() =>
                              setMessageUser(user)
                            }
                            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-white/5"
                            title="Send message"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>

              <div className="flex items-center gap-2">
                <button
                  disabled={
                    page <= 1 || usersLoading
                  }
                  onClick={() =>
                    setPage(p =>
                      Math.max(1, p - 1),
                    )
                  }
                  className="w-9 h-9 border border-border rounded-lg flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  disabled={
                    page >= totalPages ||
                    usersLoading
                  }
                  onClick={() =>
                    setPage(p =>
                      Math.min(
                        totalPages,
                        p + 1,
                      ),
                    )
                  }
                  className="w-9 h-9 border border-border rounded-lg flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() =>
            setSelectedUser(null)
          }
          onStatusChange={changeStatus}
        />
      )}

      {messageUser && (
        <SendMessageModal
          user={messageUser}
          onClose={() =>
            setMessageUser(null)
          }
        />
      )}
    </div>
  );
}
