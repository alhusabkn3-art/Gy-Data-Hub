import React, { useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
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

export function getReceiptDate(
  receipt: ReceiptData,
): Date {
  const metadata =
    receipt.metadata ?? {};

  const candidates: unknown[] = [
    receipt.createdAt,
    metadata.createdAt,
    metadata.created_at,
    metadata.timestamp,
    metadata.transactionDate,
    metadata.transaction_date,
    metadata.dateTime,
    metadata.datetime,
  ];

  for (
    const candidate of candidates
  ) {
    const raw =
      String(
        candidate ?? '',
      ).trim();

    if (!raw) continue;

    const parsed =
      new Date(raw);

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed;
    }
  }

  const dateText =
    String(
      receipt.date ?? '',
    ).trim();

  const timeText =
    String(
      receipt.time ?? '',
    ).trim();

  const direct =
    new Date(
      `${dateText} ${timeText}`.trim(),
    );

  if (
    !Number.isNaN(
      direct.getTime(),
    )
  ) {
    return direct;
  }

  const match =
    dateText.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
    );

  if (match) {
    const parsed =
      new Date(
        Number(match[3]),
        Number(match[2]) - 1,
        Number(match[1]),
        0,
        0,
        0,
      );

    if (timeText) {
      const timeMatch =
        timeText.match(
          /^(\d{1,2}):(\d{2})(?::(\d{2}))?/,
        );

      if (timeMatch) {
        parsed.setHours(
          Number(timeMatch[1]),
          Number(timeMatch[2]),
          Number(
            timeMatch[3] ?? 0,
          ),
        );
      }
    }

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed;
    }
  }

  return new Date();
}

export function formatReceiptDate(
  receipt: ReceiptData,
): string {
  const date =
    getReceiptDate(
      receipt,
    );

  const dd =
    String(
      date.getDate(),
    ).padStart(2, '0');

  const mm =
    String(
      date.getMonth() + 1,
    ).padStart(2, '0');

  const yyyy =
    String(
      date.getFullYear(),
    );

  const hh =
    String(
      date.getHours(),
    ).padStart(2, '0');

  const mi =
    String(
      date.getMinutes(),
    ).padStart(2, '0');

  const ss =
    String(
      date.getSeconds(),
    ).padStart(2, '0');

  return `${dd}/${mm}/${yyyy}, ${hh}:${mi}:${ss}`;
}

function escapeXml(
  value: unknown,
): string {
  return String(
    value ?? '',
  )
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

function metadataText(
  receipt: ReceiptData,
  keys: string[],
): string {
  const metadata =
    receipt.metadata ?? {};

  for (
    const key of keys
  ) {
    const value =
      String(
        metadata[key] ?? '',
      ).trim();

    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeNetwork(
  value: string,
): string {
  const v =
    value
      .trim()
      .toLowerCase();

  if (
    v === 'mtn' ||
    v === 'mtn nigeria'
  ) {
    return 'MTN';
  }

  if (
    v === 'glo' ||
    v === 'globacom'
  ) {
    return 'GLO';
  }

  if (
    v === 'airtel' ||
    v === 'airtel nigeria'
  ) {
    return 'AIRTEL';
  }

  if (
    v === '9mobile' ||
    v === '9 mobile' ||
    v === 'etisalat'
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
  const candidates = [
    metadataText(
      receipt,
      [
        'network',
        'networkName',
        'network_name',
        'operator',
      ],
    ),
    receipt.provider,
    receipt.service,
  ];

  for (
    const candidate of candidates
  ) {
    const value =
      String(
        candidate ?? '',
      ).trim();

    if (
      !value ||
      /^(gy\s*data|smeapi|sme\s*api|data)$/i.test(
        value,
      )
    ) {
      continue;
    }

    const network =
      normalizeNetwork(
        value,
      );

    if (
      [
        'MTN',
        'GLO',
        'AIRTEL',
        '9MOBILE',
      ].includes(
        network,
      )
    ) {
      return network;
    }
  }

  return 'MTN';
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
        'customerPhone',
      ],
    ) ||
    String(
      receipt.phone ?? '',
    ).trim() ||
    String(
      receipt.recipient ?? '',
    ).trim() ||
    '—'
  );
}

function getDescription(
  receipt: ReceiptData,
): string {
  return (
    String(
      receipt.description ?? '',
    ).trim() ||
    metadataText(
      receipt,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'data_plan_name',
        'packageName',
        'package_name',
        'plan',
      ],
    ) ||
    String(
      receipt.service ?? '',
    ).trim() ||
    'Transaction'
  );
}

function networkColors(
  network: string,
) {
  switch (network) {
    case 'GLO':
      return {
        main: '#78BE20',
        text: '#FFFFFF',
      };

    case 'AIRTEL':
      return {
        main: '#E30613',
        text: '#FFFFFF',
      };

    case '9MOBILE':
      return {
        main: '#00843D',
        text: '#FFFFFF',
      };

    default:
      return {
        main: '#FFCC00',
        text: '#111827',
      };
  }
}

