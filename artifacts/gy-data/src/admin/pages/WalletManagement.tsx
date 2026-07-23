import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Wallet, ArrowUpRight, ArrowDownLeft,
  X, Check, ChevronLeft, ChevronRight, Crown, Download,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { fmtNaira } from '../utils/format';
import {
  apiGetUserWallet, apiGetWalletLedger, apiCreditWallet, apiDebitWallet,
  exportToCsv,
  WalletSummary, WalletLedgerEntry,
} from '../utils/adminApi';
import { AdminUser } from '../data/adminMockData';
import { toast } from 'sonner';

// ── Skeleton helper ────────────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className}`} />;
}

// ── Ledger type pill ───────────────────────────────────────────────────────────
function TypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    credit:      'bg-green-500/15 text-green-400 border-green-500/25',
    debit:       'bg-red-500/15 text-red-400 border-red-500/25',
    reversal:    'bg-purple-500/15 text-purple-400 border-purple-500/25',
    adjustment:  'bg-amber-500/15 text-amber-400 border-amber-500/25',
    wallet_fund: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap ${map[type] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25'}`}>
      {type.replace('_', ' ')}
    </span>
  );
}

// ── Credit / Debit modal ────────────────────────────────────────────────────────
type ModalMode = 'credit' | 'debit';
type ModalStep = 'input' | 'confirm' | 'loading' | 'success';

interface WalletModalProps {
  mode: ModalMode;
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}

