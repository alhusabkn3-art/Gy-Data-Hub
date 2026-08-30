/**
 * ClubKonnect / NelloByte API client
 *
 * IMPORTANT:
 * - MobileNumber is the canonical phone field for data purchase.
 * - PhoneNumber is NOT sent as an alias.
 * - Phone number is normalized to Nigerian 11-digit format.
 * - Credentials are never written to logs.
 */

import { logger } from './logger.js';

const BASE_URL =
  process.env['CLUBKONNECT_BASE_URL'] ||
  'https://www.nellobytesystems.com';

export interface CKPurchaseResult {
  status: string;
  OrderID?: string | null;
  ident?: string | null;
  DataPlanName?: string | null;
  MobileNumber?: string | null;
  MobileNetwork?: string | null;
  [key: string]: unknown;
}

export type CKStatus =
  | 'successful'
  | 'pending'
  | 'failed';

function getCredentials() {
  const userId =
    String(process.env['CLUBKONNECT_USER_ID'] || '').trim();

  const apiKey =
    String(process.env['CLUBKONNECT_API_KEY'] || '').trim();

  if (!userId || !apiKey) {
    throw new Error(
      'ClubKonnect credentials are not configured.',
    );
  }

  return { userId, apiKey };
}

/**
 * Convert supported Nigerian formats to:
 *
 * 080XXXXXXXX
 *
 * ClubKonnect receives exactly 11 digits.
 */
function normalizeMobileNumber(value: unknown): string {
  let phone =
    String(value ?? '')
      .trim()
      .replace(/\D/g, '');

  if (phone.startsWith('234') && phone.length === 13) {
    phone =
      `0${phone.slice(3)}`;
  }

  if (phone.length === 10 && !phone.startsWith('0')) {
    phone =
      `0${phone}`;
  }

  if (!/^0\d{10}$/.test(phone)) {
    throw new Error(
      `Invalid Nigerian mobile number: expected 11 digits, received ${phone.length}.`,
    );
  }

  return phone;
}

export function getNetworkCode(
  network: unknown,
): string | null {
  const normalized =
    String(network ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');

  const map: Record<string, string> = {
    mtn: '01',
    glo: '02',
    globacom: '02',
    airtel: '03',
    mobile: '03',
    '9mobile': '04',
    etisalat: '04',
  };

  return map[normalized] ?? null;
}

function buildUrl(
  endpoint: string,
  params: Record<string, string | number | undefined | null>,
): URL {
  const url =
    new URL(endpoint, `${BASE_URL}/`);

  const { userId, apiKey } =
    getCredentials();

  url.searchParams.set(
    'UserID',
    userId,
  );

  url.searchParams.set(
    'APIKey',
    apiKey,
  );

  for (
    const [key, value] of Object.entries(params)
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value) !== ''
    ) {
      url.searchParams.set(
        key,
        String(value),
      );
    }
  }

  return url;
}

/**
 * API response may be JSON, text, or JSON embedded in text.
 */
