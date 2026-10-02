import React, {
  useMemo,
  useState,
} from 'react';

import {
  Share2,
} from 'lucide-react';

import {
  toast,
} from 'sonner';

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
  createdAt?: string;

  status:
    | 'success'
    | 'pending'
    | 'failed';

  phone?: string;
  recipient?: string;

  paymentMethod?: string;

  cashbackAmount?: number;
  cashback?: number;

  txnId?: string;
  reference?: string;
  providerReference?: string;
  id?: string;

  metadata?: Record<string, unknown>;
}

const RECEIPT_WIDTH = 900;
const RECEIPT_HEIGHT = 1180;

function text(
  value: unknown,
): string {
  return String(
    value ?? '',
  ).trim();
}

function escapeXml(
  value: unknown,
): string {
  return text(value)
    .replace(
      /&/g,
      '&amp;',
    )
    .replace(
      /</g,
      '&lt;',
    )
    .replace(
      />/g,
      '&gt;',
    )
    .replace(
      /"/g,
      '&quot;',
    )
    .replace(
      /'/g,
      '&apos;',
    );
}

function getMetadata(
  receipt: ReceiptData,
): Record<string, unknown> {
  return (
    receipt.metadata &&
    typeof receipt.metadata === 'object'
      ? receipt.metadata
      : {}
  );
}

function metadataText(
  receipt: ReceiptData,
  keys: string[],
): string {
  const metadata =
    getMetadata(receipt);

  for (const key of keys) {
    const value =
      text(metadata[key]);

    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeNetwork(
  value: string,
): string {
  const network =
    value
      .trim()
      .toLowerCase();

  if (
    network === 'mtn' ||
    network === 'mtn nigeria'
  ) {
    return 'MTN';
  }

  if (
    network === 'glo' ||
    network === 'globacom'
  ) {
    return 'GLO';
  }

  if (
    network === 'airtel' ||
    network === 'airtel nigeria'
  ) {
    return 'AIRTEL';
  }

  if (
    network === '9mobile' ||
    network === '9 mobile' ||
    network === 'etisalat'
  ) {
    return '9MOBILE';
  }

  return value
    .trim()
    .toUpperCase();
}

function getNetwork(
  receipt: ReceiptData,
): string {
  const metadataNetwork =
    metadataText(
      receipt,
      [
        'network',
        'networkName',
        'network_name',
        'operator',
      ],
    );

  const provider =
    text(
      receipt.provider,
    );

  const service =
    text(
      receipt.service,
    );

  const candidates = [
    metadataNetwork,
    provider,
    service,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (
      /^(gy\s*data|smeapi|sme\s*api|data)$/i.test(
        candidate,
      )
    ) {
      continue;
    }

    const normalized =
      normalizeNetwork(
        candidate,
      );

    if (
      [
        'MTN',
        'GLO',
        'AIRTEL',
        '9MOBILE',
      ].includes(
        normalized,
      )
    ) {
      return normalized;
    }
  }

  return 'MTN';
}

function getNetworkTheme(
  network: string,
) {
  switch (
    normalizeNetwork(network)
  ) {
    case 'GLO':
      return {
        main: '#009A44',
        light: '#E8F8EE',
        pale: '#F2FBF5',
        text: '#007A37',
        logoText: '#FFFFFF',
      };

    case 'AIRTEL':
      return {
        main: '#E30613',
        light: '#FFF0F1',
        pale: '#FFF7F7',
        text: '#C9000B',
        logoText: '#FFFFFF',
      };

    case '9MOBILE':
      return {
        main: '#00843D',
        light: '#EAF8F1',
        pale: '#F4FBF7',
        text: '#006B31',
        logoText: '#FFFFFF',
      };

    case 'MTN':
    default:
      return {
        main: '#FFCC00',
        light: '#FFF9D9',
        pale: '#FFFDF0',
        text: '#111827',
        logoText: '#111827',
      };
  }
}

function getRecipient(
  receipt: ReceiptData,
): string {
  return (
    metadataText(
      receipt,
      [
        'phone',
        'recipientPhone',
        'recipient_phone',
        'mobile',
        'phoneNumber',
        'phone_number',
      ],
    ) ||
    text(receipt.phone) ||
    text(receipt.recipient) ||
    '—'
  );
}

function getPlan(
  receipt: ReceiptData,
): string {
  return (
    metadataText(
      receipt,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'data_plan_name',
        'plan',
        'packageName',
        'package_name',
      ],
    ) ||
    text(receipt.description) ||
    'Data Purchase'
  );
}

function parseDate(
  value: unknown,
): Date | null {
  const raw =
    text(value);

  if (!raw) {
    return null;
  }

  /*
   * ISO / normal browser date.
   */
  const direct =
    new Date(raw);

  if (
    !Number.isNaN(
      direct.getTime(),
    )
  ) {
    return direct;
  }

  /*
   * DD/MM/YYYY
   */
  const slash =
    raw.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );

  if (slash) {
    const day =
      Number(slash[1]);

    const month =
      Number(slash[2]);

    const year =
      Number(slash[3]);

    const hour =
      Number(slash[4] ?? 0);

    const minute =
      Number(slash[5] ?? 0);

    const second =
      Number(slash[6] ?? 0);

    const result =
      new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
        0,
      );

    if (
      !Number.isNaN(
        result.getTime(),
      )
    ) {
      return result;
    }
  }

  return null;
}

