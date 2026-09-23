import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  X,
  User,
  Hash,
  Calendar,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import type { AdminTransaction } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';

import {
  apiGetTransactionDetail,
  apiMarkTransactionReview,
  apiReverseTransaction,
  type TransactionDetail,
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

type RawRecord = Record<string, unknown>;

type ExtendedTransaction = AdminTransaction & {
  userEmail?: string;
  userPhone?: string;
};

type ExtendedDetail = TransactionDetail & {
  userEmail?: string;
  provider?: string;
  paymentMethod?: string | null;
  reversal?: {
    reason?: string | null;
    performedByName?: string | null;
    createdAt?: string | null;
  } | null;
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

function stringValue(
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

function nullableString(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const valueString = String(value).trim();

  return valueString || null;
}

function numberValue(
  value: unknown,
  fallback = 0,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function getDisplayProvider(
  provider: unknown,
): string {
  const value = stringValue(
    provider,
  ).trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

/**
 * The API currently returns database column names
 * such as user_id/user_name/user_phone while the
 * React interface expects camelCase.
 *
 * This normalizer supports BOTH shapes so the page
 * never crashes when userName is missing.
 */
function normalizeTransaction(
  input: unknown,
): ExtendedTransaction {
  const row =
    (input ?? {}) as RawRecord;

  const id = stringValue(
    row['id'] ??
      row['transactionId'] ??
      row['transaction_id'],
  );

  const userId = stringValue(
    row['userId'] ??
      row['user_id'],
  );

  const userName =
    stringValue(
      row['userName'] ??
        row['user_name'] ??
        row['name'],
    ).trim() || 'Unknown User';

  const phone =
    stringValue(
      row['phone'] ??
        row['userPhone'] ??
        row['user_phone'],
    ).trim();

  const type = stringValue(
    row['type'],
    'data',
  ) as AdminTransaction['type'];

  const service = stringValue(
    row['service'],
  );

  const provider = getDisplayProvider(
    row['provider'],
  );

  const amount = numberValue(
    row['amount'],
  );

  const statusValue = stringValue(
    row['status'],
    'pending',
  );

  const status =
    statusValue === 'success' ||
    statusValue === 'failed' ||
    statusValue === 'pending'
      ? statusValue
      : 'pending';

  const reference = stringValue(
    row['reference'],
  );

  const description = stringValue(
    row['description'],
  );

  const createdAt =
    row['createdAt'] ??
    row['created_at'];

  const dateObject =
    createdAt
      ? new Date(
          String(createdAt),
        )
      : null;

  const validDate =
    dateObject &&
    !Number.isNaN(
      dateObject.getTime(),
    )
      ? dateObject
      : null;

  return {
    id,
    userId,
    userName,
    phone,
    type,
    service,
    provider,
    amount,
    date: validDate
      ? validDate
          .toISOString()
          .slice(0, 10)
      : '',
    time: validDate
      ? validDate
          .toISOString()
          .slice(11, 19)
      : '',
    status,
    description,
    reference,
    userPhone: phone,
    userEmail:
      nullableString(
        row['userEmail'] ??
          row['user_email'] ??
          row['email'],
      ) ?? undefined,
  };
}

function normalizeDetail(
  input: unknown,
): ExtendedDetail {
  const wrapper =
    (input ?? {}) as RawRecord;

  const source =
    wrapper['transaction'] &&
    typeof wrapper['transaction'] ===
      'object'
      ? (wrapper[
          'transaction'
        ] as RawRecord)
      : wrapper;

  const createdAt =
    source['createdAt'] ??
    source['created_at'];

  const updatedAt =
    source['updatedAt'] ??
    source['updated_at'];

  const metadata =
    source['metadata'];

  const reversalRaw =
    source['reversal'];

  const reversal =
    reversalRaw &&
    typeof reversalRaw === 'object'
      ? {
          reason:
            nullableString(
              (
                reversalRaw as RawRecord
              )['reason'],
            ),
          performedByName:
            nullableString(
              (
                reversalRaw as RawRecord
              )[
                'performedByName'
              ] ??
                (
                  reversalRaw as RawRecord
                )[
                  'performed_by_name'
                ],
            ),
          createdAt:
            nullableString(
              (
                reversalRaw as RawRecord
              )[
                'createdAt'
              ] ??
                (
                  reversalRaw as RawRecord
                )[
                  'created_at'
                ],
            ),
        }
      : null;

  return {
    id: stringValue(
      source['id'],
    ),

    userId: stringValue(
      source['userId'] ??
        source['user_id'],
    ),

    userName:
      stringValue(
        source['userName'] ??
          source['user_name'] ??
          source['name'],
      ).trim() ||
      'Unknown User',

    userPhone:
      nullableString(
        source['userPhone'] ??
          source['user_phone'] ??
          source['phone'],
      ) ?? undefined,

    userEmail:
      nullableString(
        source['userEmail'] ??
          source['user_email'] ??
          source['email'],
      ) ?? undefined,

    type: stringValue(
      source['type'],
    ),

    service:
      nullableString(
        source['service'],
      ),

    network:
      nullableString(
        source['network'],
      ),

    phone:
      nullableString(
        source['phone'],
      ),

    amount: numberValue(
      source['amount'],
    ),

    status: stringValue(
      source['status'],
      'pending',
    ),

    reference:
      nullableString(
        source['reference'],
      ),

    providerReference:
      nullableString(
        source[
          'providerReference'
        ] ??
          source[
            'provider_reference'
          ],
      ),

    description:
      nullableString(
        source['description'],
      ),

    metadata,

    createdAt: createdAt
      ? String(createdAt)
      : new Date().toISOString(),

    updatedAt: updatedAt
      ? String(updatedAt)
      : null,

    provider:
      getDisplayProvider(
        source['provider'],
      ),

    paymentMethod:
      nullableString(
        source[
          'paymentMethod'
        ] ??
          source[
            'payment_method'
          ],
      ),

    reversal,
  };
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

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    filterStatus,
    setFilterStatus,
  ] = useState<FilterStatus>(
    'all',
  );

  const [
    filterType,
    setFilterType,
  ] = useState<FilterType>(
    'all',
  );

  const [
    selected,
    setSelected,
  ] =
    useState<ExtendedTransaction | null>(
      null,
    );

  const [
    detail,
    setDetail,
  ] =
    useState<ExtendedDetail | null>(
      null,
    );

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    detailError,
    setDetailError,
  ] = useState('');

  const [
    reviewLoading,
    setReviewLoading,
  ] = useState(false);

  const [
    reverseStep,
    setReverseStep,
  ] = useState<
    | 'idle'
    | 'reason'
    | 'confirm'
    | 'loading'
    | 'done'
  >('idle');

  const [
    reverseReason,
    setReverseReason,
  ] = useState('');

  const [
    reversalRef,
    setReversalRef,
  ] = useState('');

  const normalizedTransactions =
    useMemo(
      () =>
        (
          transactions ?? []
        ).map(
          normalizeTransaction,
        ),
      [transactions],
    );

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError('');
      setDetailLoading(false);
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
        if (cancelled) return;

        const normalized =
          normalizeDetail(payload);

        setDetail(normalized);
      })
      .catch((error) => {
        if (cancelled) return;

        setDetailError(
          error instanceof Error
            ? error.message
            : 'Failed to load transaction detail.',
        );
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
          : 'Failed to mark transaction for review.',
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

  const filtered =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return normalizedTransactions.filter(
        (transaction) => {
          const userName =
            stringValue(
              transaction.userName,
            ).toLowerCase();

          const userPhone =
            stringValue(
              transaction.phone,
            ).toLowerCase();

          const id =
            stringValue(
              transaction.id,
            ).toLowerCase();

          const reference =
            stringValue(
              transaction.reference,
            ).toLowerCase();

          const provider =
            getDisplayProvider(
              transaction.provider,
            ).toLowerCase();

          const service =
            stringValue(
              transaction.service,
            ).toLowerCase();

          const matchSearch =
            !query ||
            userName.includes(query) ||
            userPhone.includes(query) ||
            id.includes(query) ||
            reference.includes(query) ||
            provider.includes(query) ||
            service.includes(query);

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
          numberValue(
            transaction.amount,
          )
        );
      },
      0,
    );

  const showActions =
    Boolean(
      isSuperAdmin &&
        detail &&
        detail.status ===
          'success' &&
        !detail.reversal,
    );

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">
            Transactions
          </h1>

          <p className="text-sm text-muted-foreground mt-0.5">
            {txnsLoading &&
            !stats
              ? 'Loading…'
              : `${(
                  stats?.totalTransactions ??
                  txnsTotal ??
                  0
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
            type="button"
            onClick={() =>
              void fetchTransactions()
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

      {(search.trim() ||
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
              normalizedTransactions.length ===
                0 ? (
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
                        Try changing your search
                        or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(
                  (transaction) => (
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
                            ] ??
                              '💳'}
                          </span>

                          <div className="min-w-0">
                            <p className="font-semibold text-xs truncate max-w-[170px]">
                              {transaction.id ||
                                'Unknown ID'}
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
                            {transaction.userName ||
                              'Unknown User'}
                          </p>

                          <p className="text-[10px] text-muted-foreground">
                            {transaction.phone ||
                              'No phone'}
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
                          {numberValue(
                            transaction.amount,
                          ).toLocaleString()}
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
                          type="button"
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
              {(
                txnsTotal ??
                filtered.length
              ).toLocaleString()}{' '}
              transactions
            </span>

            <span className="font-semibold text-foreground">
              ₦
              {filtered
                .reduce(
                  (total, transaction) =>
                    total +
                    numberValue(
                      transaction.amount,
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
                type="button"
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
                    type="button"
                    onClick={() => {
                      setDetailError('');
                      setDetailLoading(
                        true,
                      );

                      apiGetTransactionDetail(
                        selected.id,
                      )
                        .then(
                          (payload) => {
                            setDetail(
                              normalizeDetail(
                                payload,
                              ),
                            );
                          },
                        )
                        .catch(
                          (error) => {
                            setDetailError(
                              error instanceof
                                Error
                                ? error.message
                                : 'Failed to load transaction detail.',
                            );
                          },
                        )
                        .finally(() => {
                          setDetailLoading(
                            false,
                          );
                        });
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
                    value={[
                      detail.userName ||
                        'Unknown User',
                      detail.userPhone,
                      detail.userEmail,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
                      'Transaction'} · ${getDisplayProvider(
                      detail.provider,
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
                      detail.createdAt
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
                      ₦
                      {numberValue(
                        detail.amount,
                      ).toLocaleString()}
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

                      {detail
                        .reversal
                        .performedByName && (
                        <p className="text-xs text-muted-foreground">
                          By{' '}
                          {
                            detail
                              .reversal
                              .performedByName
                          }{' '}
                          {detail
                            .reversal
                            .createdAt
                            ? `on ${new Date(
                                detail
                                  .reversal
                                  .createdAt,
                              ).toLocaleDateString()}`
                            : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {showActions && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <button
                        type="button"
                        onClick={
                          handleMarkReview
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
                          type="button"
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
                                event.target
                                  .value,
                              )
                            }
                            rows={2}
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs outline-none focus:border-red-400 transition-colors resize-none"
                          />

                          <div className="flex gap-2">
                            <button
                              type="button"
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
                              type="button"
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
                            "{reverseReason}"
                          </p>

                          <p className="text-xs text-muted-foreground">
                            This will credit ₦
                            {numberValue(
                              detail.amount,
                            ).toLocaleString()}{' '}
                            back to the user's wallet.
                          </p>

                          <div className="flex gap-2 mt-1">
                            <button
                              type="button"
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
                              type="button"
                              onClick={
                                handleReverse
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
                            <p className="text-xs text-muted-foreground font-mono break-all">
                              {reversalRef}
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
        {value || 'N/A'}
      </span>
    </div>
  );
}
