import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CreditCard,
  Hash,
  RefreshCw,
  Search,
  User,
  X,
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

type FilterStatus = 'all' | 'success' | 'pending' | 'failed';

type FilterType =
  | 'all'
  | 'data'
  | 'airtime'
  | 'electricity'
  | 'cable'
  | 'betting'
  | 'exam'
  | 'wallet_fund';

type TransactionDetailView = TransactionDetail & {
  userEmail?: string | null;
  provider?: string | null;
  paymentMethod?: string | null;
  reversal?: {
    reason?: string | null;
    performedByName?: string | null;
    createdAt?: string | null;
  } | null;
};

type NormalizedTransaction = AdminTransaction & {
  userPhone: string;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
    ) {
      return String(value);
    }
  }

  return '';
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const n =
      typeof value === 'number'
        ? value
        : Number(value);

    if (Number.isFinite(n)) {
      return n;
    }
  }

  return 0;
}

function normalizeTransaction(
  value: unknown,
): NormalizedTransaction {
  const raw = asRecord(value);

  const createdAt = stringValue(
    raw.createdAt,
    raw.created_at,
  );

  const dateObject = createdAt
    ? new Date(createdAt)
    : null;

  const validDate =
    dateObject &&
    !Number.isNaN(dateObject.getTime());

  const status =
    stringValue(raw.status).toLowerCase();

  const safeStatus: AdminTransaction['status'] =
    status === 'success' ||
    status === 'failed' ||
    status === 'pending'
      ? status
      : 'pending';

  return {
    id: stringValue(raw.id),

    userId: stringValue(
      raw.userId,
      raw.user_id,
    ),

    userName:
      stringValue(
        raw.userName,
        raw.user_name,
        raw.name,
        raw.username,
        raw.userId,
        raw.user_id,
      ) || 'Unknown user',

    userPhone: stringValue(
      raw.userPhone,
      raw.user_phone,
      raw.phone,
    ),

    phone: stringValue(
      raw.phone,
    ),

    type: stringValue(
      raw.type,
    ) as AdminTransaction['type'],

    service: stringValue(
      raw.service,
    ),

    provider: stringValue(
      raw.provider,
    ),

    amount: numberValue(
      raw.amount,
    ),

    date: validDate
      ? dateObject!.toLocaleDateString()
      : '',

    time: validDate
      ? dateObject!.toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit',
          },
        )
      : '',

    status: safeStatus,

    description: stringValue(
      raw.description,
    ),

    reference: stringValue(
      raw.reference,
    ),
  };
}

function normalizeTransactionDetail(
  value: unknown,
): TransactionDetailView {
  const root = asRecord(value);

  const raw = asRecord(
    root.transaction ??
      root.data ??
      root,
  );

  const reversal =
    asRecord(raw.reversal);

  return {
    id: stringValue(
      raw.id,
    ),

    userId: stringValue(
      raw.userId,
      raw.user_id,
    ),

    userName:
      stringValue(
        raw.userName,
        raw.user_name,
        raw.name,
      ) || undefined,

    userPhone:
      stringValue(
        raw.userPhone,
        raw.user_phone,
        raw.phone,
      ) || undefined,

    userEmail:
      stringValue(
        raw.userEmail,
        raw.user_email,
        raw.email,
      ) || null,

    type: stringValue(
      raw.type,
    ),

    service:
      stringValue(
        raw.service,
      ) || null,

    network:
      stringValue(
        raw.network,
      ) || null,

    phone:
      stringValue(
        raw.phone,
      ) || null,

    amount: numberValue(
      raw.amount,
    ),

    status: stringValue(
      raw.status,
    ),

    reference:
      stringValue(
        raw.reference,
      ) || null,

    providerReference:
      stringValue(
        raw.providerReference,
        raw.provider_reference,
      ) || null,

    description:
      stringValue(
        raw.description,
      ) || null,

    metadata:
      raw.metadata,

    createdAt:
      stringValue(
        raw.createdAt,
        raw.created_at,
      ),

    updatedAt:
      stringValue(
        raw.updatedAt,
        raw.updated_at,
      ) || null,

    provider:
      stringValue(
        raw.provider,
      ) || null,

    paymentMethod:
      stringValue(
        raw.paymentMethod,
        raw.payment_method,
      ) || null,

    reversal:
      raw.reversal &&
      typeof raw.reversal === 'object'
        ? {
            reason:
              stringValue(
                reversal.reason,
              ) || null,

            performedByName:
              stringValue(
                reversal.performedByName,
                reversal.performed_by_name,
              ) || null,

            createdAt:
              stringValue(
                reversal.createdAt,
                reversal.created_at,
              ) || null,
          }
        : null,
  };
}

