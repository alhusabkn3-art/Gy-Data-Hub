/**
 * SME API client
 *
 * SERVER-SIDE ONLY.
 *
 * IMPORTANT:
 * - Never expose SME_API_KEY to the frontend.
 * - SME API credentials are read from environment variables.
 * - Data and airtime purchases are sent directly from the server.
 */

import { logger } from './logger.js';

/* ============================================================
 * CONFIGURATION
 * ========================================================== */

const BASE_URL = String(
  process.env.SME_API_BASE_URL ||
    'https://smeapi.com.ng',
)
  .trim()
  .replace(/\/+$/u, '');

const TIMEOUT_READ = 15_000;
const TIMEOUT_PURCHASE = 30_000;

/**
 * SME API network IDs.
 *
 * MTN     = 1
 * GLO     = 2
 * 9MOBILE = 3
 * AIRTEL  = 4
 */
const NETWORK_IDS: Record<string, string> = {
  mtn: '1',
  glo: '2',
  '9mobile': '3',
  airtel: '4',
};

/* ============================================================
 * API KEY
 * ========================================================== */

function getApiKey(): string {
  const key = String(
    process.env.SME_API_KEY || '',
  ).trim();

  if (!key) {
    throw new Error(
      'SME API key is not configured. Add SME_API_KEY to the server environment.',
    );
  }

  return key;
}

/* ============================================================
 * NETWORK HELPERS
 * ========================================================== */

function normalizeNetwork(
  network: unknown,
): string {
  return String(network || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function getSMENetworkId(
  network: string,
): string {
  const normalized =
    normalizeNetwork(network);

  const id =
    NETWORK_IDS[normalized];

  if (!id) {
    throw new Error(
      `Unsupported network: ${network}`,
    );
  }

  return id;
}

/* ============================================================
 * REFERENCE
 * ========================================================== */

function makeReference(
  prefix = 'GY',
): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

/* ============================================================
 * URL
 * ========================================================== */

function buildUrl(
  path: string,
): string {
  const normalizedPath =
    String(path || '').trim();

  if (!normalizedPath) {
    throw new Error(
      'SME API request path cannot be empty.',
    );
  }

  return `${BASE_URL}/${normalizedPath.replace(
    /^\/+/u,
    '',
  )}`;
}

/* ============================================================
 * GENERIC REQUEST
 * ========================================================== */

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUT_READ,
): Promise<T> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => {
      controller.abort();
    },
    timeoutMs,
  );

  const url =
    buildUrl(path);

  try {
    const response =
      await fetch(url, {
        ...options,
        signal:
          controller.signal,
        headers: {
          Authorization: `Token ${getApiKey()}`,
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          ...(options.headers || {}),
        },
      });

    /*
     * IMPORTANT:
     *
     * Always read the complete response body.
     * This allows us to see the real SME API error
     * instead of only "400 Bad Request".
     */
    const text =
      await response.text();

    let data: unknown = null;

    try {
      data = text
        ? JSON.parse(text)
        : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      let providerMessage =
        response.statusText ||
        'SME API error';

      if (
        data &&
        typeof data === 'object'
      ) {
        const body =
          data as Record<
            string,
            unknown
          >;

        const possibleMessage =
          body.message ??
          body.error ??
          body.detail ??
          body.error_message ??
          body.errorMessage ??
          body.status;

        if (
          possibleMessage !==
            undefined &&
          possibleMessage !==
            null &&
          String(
            possibleMessage,
          ).trim()
        ) {
          providerMessage =
            String(
              possibleMessage,
            ).trim();
        }
      } else if (
        typeof data === 'string' &&
        data.trim()
      ) {
        providerMessage =
          data.trim().slice(
            0,
            1000,
          );
      }

      /*
       * Log the actual provider response.
       *
       * DO NOT log the API key.
       */
      logger.error(
        {
          url,
          status:
            response.status,
          statusText:
            response.statusText,
          providerResponse:
            data,
        },
        'SME API HTTP request failed',
      );

      throw new Error(
        `SME API HTTP ${response.status}: ${providerMessage}`,
      );
    }

    return data as T;
  } catch (err) {
    if (
      err instanceof Error &&
      err.name === 'AbortError'
    ) {
      throw new Error(
        'SME API request timed out',
      );
    }

    throw err instanceof Error
      ? new Error(
          `SME API request failed: ${err.message}`,
        )
      : new Error(
          'SME API request failed',
        );
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
 * TYPES
 * ========================================================== */

export interface SMEDataPlan {
  id: string;
  network: string;
  name: string;
  category: string;
  description?: string;
  price?: number;
  provider_cost?: number;
  raw?: unknown;
}

export type SMETransactionStatus =
  | 'success'
  | 'failed'
  | 'pending'
  | 'unknown';

/**
 * Classify a purchase error without risking an incorrect wallet refund.
 *
 * Explicit provider-side 4xx responses are treated as failed because the
 * provider rejected the request. Timeouts, network errors, malformed
 * responses, and 5xx responses are treated as pending because the provider
 * may have received or processed the transaction even when our request did
 * not receive a reliable final response.
 */
function purchaseErrorStatus(
  error: unknown,
): SMETransactionStatus {
  const message =
    error instanceof Error
      ? error.message
      : String(error || '');

  const match =
    message.match(/SME API HTTP (\d{3})\b/i);

  if (match) {
    const statusCode =
      Number(match[1]);

    if (
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return 'failed';
    }
  }

  return 'pending';
}

export interface SMEResult {
  success: boolean;
  status: SMETransactionStatus;
  message?: string;
  reference?: string;
  transaction?: unknown;
  raw?: unknown;
}

/* ============================================================
 * PLAN HELPERS
 * ========================================================== */

function normalizePlanNetwork(
  value: unknown,
): string {
  const raw = String(
    value ?? '',
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  switch (raw) {
    case '1':
    case 'mtn':
      return 'mtn';

    case '2':
    case 'glo':
    case 'globacom':
      return 'glo';

    case '3':
    case '9mobile':
    case 'etisalat':
      return '9mobile';

    case '4':
    case 'airtel':
      return 'airtel';

    default:
      return raw;
  }
}

function getPlanArray(
  data: unknown,
): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (
    !data ||
    typeof data !== 'object'
  ) {
    return [];
  }

  const payload =
    data as Record<
      string,
      unknown
    >;

  const candidates = [
    payload.data,
    payload.plans,
    payload.results,
    payload.data_plans,
    payload.dataplans,
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate)
    ) {
      return candidate;
    }

    if (
      candidate &&
      typeof candidate === 'object'
    ) {
      const nested =
        getPlanArray(
          candidate,
        );

      if (
        nested.length > 0
      ) {
        return nested;
      }
    }
  }

  return [];
}

