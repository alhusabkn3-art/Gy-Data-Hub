import React, { useState, useEffect } from 'react';
import { Search, UserCheck, UserX, Eye, X, Phone, Mail, CreditCard, Calendar, ShoppingBag, RefreshCw, Send, MessageSquare, ChevronLeft, ChevronRight, ArrowRight, Clipboard, Copy, Check } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { AdminUser } from '../data/adminMockData';
import { toast } from 'sonner';
import {
  apiGetUserWallet, apiGetWalletLedger, apiGetUserTransactions,
  apiGetUserStatusHistory, apiChangeUserStatus, apiResetLoginPin,
  apiResetPurchasePin, WalletSummary, WalletLedgerEntry,
  UserTransaction, UserStatusHistoryEntry,
} from '../utils/adminApi';
import { fmtNaira } from '../utils/format';

type FilterStatus = 'all' | 'active' | 'suspended' | 'pending';
type FilterKYC    = 'all' | 'verified' | 'pending' | 'unverified' | 'failed';

// ── Send Message modal ────────────────────────────────────────────────────────

function SendMessageModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { addAnnouncement } = useAdminContext();
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!body.trim())    e.body    = 'Message body is required';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSending(true);
    await new Promise(r => setTimeout(r, 700));

    // Store as a targeted announcement so it appears in Notifications history
    addAnnouncement({
      title:  subject.trim(),
      body:   `[To: ${user.name} · ${user.phone}] ${body.trim()}`,
      target: 'all',
      status: 'sent',
    });

    toast.success(`Message sent to ${user.name}.`);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={onClose} />
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

        {/* Recipient pill */}
        <div className="flex items-center gap-2.5 p-3 bg-primary/5 border border-primary/15 rounded-xl mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary border border-primary/20 flex-shrink-0">
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">{user.phone}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => { setSubject(e.target.value); setErrors(p => ({ ...p, subject: '' })); }}
              placeholder="Message subject…"
              className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
            />
            {errors.subject && <p className="text-xs text-red-400 mt-1">{errors.subject}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Message</label>
            <textarea
              value={body}
              onChange={e => { setBody(e.target.value); setErrors(p => ({ ...p, body: '' })); }}
              placeholder="Write your message here…"
              rows={4}
              className="w-full bg-background border border-border focus:border-primary rounded-xl px-3 py-3 text-sm outline-none transition-colors resize-none"
            />
            {errors.body && <p className="text-xs text-red-400 mt-1">{errors.body}</p>}
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
              {sending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</>
                : <><Send className="w-4 h-4" />Send Message</>
              }
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} />;
}

// ── Type emoji map ─────────────────────────────────────────────────────────────
const txnEmoji: Record<string, string> = {
  data: '📶', airtime: '📞', electricity: '⚡', cable: '📺',
  betting: '🎯', exam: '📝', wallet_fund: '💰',
};
function getTxnEmoji(type: string): string {
  return txnEmoji[type] ?? '💳';
}

// ── Ledger type pill ──────────────────────────────────────────────────────────
function LedgerTypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    credit:      'bg-green-500/15 text-green-400 border-green-500/25',
    debit:       'bg-red-500/15 text-red-400 border-red-500/25',
    reversal:    'bg-purple-500/15 text-purple-400 border-purple-500/25',
    wallet_fund: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    adjustment:  'bg-amber-500/15 text-amber-400 border-amber-500/25',
  };
  const cls = map[type] ?? 'bg-white/10 text-white/60 border-white/15';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {type.replace('_', ' ')}
    </span>
  );
}