function getDisplayProvider(
  provider: string,
): string {
  const value = String(
    provider ?? '',
  ).trim();

  const normalized =
    value.toLowerCase();

  if (
    normalized === 'smeapi' ||
    normalized === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function Skeleton({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] rounded-lg ${className}`}
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

  const [
    filterStatus,
    setFilterStatus,
  ] =
    useState<FilterStatus>('all');

  const [
    filterType,
    setFilterType,
  ] =
    useState<FilterType>('all');

  const [
    selected,
    setSelected,
  ] =
    useState<NormalizedTransaction | null>(
      null,
    );

  const [
    detail,
    setDetail,
  ] =
    useState<TransactionDetailView | null>(
      null,
    );

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(false);

  const [
    detailError,
    setDetailError,
  ] =
    useState('');

  const [
    reviewLoading,
    setReviewLoading,
  ] =
    useState(false);

  const [
    reverseStep,
    setReverseStep,
  ] =
    useState<
      | 'idle'
      | 'reason'
      | 'confirm'
      | 'loading'
      | 'done'
    >('idle');

  const [
    reverseReason,
    setReverseReason,
  ] =
    useState('');

  const [
    reversalRef,
    setReversalRef,
  ] =
    useState('');

  const normalizedTransactions =
    useMemo(
      () =>
        transactions.map(
          normalizeTransaction,
        ),
      [transactions],
    );

  const filtered =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return normalizedTransactions.filter(
        (transaction) => {
          const matchSearch =
            String(
              transaction.userName,
            )
              .toLowerCase()
              .includes(query) ||
            String(
              transaction.userPhone,
            )
              .toLowerCase()
              .includes(query) ||
            String(
              transaction.id,
            )
              .toLowerCase()
              .includes(query) ||
            String(
              transaction.reference,
            )
              .toLowerCase()
              .includes(query) ||
            getDisplayProvider(
              transaction.provider,
            )
              .toLowerCase()
              .includes(query);

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
    }, [
      normalizedTransactions,
      search,
      filterStatus,
      filterType,
    ]);

  const totalFiltered =
    useMemo(
      () =>
        filtered.reduce(
          (
            total,
            transaction,
          ) =>
            total +
            (transaction.status ===
            'success'
              ? transaction.amount
              : 0),
          0,
        ),
      [filtered],
    );

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
    setReversalRef('');

    apiGetTransactionDetail(
      selected.id,
    )
      .then((payload) => {
        if (!cancelled) {
          setDetail(
            normalizeTransactionDetail(
              payload,
            ),
          );
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

      await fetchTransactions();
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
      const result =
        await apiReverseTransaction(
          selected.id,
          reverseReason.trim(),
        );

      setReversalRef(
        result.reference,
      );

      setReverseStep('done');

      toast.success(
        'Transaction reversed successfully.',
      );

      await fetchTransactions();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to reverse transaction.',
      );

      setReverseStep('confirm');
    }
  }

  const showActions =
    isSuperAdmin &&
    detail &&
    detail.status ===
      'success' &&
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
                  stats?.totalRevenue ??
                    0,
                )} revenue`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-2 flex-wrap text-xs">
            {txnsLoading &&
            !stats ? (
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
                  {stats?.pendingTransactions ??
                    0}{' '}
                  Pending
                </div>

                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl font-semibold">
                  {stats?.failedTransactions ??
                    0}{' '}
                  Failed
                </div>
              </>
            )}
          </div>

          <button
            onClick={() =>
              void fetchTransactions()
            }
            disabled={txnsLoading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Refresh transactions"
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
            placeholder="Search by user, phone, ID, reference or provider…"
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

      {(search ||
        filterStatus !== 'all' ||
        filterType !== 'all') && (
        <div className="flex items-center gap-3 text-sm bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
          <span className="text-muted-foreground">
            {filtered.length}{' '}
            results
          </span>

          <span className="text-muted-foreground">
            ·
          </span>

          <span className="font-semibold text-primary">
            {fmtNaira(
              totalFiltered,
            )}{' '}
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
              normalizedTransactions.length ===
                0 ? (
                Array.from({
                  length: 6,
                }).map(
                  (_, index) => (
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
                  ),
                )
              ) : filtered.length ===
                0 ? (
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
                        Try changing your
                        search or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(
                  (
                    transaction,
                  ) => (
                    <tr
                      key={
                        transaction.id
                      }
                      className="border-b border-border last:border-b-0 hover:bg-background/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {typeIcons[
                              transaction
                                .type
                            ] ??
                              '💳'}
                          </span>

                          <div className="min-w-0">
                            <p className="font-semibold text-xs truncate max-w-[170px]">
                              {transaction.id ||
                                'N/A'}
                            </p>

                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {transaction.reference ||
                                'No reference'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden md:table-cell">
                        <div>
                          <p className="font-medium text-xs">
                            {
                              transaction.userName
                            }
                          </p>

                          <p className="text-[10px] text-muted-foreground">
                            {transaction.userPhone ||
                              '—'}
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

                          {fmtNaira(
                            transaction.amount,
                          )}
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
                  ),
                )
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing{' '}
              {filtered.length} of{' '}
              {txnsTotal.toLocaleString()}{' '}
              transactions
            </span>

            <span className="font-semibold text-foreground">
              {fmtNaira(
                filtered.reduce(
                  (
                    total,
                    transaction,
                  ) =>
                    total +
                    transaction.amount,
                  0,
                ),
              )}{' '}
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
                    {selected.id
                      ? `${selected.id.slice(
                          0,
                          12,
                        )}…`
                      : 'Transaction'}
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
                aria-label="Close transaction detail"
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
                      setDetailError(
                        '',
                      );

                      setDetailLoading(
                        true,
                      );

                      apiGetTransactionDetail(
                        selected.id,
                      )
                        .then(
                          (
                            payload,
                          ) =>
                            setDetail(
                              normalizeTransactionDetail(
                                payload,
                              ),
                            ),
                        )
                        .catch(
                          (
                            error,
                          ) =>
                            setDetailError(
                              error instanceof
                              Error
                                ? error.message
                                : 'Failed to load detail.',
                            ),
                        )
                        .finally(
                          () =>
                            setDetailLoading(
                              false,
                            ),
                        );
                    }}
                    className="text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

            {!detailLoading &&
              !detailError &&
              detail && (
                <div className="space-y-3 text-sm">
                  <Row
                    icon={User}
                    label="User"
                    value={
                      [
                        detail.userName,
                        detail.userPhone,
                        detail.userEmail,
                      ]
                        .filter(Boolean)
                        .join(' · ') ||
                      'Unknown user'
                    }
                  />

                  <Row
                    icon={Hash}
                    label="Reference"
                    value={
                      detail.reference ||
                      'N/A'
                    }
                    mono
                  />

                  <Row
                    icon={CreditCard}
                    label="Service"
                    value={`${typeLabels[
                      detail.type
                    ] ??
                      detail.service ??
                      detail.type} · ${getDisplayProvider(
                      detail.provider ??
                        '',
                    )}`}
                  />

                  <Row
                    icon={CreditCard}
                    label="Method"
                    value={
                      detail.paymentMethod ||
                      'N/A'
                    }
                  />

                  <Row
                    icon={Calendar}
                    label="Date"
                    value={
                      detail.createdAt &&
                      !Number.isNaN(
                        new Date(
                          detail.createdAt,
                        ).getTime(),
                      )
                        ? new Date(
                            detail.createdAt,
                          ).toLocaleString()
                        : 'N/A'
                    }
                  />

                  <div className="bg-background rounded-xl p-4 border border-border text-center mt-2">
                    <p
                      className={`text-2xl font-bold ${
                        detail.type ===
                        'wallet_fund'
                          ? 'text-green-400'
                          : ''
                      }`}
                    >
                      {detail.type ===
                      'wallet_fund'
                        ? '+'
                        : ''}

                      {fmtNaira(
                        detail.amount,
                      )}
                    </p>

                    <p className="text-xs text-muted-foreground mt-1">
                      {detail.description ||
                        'No description'}
                    </p>
                  </div>

                  {detail.reversal && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 space-y-1">
                      <p className="text-green-400 font-semibold text-xs">
                        ✓ Reversed
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Reason:{' '}
                        {detail
                          .reversal
                          .reason ||
                          'N/A'}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        By{' '}
                        {detail
                          .reversal
                          .performedByName ||
                          'N/A'}{' '}
                        on{' '}
                        {detail
                          .reversal
                          .createdAt &&
                        !Number.isNaN(
                          new Date(
                            detail
                              .reversal
                              .createdAt,
                          ).getTime(),
                        )
                          ? new Date(
                              detail
                                .reversal
                                .createdAt,
                            ).toLocaleDateString()
                          : 'N/A'}
                      </p>
                    </div>
                  )}

                  {showActions && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() =>
                          void handleMarkReview()
                        }
                        disabled={
                          reviewLoading
                        }
                        className="w-full text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-2 rounded-xl hover:bg-amber-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {reviewLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Marking…
                          </>
                        ) : (
                          '🔍 Mark for Review'
                        )}
                      </button>

                      {reverseStep ===
                        'idle' && (
                        <button
                          onClick={() =>
                            setReverseStep(
                              'reason',
                            )
                          }
                          className="w-full text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl hover:bg-red-500/20 transition-colors"
                        >
                          ↩ Reverse Transaction
                        </button>
                      )}

                      {reverseStep ===
                        'reason' && (
                        <div className="space-y-2">
                          <textarea
                            placeholder="Enter reason for reversal…"
                            value={
                              reverseReason
                            }
                            onChange={(
                              event,
                            ) =>
                              setReverseReason(
                                event
                                  .target
                                  .value,
                              )
                            }
                            rows={2}
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs outline-none focus:border-red-400 transition-colors resize-none"
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setReverseStep(
                                  'idle',
                                )
                              }
                              className="flex-1 text-xs bg-white/5 border border-border px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>

                            <button
                              onClick={() => {
                                if (
                                  reverseReason.trim()
                                ) {
                                  setReverseStep(
                                    'confirm',
                                  );
                                }
                              }}
                              disabled={
                                !reverseReason.trim()
                              }
                              className="flex-1 text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl hover:bg-red-500/20 transition-colors disabled:opacity-40"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      )}

                      {reverseStep ===
                        'confirm' && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-red-400">
                            Confirm Reversal
                          </p>

                          <p className="text-xs text-muted-foreground">
                            "
                            {
                              reverseReason
                            }
                            "
                          </p>

                          <p className="text-xs text-muted-foreground">
                            This will credit{' '}
                            {fmtNaira(
                              detail.amount,
                            )}{' '}
                            back to the
                            user's wallet.
                          </p>

                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() =>
                                setReverseStep(
                                  'reason',
                                )
                              }
                              className="flex-1 text-xs bg-white/5 border border-border px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                            >
                              Back
                            </button>

                            <button
                              onClick={() =>
                                void handleReverse()
                              }
                              className="flex-1 text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-3 py-1.5 rounded-xl hover:bg-red-500/30 transition-colors font-semibold"
                            >
                              Confirm Reverse
                            </button>
                          </div>
                        </div>
                      )}

                      {reverseStep ===
                        'loading' && (
                        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Processing reversal…
                        </div>
                      )}

                      {reverseStep ===
                        'done' && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 space-y-1">
                          <p className="text-green-400 font-semibold text-xs">
                            ✓ Reversal Complete
                          </p>

                          {reversalRef && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {
                                reversalRef
                              }
                            </p>
                          )}
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

function Row({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      <span className="text-muted-foreground w-20 flex-shrink-0 text-xs">
        {label}
      </span>

      <span
        className={`font-medium text-xs truncate ${
          mono
            ? 'font-mono text-[10px]'
            : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
