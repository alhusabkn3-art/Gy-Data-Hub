/**
 * ClubKonnect API client.
 *
 * Server-side only.
 * Credentials are read from environment variables at request time.
 *
 * IMPORTANT:
 * - ClubKonnect expects MobileNumber for airtime/data purchase.
 * - Nigerian numbers are normalized to 080XXXXXXXX format.
 * - Data plans are read from APIDatabundlePlansV2.asp.
 * - Data purchase uses APIDatabundleV1.asp.
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
  etisalat: '03',
  airtel: '04',
};

const NETWORK_RESPONSE_KEYS: Record<string, string[]> = {
  mtn: ['MTN'],
  glo: ['Glo', 'GLO'],
  '9mobile': ['m_9mobile', '9mobile', '9MOBILE'],
  airtel: ['Airtel', 'AIRTEL'],
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
  const userId = process.env['CLUBKONNECT_USER_ID']?.trim();
  const apiKey = process.env['CLUBKONNECT_API_KEY']?.trim();

  if (!userId) {
    throw new Error(
      'CLUBKONNECT_USER_ID is required.',
    );
  }

  if (!apiKey) {
    throw new Error(
      'CLUBKONNECT_API_KEY is required.',
    );
  }

  return {
    userId,
    apiKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildUrl(
  endpoint: string,
  params: Record<string, string | undefined>,
): string {
  const { userId, apiKey } = getCredentials();

  const url = new URL(
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
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Gy-Data-Hub-ClubKonnect-Client/1.0',
      },
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        `ClubKonnect request timed out after ${timeoutMs}ms.`,
      );
    }

    throw error;
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

/**
 * Converts common Nigerian formats to:
 *
 * 08012345678
 *
 * Supported:
 * 08012345678
 * 2348012345678
 * +2348012345678
 * 8012345678
 */
export function normalizeNigerianPhone(
  value: string,
): string {
  let digits = String(value ?? '')
    .trim()
    .replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  // 2348012345678 -> 08012345678
  if (
    digits.startsWith('234') &&
    digits.length === 13
  ) {
    digits =
      `0${digits.slice(3)}`;
  }

  // 8012345678 -> 08012345678
  if (
    digits.length === 10 &&
    /^[7-9][0-9]{9}$/.test(digits)
  ) {
    digits =
      `0${digits}`;
  }

  return digits;
}

function isValidNigerianPhone(
  phone: string,
): boolean {
  return /^0[7-9][01][0-9]{8}$/.test(
    phone,
  );
}

/**
 * Do not put the complete customer's phone
 * into application logs.
 */
