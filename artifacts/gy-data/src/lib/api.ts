/**
 * GY DATA — Frontend API utility
 *
 * Data plan calls go through our Express backend (/api/smedata/*).
 * Data purchase continues through the existing purchase endpoint
 * (/api/purchase/data), where wallet, pricing, cashback, idempotency,
 * and provider processing are handled by the backend.
 *
 * Airtime continues through the existing ClubKonnect backend
 * (/api/clubkonnect/*).
 *
 * SMEDATA credentials are stored as server-side secrets and are
 * NEVER exposed to the browser.
 */

const SMEDATA_BASE = '/api/smedata';
const CLUBKONNECT_BASE = '/api/clubkonnect';
const PURCHASE_BASE = '/api/purchase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DataPlan {
  DataPlan: string;
  DataPlanName: string;
  DataPlanType: string;
  Price: string;

  cashback_enabled?: boolean;
  cashback_type?: 'percentage' | 'fixed';
  cashback_value?: string;
  cashback_amount?: string;
}

export interface PurchaseResult {
  success: boolean;
  requestId: string;
  status?: string;
  ident?: string;
  pending?: boolean;
  error?: string;
  balance?: string;

  amount?: string;
  network?: string;
  phone?: string;

  planName?: string;
  price?: string;

  cashbackApplied?: boolean;
  cashbackAmount?: number;
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(
    `${base}${path}`,
    {
      headers: {
        'Content-Type':
          'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    },
  );

  let json: unknown;

  try {
    json = await res.json();
  } catch {
    throw new Error(
      `API error ${res.status}`,
    );
  }

  if (!res.ok) {
    const error =
      json &&
      typeof json === 'object' &&
      'error' in json &&
      typeof (
        json as {
          error?: unknown;
        }
      ).error === 'string'
        ? (
            json as {
              error: string;
            }
          ).error
        : `API error ${res.status}`;

    throw new Error(error);
  }

  return json as T;
}

// ── Balance ─────────────────────────────────────────────────────────────────

export async function checkBalance(): Promise<{
  success: boolean;
  balance: string;
}> {
  return apiFetch<{
    success: boolean;
    balance: string;
  }>(
    CLUBKONNECT_BASE,
    '/balance',
  );
}

// ── Data Plans ──────────────────────────────────────────────────────────────

/**
 * Fetch manually configured SMEDATA data plans.
 *
 * IMPORTANT:
 * Phone number is NOT required here.
 *
 * The backend maintains the manual plan catalogue and returns
 * the plans for the selected network.
 */
export async function fetchDataPlans(
  network: string,
): Promise<DataPlan[]> {
  const normalizedNetwork =
    network.trim().toLowerCase();

  if (!normalizedNetwork) {
    throw new Error(
      'Network is required to load data plans.',
    );
  }

  const data =
    await apiFetch<{
      success: boolean;
      network: string;
      plans: DataPlan[];
    }>(
      SMEDATA_BASE,
      `/data-plans?network=${encodeURIComponent(
        normalizedNetwork,
      )}`,
    );

  return data.plans ?? [];
}

// ── Airtime ─────────────────────────────────────────────────────────────────

/**
 * Airtime remains on the existing ClubKonnect route.
 */
export async function buyAirtime(params: {
  network: string;
  phone: string;
  amount: number;
}): Promise<PurchaseResult> {
  return apiFetch<PurchaseResult>(
    CLUBKONNECT_BASE,
    '/airtime',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  );
}

// ── Data Purchase ───────────────────────────────────────────────────────────

/**
 * Purchase data through the existing purchase endpoint.
 *
 * IMPORTANT:
 * We deliberately do NOT call SMEDATA directly from the browser.
 *
 * The request goes:
 *
 * BuyDataScreen
 *      ↓
 * this function
 *      ↓
 * POST /api/purchase/data
 *      ↓
 * backend purchase.ts
 *      ↓
 * SMEDATA
 *
 * This preserves the existing wallet debit, pricing validation,
 * cashback, idempotency and transaction logic in purchase.ts.
 */
export async function buyData(params: {
  network: string;
  phone: string;
  planCode: string;
  planName: string;
  amount: number;
}): Promise<PurchaseResult> {
  const network =
    params.network.trim();

  const phone =
    params.phone.trim();

  const planCode =
    params.planCode.trim();

  if (!network) {
    throw new Error(
      'Network is required.',
    );
  }

  if (!phone) {
    throw new Error(
      'Phone number is required.',
    );
  }

  if (!planCode) {
    throw new Error(
      'Data plan is required.',
    );
  }

  return apiFetch<PurchaseResult>(
    PURCHASE_BASE,
    '/data',
    {
      method: 'POST',
      body: JSON.stringify({
        network,
        phone,
        planCode,
        planName:
          params.planName,
        amount:
          params.amount,
      }),
    },
  );
}
