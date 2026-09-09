/**
 * SME API client
 *
 * SERVER-SIDE ONLY.
 */

import { logger } from './logger.js';

const BASE_URL = String(
  process.env.SME_API_BASE_URL ||
    'https://smeapi.com.ng',
)
  .trim()
  .replace(/\/+$/u, '');

const TIMEOUT_READ = 15_000;
const TIMEOUT_PURCHASE = 30_000;

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
 * NETWORK
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
 * HTTP
 * ========================================================== */

function buildUrl(
  path: string,
): string {
  return `${BASE_URL}/${String(path)
    .trim()
    .replace(/^\/+/u, '')}`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUT_READ,
): Promise<T> {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
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
        getPlanArray(candidate);

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
 *
 * IMPORTANT:
 * getDataPlans is intentionally kept because
 * routes/smeapi.ts imports this exact function.
 * ========================================================== */

export async function getDataPlans(
  network: string,
): Promise<SMEDataPlan[]> {
  const normalizedNetwork =
    normalizeNetwork(network);

  const networkId =
    getSMENetworkId(
      normalizedNetwork,
    );

  const data =
    await request<unknown>(
      '/api/dataplans/',
    );

  const possiblePlans =
    getPlanArray(data);

  const plans: SMEDataPlan[] =
    [];

  for (
    const item of possiblePlans
  ) {
    if (
      !item ||
      typeof item !== 'object'
    ) {
      continue;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    const id =
      getPlanId(record);

    const name =
      getPlanName(record);

    if (
      id === undefined ||
      id === null ||
      String(id).trim() === '' ||
      name === undefined ||
      name === null ||
      String(name).trim() === ''
    ) {
      continue;
    }

    const providerNetwork =
      getPlanNetwork(record);

    if (
      providerNetwork &&
      providerNetwork !==
        normalizedNetwork &&
      providerNetwork !==
        String(networkId)
    ) {
      continue;
    }

    const rawPrice =
      record.price ??
      record.user_price ??
      record.userPrice ??
      record.agent_price ??
      record.agentPrice ??
      record.vendor_price ??
      record.vendorPrice ??
      record.selling_price ??
      record.sellingPrice;

    const rawCost =
      record.provider_cost ??
      record.providerCost ??
      record.vendor_cost ??
      record.vendorCost ??
      record.cost_price ??
      record.costPrice;

    const parsedPrice =
      rawPrice !==
        undefined &&
      rawPrice !== null &&
      String(
        rawPrice,
      ).trim() !== ''
        ? Number(rawPrice)
        : undefined;

    const parsedCost =
      rawCost !==
        undefined &&
      rawCost !== null &&
      String(
        rawCost,
      ).trim() !== ''
        ? Number(rawCost)
        : undefined;

    plans.push({
      id: String(id).trim(),

      network:
        normalizedNetwork,

      name:
        String(name).trim(),

      category:
        getPlanCategory(record),

      description:
        String(
          record.description ??
            record.validity ??
            record.duration ??
            '',
        ).trim(),

      price:
        Number.isFinite(
          parsedPrice,
        )
          ? parsedPrice
          : undefined,

      provider_cost:
        Number.isFinite(
          parsedCost,
        )
          ? parsedCost
          : undefined,

      raw: item,
    });
  }

  logger.info(
    {
      network:
        normalizedNetwork,
      networkId,
      providerPlanCount:
        possiblePlans.length,
      matchedPlanCount:
        plans.length,
    },
    'SME API data plans loaded',
  );

  logger.info(
    {
      network:
        normalizedNetwork,
      samplePlanIds:
        plans
          .slice(0, 10)
          .map(
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

  const code = Number(
    response.code ??
      response.status_code ??
      response.statusCode ??
      NaN,
  );

  if (code === 200) {
    return 'success';
  }

  if (code === 202) {
    return 'pending';
  }

  return 'unknown';
}

/* ============================================================
 * ERROR STATUS
 *
 * Explicit 4xx rejection = failed.
 *
 * Timeout, network failure, malformed response,
 * and 5xx = pending.
 *
 * This prevents an uncertain provider transaction
 * from being automatically refunded.
 * ========================================================== */

function purchaseErrorStatus(
  error: unknown,
): SMETransactionStatus {
  const message =
    error instanceof Error
      ? error.message
      : String(error || '');

  const match =
    message.match(
      /SME API HTTP (\d{3})\b/i,
    );

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

/* ============================================================
 * PROVIDER INTEGER
 * ========================================================== */

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

    return {
      success: false,

      /*
       * IMPORTANT:
       * Unknown/timeout/5xx/network errors become
       * pending instead of unknown.
       *
       * purchase.ts already understands "pending"
       * and will NOT refund the wallet automatically.
       */
      status:
        purchaseErrorStatus(
          err,
        ),

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

    return {
      success: false,

      /*
       * Same protection as data purchase:
       * 4xx = failed
       * timeout/network/5xx = pending
       */
      status:
        purchaseErrorStatus(
          err,
        ),

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
