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

const RECEIPT_WIDTH = 1195;
const RECEIPT_HEIGHT = 1279;

function clean(
  value: unknown,
): string {
  return String(value ?? '').trim();
}

function escapeXml(
  value: unknown,
): string {
  return String(value ?? '')
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

function getMetadataString(
  receipt: ReceiptData,
  keys: string[],
): string {
  const metadata =
    receipt.metadata;

  if (
    !metadata ||
    typeof metadata !==
      'object'
  ) {
    return '';
  }

  for (const key of keys) {
    const value =
      metadata[key];

    if (
      value !== undefined &&
      value !== null &&
      clean(value)
    ) {
      return clean(value);
    }
  }

  return '';
}

function getNetwork(
  receipt: ReceiptData,
): string {
  const metadataNetwork =
    getMetadataString(
      receipt,
      [
        'network',
        'networkName',
      ],
    );

  const provider =
    metadataNetwork ||
    clean(receipt.provider);

  if (
    /^(mtn|mtn\s*nigeria)$/i.test(
      provider,
    )
  ) {
    return 'MTN';
  }

  if (
    /^(airtel|airtel\s*nigeria)$/i.test(
      provider,
    )
  ) {
    return 'Airtel';
  }

  if (
    /^glo$/i.test(
      provider,
    )
  ) {
    return 'Glo';
  }

  if (
    /^(9mobile|9\s*mobile)$/i.test(
      provider,
    )
  ) {
    return '9mobile';
  }

  if (
    /^(gy\s*data|smeapi|sme\s*api)$/i.test(
      provider,
    ) ||
    !provider
  ) {
    return 'MTN';
  }

  return provider;
}

function getDescription(
  receipt: ReceiptData,
): string {
  const metadataPlan =
    getMetadataString(
      receipt,
      [
        'planName',
        'plan_name',
        'dataPlanName',
        'data_plan_name',
      ],
    );

  if (metadataPlan) {
    return metadataPlan;
  }

  const raw =
    clean(
      receipt.description,
    );

  if (!raw) {
    return 'Data';
  }

  /*
   * Never show:
   * Data purchase - mtn 091xxxxxxxx
   */
  const purchaseMatch =
    raw.match(
      /^data\s+purchase\s*-\s*(.+?)\s+\d{7,15}$/i,
    );

  if (
    purchaseMatch?.[1]
  ) {
    return clean(
      purchaseMatch[1],
    );
  }

  const withoutPhone =
    raw.replace(
      /\s+\d{7,15}\s*$/i,
      '',
    );

  if (
    /^data\s+purchase\s*-/i.test(
      withoutPhone,
    )
  ) {
    const cleaned =
      withoutPhone.replace(
        /^data\s+purchase\s*-\s*/i,
        '',
      );

    if (cleaned) {
      return cleaned;
    }
  }

  return raw;
}

function getRecipient(
  receipt: ReceiptData,
): string {
  return (
    clean(
      receipt.phone ??
        receipt.recipient,
    ) ||
    getMetadataString(
      receipt,
      [
        'phone',
        'recipientPhone',
        'recipient',
        'mobile',
        'customerPhone',
      ],
    ) ||
    '—'
  );
}

function getDateObject(
  receipt: ReceiptData,
): Date | null {
  const metadataCreatedAt =
    getMetadataString(
      receipt,
      [
        'createdAt',
        'created_at',
        'timestamp',
      ],
    );

  const candidates = [
    clean(
      receipt.createdAt,
    ),
    metadataCreatedAt,
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }

    const parsed =
      new Date(value);

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

      const parsed =
        new Date(
          year,
          month - 1,
          day,
        );

      if (
        !Number.isNaN(
          parsed.getTime(),
        )
      ) {
        return parsed;
      }
    }
  }

  return null;
}

