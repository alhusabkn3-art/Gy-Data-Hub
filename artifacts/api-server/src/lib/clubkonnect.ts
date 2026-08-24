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
  mtn: ['MTN', 'mtn', 'Mtn'],
  glo: ['Glo', 'GLO', 'glo'],
  '9mobile': [
    'm_9mobile',
    '9mobile',
    '9MOBILE',
    '9Mobile',
    'M_9MOBILE',
  ],
  airtel: ['Airtel', 'AIRTEL', 'airtel'],
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
// SAFE JSON HELPERS
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

function asArray(
  value: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    return [value];
  }

  return [];
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

function pickString(
  object: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = stringValue(object[key]);

    if (value) {
      return value;
    }
  }

  return '';
}

function pickNumber(
  object: Record<string, unknown>,
  keys: string[],
): number {
  const value = pickString(
    object,
    keys,
  );

  if (!value) {
    return 0;
  }

  const normalized = value
    .replace(/,/g, '')
    .replace(/[₦]/g, '')
    .trim();

  const number = Number.parseFloat(
    normalized,
  );

  return Number.isFinite(number)
    ? number
    : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeCKStatus(
  status: string | undefined | null,
): 'success' | 'pending' | 'failed' {
  const normalized = (
    status ?? ''
  )
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
// DATA PLAN EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

const CODE_KEYS = [
  'PRODUCT_CODE',
  'PRODUCT_ID',
  'PRODUCT_SNO',
  'DataPlan',
  'dataPlan',
  'DATA_PLAN',
  'data_plan',
  'product_code',
  'product_id',
  'code',
  'Code',
  'id',
];

const NAME_KEYS = [
  'PRODUCT_NAME',
  'PRODUCT_DESCRIPTION',
  'PRODUCT_DESC',
  'DataPlanName',
  'dataPlanName',
  'DATA_PLAN_NAME',
  'data_plan_name',
  'product_name',
  'productName',
  'name',
  'Name',
  'description',
  'Description',
];

const PRICE_KEYS = [
  'PRODUCT_AMOUNT',
  'PRODUCT_PRICE',
  'PRODUCT_COST',
  'Price',
  'PRICE',
  'price',
  'amount',
  'Amount',
  'AMOUNT',
  'cost',
  'Cost',
];

const PRODUCT_CONTAINER_KEYS = [
  'PRODUCT',
  'PRODUCTS',
  'Products',
  'products',
  'PLANS',
  'Plans',
  'plans',
  'DATA',
  'Data',
  'data',
  'DATAPLAN',
  'DataPlan',
  'dataplan',
  'DATA_PLANS',
  'DataPlans',
  'dataPlans',
  'DATA_BUNDLES',
  'DataBundles',
  'dataBundles',
];

function looksLikeProduct(
  value: Record<string, unknown>,
): boolean {
  const code = pickString(
    value,
    CODE_KEYS,
  );

  const name = pickString(
    value,
    NAME_KEYS,
  );

  return Boolean(code || name);
}

function collectProductObjects(
  value: unknown,
  output: Record<string, unknown>[],
  depth = 0,
): void {
  if (depth > 12) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectProductObjects(
        item,
        output,
        depth + 1,
      );
    }

    return;
  }

  const object = asObject(value);

  if (!object) {
    return;
  }

  if (looksLikeProduct(object)) {
    output.push(object);
  }

  for (const key of PRODUCT_CONTAINER_KEYS) {
    if (object[key] !== undefined) {
      collectProductObjects(
        object[key],
        output,
        depth + 1,
      );
    }
  }

  for (const [key, child] of Object.entries(object)) {
    if (
      PRODUCT_CONTAINER_KEYS.includes(key)
    ) {
      continue;
    }

    if (
      child !== null &&
      typeof child === 'object'
    ) {
      collectProductObjects(
        child,
        output,
        depth + 1,
      );
    }
  }
}

