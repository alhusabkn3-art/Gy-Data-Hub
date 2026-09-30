import React, {
  useState,
} from 'react';

import {
  Wifi,
  Zap,
  Tv,
  BookOpen,
  ArrowDownLeft,
  Target,
  CheckCircle2,
  Clock,
  XCircle,
  Share2,
  Gift,
  Copy,
} from 'lucide-react';

import { toast } from 'sonner';

export interface ReceiptData {
  type:
    | 'data'
    | 'airtime'
    | 'electricity'
    | 'cable'
    | 'betting'
    | 'exam'
    | 'wallet_fund';

  provider: string;
  service: string;
  description: string;
  amount: number;
  date: string;
  time?: string;
  status:
    | 'success'
    | 'pending'
    | 'failed';

  phone?: string;
  paymentMethod?: string;
  cashbackAmount?: number;
  txnId?: string;
  reference?: string;
  providerReference?: string;

  metadata?: Record<
    string,
    unknown
  >;
}

type NetworkConfig = {
  bg: string;
  fg: string;
  label: string;
  fontSize: number;
};

const NETWORK: Record<
  string,
  NetworkConfig
> = {
  MTN: {
    bg: '#FFCC00',
    fg: '#111111',
    label: 'MTN',
    fontSize: 15,
  },

  Airtel: {
    bg: '#E4002B',
    fg: '#FFFFFF',
    label: 'airtel',
    fontSize: 14,
  },

  Glo: {
    bg: '#00A859',
    fg: '#FFFFFF',
    label: 'Glo',
    fontSize: 15,
  },

  '9mobile': {
    bg: '#006B3F',
    fg: '#FFFFFF',
    label: '9mobile',
    fontSize: 11,
  },
};

const STATUS = {
  success: {
    bg: '#F4FDF6',
    border: '#B7E8C3',
    text: '#16803C',
    label: 'SUCCESS',
    icon: (
      <CheckCircle2
        className="h-4 w-4 text-green-600"
      />
    ),
  },

  pending: {
    bg: '#FFF9EA',
    border: '#F3D58A',
    text: '#A76500',
    label: 'PENDING',
    icon: (
      <Clock
        className="h-4 w-4 text-yellow-600"
      />
    ),
  },

  failed: {
    bg: '#FFF3F3',
    border: '#F1BABA',
    text: '#C62828',
    label: 'FAILED',
    icon: (
      <XCircle
        className="h-4 w-4 text-red-600"
      />
    ),
  },
} as const;

function getNetwork(
  provider: string,
) {
  const value =
    String(
      provider ?? '',
    ).trim();

  if (NETWORK[value]) {
    return NETWORK[value];
  }

  const key =
    value.charAt(0).toUpperCase() +
    value.slice(1).toLowerCase();

  return NETWORK[key];
}

