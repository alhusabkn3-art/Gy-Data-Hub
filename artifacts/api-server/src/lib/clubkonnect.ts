import { logger } from './logger.js';

/* ============================================================================
 * CLUBKONNECT / NELLOBYTE CONFIGURATION
 * ========================================================================== */

const BASE_URL =
  (
    process.env['CLUBKONNECT_BASE_URL'] ??
    'https://www.nellobytesystems.com'
  )
    .trim()
    .replace(/\/+$/, '');

/* ============================================================================
 * TYPES
 * ========================================================================== */

export interface CKPurchaseResult {
  status: string;
  Status?: string;
  OrderID?: string | null;
  ident?: string | null;
  DataPlanName?: string | null;
  MobileNumber?: string | null;
  MobileNetwork?: string | null;
  [key: string]: unknown;
}

export type CKNormalizedStatus =
  | 'success'
  | 'pending'
  | 'failed';

/* ============================================================================
 * CREDENTIALS
 * ========================================================================== */

function getCredentials(): {
  userId: string;
  apiKey: string;
} {
  const userId =
    String(
      process.env['CLUBKONNECT_USER_ID'] ??
      '',
    ).trim();

  const apiKey =
    String(
      process.env['CLUBKONNECT_API_KEY'] ??
      '',
    ).trim();

  if (!userId) {
    throw new Error(
      'CLUBKONNECT_USER_ID is not configured.',
    );
  }

  if (!apiKey) {
    throw new Error(
      'CLUBKONNECT_API_KEY is not configured.',
    );
  }

  return {
    userId,
    apiKey,
  };
}

/* ============================================================================
 * NETWORK NORMALIZATION
 * ========================================================================== */

