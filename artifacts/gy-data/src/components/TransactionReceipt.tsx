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

  metadata?: Record<
    string,
    unknown
  >;
}

/* ============================================================
   EXACT RECEIPT SIZE OF THE ORIGINAL REFERENCE
   ============================================================ */

const RECEIPT_WIDTH = 1195;
const RECEIPT_HEIGHT = 1279;

/* ============================================================
   HELPERS
   ============================================================ */

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
   MTN IS FIXED TO MATCH THE REFERENCE IMAGE
   ============================================================ */

function getNetwork(): string {
  return 'MTN';
}

/* ============================================================
   RECIPIENT
   ============================================================ */

function getRecipient(
  receipt: ReceiptData,
): string {
  const metadata =
    receipt.metadata ?? {};

  const value =
    receipt.phone ??
    receipt.recipient ??
    metadata.phone ??
    metadata.recipientPhone ??
    metadata.recipient ??
    '';

  return (
    String(value).trim() ||
    '—'
  );
}

/* ============================================================
   DESCRIPTION

   Priority:
   1. metadata.planName
   2. description if it is already a clean plan name
   3. parse API description
   4. service
   ============================================================ */

function getDescription(
  receipt: ReceiptData,
): string {
  const metadata =
    receipt.metadata ?? {};

  const planName =
    String(
      metadata.planName ??
        metadata.dataPlanName ??
        metadata.plan_name ??
        '',
    ).trim();

  if (planName) {
    return planName;
  }

  const description =
    String(
      receipt.description ??
        '',
    ).trim();

  /*
   * API currently stores:
   *
   * Data purchase - mtn 07068625235
   *
   * Never show that string on the receipt.
   */
  const apiDescription =
    description.match(
      /^data\s+purchase\s*-\s*[a-z0-9]+\s+\d+$/i,
    );

  if (apiDescription) {
    const fallbackPlan =
      String(
        metadata.planCode ??
          metadata.plan ??
          '',
      ).trim();

    if (fallbackPlan) {
      return fallbackPlan;
    }

    return 'Data';
  }

  return (
    description ||
    String(
      receipt.service ??
        '',
    ).trim() ||
    'Data'
  );
}

/* ============================================================
   MAIN RECEIPT TITLE

   For data:
   3GB
   ============================================================ */

function getMainText(
  receipt: ReceiptData,
): string {
  if (
    receipt.type ===
    'data'
  ) {
    return getDescription(
      receipt,
    );
  }

  return (
    getDescription(
      receipt,
    ) || 'Transaction'
  );
}

/* ============================================================
   DATE

   Supports:
   - date + time
   - createdAt
   - metadata.createdAt
   - metadata.created_at
   ============================================================ */

function getCreatedDate(
  receipt: ReceiptData,
): Date | null {
  const metadata =
    receipt.metadata ?? {};

  const candidates = [
    receipt.createdAt,
    metadata.createdAt,
    metadata.created_at,
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }

    const date =
      new Date(
        String(value),
      );

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date;
    }
  }

  return null;
}

function formatDateTime(
  receipt: ReceiptData,
): string {
  const rawDate =
    String(
      receipt.date ?? '',
    ).trim();

  const rawTime =
    String(
      receipt.time ?? '',
    ).trim();

  /*
   * Already exactly:
   *
   * 30/07/2026
   */
  if (
    /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(
      rawDate,
    )
  ) {
    const normalized =
      rawDate.replace(
        /-/g,
        '/',
      );

    if (rawTime) {
      return `${normalized}, ${rawTime}`;
    }

    const created =
      getCreatedDate(
        receipt,
      );

    if (created) {
      const hours =
        String(
          created.getHours(),
        ).padStart(2, '0');

      const minutes =
        String(
          created.getMinutes(),
        ).padStart(2, '0');

      const seconds =
        String(
          created.getSeconds(),
        ).padStart(2, '0');

      return `${normalized}, ${hours}:${minutes}:${seconds}`;
    }

    return normalized;
  }

  /*
   * If date is an ISO date.
   */
  if (rawDate) {
    const parsed =
      new Date(
        `${rawDate}${
          rawTime
            ? ` ${rawTime}`
            : ''
        }`,
      );

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
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
  }

  /*
   * createdAt fallback.
   */
  const created =
    getCreatedDate(
      receipt,
    );

  if (created) {
    const day =
      String(
        created.getDate(),
      ).padStart(2, '0');

    const month =
      String(
        created.getMonth() + 1,
      ).padStart(2, '0');

    const year =
      created.getFullYear();

    const hours =
      String(
        created.getHours(),
      ).padStart(2, '0');

    const minutes =
      String(
        created.getMinutes(),
      ).padStart(2, '0');

    const seconds =
      String(
        created.getSeconds(),
      ).padStart(2, '0');

    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  }

  return '—';
}

