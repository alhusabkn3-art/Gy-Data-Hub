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
  description?: string;
  paymentMethod?: string | null;
  metadata?: Record<
    string,
    unknown
  > | null;
  createdAt?: string;
};

function normalizeStatus(
  status: unknown,
): ReceiptData['status'] {
  const value = String(
    status ?? '',
  )
    .trim()
    .toLowerCase();

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

function normalizeReceipt(
  receipt: ReceiptData,
): ReceiptData {
  return {
    ...receipt,

    provider:
      String(
        receipt.provider ?? '',
      ).trim() || 'GY DATA',

    service:
      String(
        receipt.service ?? '',
      ).trim() || 'Transaction',

    description:
      String(
        receipt.description ?? '',
      ).trim() || 'Transaction',

    amount:
      Number.isFinite(
        Number(receipt.amount),
      )
        ? Number(receipt.amount)
        : 0,

    date:
      String(
        receipt.date ?? '',
      ).trim() ||
      new Date().toLocaleDateString(
        'en-NG',
      ),

    time:
      receipt.time
        ? String(
            receipt.time,
          ).trim()
        : undefined,

    status:
      normalizeStatus(
        receipt.status,
      ),

    phone:
      receipt.phone
        ? String(
            receipt.phone,
          ).trim()
        : undefined,

    paymentMethod:
      receipt.paymentMethod
        ? String(
            receipt.paymentMethod,
          ).trim()
        : undefined,

    txnId:
      receipt.txnId
        ? String(
            receipt.txnId,
          ).trim()
        : undefined,

    reference:
      receipt.reference
        ? String(
            receipt.reference,
          ).trim()
        : undefined,

    providerReference:
      receipt.providerReference
        ? String(
            receipt.providerReference,
          ).trim()
        : undefined,

    cashbackAmount:
      receipt.cashbackAmount !=
        null &&
      Number.isFinite(
        Number(
          receipt.cashbackAmount,
        ),
      )
        ? Number(
            receipt.cashbackAmount,
          )
        : undefined,

    metadata:
      receipt.metadata ??
      undefined,
  };
}

function toNumber(
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

function normalizeText(
  value: unknown,
): string {
  return String(
    value ?? '',
  )
    .trim()
    .toLowerCase();
}

function getMetadataString(
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

  for (const key of keys) {
    const value =
      metadata[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(
        value,
      ).trim();
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
    undefined;

  const metadataPhone =
    getMetadataString(
      transaction.metadata,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
        'customerPhone',
      ],
    );

  const metadataProviderReference =
    getMetadataString(
      transaction.metadata,
      [
        'providerReference',
        'provider_reference',
        'providerRef',
      ],
    );

  const metadataCashback =
    getMetadataString(
      transaction.metadata,
      [
        'cashback',
        'cashbackAmount',
        'cashback_amount',
      ],
    );

  return {
    ...receipt,

    txnId:
      transaction.id ??
      receipt.txnId,

    reference:
      transaction.reference ??
      receipt.reference,

    provider:
      String(
        transaction.provider ??
          receipt.provider ??
          '',
      ).trim() || 'GY DATA',

    service:
      String(
        transaction.service ??
          receipt.service ??
          '',
      ).trim() || 'Transaction',

    description:
      String(
        transaction.description ??
          receipt.description ??
          '',
      ).trim() || 'Transaction',

    amount:
      toNumber(
        transaction.amount,
      ) ||
      toNumber(
        receipt.amount,
      ),

    status:
      normalizeStatus(
        transaction.status ??
          receipt.status,
      ),

    paymentMethod:
      transaction.paymentMethod ??
      receipt.paymentMethod,

    phone:
      metadataPhone ??
      receipt.phone,

    providerReference:
      metadataProviderReference ??
      receipt.providerReference,

    cashbackAmount:
      metadataCashback
        ? toNumber(
            metadataCashback,
          )
        : receipt.cashbackAmount,

    metadata,
  };
}

function transactionMatchesReceipt(
  transaction: ApiTransaction,
  receipt: ReceiptData,
): boolean {
  const transactionAmount =
    toNumber(
      transaction.amount,
    );

  const receiptAmount =
    toNumber(
      receipt.amount,
    );

  if (
    Math.abs(
      transactionAmount -
        receiptAmount,
    ) > 0.01
  ) {
    return false;
  }

  const transactionType =
    normalizeText(
      transaction.type,
    );

  const receiptType =
    normalizeText(
      receipt.type,
    );

  if (
    transactionType &&
    receiptType &&
    transactionType !==
      receiptType
  ) {
    return false;
  }

  const transactionService =
    normalizeText(
      transaction.service,
    );

  const receiptService =
    normalizeText(
      receipt.service,
    );

  if (
    transactionService &&
    receiptService &&
    !transactionService.includes(
      receiptService,
    ) &&
    !receiptService.includes(
      transactionService,
    )
  ) {
    return false;
  }

  return true;
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
    receipt ?? data ?? null;

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

      /*
       * If the purchase screen already supplied the
       * transaction ID/reference, use those immediately.
       */
      if (
        safeReceipt.txnId ||
        safeReceipt.reference
      ) {
        setFullReceipt(
          safeReceipt,
        );
        setShowReceipt(true);
        return;
      }

      setLoadingReceipt(true);

      try {
        const response =
          await fetch(
            '/api/user/transactions?limit=20',
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
          Array.isArray(json)
            ? (json as ApiTransaction[])
            : [];

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
        setLoadingReceipt(
          false,
        );

        setShowReceipt(
          true,
        );
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

  const handleClose =
    () => {
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

                      {safeReceipt.phone && (
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <span className="text-xs text-slate-500">
                            Recipient
                          </span>

                          <span className="text-sm font-semibold text-[#0B1F4E]">
                            {
                              safeReceipt.phone
                            }
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
