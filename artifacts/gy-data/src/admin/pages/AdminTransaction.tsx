import React, { useState, useEffect } from 'react';
import { Search, X, User, Hash, Calendar, CreditCard, RefreshCw } from 'lucide-react';
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

type FilterStatus = 'all' | 'success' | 'pending' | 'failed';
type FilterType = 'all' | 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';

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

function getDisplayProvider(provider: string): string {
  const value = String(provider ?? '').trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

/**
 * The transactions endpoint can return either the frontend camelCase shape
 * or raw database snake_case fields. Normalize both shapes here so the page
 * never calls string methods on undefined/null values.
 */
function normalizeTransaction(
  transaction: AdminTransaction,
): AdminTransaction {
  const raw =
    transaction as AdminTransaction &
      Record<string, unknown>;

  return {
    ...transaction,

    id: String(raw.id ?? ''),

    userId: String(
      raw.userId ??
        raw.user_id ??
        '',
    ),

    userName: String(
      raw.userName ??
        raw.user_name ??
        'Unknown User',
    ),

    phone:
      raw.phone == null
        ? undefined
        : String(raw.phone),

    type: String(
      raw.type ??
        raw.transactionType ??
        raw.transaction_type ??
        'wallet_fund',
    ) as AdminTransaction['type'],

    service: String(
      raw.service ??
        raw.serviceName ??
        raw.service_name ??
        '',
    ),

    provider: String(
      raw.provider ??
        raw.network ??
        '',
    ),

    amount:
      typeof raw.amount === 'number'
        ? raw.amount
        : Number(raw.amount ?? 0),

    date: String(
      raw.date ??
        raw.createdAt ??
        raw.created_at ??
        '',
    ),

    time: String(
      raw.time ??
        raw.createdTime ??
        raw.created_time ??
        '',
    ),

    status: String(
      raw.status ?? 'pending',
    ) as AdminTransaction['status'],

    description: String(
      raw.description ??
        raw.narration ??
        raw.remark ??
        '',
    ),

    reference: String(
      raw.reference ??
        raw.transactionReference ??
        raw.transaction_reference ??
        '',
    ),
  };
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
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDetailError(
            (e as Error).message ||
              'Failed to load detail.',
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
    if (!selected) {
      return;
    }

    setReviewLoading(true);

    try {
      await apiMarkTransactionReview(
        selected.id,
      );

      toast.success(
        'Transaction marked for review.',
      );

      void fetchTransactions();
    } catch (e) {
      toast.error(
        (e as Error).message ||
          'Failed to mark for review.',
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
      const res =
        await apiReverseTransaction(
          selected.id,
          reverseReason.trim(),
        );

      setReversalRef(res.reference);
      setReverseStep('done');

      toast.success(
        'Transaction reversed successfully.',
      );

      void fetchTransactions();
    } catch (e) {
      toast.error(
        (e as Error).message ||
          'Failed to reverse transaction.',
      );

      setReverseStep('confirm');
    }
  }

  /*
   * IMPORTANT:
   * Normalize before filtering. The API may return raw database fields,
   * where userName can be undefined. This prevents:
   *
   *     t.userName.toLowerCase()
   *
   * from ever being called on undefined.
   */
  const filtered = transactions
    .map(normalizeTransaction)
    .filter((t) => {
      const query = String(
        search ?? '',
      )
        .trim()
        .toLowerCase();

      const matchSearch =
        String(t.userName ?? '')
          .toLowerCase()
          .includes(query) ||
        String(t.id ?? '')
          .toLowerCase()
          .includes(query) ||
        String(t.reference ?? '')
          .toLowerCase()
          .includes(query) ||
        getDisplayProvider(t.provider)
          .toLowerCase()
          .includes(query);

      const matchStatus =
        filterStatus === 'all' ||
        t.status === filterStatus;

      const matchType =
        filterType === 'all' ||
        t.type === filterType;

      return (
        matchSearch &&
        matchStatus &&
        matchType
      );
    });

  const totalFiltered =
    filtered.reduce(
      (acc, t) =>
        acc +
        (t.status === 'success'
          ? t.amount
          : 0),
      0,
    );

  const showActions =
    isSuperAdmin;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Transaction History
          </h1>

          <p className="mt-1 text-sm text-white/50">
            View, inspect and manage
            platform transactions.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void fetchTransactions()
          }
          disabled={txnsLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              txnsLoading
                ? 'animate-spin'
                : ''
            }`}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/40">
            Total Transactions
          </p>

          <p className="mt-1 text-xl font-bold text-white">
            {txnsTotal.toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/40">
            Showing
          </p>

          <p className="mt-1 text-xl font-bold text-white">
            {filtered.length.toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/40">
            Successful Value
          </p>

          <p className="mt-1 text-xl font-bold text-white">
            {fmtNaira(totalFiltered)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/40">
            Today's Revenue
          </p>

          <p className="mt-1 text-xl font-bold text-white">
            {fmtNaira(
              Number(
                stats?.todayRevenue ?? 0,
              ),
            )}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search user, ID or reference..."
              className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(
                e.target.value as FilterStatus,
              )
            }
            className="h-11 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm text-white outline-none"
          >
            <option value="all">
              All Statuses
            </option>
            <option value="success">
              Success
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
            onChange={(e) =>
              setFilterType(
                e.target.value as FilterType,
              )
            }
            className="h-11 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm text-white outline-none"
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
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.025]">
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  Transaction
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  User
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  Type
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  Provider
                </th>

                <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-white/40">
                  Amount
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  Date
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  Status
                </th>

                <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-white/40">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {txnsLoading ? (
                <>
                  {Array.from({
                    length: 6,
                  }).map((_, index) => (
                    <tr
                      key={index}
                      className="border-b border-white/5"
                    >
                      <td className="px-5 py-4">
                        <Skeleton className="h-10 w-40" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="h-10 w-36" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="h-8 w-24" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="h-8 w-24" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="ml-auto h-8 w-24" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="h-8 w-28" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="h-8 w-20" />
                      </td>

                      <td className="px-5 py-4">
                        <Skeleton className="ml-auto h-8 w-20" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-16 text-center"
                  >
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                        <Search className="h-5 w-5 text-white/30" />
                      </div>

                      <p className="font-medium text-white">
                        No transactions found
                      </p>

                      <p className="mt-1 text-sm text-white/40">
                        Try changing your
                        search or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((txn) => (
                  <tr
                    key={txn.id}
                    className="border-b border-white/5 transition hover:bg-white/[0.025]"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-mono text-xs font-medium text-white">
                          {String(
                            txn.id ?? '',
                          ) || '—'}
                        </p>

                        <p className="mt-1 max-w-[190px] truncate text-xs text-white/40">
                          {String(
                            txn.reference ?? '',
                          ) || 'No reference'}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5">
                          <User className="h-4 w-4 text-white/40" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {String(
                              txn.userName ??
                                'Unknown User',
                            ) || 'Unknown User'}
                          </p>

                          <p className="mt-0.5 truncate text-xs text-white/40">
                            {String(
                              txn.phone ?? '',
                            ) || 'No phone'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {typeIcons[
                            String(
                              txn.type ?? '',
                            )
                          ] ?? '💳'}
                        </span>

                        <div>
                          <p className="text-sm font-medium text-white">
                            {typeLabels[
                              String(
                                txn.type ?? '',
                              )
                            ] ??
                              String(
                                txn.type ?? '',
                              ) ||
                              'Unknown'}
                          </p>

                          <p className="mt-0.5 text-xs text-white/40">
                            {String(
                              txn.service ?? '',
                            ) || '—'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm text-white/80">
                        {getDisplayProvider(
                          txn.provider,
                        )}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-semibold text-white">
                        {fmtNaira(
                          Number(
                            txn.amount ?? 0,
                          ),
                        )}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm text-white/80">
                        {String(
                          txn.date ?? '',
                        ) || '—'}
                      </p>

                      <p className="mt-0.5 text-xs text-white/40">
                        {String(
                          txn.time ?? '',
                        ) || ''}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge
                        status={
                          txn.status
                        }
                      />
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setSelected(txn)
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white transition hover:bg-white/[0.08]"
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

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/40">
            Showing {filtered.length} of{' '}
            {txnsTotal.toLocaleString()}{' '}
            transactions
          </p>

          <button
            type="button"
            onClick={() =>
              void fetchTransactions()
            }
            disabled={txnsLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 transition hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                txnsLoading
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Refresh
          </button>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f19] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Transaction Details
                </h2>

                <p className="mt-1 font-mono text-xs text-white/40">
                  {String(
                    selected.id ?? '',
                  ) || '—'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-5">
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="h-7 w-7 animate-spin text-white/40" />

                  <p className="mt-3 text-sm text-white/40">
                    Loading transaction
                    details...
                  </p>
                </div>
              ) : detailError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                  <p className="text-sm font-medium text-red-300">
                    Failed to load
                    transaction details
                  </p>

                  <p className="mt-1 text-sm text-red-300/60">
                    {detailError}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        {
                          ...selected,
                        },
                      )
                    }
                    className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-white/40">
                        <User className="h-4 w-4" />
                        <span className="text-xs">
                          User
                        </span>
                      </div>

                      <p className="mt-2 font-medium text-white">
                        {String(
                          detail?.userName ??
                            selected.userName ??
                            'Unknown User',
                        ) || 'Unknown User'}
                      </p>

                      <p className="mt-1 text-xs text-white/40">
                        {String(
                          detail?.userPhone ??
                            selected.phone ??
                            '',
                        ) || 'No phone'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-white/40">
                        <CreditCard className="h-4 w-4" />
                        <span className="text-xs">
                          Amount
                        </span>
                      </div>

                      <p className="mt-2 text-xl font-bold text-white">
                        {fmtNaira(
                          Number(
                            detail?.amount ??
                              selected.amount ??
                              0,
                          ),
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <p className="text-xs text-white/40">
                        Status
                      </p>

                      <div className="mt-2">
                        <StatusBadge
                          status={
                            detail?.status ??
                            selected.status
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-white/40">
                        <Hash className="h-4 w-4" />
                        <span className="text-xs">
                          Reference
                        </span>
                      </div>

                      <p className="mt-2 break-all font-mono text-xs text-white">
                        {String(
                          detail?.reference ??
                            selected.reference ??
                            '',
                        ) || '—'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2 text-white/40">
                        <Calendar className="h-4 w-4" />
                        <span className="text-xs">
                          Date
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-white">
                        {String(
                          detail?.createdAt ??
                            selected.date ??
                            '',
                        ) || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <p className="text-xs text-white/40">
                        Type
                      </p>

                      <p className="mt-2 text-sm font-medium text-white">
                        {typeLabels[
                          String(
                            detail?.type ??
                              selected.type ??
                              '',
                          )
                        ] ??
                          String(
                            detail?.type ??
                              selected.type ??
                              '',
                          ) ||
                          'Unknown'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <p className="text-xs text-white/40">
                        Service
                      </p>

                      <p className="mt-2 text-sm font-medium text-white">
                        {String(
                          detail?.service ??
                            selected.service ??
                            '',
                        ) || '—'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <p className="text-xs text-white/40">
                        Provider
                      </p>

                      <p className="mt-2 text-sm font-medium text-white">
                        {getDisplayProvider(
                          String(
                            detail?.network ??
                              selected.provider ??
                              '',
                          ),
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <p className="text-xs text-white/40">
                      Description
                    </p>

                    <p className="mt-2 text-sm leading-6 text-white/80">
                      {String(
                        detail?.description ??
                          selected.description ??
                          '',
                      ) || 'No description'}
                    </p>
                  </div>

                  {showActions && (
                    <div className="border-t border-white/10 pt-5">
                      {reverseStep ===
                      'done' ? (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                          <p className="text-sm font-semibold text-emerald-300">
                            Transaction
                            reversed
                            successfully.
                          </p>

                          <p className="mt-2 text-xs text-white/50">
                            Reversal reference:{' '}
                            <span className="font-mono text-white/80">
                              {reversalRef ||
                                '—'}
                            </span>
                          </p>
                        </div>
                      ) : reverseStep ===
                        'reason' ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-white/60">
                              Reversal Reason
                            </label>

                            <textarea
                              value={
                                reverseReason
                              }
                              onChange={(e) =>
                                setReverseReason(
                                  e.target.value,
                                )
                              }
                              rows={4}
                              placeholder="Enter the reason for reversing this transaction..."
                              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20"
                            />
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setReverseStep(
                                  'idle',
                                );
                                setReverseReason(
                                  '',
                                );
                              }}
                              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              disabled={
                                !reverseReason.trim()
                              }
                              onClick={() =>
                                setReverseStep(
                                  'confirm',
                                )
                              }
                              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      ) : reverseStep ===
                        'confirm' ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                          <p className="text-sm font-semibold text-white">
                            Confirm transaction
                            reversal
                          </p>

                          <p className="mt-2 text-sm text-white/50">
                            This action will
                            reverse the
                            transaction and
                            process the
                            corresponding
                            reversal.
                          </p>

                          <div className="mt-4 rounded-lg bg-black/20 p-3">
                            <p className="text-xs text-white/40">
                              Reason
                            </p>

                            <p className="mt-1 text-sm text-white/80">
                              {reverseReason}
                            </p>
                          </div>

                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setReverseStep(
                                  'reason',
                                )
                              }
                              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
                            >
                              Back
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleReverse()
                              }
                              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
                            >
                              Confirm Reversal
                            </button>
                          </div>
                        </div>
                      ) : reverseStep ===
                        'loading' ? (
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                          <RefreshCw className="h-4 w-4 animate-spin text-white/50" />

                          <span className="text-sm text-white/50">
                            Processing
                            reversal...
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleMarkReview()
                            }
                            disabled={
                              reviewLoading
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-2 text-sm font-medium text-yellow-300 transition hover:bg-yellow-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {reviewLoading ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <CreditCard className="h-4 w-4" />
                            )}

                            Mark for Review
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setReverseStep(
                                'reason',
                              )
                            }
                            disabled={
                              selected.status ===
                              'failed'
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Reverse
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
