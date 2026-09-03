/**
 * GY DATA — Frontend API utility
 *
 * Data plan calls go through our Express backend (/api/smedata/*).
 * Airtime calls continue to use the existing backend (/api/clubkonnect/*).
 *
 * SMEDATA credentials are stored as server-side secrets and are
 * NEVER exposed to the browser.
 */

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

// ── Core fetch wrappers ──────────────────────────────────────────────────────

/**
 * SMEDATA/backend data-plan requests.
 */
const SMEDATA_BASE = '/api/smedata';

/**
 * Existing ClubKonnect/backend requests.
 *
 * Airtime still uses ClubKonnect.
 */
const CLUBKONNECT_BASE = '/api/clubkonnect';

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

// ── Balance ──────────────────────────────────────────────────────────────────

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

// ── Data Plans ───────────────────────────────────────────────────────────────

/**
 * Fetch manually configured SMEDATA data plans.
 *
 * IMPORTANT:
 * Phone number is NOT sent here.
 *
 * The plan catalogue is maintained manually on the backend.
 * The customer's phone number is only needed when making
 * the actual data purchase.
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

// ── Airtime ──────────────────────────────────────────────────────────────────

/**
 * Airtime continues through the existing backend.
 *
 * SMEDATA is being used for DATA, not Airtime.
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

// ── Data Purchase ────────────────────────────────────────────────────────────

/**
 * Purchase data.
 *
 * Phone is required here because this is the actual
 * customer purchase request.
 *
 * The request goes through our backend.
 * The frontend NEVER talks directly to SMEDATA.
 */
export async function buyData(params: {
  network: string;
  phone: string;
  planCode: string;
  planName: string;
  amount: number;
}): Promise<PurchaseResult> {
  const phone =
    params.phone.trim();

  if (!phone) {
    throw new Error(
      'Phone number is required.',
    );
  }

  if (!params.network.trim()) {
    throw new Error(
      'Network is required.',
    );
  }

  if (!params.planCode.trim()) {
    throw new Error(
      'Data plan is required.',
    );
  }

  return apiFetch<PurchaseResult>(
    SMEDATA_BASE,
    '/purchase',
    {
      method: 'POST',
      body: JSON.stringify({
        network:
          params.network.trim(),
        phone,
        planCode:
          params.planCode.trim(),
        planName:
          params.planName,
        amount:
          params.amount,
      }),
    },
  );
}
