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

function getCredentials() {
  const userId = process.env['CLUBKONNECT_USER_ID'];
  const apiKey = process.env['CLUBKONNECT_API_KEY'];

  if (!userId || !apiKey) {
    throw new Error(
      'CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY are required',
    );
  }

  return {
    userId: String(userId).trim(),
    apiKey: String(apiKey).trim(),
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
      url.searchParams.set(key, String(value));
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
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Gy-Data-Hub/1.0',
      },
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

// ─────────────────────────────────────────────────────────────────────────────
// PHONE NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

function normalizeNigeriaPhone(
  value: unknown,
): string {
  const raw = String(value ?? '').trim();

  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('234')) {
    digits = `0${digits.slice(3)}`;
  }

  if (
    digits.length === 10 &&
    !digits.startsWith('0')
  ) {
    digits = `0${digits}`;
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
    .toLowerCase()
    .trim();

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
  RequestID?: string;
  requestid?: string;
  statuscode?: string;
  orderstatus?: string;
  orderremark?: string;
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

  if (!response.ok) {
    throw new Error(
      `ClubKonnect balance HTTP ${response.status}`,
    );
  }

  const responseText = await response.text();

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty balance response.',
    );
  }

  try {
    return JSON.parse(responseText) as CKBalance;
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
   * Keep this endpoint exactly as supplied by ClubKonnect.
   *
   * Plans endpoint does not require phone number.
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
    json = JSON.parse(responseText);
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
    normalizeNigeriaPhone(
      params.phone,
    );

  if (
    !/^0\d{10}$/.test(
      mobileNumber,
    )
  ) {
    throw new Error(
      'Invalid MobileNumber for ClubKonnect airtime purchase.',
    );
  }

  const url = buildUrl(
    'APIAirtimeV1.asp',
    {
      MobileNetwork:
        networkCode,

      Amount:
        String(params.amount),

      MobileNumber:
        mobileNumber,

      RequestID:
        String(params.requestId).trim(),
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
    throw new Error(
      `ClubKonnect airtime purchase HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty airtime purchase response.',
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
  const networkCode =
    getNetworkCode(
      params.network,
    );

  /*
   * IMPORTANT:
   *
   * ClubKonnect expects the recipient in:
   *
   * MobileNumber
   *
   * We normalize ALL supported Nigerian formats:
   *
   * 08032732007
   * 8032732007
   * 2348032732007
   * +2348032732007
   *
   * into:
   *
   * 08032732007
   */

  const rawPhone =
    String(params.phone ?? '')
      .trim();

  const mobileNumber =
    normalizeNigeriaPhone(
      rawPhone,
    );

  if (
    !/^0\d{10}$/.test(
      mobileNumber,
    )
  ) {
    throw new Error(
      `Invalid MobileNumber for ClubKonnect: ${
        rawPhone || '[empty]'
      }`,
    );
  }

  const planCode =
    String(params.planCode ?? '')
      .trim();

  if (!planCode) {
    throw new Error(
      'ClubKonnect data purchase requires a DataPlan.',
    );
  }

  const requestId =
    String(params.requestId ?? '')
      .trim();

  if (!requestId) {
    throw new Error(
      'ClubKonnect data purchase requires a RequestID.',
    );
  }

  /*
   * Build the request exactly according to the ClubKonnect
   * databundle API format.
   *
   * We also send PhoneNumber as a compatibility alias.
   *
   * MobileNumber remains the PRIMARY parameter.
   *
   * The official API documentation uses:
   *
   * UserID
   * APIKey
   * MobileNetwork
   * DataPlan
   * MobileNumber
   * RequestID
   */

  const url =
    buildUrl(
      'APIDatabundleV1.asp',
      {
        MobileNetwork:
          networkCode,

        DataPlan:
          planCode,

        MobileNumber:
          mobileNumber,

        /*
         * Compatibility parameter.
         * ClubKonnect should ignore unknown parameters,
         * while this protects against installations/proxies
         * expecting PhoneNumber.
         */
        PhoneNumber:
          mobileNumber,

        RequestID:
          requestId,
      },
    );

  /*
   * FORENSIC LOGGING
   *
   * Credentials are masked.
   * Phone is masked.
   *
   * This lets us prove exactly what leaves Render.
   */

  const diagnosticUrl =
    new URL(url);

  diagnosticUrl.searchParams.set(
    'APIKey',
    'REDACTED',
  );

  diagnosticUrl.searchParams.set(
    'UserID',
    'REDACTED',
  );

  diagnosticUrl.searchParams.set(
    'MobileNumber',
    `*******${mobileNumber.slice(-4)}`,
  );

  diagnosticUrl.searchParams.set(
    'PhoneNumber',
    `*******${mobileNumber.slice(-4)}`,
  );

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      providerUrl:
        diagnosticUrl.toString(),

      hasUserID:
        Boolean(
          process.env['CLUBKONNECT_USER_ID'],
        ),

      hasAPIKey:
        Boolean(
          process.env['CLUBKONNECT_API_KEY'],
        ),

      hasMobileNumber:
        Boolean(mobileNumber),

      mobileNumberParam:
        `*******${mobileNumber.slice(-4)}`,

      mobileNumberLength:
        mobileNumber.length,

      hasPhoneNumberAlias:
        Boolean(mobileNumber),

      phoneNumberParam:
        `*******${mobileNumber.slice(-4)}`,

      hasDataPlan:
        Boolean(planCode),

      dataPlanParam:
        planCode,

      hasMobileNetwork:
        Boolean(networkCode),

      mobileNetworkParam:
        networkCode,

      hasRequestID:
        Boolean(requestId),

      requestIdParam:
        requestId,

      expectedMobileNumberLength:
        11,

      actualParamMobileNumberLength:
        mobileNumber.length,
    },
    'ClubKonnect outgoing data purchase URL',
  );

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      network:
        params.network,

      networkCode,

      dataPlan:
        planCode,

      mobileNumber:
        `*******${mobileNumber.slice(-4)}`,

      mobileNumberLength:
        mobileNumber.length,

      requestId,
    },
    'ClubKonnect data purchase request',
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

        networkCode,

        dataPlan:
          planCode,

        mobileNumber:
          `*******${mobileNumber.slice(-4)}`,

        mobileNumberLength:
          mobileNumber.length,

        requestId,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data purchase network request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while purchasing data.',
    );
  }

  const responseText =
    await response.text();

  /*
   * IMPORTANT:
   *
   * ClubKonnect may return a JSON error even with HTTP 200.
   * Therefore we MUST parse the body before deciding success/failure.
   */

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      httpStatus:
        response.status,

      responseUrl:
        response.url,

      redirected:
        response.redirected,

      requestId,
    },
    'ClubKonnect data purchase HTTP response',
  );

  if (!responseText.trim()) {
    logger.error(
      {
        endpoint:
          'APIDatabundleV1.asp',

        httpStatus:
          response.status,

        requestId,
      },
      'ClubKonnect returned empty data purchase response',
    );

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
        endpoint:
          'APIDatabundleV1.asp',

        httpStatus:
          response.status,

        requestId,

        responsePreview:
          responseText.slice(0, 2000),
      },
      'ClubKonnect returned invalid JSON for data purchase',
    );

    throw new Error(
      'ClubKonnect returned an invalid data purchase response.',
    );
  }

  const vendorStatus =
    String(
      result.status ??
      result.orderstatus ??
      '',
    ).trim();

  logger.info(
    {
      endpoint:
        'APIDatabundleV1.asp',

      network:
        params.network,

      networkCode,

      dataPlan:
        planCode,

      mobileNumber:
        `*******${mobileNumber.slice(-4)}`,

      mobileNumberLength:
        mobileNumber.length,

      requestId,

      vendorStatus,

      providerRef:
        result.OrderID ??
        result.orderid ??
        result.ident ??
        null,

      vendorMobileNumber:
        result.MobileNumber ??
        null,

      vendorMobileNetwork:
        result.MobileNetwork ??
        null,

      responseStatusCode:
        result.statuscode ??
        null,

      responsePreview:
        responseText.slice(0, 1000),
    },
    'ClubKonnect data purchase response',
  );

  /*
   * Do NOT automatically retry a purchase here.
   *
   * If ClubKonnect accepted the transaction but returned an
   * unusual response, an automatic retry could cause DOUBLE
   * DATA DELIVERY / DOUBLE CHARGE.
   */

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const cleanRequestId =
    String(requestId ?? '').trim();

  if (!cleanRequestId) {
    throw new Error(
      'ClubKonnect transaction status requires a RequestID.',
    );
  }

  /*
   * ClubKonnect's current documentation uses APIQueryV1.asp
   * for querying databundle transactions.
   */
  const url = buildUrl(
    'APIQueryV1.asp',
    {
      RequestID:
        cleanRequestId,
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
    return JSON.parse(
      responseText,
    ) as CKPurchaseResult;
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid transaction status response.',
    );
  }
}
