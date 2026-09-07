/**
 * SME API client
 *
 * SERVER-SIDE ONLY.
 * Never expose SME_API_KEY to the frontend.
 */

import { logger } from './logger.js';

/**
 * SMEAPI base URL.
 *
 * IMPORTANT:
 * The official API paths used below already begin with /api/.
 * Therefore the environment variable should normally contain only
 * the domain, for example:
 *
 *   https://smeapi.com.ng
 *
 * This prevents accidental URLs such as:
 *
 *   https://smeapi.com.ng/api/api/data/
 *
 * We also normalize the value so that trailing slashes do not matter.
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
 * Build an SMEAPI URL safely.
 *
 * The supplied path may start with / or may not.
 * Exactly one slash is used between BASE_URL and path.
 */
function buildUrl(path: string): string {
  const normalizedPath = String(path || '').trim();

  if (!normalizedPath) {
    throw new Error('SME API request path cannot be empty.');
  }

  return `${BASE_URL}/${normalizedPath.replace(/^\/+/u, '')}`;
}

/**
 * Generic SMEAPI request helper.
 *
 * IMPORTANT:
 * A network timeout is different from a provider-confirmed failure.
 * The caller must NOT automatically refund a customer's wallet merely
 * because this function timed out.
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
      let safeMsg = response.statusText || 'SME API error';

      try {
        if (
          data &&
          typeof data === 'object' &&
          'message' in (data as Record<string, unknown>)
        ) {
          safeMsg = String(
            (data as Record<string, unknown>).message ?? safeMsg,
          );
        } else if (
          typeof data === 'string' &&
          data.trim()
        ) {
          safeMsg = data.slice(0, 500);
        }
      } catch {
        // Ignore parsing errors and use the HTTP status message.
      }

      throw new Error(
        `SME API HTTP ${response.status}: ${safeMsg}`,
      );
    }

    return data as T;
  } catch (err) {
    /**
     * IMPORTANT:
     * Preserve a recognizable timeout error.
     *
     * The purchase transaction layer will later use this distinction
     * to avoid treating an unknown provider result as a confirmed failure.
     */
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
 * DATA PLANS
 * ========================================================== */

export async function getDataPlans(
  network: string,
): Promise<SMEDataPlan[]> {
  const networkId = getSMENetworkId(network);

  /*
   * SMEAPI data-plan endpoint.
   *
   * BASE_URL:
   *   https://smeapi.com.ng
   *
   * Full URL:
   *   https://smeapi.com.ng/api/data/plans/?network=1
   */
  const data = await request<unknown>(
    `/api/data/plans/?network=${encodeURIComponent(networkId)}`,
  );

  const payload =
    typeof data === 'object' &&
    data !== null
      ? (data as Record<string, unknown>)
      : {};

  const possiblePlans =
    payload.data ??
    payload.plans ??
    payload.results ??
    [];

  if (!Array.isArray(possiblePlans)) {
    return [];
  }

  return possiblePlans
    .map((item: any): SMEDataPlan | null => {
      if (
        !item ||
        typeof item !== 'object'
      ) {
        return null;
      }

      const id =
        item.id ??
        item.plan_id ??
        item.data_plan;

      const name =
        item.name ??
        item.plan_name ??
        item.DataPlanName ??
        item.service;

      if (
        id === undefined ||
        !name
      ) {
        return null;
      }

      return {
        id: String(id),
        network: normalizeNetwork(network),
        name: String(name),
        category: String(
          item.category ??
            item.type ??
            item.plan_type ??
            '',
        ),
        description: String(
          item.description ?? '',
        ),
        price:
          item.price !== undefined
            ? Number(item.price)
            : undefined,
        provider_cost:
          item.cost_price !== undefined
            ? Number(item.cost_price)
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
}

/* ============================================================
 * PROVIDER RESPONSE NORMALIZATION
 * ========================================================== */

/**
 * Convert provider response into one of four states:
 *
 * success
 * failed
 * pending
 * unknown
 *
 * This is deliberately separate from the HTTP status.
 *
 * HTTP 200 does NOT automatically mean that the purchase succeeded.
 */
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

  /*
   * Some providers return:
   *
   *   success: true
   *
   * instead of:
   *
   *   status: "success"
   */
  if (response.success === true) {
    return 'success';
  }

  if (response.success === false) {
    return 'failed';
  }

  /*
   * We cannot safely determine the provider result.
   * This MUST NOT be treated as a confirmed failure.
   */
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

  const payload = {
    network: networkId,
    phone: params.phone,
    data_plan: String(
      params.dataPlan,
    ),
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
          reference,
      ),
      transaction:
        response.transaction ??
        response.data,
      raw: result,
    };
  } catch (err) {
    /**
     * IMPORTANT:
     *
     * If the provider request times out or the network fails,
     * the final provider state is UNKNOWN.
     *
     * We deliberately do NOT return:
     *
     *   success: false
     *
     * with a normal "failed" state because that could cause the
     * wallet layer to refund a customer while SMEAPI has actually
     * processed the transaction.
     */
    const message =
      err instanceof Error
        ? err.message
        : 'SME API request failed';

    const isTimeout =
      message
        .toLowerCase()
        .includes('timed out');

    logger.error(
      {
        network: networkId,
        phone: params.phone,
        data_plan: params.dataPlan,
        reference,
        error: message,
        providerResult: 'unknown',
        timeout: isTimeout,
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
    phone: params.phone,
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
          reference,
      ),
      transaction:
        response.transaction ??
        response.data,
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
    networks: NETWORK_IDS,
  };
}

/*
 * ============================================================
 * IMPORTANT: REQUERY NOT IMPLEMENTED YET
 * ============================================================
 *
 * A provider timeout now produces:
 *
 *   status = "unknown"
 *
 * instead of:
 *
 *   status = "failed"
 *
 * This is intentional.
 *
 * The next step is to inspect the actual purchase transaction
 * route/service and modify it so that:
 *
 *   success -> mark transaction successful
 *   failed  -> refund wallet
 *   pending -> keep transaction pending
 *   unknown -> keep transaction pending/unknown and DO NOT refund
 *
 * We will only implement provider requery after verifying the
 * official SMEAPI endpoint and response schema. We will NOT invent
 * an endpoint.
 */
