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

const RECEIPT_WIDTH = 1195;
const RECEIPT_HEIGHT = 1279;

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getMetadataValue(
  receipt: ReceiptData,
  keys: string[],
): string {
  const metadata = receipt.metadata;

  if (!metadata) {
    return '';
  }

  for (const key of keys) {
    const value = clean(metadata[key]);

    if (value) {
      return value;
    }
  }

  return '';
}

/* ============================================================================
 * NETWORK
 * ========================================================================== */

function getNetwork(
  receipt: ReceiptData,
): string {
  const metadataNetwork =
    getMetadataValue(receipt, [
      'network',
      'networkName',
      'network_name',
    ]);

  const provider =
    metadataNetwork ||
    clean(receipt.provider);

  /*
   * BuyData currently uses GY DATA as provider.
   * The actual network is normally inside metadata.
   * For the supplied reference receipt, the fallback
   * is MTN.
   */
  if (
    !provider ||
    /^(gy\s*data|smeapi|sme\s*api)$/i.test(
      provider,
    )
  ) {
    return 'MTN';
  }

  return provider.toUpperCase();
}

/* ============================================================================
 * RECIPIENT
 * ========================================================================== */

function getRecipient(
  receipt: ReceiptData,
): string {
  return (
    clean(receipt.recipient) ||
    clean(receipt.phone) ||
    getMetadataValue(receipt, [
      'phone',
      'recipientPhone',
      'recipient',
      'mobile',
      'customerPhone',
      'phoneNumber',
      'phone_number',
    ]) ||
    '—'
  );
}

/* ============================================================================
 * DESCRIPTION
 * ========================================================================== */

function getDescription(
  receipt: ReceiptData,
): string {
  /*
   * IMPORTANT:
   * The API description can be:
   *
   * Data purchase - mtn 09166941847
   *
   * That must NEVER appear on the receipt.
   *
   * The actual plan name is available in metadata.planName.
   */

  const planName =
    getMetadataValue(receipt, [
      'planName',
      'plan_name',
      'dataPlanName',
      'data_plan_name',
      'plan',
    ]);

  if (planName) {
    return planName;
  }

  let description =
    clean(receipt.description);

  if (!description) {
    return '—';
  }

  description = description
    .replace(
      /^data\s+purchase\s*-\s*/i,
      '',
    )
    .trim();

  const recipient =
    getRecipient(receipt);

  if (
    recipient !== '—' &&
    description.endsWith(recipient)
  ) {
    description = description
      .slice(
        0,
        description.length -
          recipient.length,
      )
      .trim();
  }

  /*
   * If the API sent:
   * Data purchase - mtn 09166941847
   *
   * and metadata planName is missing, try to
   * extract the plan portion.
   */
  const phoneAtEnd =
    description.match(
      /^(.*?)(?:\s+\d{10,15})$/i,
    );

  if (
    phoneAtEnd &&
    phoneAtEnd[1]
  ) {
    description =
      phoneAtEnd[1].trim();
  }

  return (
    description ||
    clean(receipt.service) ||
    '—'
  );
}

/* ============================================================================
 * DATE
 * ========================================================================== */

function getDateCandidate(
  receipt: ReceiptData,
): string {
  return (
    clean(receipt.createdAt) ||
    getMetadataValue(receipt, [
      'createdAt',
      'created_at',
      'timestamp',
      'date',
      'transactionDate',
      'transaction_date',
    ])
  );
}

function parseDateTime(
  receipt: ReceiptData,
): Date | null {
  const createdAt =
    getDateCandidate(receipt);

  if (createdAt) {
    const parsed =
      new Date(createdAt);

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed;
    }
  }

  const dateText =
    clean(receipt.date);

  const timeText =
    clean(receipt.time);

  /*
   * Handle:
   * 30/07/2026
   * 30-07-2026
   */
  const slash =
    dateText.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
    );

  if (slash) {
    const day =
      Number(slash[1]);

    const month =
      Number(slash[2]);

    const year =
      Number(slash[3]);

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    const timeMatch =
      timeText.match(
        /^(\d{1,2}):(\d{2})(?::(\d{2}))?/,
      );

    if (timeMatch) {
      hours =
        Number(timeMatch[1]);

      minutes =
        Number(timeMatch[2]);

      seconds =
        Number(
          timeMatch[3] ?? 0,
        );
    }

    const parsed =
      new Date(
        year,
        month - 1,
        day,
        hours,
        minutes,
        seconds,
      );

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed;
    }
  }

  if (dateText) {
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
  }

  return null;
}

