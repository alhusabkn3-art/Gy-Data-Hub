import React from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';

// ── Receipt data ──────────────────────────────────────────────────────────────
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
  status: 'success' | 'pending' | 'failed';

  /*
   * Phone number shown on the receipt.
   *
   * This is intentionally optional because some older transaction records
   * may not contain a phone number.
   */
  phone?: string;

  paymentMethod?: string;

  /** Cashback credited to wallet, when applicable. */
  cashbackAmount?: number;
}

// ── Network brand configs ─────────────────────────────────────────────────────
const NETWORK: Record<
  string,
  {
    bg: string;
    fg: string;
    label: string;
    fontSize: number;
  }
> = {
  MTN: {
    bg: '#FFCC00',
    fg: '#000000',
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
    fontSize: 16,
  },

  '9mobile': {
    bg: '#00472B',
    fg: '#FFFFFF',
    label: '9mobile',
    fontSize: 11,
  },
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  success: {
    bg: '#F0FDF4',
    border: '#BBF7D0',
    text: '#15803D',
    accentFrom: '#16A34A',
    accentTo: '#22C55E',
    label: 'SUCCESSFUL',
    shareEmoji: '✓',
    icon: (
      <CheckCircle2
        style={{
          width: 17,
          height: 17,
          color: '#16A34A',
          flexShrink: 0,
        }}
      />
    ),
  },

  pending: {
    bg: '#FFFBEB',
    border: '#FDE68A',
    text: '#B45309',
    accentFrom: '#D97706',
    accentTo: '#F59E0B',
    label: 'PENDING',
    shareEmoji: '⏳',
    icon: (
      <Clock
        style={{
          width: 17,
          height: 17,
          color: '#D97706',
          flexShrink: 0,
        }}
      />
    ),
  },

  failed: {
    bg: '#FEF2F2',
    border: '#FECACA',
    text: '#DC2626',
    accentFrom: '#DC2626',
    accentTo: '#EF4444',
    label: 'FAILED',
    shareEmoji: '✗',
    icon: (
      <XCircle
        style={{
          width: 17,
          height: 17,
          color: '#DC2626',
          flexShrink: 0,
        }}
      />
    ),
  },
} as const;

// ── Service icon fallbacks ────────────────────────────────────────────────────
function ServiceBadge({
  type,
  service,
}: {
  type: string;
  service?: string;
}) {
  const cfg: Record<
    string,
    {
      bg: string;
      color: string;
      Icon: typeof Wifi;
    }
  > = {
    electricity: {
      bg: '#FFFBEB',
      color: '#F59E0B',
      Icon: Zap,
    },

    cable: {
      bg: '#F5F3FF',
      color: '#8B5CF6',
      Icon: Tv,
    },

    exam: {
      bg: '#F0FDFA',
      color: '#14B8A6',
      Icon: BookOpen,
    },

    wallet_fund: {
      bg: '#F0FDF4',
      color: '#10B981',
      Icon: ArrowDownLeft,
    },

    cashback: {
      bg: '#F0FDF4',
      color: '#16A34A',
      Icon: Gift,
    },

    betting: {
      bg: '#FFF1F2',
      color: '#EF4444',
      Icon: Target,
    },

    data: {
      bg: '#EFF6FF',
      color: '#3B82F6',
      Icon: Wifi,
    },
  };

  const key =
    service === 'Cashback'
      ? 'cashback'
      : type;

  const {
    bg,
    color,
    Icon,
  } = cfg[key] ?? cfg.data;

  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        background: bg,
        border: '1.5px solid rgba(0,0,0,0.06)',
        boxShadow:
          '0 4px 16px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon
        style={{
          width: 28,
          height: 28,
          color,
        }}
      />
    </div>
  );
}

// ── Network logo badge ───────────────────────────────────────────────────────
function ProviderBadge({
  provider,
  type,
  service,
}: {
  provider: string;
  type: string;
  service?: string;
}) {
  const normalizedProvider =
    String(provider ?? '').trim();

  const net =
    NETWORK[normalizedProvider] ??
    NETWORK[
      normalizedProvider.charAt(0).toUpperCase() +
        normalizedProvider.slice(1).toLowerCase()
    ];

  if (
    net &&
    service !== 'Cashback'
  ) {
    return (
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: net.bg,
          color: net.fg,
          boxShadow:
            `0 6px 20px ${net.bg}88`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: net.fontSize,
          fontFamily:
            'system-ui, -apple-system, sans-serif',
          letterSpacing:
            net.label === 'airtel'
              ? '0.02em'
              : '-0.3px',
          userSelect: 'none',
        }}
      >
        {net.label}
      </div>
    );
  }

  return (
    <ServiceBadge
      type={type}
      service={service}
    />
  );
}

