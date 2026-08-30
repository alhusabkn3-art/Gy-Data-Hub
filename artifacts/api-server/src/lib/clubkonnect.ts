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
    const parsed = JSON.parse(responseText);
    const object = asObject(parsed);

    if (!object) {
      throw new Error(
        'ClubKonnect balance response is not an object.',
      );
    }

    return {
      balance:
        stringValue(
          object.balance ??
          object.Balance ??
          object.BalanceAmount ??
          object.APIBalance,
        ),

      date:
        stringValue(
          object.date ??
          object.Date,
        ) || undefined,

      id:
        stringValue(
          object.id ??
          object.ID,
        ) || undefined,

      phoneno:
        stringValue(
          object.phoneno ??
          object.PhoneNo ??
          object.PhoneNumber,
        ) || undefined,

      APIBalance:
        stringValue(
          object.APIBalance ??
          object.balance ??
          object.Balance,
        ) || undefined,

      ...object,
    };
  } catch (error) {
    if (
      error instanceof SyntaxError
    ) {
      throw new Error(
        'ClubKonnect returned an invalid balance response.',
      );
    }

    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PLANS
// ─────────────────────────────────────────────────────────────────────────────

export async function getDataPlans(
  network: string,
): Promise<CKDataPlan[]> {
  const normalizedNetwork =
    String(network ?? '')
      .trim()
      .toLowerCase();

  const networkCode =
    getNetworkCode(
      normalizedNetwork,
    );

  const url = buildUrl(
    'APIDatabundlePlansV2.asp',
    {},
  );

  const response =
    await fetchTimeout(
      url,
      TIMEOUT_READ,
    );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect data plans HTTP ${response.status}`,
    );
  }

  const responseText =
    await response.text();

  if (!responseText.trim()) {
    throw new Error(
      'ClubKonnect returned an empty data plans response.',
    );
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        responseText,
      );
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid data plans response.',
    );
  }

  const root =
    asObject(parsed);

  if (!root) {
    throw new Error(
      'ClubKonnect data plans response is not an object.',
    );
  }

  const possiblePlans =
    root[normalizedNetwork] ??
    root[
      NETWORK_RESPONSE_KEYS[
        normalizedNetwork
      ]?.[0] ?? ''
    ] ??
    root.data ??
    root.Data ??
    root.plans ??
    root.Plans ??
    parsed;

  let rawPlans: unknown[] = [];

  if (Array.isArray(possiblePlans)) {
    rawPlans =
      possiblePlans;
  } else {
    const possibleObject =
      asObject(
        possiblePlans,
      );

    if (possibleObject) {
      rawPlans =
        Object.values(
          possibleObject,
        ).filter(
          (value) =>
            typeof value === 'object' &&
            value !== null,
        );
    }
  }

  const uniquePlans =
    new Map<
      string,
      CKDataPlan
    >();

  for (const raw of rawPlans) {
    const object =
      asObject(raw);

    if (!object) {
      continue;
    }

    const DataPlan =
      stringValue(
        object.DataPlan ??
        object.dataplan ??
        object.PlanID ??
        object.planid ??
        object.id ??
        object.ID,
      );

    const DataPlanName =
      stringValue(
        object.DataPlanName ??
        object.DataPlanname ??
        object.PlanName ??
        object.planname ??
        object.Name ??
        object.name ??
        object.description,
      );

    const DataPlanType =
      stringValue(
        object.DataPlanType ??
        object.DataPlantype ??
        object.PlanType ??
        object.plantype ??
        object.Type ??
        object.type,
      );

    const Price =
      stringValue(
        object.Price ??
        object.price ??
        object.Amount ??
        object.amount,
      );

    if (!DataPlan) {
      continue;
    }

    const key =
      `${DataPlan}|${DataPlanName}`
        .toLowerCase();

    if (!uniquePlans.has(key)) {
      uniquePlans.set(
        key,
        {
          DataPlan,
          DataPlanName,
          DataPlanType,
          Price,
        },
      );
    }
  }

  const plans =
    Array.from(
      uniquePlans.values(),
    );

  logger.info(
    {
      network:
        normalizedNetwork,

      networkCode,

      count:
        plans.length,
    },
    'ClubKonnect data plans loaded',
  );

  return plans;
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
   * ClubKonnect expects the recipient in:
   *
   * MobileNumber
   *
   * We normalize all supported Nigerian formats:
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
   * IMPORTANT:
   *
   * The ClubKonnect APIDatabundleV1 endpoint expects:
   *
   * UserID
   * APIKey
   * MobileNetwork
   * DataPlan
   * MobileNumber
   * RequestID
   *
   * Do NOT add PhoneNumber here.
   *
   * MobileNumber is the official recipient parameter.
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

        RequestID:
          requestId,
      },
    );

  /*
   * FORENSIC LOGGING
   *
   * Credentials are masked.
   * Phone is masked.
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

  logger.info(
    {
      endpoint:
        'APIQueryV1.asp',

      providerUrl:
        diagnosticUrl.toString(),

      requestId:
        cleanRequestId,
    },
    'ClubKonnect transaction status request',
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
      `ClubKonnect transaction status HTTP ${response.status}`,
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

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT
// ─────────────────────────────────────────────────────────────────────────────

const clubkonnect = {
  getNetworkCode,
  getBalance,
  getDataPlans,
  purchaseAirtime,
  purchaseData,
  getTransactionStatus,
  normalizeCKStatus,
};

export default clubkonnect;
