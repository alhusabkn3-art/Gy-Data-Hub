import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAdmin } from '../AdminContext';
import { StatusBadge } from '../components/StatusBadge';
import type { AdminTransaction } from '../adminMockData';
import { fmtNaira } from '../utils';
import {
  getTransactionDetail,
  reviewTransaction,
  reverseTransaction,
} from '../adminApi';

type AnyRecord = Record<string, unknown>;

const typeLabels: Record<string, string> = {
  airtime: 'Airtime',
  data: 'Data',
  electricity: 'Electricity',
  cable: 'Cable TV',
  tv: 'Cable TV',
  betting: 'Betting',
  exam: 'Exam PIN',
  education: 'Education',
  wallet: 'Wallet',
  transfer: 'Transfer',
  withdrawal: 'Withdrawal',
  deposit: 'Deposit',
};

const stringValue = (
  value: unknown,
  fallback = '',
): string => {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
};

const nullableString = (
  value: unknown,
): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value);
};

const numberValue = (
  value: unknown,
  fallback = 0,
): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const normalizeTransaction = (
  raw: AdminTransaction | AnyRecord,
): AdminTransaction => {
  const row = raw as AnyRecord;

  const userName =
    nullableString(row.userName) ??
    nullableString(row.user_name) ??
    'Unknown User';

  const phone =
    nullableString(row.phone) ??
    nullableString(row.userPhone) ??
    nullableString(row.user_phone) ??
    '';

  const type =
    stringValue(
      row.type ??
        row.transactionType ??
        row.transaction_type ??
        row.category,
      'unknown',
    );

  const service =
    stringValue(
      row.service ??
        row.serviceName ??
        row.service_name ??
        row.product,
      type,
    );

  const provider =
    nullableString(row.provider) ??
    nullableString(row.network) ??
    nullableString(row.operator);

  const amount = numberValue(row.amount);

  const date =
    stringValue(
      row.date ??
        row.createdAt ??
        row.created_at,
      '',
    );

  const time =
    stringValue(
      row.time ??
        row.createdTime ??
        row.created_time,
      '',
    );

  const status =
    stringValue(
      row.status,
      'pending',
    );

  const description =
    stringValue(
      row.description ??
        row.narration ??
        row.remark,
      '',
    );

  return {
    ...(raw as AdminTransaction),
    id: stringValue(row.id),
    userName,
    phone,
    type,
    service,
    provider,
    amount,
    date,
    time,
    status,
    description,
    reference: stringValue(
      row.reference ??
        row.transactionReference ??
        row.transaction_reference,
    ),
  };
};

const normalizeDetail = (
  raw: unknown,
): AnyRecord => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const source = raw as AnyRecord;

  const nested =
    source.transaction &&
    typeof source.transaction === 'object'
      ? (source.transaction as AnyRecord)
      : source;

  return {
    ...source,
    ...nested,

    userName:
      nullableString(nested.userName) ??
      nullableString(nested.user_name) ??
      nullableString(source.userName) ??
      nullableString(source.user_name) ??
      'Unknown User',

    userPhone:
      nullableString(nested.userPhone) ??
      nullableString(nested.user_phone) ??
      nullableString(source.userPhone) ??
      nullableString(source.user_phone),

    userEmail:
      nullableString(nested.userEmail) ??
      nullableString(nested.user_email) ??
      nullableString(source.userEmail) ??
      nullableString(source.user_email),
  };
};

const getDisplayProvider = (
  provider: unknown,
): string => {
  const value = stringValue(provider, '');

  if (!value) {
    return '—';
  }

  return value;
};

const formatDateTime = (
  date: string,
  time: string,
): string => {
  if (date && time) {
    return `${date} ${time}`;
  }

  return date || time || '—';
};