function getPlanNetwork(
  item: Record<
    string,
    unknown
  >,
): string {
  return normalizePlanNetwork(
    item.network ??
      item.network_id ??
      item.networkId ??
      item.network_code ??
      item.networkCode ??
      item.MobileNetwork ??
      item.mobile_network ??
      item.operator ??
      item.provider_network ??
      item.providerNetwork,
  );
}

/**
 * Get the provider's REAL plan ID.
 *
 * SME API documentation says the ID from:
 *
 *   GET /api/dataplans/
 *
 * must be used as data_plan during purchase.
 */
function getPlanId(
  item: Record<
    string,
    unknown
  >,
): unknown {
  return (
    item.id ??
    item.plan_id ??
    item.planId ??
    item.data_plan ??
    item.dataPlan ??
    item.product_id ??
    item.productId ??
    item.product_code ??
    item.productCode
  );
}

function getPlanName(
  item: Record<
    string,
    unknown
  >,
): unknown {
  return (
    item.name ??
    item.plan_name ??
    item.planName ??
    item.DataPlanName ??
    item.data_plan_name ??
    item.dataPlanName ??
    item.product_name ??
    item.productName ??
    item.service ??
    item.title
  );
}

function getPlanCategory(
  item: Record<
    string,
    unknown
  >,
): string {
  return String(
    item.category ??
      item.type ??
      item.plan_type ??
      item.planType ??
      item.data_type ??
      item.dataType ??
      '',
  ).trim();
}

/* ============================================================
 * DATA PLANS
 * ========================================================== */

/**
 * GET /api/dataplans/
 *
 * Fetch all live plans from SME API,
 * then normalize them for the application.
 */
export async function fetchDataPlans(): Promise<
  SMEDataPlan[]