function getTransactionDate(
  receipt: ReceiptData,
): Date {
  const metadata =
    getMetadata(receipt);

  const candidates: unknown[] = [
    receipt.createdAt,

    metadata.createdAt,
    metadata.created_at,

    metadata.timestamp,
    metadata.transactionDate,
    metadata.transaction_date,

    metadata.dateTime,
    metadata.datetime,

    metadata.date,

    receipt.date,
  ];

  for (
    const candidate of candidates
  ) {
    const parsed =
      parseDate(candidate);

    if (parsed) {
      /*
       * If createdAt/date already contains a
       * complete time, keep it.
       */
      return parsed;
    }
  }

  /*
   * If the API returned separate date/time,
   * combine them.
   */
  const dateText =
    text(receipt.date);

  const timeText =
    text(receipt.time);

  if (
    dateText ||
    timeText
  ) {
    const combined =
      parseDate(
        `${dateText} ${timeText}`.trim(),
      );

    if (combined) {
      return combined;
    }

    const match =
      dateText.match(
        /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
      );

    if (match) {
      const result =
        new Date(
          Number(match[3]),
          Number(match[2]) - 1,
          Number(match[1]),
          0,
          0,
          0,
          0,
        );

      const time =
        timeText.match(
          /^(\d{1,2}):(\d{2})(?::(\d{2}))?/,
        );

      if (time) {
        result.setHours(
          Number(time[1]),
          Number(time[2]),
          Number(time[3] ?? 0),
          0,
        );
      }

      if (
        !Number.isNaN(
          result.getTime(),
        )
      ) {
        return result;
      }
    }
  }

  /*
   * Last fallback.
   *
   * This prevents the receipt from ever showing
   * an empty "Date" field when the transaction
   * has already succeeded.
   */
  return new Date();
}

