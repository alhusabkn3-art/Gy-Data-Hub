import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  motion,
  AnimatePresence,
} from 'framer-motion';

import {
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react';

import TransactionReceipt, {
  ReceiptData,
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
  provider_reference?: string | null;
  description?: string;
  paymentMethod?: string | null;
  payment_method?: string | null;
  metadata?: Record<string, unknown> | null;
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
  const result =
    Number(value);

  return Number.isFinite(
    result,
  )
    ? result
    : 0;
}

function normalizeStatus(
  status: unknown,
): ReceiptData['status'] {
  const value =
    text(status).toLowerCase();

  if (
    value === 'pending' ||
    value === 'processing' ||
    value === 'queued'
  ) {
    return 'pending';
  }

  if (
    value === 'failed' ||
    value === 'failure' ||
    value === 'cancelled' ||
    value === 'canceled' ||
    value === 'error'
  ) {
    return 'failed';
  }

  return 'success';
}

function metadataString(
  metadata:
    | Record<string, unknown>
    | null
    | undefined,
  keys: string[],
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  for (const key of keys) {
    const value =
      metadata[key];

    const result =
      text(value);

    if (result) {
      return result;
    }
  }

  return undefined;
}

function getTransactionCreatedAt(
  transaction: ApiTransaction,
): string | undefined {
  const value =
    text(
      transaction.createdAt ??
        transaction.created_at,
    );

  return value || undefined;
}

function getReceiptCreatedAt(
  receipt: ReceiptData,
): string | undefined {
  const value =
    text(
      receipt.createdAt,
    );

  return value || undefined;
}

function normalizeReceipt(
  receipt: ReceiptData,
): ReceiptData {
  const metadata =
    receipt.metadata ?? {};

  const metadataPlanName =
    metadataString(
      metadata,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'plan',
      ],
    );

  const metadataPhone =
    metadataString(
      metadata,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
        'customerPhone',
      ],
    );

  const createdAt =
    getReceiptCreatedAt(
      receipt,
    );

  return {
    ...receipt,

    provider:
      text(
        receipt.provider,
      ) || 'GY DATA',

    service:
      text(
        receipt.service,
      ) || 'Data',

    description:
      metadataPlanName ||
      text(
        receipt.description,
      ) ||
      'Data Purchase',

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

    createdAt,

    status:
      normalizeStatus(
        receipt.status,
      ),

    phone:
      metadataPhone ||
      text(
        receipt.phone,
      ) ||
      undefined,

    recipient:
      text(
        receipt.recipient,
      ) ||
      undefined,

    paymentMethod:
      text(
        receipt.paymentMethod,
      ) ||
      undefined,

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
      ) ||
      undefined,

    reference:
      text(
        receipt.reference,
      ) ||
      undefined,

    providerReference:
      text(
        receipt.providerReference,
      ) ||
      undefined,

    metadata:
      Object.keys(metadata).length
        ? metadata
        : undefined,
  };
}

function enrichReceipt(
  receipt: ReceiptData,
  transaction: ApiTransaction,
): ReceiptData {
  const metadata =
    transaction.metadata ??
    receipt.metadata ??
    {};

  const metadataPlanName =
    metadataString(
      metadata,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'plan',
      ],
    );

  const metadataPhone =
    metadataString(
      metadata,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
        'customerPhone',
      ],
    );

  const providerReference =
    text(
      transaction.providerReference ??
        transaction.provider_reference,
    ) ||
    metadataString(
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

  const paymentMethod =
    text(
      transaction.paymentMethod ??
        transaction.payment_method,
    ) ||
    text(
      receipt.paymentMethod,
    ) ||
    undefined;

  const createdAt =
    getTransactionCreatedAt(
      transaction,
    ) ||
    getReceiptCreatedAt(
      receipt,
    );

  const transactionDescription =
    text(
      transaction.description,
    );

  const description =
    metadataPlanName ||
    (
      transactionDescription &&
      !/^data purchase\s*-/i.test(
        transactionDescription,
      )
        ? transactionDescription
        : ''
    ) ||
    text(
      receipt.description,
    ) ||
    'Data Purchase';

  return {
    ...receipt,

    id:
      text(
        transaction.id,
      ) ||
      text(
        receipt.id,
      ) ||
      undefined,

    txnId:
      text(
        transaction.id,
      ) ||
      text(
        receipt.txnId,
      ) ||
      text(
        receipt.id,
      ) ||
      undefined,

    reference:
      text(
        transaction.reference,
      ) ||
      text(
        receipt.reference,
      ) ||
      undefined,

    providerReference,

    provider:
      text(
        transaction.provider,
      ) ||
      text(
        receipt.provider,
      ) ||
      'GY DATA',

    service:
      text(
        transaction.service,
      ) ||
      text(
        receipt.service,
      ) ||
      'Data',

    description,

    amount:
      numberValue(
        transaction.amount,
      ) ||
      numberValue(
        receipt.amount,
      ),

    status:
      normalizeStatus(
        transaction.status ??
          receipt.status,
      ),

    paymentMethod,

    phone:
      metadataPhone ||
      text(
        receipt.phone,
      ) ||
      text(
        receipt.recipient,
      ) ||
      undefined,

    recipient:
      metadataPhone ||
      text(
        receipt.recipient,
      ) ||
      text(
        receipt.phone,
      ) ||
      undefined,

    createdAt,

    date:
      text(
        receipt.date,
      ),

    time:
      text(
        receipt.time,
      ) || undefined,

    metadata:
      Object.keys(metadata).length
        ? metadata
        : undefined,
  };
}

