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
  ChevronLeft,
  Copy,
  Eye,
  X,
} from 'lucide-react';

import { toast } from 'sonner';

import TransactionReceipt, {
  type ReceiptData,
} from './TransactionReceipt';

interface SuccessModalProps {
  open: boolean;

  onOpenChange?: (
    open: boolean,
  ) => void;

  onClose?: () => void;

  receipt?: ReceiptData | null;

  data?: ReceiptData | null;

  onDone?: () => void;

  doneLabel?: string;
}

type ApiTransaction = {
  id?: string | null;

  type?:
    | ReceiptData['type']
    | string
    | null;

  service?: string | null;

  provider?: string | null;

  amount?:
    | number
    | string
    | null;

  status?: string | null;

  reference?: string | null;

  providerReference?:
    | string
    | null;

  provider_reference?:
    | string
    | null;

  description?: string | null;

  paymentMethod?:
    | string
    | null;

  payment_method?:
    | string
    | null;

  metadata?:
    | Record<
        string,
        unknown
      >
    | null;

  createdAt?: string | null;

  created_at?: string | null;
};

function text(
  value: unknown,
): string {
  return String(
    value ?? '',
  ).trim();
}

function numberValue(
  value: unknown,
): number {
  const parsed =
    Number(
      String(
        value ?? '',
      )
        .replace(
          /₦/g,
          '',
        )
        .replace(
          /,/g,
          '',
        )
        .trim(),
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function normalizeStatus(
  value: unknown,
): ReceiptData['status'] {
  const status =
    text(value).toLowerCase();

  if (
    status === 'pending' ||
    status === 'processing' ||
    status === 'queued'
  ) {
    return 'pending';
  }

  if (
    status === 'failed' ||
    status === 'failure' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'error'
  ) {
    return 'failed';
  }

  return 'success';
}

function metadataText(
  metadata:
    | Record<
        string,
        unknown
      >
    | null
    | undefined,
  keys: string[],
): string {
  if (!metadata) {
    return '';
  }

  for (const key of keys) {
    const value =
      text(
        metadata[key],
      );

    if (value) {
      return value;
    }
  }

  return '';
}

function metadataNumber(
  metadata:
    | Record<
        string,
        unknown
      >
    | null
    | undefined,
  keys: string[],
): number {
  if (!metadata) {
    return 0;
  }

  for (const key of keys) {
    const value =
      numberValue(
        metadata[key],
      );

    if (value > 0) {
      return value;
    }
  }

  return 0;
}

function normalizeReceipt(
  receipt: ReceiptData,
): ReceiptData {
  return {
    ...receipt,

    type:
      receipt.type ??
      'data',

    provider:
      text(
        receipt.provider,
      ) || 'GY DATA',

    service:
      text(
        receipt.service,
      ) || 'Transaction',

    description:
      text(
        receipt.description,
      ) || 'Transaction',

    amount:
      numberValue(
        receipt.amount,
      ),

    date:
      text(
        receipt.date,
      ),

    time:
      text(
        receipt.time,
      ) || undefined,

    createdAt:
      text(
        receipt.createdAt,
      ) || undefined,

    status:
      normalizeStatus(
        receipt.status,
      ),

    phone:
      text(
        receipt.phone,
      ) || undefined,

    recipient:
      text(
        receipt.recipient,
      ) || undefined,

    paymentMethod:
      text(
        receipt.paymentMethod,
      ) || undefined,

    txnId:
      text(
        receipt.txnId,
      ) ||
      text(
        receipt.id,
      ) ||
      undefined,

    id:
      text(
        receipt.id,
      ) || undefined,

    reference:
      text(
        receipt.reference,
      ) || undefined,

    providerReference:
      text(
        receipt.providerReference,
      ) || undefined,

    metadata:
      receipt.metadata ??
      undefined,
  };
}

function transactionCreatedAt(
  transaction: ApiTransaction,
): string | undefined {
  const value =
    text(
      transaction.createdAt ??
        transaction.created_at,
    );

  return value || undefined;
}

function enrichReceipt(
  receipt: ReceiptData,
  transaction: ApiTransaction,
): ReceiptData {
  const metadata =
    transaction.metadata ??
    receipt.metadata ??
    undefined;

  const planName =
    metadataText(
      metadata,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'plan',
      ],
    ) ||
    text(
      receipt.description,
    ) ||
    'Data Purchase';

  const phone =
    metadataText(
      metadata,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
        'customerPhone',
      ],
    ) ||
    text(
      receipt.phone,
    ) ||
    text(
      receipt.recipient,
    ) ||
    undefined;

  const providerReference =
    text(
      transaction.providerReference ??
        transaction.provider_reference,
    ) ||
    metadataText(
      metadata,
      [
        'providerReference',
        'provider_reference',
        'providerRef',
      ],
    ) ||
    text(
      receipt.providerReference,
    ) ||
    undefined;

  return {
    ...receipt,

    type:
      (text(
        transaction.type,
      ) ||
        receipt.type ||
        'data') as ReceiptData['type'],

    id:
      text(
        transaction.id,
      ) ||
      receipt.id ||
      undefined,

    txnId:
      text(
        transaction.id,
      ) ||
      receipt.txnId ||
      receipt.id ||
      undefined,

    reference:
      text(
        transaction.reference,
      ) ||
      receipt.reference ||
      undefined,

    providerReference,

    provider:
      text(
        transaction.provider,
      ) ||
      receipt.provider ||
      'GY DATA',

    service:
      text(
        transaction.service,
      ) ||
      receipt.service ||
      'Data',

    description:
      planName,

    amount:
      numberValue(
        transaction.amount,
      ) ||
      receipt.amount,

    status:
      normalizeStatus(
        transaction.status ??
          receipt.status,
      ),

    paymentMethod:
      text(
        transaction.paymentMethod ??
          transaction.payment_method,
      ) ||
      text(
        receipt.paymentMethod,
      ) ||
      'Wallet',

    phone,

    recipient:
      phone ||
      text(
        receipt.recipient,
      ) ||
      undefined,

    createdAt:
      transactionCreatedAt(
        transaction,
      ) ||
      receipt.createdAt,

    metadata,
  };
}

