/**
 * ClubKonnect API client.
 *
 * Server-side only.
 * Credentials are read from environment variables at request time.
 */

import { logger } from './logger.js';

const BASE_URL = 'https://nellobytesystems.com';

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
  '9mobile': ['m_9mobile'],
  airtel: ['Airtel'],
};

export function getNetworkCode(network: string): string {
  const normalized = network.trim().toLowerCase();

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
    userId,
    apiKey,
  };
}

function buildUrl(
  endpoint: string,
  params: Record<string, string>,
): string {
  const { userId, apiKey } = getCredentials();

  const url = new URL(`${BASE_URL}/${endpoint}`);

  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
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
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

/**
 * Normalize Nigerian phone number.
 *
 * Accepted examples:
 * 08012345678
 * 8012345678
 * +2348012345678
 * 2348012345678
 *
 * Returned value:
 * 08012345678
 */
function normalizePhone(phone: string): string {
  let value = String(phone ?? '').trim();

  // Remove spaces, brackets, hyphens, etc.
  value = value.replace(/\D/g, '');

  if (!value) {
    return '';
  }

  // +234xxxxxxxxxx / 234xxxxxxxxxx -> 0xxxxxxxxxx
  if (
    value.startsWith('234') &&
    value.length === 13
  ) {
    value = `0${value.slice(3)}`;
  }

  // 8012345678 -> 08012345678
  if (
    value.length === 10 &&
    value.startsWith('8')
  ) {
    value = `0${value}`;
  }

  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeCKStatus(
  status: string | undefined | null,
): 'success' | 'pending' | 'failed' {
  const normalized = (status ?? '')
    .toLowerCase()
    .trim();

  if (
    normalized === 'successful' ||
    normalized === 'success' ||
    normalized === 'completed' ||
    normalized === 'complete'
  ) {
    return 'success';
  }

  if (
    normalized === 'pending' ||
    normalized === 'order_received' ||
    normalized === 'processing' ||
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
  ident?: string;
  Amount?: string;
  DataPlanName?: string;
  Price?: string;
  MobileNumber?: string;
  MobileNetwork?: string;
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

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_READ,
    );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect balance HTTP ${response.status}`,
    );
  }

  const data =
    (await response.json()) as CKBalance;

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PLANS
// ─────────────────────────────────────────────────────────────────────────────

export async function getDataPlans(
  network: string,
  _phone?: string,
): Promise<CKDataPlan[]> {
  const normalizedNetwork =
    network.trim().toLowerCase();

  const networkCode =
    getNetworkCode(normalizedNetwork);

  const responseKeys =
    NETWORK_RESPONSE_KEYS[
      normalizedNetwork
    ];

  if (!responseKeys) {
    throw new Error(
      `Unsupported network: ${network}`,
    );
  }

  /*
   * ClubKonnect APIDatabundlePlansV2.asp
   * returns the complete catalogue.
   *
   * We fetch the catalogue and select
   * the requested network locally.
   */

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
    response =
      await fetchTimeout(
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
    json =
      JSON.parse(responseText);
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

  if (
    networkEntry === undefined
  ) {
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

  const products:
    Record<string, unknown>[] = [];

  for (
    const entry
    of networkArray
  ) {
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

    for (
      const product
      of productList
    ) {
      const productObject =
        asObject(product);

      if (productObject) {
        products.push(
          productObject,
        );
      }
    }
  }

  const plans:
    CKDataPlan[] = [];

  for (
    const product
    of products
  ) {
    /*
     * PRODUCT_ID is the value that must
     * be sent as DataPlan when purchasing.
     */

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

  const cleanPhone =
    normalizePhone(
      params.phone,
    );

  if (!cleanPhone) {
    throw new Error(
      'Mobile number is required for ClubKonnect airtime purchase',
    );
  }

  if (
    cleanPhone.length !== 11
  ) {
    throw new Error(
      'Invalid Nigerian mobile number',
    );
  }

  logger.info(
    {
      network:
        params.network,
      networkCode,
      phoneLength:
        cleanPhone.length,
      amount:
        params.amount,
      requestId:
        params.requestId,
    },
    'Sending ClubKonnect airtime purchase request',
  );

  const url =
    buildUrl(
      'APIAirtimeV1.asp',
      {
        MobileNetwork:
          networkCode,

        Amount:
          params.amount.toString(),

        MobileNumber:
          cleanPhone,

        RequestID:
          params.requestId,
      },
    );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_PURCHASE,
    );

  const responseText =
    await response.text();

  if (!response.ok) {
    logger.error(
      {
        httpStatus:
          response.status,
        responsePreview:
          responseText.slice(0, 1000),
        requestId:
          params.requestId,
      },
      'ClubKonnect airtime purchase HTTP error',
    );

    throw new Error(
      `ClubKonnect airtime purchase HTTP ${response.status}`,
    );
  }

  try {
    return JSON.parse(
      responseText,
    ) as CKPurchaseResult;
  } catch {
    logger.error(
      {
        responsePreview:
          responseText.slice(0, 1000),
        requestId:
          params.requestId,
      },
      'ClubKonnect returned invalid airtime purchase response',
    );

    throw new Error(
      'ClubKonnect returned an invalid airtime purchase response.',
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
  const networkCode =
    getNetworkCode(
      params.network,
    );

  /*
   * Normalize the phone number before sending it
   * to ClubKonnect.
   *
   * Examples:
   *
   * +2348012345678
   * 2348012345678
   * 8012345678
   *
   * become:
   *
   * 08012345678
   */

  const cleanPhone =
    normalizePhone(
      params.phone,
    );

  if (!cleanPhone) {
    logger.error(
      {
        network:
          params.network,
        planCode:
          params.planCode,
        requestId:
          params.requestId,
      },
      'ClubKonnect data purchase rejected because phone number is empty',
    );

    throw new Error(
      'Mobile number is required for ClubKonnect data purchase',
    );
  }

  if (
    cleanPhone.length !== 11
  ) {
    logger.error(
      {
        network:
          params.network,
        planCode:
          params.planCode,
        phoneLength:
          cleanPhone.length,
        requestId:
          params.requestId,
      },
      'ClubKonnect data purchase rejected because phone number is invalid',
    );

    throw new Error(
      'Invalid Nigerian mobile number',
    );
  }

  /*
   * IMPORTANT:
   *
   * planCode must be the ClubKonnect PRODUCT_ID.
   *
   * Example:
   * PRODUCT_ID = 1000
   *
   * Therefore:
   * DataPlan = 1000
   */

  const cleanPlanCode =
    String(
      params.planCode ?? '',
    ).trim();

  if (!cleanPlanCode) {
    throw new Error(
      'Data plan code is required for ClubKonnect data purchase',
    );
  }

  logger.info(
    {
      network:
        params.network,
      networkCode,
      planCode:
        cleanPlanCode,
      phoneLength:
        cleanPhone.length,
      requestId:
        params.requestId,
    },
    'Sending ClubKonnect data purchase request',
  );

  const url =
    buildUrl(
      'APIDatabundleV1.asp',
      {
        MobileNetwork:
          networkCode,

        DataPlan:
          cleanPlanCode,

        MobileNumber:
          cleanPhone,

        RequestID:
          params.requestId,
      },
    );

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
        network:
          params.network,
        planCode:
          cleanPlanCode,
        phoneLength:
          cleanPhone.length,
        requestId:
          params.requestId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data purchase request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while processing data purchase.',
    );
  }

  const responseText =
    await response.text();

  logger.info(
    {
      network:
        params.network,
      networkCode,
      planCode:
        cleanPlanCode,
      phoneLength:
        cleanPhone.length,
      requestId:
        params.requestId,
      httpStatus:
        response.status,
      responsePreview:
        responseText.slice(0, 1000),
    },
    'ClubKonnect data purchase response received',
  );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect data purchase HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty data purchase response.',
    );
  }

  try {
    return JSON.parse(
      responseText,
    ) as CKPurchaseResult;
  } catch {
    logger.error(
      {
        network:
          params.network,
        planCode:
          cleanPlanCode,
        requestId:
          params.requestId,
        responsePreview:
          responseText.slice(0, 2000),
      },
      'ClubKonnect returned invalid data purchase JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid data purchase response.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const url =
    buildUrl(
      'APIQueryV1.asp',
      {
        OrderID:
          requestId,
      },
    );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_READ,
    );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect status check HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<CKPurchaseResult>;
}