function formatDateTime(
  receipt: ReceiptData,
): string {
  const parsed =
    parseDateTime(receipt);

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
      String(
        parsed.getFullYear(),
      );

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

  const date =
    clean(receipt.date);

  const time =
    clean(receipt.time);

  if (date) {
    const normalizedDate =
      date.replace(
        /-/g,
        '/',
      );

    return time
      ? `${normalizedDate}, ${time}`
      : normalizedDate;
  }

  /*
   * Last fallback:
   * if the transaction has no date at all,
   * use the transaction creation time.
   */
  const metadataCreatedAt =
    getMetadataValue(receipt, [
      'createdAt',
      'created_at',
      'timestamp',
    ]);

  if (metadataCreatedAt) {
    const fallback =
      new Date(
        metadataCreatedAt,
      );

    if (
      !Number.isNaN(
        fallback.getTime(),
      )
    ) {
      const day =
        String(
          fallback.getDate(),
        ).padStart(2, '0');

      const month =
        String(
          fallback.getMonth() + 1,
        ).padStart(2, '0');

      const year =
        fallback.getFullYear();

      const hours =
        String(
          fallback.getHours(),
        ).padStart(2, '0');

      const minutes =
        String(
          fallback.getMinutes(),
        ).padStart(2, '0');

      const seconds =
        String(
          fallback.getSeconds(),
        ).padStart(2, '0');

      return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
    }
  }

  return '—';
}

/* ============================================================================
 * RECEIPT SVG
 *
 * This exact SVG is used for:
 *
 * 1. View Receipt
 * 2. Shared WhatsApp image
 *
 * The shared image therefore has exactly the same:
 * MTN
 * 3GB / plan name
 * Success
 * Recipient
 * Description
 * Date
 *
 * No amount.
 * No transaction reference.
 * No payment method.
 * No "Data purchase - MTN phone" text.
 * ========================================================================== */

