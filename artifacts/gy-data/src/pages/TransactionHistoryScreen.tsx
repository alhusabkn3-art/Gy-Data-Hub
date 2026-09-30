import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
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
  Eye,
} from 'lucide-react';

import { useAppContext } from '../context/AppContext';

import {
  Transaction,
} from '../data/mockData';

import TransactionReceipt, {
  ReceiptData,
} from '../components/TransactionReceipt';

function getDisplayProvider(
  provider: string | undefined,
): string {
  const value = String(
    provider ?? '',
  ).trim();

  if (
    value.toLowerCase() ===
      'smeapi' ||
    value.toLowerCase() ===
      'sme api'
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function getTransactionField(
  txn: Transaction,
  key: string,
): unknown {
  return (
    txn as unknown as Record<
      string,
      unknown
    >
  )[key];
}

function txnToReceipt(
  txn: Transaction,
): ReceiptData {
  const metadata =
    getTransactionField(
      txn,
      'metadata',
    );

  return {
    type: txn.type,

    provider:
      getDisplayProvider(
        txn.provider,
      ),

    service:
      txn.service,

    description:
      txn.description,

    amount:
      Number(
        txn.amount ?? 0,
      ),

    date:
      txn.date,

    time:
      txn.time,

    status:
      txn.status,

    phone:
      String(
        getTransactionField(
          txn,
          'phone',
        ) ?? '',
      ).trim() ||
      String(
        getTransactionField(
          txn,
          'recipientPhone',
        ) ?? '',
      ).trim() ||
      undefined,

    paymentMethod:
      txn.paymentMethod,

    txnId:
      String(
        getTransactionField(
          txn,
          'id',
        ) ?? '',
      ).trim() ||
      undefined,

    reference:
      String(
        getTransactionField(
          txn,
          'reference',
        ) ?? '',
      ).trim() ||
      undefined,

    providerReference:
      String(
        getTransactionField(
          txn,
          'providerReference',
        ) ?? '',
      ).trim() ||
      undefined,

    cashbackAmount:
      Number(
        getTransactionField(
          txn,
          'cashbackAmount',
        ) ?? 0,
      ) > 0
        ? Number(
            getTransactionField(
              txn,
              'cashbackAmount',
            ),
          )
        : undefined,

    metadata:
      metadata &&
      typeof metadata ===
        'object'
        ? (metadata as Record<
            string,
            unknown
          >)
        : undefined,
  };
}

function getTxnIcon(
  type: string,
  className = 'w-5 h-5',
  service = '',
) {
  const normalized =
    `${type} ${service}`.toLowerCase();

  if (
    normalized.includes(
      'data',
    ) ||
    normalized.includes(
      'internet',
    )
  ) {
    return (
      <Wifi
        className={className}
      />
    );
  }

  if (
    normalized.includes(
      'airtime',
    ) ||
    normalized.includes(
      'recharge',
    )
  ) {
    return (
      <Phone
        className={className}
      />
    );
  }

  if (
    normalized.includes(
      'electric',
    ) ||
    normalized.includes(
      'power',
    )
  ) {
    return (
      <Zap
        className={className}
      />
    );
  }

  if (
    normalized.includes(
      'cable',
    ) ||
    normalized.includes(
      'tv',
    )
  ) {
    return (
      <Tv
        className={className}
      />
    );
  }

  if (
    normalized.includes(
      'wallet_fund',
    ) ||
    normalized.includes(
      'fund',
    ) ||
    normalized.includes(
      'deposit',
    )
  ) {
    return (
      <ArrowDownLeft
        className={className}
      />
    );
  }

  if (
    normalized.includes(
      'cashback',
    ) ||
    normalized.includes(
      'gift',
    )
  ) {
    return (
      <Gift
        className={className}
      />
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
    `${type} ${service}`.toLowerCase();

  if (
    normalized.includes(
      'wallet_fund',
    ) ||
    normalized.includes(
      'fund',
    ) ||
    normalized.includes(
      'deposit',
    )
  ) {
    return 'bg-green-500/10 text-green-500';
  }

  if (
    normalized.includes(
      'data',
    ) ||
    normalized.includes(
      'internet',
    )
  ) {
    return 'bg-blue-500/10 text-blue-500';
  }

  if (
    normalized.includes(
      'airtime',
    ) ||
    normalized.includes(
      'recharge',
    )
  ) {
    return 'bg-purple-500/10 text-purple-500';
  }

  if (
    normalized.includes(
      'electric',
    ) ||
    normalized.includes(
      'power',
    )
  ) {
    return 'bg-yellow-500/10 text-yellow-500';
  }

  if (
    normalized.includes(
      'cable',
    ) ||
    normalized.includes(
      'tv',
    )
  ) {
    return 'bg-orange-500/10 text-orange-500';
  }

  return 'bg-primary/10 text-primary';
}

export default function TransactionHistoryScreen() {
  const {
    transactions,
    refreshWallet,
  } = useAppContext();

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    filter,
    setFilter,
  ] = useState<
    | 'all'
    | 'success'
    | 'pending'
    | 'failed'
  >('all');

  const [
    selectedTxn,
    setSelectedTxn,
  ] =
    useState<Transaction | null>(
      null,
    );

  const searchRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  const filteredTransactions =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return transactions.filter(
        txn => {
          const status =
            String(
              txn.status ?? '',
            ).toLowerCase();

          if (
            filter !== 'all' &&
            status !== filter
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const values = [
            txn.id,
            txn.type,
            txn.service,
            txn.provider,
            getDisplayProvider(
              txn.provider,
            ),
            txn.description,
            txn.amount,
            txn.status,
            txn.paymentMethod,
            getTransactionField(
              txn,
              'phone',
            ),
            getTransactionField(
              txn,
              'reference',
            ),
            getTransactionField(
              txn,
              'providerReference',
            ),
            txn.date,
            txn.time,
          ];

          return values.some(
            value =>
              String(
                value ?? '',
              )
                .toLowerCase()
                .includes(query),
          );
        },
      );
    }, [
      transactions,
      search,
      filter,
    ]);

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

      <div className="relative mb-4 group">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary"
        />

        <input
          ref={searchRef}
          type="text"
          placeholder="Phone, reference, service, amount…"
          value={search}
          onChange={event =>
            setSearch(
              event.target.value,
            )
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
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted-foreground/15 flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 pb-1">
        {(
          [
            'all',
            'success',
            'pending',
            'failed',
          ] as const
        ).map(item => (
          <button
            key={item}
            type="button"
            onClick={() =>
              setFilter(item)
            }
            className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === item
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted-foreground'
            }`}
          >
            {item
              .charAt(0)
              .toUpperCase() +
              item.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 pb-8">
        {filteredTransactions.length >
        0 ? (
          filteredTransactions.map(
            txn => {
              const provider =
                getDisplayProvider(
                  txn.provider,
                );

              const amount =
                Number(
                  txn.amount ?? 0,
                );

              const status =
                String(
                  txn.status ??
                    'pending',
                ).toLowerCase();

              const type =
                String(
                  txn.type ?? '',
                );

              const service =
                String(
                  txn.service ?? '',
                );

              return (
                <div
                  key={txn.id}
                  className="w-full rounded-xl bg-card border border-border p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${getTxnColor(
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
                          • {provider}
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

                    <div className="text-right shrink-0">
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
                        {amount.toLocaleString(
                          'en-NG',
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}
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
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTxn(
                          txn,
                        )
                      }
                      className="
                        flex
                        h-9
                        items-center
                        gap-2
                        rounded-lg
                        bg-[#0B1F4E]
                        px-4
                        text-xs
                        font-bold
                        text-white
                        transition
                        hover:bg-[#17366F]
                      "
                    >
                      <Eye className="h-4 w-4" />
                      View Receipt
                    </button>
                  </div>
                </div>
              );
            },
          )
        ) : (
          <motion.div
            initial={{
              opacity: 0,
              y: 6,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="text-center py-14"
          >
            {search ? (
              <>
                <div className="w-14 h-14 rounded-full bg-muted-foreground/8 flex items-center justify-center mx-auto mb-4">
                  <SearchX className="w-7 h-7 text-muted-foreground/50" />
                </div>

                <p className="font-semibold text-sm">
                  No transaction found
                </p>

                <p className="text-xs text-muted-foreground mt-1">
                  Try another search.
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
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() =>
                setSelectedTxn(
                  null,
                )
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
              className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md"
            >
              <div
                className="max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-[#F3F6FB] px-4 pb-8 pt-4"
                onClick={event =>
                  event.stopPropagation()
                }
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="w-8" />

                  <div className="h-1 w-10 rounded-full bg-slate-300" />

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedTxn(
                        null,
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200"
                    aria-label="Close receipt"
                  >
                    <X className="h-4 w-4 text-[#0B1F4E]" />
                  </button>
                </div>

                <TransactionReceipt
                  receipt={txnToReceipt(
                    selectedTxn,
                  )}
                  onDone={() =>
                    setSelectedTxn(
                      null,
                    )
                  }
                  doneLabel="Close"
                  showActions
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
