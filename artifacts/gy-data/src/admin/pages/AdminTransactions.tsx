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

function stringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getDisplayProvider(provider: unknown): string {
  const value = stringValue(provider).trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

/**
 * Normalizes transaction records coming from the API.
 *
 * The admin transaction endpoint currently returns database
 * rows using snake_case fields, while the frontend expects
 * camelCase fields. This function safely supports both formats.
 */
function normalizeTransaction(
  input: unknown,
): AdminTransaction {
  const row =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};

  const userName =
    row.userName ??
    row.user_name ??
    row.name ??
    '';

  const userPhone =
    row.userPhone ??
    row.user_phone ??
    row.phone ??
    '';

  const userEmail =
    row.userEmail ??
    row.user_email ??
    row.email ??
    '';

  const createdAt =
    row.createdAt ??
    row.created_at ??
    row.date ??
    '';

  const reference =
    row.reference ??
    row.transaction_reference ??
    row.txn_reference ??
    row.id ??
    '';

  const provider =
    row.provider ??
    row.network ??
    row.service_provider ??
    '';

  const service =
    row.service ??
    row.description ??
    row.type ??
    '';

  const type =
    row.type ??
    row.transaction_type ??
    'data';

  const status =
    row.status ??
    'pending';

  return {
    ...(row as AdminTransaction),

    id: stringValue(row.id),

    userName:
      stringValue(userName) || 'Unknown User',

    userPhone:
      stringValue(userPhone),

    userEmail:
      stringValue(userEmail),

    reference:
      stringValue(reference),

    type:
      stringValue(type),

    service:
      stringValue(service),

    provider:
      stringValue(provider),

    amount:
      numberValue(row.amount),

    date:
      stringValue(createdAt),

    time:
      stringValue(
        row.time ??
          row.createdTime ??
          row.created_time ??
          '',
      ),

    status:
      stringValue(status) as AdminTransaction['status'],

    description:
      stringValue(
        row.description ??
          row.details ??
          '',
      ),
  };
}