function formatPlan(
  product: Record<string, unknown>,
): CKDataPlan | null {
  const code = pickString(
    product,
    CODE_KEYS,
  );

  const name = pickString(
    product,
    NAME_KEYS,
  );

  if (!code || !name) {
    return null;
  }

  const amount = pickNumber(
    product,
    PRICE_KEYS,
  );

  const typeMatch = name.match(
    /\(([^)]+)\)/,
  );

  const planType =
    typeMatch?.[1]?.trim() ||
    'Standard';

  return {
    DataPlan: code,
    DataPlanName: name,
    DataPlanType: planType,
    Price:
      amount > 0
        ? Math.ceil(amount).toString()
        : '0',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PLANS
// ─────────────────────────────────────────────────────────────────────────────

export async function getDataPlans(
  network: string,
  phone?: string,
): Promise<CKDataPlan[]> {
  const normalizedNetwork =
    network.trim().toLowerCase();

  const networkCode =
    getNetworkCode(normalizedNetwork);

  const normalizedPhone =
    typeof phone === 'string'
      ? phone.trim()
      : '';

  /*
   * APIDatabundlePlansV2.asp is the catalogue endpoint.
   *
   * Do NOT send MobileNumber or MobileNetwork here.
   * MobileNumber/MobileNetwork belong to the actual
   * APIDatabundleV1.asp purchase request.
   *
   * The catalogue response is selected by network locally.
   */
  const url = buildUrl(
    'APIDatabundlePlansV2.asp',
    {},
  );

  logger.info(
    {
      network: normalizedNetwork,
      networkCode,
      hasPhone:
        Boolean(normalizedPhone),
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
    logger.warn(
      {
        network: normalizedNetwork,
      },
      'ClubKonnect returned an empty data plans response',
    );

    return [];
  }

  let json: unknown;

  try {
    json = JSON.parse(responseText);
  } catch {
    logger.error(
      {
        network: normalizedNetwork,
        responsePreview:
          responseText.slice(0, 2000),
      },
      'ClubKonnect returned invalid JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid response while fetching data plans.',
    );
  }

  const root = asObject(json);

  if (!root) {
    logger.warn(
      {
        network: normalizedNetwork,
        responseType: typeof json,
        responsePreview:
          JSON.stringify(json).slice(
            0,
            2000,
          ),
      },
      'ClubKonnect data plans response is not an object',
    );

    return [];
  }

  /*
   * APIDatabundlePlansV2 may return the catalogue
   * grouped under network keys.
   *
   * First try the known network keys.
   * Then fall back to an exact case-insensitive
   * network-key match.
   */
  const responseKeys =
    NETWORK_RESPONSE_KEYS[
      normalizedNetwork
    ] ?? [];

  let networkPlans: unknown = undefined;

  for (const key of responseKeys) {
    if (root[key] !== undefined) {
      networkPlans = root[key];
      break;
    }
  }

  if (networkPlans === undefined) {
    const matchingKey =
      Object.keys(root).find(
        (key) =>
          key.trim().toLowerCase() ===
          normalizedNetwork,
      );

    if (matchingKey) {
      networkPlans =
        root[matchingKey];
    }
  }

  /*
   * Some ClubKonnect responses may expose the
   * product list directly rather than under MTN/Glo/etc.
   *
   * If there is no explicit network container,
   * parse the root itself. This preserves compatibility
   * with the previous parser and avoids returning an
   * empty catalogue unnecessarily.
   */
  if (networkPlans === undefined) {
    const directProducts: Record<
      string,
      unknown
    >[] = [];

    collectProductObjects(
      root,
      directProducts,
    );

    if (directProducts.length > 0) {
      networkPlans = root;
    }
  }

  if (networkPlans === undefined) {
    logger.warn(
      {
        network: normalizedNetwork,
        networkCode,
        rootKeys: Object.keys(root),
        responsePreview:
          JSON.stringify(root).slice(
            0,
            4000,
          ),
      },
      'Requested network was not found in ClubKonnect data plans response',
    );

    return [];
  }

  const rawProducts: Record<
    string,
    unknown
  >[] = [];

  collectProductObjects(
    networkPlans,
    rawProducts,
  );

  logger.info(
    {
      network: normalizedNetwork,
      networkCode,
      rootKeys: Object.keys(root),
      rawProductCount:
        rawProducts.length,
    },
    'ClubKonnect response parsed',
  );

  if (rawProducts.length === 0) {
    logger.warn(
      {
        network: normalizedNetwork,
        networkCode,
        rootKeys: Object.keys(root),
        networkResponsePreview:
          JSON.stringify(networkPlans).slice(
            0,
            4000,
          ),
      },
      'No ClubKonnect data plans found for requested network',
    );

    return [];
  }

  const plans: CKDataPlan[] = [];

  for (const product of rawProducts) {
    const plan =
      formatPlan(product);

    if (plan) {
      plans.push(plan);
    }
  }

  const uniquePlans =
    Array.from(
      new Map(
        plans.map((plan) => [
          plan.DataPlan,
          plan,
        ]),
      ).values(),
    );

  logger.info(
    {
      network: normalizedNetwork,
      count: uniquePlans.length,
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
    getNetworkCode(params.network);

  const url = buildUrl(
    'APIAirtimeV1.asp',
    {
      MobileNetwork:
        networkCode,

      Amount:
        params.amount.toString(),

      MobileNumber:
        params.phone,

      RequestID:
        params.requestId,
    },
  );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_PURCHASE,
    );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect airtime purchase HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<CKPurchaseResult>;
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
    getNetworkCode(params.network);

  const url = buildUrl(
    'APIDatabundleV1.asp',
    {
      MobileNetwork:
        networkCode,

      DataPlan:
        params.planCode,

      MobileNumber:
        params.phone,

      RequestID:
        params.requestId,
    },
  );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_PURCHASE,
    );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect data purchase HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<CKPurchaseResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const url = buildUrl(
    'APIQueryV1.asp',
    {
      OrderID: requestId,
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
