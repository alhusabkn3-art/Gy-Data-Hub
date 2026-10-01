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

  txnId?: string;
  reference?: string;
  providerReference?: string;
  id?: string;

  metadata?: Record<
    string,
    unknown
  >;
}

/*
 * EXACT REFERENCE RATIO:
 *
 * 1415 x 1536
 *
 * This is the same aspect ratio as the supplied
 * receipt reference image.
 */
const RECEIPT_WIDTH = 1415;
const RECEIPT_HEIGHT = 1536;

/* ============================================================
 * XML
 * ========================================================== */

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

/* ============================================================
 * NETWORK
 * ========================================================== */

function getNetwork(
  receipt: ReceiptData,
): string {
  const metadataNetwork =
    receipt.metadata?.network;

  const provider =
    String(
      metadataNetwork ??
        receipt.provider ??
        '',
    ).trim();

  if (
    !provider ||
    /^(gy\s*data|smeapi|sme\s*api)$/i.test(
      provider,
    )
  ) {
    return 'MTN';
  }

  return provider;
}

/* ============================================================
 * DATE
 * ========================================================== */

function parseDateTime(
  receipt: ReceiptData,
): Date | null {
  if (
    receipt.createdAt
  ) {
    const created =
      new Date(
        receipt.createdAt,
      );

    if (
      !Number.isNaN(
        created.getTime(),
      )
    ) {
      return created;
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
    const [
      ,
      day,
      month,
      year,
    ] = match;

    const parsed =
      new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
      );

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed;
    }
  }

  return null;
}

function formatDateTime(
  receipt: ReceiptData,
): string {
  const dateText =
    String(
      receipt.date ?? '',
    ).trim();

  const timeText =
    String(
      receipt.time ?? '',
    ).trim();

  /*
   * Keep an already formatted Nigerian date
   * exactly in this format:
   *
   * 30/07/2026, 14:24:44
   */
  if (
    /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(
      dateText,
    )
  ) {
    const date =
      dateText.replace(
        /-/g,
        '/',
      );

    return timeText
      ? `${date}, ${timeText}`
      : date;
  }

  const parsed =
    parseDateTime(
      receipt,
    );

  if (parsed) {
    const day =
      String(
        parsed.getDate(),
      ).padStart(2, '0');

    const month =
      String(
        parsed.getMonth() + 1,
      ).padStart(2, '0');

    const year =
      parsed.getFullYear();

    const hours =
      String(
        parsed.getHours(),
      ).padStart(2, '0');

    const minutes =
      String(
        parsed.getMinutes(),
      ).padStart(2, '0');

    const seconds =
      String(
        parsed.getSeconds(),
      ).padStart(2, '0');

    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  }

  return (
    [
      dateText,
      timeText,
    ]
      .filter(Boolean)
      .join(', ') ||
    '—'
  );
}

/* ============================================================
 * VALUES
 * ========================================================== */

function getRecipient(
  receipt: ReceiptData,
): string {
  return (
    String(
      receipt.phone ??
        receipt.recipient ??
        '',
    ).trim() ||
    '—'
  );
}

function getDescription(
  receipt: ReceiptData,
): string {
  return (
    String(
      receipt.description ??
        receipt.service ??
        '',
    ).trim() ||
    '—'
  );
}

function getMainText(
  receipt: ReceiptData,
): string {
  if (
    receipt.type === 'data'
  ) {
    return getDescription(
      receipt,
    );
  }

  return (
    String(
      receipt.service ??
        receipt.description ??
        'Transaction',
    ).trim() ||
    'Transaction'
  );
}

function getStatusText(
  receipt: ReceiptData,
): string {
  if (
    receipt.status ===
    'pending'
  ) {
    return 'Pending';
  }

  if (
    receipt.status ===
    'failed'
  ) {
    return 'Failed';
  }

  return 'Success';
}

/* ============================================================
 * RECEIPT SVG
 *
 * 1415 x 1536
 *
 * No amount.
 * No transaction ID.
 * No payment method.
 * No extra receipt information.
 *
 * Only:
 *
 * MTN
 * 3GB
 * Success
 * -----------------
 * Recipient
 * Description
 * Date
 * ========================================================== */

