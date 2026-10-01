import React from 'react';
import {
  motion,
  AnimatePresence,
} from 'framer-motion';

import {
  X,
} from 'lucide-react';

import { useAppContext } from '../context/AppContext';

import TransactionReceipt, {
  type ReceiptData,
} from './TransactionReceipt';

interface Props {
  open: boolean;
  onClose: () => void;
  transactionId: string;
}

function value(
  transaction: unknown,
  key: string,
): unknown {
  if (
    !transaction ||
    typeof transaction !== 'object'
  ) {
    return undefined;
  }

  return (
    transaction as Record<
      string,
      unknown
    >
  )[key];
}

function stringValue(
  transaction: unknown,
  key: string,
): string {
  return String(
    value(transaction, key) ?? '',
  ).trim();
}

function metadataValue(
  transaction: unknown,
  keys: string[],
): string | undefined {
  const metadata =
    value(transaction, 'metadata');

  if (
    !metadata ||
    typeof metadata !== 'object'
  ) {
    return undefined;
  }

  const record =
    metadata as Record<
      string,
      unknown
    >;

  for (const key of keys) {
    const result =
      String(
        record[key] ?? '',
      ).trim();

    if (result) {
      return result;
    }
  }

  return undefined;
}

function getDisplayProvider(
  provider: string,
): string {
  const value =
    String(provider ?? '').trim();

  if (
    /^(smeapi|sme api)$/i.test(
      value,
    )
  ) {
    return 'GY DATA';
  }

  return value || 'GY DATA';
}

function toReceipt(
  txn: unknown,
): ReceiptData {
  const createdAt =
    stringValue(
      txn,
      'createdAt',
    );

  const phone =
    stringValue(
      txn,
      'phone',
    ) ||
    stringValue(
      txn,
      'recipient',
    ) ||
    metadataValue(
      txn,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
        'phoneNumber',
        'phone_number',
      ],
    );

  const planName =
    metadataValue(
      txn,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'data_plan_name',
        'plan',
      ],
    );

  const providerReference =
    stringValue(
      txn,
      'providerReference',
    ) ||
    metadataValue(
      txn,
      [
        'providerReference',
        'provider_reference',
        'providerRef',
        'provider_ref',
      ],
    );

  let date =
    stringValue(
      txn,
      'date',
    );

  let time =
    stringValue(
      txn,
      'time',
    );

  if (createdAt) {
    const parsed =
      new Date(createdAt);

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      date =
        `${String(
          parsed.getDate(),
        ).padStart(2, '0')}/${String(
          parsed.getMonth() + 1,
        ).padStart(2, '0')}/${parsed.getFullYear()}`;

      time =
        `${String(
          parsed.getHours(),
        ).padStart(2, '0')}:${String(
          parsed.getMinutes(),
        ).padStart(2, '0')}:${String(
          parsed.getSeconds(),
        ).padStart(2, '0')}`;
    }
  }

  return {
    type:
      (stringValue(
        txn,
        'type',
      ) as ReceiptData['type']) ||
      'data',

    provider:
      getDisplayProvider(
        stringValue(
          txn,
          'provider',
        ),
      ),

    service:
      stringValue(
        txn,
        'service',
      ) || 'Transaction',

    description:
      planName ||
      stringValue(
        txn,
        'description',
      ) ||
      'Transaction',

    amount:
      Number(
        value(
          txn,
          'amount',
        ) ?? 0,
      ) || 0,

    date:
      date ||
      new Date().toLocaleDateString(
        'en-NG',
      ),

    time:
      time || undefined,

    createdAt:
      createdAt || undefined,

    status:
      (stringValue(
        txn,
        'status',
      ) as ReceiptData['status']) ||
      'success',

    phone:
      phone || undefined,

    recipient:
      phone || undefined,

    paymentMethod:
      stringValue(
        txn,
        'paymentMethod',
      ) || undefined,

    txnId:
      stringValue(
        txn,
        'id',
      ) || undefined,

    id:
      stringValue(
        txn,
        'id',
      ) || undefined,

    reference:
      stringValue(
        txn,
        'reference',
      ) || undefined,

    providerReference:
      providerReference ||
      undefined,

    cashbackAmount:
      Number(
        value(
          txn,
          'cashbackAmount',
        ) ?? 0,
      ) || undefined,

    metadata:
      value(
        txn,
        'metadata',
      ) &&
      typeof value(
        txn,
        'metadata',
      ) === 'object'
        ? (
            value(
              txn,
              'metadata',
            ) as Record<
              string,
              unknown
            >
          )
        : undefined,
  };
}

export default function TransactionDetailModal({
  open,
  onClose,
  transactionId,
}: Props) {
  const {
    transactions,
  } = useAppContext();

  const transaction =
    transactions.find(
      txn =>
        txn.id ===
        transactionId,
    );

  const receipt =
    transaction
      ? toReceipt(
          transaction,
        )
      : null;

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
            onClick={onClose}
          />

          <motion.div
            initial={{
              opacity: 0,
              y: 80,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: 80,
            }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 320,
            }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md px-4 pb-6 pt-2"
          >
            <div className="flex justify-center pb-3">
              <div className="h-1 w-10 rounded-full bg-white/30" />
            </div>

            <div className="max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-[#F3F6FB] px-4 pb-8 pt-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="w-8" />

                <div className="h-1 w-10 rounded-full bg-slate-300" />

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-[#0B1F4E]" />
                </button>
              </div>

              {receipt ? (
                <TransactionReceipt
                  receipt={receipt}
                  onDone={onClose}
                  doneLabel="Close"
                  showActions
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                  <p className="mb-4 text-sm text-slate-500">
                    Transaction details could not be loaded.
                  </p>

                  <button
                    type="button"
                    onClick={onClose}
                    className="font-semibold text-[#075CC4]"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