export default function AdminTransactions() {
  const {
    transactions,
    loading,
    refreshTransactions,
  } = useAdmin();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('all');
  const [typeFilter, setTypeFilter] =
    useState('all');
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] =
    useState<AdminTransaction | null>(null);
  const [detail, setDetail] =
    useState<AnyRecord | null>(null);
  const [detailLoading, setDetailLoading] =
    useState(false);
  const [actionLoading, setActionLoading] =
    useState(false);

  const pageSize = 20;

  const normalizedTransactions = useMemo(
    () =>
      (transactions ?? []).map(
        normalizeTransaction,
      ),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const query = stringValue(search)
      .trim()
      .toLowerCase();

    return normalizedTransactions.filter(
      (txn) => {
        const userName = stringValue(
          txn.userName,
        ).toLowerCase();

        const id = stringValue(
          txn.id,
        ).toLowerCase();

        const reference = stringValue(
          txn.reference,
        ).toLowerCase();

        const provider =
          getDisplayProvider(
            txn.provider,
          ).toLowerCase();

        const service = stringValue(
          txn.service,
        ).toLowerCase();

        const type = stringValue(
          txn.type,
        ).toLowerCase();

        const status = stringValue(
          txn.status,
        ).toLowerCase();

        const matchSearch =
          !query ||
          userName.includes(query) ||
          id.includes(query) ||
          reference.includes(query) ||
          provider.includes(query) ||
          service.includes(query) ||
          type.includes(query);

        const matchStatus =
          statusFilter === 'all' ||
          status ===
            statusFilter.toLowerCase();

        const matchType =
          typeFilter === 'all' ||
          type ===
            typeFilter.toLowerCase();

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
    statusFilter,
    typeFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredTransactions.length /
        pageSize,
    ),
  );

  const safePage = Math.min(
    page,
    totalPages,
  );

  const paginatedTransactions =
    useMemo(() => {
      const start =
        (safePage - 1) * pageSize;

      return filteredTransactions.slice(
        start,
        start + pageSize,
      );
    }, [
      filteredTransactions,
      safePage,
    ]);

  const openDetails = async (
    txn: AdminTransaction,
  ) => {
    setSelectedTransaction(txn);
    setDetail(null);
    setDetailLoading(true);

    try {
      const response =
        await getTransactionDetail(
          txn.id,
        );

      setDetail(
        normalizeDetail(response),
      );
    } catch (error) {
      console.error(
        'Failed to load transaction details:',
        error,
      );

      setDetail(
        normalizeDetail(txn),
      );

      toast.error(
        'Failed to load transaction details',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    if (actionLoading) {
      return;
    }

    setSelectedTransaction(null);
    setDetail(null);
  };

  const handleReview = async (
    txn: AdminTransaction,
  ) => {
    if (actionLoading) {
      return;
    }

    setActionLoading(true);

    try {
      await reviewTransaction(txn.id);

      toast.success(
        'Transaction reviewed successfully',
      );

      await refreshTransactions();

      if (selectedTransaction?.id === txn.id) {
        const response =
          await getTransactionDetail(
            txn.id,
          );

        setDetail(
          normalizeDetail(response),
        );
      }
    } catch (error) {
      console.error(
        'Failed to review transaction:',
        error,
      );

      toast.error(
        'Failed to review transaction',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleReverse = async (
    txn: AdminTransaction,
  ) => {
    if (actionLoading) {
      return;
    }

    const confirmed =
      window.confirm(
        `Are you sure you want to reverse transaction ${stringValue(
          txn.reference || txn.id,
        )}?`,
      );

    if (!confirmed) {
      return;
    }

    setActionLoading(true);

    try {
      await reverseTransaction(txn.id);

      toast.success(
        'Transaction reversed successfully',
      );

      await refreshTransactions();

      if (selectedTransaction?.id === txn.id) {
        const response =
          await getTransactionDetail(
            txn.id,
          );

        setDetail(
          normalizeDetail(response),
        );
      }
    } catch (error) {
      console.error(
        'Failed to reverse transaction:',
        error,
      );

      toast.error(
        'Failed to reverse transaction',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPage(1);
  };

  const statusOptions = [
    'all',
    'success',
    'pending',
    'failed',
    'reversed',
  ];

  const typeOptions = useMemo(() => {
    const values = new Set<string>();

    normalizedTransactions.forEach(
      (txn) => {
        const type = stringValue(
          txn.type,
        ).toLowerCase();

        if (type) {
          values.add(type);
        }
      },
    );

    return [
      'all',
      ...Array.from(values).sort(),
    ];
  }, [normalizedTransactions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transaction History
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            View and manage all platform
            transactions.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            refreshTransactions()
          }
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading
                ? 'animate-spin'
                : ''
            }`}
          />

          Refresh
        </button>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              value={search}
              onChange={(event) => {
                setSearch(
                  event.target.value,
                );
                setPage(1);
              }}
              placeholder="Search user, ID, reference..."
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value,
              );
              setPage(1);
            }}
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
          >
            {statusOptions.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status === 'all'
                    ? 'All statuses'
                    : status
                        .charAt(0)
                        .toUpperCase() +
                      status.slice(1)}
                </option>
              ),
            )}
          </select>

          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(
                event.target.value,
              );
              setPage(1);
            }}
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
          >
            {typeOptions.map(
              (type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type === 'all'
                    ? 'All types'
                    : typeLabels[type] ??
                      type
                        .charAt(0)
                        .toUpperCase() +
                        type.slice(1)}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transaction
                </th>

                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  User
                </th>

                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </th>

                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Provider
                </th>

                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount
                </th>

                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Date
                </th>

                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>

                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading &&
                paginatedTransactions.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />
                      Loading transactions...
                    </td>
                  </tr>
                )}

              {!loading &&
                paginatedTransactions.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center"
                    >
                      <div className="mx-auto max-w-sm">
                        <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />

                        <p className="font-medium">
                          No transactions found
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          Try changing your search
                          or filters.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

              {paginatedTransactions.map(
                (txn) => {
                  const txnType =
                    stringValue(
                      txn.type,
                      'unknown',
                    ).toLowerCase();

                  const displayType =
                    typeLabels[txnType] ??
                    (stringValue(
                      txn.type,
                    ) || 'Unknown');

                  return (
                    <tr
                      key={stringValue(
                        txn.id,
                      )}
                      className="border-b last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-mono text-xs font-medium">
                            {stringValue(
                              txn.id,
                              '—',
                            )}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {stringValue(
                              txn.reference,
                              'No reference',
                            )}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-sm">
                            {stringValue(
                              txn.userName,
                              'Unknown User',
                            )}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {stringValue(
                              txn.phone,
                              '—',
                            )}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-medium text-xs">
                          {displayType}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {stringValue(
                            txn.service,
                            '—',
                          )}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-sm">
                        {getDisplayProvider(
                          txn.provider,
                        )}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <p className="font-semibold text-sm">
                          {fmtNaira(
                            numberValue(
                              txn.amount,
                            ),
                          )}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="text-sm">
                          {formatDateTime(
                            stringValue(
                              txn.date,
                            ),
                            stringValue(
                              txn.time,
                            ),
                          )}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge
                          status={stringValue(
                            txn.status,
                            'pending',
                          )}
                        />
                      </td>

                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            openDetails(
                              txn,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing{' '}
            {filteredTransactions.length ===
            0
              ? 0
              : (safePage - 1) *
                  pageSize +
                1}{' '}
            to{' '}
            {Math.min(
              safePage * pageSize,
              filteredTransactions.length,
            )}{' '}
            of{' '}
            {filteredTransactions.length}{' '}
            transactions
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() =>
                setPage(
                  (current) =>
                    Math.max(
                      1,
                      current - 1,
                    ),
                )
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-2 text-sm">
              Page {safePage} of{' '}
              {totalPages}
            </span>

            <button
              type="button"
              disabled={
                safePage >= totalPages
              }
              onClick={() =>
                setPage(
                  (current) =>
                    Math.min(
                      totalPages,
                      current + 1,
                    ),
                )
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedTransaction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDetails();
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Transaction Details
                </h2>

                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {stringValue(
                    selectedTransaction.id,
                    '—',
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={closeDetails}
                disabled={actionLoading}
                className="rounded-lg p-2 transition hover:bg-muted disabled:opacity-50"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-150px)] overflow-y-auto p-5">
              {detailLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />

                  <p className="text-sm text-muted-foreground">
                    Loading transaction details...
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        User
                      </p>

                      <p className="mt-1 font-medium">
                        {stringValue(
                          detail?.userName ??
                            selectedTransaction.userName,
                          'Unknown User',
                        )}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {stringValue(
                          detail?.userPhone ??
                            selectedTransaction.phone,
                          '—',
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Amount
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {fmtNaira(
                          numberValue(
                            detail?.amount ??
                              selectedTransaction.amount,
                          ),
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Status
                      </p>

                      <div className="mt-2">
                        <StatusBadge
                          status={stringValue(
                            detail?.status ??
                              selectedTransaction.status,
                            'pending',
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Type
                      </p>

                      <p className="mt-1 font-medium">
                        {typeLabels[
                          stringValue(
                            detail?.type ??
                              selectedTransaction.type,
                          ).toLowerCase()
                        ] ??
                          (stringValue(
                            detail?.type ??
                              selectedTransaction.type,
                          ) ||
                            'Unknown')}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Service
                      </p>

                      <p className="mt-1 font-medium">
                        {stringValue(
                          detail?.service ??
                            selectedTransaction.service,
                          '—',
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Provider
                      </p>

                      <p className="mt-1 font-medium">
                        {getDisplayProvider(
                          detail?.provider ??
                            selectedTransaction.provider,
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Reference
                      </p>

                      <p className="mt-1 break-all font-mono text-xs">
                        {stringValue(
                          detail?.reference ??
                            selectedTransaction.reference,
                          '—',
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Date
                      </p>

                      <p className="mt-1 font-medium">
                        {formatDateTime(
                          stringValue(
                            detail?.date ??
                              selectedTransaction.date,
                          ),
                          stringValue(
                            detail?.time ??
                              selectedTransaction.time,
                          ),
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        User Email
                      </p>

                      <p className="mt-1 break-all font-medium">
                        {stringValue(
                          detail?.userEmail,
                          '—',
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">
                      Description
                    </p>

                    <p className="mt-1 text-sm">
                      {stringValue(
                        detail?.description ??
                          selectedTransaction.description,
                        'No description',
                      )}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleReview(
                          selectedTransaction,
                        )
                      }
                      disabled={
                        actionLoading ||
                        stringValue(
                          selectedTransaction.status,
                        ).toLowerCase() ===
                          'success'
                      }
                      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Review
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleReverse(
                          selectedTransaction,
                        )
                      }
                      disabled={
                        actionLoading ||
                        stringValue(
                          selectedTransaction.status,
                        ).toLowerCase() ===
                          'reversed'
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reverse
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
