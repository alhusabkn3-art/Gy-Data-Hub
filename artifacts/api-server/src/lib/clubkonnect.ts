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

function getCredentials(): {
  userId: string;
  apiKey: string;
} {
  const userId =
    process.env['CLUBKONNECT_USER_ID']?.trim();

  const apiKey =
    process.env['CLUBKONNECT_API_KEY']?.trim();

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

// ─────────────────────────────────────────────────────────────────────────────
// PHONE NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

function normalizePhone(
  value: unknown,
): string {
  let phone = String(value ?? '').trim();

  /*
   * Remove spaces, brackets, hyphens and other
   * characters while preserving a leading +.
   */
  phone = phone.replace(/[^\d+]/g, '');

  /*
   * Nigerian international format:
   * +2348012345678 -> 08012345678
   */
  if (phone.startsWith('+234')) {
    phone =
      '0' +
      phone.slice(4);
  }

  /*
   * International format without +:
   * 2348012345678 -> 08012345678
   */
  if (
    phone.startsWith('234') &&
    phone.length === 13
  ) {
    phone =
      '0' +
      phone.slice(3);
  }

  /*
   * Final cleanup.
   */
  phone =
    phone.replace(/\D/g, '');

  return phone;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildUrl(
  endpoint: string,
  params: Record<string, string>,
): string {
  const {
    userId,
    apiKey,
  } = getCredentials();

  const url =
    new URL(
      `${BASE_URL}/${endpoint}`,
    );

  url.searchParams.set(
    'UserID',
    userId,
  );

  url.searchParams.set(
    'APIKey',
    apiKey,
  );

  for (
    const [
      key,
      value,
    ] of Object.entries(params)
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      url.searchParams.set(
        key,
        String(value),
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
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        method: 'GET',
        signal:
          controller.signal,
        headers: {
          Accept:
            'application/json',
        },
      },
    );
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

  return value as Record<
    string,
    unknown
  >;
}

function stringValue(
  value: unknown,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  return String(value).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeCKStatus(
  status:
    | string
    | undefined
    | null,
): 'success' | 'pending' | 'failed' {
  const normalized =
    String(status ?? '')
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
  const url =
    buildUrl(
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

  const text =
    await response.text();

  if (!text.trim()) {
    throw new Error(
      'ClubKonnect returned an empty balance response.',
    );
  }

  try {
    return JSON.parse(
      text,
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
      network:
        normalizedNetwork,
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
        network:
          normalizedNetwork,
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
        network:
          normalizedNetwork,
        httpStatus:
          response.status,
        responsePreview:
          responseText.slice(
            0,
            1000,
          ),
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
      JSON.parse(
        responseText,
      );
  } catch {
    logger.error(
      {
        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
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

  for (
    const key of responseKeys
  ) {
    if (
      mobileNetwork[key] !==
      undefined
    ) {
      networkEntry =
        mobileNetwork[key];

      break;
    }
  }

  if (
    networkEntry ===
    undefined
  ) {
    logger.error(
      {
        network:
          normalizedNetwork,
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
    Array.isArray(
      networkEntry,
    )
      ? networkEntry
      : [networkEntry];

  const products:
    Record<
      string,
      unknown
    >[] = [];

  for (
    const entry of networkArray
  ) {
    const entryObject =
      asObject(entry);

    if (!entryObject) {
      continue;
    }

    const productList =
      entryObject['PRODUCT'];

    if (
      !Array.isArray(
        productList,
      )
    ) {
      continue;
    }

    for (
      const product of productList
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
    const product of products
  ) {
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
          .replace(
            /,/g,
            '',
          )
          .replace(
            /₦/g,
            '',
          ),
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
        Number.isFinite(
          amount,
        )
          ? Math.ceil(
              amount,
            ).toString()
          : '0',
    });
  }

  const uniquePlans =
    Array.from(
      new Map(
        plans.map(
          (
            plan,
          ) => [
            plan.DataPlan,
            plan,
          ],
        ),
      ).values(),
    );

  logger.info(
    {
      network:
        normalizedNetwork,
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

  const phone =
    normalizePhone(
      params.phone,
    );

  if (!phone) {
    throw new Error(
      'A valid recipient phone number is required for ClubKonnect airtime purchase.',
    );
  }

  if (
    phone.length < 10 ||
    phone.length > 11
  ) {
    throw new Error(
      'Invalid Nigerian recipient phone number.',
    );
  }

  const requestId =
    String(
      params.requestId ?? '',
    ).trim();

  if (!requestId) {
    throw new Error(
      'ClubKonnect RequestID is required.',
    );
  }

  const amount =
    String(
      params.amount,
    );

  const url =
    buildUrl(
      'APIAirtimeV1.asp',
      {
        MobileNetwork:
          networkCode,

        Amount:
          amount,

        MobileNumber:
          phone,

        RequestID:
          requestId,
      },
    );

  logger.info(
    {
      network:
        params.network,
      networkCode,
      phone,
      amount,
      requestId,
      endpoint:
        'APIAirtimeV1.asp',
    },
    'Sending ClubKonnect airtime purchase',
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
          responseText.slice(
            0,
            1000,
          ),
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
  const network =
    String(
      params.network ?? '',
    )
      .trim()
      .toLowerCase();

  const networkCode =
    getNetworkCode(
      network,
    );

  /*
   * Normalize the recipient number BEFORE
   * constructing the ClubKonnect URL.
   */
  const phone =
    normalizePhone(
      params.phone,
    );

  /*
   * Do not allow an empty phone number to
   * reach ClubKonnect.
   */
  if (!phone) {
    logger.error(
      {
        network,
        networkCode,
        originalPhone:
          params.phone,
        planCode:
          params.planCode,
        requestId:
          params.requestId,
      },
      'ClubKonnect purchase blocked because recipient phone is empty',
    );

    throw new Error(
      'Recipient phone number is required.',
    );
  }

  if (
    phone.length < 10 ||
    phone.length > 11
  ) {
    logger.error(
      {
        network,
        networkCode,
        phoneLength:
          phone.length,
        planCode:
          params.planCode,
        requestId:
          params.requestId,
      },
      'ClubKonnect purchase blocked because recipient phone is invalid',
    );

    throw new Error(
      'Invalid Nigerian recipient phone number.',
    );
  }

  const planCode =
    String(
      params.planCode ?? '',
    ).trim();

  if (!planCode) {
    throw new Error(
      'ClubKonnect DataPlan is required.',
    );
  }

  const requestId =
    String(
      params.requestId ?? '',
    ).trim();

  if (!requestId) {
    throw new Error(
      'ClubKonnect RequestID is required.',
    );
  }

  /*
   * IMPORTANT:
   *
   * ClubKonnect expects these exact query
   * parameter names:
   *
   * MobileNetwork
   * DataPlan
   * MobileNumber
   * RequestID
   *
   * Do not rename MobileNumber to phone,
   * mobile, recipient, or mobileNumber.
   */
  const queryParams: Record<
    string,
    string
  > = {
    MobileNetwork:
      networkCode,

    DataPlan:
      planCode,

    MobileNumber:
      phone,

    RequestID:
      requestId,
  };

  const url =
    buildUrl(
      'APIDatabundleV1.asp',
      queryParams,
    );

  /*
   * Log the actual values being sent.
   *
   * The phone number is deliberately logged
   * as masked digits so we can verify that a
   * phone was supplied without exposing the
   * full number in production logs.
   */
  const maskedPhone =
    phone.length >= 4
      ? `${phone.slice(0, 3)}****${phone.slice(-3)}`
      : '****';

  logger.info(
    {
      network,
      networkCode,
      planCode,
      requestId,
      phone:
        maskedPhone,
      phoneLength:
        phone.length,
      endpoint:
        'APIDatabundleV1.asp',
      hasMobileNumber:
        Boolean(phone),
    },
    'Sending ClubKonnect data purchase',
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
        network,
        networkCode,
        planCode,
        requestId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data purchase request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while purchasing data.',
    );
  }

  const responseText =
    await response.text();

  logger.info(
    {
      network,
      networkCode,
      planCode,
      requestId,
      httpStatus:
        response.status,
      responsePreview:
        responseText.slice(
          0,
          1000,
        ),
    },
    'ClubKonnect data purchase response received',
  );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect data purchase HTTP ${response.status}`,
    );
  }

  if (
    !responseText.trim()
  ) {
    throw new Error(
      'ClubKonnect returned an empty data purchase response.',
    );
  }

  let result: CKPurchaseResult;

  try {
    result =
      JSON.parse(
        responseText,
      ) as CKPurchaseResult;
  } catch {
    logger.error(
      {
        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
      },
      'ClubKonnect returned invalid JSON for data purchase',
    );

    throw new Error(
      'ClubKonnect returned an invalid data purchase response.',
    );
  }

  /*
   * If ClubKonnect still reports
   * MISSING_PHONE_NUMBER, keep the exact
   * provider response available to the route.
   */
  if (
    String(
      result.status ?? '',
    )
      .trim()
      .toUpperCase() ===
    'MISSING_PHONE_NUMBER'
  ) {
    logger.error(
      {
        network,
        networkCode,
        planCode,
        requestId,
        phoneLength:
          phone.length,
        mobileNumberWasSent:
          true,
        vendorStatus:
          result.status,
      },
      'ClubKonnect reported MISSING_PHONE_NUMBER even though MobileNumber was supplied',
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const id =
    String(
      requestId ?? '',
    ).trim();

  if (!id) {
    throw new Error(
      'ClubKonnect OrderID/RequestID is required.',
    );
  }

  const url =
    buildUrl(
      'APIQueryV1.asp',
      {
        OrderID:
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

  if (
    !responseText.trim()
  ) {
    throw new Error(
      'ClubKonnect returned an empty transaction status response.',
    );
  }

  try {
    return JSON.parse(
      responseText,
    ) as CKPurchaseResult;
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid transaction status response.',
    );
  }
}