function normalizeCompare(
  value: unknown,
): string {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function transactionMatchesReceipt(
  transaction: ApiTransaction,
  receipt: ReceiptData,
): boolean {
  const receiptId =
    normalizeCompare(
      receipt.txnId ||
        receipt.id,
    );

  const transactionId =
    normalizeCompare(
      transaction.id,
    );

  if (
    receiptId &&
    transactionId &&
    receiptId ===
      transactionId
  ) {
    return true;
  }

  const receiptReference =
    normalizeCompare(
      receipt.reference,
    );

  const transactionReference =
    normalizeCompare(
      transaction.reference,
    );

  if (
    receiptReference &&
    transactionReference &&
    receiptReference ===
      transactionReference
  ) {
    return true;
  }

  const receiptProviderReference =
    normalizeCompare(
      receipt.providerReference,
    );

  const transactionProviderReference =
    normalizeCompare(
      transaction.providerReference ??
        transaction.provider_reference,
    );

  if (
    receiptProviderReference &&
    transactionProviderReference &&
    receiptProviderReference ===
      transactionProviderReference
  ) {
    return true;
  }

  const receiptMetadataPhone =
    normalizeCompare(
      metadataString(
        receipt.metadata,
        [
          'phone',
          'recipientPhone',
          'recipient',
          'mobile',
        ],
      ),
    );

  const transactionMetadataPhone =
    normalizeCompare(
      metadataString(
        transaction.metadata,
        [
          'phone',
          'recipientPhone',
          'recipient',
          'mobile',
        ],
      ),
    );

  const samePhone =
    !receiptMetadataPhone ||
    !transactionMetadataPhone ||
    receiptMetadataPhone ===
      transactionMetadataPhone;

  const sameAmount =
    Math.abs(
      numberValue(
        transaction.amount,
      ) -
        numberValue(
          receipt.amount,
        ),
    ) < 0.01;

  const sameType =
    !text(transaction.type) ||
    !text(receipt.type) ||
    normalizeCompare(
      transaction.type,
    ) ===
      normalizeCompare(
        receipt.type,
      );

  return (
    samePhone &&
    sameAmount &&
    sameType
  );
}

function getTransactionsFromResponse(
  json: unknown,
): ApiTransaction[] {
  if (
    Array.isArray(json)
  ) {
    return json as ApiTransaction[];
  }

  if (
    json &&
    typeof json === 'object'
  ) {
    const object =
      json as Record<
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
    showReceipt,
    setShowReceipt,
  ] = useState(false);

  const [
    fullReceipt,
    setFullReceipt,
  ] =
    useState<ReceiptData | null>(
      null,
    );

  const [
    loadingReceipt,
    setLoadingReceipt,
  ] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowReceipt(false);
      setFullReceipt(null);
      setLoadingReceipt(false);
      return;
    }

    setShowReceipt(false);
    setFullReceipt(
      safeReceipt,
    );
  }, [
    open,
    safeReceipt,
  ]);

  const loadFullReceipt =
    async () => {
      if (!safeReceipt) {
        return;
      }

      setLoadingReceipt(true);

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

        if (!response.ok) {
          setFullReceipt(
            safeReceipt,
          );
          setShowReceipt(true);
          return;
        }

        const json =
          await response.json();

        const transactions =
          getTransactionsFromResponse(
            json,
          );

        const matching =
          transactions.find(
            transaction =>
              transactionMatchesReceipt(
                transaction,
                safeReceipt,
              ),
          );

        if (matching) {
          setFullReceipt(
            enrichReceipt(
              safeReceipt,
              matching,
            ),
          );
        } else {
          setFullReceipt(
            safeReceipt,
          );
        }
      } catch {
        setFullReceipt(
          safeReceipt,
        );
      } finally {
        setLoadingReceipt(false);
        setShowReceipt(true);
      }
    };

  const handleDone = () => {
    setShowReceipt(false);
    setFullReceipt(null);
    onOpenChange(false);

    if (onDone) {
      onDone();
    }
  };

  const handleClose = () => {
    setShowReceipt(false);
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
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
              showReceipt
                ? handleClose
                : undefined
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
            className="
              fixed
              bottom-0
              left-0
              right-0
              z-50
              px-4
              pb-6
              pt-4
              sm:inset-auto
              sm:top-1/2
              sm:left-1/2
              sm:-translate-x-1/2
              sm:-translate-y-1/2
              sm:w-[430px]
              sm:px-0
              sm:pb-0
              sm:pt-0
            "
          >
            {showReceipt &&
            fullReceipt ? (
              <TransactionReceipt
                receipt={
                  fullReceipt
                }
                onDone={
                  handleDone
                }
                doneLabel={
                  doneLabel
                }
                showActions
              />
            ) : (
              <div
                className="
                  w-full
                  rounded-3xl
                  border
                  border-[#E3EEF8]
                  bg-white
                  p-6
                  shadow-[0_12px_40px_rgba(11,31,78,0.18)]
                "
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={
                      handleClose
                    }
                    className="
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-full
                      bg-slate-100
                      text-slate-500
                    "
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div
                    className="
                      flex
                      h-20
                      w-20
                      items-center
                      justify-center
                      rounded-full
                      bg-green-50
                    "
                  >
                    <CheckCircle2
                      className="
                        h-12
                        w-12
                        text-green-600
                      "
                    />
                  </div>

                  <h2
                    className="
                      mt-5
                      text-2xl
                      font-extrabold
                      text-[#0B1F4E]
                    "
                  >
                    Transaction Successful
                  </h2>

                  <p
                    className="
                      mt-2
                      text-sm
                      text-slate-500
                    "
                  >
                    Your transaction has been
                    completed successfully.
                  </p>

                  {safeReceipt && (
                    <div
                      className="
                        mt-6
                        w-full
                        rounded-2xl
                        border
                        border-slate-200
                        bg-slate-50
                        p-4
                      "
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          Service
                        </span>

                        <span className="text-sm font-bold text-[#0B1F4E]">
                          {safeReceipt.service}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          Amount
                        </span>

                        <span className="text-lg font-extrabold text-[#0B1F4E]">
                          ₦
                          {safeReceipt.amount.toLocaleString(
                            'en-NG',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </span>
                      </div>

                      {(safeReceipt.phone ||
                        safeReceipt.recipient) && (
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <span className="text-xs text-slate-500">
                            Recipient
                          </span>

                          <span className="text-sm font-semibold text-[#0B1F4E]">
                            {safeReceipt.phone ||
                              safeReceipt.recipient}
                          </span>
                        </div>
                      )}

                      {safeReceipt.reference && (
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <span className="text-xs text-slate-500">
                            Reference
                          </span>

                          <span className="max-w-[220px] break-all text-right text-xs font-semibold text-[#0B1F4E]">
                            {safeReceipt.reference}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={
                      loadFullReceipt
                    }
                    disabled={
                      loadingReceipt
                    }
                    className="
                      mt-5
                      flex
                      h-12
                      w-full
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      bg-[#075CC4]
                      px-5
                      text-sm
                      font-bold
                      text-white
                      shadow-[0_7px_20px_rgba(7,92,196,0.28)]
                      transition
                      hover:bg-[#064FA8]
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                    "
                  >
                    <Eye className="h-5 w-5" />

                    {loadingReceipt
                      ? 'Opening Receipt...'
                      : 'View Receipt'}
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleDone
                    }
                    className="
                      mt-3
                      h-11
                      w-full
                      rounded-xl
                      bg-slate-100
                      px-5
                      text-sm
                      font-semibold
                      text-slate-700
                      transition
                      hover:bg-slate-200
                    "
                  >
                    {doneLabel}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export type { ReceiptData };