function normalizeCompare(
  value: unknown,
): string {
  return text(value)
    .toLowerCase()
    .replace(
      /\s+/g,
      '',
    );
}

function transactionMatches(
  transaction: ApiTransaction,
  receipt: ReceiptData,
): boolean {
  const transactionId =
    normalizeCompare(
      transaction.id,
    );

  const receiptId =
    normalizeCompare(
      receipt.txnId ||
        receipt.id,
    );

  if (
    transactionId &&
    receiptId &&
    transactionId ===
      receiptId
  ) {
    return true;
  }

  const transactionReference =
    normalizeCompare(
      transaction.reference,
    );

  const receiptReference =
    normalizeCompare(
      receipt.reference,
    );

  if (
    transactionReference &&
    receiptReference &&
    transactionReference ===
      receiptReference
  ) {
    return true;
  }

  const transactionProviderReference =
    normalizeCompare(
      transaction.providerReference ??
        transaction.provider_reference,
    );

  const receiptProviderReference =
    normalizeCompare(
      receipt.providerReference,
    );

  if (
    transactionProviderReference &&
    receiptProviderReference &&
    transactionProviderReference ===
      receiptProviderReference
  ) {
    return true;
  }

  const transactionPhone =
    normalizeCompare(
      metadataText(
        transaction.metadata,
        [
          'phone',
          'recipientPhone',
          'recipient',
          'mobile',
        ],
      ),
    );

  const receiptPhone =
    normalizeCompare(
      receipt.phone ||
        receipt.recipient,
    );

  const samePhone =
    Boolean(
      transactionPhone &&
        receiptPhone &&
        transactionPhone ===
          receiptPhone,
    );

  const sameAmount =
    Math.abs(
      numberValue(
        transaction.amount,
      ) -
        numberValue(
          receipt.amount,
        ),
    ) < 0.01;

  return (
    samePhone &&
    sameAmount
  );
}

function getTransactions(
  value: unknown,
): ApiTransaction[] {
  if (
    Array.isArray(value)
  ) {
    return value as ApiTransaction[];
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    const object =
      value as Record<
        string,
        unknown
      >;

    if (
      Array.isArray(
        object.transactions,
      )
    ) {
      return object.transactions as ApiTransaction[];
    }

    if (
      Array.isArray(
        object.data,
      )
    ) {
      return object.data as ApiTransaction[];
    }

    if (
      Array.isArray(
        object.rows,
      )
    ) {
      return object.rows as ApiTransaction[];
    }
  }

  return [];
}