function normalizeDetail(
  input: unknown,
): TransactionDetail {
  const source =
    input &&
    typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};

  const nested =
    source.transaction &&
    typeof source.transaction === 'object'
      ? (source.transaction as Record<string, unknown>)
      : source;

  const userName =
    nested.userName ??
    nested.user_name ??
    nested.name ??
    '';

  const userPhone =
    nested.userPhone ??
    nested.user_phone ??
    nested.phone ??
    '';

  const userEmail =
    nested.userEmail ??
    nested.user_email ??
    nested.email ??
    '';

  const reference =
    nested.reference ??
    nested.transaction_reference ??
    nested.txn_reference ??
    nested.id ??
    '';

  const createdAt =
    nested.createdAt ??
    nested.created_at ??
    new Date().toISOString();

  const type =
    nested.type ??
    nested.transaction_type ??
    'data';

  const provider =
    nested.provider ??
    nested.network ??
    nested.service_provider ??
    '';

  const paymentMethod =
    nested.paymentMethod ??
    nested.payment_method ??
    '';

  const description =
    nested.description ??
    nested.details ??
    '';

  return {
    ...(nested as TransactionDetail),

    id:
      stringValue(nested.id),

    userName:
      stringValue(userName) || 'Unknown User',

    userPhone:
      stringValue(userPhone),

    userEmail:
      stringValue(userEmail),

    reference:
      stringValue(reference),

    type:
      stringValue(type),

    provider:
      stringValue(provider),

    paymentMethod:
      stringValue(paymentMethod),

    createdAt:
      stringValue(createdAt),

    amount:
      numberValue(nested.amount),

    description:
      stringValue(description),

    status:
      stringValue(nested.status) as TransactionDetail['status'],
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
    useState<AdminTransaction | null>(null);

  const [detail, setDetail] =
    useState<TransactionDetail | null>(null);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailError, setDetailError] =
    useState('');

  const [reviewLoading, setReviewLoading] =
    useState(false);

  const [reverseStep, setReverseStep] =
    useState<
      'idle' |
      'reason' |
      'confirm' |
      'loading' |
      'done'
    >('idle');

  const [reverseReason, setReverseReason] =
    useState('');

  const [reversalRef, setReversalRef] =
    useState('');

  const normalizedTransactions =
    useMemo(
      () =>
        Array.isArray(transactions)
          ? transactions.map(
              normalizeTransaction,
            )
          : [],
      [transactions],
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

    apiGetTransactionDetail(selected.id)
      .then(raw => {
        if (!cancelled) {
          setDetail(
            normalizeDetail(raw),
          );
        }
      })
      .catch(e => {
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

  const filtered =
    normalizedTransactions.filter(
      transaction => {
        const query =
          search.trim().toLowerCase();

        const userName =
          stringValue(
            transaction.userName,
          ).toLowerCase();

        const userPhone =
          stringValue(
            transaction.userPhone,
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

        const description =
          stringValue(
            transaction.description,
          ).toLowerCase();

        const matchSearch =
          query === '' ||
          userName.includes(query) ||
          userPhone.includes(query) ||
          id.includes(query) ||
          reference.includes(query) ||
          provider.includes(query) ||
          service.includes(query) ||
          description.includes(query);

        const matchStatus =
          filterStatus === 'all' ||
          transaction.status ===
            filterStatus;

        const matchType =
          filterType === 'all' ||
          transaction.type === filterType;

        return (
          matchSearch &&
          matchStatus &&
          matchType
        );
      },
    );

  const totalFiltered =
    filtered.reduce(
      (acc, transaction) =>
        acc +
        (transaction.status ===
        'success'
          ? numberValue(
              transaction.amount,
            )
          : 0),
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
            onChange={e =>
              setSearch(e.target.value)
            }
            className="w-full bg-card border border-border rounded-xl h-10 pl-9 pr-4 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e =>
            setFilterStatus(
              e.target.value as FilterStatus,
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
          onChange={e =>
            setFilterType(
              e.target.value as FilterType,
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
              normalizedTransactions.length ===
                0 ? (
                Array.from({ length: 6 }).map(
                  (_, i) => (
                    <tr
                      key={i}
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
                filtered.map(txn => (
                  <tr
                    key={txn.id}
                    className="border-b border-border last:border-b-0 hover:bg-background/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {typeIcons[
                            txn.type
                          ] ?? '💳'}
                        </span>

                        <div className="min-w-0">
                          <p className="font-semibold text-xs truncate max-w-[170px]">
                            {txn.id || 'N/A'}
                          </p>

                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {txn.reference ||
                              'N/A'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <div>
                        <p className="font-medium text-xs">
                          {txn.userName ||
                            'Unknown User'}
                        </p>

                        <p className="text-[10px] text-muted-foreground">
                          {txn.userPhone ||
                            'N/A'}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div>
                        <p className="font-medium text-xs">
                          {typeLabels[
                            txn.type
                          ] ??
                            txn.type ||
                            'Unknown'}
                        </p>

                        <p className="text-[10px] text-muted-foreground">
                          {getDisplayProvider(
                            txn.provider,
                          )}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <p
                        className={`font-semibold text-xs ${
                          txn.type ===
                          'wallet_fund'
                            ? 'text-green-400'
                            : ''
                        }`}
                      >
                        {txn.type ===
                        'wallet_fund'
                          ? '+'
                          : ''}
                        ₦
                        {numberValue(
                          txn.amount,
                        ).toLocaleString()}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        status={txn.status}
                      />
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          setSelected(txn)
                        }
                        className="text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
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
                  (a, t) =>
                    a +
                    numberValue(
                      t.amount,
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
                      ? selected.id.slice(
                          0,
                          12,
                        )
                      : 'Transaction'}
                    …
                  </h2>

                  <StatusBadge
                    status={selected.status}
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
                        .then(raw =>
                          setDetail(
                            normalizeDetail(
                              raw,
                            ),
                          ),
                        )
                        .catch(e =>
                          setDetailError(
                            (e as Error)
                              .message ||
                              'Failed to load detail.',
                          ),
                        )
                        .finally(() =>
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
                    value={[
                      detail.userName,
                      detail.userPhone,
                      detail.userEmail,
                    ]
                      .filter(Boolean)
                      .join(' · ') ||
                      'Unknown User'}
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
                    value={`${
                      typeLabels[
                        detail.type
                      ] ??
                      detail.service ??
                      'Unknown'
                    } · ${getDisplayProvider(
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
                        'N/A'}
                    </p>
                  </div>

                  {detail.reversal && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 space-y-1">
                      <p className="text-green-400 font-semibold text-xs">
                        ✓ Reversed
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Reason:{' '}
                        {detail.reversal.reason}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        By{' '}
                        {
                          detail.reversal
                            .performedByName
                        }{' '}
                        on{' '}
                        {new Date(
                          detail.reversal.createdAt,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}

                  {showActions && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <button
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
                            onChange={e =>
                              setReverseReason(
                                e.target.value,
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
                              onClick={() =>
                                reverseReason.trim() &&
                                setReverseStep(
                                  'confirm',
                                )
                              }
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
                            <p className="text-xs text-muted-foreground font-mono">
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
  mono,
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