/* ============================================================
   STATUS

   Reference image uses Success.
   ============================================================ */

function getStatus(
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
   RECEIPT SVG

   NOTHING EXTRA IS ADDED:
   - MTN
   - 3GB
   - Success
   - Recipient
   - Description
   - Date

   NO amount.
   NO transaction ID.
   NO reference.
   NO "Data purchase - MTN phone".
   ============================================================ */

function buildReceiptSvg(
  receipt: ReceiptData,
): string {
  const network =
    getNetwork();

  const title =
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

  const date =
    formatDateTime(
      receipt,
    );

  const status =
    getStatus(
      receipt,
    );

  /*
   * Keep 3GB exactly like the reference.
   * Only reduce font when a very long plan name
   * is actually supplied.
   */
  const titleSize =
    title.length <= 6
      ? 126
      : title.length <= 10
        ? 105
        : 84;

  const descriptionSize =
    description.length <= 8
      ? 54
      : description.length <= 14
        ? 46
        : 38;

  const recipientSize =
    recipient.length <= 14
      ? 50
      : 42;

  const dateSize =
    date.length <= 23
      ? 47
      : 39;

  return `<?xml version="1.0" encoding="UTF-8"?>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${RECEIPT_WIDTH}"
  height="${RECEIPT_HEIGHT}"
  viewBox="0 0 ${RECEIPT_WIDTH} ${RECEIPT_HEIGHT}"
>

  <defs>

    <!-- =====================================================
         WHITE PAPER
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
        offset="55%"
        stop-color="#fdfdfd"
      />

      <stop
        offset="100%"
        stop-color="#f8f8f6"
      />
    </linearGradient>

    <!-- =====================================================
         GOLD BORDER
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
        stop-color="#8b6425"
      />

      <stop
        offset="16%"
        stop-color="#f0d98d"
      />

      <stop
        offset="35%"
        stop-color="#fff2b0"
      />

      <stop
        offset="56%"
        stop-color="#ad7c29"
      />

      <stop
        offset="78%"
        stop-color="#ead080"
      />

      <stop
        offset="100%"
        stop-color="#8b6425"
      />
    </linearGradient>

    <!-- =====================================================
         GOLD FACE
         =================================================== -->

    <linearGradient
      id="goldFace"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0%"
        stop-color="#fff3ae"
      />

      <stop
        offset="30%"
        stop-color="#f8df91"
      />

      <stop
        offset="58%"
        stop-color="#b9872e"
      />

      <stop
        offset="80%"
        stop-color="#f0d27b"
      />

      <stop
        offset="100%"
        stop-color="#986d25"
      />
    </linearGradient>

    <!-- =====================================================
         CREAM CENTER
         =================================================== -->

    <radialGradient
      id="creamCenter"
      cx="50%"
      cy="45%"
      r="62%"
    >
      <stop
        offset="0%"
        stop-color="#fffdf8"
      />

      <stop
        offset="50%"
        stop-color="#fdf8e9"
      />

      <stop
        offset="100%"
        stop-color="#f0e4c4"
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
        stop-color="#273e61"
      />

      <stop
        offset="30%"
        stop-color="#142d50"
      />

      <stop
        offset="65%"
        stop-color="#061a35"
      />

      <stop
        offset="100%"
        stop-color="#294b73"
      />
    </linearGradient>

    <!-- =====================================================
         LIGHT GEOMETRIC PATTERN
         =================================================== -->

    <pattern
      id="geometry"
      width="82"
      height="82"
      patternUnits="userSpaceOnUse"
    >

      <path
        d="M8 16 H38 L53 31 H84"
        fill="none"
        stroke="#dedfe0"
        stroke-width="3"
        opacity="0.65"
      />

      <path
        d="M-2 38 H28 L43 53 H74"
        fill="none"
        stroke="#e5e6e7"
        stroke-width="3"
        opacity="0.65"
      />

    </pattern>

    <!-- =====================================================
         BADGE SHADOW
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
        dy="11"
        stdDeviation="11"
        flood-color="#6f4e1c"
        flood-opacity="0.34"
      />
    </filter>

    <!-- =====================================================
         SUCCESS SHADOW
         =================================================== -->

    <filter
      id="successShadow"
      x="-40%"
      y="-50%"
      width="180%"
      height="220%"
    >
      <feDropShadow
        dx="0"
        dy="10"
        stdDeviation="10"
        flood-color="#091a32"
        flood-opacity="0.32"
      />
    </filter>

    <!-- =====================================================
         GOLD TEXT SHADOW
         =================================================== -->

    <filter
      id="goldTextShadow"
      x="-30%"
      y="-30%"
      width="160%"
      height="170%"
    >
      <feDropShadow
        dx="0"
        dy="3"
        stdDeviation="2"
        flood-color="#70501c"
        flood-opacity="0.38"
      />
    </filter>

  </defs>

  <!-- =======================================================
       PAPER
       ===================================================== -->

  <rect
    x="0"
    y="0"
    width="1195"
    height="1279"
    rx="66"
    fill="url(#paper)"
  />

  <!-- OUTER GOLD -->

  <rect
    x="5"
    y="5"
    width="1185"
    height="1269"
    rx="61"
    fill="none"
    stroke="url(#goldBorder)"
    stroke-width="10"
  />

  <!-- INNER GOLD -->

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

  <!-- =======================================================
       OUTER GEOMETRY
       ===================================================== -->

  <circle
    cx="597.5"
    cy="650"
    r="458"
    fill="url(#geometry)"
    opacity="0.85"
  />

  <!-- =======================================================
       MAIN CREAM CIRCLE
       ===================================================== -->

  <circle
    cx="597.5"
    cy="675"
    r="424"
    fill="url(#creamCenter)"
  />

  <circle
    cx="597.5"
    cy="675"
    r="421"
    fill="none"
    stroke="#eee8dc"
    stroke-width="2"
  />

  <!-- =======================================================
       MTN BADGE
       ===================================================== -->

  <g
    filter="url(#badgeShadow)"
  >

    <circle
      cx="597.5"
      cy="181"
      r="108"
      fill="url(#goldBorder)"
      stroke="#886323"
      stroke-width="4"
    />

    <circle
      cx="597.5"
      cy="181"
      r="94"
      fill="url(#goldFace)"
      stroke="#fff2b1"
      stroke-width="4"
    />

    <circle
      cx="597.5"
      cy="181"
      r="88"
      fill="none"
      stroke="#d2ae55"
      stroke-width="2"
    />

    <ellipse
      cx="597.5"
      cy="181"
      rx="75"
      ry="47"
      fill="#f1d67f"
      stroke="#111111"
      stroke-width="7"
    />

    <ellipse
      cx="597.5"
      cy="181"
      rx="65"
      ry="39"
      fill="#f6dc8d"
    />

    <text
      x="597.5"
      y="197"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="42"
      font-weight="900"
      fill="#141414"
    >MTN</text>

  </g>

  <!-- =======================================================
       MTN
       ===================================================== -->

  <text
    x="597.5"
    y="390"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="60"
    font-weight="500"
    fill="#c7a34f"
    letter-spacing="1"
  >${network}</text>

  <!-- =======================================================
       3GB
       ===================================================== -->

  <text
    x="597.5"
    y="555"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${titleSize}"
    font-weight="900"
    letter-spacing="1"
    fill="url(#goldFace)"
    stroke="#f8e5a7"
    stroke-width="3"
    paint-order="stroke"
    filter="url(#goldTextShadow)"
  >${escapeXml(
    title,
  )}</text>

  <!-- =======================================================
       SUCCESS BUTTON
       ===================================================== -->

  <g
    filter="url(#successShadow)"
  >

    <!-- GOLD OUTER -->

    <rect
      x="399"
      y="601"
      width="397"
      height="142"
      rx="71"
      fill="url(#goldBorder)"
      stroke="#8c6726"
      stroke-width="5"
    />

    <!-- BLUE -->

    <rect
      x="411"
      y="613"
      width="373"
      height="118"
      rx="59"
      fill="url(#successBlue)"
      stroke="#efd17b"
      stroke-width="5"
    />

    <!-- TOP HIGHLIGHT -->

    <path
      d="
        M449 637
        C522 620
        673 620
        746 637
      "
      fill="none"
      stroke="#ffffff"
      stroke-width="9"
      stroke-linecap="round"
      stroke-opacity="0.30"
    />

    <!-- SUCCESS -->

    <text
      x="597.5"
      y="699"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="58"
      font-weight="800"
      fill="#f4d67d"
    >${escapeXml(
      status,
    )}</text>

  </g>

  <!-- =======================================================
       DIVIDER
       ===================================================== -->

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

  <!-- =======================================================
       RECIPIENT
       ===================================================== -->

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
  >${escapeXml(
    recipient,
  )}</text>

  <!-- =======================================================
       DESCRIPTION
       ===================================================== -->

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
  >${escapeXml(
    description,
  )}</text>

  <!-- =======================================================
       DATE
       ===================================================== -->

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
  >${escapeXml(
    date,
  )}</text>

</svg>`;
}

/* ============================================================
   SVG -> JPEG IMAGE

   The same SVG shown in View Receipt is converted into the
   image sent to WhatsApp.
   ============================================================ */

function receiptToFile(
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
                'Canvas unavailable',
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
                      'Unable to create receipt image',
                    ),
                  );

                  return;
                }

                resolve(
                  new File(
                    [jpeg],
                    'MTN-Receipt.jpg',
                    {
                      type:
                        'image/jpeg',
                      lastModified:
                        Date.now(),
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
              'Unable to render receipt',
            ),
          );
        };

      image.src =
        url;
    },
  );
}

