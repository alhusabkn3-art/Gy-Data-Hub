/**
 * ClubKonnect API client.
 *
 * Server-side only.
 * Credentials are read from environment variables at request time.
 */

import { logger } from './logger.js';

const BASE_URL = 'https://www.nellobytesystems.com';

const TIMEOUT_READ = 15_000;
const TIMEOUT_PURCHASE = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// NETWORKS
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK_CODES: Record<string, string> = {
  mtn: '01',
  glo: '02',
  '9mobile': '03',
  airtel: '04',
};

const NETWORK_RESPONSE_KEYS: Record<string, string[]> = {
  mtn: ['MTN'],
  glo: ['Glo'],
  '9mobile': ['m_9mobile', '9mobile'],
  airtel: ['Airtel'],
};

export function getNetworkCode(network: string): string {
  const normalized = String(network ?? '')
    .trim()
    .toLowerCase();

  const code = NETWORK_CODES[normalized];

  if (!code) {
    throw new Error(`Unknown network: ${network}`);
  }

  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────────────────────────────────────────

function getCredentials() {
  const userId = process.env['CLUBKONNECT_USER_ID'];
  const apiKey = process.env['CLUBKONNECT_API_KEY'];

  if (!userId || !apiKey) {
    throw new Error(
      'CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY are required',
    );
  }

  return {
    userId: userId.trim(),
    apiKey: apiKey.trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildUrl(
  endpoint: string,
  params: Record<string, string>,
): string {
  const { userId, apiKey } = getCredentials();

  const url = new URL(`${BASE_URL}/${endpoint}`);

  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      url.searchParams.set(
        key,
        String(value).trim(),
      );
    }
  }

  return url.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function asObject(
  value: unknown,
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  return String(value).trim();
}

/**
 * Convert a Nigerian phone number into the local format
 * accepted by ClubKonnect.
 *
 * 08012345678
 *      -> 08012345678
 *
 * +2348012345678
 *      -> 08012345678
 *
 * 2348012345678
 *      -> 08012345678
 *
 * 8012345678
 *      -> 08012345678
 */
function normalizePhoneNumber(
  phone: string,
): string {
  const raw = String(phone ?? '').trim();

  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('234')) {
    digits = `0${digits.slice(3)}`;
  }

  if (digits.length === 10) {
    digits = `0${digits}`;
  }

  if (!/^0\d{10}$/.test(digits)) {
    throw new Error(
      `Invalid Nigerian MobileNumber: ${
        raw || '[empty]'
      }`,
    );
  }

  return digits;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeCKStatus(
  status: string | undefined | null,
): 'success' | 'pending' | 'failed' {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === 'successful' ||
    normalized === 'success' ||
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'order_completed'
  ) {
    return 'success';
  }

  if (
    normalized === 'pending' ||
    normalized === 'order_received' ||
    normalized === 'processing' ||
    normalized === 'order_onhold' ||
    normalized.includes('processing')
  ) {
    return 'pending';
  }

  return 'failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CKBalance {
  balance: string;
  date?: string;
  id?: string;
  phoneno?: string;
  APIBalance?: string;
  [key: string]: unknown;
}

export interface CKDataPlan {
  DataPlan: string;
  DataPlanName: string;
  DataPlanType: string;
  Price: string;
}

export interface CKPurchaseResult {
  status: string;
  OrderID?: string;
  orderid?: string;
  ident?: string;
  Amount?: string;
  DataPlanName?: string;
  Price?: string;
  MobileNumber?: string;
  MobileNetwork?: string;
  statuscode?: string;
  remark?: string;
  orderstatus?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE
// ─────────────────────────────────────────────────────────────────────────────

export async function getBalance(): Promise<CKBalance> {
  const url = buildUrl(
    'APIWalletBalanceV1.asp',
    {},
  );

  const response = await fetchTimeout(
    url,
    TIMEOUT_READ,
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `ClubKonnect balance HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty balance response.',
    );
  }

  try {
    return JSON.parse(
      responseText,
    ) as CKBalance;
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid balance response.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PLANS
// ─────────────────────────────────────────────────────────────────────────────

export async function getDataPlans(
  network: string,
  _phone?: string,
): Promise<CKDataPlan[]> {
  const normalizedNetwork =
    String(network ?? '')
      .trim()
      .toLowerCase();

  const networkCode =
    getNetworkCode(
      normalizedNetwork,
    );

  const responseKeys =
    NETWORK_RESPONSE_KEYS[
      normalizedNetwork
    ];

  if (!responseKeys) {
    throw new Error(
      `Unsupported network: ${network}`,
    );
  }

  const url =
    `${BASE_URL}/APIDatabundlePlansV2.asp`;

  logger.info(
    {
      network: normalizedNetwork,
      networkCode,
      endpoint:
        'APIDatabundlePlansV2.asp',
    },
    'Fetching ClubKonnect data plans',
  );

  let response: Response;

  try {
    response = await fetchTimeout(
      url,
      TIMEOUT_READ,
    );
  } catch (error) {
    logger.error(
      {
        network: normalizedNetwork,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data plan request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while fetching data plans.',
    );
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    logger.error(
      {
        network: normalizedNetwork,
        httpStatus: response.status,
        responsePreview:
          responseText.slice(0, 1000),
      },
      'ClubKonnect data plans HTTP error',
    );

    throw new Error(
      `ClubKonnect data plans HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty data plans response.',
    );
  }

  let json: unknown;

  try {
    json = JSON.parse(
      responseText,
    );
  } catch {
    logger.error(
      {
        responsePreview:
          responseText.slice(0, 2000),
      },
      'ClubKonnect returned invalid JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid data plans response.',
    );
  }

  const root =
    asObject(json);

  if (!root) {
    throw new Error(
      'ClubKonnect data plans response has an invalid format.',
    );
  }

  const mobileNetwork =
    asObject(
      root['MOBILE_NETWORK'],
    );

  if (!mobileNetwork) {
    logger.error(
      {
        rootKeys:
          Object.keys(root),
      },
      'ClubKonnect response has no MOBILE_NETWORK object',
    );

    throw new Error(
      'ClubKonnect data plans response does not contain MOBILE_NETWORK.',
    );
  }

  let networkEntry:
    | unknown
    | undefined;

  for (const key of responseKeys) {
    if (
      mobileNetwork[key] !== undefined
    ) {
      networkEntry =
        mobileNetwork[key];
      break;
    }
  }

  if (networkEntry === undefined) {
    logger.error(
      {
        network: normalizedNetwork,
        networkCode,
        availableNetworks:
          Object.keys(
            mobileNetwork,
          ),
      },
      'Requested network was not found in ClubKonnect plans response',
    );

    return [];
  }

  const networkArray =
    Array.isArray(networkEntry)
      ? networkEntry
      : [networkEntry];

  const products: Record<
    string,
    unknown
  >[] = [];

  for (const entry of networkArray) {
    const entryObject =
      asObject(entry);

    if (!entryObject) {
      continue;
    }

    const productList =
      entryObject['PRODUCT'];

    if (!Array.isArray(productList)) {
      continue;
    }

    for (const product of productList) {
      const productObject =
        asObject(product);

      if (productObject) {
        products.push(
          productObject,
        );
      }
    }
  }

  const plans: CKDataPlan[] = [];

  for (const product of products) {
    const productId =
      stringValue(
        product['PRODUCT_ID'],
      );

    const productName =
      stringValue(
        product['PRODUCT_NAME'],
      );

    const productAmount =
      stringValue(
        product['PRODUCT_AMOUNT'],
      );

    if (
      !productId ||
      !productName
    ) {
      continue;
    }

    const amount =
      Number.parseFloat(
        productAmount
          .replace(/,/g, '')
          .replace(/[₦]/g, ''),
      );

    const planTypeMatch =
      productName.match(
        /\(([^)]+)\)/,
      );

    const planType =
      planTypeMatch?.[1]?.trim() ||
      'Standard';

    plans.push({
      DataPlan:
        productId,

      DataPlanName:
        productName,

      DataPlanType:
        planType,

      Price:
        Number.isFinite(amount)
          ? Math.ceil(amount).toString()
          : '0',
    });
  }

  const uniquePlans =
    Array.from(
      new Map(
        plans.map(
          (plan) => [
            plan.DataPlan,
            plan,
          ],
        ),
      ).values(),
    );

  logger.info(
    {
      network: normalizedNetwork,
      networkCode,
      count:
        uniquePlans.length,
    },
    'ClubKonnect data plans loaded',
  );

  return uniquePlans;
}