async function requestCK(
  endpoint: string,
  params: Record<string, string | number | undefined | null>,
): Promise<any> {
  const url =
    buildUrl(
      endpoint,
      params,
    );

  /*
   * Never log the full URL.
   * It contains API credentials.
   */
  logger.info(
    {
      endpoint,
      hasUserID: Boolean(
        process.env['CLUBKONNECT_USER_ID'],
      ),
      hasAPIKey: Boolean(
        process.env['CLUBKONNECT_API_KEY'],
      ),
      params: Object.fromEntries(
        Object.entries(params).map(
          ([key, value]) => [
            key,
            key.toLowerCase().includes('mobile') ||
            key.toLowerCase().includes('phone')
              ? `***${String(value).slice(-4)}`
              : value,
          ],
        ),
      ),
    },
    'ClubKonnect API request',
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      },
    );

  const raw =
    await response.text();

  let data: any;

  try {
    data =
      JSON.parse(raw);
  } catch {
    /*
     * Some provider responses can be
     * JSON-like or plain text.
     */
    data = {
      status: raw.trim(),
      raw,
    };
  }

  logger.info(
    {
      endpoint,
      httpStatus: response.status,
      status:
        data?.status ??
        data?.Status ??
        null,
    },
    'ClubKonnect API response',
  );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect HTTP ${response.status}: ${
        typeof data === 'string'
          ? data
          : JSON.stringify(data)
      }`,
    );
  }

  return data;
}

/**
 * Normalizes provider statuses used by
 * purchase.ts and webhook/status logic.
 */
export function normalizeCKStatus(
  value: unknown,
): CKStatus {
  const status =
    String(value ?? '')
      .trim()
      .toLowerCase();

  if (
    [
      'successful',
      'success',
      'completed',
      'complete',
      'approved',
      'delivered',
    ].includes(status)
  ) {
    return 'successful';
  }

  if (
    [
      'pending',
      'processing',
      'in_progress',
      'in progress',
      'queued',
    ].includes(status)
  ) {
    return 'pending';
  }

  return 'failed';
}

/* ============================================================
   BALANCE
============================================================ */

export async function getBalance(): Promise<any> {
  return requestCK(
    'APIBalanceEnquiry.asp',
    {},
  );
}

/* ============================================================
   DATA PLANS
============================================================ */

export async function getDataPlans(
  network: unknown,
): Promise<any> {
  const networkCode =
    getNetworkCode(network);

  if (!networkCode) {
    throw new Error(
      `Unsupported network: ${String(network)}`,
    );
  }

  return requestCK(
    'APIDatabundlePlansV1.asp',
    {
      MobileNetwork: networkCode,
    },
  );
}

/* ============================================================
   TRANSACTION STATUS
============================================================ */

export async function getTransactionStatus(
  requestId: string,
): Promise<any> {
  if (!requestId) {
    throw new Error(
      'RequestID is required.',
    );
  }

  return requestCK(
    'APIQueryTransactionStatus.asp',
    {
      RequestID: requestId,
    },
  );
}

/* ============================================================
   AIRTIME PURCHASE
============================================================ */

export async function purchaseAirtime(
  input: {
    network: string;
    phone: string;
    amount: string | number;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(
      input.network,
    );

  if (!networkCode) {
    throw new Error(
      `Unsupported network: ${input.network}`,
    );
  }

  const mobileNumber =
    normalizeMobileNumber(
      input.phone,
    );

  return requestCK(
    'APIAirtimeV1.asp',
    {
      MobileNetwork: networkCode,
      Amount: input.amount,
      MobileNumber: mobileNumber,
      RequestID: input.requestId,
    },
  );
}

/* ============================================================
   DATA PURCHASE
============================================================ */

export async function purchaseData(
  input: {
    network: string;
    phone: string;
    planCode: string;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(
      input.network,
    );

  if (!networkCode) {
    throw new Error(
      `Unsupported network: ${input.network}`,
    );
  }

  const mobileNumber =
    normalizeMobileNumber(
      input.phone,
    );

  const dataPlan =
    String(input.planCode ?? '').trim();

  if (!dataPlan) {
    throw new Error(
      'DataPlan is required.',
    );
  }

  if (!input.requestId) {
    throw new Error(
      'RequestID is required.',
    );
  }

  /*
   * CRITICAL:
   *
   * Send MobileNumber only.
   *
   * Do not send PhoneNumber.
   * The provider's documented parameter for
   * APIDatabundleV1.asp is MobileNumber.
   */
  const result =
    await requestCK(
      'APIDatabundleV1.asp',
      {
        MobileNetwork: networkCode,
        DataPlan: dataPlan,
        MobileNumber: mobileNumber,
        RequestID: input.requestId,
      },
    );

  return {
    ...result,
    status:
      String(
        result?.status ??
        result?.Status ??
        result?.STATUS ??
        'failed',
      ),
  };
}