function WalletModal({ mode, user, onClose, onDone }: WalletModalProps) {
  const [step, setStep] = useState<ModalStep>('input');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ reference: string; balanceAfter: number } | null>(null);

  const isCredit = mode === 'credit';
  const accentClass = isCredit
    ? 'text-green-400 border-green-500/40'
    : 'text-red-400 border-red-500/40';
  const btnClass = isCredit
    ? 'bg-green-600 hover:bg-green-500 text-white'
    : 'bg-red-600/20 border border-red-500 text-red-400 hover:bg-red-600/40';

  const amountNum = parseFloat(amount) || 0;
  const inputValid = amountNum >= 1 && reason.trim().length >= 10;

  async function handleConfirm() {
    setStep('loading');
    try {
      const res = isCredit
        ? await apiCreditWallet(user.id, amountNum, reason.trim())
        : await apiDebitWallet(user.id, amountNum, reason.trim());
      setResult({ reference: res.reference, balanceAfter: res.balanceAfter });
      setStep('success');
      onDone();
    } catch (err: unknown) {
      setStep('confirm');
      const msg = err instanceof Error ? err.message : 'Operation failed';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0D1F38] border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            {isCredit
              ? <ArrowUpRight className="text-green-400" size={20} />
              : <ArrowDownLeft className="text-red-400" size={20} />}
            <h3 className={`font-semibold text-base ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
              {isCredit ? 'Credit Wallet' : 'Debit Wallet'}
            </h3>
          </div>
          {step !== 'loading' && (
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5">
          {/* Input step */}
          {step === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                {isCredit ? 'Add funds to' : 'Remove funds from'}{' '}
                <span className="text-white font-medium">{user.name}</span>'s wallet.
              </p>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Amount</label>
                <div className={`flex items-center border rounded-xl overflow-hidden bg-white/[0.04] ${accentClass}`}>
                  <span className="px-3 text-sm font-semibold text-zinc-300">₦</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="flex-1 bg-transparent py-2.5 pr-3 text-sm text-white outline-none"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Reason <span className="text-zinc-500">(min 10 chars)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the reason for this operation…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className={`w-full bg-white/[0.04] border rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none ${accentClass} placeholder:text-zinc-600`}
                />
                <p className="text-[11px] text-zinc-500 mt-1">{reason.trim().length}/10 min chars</p>
              </div>

              <button
                disabled={!inputValid}
                onClick={() => setStep('confirm')}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${btnClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Next →
              </button>
            </div>
          )}

          {/* Confirm step */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className={`border rounded-xl p-4 space-y-2 bg-white/[0.03] ${accentClass}`}>
                <p className="text-sm text-zinc-300">
                  <span className="font-semibold text-white">{isCredit ? 'Credit' : 'Debit'}</span>{' '}
                  <span className={`font-bold text-base ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtNaira(amountNum)}
                  </span>{' '}
                  {isCredit ? 'to' : 'from'}{' '}
                  <span className="font-semibold text-white">{user.name}</span>?
                </p>
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">Reason: </span>{reason}
                </p>
              </div>
              <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                ⚠️ This action will be logged in the audit trail.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-zinc-300 hover:bg-white/[0.05] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${btnClass}`}
                >
                  <Check size={14} className="inline mr-1.5" />
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* Loading step */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Processing…</p>
            </div>
          )}

          {/* Success step */}
          {step === 'success' && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isCredit ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                  <Check size={24} className={isCredit ? 'text-green-400' : 'text-red-400'} />
                </div>
                <p className="text-base font-semibold text-white">
                  {isCredit ? 'Credited' : 'Debited'} Successfully
                </p>
              </div>
              <div className="bg-white/[0.04] border border-border rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">New Balance</span>
                  <span className="font-bold text-white">{fmtNaira(result.balanceAfter)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Reference</span>
                  <span className="text-zinc-300 font-mono text-xs">{result.reference}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-white text-sm font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WalletManagement() {
  const { users, usersLoading, fetchUsers } = useAdminContext();

  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [creditModal, setCreditModal] = useState(false);
  const [debitModal, setDebitModal] = useState(false);

  // Filter users client-side
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.phone.includes(q);
  });

  // Fetch wallet summary + first ledger page
  const loadWallet = useCallback(async (user: AdminUser, page = 1) => {
    setWalletLoading(true);
    setLedgerLoading(true);
    try {
      const [summary, ledgerData] = await Promise.all([
        apiGetUserWallet(user.id),
        apiGetWalletLedger(user.id, page, 25),
      ]);
      setWalletSummary(summary);
      setLedger(ledgerData.entries);
      setLedgerTotal(ledgerData.total);
      setLedgerPages(ledgerData.pages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load wallet';
      toast.error(msg);
    } finally {
      setWalletLoading(false);
      setLedgerLoading(false);
    }
  }, []);

  // Fetch ledger page
  const loadLedgerPage = useCallback(async (page: number) => {
    if (!selectedUser) return;
    setLedgerLoading(true);
    try {
      const data = await apiGetWalletLedger(selectedUser.id, page, 25);
      setLedger(data.entries);
      setLedgerTotal(data.total);
      setLedgerPages(data.pages);
      setLedgerPage(page);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load ledger';
      toast.error(msg);
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (selectedUser) {
      setLedgerPage(1);
      loadWallet(selectedUser, 1);
    }
  }, [selectedUser, loadWallet]);

  function handleSelectUser(user: AdminUser) {
    setSelectedUser(user);
    setWalletSummary(null);
    setLedger([]);
  }

  function handleClosePanel() {
    setSelectedUser(null);
    setWalletSummary(null);
    setLedger([]);
    setCreditModal(false);
    setDebitModal(false);
  }

  function handleModalDone() {
    if (selectedUser) loadWallet(selectedUser, ledgerPage);
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Wallet className="text-primary" size={24} />
            <h1 className="text-2xl font-bold text-white">Wallet Management</h1>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full">
              <Crown size={11} />
              Super Admin
            </span>
          </div>
          <p className="text-sm text-zinc-400">Credit or debit user wallets with full audit trail</p>
        </div>
        <button
          onClick={() => fetchUsers()}
          disabled={usersLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-border text-sm text-zinc-300 hover:bg-white/[0.1] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/[0.05] border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* User Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-white/[0.02]">
                {['User', 'Phone', 'Balance', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usersLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-zinc-500">
                    <Wallet size={32} className="mx-auto mb-3 opacity-30" />
                    <p>No users found</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-white/[0.025] transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white leading-tight">{user.name}</p>
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Phone */}
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{user.phone}</td>
                    {/* Balance */}
                    <td className="px-4 py-3 font-semibold text-white">{fmtNaira(user.balance)}</td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} />
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSelectUser(user)}
                        className="px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Wallet Panel overlay ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0A1628] overflow-y-auto">
          {/* Panel Header */}
          <div className="sticky top-0 z-10 bg-[#0A1628]/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                {selectedUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white">{selectedUser.name}</p>
                <p className="text-xs text-zinc-400 font-mono">{selectedUser.phone}</p>
              </div>
            </div>
            <button onClick={handleClosePanel} className="p-2 rounded-lg hover:bg-white/[0.07] text-zinc-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {walletLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))
              ) : walletSummary ? (
                <>
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-zinc-500 mb-1">Balance</p>
                    <p className="text-xl font-bold text-white">{fmtNaira(walletSummary.balance)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-zinc-500 mb-1">Total Credited</p>
                    <p className="text-xl font-bold text-green-400">{fmtNaira(walletSummary.totalCredited)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-zinc-500 mb-1">Total Debited</p>
                    <p className="text-xl font-bold text-red-400">{fmtNaira(walletSummary.totalDebited)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-zinc-500 mb-1">Total Reversed</p>
                    <p className="text-xl font-bold text-amber-400">{fmtNaira(walletSummary.totalReversed)}</p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => setCreditModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
              >
                <ArrowUpRight size={16} />
                Credit Wallet
              </button>
              <button
                onClick={() => setDebitModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/20 border border-red-500 text-red-400 hover:bg-red-600/40 text-sm font-semibold transition-colors"
              >
                <ArrowDownLeft size={16} />
                Debit Wallet
              </button>
            </div>

            {/* Ledger Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-white">Ledger History</h3>
                <div className="flex items-center gap-3">
                  {!ledgerLoading && (
                    <span className="text-xs text-zinc-500">{ledgerTotal} entries</span>
                  )}
                  {ledger && ledger.length > 0 && (
                    <button
                      onClick={() => exportToCsv(
                        ledger.map(e => ({
                          Date: new Date(e.createdAt).toLocaleString('en-NG'),
                          Type: e.type,
                          'Amount (₦)': e.amount,
                          'Balance Before (₦)': e.balanceBefore,
                          'Balance After (₦)': e.balanceAfter,
                          Reference: e.reference || '',
                          Reason: e.reason || '',
                          'Performed By': e.performedByName || '',
                        })),
                        'wallet-ledger-export.csv'
                      )}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-muted-foreground hover:text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-white/[0.02]">
                      {['Type', 'Amount', 'Balance After', 'Reason', 'Admin', 'Date'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ledgerLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="px-4 py-3">
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : ledger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-zinc-500 text-sm">
                          No ledger entries yet
                        </td>
                      </tr>
                    ) : (
                      ledger.map(entry => (
                        <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <TypePill type={entry.type} />
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            <span className={entry.type === 'credit' || entry.type === 'wallet_fund' ? 'text-green-400' : entry.type === 'debit' ? 'text-red-400' : 'text-amber-400'}>
                              {fmtNaira(entry.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white font-medium">{fmtNaira(entry.balanceAfter)}</td>
                          <td className="px-4 py-3 text-zinc-400 max-w-[180px] truncate">{entry.reason ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">{entry.performedByName ?? '—'}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {ledgerPages > 1 && (
                <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Page {ledgerPage} of {ledgerPages} · {ledgerTotal} total</span>
                  <div className="flex gap-2">
                    <button
                      disabled={ledgerPage <= 1 || ledgerLoading}
                      onClick={() => loadLedgerPage(ledgerPage - 1)}
                      className="p-1.5 rounded-lg border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      disabled={ledgerPage >= ledgerPages || ledgerLoading}
                      onClick={() => loadLedgerPage(ledgerPage + 1)}
                      className="p-1.5 rounded-lg border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {creditModal && selectedUser && (
        <WalletModal
          mode="credit"
          user={selectedUser}
          onClose={() => setCreditModal(false)}
          onDone={handleModalDone}
        />
      )}
      {debitModal && selectedUser && (
        <WalletModal
          mode="debit"
          user={selectedUser}
          onClose={() => setDebitModal(false)}
          onDone={handleModalDone}
        />
      )}
    </div>
  );
}