function buildReceiptSvg(
  receipt: ReceiptData,
): string {
  const network =
    getNetwork(receipt);

  const mainText =
    getMainText(
      receipt,
    );

  const recipient =
    getRecipient(
      receipt,
    );

  const description =
    getDescription(
      receipt,
    );

  const dateTime =
    formatDateTime(
      receipt,
    );

  const status =
    getStatusText(
      receipt,
    );

  const titleSize =
    mainText.length >= 8
      ? 126
      : 142;

  const descriptionSize =
    description.length > 13
      ? 45
      : 56;

  const recipientSize =
    recipient.length > 13
      ? 47
      : 54;

  const dateSize =
    dateTime.length > 22
      ? 46
      : 54;

  return `<?xml version="1.0" encoding="UTF-8"?>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${RECEIPT_WIDTH}"
  height="${RECEIPT_HEIGHT}"
  viewBox="0 0 ${RECEIPT_WIDTH} ${RECEIPT_HEIGHT}"
>
  <defs>

    <!-- =====================================================
         PAPER
         =================================================== -->

    <linearGradient
      id="paper"
      x1="0"
      y1="0"
      x2="1"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="#ffffff"
      />

      <stop
        offset="45%"
        stop-color="#fdfdfc"
      />

      <stop
        offset="100%"
        stop-color="#f7f7f5"
      />
    </linearGradient>

    <!-- =====================================================
         GOLD
         =================================================== -->

    <linearGradient
      id="goldBorder"
      x1="0"
      y1="0"
      x2="1"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="#8d6828"
      />

      <stop
        offset="17%"
        stop-color="#f4df9b"
      />

      <stop
        offset="35%"
        stop-color="#fff4b9"
      />

      <stop
        offset="58%"
        stop-color="#a97926"
      />

      <stop
        offset="78%"
        stop-color="#ead080"
      />

      <stop
        offset="100%"
        stop-color="#8c6729"
      />
    </linearGradient>

    <linearGradient
      id="goldFace"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="#fff2a8"
      />

      <stop
        offset="30%"
        stop-color="#f8dc83"
      />

      <stop
        offset="58%"
        stop-color="#c09237"
      />

      <stop
        offset="80%"
        stop-color="#f2d784"
      />

      <stop
        offset="100%"
        stop-color="#a97625"
      />
    </linearGradient>

    <!-- =====================================================
         CREAM CENTER
         =================================================== -->

    <radialGradient
      id="cream"
      cx="50%"
      cy="43%"
      r="60%"
    >
      <stop
        offset="0%"
        stop-color="#fffdf6"
      />

      <stop
        offset="55%"
        stop-color="#fdf8e9"
      />

      <stop
        offset="100%"
        stop-color="#f0e5c7"
      />
    </radialGradient>

    <!-- =====================================================
         BLUE SUCCESS
         =================================================== -->

    <linearGradient
      id="successBlue"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="#1f3659"
      />

      <stop
        offset="38%"
        stop-color="#102746"
      />

      <stop
        offset="65%"
        stop-color="#061a35"
      />

      <stop
        offset="100%"
        stop-color="#29496f"
      />
    </linearGradient>

    <!-- =====================================================
         PATTERN
         =================================================== -->

    <pattern
      id="pattern"
      width="84"
      height="84"
      patternUnits="userSpaceOnUse"
    >
      <path
        d="M0 42 L42 0 M0 84 L84 0 M42 84 L84 42"
        fill="none"
        stroke="#dfe1e1"
        stroke-width="3"
        opacity="0.65"
      />

      <path
        d="M18 60 L60 18"
        fill="none"
        stroke="#ececec"
        stroke-width="2"
        opacity="0.85"
      />
    </pattern>

    <!-- =====================================================
         SHADOWS
         =================================================== -->

    <filter
      id="badgeShadow"
      x="-50%"
      y="-50%"
      width="200%"
      height="220%"
    >
      <feDropShadow
        dx="0"
        dy="13"
        stdDeviation="13"
        flood-color="#72521f"
        flood-opacity="0.38"
      />
    </filter>

    <filter
      id="buttonShadow"
      x="-40%"
      y="-50%"
      width="180%"
      height="220%"
    >
      <feDropShadow
        dx="0"
        dy="14"
        stdDeviation="14"
        flood-color="#14263f"
        flood-opacity="0.34"
      />
    </filter>

    <filter
      id="goldTextShadow"
      x="-30%"
      y="-30%"
      width="160%"
      height="170%"
    >
      <feDropShadow
        dx="0"
        dy="5"
        stdDeviation="3"
        flood-color="#77531d"
        flood-opacity="0.38"
      />
    </filter>

  </defs>

  <!-- =======================================================
       OUTER RECEIPT
       ===================================================== -->

  <rect
    x="0"
    y="0"
    width="1415"
    height="1536"
    rx="78"
    fill="url(#paper)"
  />

  <!-- OUTER GOLD BORDER -->

  <rect
    x="5"
    y="5"
    width="1405"
    height="1526"
    rx="72"
    fill="none"
    stroke="url(#goldBorder)"
    stroke-width="10"
  />

  <!-- INNER GOLD BORDER -->

  <rect
    x="17"
    y="17"
    width="1381"
    height="1502"
    rx="62"
    fill="none"
    stroke="#ead28d"
    stroke-width="3"
  />

  <!-- =======================================================
       OUTER DECORATIVE CIRCLE
       ===================================================== -->

  <circle
    cx="707.5"
    cy="685"
    r="520"
    fill="url(#pattern)"
    opacity="0.70"
  />

  <!-- =======================================================
       MAIN CREAM CIRCLE
       ===================================================== -->

  <circle
    cx="707.5"
    cy="694"
    r="485"
    fill="url(#cream)"
  />

  <circle
    cx="707.5"
    cy="694"
    r="485"
    fill="none"
    stroke="#f0eadc"
    stroke-width="2"
  />

  <!-- =======================================================
       MTN GOLD BADGE
       ===================================================== -->

  <g
    filter="url(#badgeShadow)"
  >

    <!-- outer badge -->

    <circle
      cx="707.5"
      cy="181"
      r="110"
      fill="url(#goldBorder)"
      stroke="#805d23"
      stroke-width="4"
    />

    <!-- inner badge -->

    <circle
      cx="707.5"
      cy="181"
      r="98"
      fill="url(#goldFace)"
      stroke="#fff3b7"
      stroke-width="4"
    />

    <circle
      cx="707.5"
      cy="181"
      r="91"
      fill="none"
      stroke="#d5b45e"
      stroke-width="2"
    />

    <!-- MTN oval -->

    <ellipse
      cx="707.5"
      cy="181"
      rx="76"
      ry="47"
      fill="#f0d37b"
      stroke="#141414"
      stroke-width="7"
    />

    <ellipse
      cx="707.5"
      cy="181"
      rx="67"
      ry="39"
      fill="#f6dc8d"
    />

    <text
      x="707.5"
      y="197"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="43"
      font-weight="900"
      fill="#171717"
    >${escapeXml(
      network ===
        'MTN'
        ? 'MTN'
        : network,
    )}</text>

  </g>

  <!-- =======================================================
       NETWORK TEXT
       ===================================================== -->

  <text
    x="707.5"
    y="395"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="63"
    font-weight="500"
    letter-spacing="1"
    fill="#c7a34f"
  >${escapeXml(
    network ===
      'MTN'
      ? 'MTN'
      : network,
  )}</text>

  <!-- =======================================================
       DATA / SERVICE
       ===================================================== -->

  <text
    x="707.5"
    y="558"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${titleSize}"
    font-weight="900"
    letter-spacing="1"
    fill="url(#goldFace)"
    stroke="#f7e5a5"
    stroke-width="3"
    paint-order="stroke"
    filter="url(#goldTextShadow)"
  >${escapeXml(
    mainText,
  )}</text>

  <!-- =======================================================
       SUCCESS BUTTON
       ===================================================== -->

  <g
    filter="url(#buttonShadow)"
  >

    <!-- outer gold -->

    <rect
      x="399"
      y="624"
      width="617"
      height="151"
      rx="75.5"
      fill="url(#goldBorder)"
      stroke="#866023"
      stroke-width="4"
    />

    <!-- blue -->

    <rect
      x="410"
      y="635"
      width="595"
      height="129"
      rx="64.5"
      fill="url(#successBlue)"
      stroke="#e6c875"
      stroke-width="4"
    />

    <!-- top highlight -->

    <path
      d="
        M458 661
        C560 630,
        855 630,
        956 661
      "
      fill="none"
      stroke="#ffffff"
      stroke-opacity="0.32"
      stroke-width="10"
      stroke-linecap="round"
    />

    <!-- success text -->

    <text
      x="707.5"
      y="718"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="61"
      font-weight="800"
      fill="#f2d57f"
    >${escapeXml(
      status,
    )}</text>

  </g>

  <!-- =======================================================
       DIVIDER
       ===================================================== -->

  <line
    x1="78"
    y1="994"
    x2="1337"
    y2="994"
    stroke="#b9913c"
    stroke-width="5"
  />

  <line
    x1="80"
    y1="1001"
    x2="1335"
    y2="1001"
    stroke="#ead28b"
    stroke-width="2"
  />

  <!-- =======================================================
       RECIPIENT
       ===================================================== -->

  <text
    x="78"
    y="1122"
    font-family="Arial, Helvetica, sans-serif"
    font-size="53"
    font-weight="400"
    fill="#68717e"
  >Recipient</text>

  <text
    x="1337"
    y="1122"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${recipientSize}"
    font-weight="800"
    fill="#071a36"
  >${escapeXml(
    recipient,
  )}</text>

  <!-- =======================================================
       DESCRIPTION
       ===================================================== -->

  <text
    x="78"
    y="1234"
    font-family="Arial, Helvetica, sans-serif"
    font-size="53"
    font-weight="400"
    fill="#68717e"
  >Description</text>

  <text
    x="1337"
    y="1234"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${descriptionSize}"
    font-weight="800"
    fill="#071a36"
  >${escapeXml(
    description,
  )}</text>

  <!-- =======================================================
       DATE
       ===================================================== -->

  <text
    x="78"
    y="1350"
    font-family="Arial, Helvetica, sans-serif"
    font-size="53"
    font-weight="400"
    fill="#68717e"
  >Date</text>

  <text
    x="1337"
    y="1350"
    text-anchor="end"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${dateSize}"
    font-weight="800"
    fill="#071a36"
  >${escapeXml(
    dateTime,
  )}</text>

</svg>`;
}