function buildReceiptSvg(
  receipt: ReceiptData,
): string {
  const width = 1195;
  const height = 1279;

  const network =
    getNetwork(receipt);

  const colors =
    networkColors(
      network,
    );

  const recipient =
    getRecipient(
      receipt,
    );

  const description =
    getDescription(
      receipt,
    );

  const date =
    formatReceiptDate(
      receipt,
    );

  const status =
    receipt.status === 'failed'
      ? 'Failed'
      : receipt.status ===
          'pending'
        ? 'Pending'
        : 'Success';

  const descriptionSize =
    description.length > 15
      ? 38
      : 48;

  const recipientSize =
    recipient.length > 13
      ? 38
      : 48;

  const dateSize =
    date.length > 23
      ? 38
      : 46;

  return `<?xml version="1.0" encoding="UTF-8"?>
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
      x2="1"
      y2="1"
    >
      <stop
        offset="0"
        stop-color="#fffefb"
      />
      <stop
        offset="0.5"
        stop-color="#fdfdfd"
      />
      <stop
        offset="1"
        stop-color="#f6f6f4"
      />
    </linearGradient>

    <linearGradient
      id="gold"
      x1="0"
      y1="0"
      x2="1"
      y2="1"
    >
      <stop
        offset="0"
        stop-color="#f8df91"
      />
      <stop
        offset="0.35"
        stop-color="#fff4bd"
      />
      <stop
        offset="0.68"
        stop-color="#b9872d"
      />
      <stop
        offset="1"
        stop-color="#f1d77f"
      />
    </linearGradient>

    <linearGradient
      id="blue"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0"
        stop-color="#1c3155"
      />
      <stop
        offset="0.48"
        stop-color="#071a36"
      />
      <stop
        offset="1"
        stop-color="#294b78"
      />
    </linearGradient>

    <radialGradient
      id="centerGlow"
    >
      <stop
        offset="0"
        stop-color="#fffaf0"
        stop-opacity="0.96"
      />
      <stop
        offset="1"
        stop-color="#f1e6c8"
        stop-opacity="0.80"
      />
    </radialGradient>

    <pattern
      id="pattern"
      width="82"
      height="82"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <path
        d="M8 16 H38 L53 31 H84"
        fill="none"
        stroke="#dfe1e2"
        stroke-width="3"
        opacity="0.55"
      />

      <path
        d="M-2 38 H28 L43 53 H74"
        fill="none"
        stroke="#e6e7e8"
        stroke-width="3"
        opacity="0.55"
      />
    </pattern>

    <filter
      id="shadow"
      x="-30%"
      y="-30%"
      width="160%"
      height="170%"
    >
      <feDropShadow
        dx="0"
        dy="13"
        stdDeviation="14"
        flood-color="#70511f"
        flood-opacity="0.26"
      />
    </filter>

    <filter
      id="softShadow"
      x="-30%"
      y="-30%"
      width="160%"
      height="170%"
    >
      <feDropShadow
        dx="0"
        dy="8"
        stdDeviation="9"
        flood-color="#0b1f4e"
        flood-opacity="0.20"
      />
    </filter>

  </defs>

  <rect
    width="1195"
    height="1279"
    rx="66"
    fill="url(#paper)"
  />

  <rect
    x="5"
    y="5"
    width="1185"
    height="1269"
    rx="61"
    fill="none"
    stroke="#b88b32"
    stroke-width="10"
  />

  <rect
    x="17"
    y="17"
    width="1161"
    height="1245"
    rx="51"
    fill="none"
    stroke="#ead28b"
    stroke-width="3"
  />

  <circle
    cx="597.5"
    cy="653"
    r="460"
    fill="url(#pattern)"
    opacity="0.9"
  />

  <circle
    cx="597.5"
    cy="676"
    r="424"
    fill="url(#centerGlow)"
    opacity="0.98"
  />

  <circle
    cx="597.5"
    cy="676"
    r="421"
    fill="none"
    stroke="#eee8dc"
    stroke-width="2"
  />

  <g filter="url(#shadow)">

    <circle
      cx="597.5"
      cy="181"
      r="108"
      fill="url(#gold)"
      stroke="#8e6728"
      stroke-width="4"
    />

    <circle
      cx="597.5"
      cy="181"
      r="94"
      fill="none"
      stroke="#fff3b7"
      stroke-width="4"
    />

    <ellipse
      cx="597.5"
      cy="181"
      rx="75"
      ry="47"
      fill="${colors.main}"
      stroke="#111827"
      stroke-width="7"
    />

    <ellipse
      cx="597.5"
      cy="181"
      rx="65"
      ry="39"
      fill="${colors.main}"
      opacity="0.88"
    />

    <text
      x="597.5"
      y="198"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="42"
      font-weight="900"
      fill="${colors.text}"
    >${escapeXml(
      network.toLowerCase(),
    )}</text>

  </g>

  <text
    x="597.5"
    y="385"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="60"
    font-weight="700"
    fill="#c9a24c"
    letter-spacing="1"
  >${escapeXml(network)}</text>

  <text
    x="597.5"
    y="553"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="72"
    font-weight="900"
    fill="#b58a35"
  >${escapeXml(description)}</text>

  <g filter="url(#softShadow)">

    <rect
      x="385"
      y="610"
      width="425"
      height="100"
      rx="50"
      fill="url(#blue)"
    />

    <circle
      cx="435"
      cy="660"
      r="15"
      fill="#22c55e"
    />

    <path
      d="M427 660 L433 667 L445 651"
      fill="none"
      stroke="#ffffff"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <text
      x="600"
      y="678"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="52"
      font-weight="800"
      fill="#f4d77e"
    >${escapeXml(status)}</text>

  </g>

  <line
    x1="78"
    y1="831"
    x2="1117"
    y2="831"
    stroke="#b9913c"
    stroke-width="5"
  />

  <line
    x1="80"
    y1="837"
    x2="1115"
    y2="837"
    stroke="#ead28b"
    stroke-width="2"
  />

  <text
    x="78"
    y="963"
    font-family="Arial, Helvetica, sans-serif"
    font-size="52"
    font-weight="400"
    fill="#6d7480"
  >Recipient</text>

  <text
    x="1117"
    y="963"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${recipientSize}"
    font-weight="800"
    fill="#071a36"
  >${escapeXml(recipient)}</text>

  <text
    x="78"
    y="1073"
    font-family="Arial, Helvetica, sans-serif"
    font-size="52"
    font-weight="400"
    fill="#6d7480"
  >Description</text>

  <text
    x="1117"
    y="1073"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${descriptionSize}"
    font-weight="800"
    fill="#071a36"
  >${escapeXml(description)}</text>

  <text
    x="78"
    y="1183"
    font-family="Arial, Helvetica, sans-serif"
    font-size="52"
    font-weight="400"
    fill="#6d7480"
  >Date</text>

  <text
    x="1117"
    y="1183"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${dateSize}"
    font-weight="800"
    fill="#071a36"
  >${escapeXml(date)}</text>

</svg>`;
}