function ServiceIcon({
  type,
}: {
  type: ReceiptData['type'];
}) {
  const className =
    'h-6 w-6';

  if (type === 'data') {
    return (
      <Wifi className={className} />
    );
  }

  if (type === 'airtime') {
    return (
      <Wifi className={className} />
    );
  }

  if (type === 'electricity') {
    return (
      <Zap className={className} />
    );
  }

  if (type === 'cable') {
    return (
      <Tv className={className} />
    );
  }

  if (type === 'exam') {
    return (
      <BookOpen
        className={className}
      />
    );
  }

  if (type === 'betting') {
    return (
      <Target className={className} />
    );
  }

  if (type === 'wallet_fund') {
    return (
      <ArrowDownLeft
        className={className}
      />
    );
  }

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2h16v20l-3-2-3 2-3-2-3 2-4-2V2Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function formatAmount(
  amount: number,
): string {
  return `₦${Number(
    amount ?? 0,
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}

function DetailRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value?: string;
  copyable?: boolean;
}) {
  if (
    !value ||
    !String(value).trim()
  ) {
    return null;
  }

  const copyValue =
    async () => {
      try {
        await navigator.clipboard.writeText(
          value,
        );

        toast.success(
          `${label} copied.`,
        );
      } catch {
        toast.error(
          'Unable to copy.',
        );
      }
    };

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-[10px] text-slate-500 shrink-0">
        {label}
      </span>

      <div className="flex items-start gap-1.5 text-right min-w-0">
        <span className="text-[11px] font-semibold text-[#0B1F4E] break-all">
          {value}
        </span>

        {copyable && (
          <button
            type="button"
            onClick={
              copyValue
            }
            className="shrink-0 mt-0.5 text-slate-400 hover:text-[#075CC4]"
            aria-label={`Copy ${label}`}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function getShareText(
  receipt: ReceiptData,
): string {
  return [
    'GY DATA RECEIPT',
    '',
    `Service: ${receipt.service}`,
    `Network: ${receipt.provider}`,
    `Description: ${receipt.description}`,
    `Amount: ${formatAmount(
      receipt.amount,
    )}`,
    receipt.phone
      ? `Recipient: ${receipt.phone}`
      : '',
    `Date: ${receipt.date}${
      receipt.time
        ? `, ${receipt.time}`
        : ''
    }`,
    `Status: ${receipt.status.toUpperCase()}`,
    receipt.txnId
      ? `Transaction ID: ${receipt.txnId}`
      : '',
    receipt.reference
      ? `Reference: ${receipt.reference}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function TransactionReceipt({
  receipt,
  onDone,
  doneLabel = 'Done',
  showActions = true,
}: {
  receipt: ReceiptData;
  onDone?: () => void;
  doneLabel?: string;
  showActions?: boolean;
}) {
  const [
    isSharing,
    setIsSharing,
  ] = useState(false);

  const network =
    getNetwork(
      receipt.provider,
    );

  const status =
    STATUS[receipt.status];

  const mainText =
    receipt.type === 'data'
      ? receipt.description
      : receipt.service;

  const shareReceipt =
    async () => {
      if (isSharing) {
        return;
      }

      setIsSharing(true);

      try {
        const text =
          getShareText(
            receipt,
          );

        if (
          navigator.share
        ) {
          await navigator.share(
            {
              title:
                'GY DATA Receipt',
              text,
            },
          );

          return;
        }

        await navigator.clipboard.writeText(
          text,
        );

        toast.success(
          'Receipt details copied.',
        );
      } catch (
        error
      ) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        toast.error(
          'Unable to share receipt.',
        );
      } finally {
        setIsSharing(false);
      }
    };

  return (
    <div className="mx-auto w-full max-w-[350px]">
      <div
        className="
          overflow-hidden
          rounded-[18px]
          border-2
          border-[#C9A23A]
          bg-[#FFFDF7]
          shadow-[0_10px_30px_rgba(11,31,78,0.13)]
        "
      >
        <div className="relative px-4 pb-4 pt-4">
          <div
            className="
              pointer-events-none
              absolute
              left-1/2
              top-[85px]
              h-[220px]
              w-[220px]
              -translate-x-1/2
              rounded-full
              opacity-[0.055]
            "
            style={{
              background:
                network?.bg ??
                '#C9A23A',
            }}
          />

          <div className="relative flex flex-col items-center">
            {network ? (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full shadow-md"
                style={{
                  background:
                    network.bg,
                  color:
                    network.fg,
                  fontSize:
                    network.fontSize,
                  fontWeight: 900,
                }}
              >
                {network.label}
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1F4E] text-white">
                <ServiceIcon
                  type={
                    receipt.type
                  }
                />
              </div>
            )}

            <p className="mt-2 text-[10px] font-extrabold tracking-wide text-[#C39A2E]">
              {receipt.provider ||
                'GY DATA'}
            </p>

            <h2 className="mt-1 text-center text-[30px] font-black leading-tight tracking-tight text-[#111C38]">
              {mainText}
            </h2>

            <div
              className="
                mt-2
                flex
                items-center
                justify-center
                gap-1.5
                rounded-full
                border
                px-5
                py-1.5
                shadow-sm
              "
              style={{
                background:
                  status.bg,
                borderColor:
                  status.border,
              }}
            >
              {status.icon}

              <span
                className="text-[9px] font-black tracking-[0.12em]"
                style={{
                  color:
                    status.text,
                }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-[#D8C99D]" />

          <div className="rounded-xl bg-white/80 px-3 py-1">
            <DetailRow
              label="Amount"
              value={formatAmount(
                receipt.amount,
              )}
            />

            <DetailRow
              label="Service"
              value={
                receipt.service
              }
            />

            <DetailRow
              label="Description"
              value={
                receipt.description
              }
            />

            <DetailRow
              label="Recipient"
              value={
                receipt.phone
              }
              copyable
            />

            <DetailRow
              label="Date"
              value={`${receipt.date}${
                receipt.time
                  ? `, ${receipt.time}`
                  : ''
              }`}
            />

            <DetailRow
              label="Payment Method"
              value={
                receipt.paymentMethod
              }
            />

            <DetailRow
              label="Transaction ID"
              value={
                receipt.txnId
              }
              copyable
            />

            <DetailRow
              label="Reference"
              value={
                receipt.reference
              }
              copyable
            />

            <DetailRow
              label="Provider Reference"
              value={
                receipt.providerReference
              }
              copyable
            />

            {receipt.cashbackAmount !=
              null &&
              receipt.cashbackAmount >
                0 && (
                <DetailRow
                  label="Cashback"
                  value={`+${formatAmount(
                    receipt.cashbackAmount,
                  )}`}
                />
              )}
          </div>

          <div className="mt-3 flex items-center justify-center">
            <span className="text-[9px] font-black tracking-[0.18em] text-[#0B1F4E]">
              GY DATA
            </span>
          </div>
        </div>
      </div>

      {showActions && (
        <div className="mx-auto mt-3 flex w-full max-w-[350px] gap-2">
          <button
            type="button"
            onClick={
              shareReceipt
            }
            disabled={
              isSharing
            }
            className="
              flex
              h-10
              flex-1
              items-center
              justify-center
              gap-1.5
              rounded-lg
              border
              border-green-200
              bg-green-50
              text-[11px]
              font-bold
              text-green-700
              transition
              hover:bg-green-100
              disabled:opacity-60
            "
          >
            <Share2 className="h-3.5 w-3.5" />

            {isSharing
              ? 'Sharing...'
              : 'Share Receipt'}
          </button>

          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="
                flex
                h-10
                flex-[1.2]
                items-center
                justify-center
                rounded-lg
                bg-[#0B1F4E]
                text-[11px]
                font-extrabold
                text-white
                shadow-[0_5px_14px_rgba(11,31,78,0.20)]
                transition
                hover:bg-[#17366F]
              "
            >
              {doneLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