> {
  const result =
    await request<unknown>(
      '/api/dataplans/',
      {
        method: 'GET',
      },
      TIMEOUT_READ,
    );

  const items =
    getPlanArray(result);

  const plans: SMEDataPlan[] =
    items
      .map((item) => {
        if (
          !item ||
          typeof item !== 'object'
        ) {
          return null;
        }

        const raw =
          item as Record<
            string,
            unknown
          >;

        const id =
          getPlanId(raw);

        const name =
          getPlanName(raw);

        if (
          id === undefined ||
          id === null ||
          String(id).trim() === ''
        ) {
          return null;
        }

        const network =
          getPlanNetwork(raw);

        if (!network) {
          return null;
        }

        const priceValue =
          raw.price ??
          raw.amount ??
          raw.selling_price ??
          raw.sellingPrice ??
          raw.cost ??
          raw.provider_cost ??
          raw.providerCost;

        const numericPrice =
          Number(priceValue);

        const providerCostValue =
          raw.provider_cost ??
          raw.providerCost ??
          raw.cost ??
          raw.price;

        const numericProviderCost =
          Number(
            providerCostValue,
          );

        return {
          id: String(id).trim(),

          network,

          name:
            String(
              name ??
                id,
            ).trim(),

          category:
            getPlanCategory(raw),

          description:
            raw.description !==
              undefined &&
            raw.description !==
              null
              ? String(
                  raw.description,
                ).trim()
              : undefined,

          price:
            Number.isFinite(
              numericPrice,
            )
              ? numericPrice
              : undefined,

          provider_cost:
            Number.isFinite(
              numericProviderCost,
            )
              ? numericProviderCost
              : undefined,

          raw: item,
        };
      })
      .filter(
        (
          plan,
        ): plan is SMEDataPlan =>
          plan !== null,
      );

  logger.info(
    {
      planCount:
        plans.length,
      planIds:
        plans.map(
          (plan) =>
            plan.id,
        ),
    },
    'SME API provider plan IDs loaded',
  );

  return plans;
}

/* ============================================================
 * PROVIDER STATUS
 * ========================================================== */

function normalizeProviderStatus(
  response: Record<
    string,
    unknown
  >,
): SMETransactionStatus {
  const statusValues = [
    response.status,
    response.transaction_status,
    response.transactionStatus,
    response.state,
    response.result,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null,
    )
    .map((value) =>
      String(value)
        .trim()
        .toLowerCase(),
    );

  const message =
    String(
      response.message ??
        response.error ??
        response.detail ??
        '',
    )
      .trim()
      .toLowerCase();

  const combined = [
    ...statusValues,
    message,
  ].join(' ');

  if (
    combined.includes(
      'success',
    ) ||
    combined ===
      'successful' ||
    combined ===
      'completed' ||
    combined ===
      'complete'
  ) {
    return 'success';
  }

  if (
    combined.includes(
      'pending',
    ) ||
    combined.includes(
      'processing',
    ) ||
    combined.includes(
      'queued',
    ) ||
    combined.includes(
      'in progress',
    )
  ) {
    return 'pending';
  }

  if (
    combined.includes(
      'failed',
    ) ||
    combined.includes(
      'failure',
    ) ||
    combined.includes(
      'declined',
    ) ||
    combined.includes(
      'rejected',
    ) ||
    combined.includes(
      'invalid',
    ) ||
    combined.includes(
      'error',
    )
  ) {
    return 'failed';
  }

  if (
    response.success === true
  ) {
    return 'success';
  }

  if (
    response.success === false
  ) {
    return 'failed';
  }

  /*
   * Some providers return a numeric
   * HTTP-like/status field.
   */
  const code = Number(
    response.code ??
      response.status_code ??
      response.statusCode ??
      NaN,
  );

  if (code === 200) {
    return 'success';
  }

  if (
    code === 202
  ) {
    return 'pending';
  }

  return 'unknown';
}

/* ============================================================
 * PROVIDER NUMBER
 * ========================================================== */

/**
 * SME API examples use numeric values for:
 *
 * network
 * data_plan
 *
 * Convert safely before sending.
 */