// ── Purchase value extractor ──────────────────────────────────────────────────
function purchaseValue(
  type: string,
  desc: string,
  amount: number,
): string {
  if (type === 'data') {
    const match = desc.match(
      /(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i,
    );

    if (match) {
      return `${match[1]}${match[2].toUpperCase()}`;
    }

    return 'Data Bundle';
  }

  if (type === 'airtime') {
    return `₦${amount.toLocaleString()}`;
  }

  if (type === 'electricity') {
    return 'Prepaid Token';
  }

  if (type === 'cable') {
    const words = desc
      .replace(/^[^\s]+ /, '')
      .split(' ');

    return (
      words.join(' ') ||
      'Subscription'
    );
  }

  if (type === 'exam') {
    const match = desc.match(
      /JAMB|WAEC|NECO|GCE/i,
    );

    return match
      ? `${match[0].toUpperCase()} PIN`
      : 'Exam PIN';
  }

  if (type === 'wallet_fund') {
    return `₦${amount.toLocaleString()}`;
  }

  if (type === 'betting') {
    return 'Wallet Fund';
  }

  return desc;
}

// ── Phone formatter ───────────────────────────────────────────────────────────
function formatPhone(
  phone?: string,
): string {
  const value =
    String(phone ?? '').trim();

  if (!value) {
    return '';
  }

  return value;
}

// ── Receipt share text fallback ───────────────────────────────────────────────
function buildShareText(
  receipt: ReceiptData,
  value: string,
  statusLabel: string,
): string {
  const lines = [
    'GY DATA',
    '──────────────',
    `${receipt.provider} • ${receipt.service}`,
    value,
    receipt.phone
      ? `Phone: ${receipt.phone}`
      : '',
    `Amount: ₦${receipt.amount.toLocaleString()}`,
    `Date: ${receipt.date}${
      receipt.time
        ? `, ${receipt.time}`
        : ''
    }`,
    `${statusLabel}`,
  ];

  if (
    receipt.cashbackAmount != null &&
    receipt.cashbackAmount > 0
  ) {
    lines.push(
      `Cashback: +₦${receipt.cashbackAmount.toLocaleString()}`,
    );
  }

  return lines
    .filter(Boolean)
    .join('\n');
}

// ── Image receipt generator ───────────────────────────────────────────────────
//
// This does not require html2canvas or another package.
// The receipt image is generated directly as SVG and converted to PNG.
//
// That keeps this component self-contained and avoids adding a new dependency
// that could affect the existing build.
async function createReceiptImage(
  receipt: ReceiptData,
): Promise<File> {
  const width = 900;

  const phone = formatPhone(
    receipt.phone,
  );

  const value = purchaseValue(
    receipt.type,
    receipt.description,
    receipt.amount,
  );

  const status =
    STATUS[receipt.status];

  const serviceLabel =
    receipt.type === 'wallet_fund'
      ? 'WALLET FUNDED'
      : receipt.type === 'data'
        ? `${value} DATA`
        : receipt.type === 'airtime'
          ? 'AIRTIME'
          : receipt.service.toUpperCase();

  const cashback =
    receipt.cashbackAmount != null &&
    receipt.cashbackAmount > 0
      ? receipt.cashbackAmount
      : 0;

  const rows: string[] = [];

  rows.push(`
    <text
      x="450"
      y="535"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="30"
      font-weight="700"
      fill="#7A95B8"
    >
      Amount
    </text>

    <text
      x="450"
      y="575"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="38"
      font-weight="800"
      fill="#0B1F4E"
    >
      ₦${escapeSvg(
        receipt.amount.toLocaleString(),
      )}
    </text>
  `);

  if (phone) {
    rows.push(`
      <text
        x="450"
        y="650"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28"
        font-weight="600"
        fill="#7A95B8"
      >
        Phone Number
      </text>

      <text
        x="450"
        y="690"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="34"
        font-weight="800"
        fill="#0B1F4E"
      >
        ${escapeSvg(phone)}
      </text>
    `);
  }

  const dateY =
    phone ? 765 : 650;

  rows.push(`
    <text
      x="450"
      y="${dateY}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="28"
      font-weight="600"
      fill="#7A95B8"
    >
      Date
    </text>

    <text
      x="450"
      y="${dateY + 40}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="28"
      font-weight="700"
      fill="#0B1F4E"
    >
      ${escapeSvg(
        `${receipt.date}${
          receipt.time
            ? `, ${receipt.time}`
            : ''
        }`,
      )}
    </text>
  `);

  let nextY =
    dateY + 105;

  if (cashback > 0) {
    rows.push(`
      <rect
        x="105"
        y="${nextY}"
        width="690"
        height="82"
        rx="18"
        fill="#F0FDF4"
        stroke="#BBF7D0"
        stroke-width="2"
      />

      <text
        x="450"
        y="${nextY + 34}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="24"
        font-weight="700"
        fill="#15803D"
      >
        Cashback Credited
      </text>

      <text
        x="450"
        y="${nextY + 65}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28"
        font-weight="800"
        fill="#15803D"
      >
        +₦${escapeSvg(
          cashback.toLocaleString(),
        )}
      </text>
    `);

    nextY += 115;
  }

  const height =
    Math.max(
      1080,
      nextY + 185,
    );

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <rect
        width="${width}"
        height="${height}"
        fill="#F5F9FD"
      />

      <rect
        x="55"
        y="45"
        width="790"
        height="${height - 90}"
        rx="38"
        fill="#FFFFFF"
        stroke="#E3EEF8"
        stroke-width="3"
      />

      <rect
        x="55"
        y="45"
        width="790"
        height="12"
        rx="6"
        fill="${status.accentFrom}"
      />

      <text
        x="450"
        y="125"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="34"
        font-weight="900"
        fill="#0B1F4E"
      >
        GY DATA
      </text>

      <text
        x="450"
        y="165"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="19"
        font-weight="600"
        fill="#9DB4CC"
        letter-spacing="3"
      >
        RECEIPT
      </text>

      <rect
        x="320"
        y="205"
        width="260"
        height="75"
        rx="22"
        fill="#EFF6FF"
      />

      <text
        x="450"
        y="254"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28"
        font-weight="900"
        fill="#2563EB"
      >
        ${escapeSvg(
          receipt.provider,
        )}
      </text>

      <text
        x="450"
        y="325"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="22"
        font-weight="700"
        fill="#9DB4CC"
      >
        ${escapeSvg(serviceLabel)}
      </text>

      <text
        x="450"
        y="405"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${
          receipt.type === 'data'
            ? 64
            : 48
        }"
        font-weight="900"
        fill="#0B1F4E"
      >
        ${escapeSvg(value)}
      </text>

      <line
        x1="120"
        y1="465"
        x2="780"
        y2="465"
        stroke="#D8E8F5"
        stroke-width="3"
        stroke-dasharray="10 10"
      />

      ${rows.join('')}

      <rect
        x="190"
        y="${nextY}"
        width="520"
        height="76"
        rx="20"
        fill="${status.bg}"
        stroke="${status.border}"
        stroke-width="3"
      />

      <text
        x="450"
        y="${nextY + 48}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28"
        font-weight="900"
        fill="${status.text}"
      >
        ${escapeSvg(
          status.label,
        )}
      </text>

      <text
        x="450"
        y="${height - 80}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="18"
        font-weight="600"
        fill="#A8BAD0"
      >
        GY DATA • endless joy
      </text>
    </svg>
  `;

  const svgBlob =
    new Blob(
      [svg],
      {
        type: 'image/svg+xml;charset=utf-8',
      },
    );

  const svgUrl =
    URL.createObjectURL(
      svgBlob,
    );

  try {
    const image =
      await loadImage(svgUrl);

    const canvas =
      document.createElement(
        'canvas',
      );

    canvas.width = width;
    canvas.height = height;

    const context =
      canvas.getContext('2d');

    if (!context) {
      throw new Error(
        'Unable to create receipt image.',
      );
    }

    context.fillStyle =
      '#F5F9FD';

    context.fillRect(
      0,
      0,
      width,
      height,
    );

    context.drawImage(
      image,
      0,
      0,
      width,
      height,
    );

    const blob =
      await canvasToBlob(
        canvas,
      );

    return new File(
      [blob],
      'gy-data-receipt.png',
      {
        type: 'image/png',
      },
    );
  } finally {
    URL.revokeObjectURL(
      svgUrl,
    );
  }
}

// ── SVG escaping ──────────────────────────────────────────────────────────────
function escapeSvg(
  value: string,
): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Image loader ──────────────────────────────────────────────────────────────
function loadImage(
  src: string,
): Promise<HTMLImageElement> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const image =
        new Image();

      image.onload = () =>
        resolve(image);

      image.onerror = () =>
        reject(
          new Error(
            'Unable to render receipt image.',
          ),
        );

      image.src = src;
    },
  );
}

// ── Canvas → Blob ─────────────────────────────────────────────────────────────
function canvasToBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error(
                'Unable to create receipt PNG.',
              ),
            );
          }
        },
        'image/png',
        1,
      );
    },
  );
}

// ── Dashed receipt divider ────────────────────────────────────────────────────
function Divider() {
  return (
    <div
      style={{
        borderTop:
          '1.5px dashed #D8E8F5',
        margin: '0',
      }}
    />
  );
}

// ── Receipt row ───────────────────────────────────────────────────────────────
function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent:
          'space-between',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: '#7A95B8',
          fontWeight: 500,
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize: 13,
          color: '#0B1F4E',
          fontWeight: 700,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  receipt: ReceiptData;
  onDone?: () => void;
  doneLabel?: string;
  showActions?: boolean;
}

export default function TransactionReceipt({
  receipt,
  onDone,
  doneLabel = 'Done',
  showActions = true,
}: Props) {
  const sc =
    STATUS[receipt.status];

  const value =
    purchaseValue(
      receipt.type,
      receipt.description,
      receipt.amount,
    );

  const phone =
    formatPhone(
      receipt.phone,
    );

  const [isSharing, setIsSharing] =
    React.useState(false);

  // ── Share receipt as image ────────────────────────────────────────────────
  const handleShare = async () => {
    if (isSharing) {
      return;
    }

    setIsSharing(true);

    try {
      const image =
        await createReceiptImage(
          receipt,
        );

      const shareText =
        buildShareText(
          receipt,
          value,
          sc.label,
        );

      const navigatorWithShare =
        navigator as Navigator & {
          canShare?: (
            data?: ShareData,
          ) => boolean;
        };

      const canShareFile =
        typeof navigator.share ===
          'function' &&
        typeof navigatorWithShare.canShare ===
          'function' &&
        navigatorWithShare.canShare({
          files: [image],
        });

      if (canShareFile) {
        await navigator.share({
          title: 'GY DATA Receipt',
          text: shareText,
          files: [image],
        });

        return;
      }

      /*
       * Some browsers expose navigator.share but don't support file sharing.
       * In that case, try normal text sharing before falling back to clipboard.
       */
      if (
        typeof navigator.share ===
        'function'
      ) {
        await navigator.share({
          title: 'GY DATA Receipt',
          text: shareText,
        });

        return;
      }

      /*
       * Desktop/browser fallback:
       * open the generated PNG so the user can save/share it manually.
       */
      const imageUrl =
        URL.createObjectURL(
          image,
        );

      const opened =
        window.open(
          imageUrl,
          '_blank',
          'noopener,noreferrer',
        );

      if (!opened) {
        await navigator.clipboard?.writeText(
          shareText,
        );

        toast.success(
          'Receipt image created. Sharing is not available in this browser.',
        );
      } else {
        toast.success(
          'Receipt image opened.',
        );

        window.setTimeout(
          () => {
            URL.revokeObjectURL(
              imageUrl,
            );
          },
          60_000,
        );
      }
    } catch (error) {
      /*
       * A user cancelling the native share sheet is not an error.
       */
      if (
        error instanceof DOMException &&
        error.name ===
          'AbortError'
      ) {
        return;
      }

      console.error(
        'Receipt sharing failed:',
        error,
      );

      toast.error(
        'Unable to share receipt. Please try again.',
      );
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div>
      {/* ── Receipt card ─────────────────────────────────────────────── */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 24,
          border:
            '1px solid #E3EEF8',
          boxShadow:
            '0 8px 32px rgba(11,31,78,0.10), 0 2px 8px rgba(11,31,78,0.05)',
          overflow: 'hidden',
        }}
      >
        {/* Status accent bar */}
        <div
          style={{
            height: 4,
            background:
              `linear-gradient(90deg, ${sc.accentFrom}, ${sc.accentTo})`,
          }}
        />

        <div
          style={{
            padding:
              '20px 22px 22px',
          }}
        >
          {/* Brand header */}
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#9DB4CC',
                letterSpacing:
                  '0.14em',
                textTransform:
                  'uppercase',
              }}
            >
              GY DATA
            </span>

            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
              }}
            >
              <Wifi
                style={{
                  width: 12,
                  height: 12,
                  color: '#2563EB',
                }}
              />
            </div>
          </div>

          {/* Provider logo + service label + value */}
          <div
            style={{
              display: 'flex',
              flexDirection:
                'column',
              alignItems: 'center',
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            <ProviderBadge
              provider={
                receipt.provider
              }
              type={receipt.type}
              service={
                receipt.service
              }
            />

            <p
              style={{
                marginTop: 11,
                marginBottom: 6,
                fontSize: 11,
                fontWeight: 700,
                color: '#9DB4CC',
                letterSpacing:
                  '0.1em',
                textTransform:
                  'uppercase',
              }}
            >
              {receipt.provider}
              &nbsp;•&nbsp;
              {receipt.service}
            </p>

            <p
              style={{
                fontSize:
                  receipt.type ===
                  'data'
                    ? 44
                    : 32,
                fontWeight: 900,
                color: '#0B1F4E',
                lineHeight: 1.05,
                letterSpacing:
                  receipt.type ===
                  'data'
                    ? '-1px'
                    : '-0.5px',
                margin: 0,
              }}
            >
              {value}
            </p>
          </div>

          <Divider />

          {/* Detail rows */}
          <div
            style={{
              padding:
                '15px 0',
              display: 'flex',
              flexDirection:
                'column',
              gap: 11,
            }}
          >
            <Row
              label="Amount"
              value={`₦${receipt.amount.toLocaleString()}`}
            />

            {phone && (
              <Row
                label="Phone Number"
                value={phone}
              />
            )}

            <Row
              label="Date"
              value={`${receipt.date}${
                receipt.time
                  ? `, ${receipt.time}`
                  : ''
              }`}
            />

            {receipt.paymentMethod && (
              <Row
                label="Paid via"
                value={
                  receipt.paymentMethod
                }
              />
            )}

            {receipt.cashbackAmount !=
              null &&
              receipt.cashbackAmount >
                0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems:
                      'center',
                    gap: 16,
                    padding:
                      '9px 12px',
                    borderRadius: 10,
                    background:
                      '#F0FDF4',
                    border:
                      '1px solid #BBF7D0',
                  }}
                >
                  <div
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 6,
                    }}
                  >
                    <Gift
                      style={{
                        width: 13,
                        height: 13,
                        color:
                          '#16A34A',
                        flexShrink: 0,
                      }}
                    />

                    <span
                      style={{
                        fontSize: 12,
                        color:
                          '#15803D',
                        fontWeight: 700,
                      }}
                    >
                      Cashback Credited
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 13,
                      color:
                        '#15803D',
                      fontWeight: 800,
                    }}
                  >
                    +₦
                    {receipt.cashbackAmount.toLocaleString()}
                  </span>
                </div>
              )}
          </div>

          <Divider />

          {/* Status pill */}
          <div
            style={{
              marginTop: 16,
              padding:
                '12px 18px',
              borderRadius: 14,
              background: sc.bg,
              border:
                `1.5px solid ${sc.border}`,
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              gap: 8,
            }}
          >
            {sc.icon}

            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: sc.text,
                letterSpacing:
                  '0.09em',
              }}
            >
              {sc.label}
            </span>
          </div>

          {/*
           * Intentionally NO transaction reference,
           * UUID, provider reference, or internal ID.
           */}
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────── */}
      {showActions && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 16,
          }}
        >
          {/* Share button */}
          <button
            onClick={handleShare}
            disabled={isSharing}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 14,
              background: isSharing
                ? '#E8F5EC'
                : '#F0FDF4',
              border:
                '1.5px solid #BBF7D0',
              color: '#15803D',
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: isSharing
                ? 'default'
                : 'pointer',
              opacity: isSharing
                ? 0.7
                : 1,
              transition:
                'all 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!isSharing) {
                (
                  e.currentTarget as HTMLButtonElement
                ).style.background =
                  '#DCFCE7';
              }
            }}
            onMouseLeave={e => {
              (
                e.currentTarget as HTMLButtonElement
              ).style.background =
                isSharing
                  ? '#E8F5EC'
                  : '#F0FDF4';
            }}
          >
            <Share2
              style={{
                width: 15,
                height: 15,
              }}
            />

            {isSharing
              ? 'Preparing...'
              : 'Share Receipt'}
          </button>

          {/* Done button */}
          {onDone && (
            <button
              onClick={onDone}
              style={{
                flex: 2,
                height: 50,
                borderRadius: 14,
                background:
                  'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
                boxShadow:
                  '0 6px 20px rgba(37,99,235,0.35)',
                border: 'none',
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing:
                  '0.02em',
              }}
            >
              {doneLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
