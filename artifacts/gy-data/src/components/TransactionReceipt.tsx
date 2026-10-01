import React, { useState } from 'react';

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

  metadata?: Record<string, unknown>;
}

type NetworkConfig = {
  bg: string;
  fg: string;
  label: string;
  fontSize: number;
};

const NETWORK: Record<string, NetworkConfig> = {
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
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ),
  },

  pending: {
    bg: '#FFF9EA',
    border: '#F3D58A',
    text: '#A76500',
    label: 'PENDING',
    icon: (
      <Clock className="h-4 w-4 text-yellow-600" />
    ),
  },

  failed: {
    bg: '#FFF3F3',
    border: '#F1BABA',
    text: '#C62828',
    label: 'FAILED',
    icon: (
      <XCircle className="h-4 w-4 text-red-600" />
    ),
  },
} as const;

function getNetwork(provider: string) {
  const value = String(provider ?? '').trim();

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
  const className = 'h-6 w-6';

  if (type === 'data' || type === 'airtime') {
    return <Wifi className={className} />;
  }

  if (type === 'electricity') {
    return <Zap className={className} />;
  }

  if (type === 'cable') {
    return <Tv className={className} />;
  }

  if (type === 'exam') {
    return <BookOpen className={className} />;
  }

  if (type === 'betting') {
    return <Target className={className} />;
  }

  if (type === 'wallet_fund') {
    return <ArrowDownLeft className={className} />;
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

function formatAmount(amount: number): string {
  return `₦${Number(amount ?? 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  if (!value || !String(value).trim()) {
    return null;
  }

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error('Unable to copy.');
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
            onClick={copyValue}
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

function escapeSvgText(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createWhatsAppReceiptSvg(
  receipt: ReceiptData,
): string {
  const width = 900;
  const height = 975;

  const provider =
    String(receipt.provider ?? '').trim() ||
    'GY DATA';

  const network = getNetwork(provider);

  const providerLabel =
    network?.label ?? provider;

  const description =
    String(
      receipt.description ??
        receipt.service ??
        '',
    ).trim();

  const recipient =
    String(receipt.phone ?? '').trim();

  const dateText =
    `${receipt.date ?? ''}${
      receipt.time
        ? `, ${receipt.time}`
        : ''
    }`.trim();

  const statusText =
    receipt.status === 'success'
      ? 'Success'
      : receipt.status === 'pending'
        ? 'Pending'
        : 'Failed';

  const safeProvider =
    escapeSvgText(providerLabel);

  const safeDescription =
    escapeSvgText(description);

  const safeRecipient =
    escapeSvgText(recipient);

  const safeDate =
    escapeSvgText(dateText);

  const safeStatus =
    escapeSvgText(statusText);

  const providerBg =
    network?.bg ?? '#E8C76A';

  const providerFg =
    network?.fg ?? '#111111';

  let descriptionFontSize = 112;

  if (description.length > 12) {
    descriptionFontSize = 92;
  }

  if (description.length > 18) {
    descriptionFontSize = 74;
  }

  if (description.length > 25) {
    descriptionFontSize = 62;
  }

  let descriptionMarkup = '';

  if (description.length <= 25) {
    descriptionMarkup = `
      <text
        x="450"
        y="425"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${descriptionFontSize}"
        font-weight="800"
        letter-spacing="-3"
        fill="#B98525"
      >
        ${safeDescription}
      </text>
    `;
  } else {
    const words = description.split(/\s+/);

    let line1 = '';
    let line2 = '';

    for (const word of words) {
      const test = `${line1} ${word}`.trim();

      if (
        test.length <=
        Math.ceil(description.length / 2)
      ) {
        line1 = test;
      } else {
        line2 = `${line2} ${word}`.trim();
      }
    }

    descriptionMarkup = `
      <text
        x="450"
        y="400"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="64"
        font-weight="800"
        fill="#B98525"
      >
        ${escapeSvgText(line1)}
      </text>

      <text
        x="450"
        y="465"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="64"
        font-weight="800"
        fill="#B98525"
      >
        ${escapeSvgText(line2)}
      </text>
    `;
  }

  const statusColor =
    receipt.status === 'success'
      ? '#16803C'
      : receipt.status === 'pending'
        ? '#A76500'
        : '#C62828';

  const statusBg =
    receipt.status === 'success'
      ? '#F4FDF6'
      : receipt.status === 'pending'
        ? '#FFF9EA'
        : '#FFF3F3';

  const statusBorder =
    receipt.status === 'success'
      ? '#B7E8C3'
      : receipt.status === 'pending'
        ? '#F3D58A'
        : '#F1BABA';

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >

      <defs>

        <linearGradient
          id="paper"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="#FFFFFF"
          />

          <stop
            offset="100%"
            stop-color="#FAFAFA"
          />
        </linearGradient>

        <radialGradient
          id="centerGlow"
          cx="50%"
          cy="48%"
          r="55%"
        >
          <stop
            offset="0%"
            stop-color="#FFF9E8"
          />

          <stop
            offset="100%"
            stop-color="#F5F0DF"
          />
        </radialGradient>

        <linearGradient
          id="gold"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="#FFF4B5"
          />

          <stop
            offset="28%"
            stop-color="#D8AF4A"
          />

          <stop
            offset="55%"
            stop-color="#FFF0A0"
          />

          <stop
            offset="100%"
            stop-color="#A97B24"
          />
        </linearGradient>

        <linearGradient
          id="darkButton"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="#263B5D"
          />

          <stop
            offset="100%"
            stop-color="#07162D"
          />
        </linearGradient>

        <filter
          id="shadow"
          x="-30%"
          y="-30%"
          width="160%"
          height="170%"
        >
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="10"
            flood-color="#000000"
            flood-opacity="0.22"
          />
        </filter>

        <filter
          id="smallShadow"
          x="-30%"
          y="-30%"
          width="160%"
          height="170%"
        >
          <feDropShadow
            dx="0"
            dy="4"
            stdDeviation="5"
            flood-color="#000000"
            flood-opacity="0.22"
          />
        </filter>

        <pattern
          id="pattern"
          width="70"
          height="70"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path
            d="M0 35 L35 0 M35 70 L70 35"
            stroke="#D5D5D5"
            stroke-width="2"
            fill="none"
            opacity="0.32"
          />
        </pattern>

      </defs>

      <rect
        x="0"
        y="0"
        width="${width}"
        height="${height}"
        rx="30"
        fill="url(#paper)"
      />

      <rect
        x="5"
        y="5"
        width="${width - 10}"
        height="${height - 10}"
        rx="38"
        fill="none"
        stroke="url(#gold)"
        stroke-width="7"
      />

      <circle
        cx="450"
        cy="410"
        r="330"
        fill="url(#pattern)"
        opacity="0.65"
      />

      <circle
        cx="450"
        cy="500"
        r="315"
        fill="url(#centerGlow)"
      />

      <circle
        cx="450"
        cy="137"
        r="85"
        fill="#000000"
        opacity="0.13"
        filter="url(#smallShadow)"
      />

      <circle
        cx="450"
        cy="132"
        r="82"
        fill="url(#gold)"
        stroke="#9D7628"
        stroke-width="3"
      />

      <circle
        cx="450"
        cy="132"
        r="59"
        fill="${providerBg}"
        stroke="#222222"
        stroke-width="4"
      />

      <text
        x="450"
        y="147"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${
          network?.fontSize
            ? network.fontSize * 3
            : 36
        }"
        font-weight="900"
        fill="${providerFg}"
      >
        ${safeProvider}
      </text>

      <text
        x="450"
        y="290"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="47"
        font-weight="500"
        letter-spacing="1"
        fill="#C9A24A"
      >
        ${safeProvider}
      </text>

      ${descriptionMarkup}

      <g filter="url(#smallShadow)">
        <rect
          x="307"
          y="460"
          width="286"
          height="110"
          rx="55"
          fill="url(#darkButton)"
          stroke="#A98032"
          stroke-width="5"
        />

        <rect
          x="321"
          y="473"
          width="258"
          height="21"
          rx="11"
          fill="#FFFFFF"
          opacity="0.15"
        />
      </g>

      <text
        x="450"
        y="532"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="43"
        font-weight="700"
        fill="#F4D67D"
      >
        ${safeStatus}
      </text>

      <line
        x1="60"
        y1="635"
        x2="840"
        y2="635"
        stroke="#B08A39"
        stroke-width="4"
      />

      <text
        x="61"
        y="725"
        font-family="Arial, Helvetica, sans-serif"
        font-size="39"
        font-weight="400"
        fill="#6C737F"
      >
        Recipient
      </text>

      <text
        x="839"
        y="725"
        text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="38"
        font-weight="800"
        fill="#07162D"
      >
        ${safeRecipient}
      </text>

      <text
        x="61"
        y="805"
        font-family="Arial, Helvetica, sans-serif"
        font-size="38"
        font-weight="400"
        fill="#6C737F"
      >
        Description
      </text>

      <text
        x="839"
        y="805"
        text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="38"
        font-weight="800"
        fill="#07162D"
      >
        ${safeDescription}
      </text>

      <text
        x="61"
        y="885"
        font-family="Arial, Helvetica, sans-serif"
        font-size="38"
        font-weight="400"
        fill="#6C737F"
      >
        Date
      </text>

      <text
        x="839"
        y="885"
        text-anchor="end"
        font-family="Arial, Helvetica, sans-serif"
        font-size="35"
        font-weight="800"
        fill="#07162D"
      >
        ${safeDate}
      </text>

      <circle
        cx="820"
        cy="42"
        r="5"
        fill="${statusColor}"
        opacity="0"
      />

      <rect
        x="0"
        y="0"
        width="1"
        height="1"
        fill="${statusBg}"
        opacity="0"
      />

      <rect
        x="0"
        y="0"
        width="1"
        height="1"
        fill="${statusBorder}"
        opacity="0"
      />

    </svg>
  `;
}

async function createWhatsAppReceiptImage(
  receipt: ReceiptData,
): Promise<File> {
  const svg =
    createWhatsAppReceiptSvg(
      receipt,
    );

  const svgBlob =
    new Blob(
      [svg],
      {
        type: 'image/svg+xml;charset=utf-8',
      },
    );

  const objectUrl =
    URL.createObjectURL(
      svgBlob,
    );

  try {
    const image =
      new Image();

    image.decoding = 'async';
    image.src = objectUrl;

    await new Promise<void>(
      (resolve, reject) => {
        image.onload =
          () => resolve();

        image.onerror =
          () =>
            reject(
              new Error(
                'Unable to render receipt image.',
              ),
            );
      },
    );

    const scale = 2;

    const canvas =
      document.createElement(
        'canvas',
      );

    canvas.width = 900 * scale;
    canvas.height = 975 * scale;

    const context =
      canvas.getContext(
        '2d',
      );

    if (!context) {
      throw new Error(
        'Canvas is not supported.',
      );
    }

    context.imageSmoothingEnabled =
      true;

    context.imageSmoothingQuality =
      'high';

    context.scale(
      scale,
      scale,
    );

    context.drawImage(
      image,
      0,
      0,
      900,
      975,
    );

    const pngBlob =
      await new Promise<Blob>(
        (resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(
                  new Error(
                    'Unable to create PNG.',
                  ),
                );
              }
            },
            'image/png',
            1,
          );
        },
      );

    return new File(
      [pngBlob],
      `GY-DATA-Receipt-${Date.now()}.png`,
      {
        type: 'image/png',
      },
    );
  } finally {
    URL.revokeObjectURL(
      objectUrl,
    );
  }
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
        const imageFile =
          await createWhatsAppReceiptImage(
            receipt,
          );

        if (
          navigator.share &&
          navigator.canShare
        ) {
          const shareData: ShareData = {
            files: [imageFile],
            title: 'GY DATA Receipt',
          };

          if (
            navigator.canShare(
              shareData,
            )
          ) {
            await navigator.share(
              shareData,
            );

            return;
          }
        }

        toast.error(
          'This device does not support sharing receipt images.',
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          'Receipt image sharing failed:',
          error,
        );

        toast.error(
          'Unable to share receipt image.',
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
            onClick={shareReceipt}
            disabled={isSharing}
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
              ? 'Preparing Image...'
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