function providerInteger(
  value: unknown,
  fieldName: string,
): number {
  const text =
    String(
      value ?? '',
    ).trim();

  if (!text) {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  const number =
    Number(text);

  if (
    !Number.isInteger(
      number,
    ) ||
    number < 0
  ) {
    throw new Error(
      `Invalid ${fieldName}: ${text}`,
    );
  }

  return number;
}

/* ============================================================
 * DATA PURCHASE
 * ========================================================== */

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    dataPlan: string;
    reference?: string;
  },
): Promise<SMEResult> {
  const networkId =
    getSMENetworkId(
      params.network,
    );

  /*
   * IMPORTANT FIX:
   *
   * SME API expects network and data_plan
   * as numeric values.
   *
   * Before:
   *
   *   network: "1"
   *   data_plan: "1"
   *
   * Now:
   *
   *   network: 1
   *   data_plan: 1
   */
  const providerNetwork =
    providerInteger(
      networkId,
      'network',
    );

  const providerDataPlan =
    providerInteger(
      params.dataPlan,
      'data_plan',
    );

  const reference =
    params.reference ||
    makeReference('DATA');

  /*
   * Official SME API:
   *
   * POST /api/data/
   *
   * Example:
   *
   * {
   *   "network": 1,
   *   "data_plan": 2,
   *   "phone": "08031234567",
   *   "ref": "DATA-UNIQUE-001",
   *   "ported_number": "false"
   * }
   */
  const payload = {
    network:
      providerNetwork,

    data_plan:
      providerDataPlan,

    phone:
      String(
        params.phone,
      ).trim(),

    ref:
      reference,

    ported_number:
      'false',
  };

  logger.info(
    {
      network:
        providerNetwork,
      phone:
        params.phone,
      data_plan:
        providerDataPlan,
      reference,
      ported_number:
        'false',
    },
    'SME API data purchase request',
  );

  try {
    const result =
      await request<unknown>(
        '/api/data/',
        {
          method: 'POST',
          body:
            JSON.stringify(
              payload,
            ),
        },
        TIMEOUT_PURCHASE,
      );

    const response =
      result &&
      typeof result === 'object'
        ? (result as Record<
            string,
            unknown
          >)
        : {};

    const status =
      normalizeProviderStatus(
        response,
      );

    const message =
      response.message ??
      response.error ??
      response.detail;

    const providerReference =
      response.reference ??
      response.ref ??
      response.transaction_id ??
      response.transactionId ??
      reference;

    logger.info(
      {
        network:
          providerNetwork,
        data_plan:
          providerDataPlan,
        reference,
        providerReference,
        providerStatus:
          status,
        providerResponse:
          result,
      },
      'SME API data purchase provider response',
    );

    return {
      success:
        status === 'success',

      status,

      message:
        message !== undefined &&
        message !== null
          ? String(message)
          : undefined,

      reference:
        String(
          providerReference,
        ),

      transaction:
        response.transaction ??
        response.data ??
        response,

      raw:
        result,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'SME API request failed';

    logger.error(
      {
        network:
          providerNetwork,
        phone:
          params.phone,
        data_plan:
          providerDataPlan,
        reference,
        error:
          message,
      },
      'SME API data purchase failed',
    );

    const status =
      purchaseErrorStatus(err);

    return {
      success: false,
      status,
      message,
      reference,
      raw: undefined,
    };
  }
}

/* ============================================================
 * AIRTIME PURCHASE
 * ========================================================== */

export async function purchaseAirtime(
  params: {
    network: string;
    phone: string;
    amount: number;
    reference?: string;
  },
): Promise<SMEResult> {
  const networkId =
    getSMENetworkId(
      params.network,
    );

  const providerNetwork =
    providerInteger(
      networkId,
      'network',
    );

  const amount =
    Number(params.amount);

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new Error(
      'Invalid airtime amount.',
    );
  }

  const reference =
    params.reference ||
    makeReference(
      'AIRTIME',
    );

  const payload = {
    network:
      providerNetwork,

    phone:
      String(
        params.phone,
      ).trim(),

    amount,

    ref:
      reference,

    ported_number:
      'false',
  };

  logger.info(
    {
      network:
        providerNetwork,
      phone:
        params.phone,
      amount,
      reference,
      ported_number:
        'false',
    },
    'SME API airtime purchase request',
  );

  try {
    const result =
      await request<unknown>(
        '/api/airtime/',
        {
          method: 'POST',
          body:
            JSON.stringify(
              payload,
            ),
        },
        TIMEOUT_PURCHASE,
      );

    const response =
      result &&
      typeof result === 'object'
        ? (result as Record<
            string,
            unknown
          >)
        : {};

    const status =
      normalizeProviderStatus(
        response,
      );

    const message =
      response.message ??
      response.error ??
      response.detail;

    const providerReference =
      response.reference ??
      response.ref ??
      response.transaction_id ??
      response.transactionId ??
      reference;

    logger.info(
      {
        network:
          providerNetwork,
        amount,
        reference,
        providerReference,
        providerStatus:
          status,
        providerResponse:
          result,
      },
      'SME API airtime purchase provider response',
    );

    return {
      success:
        status === 'success',

      status,

      message:
        message !== undefined &&
        message !== null
          ? String(message)
          : undefined,

      reference:
        String(
          providerReference,
        ),

      transaction:
        response.transaction ??
        response.data ??
        response,

      raw:
        result,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'SME API request failed';

    logger.error(
      {
        network:
          providerNetwork,
        phone:
          params.phone,
        amount,
        reference,
        error:
          message,
      },
      'SME API airtime purchase failed',
    );

    const status =
      purchaseErrorStatus(err);

    return {
      success: false,
      status,
      message,
      reference,
      raw: undefined,
    };
  }
}

/* ============================================================
 * PROVIDER CONFIG
 * ========================================================== */

export function getSMEProviderConfig() {
  return {
    configured:
      Boolean(
        String(
          process.env.SME_API_KEY ||
            '',
        ).trim(),
      ),

    baseUrl:
      BASE_URL,

    networks:
      NETWORK_IDS,
  };
}
