import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { fmtNaira } from '../utils/format';
import {
  apiGetUserWallet,
  apiGetWalletLedger,
  apiCreditWallet,
  apiDebitWallet,
  exportToCsv,
  WalletSummary,
  WalletLedgerEntry,
} from '../utils/adminApi';
import { AdminUser } from '../data/adminMockData';
import { toast } from 'sonner';

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] rounded-lg ${className}`}
    />
  );
}

function TypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    credit: 'bg-green-500/15 text-green-400 border-green-500/25',
    debit: 'bg-red-500/15 text-red-400 border-red-500/25',
    reversal: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    adjustment: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    wallet_fund: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  };

  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap ${
        map[type] ??
        'bg-zinc-500/15 text-zinc-400 border-zinc-500/25'
      }`}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

interface WalletLedgerApiRow {
  id?: unknown;
  type?: unknown;
  amount?: unknown;
  balance_before?: unknown;
  balance_after?: unknown;
  balanceBefore?: unknown;
  balanceAfter?: unknown;
  reference?: unknown;
  reason?: unknown;
  performed_by?: unknown;
  performed_by_name?: unknown;
  performedBy?: unknown;
  performedByName?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
}

interface WalletLedgerApiResponse {
  entries?: WalletLedgerApiRow[];
  rows?: WalletLedgerApiRow[];
  total?: unknown;
  pages?: unknown;
  totalPages?: unknown;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value);

  return text.length > 0 ? text : null;
}

function normalizeWalletLedgerEntry(
  row: WalletLedgerApiRow,
  index: number,
): WalletLedgerEntry {
  const id =
    toNullableString(row.id) ??
    `wallet-ledger-${index}`;

  const typeValue =
    toNullableString(row.type) ??
    'adjustment';

  const allowedTypes = new Set([
    'credit',
    'debit',
    'reversal',
    'adjustment',
    'wallet_fund',
  ]);

  return {
    id,
    type: allowedTypes.has(typeValue)
      ? (typeValue as WalletLedgerEntry['type'])
      : 'adjustment',
    amount: toFiniteNumber(row.amount),
    balanceBefore: toFiniteNumber(
      row.balanceBefore ??
        row.balance_before,
    ),
    balanceAfter: toFiniteNumber(
      row.balanceAfter ??
        row.balance_after,
    ),
    reference: toNullableString(
      row.reference,
    ),
    reason: toNullableString(row.reason),
    performedBy: toNullableString(
      row.performedBy ??
        row.performed_by,
    ),
    performedByName: toNullableString(
      row.performedByName ??
        row.performed_by_name,
    ),
    createdAt:
      toNullableString(
        row.createdAt ??
          row.created_at,
      ) ?? new Date(0).toISOString(),
  };
}

function normalizeWalletLedgerResponse(
  data:
    | WalletLedgerApiResponse
    | null
    | undefined,
): {
  entries: WalletLedgerEntry[];
  total: number;
  pages: number;
} {
  const rawEntries = Array.isArray(
    data?.entries,
  )
    ? data.entries
    : Array.isArray(data?.rows)
      ? data.rows
      : [];

  const entries = rawEntries.map(
    normalizeWalletLedgerEntry,
  );

  const total = Math.max(
    0,
    toFiniteNumber(data?.total),
  );

  const pagesValue = toFiniteNumber(
    data?.pages ?? data?.totalPages,
    1,
  );

  return {
    entries,
    total,
    pages: Math.max(
      1,
      Math.floor(pagesValue),
    ),
  };
}

type ModalMode = 'credit' | 'debit';

type ModalStep =
  | 'input'
  | 'confirm'
  | 'loading'
  | 'success';

interface WalletModalProps {
  mode: ModalMode;
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}

