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
  ReceiptText,
} from 'lucide-react';

import TransactionReceipt, {
  ReceiptData,
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
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

function safeText(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function normalizeStatus(
  status: unknown,
): ReceiptData['status'] {
  const value = safeText(status).toLowerCase();

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
  if (!metadata) return undefined;

  for (const key of keys) {
    const value = metadata[key];

    if (
      value !== undefined &&
      value !== null &&
      safeText(value)
    ) {
      return safeText(value);
    }
  }

  return undefined;
}

function normalizeReceipt(
  receipt: ReceiptData,
): ReceiptData {
  return {
    ...receipt,

    provider:
      safeText(receipt.provider) ||
      'GY DATA',

    service:
      safeText(receipt.service) ||
      'Transaction',

    description:
      safeText(receipt.description) ||
      'Transaction',

    amount:
      numberValue(receipt.amount),

    date:
      safeText(receipt.date) ||
      new Date().toLocaleDateString('en-NG'),

    time:
      safeText(receipt.time) ||
      undefined,

    status:
      normalizeStatus(receipt.status),

    phone:
      safeText(receipt.phone) ||
      undefined,

    recipient:
      safeText(receipt.recipient) ||
      undefined,

    txnId:
      safeText(receipt.txnId) ||
      safeText(receipt.id) ||
      undefined,

    reference:
      safeText(receipt.reference) ||
      undefined,

    providerReference:
      safeText(receipt.providerReference) ||
      undefined,

    paymentMethod:
      safeText(receipt.paymentMethod) ||
      undefined,

    metadata:
      receipt.metadata ||
      undefined,
  };
}

function enrichReceipt(
  receipt: ReceiptData,
  transaction: ApiTransaction,
): ReceiptData {
  const metadata =
    transaction.metadata || undefined;

  const phone =
    metadataString(metadata, [
      'phone',
      'recipientPhone',
      'recipient',
      'mobile',
      'customerPhone',
      'phoneNumber',
      'phone_number',
    ]) ||
    receipt.phone ||
    receipt.recipient;

  const planName =
    metadataString(metadata, [
      'planName',
      'plan_name',
      'dataPlanName',
      'data_plan_name',
      'plan',
    ]);

  const providerReference =
    metadataString(metadata, [
      'providerReference',
      'provider_reference',
      'providerRef',
      'provider_ref',
    ]) ||
    receipt.providerReference;

  const createdAt =
    transaction.createdAt ||
    receipt.createdAt;

  let date = receipt.date;
  let time = receipt.time;

  if (createdAt) {
    const parsed = new Date(createdAt);

    if (!Number.isNaN(parsed.getTime())) {
      date = `${String(
        parsed.getDate(),
      ).padStart(2, '0')}/${String(
        parsed.getMonth() + 1,
      ).padStart(2, '0')}/${parsed.getFullYear()}`;

      time = `${String(
        parsed.getHours(),
      ).padStart(2, '0')}:${String(
        parsed.getMinutes(),
      ).padStart(2, '0')}:${String(
        parsed.getSeconds(),
      ).padStart(2, '0')}`;
    }
  }

  return {
    ...receipt,

    id:
      transaction.id ||
      receipt.id,

    txnId:
      transaction.id ||
      receipt.txnId,

    reference:
      transaction.reference ||
      receipt.reference,

    provider:
      safeText(transaction.provider) ||
      receipt.provider ||
      'GY DATA',

    service:
      safeText(transaction.service) ||
      receipt.service ||
      'Transaction',

    description:
      planName ||
      safeText(transaction.description) ||
      receipt.description ||
      'Transaction',

    amount:
      numberValue(transaction.amount) ||
      numberValue(receipt.amount),

    status:
      normalizeStatus(
        transaction.status ||
          receipt.status,
      ),

    phone,

    recipient: phone,

    providerReference,

    paymentMethod:
      safeText(transaction.paymentMethod) ||
      receipt.paymentMethod,

    createdAt,

    date,

    time,

    metadata,
  };
}

function matchesTransaction(
  transaction: ApiTransaction,
  receipt: ReceiptData,
): boolean {
  const receiptId =
    safeText(receipt.txnId) ||
    safeText(receipt.id);

  if (
    receiptId &&
    safeText(transaction.id) === receiptId
  ) {
    return true;
  }

  const reference =
    safeText(receipt.reference);

  if (
    reference &&
    safeText(transaction.reference) ===
      reference
  ) {
    return true;
  }

  const metadata =
    transaction.metadata;

  const phone =
    metadataString(metadata, [
      'phone',
      'recipientPhone',
      'recipient',
      'phoneNumber',
      'phone_number',
    ]) ||
    '';

  const receiptPhone =
    safeText(receipt.phone) ||
    safeText(receipt.recipient);

  if (
    phone &&
    receiptPhone &&
    phone !== receiptPhone
  ) {
    return false;
  }

  const amountA =
    numberValue(transaction.amount);

  const amountB =
    numberValue(receipt.amount);

  if (
    Math.abs(amountA - amountB) >
    0.01
  ) {
    return false;
  }

  return true;
}

function displayDate(
  receipt: ReceiptData,
): string {
  if (receipt.createdAt) {
    const date = new Date(
      receipt.createdAt,
    );

    if (!Number.isNaN(date.getTime())) {
      return `${String(
        date.getDate(),
      ).padStart(2, '0')}/${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}/${date.getFullYear()}, ${String(
        date.getHours(),
      ).padStart(2, '0')}:${String(
        date.getMinutes(),
      ).padStart(2, '0')}:${String(
        date.getSeconds(),
      ).padStart(2, '0')}`;
    }
  }

  const date =
    safeText(receipt.date);

  const time =
    safeText(receipt.time);

  return [date, time]
    .filter(Boolean)
    .join(', ') || '—';
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
    receipt ||
    data ||
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

  const closeModal = () => {
    setShowReceipt(false);
    setFullReceipt(null);

    if (onOpenChange) {
      onOpenChange(false);
    }

    if (onClose) {
      onClose();
    }
  };

  useEffect(() => {
    if (!open) {
      setShowReceipt(false);
      setFullReceipt(null);
      setLoadingReceipt(false);
      return;
    }

    setShowReceipt(false);
    setFullReceipt(safeReceipt);
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
              credentials: 'include',
              headers: {
                Accept:
                  'application/json',
              },
            },
          );

        if (response.ok) {
          const json =
            await response.json();

          const transactions =
            Array.isArray(json)
              ? (json as ApiTransaction[])
              : [];

          const matching =
            transactions.find(
              transaction =>
                matchesTransaction(
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
    closeModal();

    if (onDone) {
      onDone();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
            onClick={
              showReceipt
                ? closeModal
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
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[430px] sm:px-0 sm:pb-0 sm:pt-0"
          >
            {showReceipt &&
            fullReceipt ? (
              <div className="max-h-[94vh] overflow-y-auto">
                <TransactionReceipt
                  receipt={fullReceipt}
                  onDone={handleDone}
                  doneLabel={doneLabel}
                  showActions
                />
              </div>
            ) : (
              <div className="w-full rounded-3xl border border-[#E3EEF8] bg-white p-5 shadow-[0_12px_40px_rgba(11,31,78,0.18)]">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>

                  <h2 className="mt-4 text-2xl font-extrabold text-[#0B1F4E]">
                    Transaction Successful
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    Your transaction has been completed successfully.
                  </p>

                  {safeReceipt && (
                    <div className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
                      <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-3">
                        <ReceiptText className="h-5 w-5 text-[#075CC4]" />

                        <span className="text-sm font-extrabold text-[#0B1F4E]">
                          Transaction Details
                        </span>
                      </div>

                      <div className="space-y-3">
                        <DetailRow
                          label="Service"
                          value={
                            safeReceipt.service
                          }
                        />

                        <DetailRow
                          label="Description"
                          value={
                            safeReceipt.description
                          }
                        />

                        {(safeReceipt.phone ||
                          safeReceipt.recipient) && (
                          <DetailRow
                            label="Recipient"
                            value={
                              safeReceipt.phone ||
                              safeReceipt.recipient ||
                              '—'
                            }
                          />
                        )}

                        <DetailRow
                          label="Amount"
                          value={`₦${safeReceipt.amount.toLocaleString(
                            'en-NG',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}`}
                          strong
                        />

                        <DetailRow
                          label="Status"
                          value={
                            safeReceipt.status
                              .toUpperCase()
                          }
                        />

                        <DetailRow
                          label="Payment Method"
                          value={
                            safeReceipt.paymentMethod ||
                            '—'
                          }
                        />

                        <DetailRow
                          label="Date"
                          value={displayDate(
                            safeReceipt,
                          )}
                        />

                        <DetailRow
                          label="Transaction ID"
                          value={
                            safeReceipt.txnId ||
                            safeReceipt.id ||
                            '—'
                          }
                          mono
                        />

                        <DetailRow
                          label="Reference"
                          value={
                            safeReceipt.reference ||
                            '—'
                          }
                          mono
                        />

                        <DetailRow
                          label="Provider Reference"
                          value={
                            safeReceipt.providerReference ||
                            '—'
                          }
                          mono
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void loadFullReceipt()
                    }
                    disabled={loadingReceipt}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#075CC4] px-5 text-sm font-bold text-white shadow-[0_7px_20px_rgba(7,92,196,0.28)] transition hover:bg-[#064FA8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Eye className="h-5 w-5" />

                    {loadingReceipt
                      ? 'Opening Receipt...'
                      : 'View Receipt'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDone}
                    className="mt-3 h-11 w-full rounded-xl bg-slate-100 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
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

function DetailRow({
  label,
  value,
  strong = false,
  mono = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-slate-500">
        {label}
      </span>

      <span
        className={[
          'max-w-[68%] break-all text-right text-sm',
          strong
            ? 'font-extrabold text-[#0B1F4E]'
            : 'font-semibold text-[#0B1F4E]',
          mono
            ? 'font-mono text-[11px]'
            : '',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

export type { ReceiptData };