function formatReceiptDate(
  receipt: ReceiptData,
): string {
  const date =
    getTransactionDate(
      receipt,
    );

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

function getStatusText(
  receipt: ReceiptData,
): string {
  const status =
    text(
      receipt.status,
    ).toLowerCase();

  if (
    status === 'pending' ||
    status === 'processing' ||
    status === 'queued'
  ) {
    return 'Pending';
  }

  if (
    status === 'failed' ||
    status === 'failure' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'error'
  ) {
    return 'Failed';
  }

  return 'Success';
}

function fitFontSize(
  value: string,
  max: number,
  normal: number,
  minimum: number,
): number {
  if (
    value.length <= max
  ) {
    return normal;
  }

  const calculated =
    normal -
    (
      value.length - max
    ) *
      3;

  return Math.max(
    minimum,
    calculated,
  );
}

function buildReceiptSvg(
  receipt: ReceiptData,
): string {
  const network =
    getNetwork(receipt);

  const theme =
    getNetworkTheme(
      network,
    );

  const recipient =
    getRecipient(
      receipt,
    );

  const plan =
    getPlan(
      receipt,
    );

  const date =
    formatReceiptDate(
      receipt,
    );

  const status =
    getStatusText(
      receipt,
    );

  const planFont =
    fitFontSize(
      plan,
      7,
      78,
      50,
    );

  const recipientFont =
    fitFontSize(
      recipient,
      13,
      38,
      28,
    );

  const dateFont =
    fitFontSize(
      date,
      23,
      34,
      25,
    );

  const isGlo =
    network === 'GLO';

  const isMtn =
    network === 'MTN';

  const isAirtel =
    network === 'AIRTEL';

  const is9mobile =
    network === '9MOBILE';

  const logoFontSize =
    isGlo
      ? 48
      : isAirtel
        ? 31
        : is9mobile
          ? 26
          : 34;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${RECEIPT_WIDTH}"
  height="${RECEIPT_HEIGHT}"
  viewBox="0 0 ${RECEIPT_WIDTH} ${RECEIPT_HEIGHT}"
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
        offset="0"
        stop-color="#ffffff"
      />
      <stop
        offset="1"
        stop-color="#f8faf9"
      />
    </linearGradient>

    <radialGradient
      id="greenGlow"
      cx="50%"
      cy="50%"
      r="50%"
    >
      <stop
        offset="0"
        stop-color="${theme.main}"
        stop-opacity="0.12"
      />
      <stop
        offset="0.55"
        stop-color="${theme.main}"
        stop-opacity="0.055"
      />
      <stop
        offset="1"
        stop-color="${theme.main}"
        stop-opacity="0"
      />
    </radialGradient>

    <filter
      id="shadow"
      x="-30%"
      y="-30%"
      width="160%"
      height="170%"
    >
      <feDropShadow
        dx="0"
        dy="14"
        stdDeviation="18"
        flood-color="#0B1F4E"
        flood-opacity="0.12"
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
        dy="7"
        stdDeviation="8"
        flood-color="#0B1F4E"
        flood-opacity="0.15"
      />
    </filter>

    <clipPath id="round">
      <rect
        x="26"
        y="26"
        width="848"
        height="1128"
        rx="44"
      />
    </clipPath>

  </defs>

  <!-- WHITE RECEIPT -->
  <rect
    x="0"
    y="0"
    width="${RECEIPT_WIDTH}"
    height="${RECEIPT_HEIGHT}"
    rx="48"
    fill="url(#paper)"
  />

  <!-- VERY LIGHT BORDER -->
  <rect
    x="5"
    y="5"
    width="890"
    height="1170"
    rx="43"
    fill="none"
    stroke="#E5E7EB"
    stroke-width="5"
  />

  <!-- SOFT NETWORK GLOW -->
  <ellipse
    cx="450"
    cy="665"
    rx="370"
    ry="330"
    fill="url(#greenGlow)"
  />

  <!-- SUBTLE WATERMARK -->
  <g
    opacity="0.045"
    transform="translate(450 660)"
  >
    <circle
      cx="0"
      cy="0"
      r="250"
      fill="${theme.main}"
    />

    <circle
      cx="0"
      cy="0"
      r="190"
      fill="none"
      stroke="${theme.main}"
      stroke-width="34"
    />

    <text
      x="0"
      y="30"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="130"
      font-weight="900"
      fill="#ffffff"
    >${escapeXml(network)}</text>
  </g>

  <!-- NETWORK LOGO -->
  <g
    filter="url(#shadow)"
  >
    <circle
      cx="450"
      cy="130"
      r="74"
      fill="${theme.main}"
    />

    <circle
      cx="450"
      cy="130"
      r="66"
      fill="none"
      stroke="#ffffff"
      stroke-opacity="0.22"
      stroke-width="3"
    />

    <text
      x="450"
      y="146"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${logoFontSize}"
      font-weight="900"
      fill="${theme.logoText}"
    >${escapeXml(network.toLowerCase())}</text>
  </g>

  <!-- NETWORK NAME -->
  <text
    x="450"
    y="256"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="30"
    font-weight="500"
    fill="#9AA3AE"
    letter-spacing="0.5"
  >${escapeXml(network)}</text>

  <!-- PLAN -->
  <text
    x="450"
    y="397"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${planFont}"
    font-weight="900"
    fill="#111827"
  >${escapeXml(plan)}</text>

  <!-- SUCCESS PILL -->
  <g
    filter="url(#smallShadow)"
  >
    <rect
      x="330"
      y="440"
      width="240"
      height="72"
      rx="36"
      fill="#0B1F4E"
    />

    <circle
      cx="371"
      cy="476"
      r="12"
      fill="#22C55E"
    />

    <path
      d="M365 476 L370 481 L379 470"
      fill="none"
      stroke="#ffffff"
      stroke-width="5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <text
      x="460"
      y="488"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="27"
      font-weight="800"
      fill="#ffffff"
    >${escapeXml(status)}</text>
  </g>

  <!-- DIVIDER -->
  <line
    x1="76"
    y1="575"
    x2="824"
    y2="575"
    stroke="#E7EAED"
    stroke-width="2"
  />

  <!-- RECIPIENT -->
  <text
    x="76"
    y="662"
    font-family="Arial, Helvetica, sans-serif"
    font-size="31"
    font-weight="500"
    fill="#9AA3AE"
  >Recipient</text>

  <text
    x="824"
    y="662"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${recipientFont}"
    font-weight="800"
    fill="#111827"
  >${escapeXml(recipient)}</text>

  <!-- ROW DIVIDER -->
  <line
    x1="76"
    y1="700"
    x2="824"
    y2="700"
    stroke="#EEF0F2"
    stroke-width="2"
  />

  <!-- DESCRIPTION -->
  <text
    x="76"
    y="787"
    font-family="Arial, Helvetica, sans-serif"
    font-size="31"
    font-weight="500"
    fill="#9AA3AE"
  >Description</text>

  <text
    x="824"
    y="787"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${Math.max(
      25,
      Math.min(
        34,
        500 / Math.max(plan.length, 8),
      ),
    )}"
    font-weight="800"
    fill="#111827"
  >${escapeXml(plan)}</text>

  <!-- ROW DIVIDER -->
  <line
    x1="76"
    y1="825"
    x2="824"
    y2="825"
    stroke="#EEF0F2"
    stroke-width="2"
  />

  <!-- DATE -->
  <text
    x="76"
    y="912"
    font-family="Arial, Helvetica, sans-serif"
    font-size="31"
    font-weight="500"
    fill="#9AA3AE"
  >Date</text>

  <text
    x="824"
    y="912"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${dateFont}"
    font-weight="800"
    fill="#111827"
  >${escapeXml(date)}</text>

  <!-- BOTTOM DIVIDER -->
  <line
    x1="76"
    y1="950"
    x2="824"
    y2="950"
    stroke="#EEF0F2"
    stroke-width="2"
  />

  <!-- GY DATA -->
  <text
    x="450"
    y="1038"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="23"
    font-weight="700"
    fill="#C0C5CB"
    letter-spacing="1"
  >GY DATA</text>

  <text
    x="450"
    y="1075"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="18"
    font-weight="500"
    fill="#D0D4D8"
  >Transaction Receipt</text>

</svg>`;
}

function svgToJpegFile(
  svg: string,
): Promise<File> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const blob =
        new Blob(
          [svg],
          {
            type:
              'image/svg+xml;charset=utf-8',
          },
        );

      const url =
        URL.createObjectURL(
          blob,
        );

      const image =
        new Image();

      image.onload =
        () => {
          try {
            const canvas =
              document.createElement(
                'canvas',
              );

            canvas.width =
              RECEIPT_WIDTH;

            canvas.height =
              RECEIPT_HEIGHT;

            const context =
              canvas.getContext(
                '2d',
              );

            if (!context) {
              throw new Error(
                'Canvas is not available.',
              );
            }

            context.fillStyle =
              '#ffffff';

            context.fillRect(
              0,
              0,
              RECEIPT_WIDTH,
              RECEIPT_HEIGHT,
            );

            context.drawImage(
              image,
              0,
              0,
              RECEIPT_WIDTH,
              RECEIPT_HEIGHT,
            );

            canvas.toBlob(
              jpeg => {
                URL.revokeObjectURL(
                  url,
                );

                if (!jpeg) {
                  reject(
                    new Error(
                      'Unable to create receipt image.',
                    ),
                  );
                  return;
                }

                resolve(
                  new File(
                    [jpeg],
                    'gy-data-receipt.jpg',
                    {
                      type:
                        'image/jpeg',
                    },
                  ),
                );
              },
              'image/jpeg',
              0.96,
            );
          } catch (error) {
            URL.revokeObjectURL(
              url,
            );

            reject(error);
          }
        };

      image.onerror =
        () => {
          URL.revokeObjectURL(
            url,
          );

          reject(
            new Error(
              'Unable to render receipt image.',
            ),
          );
        };

      image.src = url;
    },
  );
}

function svgDataUrl(
  svg: string,
): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(svg)
  );
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

  const svg =
    useMemo(
      () =>
        buildReceiptSvg(
          receipt,
        ),
      [receipt],
    );

  const shareReceipt =
    async () => {
      if (isSharing) {
        return;
      }

      setIsSharing(true);

      try {
        const file =
          await svgToJpegFile(
            svg,
          );

        if (
          typeof navigator.share ===
            'function' &&
          typeof navigator.canShare ===
            'function' &&
          navigator.canShare({
            files: [file],
          })
        ) {
          await navigator.share({
            title:
              'GY DATA Receipt',
            text:
              'GY DATA Transaction Receipt',
            files: [file],
          });

          return;
        }

        if (
          typeof navigator.share ===
          'function'
        ) {
          await navigator.share({
            title:
              'GY DATA Receipt',
            text:
              'GY DATA Transaction Receipt',
            files: [file],
          });

          return;
        }

        toast.error(
          'This device cannot share the receipt as an image.',
        );
      } catch (error) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        console.error(
          'Receipt share failed:',
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
    <div className="mx-auto w-full max-w-[390px]">
      <div
        className="
          overflow-hidden
          rounded-[24px]
          border
          border-slate-200
          bg-white
          shadow-[0_18px_55px_rgba(11,31,78,0.14)]
        "
      >
        <img
          src={svgDataUrl(svg)}
          alt="GY DATA transaction receipt"
          className="block h-auto w-full"
          draggable={false}
        />
      </div>

      {showActions && (
        <div className="mx-auto mt-3 flex w-full gap-2">
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
              h-11
              flex-1
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-green-600
              text-[12px]
              font-extrabold
              text-white
              shadow-[0_7px_18px_rgba(22,163,74,0.20)]
              transition
              hover:bg-green-700
              disabled:opacity-60
            "
          >
            <Share2 className="h-4 w-4" />

            {isSharing
              ? 'Sharing...'
              : 'Share to WhatsApp'}
          </button>

          {onDone && (
            <button
              type="button"
              onClick={
                onDone
              }
              className="
                flex
                h-11
                flex-[0.75]
                items-center
                justify-center
                rounded-xl
                bg-[#0B1F4E]
                text-[12px]
                font-extrabold
                text-white
                shadow-[0_7px_18px_rgba(11,31,78,0.20)]
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