/* ============================================================
   SVG DATA URL
   ============================================================ */

function svgDataUrl(
  svg: string,
): string {
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(svg)
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function TransactionReceipt({
  receipt,
  onDone,
  doneLabel = 'Close',
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

  /*
   * ONE receipt source.
   *
   * What appears on screen is exactly what gets converted
   * to the image for sharing.
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
     WHATSAPP / SYSTEM IMAGE SHARE
     ======================================================== */

  const shareReceipt =
    async () => {
      if (isSharing) {
        return;
      }

      setIsSharing(
        true,
      );

      try {
        const file =
          await receiptToFile(
            svg,
          );

        /*
         * IMAGE ONLY.
         *
         * No text.
         * No URL.
         * No amount.
         *
         * Android/WhatsApp receives the actual JPG.
         */
        if (
          typeof navigator.canShare ===
            'function'
        ) {
          const canShare =
            navigator.canShare({
              files: [file],
            });

          if (!canShare) {
            toast.error(
              'This device cannot share the receipt image.',
            );

            return;
          }
        }

        if (
          typeof navigator.share !==
          'function'
        ) {
          toast.error(
            'Image sharing is not supported on this browser.',
          );

          return;
        }

        await navigator.share({
          files: [file],
        });
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
          'Receipt share failed:',
          error,
        );

        toast.error(
          'Unable to share receipt image.',
        );
      } finally {
        setIsSharing(
          false,
        );
      }
    };

  /* ==========================================================
     VIEW
     ======================================================== */

  return (
    <div className="mx-auto w-full max-w-[390px]">

      {/* ======================================================
          EXACT RECEIPT
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
          alt="MTN Receipt"
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
          BUTTONS
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
              rounded-full
              bg-[#159D8C]
              px-4
              text-[13px]
              font-bold
              text-white
              shadow-[0_4px_12px_rgba(21,157,140,0.20)]
              transition
              active:scale-[0.98]
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            <Share2
              className="
                h-5
                w-5
              "
            />

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
                flex-[0.78]
                items-center
                justify-center
                rounded-full
                bg-[#0B1F4E]
                px-4
                text-[13px]
                font-bold
                text-white
                shadow-[0_4px_12px_rgba(11,31,78,0.18)]
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