function formatDateTime(
  receipt: ReceiptData,
): string {
  const dateText =
    clean(receipt.date);

  const timeText =
    clean(receipt.time);

  /*
   * If the transaction already has
   * the exact reference format, keep it.
   */
  if (
    /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(
      dateText,
    )
  ) {
    const normalized =
      dateText.replace(
        /-/g,
        '/',
      );

    if (timeText) {
      return `${normalized}, ${timeText}`;
    }
  }

  const parsed =
    getDateObject(
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

  if (
    dateText &&
    timeText
  ) {
    return `${dateText}, ${timeText}`;
  }

  return (
    dateText ||
    timeText ||
    '—'
  );
}

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
    clean(
      receipt.service,
    ) ||
    getDescription(
      receipt,
    ) ||
    'Transaction'
  );
}

function buildReceiptSvg(
  receipt: ReceiptData,
): string {
  const network =
    getNetwork(
      receipt,
    );

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

  const success =
    clean(
      receipt.status,
    ).toLowerCase() ===
    'success';

  const statusText =
    success
      ? 'Success'
      : clean(
            receipt.status,
          ).toLowerCase() ===
          'pending'
        ? 'Pending'
        : 'Failed';

  const titleSize =
    mainText.length > 9
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
      cx="50%"
      cy="50%"
      r="50%"
    >
      <stop
        offset="0"
        stop-color="#ffffff"
        stop-opacity="0.95"
      />
      <stop
        offset="0.65"
        stop-color="#f5f0e6"
        stop-opacity="0.72"
      />
      <stop
        offset="1"
        stop-color="#ece7dd"
        stop-opacity="0.2"
      />
    </radialGradient>

    <pattern
      id="chevrons"
      width="80"
      height="80"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <path
        d="M0 0 L40 40 L0 80"
        fill="none"
        stroke="#e6e7e8"
        stroke-width="3"
        opacity="0.55"
      />
      <path
        d="M40 0 L80 40 L40 80"
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
      height="160%"
    >
      <feDropShadow
        dx="0"
        dy="12"
        stdDeviation="12"
        flood-color="#6e5424"
        flood-opacity="0.25"
      />
    </filter>

    <filter
      id="softShadow"
      x="-20%"
      y="-20%"
      width="140%"
      height="150%"
    >
      <feDropShadow
        dx="0"
        dy="8"
        stdDeviation="8"
        flood-color="#101828"
        flood-opacity="0.18"
      />
    </filter>

    <filter
      id="textShadow"
      x="-20%"
      y="-20%"
      width="140%"
      height="150%"
    >
      <feDropShadow
        dx="0"
        dy="3"
        stdDeviation="2"
        flood-color="#5e4619"
        flood-opacity="0.22"
      />
    </filter>

  </defs>

  <!-- PAPER -->

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
    >${escapeXml(
      network,
    )}</text>

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
  >${escapeXml(
    network,
  )}</text>

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
  >${escapeXml(
    mainText,
  )}</text>

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
    >${escapeXml(
      statusText,
    )}</text>

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
  >${escapeXml(
    recipient,
  )}</text>

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
  >${escapeXml(
    description,
  )}</text>

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
  >${escapeXml(
    dateTime,
  )}</text>

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
                    [
                      jpeg,
                    ],
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

function svgDataUrl(
  svg: string,
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg,
  )}`;
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
            files: [
              file,
            ],
          })
        ) {
          await navigator.share({
            title:
              'GY DATA Receipt',
            files: [
              file,
            ],
          });

          return;
        }

        if (
          typeof navigator.share ===
          'function'
        ) {
          try {
            await navigator.share({
              title:
                'GY DATA Receipt',
              files: [
                file,
              ],
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
          'This device cannot share the receipt as an image.',
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
          'Receipt image share failed:',
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

      <div className="overflow-hidden rounded-[22px] border border-[#b88b32] bg-white shadow-[0_16px_45px_rgba(11,31,78,0.18)]">

        <img
          src={svgDataUrl(svg)}
          alt="GY DATA receipt"
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
              onClick={
                onDone
              }
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
