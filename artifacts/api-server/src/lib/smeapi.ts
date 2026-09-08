/**
 * SME API client
 *
 * SERVER-SIDE ONLY.
 * Never expose SME_API_KEY to the frontend.
 */

import { logger } from './logger.js';

/**
 * SME API base URL.
 *
 * Render environment variable:
 *
 *   SME_API_BASE_URL=https://smeapi.com.ng
 *
 * Do not include /api/ or an endpoint in the value.
 */
const BASE_URL = String(
  process.env.SME_API_BASE_URL || 'https://smeapi.com.ng',
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

function getApiKey(): string {
  const key = String(process.env.SME_API_KEY || '').trim();

  if (!key) {
    throw new Error(
      'SME API key is not configured. Add SME_API_KEY to the server environment.',
    );
  }

  return key;
}

function normalizeNetwork(network: string): string {
  return String(network || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function getSMENetworkId(network: string): string {
  const normalized = normalizeNetwork(network);

  const id = NETWORK_IDS[normalized];

  if (!id) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return id;
}

function makeReference(prefix = 'GY'): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

/**
 * Build an SME API URL safely.
 */
function buildUrl(path: string): string {
  const normalizedPath = String(path || '').trim();

  if (!normalizedPath) {
    throw new Error('SME API request path cannot be empty.');
  }

  return `${BASE_URL}/${normalizedPath.replace(/^\/+/u, '')}`;
}

/**
 * Generic SME API request helper.
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUT_READ,
): Promise<T> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const url = buildUrl(path);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Token ${getApiKey()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const text = await response.text();

    let data: unknown = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      let safeMsg =
        response.statusText || 'SME API error';

      try {
        if (
          data &&
          typeof data === 'object' &&
          'message' in
            (data as Record<string, unknown>)
        ) {
          safeMsg = String(
            (data as Record<string, unknown>)
              .message ?? safeMsg,
          );
        } else if (
          typeof data === 'string' &&
          data.trim()
        ) {
          safeMsg = data.slice(0, 500);
        }
      } catch {
        // Keep HTTP status message.
      }

      throw new Error(
        `SME API HTTP ${response.status}: ${safeMsg}`,
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
  const raw = String(value ?? '')
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
    data as Record<string, unknown>;

  const candidates = [
    payload.data,
    payload.plans,
    payload.results,
    payload.data_plans,
    payload.dataplans,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (
      candidate &&
      typeof candidate === 'object'
    ) {
      const nested =
        getPlanArray(candidate);

      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function getPlanNetwork(
  item: Record<string, unknown>,
): string {
  return normalizePlanNetwork(
    item.network ??
      item.network_id ??
      item.networkId ??
      item.network_code ??
      item.MobileNetwork ??
      item.operator ??
      item.provider_network,
  );
}

function getPlanId(
  item: Record<string, unknown>,
): unknown {
  return (
    item.id ??
    item.plan_id ??
    item.planId ??
    item.data_plan ??
    item.dataPlan
  );
}

function getPlanName(
  item: Record<string, unknown>,
): unknown {
  return (
    item.name ??
    item.plan_name ??
    item.planName ??
    item.DataPlanName ??
    item.data_plan_name ??
    item.service ??
    item.title
  );
}

function getPlanCategory(
  item: Record<string, unknown>,
): string {
  return String(
    item.category ??
      item.type ??
      item.plan_type ??
      item.planType ??
      '',
  ).trim();
}

/* ============================================================
 * DATA PLANS
 * ========================================================== */

/**
 * GET /api/dataplans/
 *
 * IMPORTANT:
 *
 * SME API's official live-plan endpoint is:
 *
 *   https://smeapi.com.ng/api/dataplans/
 *
 * It does NOT use:
 *
 *   /api/data/plans/?network=1
 *
 * We therefore fetch all live plans and filter by network
 * locally.
 */
export async function getDataPlans(
  network: string,
): Promise<SMEDataPlan[]> {
  const normalizedNetwork =
    normalizeNetwork(network);

  const networkId =
    getSMENetworkId(
      normalizedNetwork,
    );

  /*
   * Official SME API live data plans endpoint.
   *
   * We intentionally do NOT append ?network=...
   * because the official endpoint is /api/dataplans/.
   */
  const data = await request<unknown>(
    '/api/dataplans/',
  );

  const possiblePlans =
    getPlanArray(data);

  const plans: SMEDataPlan[] = [];

  for (const item of possiblePlans) {
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

    /*
     * Some provider responses may omit network on individual
     * records. In that case we keep the plan because the API
     * endpoint itself is the authoritative live-plan source.
     *
     * When a network is present, filter it strictly.
     */
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
      record.selling_price ??
      record.sellingPrice;

    const rawCost =
      record.provider_cost ??
      record.providerCost ??
      record.vendor_price ??
      record.vendorPrice ??
      record.vendor_cost ??
      record.cost_price ??
      record.costPrice;

    const parsedPrice =
      rawPrice !== undefined &&
      rawPrice !== null &&
      String(rawPrice).trim() !== ''
        ? Number(rawPrice)
        : undefined;

    const parsedCost =
      rawCost !== undefined &&
      rawCost !== null &&
      String(rawCost).trim() !== ''
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
      network: normalizedNetwork,
      networkId,
      providerPlanCount:
        possiblePlans.length,
      matchedPlanCount:
        plans.length,
    },
    'SME API data plans loaded',
  );

  return plans;
}

/* ============================================================
 * PROVIDER RESPONSE NORMALIZATION
 * ========================================================== */

function normalizeProviderStatus(
  response: Record<string, unknown>,
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

  const message = String(
    response.message ?? '',
  )
    .trim()
    .toLowerCase();

  const combined = [
    ...statusValues,
    message,
  ].join(' ');

  if (
    combined.includes('success') ||
    combined === 'successful' ||
    combined === 'completed' ||
    combined === 'complete'
  ) {
    return 'success';
  }

  if (
    combined.includes('pending') ||
    combined.includes('processing') ||
    combined.includes('queued') ||
    combined.includes('in progress')
  ) {
    return 'pending';
  }

  if (
    combined.includes('failed') ||
    combined.includes('failure') ||
    combined.includes('declined') ||
    combined.includes('rejected') ||
    combined.includes('invalid') ||
    combined.includes('error')
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

  return 'unknown';
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

  const reference =
    params.reference ||
    makeReference('DATA');

  /*
   * Official SME API data purchase endpoint:
   *
   * POST /api/data/
   *
   * data_plan must be the live plan ID returned by
   * /api/dataplans/.
   */
  const payload = {
    network: networkId,
    data_plan: String(
      params.dataPlan,
    ).trim(),
    phone: String(
      params.phone,
    ).trim(),
    ref: reference,
  };

  logger.info(
    {
      network: networkId,
      phone: params.phone,
      data_plan: params.dataPlan,
      reference,
    },
    'SME API data purchase request',
  );

  try {
    const result =
      await request<unknown>(
        '/api/data/',
        {
          method: 'POST',
          body: JSON.stringify(
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

    return {
      success:
        status === 'success',

      status,

      message:
        typeof response.message ===
        'string'
          ? response.message
          : undefined,

      reference: String(
        response.reference ??
          response.ref ??
          response.transaction_id ??
          response.transactionId ??
          reference,
      ),

      transaction:
        response.transaction ??
        response.data ??
        response,

      raw: result,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'SME API request failed';

    logger.error(
      {
        network: networkId,
        phone: params.phone,
        data_plan: params.dataPlan,
        reference,
        error: message,
        providerResult: 'unknown',
      },
      'SME API data purchase provider result is unknown',
    );

    return {
      success: false,
      status: 'unknown',
      message,
      reference,
      raw: undefined,
    };
  }
}

/* ============================================================
 * AIRTIME
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

  const reference =
    params.reference ||
    makeReference('AIRTIME');

  const payload = {
    network: networkId,
    phone: String(
      params.phone,
    ).trim(),
    amount: Number(
      params.amount,
    ),
    ref: reference,
  };

  logger.info(
    {
      network: networkId,
      phone: params.phone,
      amount: params.amount,
      reference,
    },
    'SME API airtime purchase request',
  );

  try {
    const result =
      await request<unknown>(
        '/api/airtime/',
        {
          method: 'POST',
          body: JSON.stringify(
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

    return {
      success:
        status === 'success',

      status,

      message:
        typeof response.message ===
        'string'
          ? response.message
          : undefined,

      reference: String(
        response.reference ??
          response.ref ??
          response.transaction_id ??
          response.transactionId ??
          reference,
      ),

      transaction:
        response.transaction ??
        response.data ??
        response,

      raw: result,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'SME API request failed';

    logger.error(
      {
        network: networkId,
        phone: params.phone,
        amount: params.amount,
        reference,
        error: message,
        providerResult: 'unknown',
      },
      'SME API airtime purchase provider result is unknown',
    );

    return {
      success: false,
      status: 'unknown',
      message,
      reference,
      raw: undefined,
    };
  }
}

/* ============================================================
 * PROVIDER HEALTH / CONFIG CHECK
 * ========================================================== */

export function getSMEProviderConfig() {
  return {
    configured: Boolean(
      String(
        process.env.SME_API_KEY || '',
      ).trim(),
    ),

    baseUrl: BASE_URL,

    networks:
      NETWORK_IDS,
  };
}
