/**
 * SME API client
 *
 * SERVER-SIDE ONLY.
 * Never expose SME_API_KEY to the frontend.
 */

import { logger } from './logger.js';

// Read base URL from environment to allow sandbox/test overrides.
// Trim trailing slashes so path concatenation is robust.
const BASE_URL = String(process.env.SME_API_BASE_URL || 'https://smeapi.com.ng/api/')
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

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUT_READ,
): Promise<T> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  // Build URL robustly: ensure single slash between BASE_URL and path
  const url = `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      // Do not include developer-visible headers or log them.
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
      // Try to extract a safe message without echoing any sensitive fields.
      let safeMsg = response.statusText || 'SME API error';

      try {
        if (data && typeof data === 'object' && 'message' in (data as Record<string, unknown>)) {
          safeMsg = String((data as Record<string, unknown>).message ?? safeMsg);
        } else if (typeof data === 'string' && data.trim()) {
          // small payloads are likely safe to include
          safeMsg = data.slice(0, 500);
        }
      } catch {
        // ignore parsing errors and fall back to statusText
      }

      throw new Error(`SME API HTTP ${response.status}: ${safeMsg}`);
    }

    return data as T;
  } catch (err) {
    // Normalize AbortError / timeout
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('SME API request timed out');
    }

    // Surface a generic error without exposing API key or headers.
    throw err instanceof Error ? new Error(`SME API request failed: ${err.message}`) : new Error('SME API request failed');
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

export interface SMEResult {
  success: boolean;
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
   * IMPORTANT:
   *
   * Keep this endpoint isolated here.
   * If SME API documentation changes the plan-list endpoint,
   * only this function needs to be updated.
   */

  const data = await request<unknown>(
    `/api/data/plans/?network=${encodeURIComponent(networkId)}`,
  );

  /*
   * SME API responses can be normalized here without forcing
   * the frontend to know provider-specific response formats.
   */

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
      if (!item || typeof item !== 'object') {
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

      if (id === undefined || !name) {
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
      (plan): plan is SMEDataPlan =>
        plan !== null,
    );
}

/* ============================================================
 * DATA PURCHASE
 * ========================================================== */

export async function purchaseData(params: {
  network: string;
  phone: string;
  dataPlan: string;
  reference?: string;
}): Promise<SMEResult> {
  const networkId = getSMENetworkId(params.network);

  const reference =
    params.reference || makeReference('DATA');

  const payload = {
    network: networkId,
    phone: params.phone,
    data_plan: String(params.dataPlan),
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

  const result = await request<unknown>(
    '/api/data/',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    TIMEOUT_PURCHASE,
  );

  const response =
    result &&
    typeof result === 'object'
      ? (result as Record<string, unknown>)
      : {};

  const success =
    response.success === true ||
    response.status === true ||
    String(response.status || '').toLowerCase() ===
      'success' ||
    String(response.message || '').toLowerCase().includes(
      'success',
    );

  return {
    success,
    message:
      typeof response.message === 'string'
        ? response.message
        : undefined,
    reference:
      String(
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
}

/* ============================================================
 * AIRTIME
 * ========================================================== */

export async function purchaseAirtime(params: {
  network: string;
  phone: string;
  amount: number;
  reference?: string;
}): Promise<SMEResult> {
  const networkId = getSMENetworkId(params.network);

  const reference =
    params.reference || makeReference('AIRTIME');

  const payload = {
    network: networkId,
    phone: params.phone,
    amount: Number(params.amount),
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

  const result = await request<unknown>(
    '/api/airtime/',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    TIMEOUT_PURCHASE,
  );

  const response =
    result &&
    typeof result === 'object'
      ? (result as Record<string, unknown>)
      : {};

  const success =
    response.success === true ||
    response.status === true ||
    String(response.status || '').toLowerCase() ===
      'success' ||
    String(response.message || '').toLowerCase().includes(
      'success',
    );

  return {
    success,
    message:
      typeof response.message === 'string'
        ? response.message
        : undefined,
    reference:
      String(
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
}

/* ============================================================
 * PROVIDER HEALTH / CONFIG CHECK
 * ========================================================== */

export function getSMEProviderConfig() {
  return {
    configured:
      Boolean(
        String(
          process.env.SME_API_KEY || '',
        ).trim(),
      ),
    baseUrl: BASE_URL,
    networks: NETWORK_IDS,
  };
}

/*
 * TODO: Transaction status / requery and Wallet balance endpoints
 * The project requires a transaction-status (requery) and a wallet balance
 * check for full reconciliation & admin health checks. The exact SMEAPI
 * endpoints and response schema were not present in the repository or
 * supplied documentation during Phase 2. Do NOT guess or invent endpoints.
 *
 * BEFORE implementing the requery/status or balance functions, obtain the
 * official SME API docs (endpoint paths, request parameters and response
 * schema). Once verified, implement functions such as:
 *   - async function requeryTransactionByRef(ref: string) { ... }
 *   - async function getWalletBalance() { ... }
 *
 * MARKED: NEEDS DOCUMENTATION VERIFICATION
 */