function formatDateTime(
  receipt: ReceiptData,
): string {
  let date: Date | null =
    null;

  const createdAt =
    text(
      receipt.createdAt,
    );

  if (createdAt) {
    const parsed =
      new Date(
        createdAt,
      );

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      date = parsed;
    }
  }

  if (
    !date &&
    text(receipt.date)
  ) {
    const dateText =
      text(
        receipt.date,
      );

    const timeText =
      text(
        receipt.time,
      );

    const slash =
      dateText.match(
        /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
      );

    if (slash) {
      date =
        new Date(
          Number(
            slash[3],
          ),
          Number(
            slash[2],
          ) - 1,
          Number(
            slash[1],
          ),
        );

      const time =
        timeText.match(
          /^(\d{1,2}):(\d{2})(?::(\d{2}))?/,
        );

      if (time) {
        date.setHours(
          Number(
            time[1],
          ),
          Number(
            time[2],
          ),
          Number(
            time[3] ??
              0,
          ),
          0,
        );
      }
    } else {
      const parsed =
        new Date(
          `${dateText} ${
            timeText || ''
          }`.trim(),
        );

      if (
        !Number.isNaN(
          parsed.getTime(),
        )
      ) {
        date = parsed;
      }
    }
  }

  if (!date) {
    return '—';
  }

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      '0',
    );

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(
      2,
      '0',
    );

  const year =
    String(
      date.getFullYear(),
    );

  const hours =
    String(
      date.getHours(),
    ).padStart(
      2,
      '0',
    );

  const minutes =
    String(
      date.getMinutes(),
    ).padStart(
      2,
      '0',
    );

  const seconds =
    String(
      date.getSeconds(),
    ).padStart(
      2,
      '0',
    );

  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

function getNetwork(
  receipt: ReceiptData,
): string {
  return (
    metadataText(
      receipt.metadata,
      [
        'network',
        'networkName',
      ],
    ) ||
    (
      text(
        receipt.provider,
      ) &&
      !/^(gy\s*data|sme\s*api|smeapi)$/i.test(
        text(
          receipt.provider,
        ),
      )
        ? text(
            receipt.provider,
          )
        : 'MTN'
    )
  );
}

function getDescription(
  receipt: ReceiptData,
): string {
  return (
    metadataText(
      receipt.metadata,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'plan',
      ],
    ) ||
    text(
      receipt.description,
    ) ||
    'Data Purchase'
  );
}

function getRecipient(
  receipt: ReceiptData,
): string {
  return (
    metadataText(
      receipt.metadata,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
      ],
    ) ||
    text(
      receipt.phone,
    ) ||
    text(
      receipt.recipient,
    ) ||
    '—'
  );
}

function copyValue(
  value: string,
) {
  if (
    !value ||
    !navigator.clipboard
  ) {
    return;
  }

  void navigator.clipboard
    .writeText(value)
    .then(
      () =>
        toast.success(
          'Copied',
        ),
      () =>
        toast.error(
          'Unable to copy',
        ),
    );
}

