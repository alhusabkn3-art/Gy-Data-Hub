import React, { useState, useEffect } from 'react';
import {
  Search,
  X,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { AdminTransaction } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import {
  apiGetTransactionDetail,
  apiMarkTransactionReview,
  apiReverseTransaction,
  TransactionDetail,
} from '../utils/adminApi';

type FilterStatus =
  | 'all'
  | 'success'
  | 'pending'
  | 'failed';

type FilterType =
  | 'all'
  | 'data'
  | 'airtime'
  | 'electricity'
  | 'cable'
  | 'betting'
  | 'exam'
  | 'wallet_fund';

const typeLabels: Record<string, string> = {
  data: 'Data',
  airtime: 'Airtime',
  electricity: 'Electricity',
  cable: 'Cable TV',
  betting: 'Betting',
  exam: 'Exam Pin',
  wallet_fund: 'Wallet Fund',
};

const typeIcons: Record<string, string> = {
  data: '📶',
  airtime: '📞',
  electricity: '⚡',
  cable: '📺',
  betting: '🎯',
  exam: '📝',
  wallet_fund: '💰',
};

function safeString(
  value: unknown,
  fallback = '',
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function getDisplayProvider(
  provider: unknown,
): string {
  const value = safeString(provider).trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function getDisplayUserName(
  transaction: AdminTransaction,
): string {
  const name = safeString(
    transaction.userName,
  ).trim();

  return name || 'Unknown User';
}

function getDisplayPhone(
  transaction: AdminTransaction,
): string {
  return safeString(
    transaction.phone,
  ).trim();
}

function getDisplayReference(
  transaction: AdminTransaction,
): string {
  return safeString(
    transaction.reference,
  ).trim();
}

function getDisplayAmount(
  transaction: AdminTransaction,
): number {
  const amount = Number(
    transaction.amount,
  );

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] rounded-lg ${
        className ?? ''
      }`}
    />
  );
}

export default function AdminTransactions() {
  const {
    transactions,
    txnsTotal,
    txnsLoading,
    stats,
    fetchTransactions,
    isSuperAdmin,
  } = useAdminContext();

  const [search, setSearch] =
    useState('');

  const [filterStatus, setFilterStatus] =
    useState<FilterStatus>('all');

  const [filterType, setFilterType] =
    useState<FilterType>('all');

  const [selected, setSelected] =
    useState<AdminTransaction | null>(
      null,
    );

  const [detail, setDetail] =
    useState<TransactionDetail | null>(
      null,
    );

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailError, setDetailError] =
    useState('');

  const [reviewLoading, setReviewLoading] =
    useState(false);

  const [reverseStep, setReverseStep] =
    useState<
      | 'idle'
      | 'reason'
      | 'confirm'
      | 'loading'
      | 'done'
    >('idle');

  const [reverseReason, setReverseReason] =
    useState('');

  const [reversalRef, setReversalRef] =
    useState('');

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError('');
      setReviewLoading(false);
      setReverseStep('idle');
      setReverseReason('');
      setReversalRef('');
      return;
    }

    let cancelled = false;

    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    setReverseStep('idle');
    setReverseReason('');

    apiGetTransactionDetail(selected.id)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(
            error instanceof Error
              ? error.message
              : 'Failed to load detail.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  function closeModal() {
    setSelected(null);
  }

  async function handleMarkReview() {
    if (!selected) return;

    setReviewLoading(true);

    try {
      await apiMarkTransactionReview(
        selected.id,
      );

      toast.success(
        'Transaction marked for review.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to mark for review.',
      );
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleReverse() {
    if (
      !selected ||
      !reverseReason.trim()
    ) {
      return;
    }

    setReverseStep('loading');

    try {
      const response =
        await apiReverseTransaction(
          selected.id,
          reverseReason.trim(),
        );

      setReversalRef(
        response.reference,
      );

      setReverseStep('done');

      toast.success(
        'Transaction reversed successfully.',
      );

      void fetchTransactions();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to reverse transaction.',
      );

      setReverseStep('confirm');
    }
  }

  const normalizedSearch =
    search.trim().toLowerCase();

  const filtered =
    transactions.filter(
      (transaction) => {
        const userName =
          getDisplayUserName(
            transaction,
          );

        const userPhone =
          getDisplayPhone(
            transaction,
          );

        const id = safeString(
          transaction.id,
        );

        const reference =
          getDisplayReference(
            transaction,
          );

        const provider =
          getDisplayProvider(
            transaction.provider,
          );

        const matchSearch =
          normalizedSearch === '' ||
          userName
            .toLowerCase()
            .includes(normalizedSearch) ||
          userPhone
            .toLowerCase()
            .includes(normalizedSearch) ||
          id
            .toLowerCase()
            .includes(normalizedSearch) ||
          reference
            .toLowerCase()
            .includes(normalizedSearch) ||
          provider
            .toLowerCase()
            .includes(normalizedSearch);

        const matchStatus =
          filterStatus === 'all' ||
          transaction.status ===
            filterStatus;

        const matchType =
          filterType === 'all' ||
          transaction.type ===
            filterType;

        return (
          matchSearch &&
          matchStatus &&
          matchType
        );
      },
    );

  const totalFiltered =
    filtered.reduce(
      (total, transaction) => {
        if (
          transaction.status !==
          'success'
        ) {
          return total;
        }

        return (
          total +
          getDisplayAmount(transaction)
        );
      },
      0,
    );

  const showActions =
    isSuperAdmin &&
    detail &&
    detail.status === 'success' &&
    detail.reversal == null;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">
            Transactions
          </h1>

          <p className="text-sm text-muted-foreground mt-0.5">
            {txnsLoading && !stats
              ? 'Loading…'
              : `${(
                  stats?.totalTransactions ??
                  txnsTotal
                ).toLocaleString()} total · ${fmtNaira(
                  stats?.totalRevenue ?? 0,
                )} revenue`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-2 flex-wrap text-xs">
            {txnsLoading && !stats ? (
              <Skeleton className="h-7 w-52 rounded-xl" />
            ) : (
              <>
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-xl font-semibold">
                  {(
                    stats?.successfulTransactions ??
                    0
                  ).toLocaleString()}{' '}
                  Success
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-xl font-semibold">
                  {(
                    stats?.pendingTransactions ??
                    0
                  ).toLocaleString()}{' '}
                  Pending
                </div>

                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl font-semibold">
                  {(
                    stats?.failedTransactions ??
                    0
                  ).toLocaleString()}{' '}
                  Failed
                </div>
              </>
            )}
          </div>

          <button
            onClick={() =>
              fetchTransactions()
            }
            disabled={txnsLoading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                txnsLoading
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

          <input
            type="text"
            placeholder="Search by user, ID, reference or provider…"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            className="w-full bg-card border border-border rounded-xl h-10 pl-9 pr-4 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(event) =>
            setFilterStatus(
              event.target
                .value as FilterStatus,
            )
          }
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">
            All Status
          </option>
          <option value="success">
            Successful
          </option>
          <option value="pending">
            Pending
          </option>
          <option value="failed">
            Failed
          </option>
        </select>

        <select
          value={filterType}
          onChange={(event) =>
            setFilterType(
              event.target
                .value as FilterType,
            )
          }
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">
            All Types
          </option>
          <option value="data">
            Data
          </option>
          <option value="airtime">
            Airtime
          </option>
          <option value="electricity">
            Electricity
          </option>
          <option value="cable">
            Cable TV
          </option>
          <option value="betting">
            Betting
          </option>
          <option value="exam">
            Exam Pin
          </option>
          <option value="wallet_fund">
            Wallet Fund
          </option>
        </select>
      </div>

      {(normalizedSearch ||
        filterStatus !== 'all' ||
        filterType !== 'all') && (
        <div className="flex items-center gap-3 text-sm bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
          <span className="text-muted-foreground">
            {filtered.length} results
          </span>

          <span className="text-muted-foreground">
            ·
          </span>

          <span className="font-semibold text-primary">
            ₦
            {totalFiltered.toLocaleString()}{' '}
            revenue
          </span>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Transaction
                </th>

                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">
                  User
                </th>

                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                  Service
                </th>

                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Amount
                </th>

                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Status
                </th>

                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Detail
                </th>
              </tr>
            </thead>

            <tbody>
              {txnsLoading &&
              transactions.length === 0 ? (
                Array.from({
                  length: 6,
                }).map((_, index) => (
                  <tr
                    key={index}
                    className="border-b border-border"
                  >
                    <td className="px-4 py-4">
                      <Skeleton className="h-10 w-40" />
                    </td>

                    <td className="px-4 py-4 hidden md:table-cell">
                      <Skeleton className="h-8 w-32" />
                    </td>

                    <td className="px-4 py-4 hidden lg:table-cell">
                      <Skeleton className="h-8 w-28" />
                    </td>

                    <td className="px-4 py-4">
                      <Skeleton className="h-8 w-20 ml-auto" />
                    </td>

                    <td className="px-4 py-4">
                      <Skeleton className="h-7 w-20 mx-auto" />
                    </td>

                    <td className="px-4 py-4">
                      <Skeleton className="h-8 w-16 mx-auto" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-14 text-center text-muted-foreground"
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        No transactions found
                      </p>

                      <p className="text-xs">
                        Try changing your search
                        or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(
                  (transaction) => {
                    const amount =
                      getDisplayAmount(
                        transaction,
                      );

                    const reference =
                      getDisplayReference(
                        transaction,
                      );

                    const userName =
                      getDisplayUserName(
                        transaction,
                      );

                    const userPhone =
                      getDisplayPhone(
                        transaction,
                      );

                    return (
                      <tr
                        key={transaction.id}
                        className="border-b border-border last:border-b-0 hover:bg-background/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              {typeIcons[
                                transaction
                                  .type
                              ] ?? '💳'}
                            </span>

                            <div className="min-w-0">
                              <p className="font-semibold text-xs truncate max-w-[170px]">
                                {transaction.id}
                              </p>

                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {reference ||
                                  'No reference'}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 hidden md:table-cell">
                          <div>
                            <p className="font-medium text-xs">
                              {userName}
                            </p>

                            <p className="text-[10px] text-muted-foreground">
                              {userPhone}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div>
                            <p className="font-medium text-xs">
                              {typeLabels[
                                transaction
                                  .type
                              ] ??
                                transaction.type}
                            </p>

                            <p className="text-[10px] text-muted-foreground">
                              {getDisplayProvider(
                                transaction.provider,
                              )}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <p
                            className={`font-semibold text-xs ${
                              transaction.type ===
                              'wallet_fund'
                                ? 'text-green-400'
                                : ''
                            }`}
                          >
                            {transaction.type ===
                            'wallet_fund'
                              ? '+'
                              : ''}
                            ₦
                            {amount.toLocaleString()}
                          </p>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <StatusBadge
                            status={
                              transaction.status
                            }
                          />
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() =>
                              setSelected(
                                transaction,
                              )
                            }
                            className="text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  },
                )
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {filtered.length} of{' '}
              {txnsTotal.toLocaleString()}{' '}
              transactions
            </span>

            <span className="font-semibold text-foreground">
              ₦
              {filtered
                .reduce(
                  (total, transaction) =>
                    total +
                    getDisplayAmount(
                      transaction,
                    ),
                  0,
                )
                .toLocaleString()}{' '}
              total volume
            </span>
          </div>
        )}
      </div>

      {selected && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-50 p-5 max-w-sm mx-auto shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {typeIcons[
                    selected.type
                  ] ?? '💳'}
                </span>

                <div>
                  <h2 className="font-bold text-sm">
                    {selected.id.slice(
                      0,
                      12,
                    )}
                    …
                  </h2>

                  <StatusBadge
                    status={
                      selected.status
                    }
                  />
                </div>
              </div>

              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading && (
              <div className="flex items-center justify-center py-10">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}

            {!detailLoading &&
              detailError && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-red-400 text-sm">
                    {detailError}
                  </p>

                  <button
                    onClick={() => {
                      setDetailError('');
                      setDetailLoading(true);

                      apiGetTransactionDetail(
                        selected.id,
                      )
                        .then((data) =>
                          setDetail(data),
                        )
                        .catch((error) =>
                          setDetailError(
                            error instanceof
                              Error
                              ? error.message
                              : 'Failed to load detail.',
                          ),
                        )
                        .finally(() =>
                          setDetailLoading(
                            false,
                          ),
                        );
                    }}
                    className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary"
                  >
                    Try again
                  </button>
                </div>
              )}

            {!detailLoading &&
              !detailError &&
              detail && (
                <div className="space-y-4">
                  <div className="bg-white/[0.04] rounded-xl p-4 space-y-3">
                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        User
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {safeString(
                          detail.userName,
                          'Unknown User',
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Phone
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {safeString(
                          detail.userPhone,
                          '',
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Type
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {typeLabels[
                          detail.type
                        ] ??
                          detail.type}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Service
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {safeString(
                          detail.service,
                          '—',
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Provider
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {getDisplayProvider(
                          (
                            detail as TransactionDetail & {
                              provider?: string;
                            }
                          ).provider,
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Amount
                      </span>

                      <span className="text-xs font-bold">
                        ₦
                        {Number(
                          detail.amount ?? 0,
                        ).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Reference
                      </span>

                      <span className="text-xs font-semibold text-right break-all">
                        {safeString(
                          detail.reference,
                          '—',
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Description
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {safeString(
                          detail.description,
                          '—',
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        Date
                      </span>

                      <span className="text-xs font-semibold text-right">
                        {detail.createdAt
                          ? new Date(
                              detail.createdAt,
                            ).toLocaleString()
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {showActions && (
                    <div className="space-y-2">
                      <button
                        onClick={
                          handleMarkReview
                        }
                        disabled={
                          reviewLoading
                        }
                        className="w-full py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold disabled:opacity-50"
                      >
                        {reviewLoading
                          ? 'Processing…'
                          : 'Mark for Review'}
                      </button>

                      {reverseStep ===
                        'idle' && (
                        <button
                          onClick={() =>
                            setReverseStep(
                              'reason',
                            )
                          }
                          className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold"
                        >
                          Reverse Transaction
                        </button>
                      )}

                      {reverseStep ===
                        'reason' && (
                        <div className="space-y-2">
                          <textarea
                            value={
                              reverseReason
                            }
                            onChange={(event) =>
                              setReverseReason(
                                event.target
                                  .value,
                              )
                            }
                            placeholder="Enter reversal reason..."
                            rows={3}
                            className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none focus:border-primary resize-none"
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setReverseStep(
                                  'idle',
                                )
                              }
                              className="flex-1 py-2.5 rounded-xl bg-white/5 border border-border text-sm"
                            >
                              Cancel
                            </button>

                            <button
                              onClick={() =>
                                setReverseStep(
                                  'confirm',
                                )
                              }
                              disabled={
                                reverseReason.trim()
                                  .length < 10
                              }
                              className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold disabled:opacity-50"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      )}

                      {reverseStep ===
                        'confirm' && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Confirm this transaction reversal.
                          </p>

                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setReverseStep(
                                  'reason',
                                )
                              }
                              className="flex-1 py-2.5 rounded-xl bg-white/5 border border-border text-sm"
                            >
                              Back
                            </button>

                            <button
                              onClick={
                                handleReverse
                              }
                              className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      )}

                      {reverseStep ===
                        'loading' && (
                        <div className="text-center text-xs text-muted-foreground py-2">
                          Reversing transaction…
                        </div>
                      )}

                      {reverseStep ===
                        'done' && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs text-green-400 space-y-1">
                          <p className="font-semibold">
                            Transaction reversed successfully.
                          </p>

                          <p>
                            Reference:{' '}
                            {reversalRef ||
                              '—'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
        </>
      )}
    </div>
  );
}