export function createReceiptImageFile(
  receipt: ReceiptData,
): Promise<File> {
  const svg =
    buildReceiptSvg(
      receipt,
    );

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
              1195;

            canvas.height =
              1279;

            const context =
              canvas.getContext(
                '2d',
              );

            if (!context) {
              throw new Error(
                'Canvas unavailable',
              );
            }

            context.fillStyle =
              '#ffffff';

            context.fillRect(
              0,
              0,
              canvas.width,
              canvas.height,
            );

            context.drawImage(
              image,
              0,
              0,
              canvas.width,
              canvas.height,
            );

            canvas.toBlob(
              jpeg => {
                URL.revokeObjectURL(
                  url,
                );

                if (!jpeg) {
                  reject(
                    new Error(
                      'Unable to create receipt image',
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
          } catch (
            error
          ) {
            URL.revokeObjectURL(
              url,
            );

            reject(
              error,
            );
          }
        };

      image.onerror =
        () => {
          URL.revokeObjectURL(
            url,
          );

          reject(
            new Error(
              'Unable to render receipt image',
            ),
          );
        };

      image.src = url;
    },
  );
}

export async function shareReceiptImage(
  receipt: ReceiptData,
): Promise<boolean> {
  const file =
    await createReceiptImageFile(
      receipt,
    );

  if (
    typeof navigator.share !==
    'function'
  ) {
    toast.error(
      'This device cannot share the receipt image.',
    );

    return false;
  }

  if (
    typeof navigator.canShare ===
      'function' &&
    !navigator.canShare({
      files: [file],
    })
  ) {
    toast.error(
      'This device cannot share the receipt image.',
    );

    return false;
  }

  await navigator.share({
    title:
      'GY DATA Receipt',
    text:
      'GY DATA Transaction Receipt',
    files: [file],
  });

  return true;
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

  const imageUrl =
    useMemo(
      () =>
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          svg,
        )}`,
      [svg],
    );

  const handleShare =
    async () => {
      if (isSharing) {
        return;
      }

      setIsSharing(true);

      try {
        await shareReceiptImage(
          receipt,
        );
      } catch (
        error
      ) {
        if (
          !(
            error instanceof
              DOMException &&
            error.name ===
              'AbortError'
          )
        ) {
          console.error(
            'Receipt share failed:',
            error,
          );

          toast.error(
            'Unable to share receipt image.',
          );
        }
      } finally {
        setIsSharing(false);
      }
    };

  return (
    <div className="mx-auto w-full max-w-[350px]">

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(11,31,78,0.14)]">

        <img
          src={imageUrl}
          alt="GY DATA transaction receipt"
          className="block h-auto w-full"
          draggable={false}
        />

      </div>

      {showActions && (
        <div className="mt-3 grid grid-cols-2 gap-2">

          <button
            type="button"
            onClick={
              handleShare
            }
            disabled={
              isSharing
            }
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-extrabold text-white shadow-[0_7px_18px_rgba(22,163,74,0.20)] disabled:opacity-60"
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
              className="h-12 rounded-xl bg-[#0B1F4E] text-sm font-extrabold text-white shadow-[0_7px_18px_rgba(11,31,78,0.20)]"
            >
              {doneLabel}
            </button>
          )}

        </div>
      )}

    </div>
  );
}

