import React from 'react';

import { useAppContext } from '../context/AppContext';

import SuccessModal from './SuccessModal';

import type { ReceiptData } from './TransactionReceipt';

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
    <SuccessModal
      open={open}
      receipt={receipt}
      onOpenChange={nextOpen => {
        if (!nextOpen) {
          onClose();
        }
      }}
      onClose={onClose}
      onDone={onClose}
      doneLabel="Close"
    />
  );
}

