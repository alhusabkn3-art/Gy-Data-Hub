// artifacts/gy-data/src/pages/TransactionHistoryScreen.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Wifi,
  Phone,
  Zap,
  Tv,
  ArrowDownLeft,
  ReceiptText,
  X,
  SearchX,
  Gift,
  Eye,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../data/mockData';
import { ReceiptData } from '../components/TransactionReceipt';
import SuccessModal from '../components/SuccessModal';

type StatusFilter = 'all' | 'success' | 'pending' | 'failed';

function getDisplayProvider(provider: string | undefined): string {
  const value = String(provider ?? '').trim();

  if (['smeapi', 'sme api'].includes(value.toLowerCase())) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function getTransactionField(txn: Transaction, key: string): unknown {
  return (txn as unknown as Record<string, unknown>)[key];
}

function normalizeStatus(value: unknown): StatusFilter | 'unknown' {
  const status = String(value ?? '').trim().toLowerCase();

  if (['success', 'successful', 'completed'].includes(status)) {
    return 'success';
  }

  if (['pending', 'processing', 'queued'].includes(status)) {
    return 'pending';
  }

  if (['failed', 'failure', 'rejected', 'cancelled', 'canceled'].includes(status)) {
    return 'failed';
  }

  return 'unknown';
}

function txnToReceipt(txn: Transaction): ReceiptData {
  const metadata = getTransactionField(txn, 'metadata');

  return {
    type: txn.type,
    provider: getDisplayProvider(txn.provider),
    service: txn.service,
    description: txn.description,
    amount: Number(txn.amount ?? 0),
    date: txn.date,
    time: txn.time,
    status: txn.status,
    phone:
      String(getTransactionField(txn, 'phone') ?? '').trim() ||
      String(getTransactionField(txn, 'recipientPhone') ?? '').trim() ||
      undefined,
    paymentMethod: txn.paymentMethod,
    txnId: String(getTransactionField(txn, 'id') ?? '').trim() || undefined,
    reference: String(getTransactionField(txn, 'reference') ?? '').trim() || undefined,
    providerReference:
      String(getTransactionField(txn, 'providerReference') ?? '').trim() ||
      undefined,
    cashbackAmount:
      Number(getTransactionField(txn, 'cashbackAmount') ?? 0) > 0
        ? Number(getTransactionField(txn, 'cashbackAmount'))
        : undefined,
    metadata:
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : undefined,
  };
}

function getTxnIcon(type: string, className = 'w-5 h-5', service = '') {
  const normalized = `${type} ${service}`.toLowerCase();

  if (normalized.includes('data') || normalized.includes('internet')) {
    return <Wifi className={className} />;
  }

  if (normalized.includes('airtime') || normalized.includes('recharge')) {
    return <Phone className={className} />;
  }

  if (normalized.includes('electric') || normalized.includes('power')) {
    return <Zap className={className} />;
  }

  if (normalized.includes('cable') || normalized.includes('tv')) {
    return <Tv className={className} />;
  }

  if (normalized.includes('fund') || normalized.includes('deposit')) {
    return <ArrowDownLeft className={className} />;
  }

  if (normalized.includes('cashback') || normalized.includes('gift')) {
    return <Gift className={className} />;
  }

  return <ReceiptText className={className} />;
}

function getTxnColor(type: string, service = '') {
  const normalized = `${type} ${service}`.toLowerCase();

  if (normalized.includes('fund') || normalized.includes('deposit')) {
    return 'bg-green-500/10 text-green-500';
  }

  if (normalized.includes('data') || normalized.includes('internet')) {
    return 'bg-blue-500/10 text-blue-500';
  }

  if (normalized.includes('airtime') || normalized.includes('recharge')) {
    return 'bg-purple-500/10 text-purple-500';
  }

  if (normalized.includes('electric') || normalized.includes('power')) {
    return 'bg-yellow-500/10 text-yellow-500';
  }

  if (normalized.includes('cable') || normalized.includes('tv')) {
    return 'bg-orange-500/10 text-orange-500';
  }

  return 'bg-primary/10 text-primary';
}

export default function TransactionHistoryScreen() {
  const { transactions, refreshWallet } = useAppContext();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return safeTransactions.filter((txn) => {
      const status = normalizeStatus(txn.status);

      if (filter !== 'all' && status !== filter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableValues = [
        getTransactionField(txn, 'id'),
        getTransactionField(txn, 'reference'),
        getTransactionField(txn, 'providerReference'),
        getTransactionField(txn, 'phone'),
        getTransactionField(txn, 'recipientPhone'),
        txn.type,
        txn.service,
        txn.provider,
        getDisplayProvider(txn.provider),
        txn.description,
        txn.amount,
        txn.status,
        txn.paymentMethod,
        txn.date,
        txn.time,
      ];

      return searchableValues.some((value) =>
        String(value ?? '').toLowerCase().includes(query),
      );
    });
  }, [safeTransactions, search, filter]);

  const counts = useMemo(() => {
    return {
      all: safeTransactions.length,
      success: safeTransactions.filter(
        (txn) => normalizeStatus(txn.status) === 'success',
      ).length,
      pending: safeTransactions.filter(
        (txn) => normalizeStatus(txn.status) === 'pending',
      ).length,
      failed: safeTransactions.filter(
        (txn) => normalizeStatus(txn.status) === 'failed',
      ).length,
    };
  }, [safeTransactions]);

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await refreshWallet();
    } finally {
      setRefreshing(false);
    }
  }

  const filters: StatusFilter[] = ['all', 'success', 'pending', 'failed'];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="mx-auto flex min-h-screen w-full max-w-md flex-col p-4 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Transaction History</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Search and track your transactions
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {refreshing ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      <div className="group relative mb-4">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" />

        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search ID, reference, phone or amount"
          aria-label="Search transactions"
          className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-sm outline-none focus:border-primary"
        />

        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              searchRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-4 gap-2">
        {filters.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-xl border p-2 text-center ${
              filter === status
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-card'
            }`}
          >
            <span className="block text-xs capitalize">{status}</span>
            <span className="mt-1 block text-base font-bold">
              {counts[status]}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Transactions</h2>
        <span className="text-xs text-muted-foreground">
          {filteredTransactions.length} result(s)
        </span>
      </div>

      <div className="flex-1 space-y-3 pb-8">
        {filteredTransactions.length > 0 ? (
          filteredTransactions.map((txn, index) => {
            const type = String(txn.type ?? '');
            const service = String(txn.service ?? '');
            const provider = getDisplayProvider(txn.provider);
            const amount = Number(txn.amount ?? 0);
            const status = normalizeStatus(txn.status);

            const id = String(
              getTransactionField(txn, 'id') ??
                getTransactionField(txn, 'reference') ??
                `${type}-${index}`,
            );

            return (
              <div
                key={id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${getTxnColor(
                        type,
                        service,
                      )}`}
                    >
                      {getTxnIcon(type, 'h-5 w-5', service)}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {service || type || 'Transaction'}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {provider}
                      </p>

                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        Ref:{' '}
                        {String(
                          getTransactionField(txn, 'reference') ??
                            getTransactionField(txn, 'id') ??
                            'N/A',
                        )}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {String(txn.date ?? 'Unknown date')}
                        {txn.time ? ` · ${String(txn.time)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">
                      {type === 'wallet_fund' ? '+' : '-'}₦
                      {Number.isFinite(amount)
                        ? amount.toLocaleString('en-NG', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '0.00'}
                    </p>

                    <span
                      className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                        status === 'success'
                          ? 'bg-green-500/10 text-green-600'
                          : status === 'pending'
                            ? 'bg-yellow-500/10 text-yellow-600'
                            : status === 'failed'
                              ? 'bg-red-500/10 text-red-600'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedTxn(txn)}
                    className="flex h-9 items-center gap-2 rounded-lg bg-[#0B1F4E] px-4 text-xs font-bold text-white hover:bg-[#17366F]"
                  >
                    <Eye className="h-4 w-4" />
                    View Receipt
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${filter}-${search}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-14 text-center"
            >
              <SearchX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />

              <p className="text-sm font-semibold">
                {search ? 'No transaction found' : 'No transactions yet'}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {search
                  ? 'Check the reference, phone number or search term and try again.'
                  : 'Your transactions will appear here.'}
              </p>

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white"
                >
                  Clear search
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {selectedTxn && (
        <SuccessModal
          open={Boolean(selectedTxn)}
          receipt={txnToReceipt(selectedTxn)}
          onOpenChange={(open) => {
            if (!open) setSelectedTxn(null);
          }}
          onClose={() => setSelectedTxn(null)}
          onDone={() => setSelectedTxn(null)}
          doneLabel="Close"
        />
      )}
    </motion.div>
  );
}