function WalletModal({
  mode,
  user,
  onClose,
  onDone,
}: WalletModalProps) {
  const [step, setStep] =
    useState<ModalStep>('input');

  const [amount, setAmount] =
    useState('');

  const [reason, setReason] =
    useState('');

  const [result, setResult] =
    useState<{
      reference: string;
      balanceAfter: number;
    } | null>(null);

  const isCredit = mode === 'credit';

  const accentClass = isCredit
    ? 'text-green-400 border-green-500/40'
    : 'text-red-400 border-red-500/40';

  const btnClass = isCredit
    ? 'bg-green-600 hover:bg-green-500 text-white'
    : 'bg-red-600/20 border border-red-500 text-red-400 hover:bg-red-600/40';

  const amountNum =
    parseFloat(amount) || 0;

  const inputValid =
    amountNum >= 1 &&
    reason.trim().length >= 10;

  async function handleConfirm() {
    setStep('loading');

    try {
      const res = isCredit
        ? await apiCreditWallet(
            user.id,
            amountNum,
            reason.trim(),
          )
        : await apiDebitWallet(
            user.id,
            amountNum,
            reason.trim(),
          );

      setResult({
        reference:
          res.reference ??
          'N/A',
        balanceAfter:
          Number.isFinite(
            Number(res.balanceAfter),
          )
            ? Number(res.balanceAfter)
            : 0,
      });

      setStep('success');
      onDone();
    } catch (err: unknown) {
      setStep('confirm');

      const msg =
        err instanceof Error
          ? err.message
          : 'Operation failed';

      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0D1F38] border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            {isCredit ? (
              <ArrowUpRight
                className="text-green-400"
                size={20}
              />
            ) : (
              <ArrowDownLeft
                className="text-red-400"
                size={20}
              />
            )}

            <h3
              className={`font-semibold text-base ${
                isCredit
                  ? 'text-green-400'
                  : 'text-red-400'
              }`}
            >
              {isCredit
                ? 'Credit Wallet'
                : 'Debit Wallet'}
            </h3>
          </div>

          {step !== 'loading' && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors"
              type="button"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5">
          {step === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                {isCredit
                  ? 'Add funds to'
                  : 'Remove funds from'}{' '}
                <span className="text-white font-medium">
                  {user.name}
                </span>
                's wallet.
              </p>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Amount
                </label>

                <div
                  className={`flex items-center border rounded-xl overflow-hidden bg-white/[0.04] ${accentClass}`}
                >
                  <span className="px-3 text-sm font-semibold text-zinc-300">
                    ₦
                  </span>

                  <input
                    type="number"
                    min={1}
                    placeholder="0"
                    value={amount}
                    onChange={(e) =>
                      setAmount(
                        e.target.value,
                      )
                    }
                    className="flex-1 bg-transparent py-2.5 pr-3 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Reason{' '}
                  <span className="text-zinc-500">
                    (min 10 chars)
                  </span>
                </label>

                <textarea
                  rows={3}
                  placeholder="Describe the reason for this operation…"
                  value={reason}
                  onChange={(e) =>
                    setReason(
                      e.target.value,
                    )
                  }
                  className={`w-full bg-white/[0.04] border rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none ${accentClass} placeholder:text-zinc-600`}
                />

                <p className="text-[11px] text-zinc-500 mt-1">
                  {reason.trim().length}/10 min
                  chars
                </p>
              </div>

              <button
                type="button"
                disabled={!inputValid}
                onClick={() =>
                  setStep('confirm')
                }
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${btnClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Continue
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
                <p className="text-xs text-zinc-500">
                  Confirm operation
                </p>

                <p className="text-xl font-bold text-white mt-1">
                  {fmtNaira(amountNum)}
                </p>

                <p className="text-sm text-zinc-400 mt-1">
                  {isCredit
                    ? 'will be credited to'
                    : 'will be debited from'}{' '}
                  <span className="text-white font-medium">
                    {user.name}
                  </span>
                </p>

                <p className="text-xs text-zinc-500 mt-3">
                  Reason: {reason.trim()}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setStep('input')
                  }
                  className="flex-1 py-2.5 rounded-xl border border-border text-zinc-300 hover:text-white hover:bg-white/5 text-sm font-semibold"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleConfirm()
                  }
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${btnClass}`}
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white animate-spin" />

              <p className="text-sm text-zinc-400 mt-4">
                Processing wallet operation…
              </p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <Check
                  className="text-green-400"
                  size={24}
                />
              </div>

              <h4 className="text-lg font-semibold text-white mt-4">
                Operation successful
              </h4>

              <p className="text-sm text-zinc-400 mt-1">
                {isCredit
                  ? 'Wallet credited successfully.'
                  : 'Wallet debited successfully.'}
              </p>

              {result && (
                <div className="w-full mt-5 rounded-xl bg-white/[0.04] border border-white/10 p-4 text-left">
                  <p className="text-xs text-zinc-500">
                    New balance
                  </p>

                  <p className="text-base font-semibold text-white mt-1">
                    {fmtNaira(
                      result.balanceAfter,
                    )}
                  </p>

                  <p className="text-xs text-zinc-500 mt-3">
                    Reference
                  </p>

                  <p className="text-xs text-zinc-300 font-mono break-all mt-1">
                    {result.reference}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full mt-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors"
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

export default function WalletManagement() {
  const {
    users,
    fetchUsers,
  } = useAdminContext();

  const [search, setSearch] =
    useState('');

  const [selectedUser, setSelectedUser] =
    useState<AdminUser | null>(null);

  const [wallet, setWallet] =
    useState<WalletSummary | null>(null);

  const [ledger, setLedger] =
    useState<WalletLedgerEntry[]>([]);

  const [ledgerTotal, setLedgerTotal] =
    useState(0);

  const [ledgerPages, setLedgerPages] =
    useState(1);

  const [ledgerPage, setLedgerPage] =
    useState(1);

  const [loading, setLoading] =
    useState(false);

  const [ledgerLoading, setLedgerLoading] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [creditModal, setCreditModal] =
    useState(false);

  const [debitModal, setDebitModal] =
    useState(false);

  const loadLedgerPage = useCallback(
    async (page: number) => {
      if (!selectedUser?.id) return;

      setLedgerLoading(true);

      try {
        const raw =
          await apiGetWalletLedger(
            selectedUser.id,
            page,
          );

        const normalized =
          normalizeWalletLedgerResponse(
            raw as WalletLedgerApiResponse,
          );

        setLedger(
          normalized.entries,
        );

        setLedgerTotal(
          normalized.total,
        );

        setLedgerPages(
          normalized.pages,
        );

        setLedgerPage(page);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to load wallet ledger';

        toast.error(msg);

        setLedger([]);
        setLedgerTotal(0);
        setLedgerPages(1);
      } finally {
        setLedgerLoading(false);
      }
    },
    [selectedUser?.id],
  );

  const loadWallet = useCallback(
    async (userId: string) => {
      setLoading(true);
      setLedgerLoading(true);

      try {
        const [
          walletResult,
          ledgerResult,
        ] = await Promise.all([
          apiGetUserWallet(userId),
          apiGetWalletLedger(
            userId,
            1,
          ),
        ]);

        setWallet(walletResult);

        const normalized =
          normalizeWalletLedgerResponse(
            ledgerResult as WalletLedgerApiResponse,
          );

        setLedger(
          normalized.entries,
        );

        setLedgerTotal(
          normalized.total,
        );

        setLedgerPages(
          normalized.pages,
        );

        setLedgerPage(1);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to load wallet';

        toast.error(msg);

        setWallet(null);
        setLedger([]);
        setLedgerTotal(0);
        setLedgerPages(1);
      } finally {
        setLoading(false);
        setLedgerLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedUser?.id) {
      setWallet(null);
      setLedger([]);
      setLedgerTotal(0);
      setLedgerPages(1);
      setLedgerPage(1);
      return;
    }

    void loadWallet(
      selectedUser.id,
    );
  }, [
    selectedUser?.id,
    loadWallet,
  ]);

  const handleSelectUser = (
    user: AdminUser,
  ) => {
    setSelectedUser(user);
    setCreditModal(false);
    setDebitModal(false);
  };

  const handleBack = () => {
    setSelectedUser(null);
    setWallet(null);
    setLedger([]);
    setLedgerTotal(0);
    setLedgerPages(1);
    setLedgerPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await fetchUsers();

      if (selectedUser?.id) {
        await loadWallet(
          selectedUser.id,
        );
      }

      toast.success(
        'Wallet data refreshed',
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Refresh failed';

      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const handleModalDone = async () => {
    if (!selectedUser?.id) return;

    await loadWallet(
      selectedUser.id,
    );

    try {
      await fetchUsers();
    } catch {
      // Wallet operation already succeeded;
      // user-list refresh failure should not
      // invalidate the operation.
    }
  };

  const normalizedSearch =
    search.trim().toLowerCase();

  const filteredUsers =
    users.filter((user) => {
      if (!normalizedSearch)
        return true;

      return [
        user.name,
        user.phone,
        user.email,
        user.id,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(
              normalizedSearch,
            ),
        );
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wallet
              size={22}
              className="text-primary"
            />

            <h1 className="text-xl font-bold text-white">
              Wallet Management
            </h1>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
              <Crown
                size={10}
                className="inline mr-1"
              />
              Super Admin
            </span>
          </div>

          <p className="text-sm text-zinc-500 mt-1">
            Manage customer wallet balances
            and view ledger history.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void handleRefresh()
          }
          disabled={refreshing}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border bg-white/5 hover:bg-white/10 text-sm text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={
              refreshing
                ? 'animate-spin'
                : ''
            }
          />
          Refresh
        </button>
      </div>

      {!selectedUser ? (
        <div className="bg-[#0D1F38] border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="relative max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value,
                  )
                }
                placeholder="Search by name, phone, email or ID…"
                className="w-full bg-white/[0.04] border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-white/[0.02]">
                  {[
                    'User',
                    'Phone',
                    'Email',
                    'Status',
                    'Wallet',
                    'Action',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {filteredUsers.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(
                    (user) => (
                      <tr
                        key={user.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
                              {user.name
                                ?.charAt(
                                  0,
                                )
                                .toUpperCase() ??
                                'U'}
                            </div>

                            <div>
                              <p className="text-white font-medium">
                                {user.name}
                              </p>

                              <p className="text-[11px] text-zinc-500">
                                {user.id}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                          {user.phone ||
                            '—'}
                        </td>

                        <td className="px-4 py-3 text-zinc-400">
                          {user.email ||
                            '—'}
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              user.status
                            }
                          />
                        </td>

                        <td className="px-4 py-3 text-zinc-300">
                          —
                        </td>

                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectUser(
                                user,
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-xs font-semibold"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 rounded-xl border border-border text-zinc-400 hover:text-white hover:bg-white/5"
            >
              <ChevronLeft
                size={18}
              />
            </button>

            <div>
              <p className="text-white font-semibold">
                {selectedUser.name}
              </p>

              <p className="text-xs text-zinc-500">
                {selectedUser.phone ||
                  selectedUser.email ||
                  selectedUser.id}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#0D1F38] border border-border rounded-2xl p-5">
              <p className="text-xs text-zinc-500">
                Available Balance
              </p>

              {loading ? (
                <Skeleton className="h-7 w-32 mt-2" />
              ) : (
                <p className="text-2xl font-bold text-white mt-1">
                  {fmtNaira(
                    Number(
                      wallet?.balance ??
                        0,
                    ),
                  )}
                </p>
              )}
            </div>

            <div className="bg-[#0D1F38] border border-border rounded-2xl p-5">
              <p className="text-xs text-zinc-500">
                Total Credit
              </p>

              {loading ? (
                <Skeleton className="h-7 w-32 mt-2" />
              ) : (
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {fmtNaira(
                    Number(
                      wallet?.totalCredit ??
                        wallet?.total_credit ??
                        0,
                    ),
                  )}
                </p>
              )}
            </div>

            <div className="bg-[#0D1F38] border border-border rounded-2xl p-5">
              <p className="text-xs text-zinc-500">
                Total Debit
              </p>

              {loading ? (
                <Skeleton className="h-7 w-32 mt-2" />
              ) : (
                <p className="text-2xl font-bold text-red-400 mt-1">
                  {fmtNaira(
                    Number(
                      wallet?.totalDebit ??
                        wallet?.total_debit ??
                        0,
                    ),
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                setCreditModal(true)
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
            >
              <ArrowUpRight
                size={16}
              />
              Credit Wallet
            </button>

            <button
              type="button"
              onClick={() =>
                setDebitModal(true)
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/15 border border-red-500/40 text-red-400 hover:bg-red-600/25 text-sm font-semibold transition-colors"
            >
              <ArrowDownLeft
                size={16}
              />
              Debit Wallet
            </button>

            <button
              type="button"
              onClick={() =>
                void loadWallet(
                  selectedUser.id,
                )
              }
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={
                  loading
                    ? 'animate-spin'
                    : ''
                }
              />
              Reload Wallet
            </button>
          </div>

          <div className="bg-[#0D1F38] border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-white">
                Ledger History
              </h3>

              <div className="flex items-center gap-3">
                {!ledgerLoading && (
                  <span className="text-xs text-zinc-500">
                    {ledgerTotal} entries
                  </span>
                )}

                {ledger.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      exportToCsv(
                        ledger.map(
                          (entry) => ({
                            Date: new Date(
                              entry.createdAt,
                            ).toLocaleString(
                              'en-NG',
                            ),
                            Type: entry.type,
                            'Amount (₦)':
                              entry.amount,
                            'Balance Before (₦)':
                              entry.balanceBefore,
                            'Balance After (₦)':
                              entry.balanceAfter,
                            Reference:
                              entry.reference ??
                              '',
                            Reason:
                              entry.reason ??
                              '',
                            'Performed By':
                              entry.performedByName ??
                              '',
                          }),
                        ),
                        'wallet-ledger-export.csv',
                      )
                    }
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
                    {[
                      'Type',
                      'Amount',
                      'Balance After',
                      'Reason',
                      'Admin',
                      'Date',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {ledgerLoading ? (
                    Array.from({
                      length: 8,
                    }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({
                          length: 6,
                        }).map(
                          (__, j) => (
                            <td
                              key={j}
                              className="px-4 py-3"
                            >
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ),
                        )}
                      </tr>
                    ))
                  ) : ledger.length ===
                    0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-12 text-center text-zinc-500 text-sm"
                      >
                        No ledger entries yet
                      </td>
                    </tr>
                  ) : (
                    ledger.map(
                      (entry) => (
                        <tr
                          key={entry.id}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-3">
                            <TypePill
                              type={
                                entry.type
                              }
                            />
                          </td>

                          <td className="px-4 py-3 font-semibold">
                            <span
                              className={
                                entry.type ===
                                  'credit' ||
                                entry.type ===
                                  'wallet_fund'
                                  ? 'text-green-400'
                                  : entry.type ===
                                      'debit'
                                    ? 'text-red-400'
                                    : 'text-amber-400'
                              }
                            >
                              {fmtNaira(
                                Number(
                                  entry.amount ??
                                    0,
                                ),
                              )}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-white font-medium">
                            {fmtNaira(
                              Number(
                                entry.balanceAfter ??
                                  0,
                              ),
                            )}
                          </td>

                          <td className="px-4 py-3 text-zinc-400 max-w-[180px] truncate">
                            {entry.reason ??
                              '—'}
                          </td>

                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {entry.performedByName ??
                              '—'}
                          </td>

                          <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                            {new Date(
                              entry.createdAt,
                            ).toLocaleDateString(
                              'en-NG',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>

            {ledgerPages > 1 && (
              <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  Page {ledgerPage} of{' '}
                  {ledgerPages} ·{' '}
                  {ledgerTotal} total
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      ledgerPage <=
                        1 ||
                      ledgerLoading
                    }
                    onClick={() =>
                      void loadLedgerPage(
                        ledgerPage - 1,
                      )
                    }
                    className="p-1.5 rounded-lg border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft
                      size={14}
                    />
                  </button>

                  <button
                    type="button"
                    disabled={
                      ledgerPage >=
                        ledgerPages ||
                      ledgerLoading
                    }
                    onClick={() =>
                      void loadLedgerPage(
                        ledgerPage + 1,
                      )
                    }
                    className="p-1.5 rounded-lg border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight
                      size={14}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {creditModal &&
        selectedUser && (
          <WalletModal
            mode="credit"
            user={selectedUser}
            onClose={() =>
              setCreditModal(false)
            }
            onDone={handleModalDone}
          />
        )}

      {debitModal &&
        selectedUser && (
          <WalletModal
            mode="debit"
            user={selectedUser}
            onClose={() =>
              setDebitModal(false)
            }
            onDone={handleModalDone}
          />
        )}
    </div>
  );
}
