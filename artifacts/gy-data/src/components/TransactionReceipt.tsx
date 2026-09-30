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
    fontSize: 18,
  },

  Airtel: {
    bg: '#E4002B',
    fg: '#FFFFFF',
    label: 'airtel',
    fontSize: 17,
  },

  Glo: {
    bg: '#00A859',
    fg: '#FFFFFF',
    label: 'Glo',
    fontSize: 18,
  },

  '9mobile': {
    bg: '#006B3F',
    fg: '#FFFFFF',
    label: '9mobile',
    fontSize: 13,
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
        style={{
          width: 17,
          height: 17,
          color: '#159447',
        }}
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
        style={{
          width: 17,
          height: 17,
          color: '#C98600',
        }}
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
        style={{
          width: 17,
          height: 17,
          color: '#C62828',
        }}
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

  const direct =
    NETWORK[value];

  if (direct) {
    return direct;
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
  const common = {
    width: 30,
    height: 30,
  };

  if (type === 'data') {
    return (
      <Wifi {...common} />
    );
  }

  if (type === 'airtime') {
    return (
      <Wifi {...common} />
    );
  }

  if (type === 'electricity') {
    return (
      <Zap {...common} />
    );
  }

  if (type === 'cable') {
    return (
      <Tv {...common} />
    );
  }

  if (type === 'exam') {
    return (
      <BookOpen {...common} />
    );
  }

  if (type === 'betting') {
    return (
      <Target {...common} />
    );
  }

  if (
    type === 'wallet_fund'
  ) {
    return (
      <ArrowDownLeft
        {...common}
      />
    );
  }

  return (
    <ReceiptIcon />
  );
}

function ReceiptIcon() {
  return (
    <svg
      width="30"
      height="30"
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

  const copy = async () => {
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
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-b-0">
      <span className="text-xs text-slate-500 shrink-0">
        {label}
      </span>

      <div className="flex items-start gap-2 text-right min-w-0">
        <span className="text-sm font-semibold text-[#0B1F4E] break-all">
          {value}
        </span>

        {copyable && (
          <button
            type="button"
            onClick={copy}
            className="shrink-0 mt-0.5 text-slate-400 hover:text-[#075CC4]"
            aria-label={`Copy ${label}`}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function getShareText(
  receipt: ReceiptData,
): string {
  const lines = [
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
  ];

  return lines
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

  const dataText =
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

        try {
          await navigator.clipboard.writeText(
            getShareText(
              receipt,
            ),
          );

          toast.success(
            'Receipt details copied.',
          );
        } catch {
          toast.error(
            'Unable to share receipt.',
          );
        }
      } finally {
        setIsSharing(false);
      }
    };

  return (
    <div className="w-full">
      <div
        className="
          overflow-hidden
          rounded-[28px]
          border-[3px]
          border-[#C9A23A]
          bg-[#FFFDF7]
          shadow-[0_15px_45px_rgba(11,31,78,0.16)]
        "
      >
        <div className="relative px-5 pb-5 pt-6">
          <div
            className="
              pointer-events-none
              absolute
              left-1/2
              top-[120px]
              h-[330px]
              w-[330px]
              -translate-x-1/2
              rounded-full
              opacity-[0.06]
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
                className="flex h-[74px] w-[74px] items-center justify-center rounded-full shadow-lg"
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
              <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-[#0B1F4E] text-white">
                <ServiceIcon
                  type={
                    receipt.type
                  }
                />
              </div>
            )}

            <p className="mt-3 text-sm font-extrabold tracking-wide text-[#C39A2E]">
              {receipt.provider ||
                'GY DATA'}
            </p>

            <h2 className="mt-3 text-center text-5xl font-black tracking-tight text-[#111C38]">
              {dataText}
            </h2>

            <div
              className="
                mt-4
                flex
                items-center
                justify-center
                gap-2
                rounded-full
                border
                px-7
                py-3
                shadow-[0_4px_12px_rgba(11,31,78,0.10)]
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
                className="text-xs font-black tracking-[0.14em]"
                style={{
                  color:
                    status.text,
                }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <div className="my-5 border-t-2 border-dashed border-[#D8C99D]" />

          <div className="rounded-2xl bg-white/80 px-4 py-2">
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

          <div className="mt-5 flex items-center justify-center">
            <span className="text-[11px] font-black tracking-[0.2em] text-[#0B1F4E]">
              GY DATA
            </span>
          </div>
        </div>
      </div>

      {showActions && (
        <div className="mt-4 flex gap-3">
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
              h-12
              flex-1
              items-center
              justify-center
              gap-2
              rounded-xl
              border
              border-green-200
              bg-green-50
              text-sm
              font-bold
              text-green-700
              transition
              hover:bg-green-100
              disabled:opacity-60
            "
          >
            <Share2 className="h-4 w-4" />

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
                h-12
                flex-[1.4]
                items-center
                justify-center
                rounded-xl
                bg-[#0B1F4E]
                text-sm
                font-extrabold
                text-white
                shadow-[0_7px_20px_rgba(11,31,78,0.25)]
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