// ── UserDetailModal ───────────────────────────────────────────────────────────
function UserDetailModal({ user, onClose, onStatusChange }: {
  user: AdminUser;
  onClose: () => void;
  onStatusChange: (userId: string, status: 'active' | 'suspended') => void;
}) {
  const { isSuperAdmin } = useAdminContext();

  const [tab, setTab] = useState<'profile' | 'wallet' | 'transactions' | 'history'>('profile');

  // Wallet tab state
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  // Transactions tab state
  const [txns, setTxns] = useState<UserTransaction[]>([]);
  const [txnPage, setTxnPage] = useState(1);
  const [txnPages, setTxnPages] = useState(1);
  const [txnFilter, setTxnFilter] = useState('all');
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [txnsLoading, setTxnsLoading] = useState(false);

  // History tab state
  const [statusHistory, setStatusHistory] = useState<UserStatusHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Status change state
  const [statusAction, setStatusAction] = useState<'suspend' | 'activate' | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // PIN reset state
  const [pinModal, setPinModal] = useState<'login' | 'purchase' | null>(null);
  const [pinResult, setPinResult] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  // ── Data fetching via useEffect ──────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'wallet' && !walletLoaded) {
      setWalletLoading(true);
      Promise.all([
        apiGetUserWallet(user.id),
        apiGetWalletLedger(user.id, 1),
      ]).then(([summary, ledgerData]) => {
        setWalletSummary(summary);
        setLedger(ledgerData.entries);
        setLedgerPages(ledgerData.pages);
        setLedgerPage(1);
        setWalletLoaded(true);
      }).catch(err => {
        toast.error(`Failed to load wallet: ${(err as Error).message}`);
      }).finally(() => setWalletLoading(false));
    }
  }, [tab, walletLoaded, user.id]);

  useEffect(() => {
    if (tab === 'transactions' && !txnsLoaded) {
      setTxnsLoading(true);
      apiGetUserTransactions(user.id, { page: 1, status: txnFilter }).then(data => {
        setTxns(data.transactions);
        setTxnPages(data.pages);
        setTxnPage(1);
        setTxnsLoaded(true);
      }).catch(err => {
        toast.error(`Failed to load transactions: ${(err as Error).message}`);
      }).finally(() => setTxnsLoading(false));
    }
  }, [tab, txnsLoaded, user.id, txnFilter]);

  useEffect(() => {
    if (tab === 'history' && !historyLoaded) {
      setHistoryLoading(true);
      apiGetUserStatusHistory(user.id).then(data => {
        setStatusHistory(data.history);
        setHistoryLoaded(true);
      }).catch(err => {
        toast.error(`Failed to load history: ${(err as Error).message}`);
      }).finally(() => setHistoryLoading(false));
    }
  }, [tab, historyLoaded, user.id]);

  // ── Ledger pagination ───────────────────────────────────────────────────────
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

  // ── Transaction pagination / filter ────────────────────────────────────────
  const fetchTxns = async (page: number, filter: string) => {
    setTxnsLoading(true);
    try {
      const data = await apiGetUserTransactions(user.id, { page, status: filter });
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

  // ── Status change ───────────────────────────────────────────────────────────
  const confirmStatusChange = async () => {
    if (!statusAction) return;
    if (statusReason.trim().length < 5) {
      toast.error('Please provide a reason (at least 5 characters).');
      return;
    }
    const newStatus = statusAction === 'suspend' ? 'suspended' : 'active';
    setStatusSaving(true);
    try {
      await apiChangeUserStatus(user.id, newStatus, statusReason.trim());
      toast.success(`User ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully.`);
      onStatusChange(user.id, newStatus);
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
      setStatusSaving(false);
      setStatusAction(null);
    }
  };

  // ── PIN reset ───────────────────────────────────────────────────────────────
  const handlePinReset = async (type: 'login' | 'purchase') => {
    setPinLoading(true);
    setPinResult(null);
    try {
      const fn = type === 'login' ? apiResetLoginPin : apiResetPurchasePin;
      const res = await fn(user.id);
      setPinResult(res.tempPin);
      toast.success(`${type === 'login' ? 'Login' : 'Purchase'} PIN reset successfully.`);
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

  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  // ── Tab rendering ────────────────────────────────────────────────────────────

  const renderProfile = () => (
    <div className="space-y-4">
      {/* Info grid */}
      <div className="space-y-0">
        <DetailRow icon={Mail}        label="Email"        value={user.email} />
        <DetailRow icon={Phone}       label="Phone"        value={user.phone} />
        <DetailRow icon={CreditCard}  label="Bank"         value={`${user.bankName} · ${user.accountNumber}`} />
        <DetailRow icon={Calendar}    label="Joined"       value={user.joinedDate} />
        <DetailRow icon={ShoppingBag} label="Referral"     value={user.referralCode ?? '—'} />
        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <ShoppingBag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground w-24 flex-shrink-0 text-sm">KYC</span>
          <StatusBadge status={user.kycStatus} />
        </div>
        <DetailRow icon={ShoppingBag} label="Transactions" value={`${user.transactionCount} txns · ₦${user.totalSpent.toLocaleString()} spent`} />
      </div>

      {/* Balance card */}
      <div className="bg-background border border-border rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-primary">₦{user.balance.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">Wallet Balance</p>
      </div>

      {/* Status action */}
      {statusAction ? (
        <div className="bg-background border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold">
            {statusAction === 'suspend' ? '🚫 Suspend User' : '✅ Activate User'}
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
              onClick={() => { setStatusAction(null); setStatusReason(''); }}
              className="flex-1 h-9 border border-border rounded-xl text-xs font-semibold hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmStatusChange}
              disabled={statusSaving || statusReason.trim().length < 5}
              className={`flex-1 h-9 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                statusAction === 'suspend'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {statusSaving
                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : null
              }
              Confirm {statusAction === 'suspend' ? 'Suspend' : 'Activate'}
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
              <UserX className="w-3.5 h-3.5" /> Suspend User
            </button>
          )}
          {user.status === 'suspended' && (
            <button
              onClick={() => setStatusAction('activate')}
              className="flex-1 h-10 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-green-500/20 transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" /> Activate User
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

      {/* PIN resets (super admin only) */}
      {isSuperAdmin && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PIN Management</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setPinModal('login'); setPinResult(null); }}
              className="flex-1 h-10 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-colors"
            >
              Reset Login PIN
            </button>
            <button
              onClick={() => { setPinModal('purchase'); setPinResult(null); }}
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
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {walletSummary && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background border border-border rounded-xl p-3 text-center">
              <p className="text-lg font-bold">{fmtNaira(walletSummary.balance)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Balance</p>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-400">{fmtNaira(walletSummary.totalCredited)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Credited</p>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-red-400">{fmtNaira(walletSummary.totalDebited)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Debited</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-amber-400">{fmtNaira(walletSummary.totalReversed)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Reversed</p>
            </div>
          </div>
        )}

        {/* Ledger table */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Type</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Amount</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden sm:table-cell">After</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden md:table-cell">Reason</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {walletLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-3 py-2 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="px-3 py-2 text-right hidden sm:table-cell"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="px-3 py-2 hidden md:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    </tr>
                  ))
                ) : ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">No ledger entries found.</td>
                  </tr>
                ) : (
                  ledger.map(entry => (
                    <tr key={entry.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2"><LedgerTypePill type={entry.type} /></td>
                      <td className="px-3 py-2 text-right font-semibold">
                        <span className={entry.type === 'credit' || entry.type === 'wallet_fund' || entry.type === 'reversal' ? 'text-green-400' : 'text-red-400'}>
                          {fmtNaira(entry.amount)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground hidden sm:table-cell">{fmtNaira(entry.balanceAfter)}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[140px] truncate">
                        {entry.reason ?? '—'}
                        {entry.performedByName && <span className="text-[10px] text-muted-foreground/60 ml-1">· {entry.performedByName}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ledger pagination */}
        {ledgerPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              disabled={ledgerPage <= 1 || walletLoading}
              onClick={() => goLedgerPage(ledgerPage - 1)}
              className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-lg disabled:opacity-40 hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span>Page {ledgerPage} of {ledgerPages}</span>
            <button
              disabled={ledgerPage >= ledgerPages || walletLoading}
              onClick={() => goLedgerPage(ledgerPage + 1)}
              className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-lg disabled:opacity-40 hover:bg-white/5 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderTransactions = () => {
    if (txnsLoading && txns.length === 0) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full rounded-xl" />
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {/* Filter */}
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'success', 'pending', 'failed'].map(f => (
            <button
              key={f}
              onClick={() => handleTxnFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                txnFilter === f
                  ? 'bg-primary text-white'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Service</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Amount</th>
                  <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Ref</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {txnsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-3 py-2 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="px-3 py-2 text-center"><Skeleton className="h-4 w-14 mx-auto rounded-full" /></td>
                      <td className="px-3 py-2 hidden sm:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-3 py-2"><Skeleton className="h-4 w-18" /></td>
                    </tr>
                  ))
                ) : txns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">No transactions found.</td>
                  </tr>
                ) : (
                  txns.map(tx => (
                    <tr key={tx.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2">
                        <span className="mr-1">{getTxnEmoji(tx.type)}</span>
                        <span className="capitalize">{tx.service}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtNaira(tx.amount)}</td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell max-w-[100px] truncate">
                        {tx.reference}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {txnPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              disabled={txnPage <= 1 || txnsLoading}
              onClick={() => fetchTxns(txnPage - 1, txnFilter)}
              className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-lg disabled:opacity-40 hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span>Page {txnPage} of {txnPages}</span>
            <button
              disabled={txnPage >= txnPages || txnsLoading}
              onClick={() => fetchTxns(txnPage + 1, txnFilter)}
              className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-lg disabled:opacity-40 hover:bg-white/5 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderHistory = () => {
    if (historyLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      );
    }
    if (statusHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
          <Clipboard className="w-10 h-10 opacity-30" />
          <p className="text-sm">No status changes recorded</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {statusHistory.map(entry => (
          <div key={entry.id} className="bg-background border border-border rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={entry.previousStatus} />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <StatusBadge status={entry.newStatus} />
            </div>
            {entry.reason && (
              <p className="text-xs text-muted-foreground">{entry.reason}</p>
            )}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
              <span>{entry.performedByName ? `by ${entry.performedByName}` : 'System'}</span>
              <span>{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-50 p-0 shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary border border-primary/20 flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-bold truncate">{user.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground">{user.phone}</p>
                <StatusBadge status={user.status} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="px-5 pt-3 border-b border-border flex gap-1 flex-shrink-0">
          {(['profile', 'wallet', 'transactions', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm transition-colors capitalize rounded-t-lg ${
                tab === t
                  ? 'bg-primary text-white font-semibold'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'profile'      && renderProfile()}
          {tab === 'wallet'       && renderWallet()}
          {tab === 'transactions' && renderTransactions()}
          {tab === 'history'      && renderHistory()}
        </div>
      </div>

      {/* PIN Reset confirm dialog */}
      {pinModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => { if (!pinLoading) { setPinModal(null); setPinResult(null); } }} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-[60] p-5 max-w-sm mx-auto shadow-2xl">
            {pinResult ? (
              <div className="space-y-4">
                <p className="font-bold text-sm">
                  {pinModal === 'login' ? 'Login' : 'Purchase'} PIN Reset Successful
                </p>
                <p className="text-xs text-muted-foreground">Share this temporary PIN with the user. They should change it immediately after login.</p>
                <div className="flex items-center gap-3 bg-background border border-border rounded-xl p-3">
                  <p className="text-2xl font-mono font-bold tracking-widest flex-1 text-center">{pinResult}</p>
                  <button
                    onClick={copyPin}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors"
                  >
                    {pinCopied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <button
                  onClick={() => { setPinModal(null); setPinResult(null); }}
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="font-bold text-sm">
                  Reset {pinModal === 'login' ? 'Login' : 'Purchase'} PIN
                </p>
                <p className="text-xs text-muted-foreground">
                  This will generate a new temporary PIN for <strong>{user.name}</strong>. The current PIN will be invalidated immediately.
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
                    onClick={() => handlePinReset(pinModal)}
                    disabled={pinLoading}
                    className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {pinLoading
                      ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : null
                    }
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

export default function AdminUsers() {
  const { users, usersTotal, usersLoading, updateUserStatus, fetchUsers } = useAdminContext();
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterKYC,    setFilterKYC]    = useState<FilterKYC>('all');
  const [selectedUser,  setSelectedUser]  = useState<AdminUser | null>(null);
  const [messagingUser, setMessagingUser] = useState<AdminUser | null>(null);

  // Client-side filter on the loaded batch
  const filtered = users.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search) ||
      u.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    const matchKYC    = filterKYC    === 'all' || u.kycStatus === filterKYC;
    return matchSearch && matchStatus && matchKYC;
  });

  const handleSuspend = async (u: AdminUser) => {
    const ok = await updateUserStatus(u.id, 'suspended');
    if (ok) { toast.success(`${u.name} has been suspended.`); setSelectedUser(null); }
    else     toast.error('Failed to suspend user. Please try again.');
  };

  const handleActivate = async (u: AdminUser) => {
    const ok = await updateUserStatus(u.id, 'active');
    if (ok) { toast.success(`${u.name} has been activated.`); setSelectedUser(null); }
    else     toast.error('Failed to activate user. Please try again.');
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {usersLoading ? 'Loading…' : `${usersTotal.toLocaleString()} registered users`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2 text-xs">
            {usersLoading ? (
              <Skeleton className="h-7 w-20 rounded-xl" />
            ) : (
              <>
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-xl font-semibold">
                  {users.filter(u => u.status === 'active').length} Active
                </div>
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl font-semibold">
                  {users.filter(u => u.status === 'suspended').length} Suspended
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => fetchUsers()}
            disabled={usersLoading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, phone or ID…"
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
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={filterKYC}
          onChange={e => setFilterKYC(e.target.value as FilterKYC)}
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">All KYC</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="unverified">Unverified</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Phone</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Balance</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">KYC</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && users.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                        <div>
                          <Skeleton className="h-4 w-28 mb-1" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-5 w-14 mx-auto rounded-full" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-6 w-12 mx-auto rounded-lg" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-muted-foreground text-sm">
                    {users.length === 0
                      ? 'No registered users yet.'
                      : 'No users match your filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 border border-primary/20">
                          {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{u.phone}</td>
                    <td className="px-4 py-3 text-right font-semibold hidden sm:table-cell">
                      ₦{u.balance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={u.kycStatus} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors border border-primary/20"
                      >
                        <Eye className="w-3 h-3" /> View
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
            <span>Showing {filtered.length} of {usersTotal.toLocaleString()} users</span>
            {usersTotal > users.length && (
              <span className="text-amber-400">Showing first {users.length} — use filters to narrow down</span>
            )}
          </div>
        )}
      </div>

      {/* Send Message Modal */}
      {messagingUser && (
        <SendMessageModal user={messagingUser} onClose={() => setMessagingUser(null)} />
      )}

      {/* User Detail Modal (4-tab) */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onStatusChange={(id, status) => {
            void updateUserStatus(id, status);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground w-24 flex-shrink-0 text-sm">{label}</span>
      <span className="font-medium text-sm truncate">{value}</span>
    </div>
  );
}
