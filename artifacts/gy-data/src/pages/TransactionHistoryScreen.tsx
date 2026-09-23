import React, {
  useEffect,
  useState,
  useRef,
} from 'react';
import {
  motion,
  AnimatePresence,
} from 'framer-motion';
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
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../data/mockData';
import TransactionReceipt from '../components/TransactionReceipt';
import type { ReceiptData } from '../components/TransactionReceipt';

function getDisplayProvider(
  provider: string,
): string {
  const value =
    String(provider ?? '').trim();

  if (
    value.toLowerCase() === 'smeapi' ||
    value.toLowerCase() === 'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function txnToReceipt(
  txn: Transaction,
): ReceiptData {
  return {
    type: txn.type,
    provider: getDisplayProvider(
      txn.provider,
    ),
    service: txn.service,
    description: txn.description,
    amount: txn.amount,
    date: txn.date,
    time: txn.time,
    status: txn.status,
    txnId: txn.id,
    paymentMethod:
      txn.paymentMethod,
  };
}

function getTxnIcon(
  type: string,
  className = 'w-5 h-5',
  service = '',
) {
  const normalized =
    `${type} ${service}`
      .toLowerCase();

  if (
    normalized.includes('data') ||
    normalized.includes('internet')
  ) {
    return (
      <Wifi className={className} />
    );
  }

  if (
    normalized.includes('airtime') ||
    normalized.includes('recharge')
  ) {
    return (
      <Phone className={className} />
    );
  }

  if (
    normalized.includes('electric') ||
    normalized.includes('power')
  ) {
    return (
      <Zap className={className} />
    );
  }

  if (
    normalized.includes('cable') ||
    normalized.includes('tv')
  ) {
    return (
      <Tv className={className} />
    );
  }

  if (
    normalized.includes(
      'wallet_fund',
    ) ||
    normalized.includes('fund') ||
    normalized.includes('deposit')
  ) {
    return (
      <ArrowDownLeft
        className={className}
      />
    );
  }

  if (
    normalized.includes('cashback') ||
    normalized.includes('gift')
  ) {
    return (
      <Gift className={className} />
    );
  }

  return (
    <ReceiptText
      className={className}
    />
  );
}

function getTxnColor(
  type: string,
  service = '',
): string {
  const normalized =
    `${type} ${service}`
      .toLowerCase();

  if (
    normalized.includes('wallet_fund') ||
    normalized.includes('fund') ||
    normalized.includes('deposit')
  ) {
    return 'bg-green-500/10 text-green-500';
  }

  if (
    normalized.includes('data') ||
    normalized.includes('internet')
  ) {
    return 'bg-blue-500/10 text-blue-500';
  }

  if (
    normalized.includes('airtime') ||
    normalized.includes('recharge')
  ) {
    return 'bg-purple-500/10 text-purple-500';
  }

  if (
    normalized.includes('electric') ||
    normalized.includes('power')
  ) {
    return 'bg-yellow-500/10 text-yellow-500';
  }

  if (
    normalized.includes('cable') ||
    normalized.includes('tv')
  ) {
    return 'bg-orange-500/10 text-orange-500';
  }

  return 'bg-primary/10 text-primary';
}

export default function TransactionHistoryScreen() {
  const {
    transactions,
    refreshAll,
  } = useAppContext();

  const [search, setSearch] =
    useState('');

  const [filter, setFilter] =
    useState<
      | 'all'
      | 'success'
      | 'pending'
      | 'failed'
    >('all');

  const [selectedTxn, setSelectedTxn] =
    useState<Transaction | null>(
      null,
    );

  const searchRef =
    useRef<HTMLInputElement>(null);

  /*
   * Always refresh transactions when
   * the History screen is opened.
   *
   * This is important because a purchase
   * may have happened immediately before
   * navigating here.
   */
  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const filteredTransactions =
    transactions.filter((txn) => {
      const txnStatus =
        String(
          txn.status ?? '',
        ).toLowerCase();

      if (
        filter !== 'all' &&
        txnStatus !== filter
      ) {
        return false;
      }

      if (search) {
        const q =
          search
            .toLowerCase()
            .trim();

        const id =
          String(txn.id ?? '');

        const type =
          String(txn.type ?? '');

        const service =
          String(
            txn.service ?? '',
          );

        const provider =
          String(
            txn.provider ?? '',
          );

        const displayProvider =
          getDisplayProvider(
            provider,
          );

        const description =
          String(
            txn.description ?? '',
          );

        const amount =
          String(
            txn.amount ?? '',
          );

        const status =
          String(
            txn.status ?? '',
          );

        const paymentMethod =
          String(
            txn.paymentMethod ?? '',
          );

        return (
          id
            .toLowerCase()
            .includes(q) ||
          type
            .toLowerCase()
            .includes(q) ||
          service
            .toLowerCase()
            .includes(q) ||
          provider
            .toLowerCase()
            .includes(q) ||
          displayProvider
            .toLowerCase()
            .includes(q) ||
          description
            .toLowerCase()
            .includes(q) ||
          amount.includes(q) ||
          status
            .toLowerCase()
            .includes(q) ||
          paymentMethod
            .toLowerCase()
            .includes(q)
        );
      }

      return true;
    });

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: 20,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: -20,
      }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen flex flex-col"
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">
          Transactions
        </h1>
      </div>

      {/* Search */}
      <div className="relative mb-4 group">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary"
        />

        <input
          ref={searchRef}
          type="text"
          placeholder="Phone, reference, service, amount…"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          className="w-full bg-card border border-border rounded-xl h-11 pl-10 pr-9 text-sm focus:border-primary outline-none transition-colors placeholder:text-muted-foreground/60"
        />

        <AnimatePresence>
          {search && (
            <motion.button
              initial={{
                opacity: 0,
                scale: 0.7,
              }}
              animate={{
                opacity: 1,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.7,
              }}
              transition={{
                duration: 0.12,
              }}
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted-foreground/15 flex items-center justify-center hover:bg-muted-foreground/25 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Filter tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 pb-1">
        {(
          [
            'all',
            'success',
            'pending',
            'failed',
          ] as const
        ).map((f) => (
          <button
            key={f}
            onClick={() =>
              setFilter(f)
            }
            className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted-foreground hover:bg-black/5'
            }`}
          >
            {f.charAt(0).toUpperCase() +
              f.slice(1)}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div className="flex-1 space-y-3 pb-8">
        {filteredTransactions.length >
        0 ? (
          filteredTransactions.map(
            (txn) => {
              const displayProvider =
                getDisplayProvider(
                  String(
                    txn.provider ?? '',
                  ),
                );

              const amount =
                Number(
                  txn.amount ?? 0,
                );

              const status =
                String(
                  txn.status ?? 'pending',
                );

              const type =
                String(
                  txn.type ?? '',
                );

              const service =
                String(
                  txn.service ?? '',
                );

              return (
                <button
                  key={txn.id}
                  onClick={() =>
                    setSelectedTxn(
                      txn,
                    )
                  }
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:bg-black/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${getTxnColor(
                        type,
                        service,
                      )}`}
                    >
                      {getTxnIcon(
                        type,
                        'w-6 h-6',
                        service,
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {service ||
                          type ||
                          'Transaction'}{' '}
                        •{' '}
                        {displayProvider}
                      </p>

                      <p className="text-xs text-muted-foreground mt-0.5">
                        {String(
                          txn.date ??
                            'Unknown date',
                        )}
                        {txn.time
                          ? `, ${String(
                              txn.time,
                            )}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <p
                      className={`font-bold text-sm ${
                        type ===
                        'wallet_fund'
                          ? 'text-green-500'
                          : ''
                      }`}
                    >
                      {type ===
                      'wallet_fund'
                        ? '+'
                        : '-'}
                      ₦
                      {Number.isFinite(
                        amount,
                      )
                        ? amount.toLocaleString(
                            'en-NG',
                            {
                              minimumFractionDigits:
                                2,
                              maximumFractionDigits:
                                2,
                            },
                          )
                        : '0.00'}
                    </p>

                    <p
                      className={`text-[10px] uppercase font-bold tracking-wider mt-1 ${
                        status ===
                        'success'
                          ? 'text-green-500'
                          : status ===
                              'pending'
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      }`}
                    >
                      {status}
                    </p>
                  </div>
                </button>
              );
            },
          )
        ) : (
          <motion.div
            key={
              search
                ? 'no-search'
                : 'no-txns'
            }
            initial={{
              opacity: 0,
              y: 6,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.2,
            }}
            className="text-center py-14"
          >
            {search ? (
              <>
                <div className="w-14 h-14 rounded-full bg-muted-foreground/8 flex items-center justify-center mx-auto mb-4">
                  <SearchX className="w-7 h-7 text-muted-foreground/50" />
                </div>

                <p className="font-semibold text-sm text-foreground/80 mb-1">
                  No transaction found
                </p>

                <p className="text-xs text-muted-foreground/60 max-w-[200px] mx-auto leading-relaxed">
                  Try searching by
                  phone number,
                  reference,
                  service, or
                  amount
                </p>
              </>
            ) : (
              <>
                <ReceiptText className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />

                <p className="text-muted-foreground font-medium text-sm">
                  No transactions yet
                </p>
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* Transaction receipt */}
      <AnimatePresence>
        {selectedTxn && (
          <>
            <motion.div
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() =>
                setSelectedTxn(null)
              }
            />

            <motion.div
              initial={{
                y: '100%',
              }}
              animate={{
                y: 0,
              }}
              exit={{
                y: '100%',
              }}
              transition={{
                type: 'spring',
                damping: 28,
                stiffness: 260,
              }}
              className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto"
              style={{
                borderRadius:
                  '28px 28px 0 0',
                overflow: 'hidden',
              }}
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <div
                style={{
                  background:
                    '#F3F6FB',
                  padding:
                    '12px 16px 32px',
                  maxHeight:
                    '90vh',
                  overflowY: 'auto',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8 h-1 rounded-full bg-transparent" />

                  <div
                    className="w-10 h-1 rounded-full"
                    style={{
                      background:
                        '#CBD5E1',
                    }}
                  />

                  <button
                    onClick={() =>
                      setSelectedTxn(
                        null,
                      )
                    }
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{
                      background:
                        'rgba(11,31,78,0.07)',
                    }}
                    aria-label="Close receipt"
                  >
                    <X
                      className="w-4 h-4"
                      style={{
                        color:
                          '#0B1F4E',
                      }}
                    />
                  </button>
                </div>

                <TransactionReceipt
                  transaction={txnToReceipt(
                    selectedTxn,
                  )}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
