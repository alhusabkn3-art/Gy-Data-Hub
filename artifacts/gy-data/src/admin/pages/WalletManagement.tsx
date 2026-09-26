import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  RefreshCw,
  Search,
  Wallet,
  X,
} from 'lucide-react';

import { toast } from 'sonner';

import {
  apiCreditWallet,
  apiDebitWallet,
  apiGetUserWallet,
  apiGetWalletLedger,
  type WalletLedgerEntry,
} from '../utils/adminApi';

import {
  useAdminContext,
} from '../context/AdminContext';

import {
  type AdminUser,
} from '../data/adminMockData';

import {
  fmtNaira,
} from '../utils/format';

interface WalletView {
  id?: string;
  walletId?: string;
  userId?: string;

  balance: number;

  totalCredit?: number;
  totalDebit?: number;

  totalCredited?: number;
  totalDebited?: number;

  totalReversal?: number;

  transactionCount?: number;
  ledgerCount?: number;
}

type ModalMode =
  | 'credit'
  | 'debit';

function Skeleton({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
    />
  );
}

function safeNumber(
  value: unknown,
): number {
  const n =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    n,
  )
    ? n
    : 0;
}

function LedgerType({
  type,
}: {
  type: string;
}) {
  const positive =
    type === 'credit' ||
    type === 'wallet_fund';

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        positive
          ? 'border-green-500/20 bg-green-500/10 text-green-400'
          : 'border-red-500/20 bg-red-500/10 text-red-400'
      }`}
    >
      {type.replace(
        '_',
        ' ',
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Wallet adjustment modal                                                    */
/* -------------------------------------------------------------------------- */

function WalletAdjustmentModal({
  mode,
  user,
  onClose,
  onDone,
}: {
  mode: ModalMode;
  user: AdminUser;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [
    amount,
    setAmount,
  ] = useState('');

  const [
    reason,
    setReason,
  ] = useState('');

  const [
    saving,
    setSaving,
  ] = useState(false);

  const value =
    safeNumber(
      amount,
    );

  const valid =
    value >= 1 &&
    reason.trim().length >=
      10;

  const credit =
    mode === 'credit';

  const submit =
    async () => {
      if (!valid) {
        return;
      }

      setSaving(
        true,
      );

      try {
        const result =
          credit
            ? await apiCreditWallet(
                user.id,
                value,
                reason.trim(),
              )
            : await apiDebitWallet(
                user.id,
                value,
                reason.trim(),
              );

        toast.success(
          `${
            credit
              ? 'Credit'
              : 'Debit'
          } successful. New balance: ${fmtNaira(
            result.balanceAfter,
          )}`,
        );

        await onDone();

        onClose();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Wallet operation failed.',
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0D1F38] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] p-5">
          <div className="flex items-center gap-2">
            {credit ? (
              <ArrowUpRight className="h-5 w-5 text-green-400" />
            ) : (
              <ArrowDownLeft className="h-5 w-5 text-red-400" />
            )}

            <h2 className="text-sm font-bold text-white">
              {credit
                ? 'Credit Wallet'
                : 'Debit Wallet'}
            </h2>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="text-white/40 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-white/45">
            {credit
              ? 'Add funds to'
              : 'Remove funds from'}{' '}
            <span className="font-semibold text-white">
              {user.name}
            </span>
            's wallet.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/45">
              Amount
            </label>

            <div className="flex overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              <span className="px-3 py-2.5 text-sm font-semibold text-white/50">
                ₦
              </span>

              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) =>
                  setAmount(
                    e.target.value,
                  )
                }
                className="w-full bg-transparent px-2 py-2.5 text-sm text-white outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/45">
              Reason{' '}
              <span className="font-normal text-white/25">
                (minimum 10 characters)
              </span>
            </label>

            <textarea
              rows={4}
              value={reason}
              onChange={(e) =>
                setReason(
                  e.target.value,
                )
              }
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
              placeholder="Why is this wallet being adjusted?"
            />

            <p className="mt-1 text-[10px] text-white/25">
              {reason.trim().length}
              /10 minimum
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void submit()
            }
            disabled={
              !valid ||
              saving
            }
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              credit
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
            }`}
          >
            {saving
              ? 'Processing…'
              : `Confirm ${
                  credit
                    ? 'Credit'
                    : 'Debit'
                }`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Wallet management                                                          */
/* -------------------------------------------------------------------------- */

export default function WalletManagement() {
  const {
    users,
    usersLoading,
    fetchUsers,
  } =
    useAdminContext();

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    selectedUser,
    setSelectedUser,
  ] =
    useState<AdminUser | null>(
      null,
    );

  const [
    wallet,
    setWallet,
  ] =
    useState<WalletView | null>(
      null,
    );

  const [
    ledger,
    setLedger,
  ] =
    useState<
      WalletLedgerEntry[]
    >([]);

  const [
    ledgerPage,
    setLedgerPage,
  ] = useState(1);

  const [
    ledgerPages,
    setLedgerPages,
  ] = useState(1);

  const [
    ledgerTotal,
    setLedgerTotal,
  ] = useState(0);

  const [
    loadingWallet,
    setLoadingWallet,
  ] = useState(false);

  const [
    loadingLedger,
    setLoadingLedger,
  ] = useState(false);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    modal,
    setModal,
  ] =
    useState<ModalMode | null>(
      null,
    );

  const filteredUsers =
    useMemo(
      () => {
        const q =
          search
            .trim()
            .toLowerCase();

        if (!q) {
          return users;
        }

        return users.filter(
          (user) =>
            [
              user.name,
              user.phone,
              user.email,
              user.id,
            ]
              .filter(Boolean)
              .some(
                (value) =>
                  String(
                    value,
                  )
                    .toLowerCase()
                    .includes(
                      q,
                    ),
              ),
        );
      },
      [
        users,
        search,
      ],
    );

  const loadLedger =
    useCallback(
      async (
        userId: string,
        page: number,
      ) => {
        setLoadingLedger(
          true,
        );

        try {
          const response =
            await apiGetWalletLedger(
              userId,
              {
                page,
                limit: 25,
              },
            );

          const raw =
            response as unknown as {
              ledger?: WalletLedgerEntry[];
              rows?: WalletLedgerEntry[];
              total?: number;
              pages?: number;
              totalPages?: number;
            };

          const rows =
            Array.isArray(
              raw.ledger,
            )
              ? raw.ledger
              : Array.isArray(
                    raw.rows,
                  )
                ? raw.rows
                : [];

          setLedger(
            rows,
          );

          setLedgerTotal(
            safeNumber(
              raw.total,
            ),
          );

          setLedgerPages(
            Math.max(
              1,
              safeNumber(
                raw.pages ??
                  raw.totalPages,
                1,
              ),
            ),
          );

          setLedgerPage(
            page,
          );
        } catch (err) {
          setLedger([]);

          setLedgerTotal(
            0,
          );

          setLedgerPages(
            1,
          );

          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to load wallet ledger.',
          );
        } finally {
          setLoadingLedger(
            false,
          );
        }
      },
      [],
    );

  const loadWallet =
    useCallback(
      async (
        userId: string,
      ) => {
        setLoadingWallet(
          true,
        );

        try {
          const result =
            (await apiGetUserWallet(
              userId,
            )) as unknown as WalletView;

          setWallet(
            result,
          );

          await loadLedger(
            userId,
            1,
          );
        } catch (err) {
          setWallet(
            null,
          );

          setLedger([]);

          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to load wallet.',
          );
        } finally {
          setLoadingWallet(
            false,
          );
        }
      },
      [
        loadLedger,
      ],
    );

  useEffect(
    () => {
      if (
        selectedUser?.id
      ) {
        void loadWallet(
          selectedUser.id,
        );
      } else {
        setWallet(
          null,
        );

        setLedger([]);
      }
    },
    [
      selectedUser?.id,
      loadWallet,
    ],
  );

  const refresh =
    async () => {
      setRefreshing(
        true,
      );

      try {
        await fetchUsers();

        if (
          selectedUser?.id
        ) {
          await loadWallet(
            selectedUser.id,
          );
        }

        toast.success(
          'Wallet data refreshed.',
        );
      } catch {
        toast.error(
          'Failed to refresh wallet data.',
        );
      } finally {
        setRefreshing(
          false,
        );
      }
    };

  const creditTotal =
    safeNumber(
      wallet?.totalCredit ??
        wallet?.totalCredited,
    );

  const debitTotal =
    safeNumber(
      wallet?.totalDebit ??
        wallet?.totalDebited,
    );

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />

            <h1 className="text-xl font-bold text-white">
              Wallet Management
            </h1>

            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              Super Admin
            </span>
          </div>

          <p className="mt-1 text-sm text-white/35">
            View customer balances,
            credit or debit wallets,
            and inspect the ledger.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void refresh()
          }
          disabled={
            refreshing
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing
                ? 'animate-spin'
                : ''
            }`}
          />

          Refresh
        </button>
      </div>

      {!selectedUser ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D1F38]">
          <div className="border-b border-white/[0.07] p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value,
                  )
                }
                placeholder="Search name, phone, email or ID…"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-primary/40"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-left text-[10px] uppercase tracking-wider text-white/30">
                  <th className="px-4 py-3">
                    User
                  </th>

                  <th className="px-4 py-3">
                    Phone
                  </th>

                  <th className="px-4 py-3">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right">
                    Current Balance
                  </th>

                  <th className="px-4 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.05]">
                {usersLoading &&
                users.length ===
                  0 ? (
                  Array.from(
                    {
                      length: 5,
                    },
                  ).map(
                    (_, i) => (
                      <tr
                        key={i}
                      >
                        <td
                          colSpan={5}
                          className="px-4 py-3"
                        >
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ),
                  )
                ) : filteredUsers.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-sm text-white/35"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(
                    (
                      user,
                    ) => (
                      <tr
                        key={
                          user.id
                        }
                        className="hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">
                            {
                              user.name
                            }
                          </p>

                          <p className="text-[10px] text-white/25">
                            {
                              user.id
                            }
                          </p>
                        </td>

                        <td className="px-4 py-3 text-white/45">
                          {user.phone ||
                            '—'}
                        </td>

                        <td className="px-4 py-3 capitalize text-white/45">
                          {
                            user.status
                          }
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-white">
                          {fmtNaira(
                            safeNumber(
                              user.balance,
                            ),
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedUser(
                                user,
                              )
                            }
                            className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
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
          <button
            type="button"
            onClick={() =>
              setSelectedUser(
                null,
              )
            }
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/45 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to users
          </button>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0D1F38] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-bold text-white">
                  {
                    selectedUser.name
                  }
                </p>

                <p className="text-xs text-white/35">
                  {selectedUser.phone ||
                    selectedUser.email ||
                    selectedUser.id}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setModal(
                      'credit',
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-green-500"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Credit Wallet
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setModal(
                      'debit',
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/20"
                >
                  <ArrowDownLeft className="h-4 w-4" />
                  Debit Wallet
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.07] bg-[#0D1F38] p-5">
              <p className="text-xs text-white/35">
                Remaining Balance
              </p>

              {loadingWallet ? (
                <Skeleton className="mt-2 h-8 w-36" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-white">
                  {fmtNaira(
                    safeNumber(
                      wallet?.balance,
                    ),
                  )}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0D1F38] p-5">
              <p className="text-xs text-white/35">
                Total Credit
              </p>

              {loadingWallet ? (
                <Skeleton className="mt-2 h-8 w-36" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-green-400">
                  {fmtNaira(
                    creditTotal,
                  )}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0D1F38] p-5">
              <p className="text-xs text-white/35">
                Total Debit
              </p>

              {loadingWallet ? (
                <Skeleton className="mt-2 h-8 w-36" />
              ) : (
                <p className="mt-1 text-2xl font-bold text-red-400">
                  {fmtNaira(
                    debitTotal,
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D1F38]">
            <div className="flex items-center justify-between border-b border-white/[0.07] p-4">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Wallet Ledger
                </h2>

                <p className="mt-0.5 text-[10px] text-white/30">
                  {ledgerTotal.toLocaleString()}
                  {' '}
                  total entries
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadLedger(
                    selectedUser.id,
                    ledgerPage,
                  )
                }
                disabled={
                  loadingLedger
                }
                className="rounded-lg border border-white/[0.08] p-2 text-white/45 hover:text-white disabled:opacity-40"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    loadingLedger
                      ? 'animate-spin'
                      : ''
                  }`}
                />
              </button>
            </div>

            {loadingLedger &&
            ledger.length ===
              0 ? (
              <div className="space-y-2 p-4">
                {Array.from(
                  {
                    length: 6,
                  },
                ).map(
                  (_, i) => (
                    <Skeleton
                      key={i}
                      className="h-12 w-full"
                    />
                  ),
                )}
              </div>
            ) : ledger.length ===
              0 ? (
              <p className="py-12 text-center text-sm text-white/35">
                No wallet ledger entries.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {ledger.map(
                  (
                    entry,
                  ) => (
                    <div
                      key={
                        entry.id
                      }
                      className="flex items-center gap-3 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <LedgerType
                            type={
                              entry.type
                            }
                          />

                          <span className="truncate text-[10px] text-white/25">
                            {entry.reference ||
                              'No reference'}
                          </span>
                        </div>

                        <p className="truncate text-xs text-white/40">
                          {entry.description ||
                            'Wallet ledger entry'}
                        </p>

                        <p className="mt-1 text-[10px] text-white/20">
                          {entry.createdAt
                            ? new Date(
                                entry.createdAt,
                              ).toLocaleString(
                                'en-NG',
                              )
                            : '—'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p
                          className={`text-sm font-bold ${
                            entry.type ===
                              'credit' ||
                            entry.type ===
                              'wallet_fund'
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}
                        >
                          {entry.type ===
                            'credit' ||
                          entry.type ===
                            'wallet_fund'
                            ? '+'
                            : '-'}

                          {fmtNaira(
                            safeNumber(
                              entry.amount,
                            ),
                          )}
                        </p>

                        <p className="text-[10px] text-white/25">
                          Bal.{' '}
                          {fmtNaira(
                            safeNumber(
                              entry.balanceAfter,
                            ),
                          )}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            {ledgerPages >
              1 && (
              <div className="flex items-center justify-between border-t border-white/[0.07] p-3">
                <button
                  type="button"
                  disabled={
                    ledgerPage <=
                      1 ||
                    loadingLedger
                  }
                  onClick={() =>
                    void loadLedger(
                      selectedUser.id,
                      ledgerPage -
                        1,
                    )
                  }
                  className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-white/50 disabled:opacity-30"
                >
                  Previous
                </button>

                <span className="text-[10px] text-white/30">
                  Page{' '}
                  {
                    ledgerPage
                  }{' '}
                  of{' '}
                  {
                    ledgerPages
                  }
                </span>

                <button
                  type="button"
                  disabled={
                    ledgerPage >=
                      ledgerPages ||
                    loadingLedger
                  }
                  onClick={() =>
                    void loadLedger(
                      selectedUser.id,
                      ledgerPage +
                        1,
                    )
                  }
                  className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-white/50 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedUser &&
        modal && (
          <WalletAdjustmentModal
            mode={
              modal
            }
            user={
              selectedUser
            }
            onClose={() =>
              setModal(
                null,
              )
            }
            onDone={async () => {
              await loadWallet(
                selectedUser.id,
              );

              await fetchUsers();
            }}
          />
        )}
    </div>
  );
}