// ─────────────────────────────────────────────────────────────────────────────
// AIRTIME PURCHASE
// ─────────────────────────────────────────────────────────────────────────────

export async function purchaseAirtime(
  params: {
    network: string;
    phone: string;
    amount: number;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(
      params.network,
    );

  const mobileNumber =
    normalizePhoneNumber(
      params.phone,
    );

  const amount =
    String(params.amount ?? '')
      .trim();

  const requestId =
    String(params.requestId ?? '')
      .trim();

  if (!amount) {
    throw new Error(
      'ClubKonnect airtime Amount is required.',
    );
  }

  if (!requestId) {
    throw new Error(
      'ClubKonnect airtime RequestID is required.',
    );
  }

  const url = buildUrl(
    'APIAirtimeV1.asp',
    {
      MobileNetwork:
        networkCode,

      Amount:
        amount,

      MobileNumber:
        mobileNumber,

      RequestID:
        requestId,
    },
  );

  logger.info(
    {
      endpoint:
        'APIAirtimeV1.asp',
      network:
        params.network,
      networkCode,
      mobileNumber,
      mobileNumberLength:
        mobileNumber.length,
      amount,
      requestId,
    },
    'ClubKonnect airtime purchase request',
  );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_PURCHASE,
    );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `ClubKonnect airtime purchase HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty airtime response.',
    );
  }

  try {
    return JSON.parse(
      responseText,
    ) as CKPurchaseResult;
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid airtime response.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PURCHASE
// ─────────────────────────────────────────────────────────────────────────────

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    planCode: string;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  /*
   * 1. Validate network.
   */
  const networkCode =
    getNetworkCode(
      params.network,
    );

  /*
   * 2. Normalize the actual recipient phone number.
   *
   * This is the value that will be sent to ClubKonnect.
   */
  const mobileNumber =
    normalizePhoneNumber(
      params.phone,
    );

  /*
   * 3. Validate DataPlan.
   */
  const dataPlan =
    String(params.planCode ?? '')
      .trim();

  if (!dataPlan) {
    throw new Error(
      'ClubKonnect DataPlan is required.',
    );
  }

  /*
   * 4. Validate RequestID.
   */
  const requestId =
    String(params.requestId ?? '')
      .trim();

  if (!requestId) {
    throw new Error(
      'ClubKonnect RequestID is required.',
    );
  }

  /*
   * 5. Build the exact ClubKonnect data API request.
   *
   * ClubKonnect expects:
   *
   * UserID
   * APIKey
   * MobileNetwork
   * DataPlan
   * MobileNumber
   * RequestID
   *
   * MobileNumber MUST remain MobileNumber.
   */
  const url = buildUrl(
    'APIDatabundleV1.asp',
    {
      MobileNetwork:
        networkCode,

      DataPlan:
        dataPlan,

      MobileNumber:
        mobileNumber,

      RequestID:
        requestId,
    },
  );

  /*
   * 6. Log exactly what we are sending,
   * without exposing credentials.
   */
  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      network:
        params.network,

      networkCode,

      dataPlan,

      mobileNumber,

      mobileNumberLength:
        mobileNumber.length,

      requestId,

    },
    'ClubKonnect data purchase request',
  );

  /*
   * 7. Send GET request.
   */
  let response: Response;

  try {
    response =
      await fetchTimeout(
        url,
        TIMEOUT_PURCHASE,
      );
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),

        endpoint:
          'APIDatabundleV1.asp',

        network:
          params.network,

        networkCode,

        dataPlan,

        mobileNumber,

        requestId,
      },
      'ClubKonnect data purchase connection failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect.',
    );
  }

  /*
   * 8. Read raw response first.
   */
  const responseText =
    await response.text();

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      httpStatus:
        response.status,

      network:
        params.network,

      networkCode,

      dataPlan,

      mobileNumber,

      mobileNumberLength:
        mobileNumber.length,

      requestId,

      response:
        responseText.slice(
          0,
          2000,
        ),
    },
    'ClubKonnect data purchase response',
  );

  /*
   * 9. HTTP error.
   */
  if (!response.ok) {
    throw new Error(
      `ClubKonnect data purchase HTTP ${response.status}`,
    );
  }

  /*
   * 10. Empty response.
   */
  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty data purchase response.',
    );
  }

  /*
   * 11. Parse JSON.
   */
  let result: CKPurchaseResult;

  try {
    result =
      JSON.parse(
        responseText,
      ) as CKPurchaseResult;
  } catch {
    logger.error(
      {
        endpoint:
          'APIDatabundleV1.asp',

        network:
          params.network,

        networkCode,

        dataPlan,

        mobileNumber,

        requestId,

        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
      },
      'ClubKonnect returned invalid JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid data purchase response.',
    );
  }

  /*
   * 12. Normalize possible response field names.
   */
  if (
    !result.status &&
    result.orderstatus
  ) {
    result.status =
      result.orderstatus;
  }

  if (
    !result.OrderID &&
    result.orderid
  ) {
    result.OrderID =
      result.orderid;
  }

  /*
   * 13. Return vendor response to purchase.ts.
   */
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const id =
    String(requestId ?? '')
      .trim();

  if (!id) {
    throw new Error(
      'ClubKonnect RequestID is required.',
    );
  }

  /*
   * APIQueryV1.asp supports querying
   * the transaction using RequestID.
   */
  const url = buildUrl(
    'APIQueryV1.asp',
    {
      RequestID:
        id,
    },
  );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_READ,
    );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `ClubKonnect status check HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty transaction status response.',
    );
  }

  try {
    const result =
      JSON.parse(
        responseText,
      ) as CKPurchaseResult;

    if (
      !result.status &&
      result.orderstatus
    ) {
      result.status =
        result.orderstatus;
    }

    if (
      !result.OrderID &&
      result.orderid
    ) {
      result.OrderID =
        result.orderid;
    }

    return result;
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid transaction status response.',
    );
  }
}