function DetailRow({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="shrink-0 text-[12px] font-medium text-slate-400">
        {label}
      </span>

      <div className="flex min-w-0 items-center gap-1.5 text-right">
        <span className="break-all text-[13px] font-bold text-slate-800">
          {value || '—'}
        </span>

        {copy &&
        value ? (
          <button
            type="button"
            onClick={() =>
              copyValue(
                value,
              )
            }
            className="shrink-0 text-slate-400 hover:text-slate-700"
            aria-label={`Copy ${label}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function SuccessModal({
  open,
  onOpenChange,
  onClose,
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
                method: 'GET',
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
            getTransactions(
              json,
            );

          const transaction =
            transactions.find(
              item =>
                transactionMatches(
                  item,
                  safeReceipt,
                ),
            );

          if (
            !cancelled &&
            transaction
          ) {
            setFullReceipt(
              enrichReceipt(
                safeReceipt,
                transaction,
              ),
            );
          }
        } catch {
          /*
           * The purchase response
           * remains as the fallback.
           */
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

  const displayReceipt =
    fullReceipt ??
    safeReceipt;

  const close = () => {
    setShowReceipt(
      false,
    );

    setFullReceipt(
      null,
    );

    if (
      onOpenChange
    ) {
      onOpenChange(
        false,
      );
    }

    if (onClose) {
      onClose();
    }
  };

  const done = () => {
    close();

    if (onDone) {
      onDone();
    }
  };

  const network =
    displayReceipt
      ? getNetwork(
          displayReceipt,
        )
      : 'MTN';

  const recipient =
    displayReceipt
      ? getRecipient(
          displayReceipt,
        )
      : '';

  const description =
    displayReceipt
      ? getDescription(
          displayReceipt,
        )
      : '';

  const date =
    displayReceipt
      ? formatDateTime(
          displayReceipt,
        )
      : '—';

  const planType =
    displayReceipt
      ? metadataText(
          displayReceipt.metadata,
          [
            'planType',
            'dataPlanType',
          ],
        ) ||
        'Data'
      : 'Data';

  const addon =
    displayReceipt
      ? metadataText(
          displayReceipt.metadata,
          [
            'addon',
            'cashbackLabel',
          ],
        ) ||
        (
          numberValue(
            displayReceipt.cashbackAmount ??
              displayReceipt.cashback,
          ) > 0
            ? `₦${numberValue(
                displayReceipt.cashbackAmount ??
                  displayReceipt.cashback,
              ).toLocaleString(
                'en-NG',
                {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                },
              )} Cash Back`
            : '—'
        )
      : '—';

  const balanceAfter =
    displayReceipt
      ? metadataNumber(
          displayReceipt.metadata,
          [
            'balanceAfter',
            'balance_after',
          ],
        )
      : 0;

  const balanceBeforeStored =
    displayReceipt
      ? metadataNumber(
          displayReceipt.metadata,
          [
            'balanceBefore',
            'balance_before',
          ],
        )
      : 0;

  const balanceBefore =
    balanceBeforeStored ||
    (
      balanceAfter > 0 &&
      displayReceipt
        ? balanceAfter +
          displayReceipt.amount
        : 0
    );

  return (
    <AnimatePresence>
      {open ? (
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
              y: 50,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: 50,
            }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 320,
            }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3 pb-4 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:px-4"
          >
            {showReceipt &&
            displayReceipt ? (
              <div className="w-full sm:max-w-[410px]">
                <div className="mb-2 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() =>
                      setShowReceipt(
                        false,
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600 shadow">
                    Receipt
                  </span>

                  <button
                    type="button"
                    onClick={
                      close
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <TransactionReceipt
                  receipt={
                    displayReceipt
                  }
                  onDone={
                    done
                  }
                  doneLabel={
                    doneLabel
                  }
                  showActions
                />
              </div>
            ) : (
              <div className="max-h-[92vh] w-full overflow-y-auto rounded-[28px] bg-white p-4 shadow-2xl sm:max-w-[430px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>

                    <div>
                      <h2 className="text-[17px] font-extrabold text-slate-900">
                        Transaction Successful
                      </h2>

                      <p className="text-[10px] text-slate-400">
                        Transaction details
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      close
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {displayReceipt ? (
                  <>
                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                            Product
                          </p>

                          <p className="mt-0.5 text-[18px] font-black text-slate-900">
                            Mobile Data
                          </p>
                        </div>

                        <div className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm">
                          {network}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-white p-3">
                          <p className="text-[9px] text-slate-400">
                            Amount
                          </p>

                          <p className="mt-1 text-[15px] font-black text-slate-900">
                            ₦
                            {displayReceipt.amount.toLocaleString(
                              'en-NG',
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-3">
                          <p className="text-[9px] text-slate-400">
                            Plan
                          </p>

                          <p className="mt-1 text-[15px] font-black text-slate-900">
                            {description ||
                              '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-[20px] border border-slate-200 bg-white px-3">
                      <DetailRow
                        label="Phone Number"
                        value={
                          recipient
                        }
                      />

                      <DetailRow
                        label="Method"
                        value={
                          text(
                            displayReceipt.paymentMethod,
                          ) ||
                          'Wallet'
                        }
                      />

                      {balanceBefore >
                      0 ? (
                        <DetailRow
                          label="Bal. Before"
                          value={`₦${balanceBefore.toLocaleString(
                            'en-NG',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}`}
                        />
                      ) : null}

                      {balanceAfter >
                      0 ? (
                        <DetailRow
                          label="Bal. After"
                          value={`₦${balanceAfter.toLocaleString(
                            'en-NG',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}`}
                        />
                      ) : null}

                      <DetailRow
                        label="Date"
                        value={
                          date
                        }
                      />

                      <DetailRow
                        label="Reference"
                        value={
                          text(
                            displayReceipt.reference,
                          )
                        }
                        copy
                      />

                      <DetailRow
                        label="Description"
                        value={
                          description
                        }
                      />

                      <DetailRow
                        label="Type"
                        value={
                          planType
                        }
                      />

                      <DetailRow
                        label="Addon"
                        value={
                          addon
                        }
                      />

                      {text(
                        displayReceipt.providerReference,
                      ) ? (
                        <DetailRow
                          label="Provider Reference"
                          value={text(
                            displayReceipt.providerReference,
                          )}
                          copy
                        />
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setShowReceipt(
                          true,
                        )
                      }
                      disabled={
                        !fullReceipt ||
                        loading
                      }
                      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#10243F] text-[13px] font-extrabold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Eye className="h-4 w-4" />

                      {loading
                        ? 'Loading Transaction...'
                        : 'View Receipt'}
                    </button>

                    <button
                      type="button"
                      onClick={
                        done
                      }
                      className="mt-2 h-11 w-full rounded-xl bg-slate-100 text-[12px] font-bold text-slate-700"
                    >
                      {doneLabel}
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export type {
  SuccessModalProps,
};