function buildReceiptSvg(
  receipt: ReceiptData,
): string {
  const network =
    getNetwork(receipt);

  const recipient =
    getRecipient(receipt);

  const description =
    getDescription(receipt);

  const dateTime =
    formatDateTime(receipt);

  const statusText =
    receipt.status ===
    'success'
      ? 'Success'
      : receipt.status ===
          'pending'
        ? 'Pending'
        : 'Failed';

  const titleSize =
    description.length > 9
      ? 104
      : 126;

  const descriptionSize =
    description.length > 18
      ? 42
      : 54;

  const recipientSize =
    recipient.length > 14
      ? 39
      : 48;

  const dateSize =
    dateTime.length > 23
      ? 38
      : 46;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${RECEIPT_WIDTH}"
  height="${RECEIPT_HEIGHT}"
  viewBox="0 0 ${RECEIPT_WIDTH} ${RECEIPT_HEIGHT}"
>
  <defs>

    <!-- PAPER -->

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

    <!-- GOLD -->

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
      id="goldDark"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >
      <stop
        offset="0"
        stop-color="#fff0a8"
      />

      <stop
        offset="0.55"
        stop-color="#c39439"
      />

      <stop
        offset="1"
        stop-color="#8e6420"
      />
    </linearGradient>

    <!-- SUCCESS BLUE -->

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

    <!-- CENTER -->

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

    <!-- PATTERN -->

    <pattern
      id="chevrons"
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

    <!-- SHADOW -->

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

    <filter
      id="textShadow"
      x="-30%"
      y="-30%"
      width="160%"
      height="170%"
    >
      <feDropShadow
        dx="0"
        dy="2"
        stdDeviation="1.5"
        flood-color="#6c4a13"
        flood-opacity="0.45"
      />
    </filter>

  </defs>

  <!-- OUTER PAPER -->

  <rect
    width="${RECEIPT_WIDTH}"
    height="${RECEIPT_HEIGHT}"
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

  <!-- BACKGROUND -->

  <circle
    cx="597.5"
    cy="653"
    r="460"
    fill="url(#chevrons)"
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

  <!-- MTN BADGE -->

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
      fill="url(#goldDark)"
      stroke="#111827"
      stroke-width="7"
    />

    <ellipse
      cx="597.5"
      cy="181"
      rx="65"
      ry="39"
      fill="#f5d97f"
      opacity="0.88"
    />

    <text
      x="597.5"
      y="198"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="42"
      font-weight="900"
      fill="#111827"
    >${escapeXml(network)}</text>

  </g>

  <!-- NETWORK -->

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

  <!-- PLAN -->

  <text
    x="597.5"
    y="553"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${titleSize}"
    font-weight="900"
    fill="#b58a35"
    stroke="#f9e9af"
    stroke-width="3"
    paint-order="stroke"
    filter="url(#textShadow)"
  >${escapeXml(description)}</text>

  <!-- SUCCESS -->

  <g filter="url(#softShadow)">

    <rect
      x="390"
      y="598"
      width="415"
      height="142"
      rx="71"
      fill="url(#goldDark)"
      stroke="#8d6827"
      stroke-width="5"
    />

    <rect
      x="403"
      y="611"
      width="389"
      height="116"
      rx="58"
      fill="url(#blue)"
      stroke="#f2d27a"
      stroke-width="5"
    />

    <path
      d="M444 637 C520 620 677 621 753 637"
      fill="none"
      stroke="#ffffff"
      stroke-opacity="0.26"
      stroke-width="9"
      stroke-linecap="round"
    />

    <text
      x="597.5"
      y="697"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="58"
      font-weight="800"
      fill="#f4d77e"
    >${escapeXml(statusText)}</text>

  </g>

  <!-- DIVIDER -->

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

  <!-- RECIPIENT -->

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

  <!-- DESCRIPTION -->

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

  <!-- DATE -->

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
  >${escapeXml(dateTime)}</text>

</svg>`;
}

/* ============================================================================
 * SVG -> JPEG
 * ========================================================================== */

function svgToJpegFile(
  svg: string,
): Promise<File> {
  return new Promise(
    (resolve, reject) => {
      const blob =
        new Blob(
          [svg],
          {
            type:
              'image/svg+xml;charset=utf-8',
          },
        );

      const url =
        URL.createObjectURL(blob);

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
              0.95,
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

/* ============================================================================
 * DATA URL
 * ========================================================================== */

function dataUrlFromSvg(
  svg: string,
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg,
  )}`;
}

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

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

  /*
   * One SVG is used for both:
   *
   * - View Receipt
   * - WhatsApp sharing
   *
   * So the receipt users see and the receipt
   * they share are identical.
   */
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

        /*
         * Share the actual receipt image.
         * No text message is generated.
         */
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
            files: [file],
          });

          return;
        }

        /*
         * Fallback for WebViews where
         * canShare() is not available.
         */
        if (
          typeof navigator.share ===
          'function'
        ) {
          try {
            await navigator.share({
              title:
                'GY DATA Receipt',
              files: [file],
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

        toast.error(
          'This device cannot share the receipt image.',
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
          'Unable to share receipt image.',
        );
      } finally {
        setIsSharing(false);
      }
    };

  return (
    <div className="mx-auto w-full max-w-[390px]">

      {/* ================================================================
          RECEIPT
          ================================================================ */}

      <div className="overflow-hidden rounded-[22px] border border-[#b88b32] bg-white shadow-[0_16px_45px_rgba(11,31,78,0.18)]">
        <img
          src={dataUrlFromSvg(svg)}
          alt="GY DATA receipt"
          className="block h-auto w-full"
          draggable={false}
        />
      </div>

      {/* ================================================================
          ACTIONS
          ================================================================ */}

      {showActions && (
        <div className="mx-auto mt-3 flex w-full gap-2">

          <button
            type="button"
            onClick={() =>
              void shareReceipt()
            }
            disabled={isSharing}
            className="
              flex
              h-11
              flex-1
              items-center
              justify-center
              gap-2
              rounded-xl
              border
              border-green-200
              bg-green-50
              text-[12px]
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
              : 'Share to WhatsApp'}
          </button>

          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="
                flex
                h-11
                flex-[0.9]
                items-center
                justify-center
                rounded-xl
                bg-[#0B1F4E]
                text-[12px]
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