function maskPhone(
  phone: string,
): string {
  if (!phone) {
    return '';
  }

  if (phone.length < 7) {
    return '***';
  }

  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

function parseJson(
  responseText: string,
): unknown {
  try {
    return JSON.parse(
      responseText,
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeCKStatus(
  status: string | undefined | null,
): 'success' | 'pending' | 'failed' {
  const normalized =
    String(status ?? '')
      .toLowerCase()
      .trim();

  if (
    normalized === 'successful' ||
    normalized === 'success' ||
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'delivered'
  ) {
    return 'success';
  }

  if (
    normalized === 'pending' ||
    normalized === 'order_received' ||
    normalized === 'processing' ||
    normalized.includes('processing') ||
    normalized.includes('pending')
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

  logger.info(
    {
      endpoint:
        'APIWalletBalanceV1.asp',
    },
    'Checking ClubKonnect wallet balance',
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
        endpoint:
          'APIWalletBalanceV1.asp',
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect balance request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while checking balance.',
    );
  }

  const text =
    await response.text();

  if (!response.ok) {
    logger.error(
      {
        endpoint:
          'APIWalletBalanceV1.asp',
        httpStatus:
          response.status,
        responsePreview:
          text.slice(0, 1000),
      },
      'ClubKonnect balance HTTP error',
    );

    throw new Error(
      `ClubKonnect balance HTTP ${response.status}`,
    );
  }

  const data =
    parseJson(text);

  const object =
    asObject(data);

  if (!object) {
    throw new Error(
      'ClubKonnect returned an invalid balance response.',
    );
  }

  return object as CKBalance;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PLANS
// ─────────────────────────────────────────────────────────────────────────────

export async function getDataPlans(
  network: string,
  phone?: string,
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

  /*
   * IMPORTANT:
   *
   * ClubKonnect's V2 plans endpoint returns
   * the catalogue.
   *
   * We intentionally do NOT send MobileNumber
   * here because V2 is the catalogue endpoint.
   *
   * The MobileNumber is required during the
   * actual purchase request below.
   */

  const url =
    buildUrl(
      'APIDatabundlePlansV2.asp',
      {},
    );

  logger.info(
    {
      network:
        normalizedNetwork,
      networkCode,
      endpoint:
        'APIDatabundlePlansV2.asp',
      phoneProvided:
        Boolean(phone),
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

  const json =
    parseJson(
      responseText,
    );

  if (!json) {
    logger.error(
      {
        network:
          normalizedNetwork,
        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
      },
      'ClubKonnect returned invalid JSON for data plans',
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
      entryObject[
        'PRODUCT'
      ];

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
        product[
          'PRODUCT_ID'
        ],
      );

    const productName =
      stringValue(
        product[
          'PRODUCT_NAME'
        ],
      );

    const productAmount =
      stringValue(
        product[
          'PRODUCT_AMOUNT'
        ],
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
          )
          .trim(),
      );

    const planTypeMatch =
      productName.match(
        /\(([^)]+)\)/,
      );

    const planType =
      planTypeMatch?.[1]
        ?.trim() ||
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
          (plan) => [
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
    normalizeNigerianPhone(
      params.phone,
    );

  if (!phone) {
    throw new Error(
      'MobileNumber is required for ClubKonnect airtime purchase.',
    );
  }

  if (
    !isValidNigerianPhone(
      phone,
    )
  ) {
    throw new Error(
      'Invalid Nigerian mobile number for ClubKonnect airtime purchase.',
    );
  }

  if (
    !Number.isFinite(
      params.amount,
    ) ||
    params.amount <= 0
  ) {
    throw new Error(
      'A valid airtime amount is required.',
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

  const requestParams = {
    MobileNetwork:
      networkCode,

    Amount:
      String(
        params.amount,
      ),

    MobileNumber:
      phone,

    RequestID:
      requestId,
  };

  logger.info(
    {
      endpoint:
        'APIAirtimeV1.asp',
      MobileNetwork:
        networkCode,
      Amount:
        String(
          params.amount,
        ),
      MobileNumber:
        maskPhone(phone),
      RequestID:
        requestId,
    },
    'Sending ClubKonnect airtime purchase request',
  );

  const url =
    buildUrl(
      'APIAirtimeV1.asp',
      requestParams,
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
        endpoint:
          'APIAirtimeV1.asp',
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect airtime purchase connection failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect for airtime purchase.',
    );
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    logger.error(
      {
        endpoint:
          'APIAirtimeV1.asp',
        httpStatus:
          response.status,
        responsePreview:
          responseText.slice(
            0,
            1500,
          ),
      },
      'ClubKonnect airtime purchase HTTP error',
    );

    throw new Error(
      `ClubKonnect airtime purchase HTTP ${response.status}`,
    );
  }

  const result =
    parseJson(
      responseText,
    );

  if (!result) {
    logger.error(
      {
        endpoint:
          'APIAirtimeV1.asp',
        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
      },
      'ClubKonnect returned invalid airtime purchase response',
    );

    throw new Error(
      'ClubKonnect returned an invalid airtime purchase response.',
    );
  }

  return result as CKPurchaseResult;
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
   * THIS IS THE IMPORTANT PHONE FIX.
   *
   * Whatever format the frontend/backend gives us,
   * convert it to a clean Nigerian number before
   * sending it to ClubKonnect.
   */
  const phone =
    normalizeNigerianPhone(
      params.phone,
    );

  if (!phone) {
    logger.error(
      {
        network:
          params.network,
        reason:
          'MobileNumber is empty before ClubKonnect request',
      },
      'ClubKonnect data purchase rejected locally',
    );

    throw new Error(
      'MobileNumber is required for ClubKonnect data purchase.',
    );
  }

  if (
    !isValidNigerianPhone(
      phone,
    )
  ) {
    logger.error(
      {
        network:
          params.network,
        MobileNumber:
          maskPhone(phone),
        reason:
          'Invalid Nigerian mobile number',
      },
      'ClubKonnect data purchase rejected locally',
    );

    throw new Error(
      'Invalid Nigerian mobile number for ClubKonnect data purchase.',
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
   * EXACT ClubKonnect DATA PURCHASE PARAMETERS.
   *
   * UserID and APIKey are automatically added
   * by buildUrl().
   */
  const requestParams = {
    MobileNetwork:
      networkCode,

    DataPlan:
      planCode,

    MobileNumber:
      phone,

    RequestID:
      requestId,
  };

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      MobileNetwork:
        networkCode,

      DataPlan:
        planCode,

      MobileNumber:
        maskPhone(phone),

      RequestID:
        requestId,

      mobileNumberPresent:
        Boolean(
          requestParams.MobileNumber,
        ),

      mobileNumberLength:
        requestParams.MobileNumber.length,
    },
    'Sending ClubKonnect data purchase request',
  );

  const url =
    buildUrl(
      'APIDatabundleV1.asp',
      requestParams,
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
        endpoint:
          'APIDatabundleV1.asp',
        network:
          params.network,
        MobileNumber:
          maskPhone(phone),
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data purchase connection failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect for data purchase.',
    );
  }

  const responseText =
    await response.text();

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',
      httpStatus:
        response.status,
      responsePreview:
        responseText.slice(
          0,
          1500,
        ),
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

  const result =
    parseJson(
      responseText,
    );

  if (!result) {
    logger.error(
      {
        endpoint:
          'APIDatabundleV1.asp',
        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
      },
      'ClubKonnect returned invalid data purchase JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid data purchase response.',
    );
  }

  const resultObject =
    asObject(result);

  if (!resultObject) {
    throw new Error(
      'ClubKonnect data purchase response has an invalid format.',
    );
  }

  /*
   * Some ClubKonnect errors are returned as JSON
   * with status/message fields rather than HTTP errors.
   *
   * Preserve the original response for the caller,
   * but log the useful status information.
   */
  logger.info(
    {
      status:
        stringValue(
          resultObject[
            'status'
          ],
        ),
      message:
        stringValue(
          resultObject[
            'message'
          ],
        ),
      response:
        resultObject,
    },
    'ClubKonnect data purchase processed',
  );

  return resultObject as CKPurchaseResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const normalizedRequestId =
    String(
      requestId ?? '',
    ).trim();

  if (!normalizedRequestId) {
    throw new Error(
      'ClubKonnect RequestID is required for transaction status.',
    );
  }

  const url =
    buildUrl(
      'APIQueryV1.asp',
      {
        OrderID:
          normalizedRequestId,
      },
    );

  logger.info(
    {
      endpoint:
        'APIQueryV1.asp',
      OrderID:
        normalizedRequestId,
    },
    'Checking ClubKonnect transaction status',
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
        endpoint:
          'APIQueryV1.asp',
        OrderID:
          normalizedRequestId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect transaction status request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while checking transaction status.',
    );
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    logger.error(
      {
        endpoint:
          'APIQueryV1.asp',
        OrderID:
          normalizedRequestId,
        httpStatus:
          response.status,
        responsePreview:
          responseText.slice(
            0,
            1500,
          ),
      },
      'ClubKonnect transaction status HTTP error',
    );

    throw new Error(
      `ClubKonnect status check HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty transaction status response.',
    );
  }

  const result =
    parseJson(
      responseText,
    );

  if (!result) {
    logger.error(
      {
        endpoint:
          'APIQueryV1.asp',
        OrderID:
          normalizedRequestId,
        responsePreview:
          responseText.slice(
            0,
            2000,
          ),
      },
      'ClubKonnect returned invalid transaction status JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid transaction status response.',
    );
  }

  return result as CKPurchaseResult;
}