/* ============================================================
 * SVG -> JPEG
 * ========================================================== */

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

      const objectUrl =
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
                'Canvas unavailable',
              );
            }

            context.clearRect(
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
                  objectUrl,
                );

                if (!jpeg) {
                  reject(
                    new Error(
                      'Unable to create JPEG',
                    ),
                  );

                  return;
                }

                resolve(
                  new File(
                    [
                      jpeg,
                    ],
                    'GY-DATA-Receipt.jpg',
                    {
                      type:
                        'image/jpeg',
                    },
                  ),
                );
              },
              'image/jpeg',
              0.98,
            );
          } catch (
            error
          ) {
            URL.revokeObjectURL(
              objectUrl,
            );

            reject(
              error,
            );
          }
        };

      image.onerror =
        () => {
          URL.revokeObjectURL(
            objectUrl,
          );

          reject(
            new Error(
              'Unable to render receipt',
            ),
          );
        };

      image.src =
        objectUrl;
    },
  );
}

/* ============================================================
 * SVG DATA URL
 * ========================================================== */

function svgDataUrl(
  svg: string,
): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(svg)
  );
}

/* ============================================================
 * COMPONENT
 * ========================================================== */

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
    sharing,
    setSharing,
  ] = useState(false);

  /*
   * IMPORTANT:
   *
   * The exact same SVG is used by:
   *
   * 1. Receipt View
   * 2. WhatsApp Share
   *
   * So what the user sees is what gets shared.
   */
  const svg =
    useMemo(
      () =>
        buildReceiptSvg(
          receipt,
        ),
      [receipt],
    );

  /* ==========================================================
     SHARE
     ======================================================== */

  const handleShare =
    async () => {
      if (sharing) {
        return;
      }

      setSharing(true);

      try {
        const file =
          await svgToJpegFile(
            svg,
          );

        /*
         * Web Share API:
         *
         * Send the actual JPEG file.
         *
         * No receipt text.
         * No amount.
         * No URL.
         *
         * WhatsApp receives the receipt as an image.
         */
        if (
          typeof navigator.share ===
            'function' &&
          typeof navigator.canShare ===
            'function'
        ) {
          const shareable =
            navigator.canShare({
              files: [file],
            });

          if (
            shareable
          ) {
            await navigator.share({
              files: [file],
              title:
                'GY DATA Receipt',
            });

            return;
          }
        }

        /*
         * Fallback for WebViews that expose
         * navigator.share() without canShare().
         */
        if (
          typeof navigator.share ===
          'function'
        ) {
          try {
            await navigator.share({
              files: [file],
              title:
                'GY DATA Receipt',
            });

            return;
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
          }
        }

        toast.error(
          'Image sharing is not supported on this device.',
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

        console.error(
          'Receipt share error:',
          error,
        );

        toast.error(
          'Failed to share receipt image.',
        );
      } finally {
        setSharing(false);
      }
    };

  /* ==========================================================
     VIEW
     ======================================================== */

  return (
    <div
      className="
        mx-auto
        w-full
        max-w-[390px]
      "
    >

      {/* ======================================================
          RECEIPT ONLY
          ==================================================== */}

      <div
        className="
          w-full
          overflow-hidden
          rounded-[22px]
        "
      >
        <img
          src={svgDataUrl(svg)}
          alt="Receipt"
          draggable={false}
          className="
            block
            h-auto
            w-full
            select-none
          "
        />
      </div>

      {/* ======================================================
          ACTIONS
          ==================================================== */}

      {showActions && (
        <div
          className="
            mt-4
            flex
            w-full
            gap-2
          "
        >

          <button
            type="button"
            disabled={sharing}
            onClick={
              handleShare
            }
            className="
              flex
              h-11
              flex-1
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-[#128C7E]
              px-4
              text-[12px]
              font-bold
              text-white
              shadow-sm
              transition
              active:scale-[0.98]
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            <Share2
              className="
                h-4
                w-4
              "
            />

            {sharing
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
                flex-[0.7]
                items-center
                justify-center
                rounded-xl
                bg-[#0B1F4E]
                px-4
                text-[12px]
                font-bold
                text-white
                transition
                active:scale-[0.98]
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
