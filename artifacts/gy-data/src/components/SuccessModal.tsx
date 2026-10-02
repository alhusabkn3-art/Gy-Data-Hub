import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';

import {
  CheckCircle2,
  Copy,
  Eye,
  Share2,
  X,
} from 'lucide-react';

import { toast } from 'sonner';

import TransactionReceipt, {
  formatReceiptDate,
  ReceiptData,
  shareReceiptImage,
} from './TransactionReceipt';

interface SuccessModalProps {
  open: boolean;

  onOpenChange: (
    open: boolean,
  ) => void;

  receipt?: ReceiptData | null;

  data?: ReceiptData | null;

  onDone?: () => void;

  doneLabel?: string;
}

type ApiTransaction = {
  id?: string;
  userId?: string;
  type?: string;
  service?: string;
  provider?: string;
  amount?: number | string;
  status?: string;
  reference?: string | null;
  providerReference?: string | null;
  description?: string;
  paymentMethod?: string | null;
  metadata?: Record<
    string,
    unknown
  > | null;
  createdAt?: string | null;
  date?: string;
  time?: string;

  [key: string]: unknown;
};

function toText(
  value: unknown,
): string {
  return String(
    value ?? '',
  ).trim();
}

function toNumber(
  value: unknown,
): number {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function normalizeStatus(
  status: unknown,
): ReceiptData['status'] {
  const value =
    toText(status)
      .toLowerCase();

  if (
    [
      'pending',
      'processing',
      'queued',
    ].includes(value)
  ) {
    return 'pending';
  }

  if (
    [
      'failed',
      'failure',
      'cancelled',
      'canceled',
      'error',
    ].includes(value)
  ) {
    return 'failed';
  }

  return 'success';
}

function normalizeReceipt(
  receipt: ReceiptData,
): ReceiptData {
  return {
    ...receipt,

    provider:
      toText(
        receipt.provider,
      ) ||
      'GY DATA',

    service:
      toText(
        receipt.service,
      ) ||
      'Transaction',

    description:
      toText(
        receipt.description,
      ) ||
      'Transaction',

    amount:
      toNumber(
        receipt.amount,
      ),

    date:
      toText(
        receipt.date,
      ) ||
      new Date()
        .toLocaleDateString(
          'en-GB',
        ),

    time:
      toText(
        receipt.time,
      ) ||
      undefined,

    createdAt:
      toText(
        receipt.createdAt,
      ) ||
      undefined,

    status:
      normalizeStatus(
        receipt.status,
      ),

    phone:
      toText(
        receipt.phone,
      ) ||
      undefined,

    recipient:
      toText(
        receipt.recipient,
      ) ||
      undefined,

    paymentMethod:
      toText(
        receipt.paymentMethod,
      ) ||
      undefined,

    txnId:
      toText(
        receipt.txnId ||
          receipt.id,
      ) ||
      undefined,

    reference:
      toText(
        receipt.reference,
      ) ||
      undefined,

    providerReference:
      toText(
        receipt.providerReference,
      ) ||
      undefined,

    metadata:
      receipt.metadata ??
      undefined,
  };
}

function metadataString(
  metadata:
    | Record<
        string,
        unknown
      >
    | null
    | undefined,
  keys: string[],
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  for (
    const key of keys
  ) {
    const value =
      toText(
        metadata[key],
      );

    if (value) {
      return value;
    }
  }

  return undefined;
}

function enrichReceipt(
  receipt: ReceiptData,
  transaction: ApiTransaction,
): ReceiptData {
  const metadata =
    transaction.metadata ??
    receipt.metadata;

  const phone =
    metadataString(
      metadata,
      [
        'phone',
        'recipientPhone',
        'recipient_phone',
        'recipient',
        'mobile',
        'phoneNumber',
        'phone_number',
        'customerPhone',
      ],
    ) ||
    toText(
      transaction.phone,
    ) ||
    toText(
      transaction.recipientPhone,
    ) ||
    receipt.phone ||
    receipt.recipient;

  return normalizeReceipt({
    ...receipt,

    id:
      toText(
        transaction.id,
      ) ||
      receipt.id,

    txnId:
      toText(
        transaction.id,
      ) ||
      receipt.txnId,

    reference:
      toText(
        transaction.reference,
      ) ||
      receipt.reference,

    providerReference:
      toText(
        transaction.providerReference,
      ) ||
      receipt.providerReference,

    provider:
      toText(
        transaction.provider,
      ) ||
      receipt.provider,

    service:
      toText(
        transaction.service,
      ) ||
      receipt.service,

    description:
      toText(
        transaction.description,
      ) ||
      receipt.description,

    amount:
      toNumber(
        transaction.amount,
      ) ||
      receipt.amount,

    status:
      normalizeStatus(
        transaction.status ||
          receipt.status,
      ),

    paymentMethod:
      toText(
        transaction.paymentMethod,
      ) ||
      receipt.paymentMethod,

    phone,

    recipient:
      phone ||
      receipt.recipient,

    createdAt:
      toText(
        transaction.createdAt,
      ) ||
      receipt.createdAt,

    date:
      toText(
        transaction.date,
      ) ||
      receipt.date,

    time:
      toText(
        transaction.time,
      ) ||
      receipt.time,

    metadata,
  });
}

function sameId(
  a: unknown,
  b: unknown,
): boolean {
  const x =
    toText(a);

  const y =
    toText(b);

  return (
    !!x &&
    !!y &&
    x.toLowerCase() ===
      y.toLowerCase()
  );
}

function transactionMatches(
  transaction: ApiTransaction,
  receipt: ReceiptData,
): boolean {
  const txnId =
    toText(
      receipt.txnId ||
        receipt.id,
    );

  const reference =
    toText(
      receipt.reference,
    );

  const providerReference =
    toText(
      receipt.providerReference,
    );

  if (
    txnId &&
    sameId(
      transaction.id,
      txnId,
    )
  ) {
    return true;
  }

  if (
    reference &&
    sameId(
      transaction.reference,
      reference,
    )
  ) {
    return true;
  }

  if (
    providerReference &&
    sameId(
      transaction.providerReference,
      providerReference,
    )
  ) {
    return true;
  }

  const amountMatches =
    Math.abs(
      toNumber(
        transaction.amount,
      ) -
        toNumber(
          receipt.amount,
        ),
    ) < 0.01;

  if (!amountMatches) {
    return false;
  }

  const receiptPhone =
    toText(
      receipt.phone,
    ) ||
    toText(
      receipt.recipient,
    ) ||
    metadataString(
      receipt.metadata,
      [
        'phone',
        'recipientPhone',
        'recipient_phone',
      ],
    ) ||
    '';

  const transactionPhone =
    metadataString(
      transaction.metadata,
      [
        'phone',
        'recipientPhone',
        'recipient_phone',
        'recipient',
        'mobile',
        'phoneNumber',
        'phone_number',
        'customerPhone',
      ],
    ) ||
    toText(
      transaction.phone,
    ) ||
    toText(
      transaction.recipientPhone,
    ) ||
    '';

  if (
    receiptPhone &&
    transactionPhone
  ) {
    const a =
      receiptPhone.replace(
        /\D/g,
        '',
      );

    const b =
      transactionPhone.replace(
        /\D/g,
        '',
      );

    if (
      a &&
      b &&
      a !== b
    ) {
      return false;
    }
  }

  return true;
}

function extractTransactions(
  json: unknown,
): ApiTransaction[] {
  if (
    Array.isArray(json)
  ) {
    return json as ApiTransaction[];
  }

  if (
    !json ||
    typeof json !==
      'object'
  ) {
    return [];
  }

  const value =
    json as Record<
      string,
      unknown
    >;

  if (
    Array.isArray(
      value.transactions,
    )
  ) {
    return value.transactions as ApiTransaction[];
  }

  if (
    Array.isArray(
      value.data,
    )
  ) {
    return value.data as ApiTransaction[];
  }

  return [];
}

function formatMoney(
  value: number,
): string {
  return `₦${value.toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}

function displayValue(
  value: unknown,
): string {
  const text =
    toText(value);

  return (
    text || '—'
  );
}

function getMeta(
  receipt: ReceiptData,
  keys: string[],
): string {
  return (
    metadataString(
      receipt.metadata,
      keys,
    ) || '—'
  );
}

function getRecipient(
  receipt: ReceiptData,
): string {
  return (
    toText(
      receipt.phone,
    ) ||
    toText(
      receipt.recipient,
    ) ||
    getMeta(
      receipt,
      [
        'phone',
        'recipientPhone',
        'recipient_phone',
        'recipient',
        'mobile',
        'phoneNumber',
        'phone_number',
      ],
    )
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const copy =
    async () => {
      if (
        !value ||
        value === '—'
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          value,
        );

        toast.success(
          `${label} copied`,
        );
      } catch {
        toast.error(
          'Unable to copy',
        );
      }
    };

  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">

      <span className="shrink-0 text-[13px] font-medium text-slate-400">
        {label}
      </span>

      <div className="flex min-w-0 items-center justify-end gap-2 text-right">

        <span
          className={`break-all text-[13px] font-bold text-[#111827] ${
            mono
              ? 'font-mono'
              : ''
          }`}
        >
          {value}
        </span>

        {copyable &&
          value !==
            '—' && (
            <button
              type="button"
              onClick={() =>
                void copy()
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              aria-label={`Copy ${label}`}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}

      </div>
    </div>
  );
}

function TransactionDetails({
  receipt,
  onViewReceipt,
  onShareReceipt,
  sharing,
}: {
  receipt: ReceiptData;
  onViewReceipt: () => void;
  onShareReceipt: () => void;
  sharing: boolean;
}) {
  const recipient =
    getRecipient(
      receipt,
    );

  const metadata =
    receipt.metadata ??
    {};

  const date =
    formatReceiptDate(
      receipt,
    );

  const status =
    receipt.status ===
    'failed'
      ? 'Failed'
      : receipt.status ===
          'pending'
        ? 'Pending'
        : 'Successful';

  const balanceBefore =
    metadataString(
      metadata,
      [
        'balanceBefore',
        'balance_before',
        'previousBalance',
        'previous_balance',
        'walletBalanceBefore',
      ],
    );

  const balanceAfter =
    metadataString(
      metadata,
      [
        'balanceAfter',
        'balance_after',
        'newBalance',
        'new_balance',
        'walletBalanceAfter',
      ],
    );

  const plan =
    metadataString(
      metadata,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'data_plan_name',
        'plan',
        'packageName',
        'package_name',
      ],
    );

  const transactionType =
    metadataString(
      metadata,
      [
        'transactionType',
        'transaction_type',
        'type',
      ],
    ) ||
    receipt.type;

  const addon =
    metadataString(
      metadata,
      [
        'addon',
        'addOn',
        'cashbackText',
      ],
    );

  return (
    <div className="w-full overflow-hidden rounded-[28px] border border-[#E3EEF8] bg-white shadow-[0_16px_55px_rgba(11,31,78,0.18)]">

      <div className="border-b border-slate-100 px-5 pb-4 pt-5">

        <div className="flex items-start justify-between gap-4">

          <div>
            <div className="text-xs font-semibold text-slate-400">
              Transaction Details
            </div>

            <h2 className="mt-1 text-xl font-extrabold text-[#0B1F4E]">
              {receipt.service ||
                'Transaction'}
            </h2>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>

        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-green-50 px-4 py-3">

          <span className="text-sm font-semibold text-slate-500">
            Status
          </span>

          <span className="text-sm font-extrabold text-green-700">
            {status}
          </span>

        </div>

      </div>

      <div className="px-5 py-2">

        <DetailRow
          label="Amount"
          value={formatMoney(
            receipt.amount,
          )}
        />

        <DetailRow
          label="Recipient"
          value={displayValue(
            recipient,
          )}
          mono
        />

        <DetailRow
          label="Description"
          value={displayValue(
            receipt.description,
          )}
        />

        <DetailRow
          label="Date"
          value={date}
        />

        <DetailRow
          label="Reference"
          value={displayValue(
            receipt.reference,
          )}
          mono
          copyable
        />

        <DetailRow
          label="Provider Reference"
          value={displayValue(
            receipt.providerReference,
          )}
          mono
          copyable
        />

        <DetailRow
          label="Payment Method"
          value={displayValue(
            receipt.paymentMethod,
          )}
        />

        <DetailRow
          label="Provider"
          value={displayValue(
            receipt.provider,
          )}
        />

        <DetailRow
          label="Type"
          value={
            transactionType
          }
        />

        {plan && (
          <DetailRow
            label="Plan"
            value={plan}
          />
        )}

        {addon && (
          <DetailRow
            label="Addon"
            value={addon}
          />
        )}

        {balanceBefore && (
          <DetailRow
            label="Bal. Before"
            value={
              balanceBefore.startsWith(
                '₦',
              )
                ? balanceBefore
                : formatMoney(
                    toNumber(
                      balanceBefore,
                    ),
                  )
            }
          />
        )}

        {balanceAfter && (
          <DetailRow
            label="Bal. After"
            value={
              balanceAfter.startsWith(
                '₦',
              )
                ? balanceAfter
                : formatMoney(
                    toNumber(
                      balanceAfter,
                    ),
                  )
            }
          />
        )}

      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-4">

        <button
          type="button"
          onClick={
            onViewReceipt
          }
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0B1F4E] text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(11,31,78,0.18)]"
        >
          <Eye className="h-4 w-4" />
          View Receipt
        </button>

        <button
          type="button"
          onClick={
            onShareReceipt
          }
          disabled={
            sharing
          }
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(22,163,74,0.18)] disabled:opacity-60"
        >
          <Share2 className="h-4 w-4" />

          {sharing
            ? 'Sharing...'
            : 'Share Receipt'}
        </button>

      </div>

    </div>
  );
}

export default function SuccessModal({
  open,
  onOpenChange,
  receipt,
  data,
  onDone,
  doneLabel = 'Done',
}: SuccessModalProps) {
  const rawReceipt =
    receipt ??
    data ??
    null;

  const safeReceipt =
    useMemo(
      () =>
        rawReceipt
          ? normalizeReceipt(
              rawReceipt,
            )
          : null,
      [rawReceipt],
    );

  const [
    fullReceipt,
    setFullReceipt,
  ] =
    useState<ReceiptData | null>(
      null,
    );

  const [
    showReceipt,
    setShowReceipt,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    sharing,
    setSharing,
  ] = useState(false);

  useEffect(() => {
    if (!open) {
      setFullReceipt(
        null,
      );

      setShowReceipt(
        false,
      );

      setLoading(
        false,
      );

      setSharing(
        false,
      );

      return;
    }

    setFullReceipt(
      safeReceipt,
    );

    setShowReceipt(
      false,
    );
  }, [
    open,
    safeReceipt,
  ]);

  useEffect(() => {
    if (
      !open ||
      !safeReceipt
    ) {
      return;
    }

    let cancelled =
      false;

    const loadTransaction =
      async () => {
        setLoading(
          true,
        );

        try {
          const response =
            await fetch(
              '/api/user/transactions?limit=100',
              {
                method:
                  'GET',
                credentials:
                  'include',
                headers: {
                  Accept:
                    'application/json',
                },
              },
            );

          if (
            !response.ok
          ) {
            return;
          }

          const json =
            await response.json();

          const transactions =
            extractTransactions(
              json,
            );

          const exact =
            transactions.find(
              transaction => {
                const id =
                  toText(
                    safeReceipt.txnId ||
                      safeReceipt.id,
                  );

                const reference =
                  toText(
                    safeReceipt.reference,
                  );

                const providerReference =
                  toText(
                    safeReceipt.providerReference,
                  );

                return (
                  (
                    id &&
                    sameId(
                      transaction.id,
                      id,
                    )
                  ) ||
                  (
                    reference &&
                    sameId(
                      transaction.reference,
                      reference,
                    )
                  ) ||
                  (
                    providerReference &&
                    sameId(
                      transaction.providerReference,
                      providerReference,
                    )
                  )
                );
              },
            );

          const matching =
            exact ||
            transactions.find(
              transaction =>
                transactionMatches(
                  transaction,
                  safeReceipt,
                ),
            );

          if (
            !cancelled &&
            matching
          ) {
            setFullReceipt(
              enrichReceipt(
                safeReceipt,
                matching,
              ),
            );
          }
        } catch (
          error
        ) {
          console.error(
            'Unable to load full transaction:',
            error,
          );
        } finally {
          if (
            !cancelled
          ) {
            setLoading(
              false,
            );
          }
        }
      };

    void loadTransaction();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    safeReceipt,
  ]);

  const activeReceipt =
    fullReceipt ??
    safeReceipt;

  const handleShare =
    async () => {
      if (
        !activeReceipt ||
        sharing
      ) {
        return;
      }

      setSharing(
        true,
      );

      try {
        await shareReceiptImage(
          activeReceipt,
        );
      } catch (
        error
      ) {
        if (
          !(
            error instanceof
              DOMException &&
            error.name ===
              'AbortError'
          )
        ) {
          console.error(
            'Receipt share failed:',
            error,
          );

          toast.error(
            'Unable to share receipt image.',
          );
        }
      } finally {
        setSharing(
          false,
        );
      }
    };

  const close =
    () => {
      setShowReceipt(
        false,
      );

      setFullReceipt(
        null,
      );

      onOpenChange(
        false,
      );
    };

  const done =
    () => {
      close();

      onDone?.();
    };

  return (
    <AnimatePresence>
      {open &&
        activeReceipt && (
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
              className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
              onClick={
                close
              }
            />

            <motion.div
              initial={{
                opacity: 0,
                y: 60,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                y: 60,
              }}
              transition={{
                type: 'spring',
                damping: 28,
                stiffness: 320,
              }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[94vh] overflow-y-auto px-4 pb-6 pt-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[470px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:px-0 sm:pb-0 sm:pt-0"
              onClick={event =>
                event.stopPropagation()
              }
            >

              <div className="mb-3 flex justify-end">

                <button
                  type="button"
                  onClick={
                    close
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>

              </div>

              {showReceipt ? (
                <TransactionReceipt
                  receipt={
                    activeReceipt
                  }
                  onDone={() =>
                    setShowReceipt(
                      false,
                    )
                  }
                  doneLabel="Back to Details"
                  showActions
                />
              ) : (
                <>
                  {loading && (
                    <div className="mb-2 rounded-xl bg-white px-4 py-2 text-center text-xs font-semibold text-slate-400 shadow">
                      Loading transaction details...
                    </div>
                  )}

                  <TransactionDetails
                    receipt={
                      activeReceipt
                    }
                    onViewReceipt={() =>
                      setShowReceipt(
                        true,
                      )
                    }
                    onShareReceipt={() =>
                      void handleShare()
                    }
                    sharing={
                      sharing
                    }
                  />

                  <button
                    type="button"
                    onClick={
                      done
                    }
                    className="mt-2 h-11 w-full rounded-xl bg-white text-sm font-extrabold text-[#0B1F4E] shadow"
                  >
                    {doneLabel}
                  </button>
                </>
              )}

            </motion.div>
          </>
        )}
    </AnimatePresence>
  );
}
