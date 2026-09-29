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
  phone?: string;
  paymentMethod?: string;
  cashbackAmount?: number;
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
    accentFrom: '#159447',
    accentTo: '#27B95C',
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
    accentFrom: '#C98600',
    accentTo: '#E9A900',
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
    accentFrom: '#C62828',
    accentTo: '#E04444',
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
        border:
          '1.5px solid rgba(0,0,0,0.06)',
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

function getNormalizedNetwork(
  provider: string,
): NetworkConfig | undefined {
  const normalized =
    String(provider ?? '').trim();

  const key =
    normalized.charAt(0).toUpperCase() +
    normalized.slice(1).toLowerCase();

  return (
    NETWORK[normalized] ??
    NETWORK[key]
  );
}

function ProviderBadge({
  provider,
  type,
  service,
  size = 64,
}: {
  provider: string;
  type: string;
  service?: string;
  size?: number;
}) {
  const net =
    getNormalizedNetwork(provider);

  if (
    net &&
    service !== 'Cashback'
  ) {
    const scale =
      size / 64;

    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius:
            Math.round(size / 2),
          background: net.bg,
          color: net.fg,
          boxShadow:
            `0 6px 20px ${net.bg}66`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize:
            net.fontSize * scale,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          letterSpacing:
            net.label === 'airtel'
              ? '0.01em'
              : '-0.3px',
          userSelect: 'none',
          border:
            `2px solid ${net.bg}`,
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

function purchaseValue(
  type: string,
  desc: string,
  amount: number,
): string {
  if (type === 'data') {
    const match =
      desc.match(
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
    const words =
      desc
        .replace(/^[^\s]+ /, '')
        .split(' ');

    return (
      words.join(' ') ||
      'Subscription'
    );
  }

  if (type === 'exam') {
    const match =
      desc.match(
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

function formatPhone(
  phone?: string,
): string {
  return String(phone ?? '').trim();
}

function escapeSvg(
  value: string,
): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /"/g,
      '&quot;',
    )
    .replace(
      /'/g,
      '&apos;',
    );
}

function getProviderLabel(
  provider: string,
): string {
  return (
    getNormalizedNetwork(provider)
      ?.label ||
    String(provider ?? '').trim() ||
    'GY DATA'
  );
}

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

async function createReceiptImage(
  receipt: ReceiptData,
): Promise<File> {
  const width = 720;
  const height = 900;

  const phone =
    formatPhone(receipt.phone);

  const value =
    purchaseValue(
      receipt.type,
      receipt.description,
      receipt.amount,
    );

  const status =
    STATUS[receipt.status];

  const network =
    getNormalizedNetwork(
      receipt.provider,
    );

  const networkBg =
    network?.bg ?? '#C9A23A';

  const networkFg =
    network?.fg ?? '#FFFFFF';

  const networkLabel =
    getProviderLabel(
      receipt.provider,
    );

  const dataText =
    receipt.type === 'data'
      ? value
      : receipt.service;

  const dateText =
    `${receipt.date}${
      receipt.time
        ? `, ${receipt.time}`
        : ''
    }`;

  const phoneText =
    phone || '—';

  const amountText =
    `₦${receipt.amount.toLocaleString()}`;

  const safeNetwork =
    escapeSvg(networkLabel);

  const safePhone =
    escapeSvg(phoneText);

  const safeData =
    escapeSvg(dataText);

  const safeDate =
    escapeSvg(dateText);

  const safeAmount =
    escapeSvg(amountText);

  const safeStatus =
    escapeSvg(status.label);

  const logoFontSize =
    network?.fontSize ?? 18;

  const svg = `
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
          offset="0"
          stop-color="#FFFFFF"
        />

        <stop
          offset="1"
          stop-color="#FBFBF9"
        />
      </linearGradient>

      <radialGradient
        id="halo"
        cx="50%"
        cy="50%"
        r="50%"
      >
        <stop
          offset="0"
          stop-color="${networkBg}"
          stop-opacity="0.13"
        />

        <stop
          offset="1"
          stop-color="${networkBg}"
          stop-opacity="0"
        />
      </radialGradient>

      <filter
        id="shadow"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
      >
        <feDropShadow
          dx="0"
          dy="7"
          stdDeviation="9"
          flood-color="#0B1F4E"
          flood-opacity="0.13"
        />
      </filter>

      <filter
        id="soft"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
      >
        <feDropShadow
          dx="0"
          dy="3"
          stdDeviation="4"
          flood-color="${networkBg}"
          flood-opacity="0.25"
        />
      </filter>

    </defs>

    <rect
      width="720"
      height="900"
      fill="#F3F6F9"
    />

    <rect
      x="14"
      y="14"
      width="692"
      height="872"
      rx="34"
      fill="url(#paper)"
      stroke="${networkBg}"
      stroke-width="5"
      filter="url(#shadow)"
    />

    <rect
      x="24"
      y="24"
      width="672"
      height="852"
      rx="27"
      fill="none"
      stroke="${networkBg}"
      stroke-opacity="0.28"
      stroke-width="2"
    />

    <ellipse
      cx="360"
      cy="270"
      rx="275"
      ry="230"
      fill="url(#halo)"
    />

    <!-- NETWORK LOGO -->

    <circle
      cx="360"
      cy="106"
      r="55"
      fill="${networkBg}"
      filter="url(#soft)"
    />

    ${
      networkLabel.toLowerCase() ===
      'mtn'
        ? `
      <ellipse
        cx="360"
        cy="106"
        rx="37"
        ry="20"
        fill="none"
        stroke="#111111"
        stroke-width="4"
      />
      `
        : ''
    }

    <text
      x="360"
      y="${
        networkLabel.toLowerCase() ===
        '9mobile'
          ? 112
          : 113
      }"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${logoFontSize}"
      font-weight="900"
      fill="${networkFg}"
    >
      ${safeNetwork}
    </text>

    <text
      x="360"
      y="184"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="21"
      font-weight="700"
      fill="${networkBg}"
      letter-spacing="2"
    >
      ${safeNetwork}
    </text>

    <!-- DATA -->

    <text
      x="360"
      y="286"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="82"
      font-weight="900"
      fill="#111C38"
      letter-spacing="-3"
    >
      ${safeData}
    </text>

    <!-- SUCCESS -->

    <rect
      x="205"
      y="315"
      width="310"
      height="62"
      rx="31"
      fill="${status.bg}"
      stroke="${status.border}"
      stroke-width="2"
    />

    <circle
      cx="239"
      cy="346"
      r="15"
      fill="${status.accentFrom}"
    />

    <path
      d="M231 346 l6 6 l11 -13"
      fill="none"
      stroke="#FFFFFF"
      stroke-width="4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <text
      x="375"
      y="355"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="24"
      font-weight="900"
      fill="${status.text}"
      letter-spacing="0.8"
    >
      ${safeStatus}
    </text>

    <line
      x1="72"
      y1="421"
      x2="648"
      y2="421"
      stroke="${networkBg}"
      stroke-opacity="0.65"
      stroke-width="2"
    />

    <!-- RECIPIENT -->

    <text
      x="70"
      y="478"
      font-family="Arial, Helvetica, sans-serif"
      font-size="21"
      font-weight="500"
      fill="#667085"
    >
      Recipient
    </text>

    <text
      x="650"
      y="478"
      text-anchor="end"
      font-family="Arial, Helvetica, sans-serif"
      font-size="25"
      font-weight="900"
      fill="#111C38"
    >
      ${safePhone}
    </text>

    <!-- AMOUNT -->

    <text
      x="70"
      y="555"
      font-family="Arial, Helvetica, sans-serif"
      font-size="21"
      font-weight="500"
      fill="#667085"
    >
      Amount
    </text>

    <text
      x="650"
      y="555"
      text-anchor="end"
      font-family="Arial, Helvetica, sans-serif"
      font-size="25"
      font-weight="900"
      fill="#111C38"
    >
      ${safeAmount}
    </text>

    <!-- DATE -->

    <text
      x="70"
      y="632"
      font-family="Arial, Helvetica, sans-serif"
      font-size="21"
      font-weight="500"
      fill="#667085"
    >
      Date
    </text>

    <text
      x="650"
      y="632"
      text-anchor="end"
      font-family="Arial, Helvetica, sans-serif"
      font-size="21"
      font-weight="800"
      fill="#111C38"
    >
      ${safeDate}
    </text>

    <line
      x1="72"
      y1="684"
      x2="648"
      y2="684"
      stroke="#D8D8D8"
      stroke-width="2"
    />

    <text
      x="360"
      y="744"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="16"
      font-weight="800"
      fill="#8B8F98"
      letter-spacing="2.4"
    >
      GY DATA
    </text>

    <text
      x="360"
      y="774"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="14"
      font-weight="600"
      fill="#A5A8AF"
    >
      DATA PURCHASE RECEIPT
    </text>

    <path
      d="M72 816 Q360 780 648 816 L648 850 L72 850 Z"
      fill="${networkBg}"
      fill-opacity="0.08"
    />

    <path
      d="M72 828 Q360 792 648 828"
      fill="none"
      stroke="${networkBg}"
      stroke-opacity="0.25"
      stroke-width="3"
    />

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

    canvas.width =
      width;

    canvas.height =
      height;

    const context =
      canvas.getContext(
        '2d',
      );

    if (!context) {
      throw new Error(
        'Unable to create receipt image.',
      );
    }

    context.fillStyle =
      '#F3F6F9';

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

function Divider() {
  return (
    <div
      style={{
        borderTop:
          '1.5px dashed #D8E8F5',
        margin: 0,
      }}
    />
  );
}

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
    formatPhone(receipt.phone);

  const [
    isSharing,
    setIsSharing,
  ] =
    React.useState(false);

  const handleShare =
    async () => {
      if (isSharing) {
        return;
      }

      setIsSharing(true);

      let imageUrl:
        | string
        | null = null;

      try {
        const image =
          await createReceiptImage(
            receipt,
          );

        const navigatorWithShare =
          navigator as Navigator & {
            canShare?: (
              data?: ShareData,
            ) => boolean;
          };

        const canUseShare =
          typeof navigator.share ===
          'function';

        let canShareFile =
          false;

        if (
          canUseShare &&
          typeof navigatorWithShare.canShare ===
            'function'
        ) {
          try {
            canShareFile =
              navigatorWithShare.canShare(
                {
                  files: [image],
                },
              );
          } catch {
            canShareFile =
              false;
          }
        }

        if (
          canUseShare &&
          canShareFile
        ) {
          await navigator.share({
            title:
              'GY DATA Receipt',
            files: [image],
          });

          return;
        }

        if (canUseShare) {
          try {
            await navigator.share({
              title:
                'GY DATA Receipt',
              files: [image],
            });

            return;
          } catch (error) {
            if (
              error instanceof
                DOMException &&
              error.name ===
                'AbortError'
            ) {
              return;
            }
          }
        }

        imageUrl =
          URL.createObjectURL(
            image,
          );

        const opened =
          window.open(
            imageUrl,
            '_blank',
            'noopener,noreferrer',
          );

        if (opened) {
          toast.success(
            'Receipt image opened. You can save or share it from there.',
          );

          window.setTimeout(
            () => {
              if (imageUrl) {
                URL.revokeObjectURL(
                  imageUrl,
                );
              }
            },
            60000,
          );

          imageUrl =
            null;

          return;
        }

        const downloadLink =
          document.createElement(
            'a',
          );

        downloadLink.href =
          imageUrl;

        downloadLink.download =
          'gy-data-receipt.png';

        downloadLink.rel =
          'noopener';

        document.body.appendChild(
          downloadLink,
        );

        downloadLink.click();

        downloadLink.remove();

        toast.success(
          'Receipt image is ready. Save the PNG and share it on WhatsApp.',
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
          'Receipt sharing failed:',
          error,
        );

        toast.error(
          'Unable to create receipt image. Please try again.',
        );
      } finally {
        if (imageUrl) {
          URL.revokeObjectURL(
            imageUrl,
          );
        }

        setIsSharing(
          false,
        );
      }
    };

  return (
    <div>
      <div
        style={{
          background:
            '#FFFFFF',
          borderRadius: 24,
          border:
            '1px solid #E3EEF8',
          boxShadow:
            '0 8px 32px rgba(11,31,78,0.10), 0 2px 8px rgba(11,31,78,0.05)',
          overflow:
            'hidden',
        }}
      >
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
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
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
                background:
                  '#EFF6FF',
                display: 'flex',
                alignItems:
                  'center',
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

          <div
            style={{
              display: 'flex',
              flexDirection:
                'column',
              alignItems:
                'center',
              textAlign:
                'center',
              marginBottom: 20,
            }}
          >
            <ProviderBadge
              provider={
                receipt.provider
              }
              type={
                receipt.type
              }
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
                    display:
                      'flex',
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

          <div
            style={{
              marginTop: 16,
              padding:
                '12px 18px',
              borderRadius: 14,
              background:
                sc.bg,
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
                color:
                  sc.text,
                letterSpacing:
                  '0.09em',
              }}
            >
              {sc.label}
            </span>
          </div>
        </div>
      </div>

      {showActions && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 16,
          }}
        >
          <button
            onClick={
              handleShare
            }
            disabled={
              isSharing
            }
            style={{
              flex: 1,
              height: 50,
              borderRadius: 14,
              background:
                isSharing
                  ? '#E8F5EC'
                  : '#F0FDF4',
              border:
                '1.5px solid #BBF7D0',
              color:
                '#15803D',
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor:
                isSharing
                  ? 'default'
                  : 'pointer',
              opacity:
                isSharing
                  ? 0.7
                  : 1,
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

          {onDone && (
            <button
              onClick={
                onDone
              }
              style={{
                flex: 2,
                height: 50,
                borderRadius: 14,
                background:
                  'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
                boxShadow:
                  '0 6px 20px rgba(37,99,235,0.35)',
                border: 'none',
                color:
                  '#FFFFFF',
                fontSize: 14,
                fontWeight: 800,
                cursor:
                  'pointer',
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