export function getNetworkCode(
  network: unknown,
): string | null {
  const value =
    String(network ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');

  const networks: Record<
    string,
    string
  > = {
    mtn: '01',

    glo: '02',
    globacom: '02',

    airtel: '03',

    '9mobile': '04',
    etisalat: '04',
  };

  return networks[value] ?? null;
}

/* ============================================================================
 * PHONE NORMALIZATION
 * ========================================================================== */

/**
 * Converts supported Nigerian phone formats to:
 *
 * 08012345678
 *
 * Examples:
 *
 * 08012345678
 * 8012345678
 * +2348012345678
 * 2348012345678
 *
 * All become:
 *
 * 08012345678
 */
function normalizeMobileNumber(
  value: unknown,
): string {
  let phone =
    String(value ?? '')
      .trim()
      .replace(/\D/g, '');

  /*
   * +2348012345678
   * 2348012345678
   *
   * becomes
   *
   * 08012345678
   */
  if (
    phone.startsWith('234') &&
    phone.length === 13
  ) {
    phone =
      `0${phone.slice(3)}`;
  }

  /*
   * 8012345678
   *
   * becomes
   *
   * 08012345678
   */
  if (
    phone.length === 10 &&
    !phone.startsWith('0')
  ) {
    phone =
      `0${phone}`;
  }

  /*
   * ClubKonnect requests must receive
   * an 11-digit Nigerian number.
   */
  if (!/^0\d{10}$/.test(phone)) {
    throw new Error(
      `Invalid Nigerian mobile number. Expected 11 digits, received ${phone.length}.`,
    );
  }

  return phone;
}

/* ============================================================================
 * SAFE LOG MASKING
 * ========================================================================== */

function maskPhone(
  value: unknown,
): string {
  const phone =
    String(value ?? '');

  if (phone.length <= 4) {
    return '****';
  }

  return `*******${phone.slice(-4)}`;
}

/* ============================================================================
 * URL BUILDER
 * ========================================================================== */

function buildUrl(
  endpoint: string,
  params: Record<
    string,
    string | number | null | undefined
  >,
): URL {
  const {
    userId,
    apiKey,
  } =
    getCredentials();

  const url =
    new URL(
      `${BASE_URL}/${endpoint.replace(/^\/+/, '')}`,
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
    const [key, value]
    of Object.entries(params)
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    const stringValue =
      String(value).trim();

    if (!stringValue) {
      continue;
    }

    url.searchParams.set(
      key,
      stringValue,
    );
  }

  return url;
}

/* ============================================================================
 * HTTP REQUEST
 * ========================================================================== */

async function requestCK(
  endpoint: string,
  params: Record<
    string,
    string | number | null | undefined
  >,
): Promise<unknown> {
  const url =
    buildUrl(
      endpoint,
      params,
    );

  /*
   * IMPORTANT:
   *
   * Never log url.toString().
   *
   * The URL contains UserID and APIKey.
   */

  const safeParams =
    Object.fromEntries(
      Object.entries(params).map(
        ([key, value]) => {
          const lowerKey =
            key.toLowerCase();

          if (
            lowerKey.includes('mobile') ||
            lowerKey.includes('phone')
          ) {
            return [
              key,
              maskPhone(value),
            ];
          }

          return [
            key,
            value,
          ];
        },
      ),
    );

  logger.info(
    {
      endpoint,

      hasUserID:
        Boolean(
          process.env[
            'CLUBKONNECT_USER_ID'
          ],
        ),

      hasAPIKey:
        Boolean(
          process.env[
            'CLUBKONNECT_API_KEY'
          ],
        ),

      params:
        safeParams,
    },
    'ClubKonnect API request',
  );

  let response: Response;

  try {
    response =
      await fetch(
        url.toString(),
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json, text/plain, */*',
          },
        },
      );
  } catch (err) {
    logger.error(
      {
        err,
        endpoint,
      },
      'ClubKonnect HTTP request failed',
    );

    throw err;
  }

  const raw =
    await response.text();

  let data: unknown;

  try {
    data =
      JSON.parse(raw);
  } catch {
    data =
      {
        status:
          raw.trim(),
        raw,
      };
  }

  const objectData =
    (
      data &&
      typeof data === 'object'
    )
      ? data as Record<
          string,
          unknown
        >
      : {};

  logger.info(
    {
      endpoint,

      httpStatus:
        response.status,

      status:
        objectData['status'] ??
        objectData['Status'] ??
        null,
    },
    'ClubKonnect API response',
  );

  if (!response.ok) {
    throw new Error(
      `ClubKonnect HTTP ${response.status}`,
    );
  }

  return data;
}

/* ============================================================================
 * STATUS NORMALIZATION
 * ========================================================================== */

export function normalizeCKStatus(
  value: unknown,
): CKNormalizedStatus {
  const status =
    String(value ?? '')
      .trim()
      .toLowerCase();

  /*
   * SUCCESS
   */
  if (
    [
      'success',
      'successful',
      'completed',
      'complete',
      'approved',
      'delivered',
    ].includes(status)
  ) {
    return 'success';
  }

  /*
   * PENDING
   */
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

  /*
   * Everything else, including:
   *
   * MISSING_PHONE_NUMBER
   * FAILED
   * UNSUCCESSFUL
   * ERROR
   */
  return 'failed';
}

/* ============================================================================
 * BALANCE
 * ========================================================================== */

export async function getBalance(): Promise<
  Record<string, unknown>
> {
  const result =
    await requestCK(
      'APIBalanceEnquiry.asp',
      {},
    );

  if (
    !result ||
    typeof result !== 'object'
  ) {
    throw new Error(
      'Unexpected ClubKonnect balance response.',
    );
  }

  return result as Record<
    string,
    unknown
  >;
}

/* ============================================================================
 * DATA PLANS
 *
 * IMPORTANT:
 *
 * Your route calls:
 *
 * ck.getDataPlans(
 *   normalizedNetwork,
 *   normalizedPhone,
 * )
 *
 * Therefore this function MUST accept BOTH
 * network and phone.
 * ========================================================================== */

export async function getDataPlans(
  network: unknown,
  phone: unknown,
): Promise<Record<string, unknown>[]> {
  const networkCode =
    getNetworkCode(network);

  if (!networkCode) {
    throw new Error(
      `Unsupported network: ${String(network)}`,
    );
  }

  const mobileNumber =
    normalizeMobileNumber(
      phone,
    );

  /*
   * This is the critical request.
   *
   * MobileNumber MUST be sent together with
   * MobileNetwork.
   */
  const response =
    await requestCK(
      'APIDatabundlePlansV1.asp',
      {
        MobileNetwork:
          networkCode,

        MobileNumber:
          mobileNumber,
      },
    );

  /*
   * Direct array response.
   */
  if (
    Array.isArray(response)
  ) {
    return response as Record<
      string,
      unknown
    >[];
  }

  /*
   * Wrapped object response.
   */
  if (
    response &&
    typeof response === 'object'
  ) {
    const data =
      response as Record<
        string,
        unknown
      >;

    const possibleArrays =
      [
        data['data'],
        data['Data'],
        data['plans'],
        data['Plans'],
        data['DataPlans'],
        data['dataplans'],
        data['result'],
        data['Result'],
      ];

    for (
      const possible
      of possibleArrays
    ) {
      if (
        Array.isArray(
          possible,
        )
      ) {
        return possible as Record<
          string,
          unknown
        >[];
      }
    }

    /*
     * Provider error response.
     *
     * This prevents:
     *
     * providerPlans is not iterable
     */
    const providerStatus =
      data['status'] ??
      data['Status'] ??
      data['message'] ??
      data['Message'] ??
      data['error'] ??
      data['Error'];

    if (providerStatus) {
      throw new Error(
        `ClubKonnect data plans error: ${String(providerStatus)}`,
      );
    }
  }

  throw new Error(
    'Unexpected ClubKonnect data plans response format.',
  );
}

/* ============================================================================
 * TRANSACTION STATUS
 * ========================================================================== */

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const cleanRequestId =
    String(
      requestId ?? '',
    ).trim();

  if (!cleanRequestId) {
    throw new Error(
      'RequestID is required.',
    );
  }

  const response =
    await requestCK(
      'APIQueryTransactionStatus.asp',
      {
        RequestID:
          cleanRequestId,
      },
    );

  if (
    !response ||
    typeof response !== 'object'
  ) {
    throw new Error(
      'Unexpected ClubKonnect transaction status response.',
    );
  }

  const result =
    response as Record<
      string,
      unknown
    >;

  return {
    ...result,

    status:
      String(
        result['status'] ??
        result['Status'] ??
        'failed',
      ),

    OrderID:
      (
        result['OrderID'] ??
        result['orderId'] ??
        null
      ) as string | null,

    ident:
      (
        result['ident'] ??
        result['Ident'] ??
        null
      ) as string | null,
  };
}

/* ============================================================================
 * AIRTIME PURCHASE
 * ========================================================================== */

export async function purchaseAirtime(
  input: {
    network: string;
    phone: string;
    amount:
      | string
      | number;
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

  const amount =
    String(
      input.amount ?? '',
    ).trim();

  if (!amount) {
    throw new Error(
      'Airtime amount is required.',
    );
  }

  const requestId =
    String(
      input.requestId ?? '',
    ).trim();

  if (!requestId) {
    throw new Error(
      'RequestID is required.',
    );
  }

  const response =
    await requestCK(
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

  if (
    !response ||
    typeof response !== 'object'
  ) {
    throw new Error(
      'Unexpected ClubKonnect airtime response.',
    );
  }

  const result =
    response as Record<
      string,
      unknown
    >;

  return {
    ...result,

    status:
      String(
        result['status'] ??
        result['Status'] ??
        'failed',
      ),

    OrderID:
      (
        result['OrderID'] ??
        result['orderId'] ??
        null
      ) as string | null,

    ident:
      (
        result['ident'] ??
        result['Ident'] ??
        null
      ) as string | null,
  };
}

/* ============================================================================
 * DATA PURCHASE
 * ========================================================================== */

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
    String(
      input.planCode ?? '',
    ).trim();

  if (!dataPlan) {
    throw new Error(
      'DataPlan is required.',
    );
  }

  const requestId =
    String(
      input.requestId ?? '',
    ).trim();

  if (!requestId) {
    throw new Error(
      'RequestID is required.',
    );
  }

  /*
   * Data purchase request.
   *
   * MobileNumber is explicitly supplied.
   */
  const response =
    await requestCK(
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

  if (
    !response ||
    typeof response !== 'object'
  ) {
    throw new Error(
      'Unexpected ClubKonnect data purchase response.',
    );
  }

  const result =
    response as Record<
      string,
      unknown
    >;

  return {
    ...result,

    status:
      String(
        result['status'] ??
        result['Status'] ??
        'failed',
      ),

    OrderID:
      (
        result['OrderID'] ??
        result['orderId'] ??
        null
      ) as string | null,

    ident:
      (
        result['ident'] ??
        result['Ident'] ??
        null
      ) as string | null,

    DataPlanName:
      (
        result['DataPlanName'] ??
        result['dataPlanName'] ??
        result['PlanName'] ??
        null
      ) as string | null,

    MobileNumber:
      (
        result['MobileNumber'] ??
        result['mobileNumber'] ??
        mobileNumber
      ) as string | null,

    MobileNetwork:
      (
        result['MobileNetwork'] ??
        result['mobileNetwork'] ??
        networkCode
      ) as string | null,
  };
}
