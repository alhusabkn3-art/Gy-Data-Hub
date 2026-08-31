/**
 * GY DATA — Frontend API utility
 *
 * All Clubkonnect calls go through our Express backend (/api/clubkonnect/*).
 * Credentials (USER_ID, API_KEY, API_TOKEN) are stored as server-side secrets
 * and are never exposed to the browser.
 */

const BASE = '/api/clubkonnect';

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
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(
    `${BASE}${path}`,
    {
      headers: {
        'Content-Type':
          'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    },
  );

  const json =
    (await res.json()) as T & {
      error?: string;
    };

  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ??
        `API error ${res.status}`,
    );
  }

  return json;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function checkBalance(): Promise<{
  success: boolean;
  balance: string;
}> {
  return apiFetch('/balance');
}

/**
 * Phone is sent to the backend because the backend
 * may require the customer's MobileNumber when
 * resolving data plans.
 */
export async function fetchDataPlans(
  network: string,
  phone: string,
): Promise<DataPlan[]> {
  const normalizedPhone =
    phone.trim();

  if (!normalizedPhone) {
    throw new Error(
      'Phone number is required to load data plans.',
    );
  }

  const data =
    await apiFetch<{
      success: boolean;
      plans: DataPlan[];
    }>(
      `/data-plans?network=${encodeURIComponent(
        network,
      )}&phone=${encodeURIComponent(
        normalizedPhone,
      )}`,
    );

  return data.plans ?? [];
}

export async function buyAirtime(params: {
  network: string;
  phone: string;
  amount: number;
}): Promise<PurchaseResult> {
  return apiFetch('/airtime', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function buyData(params: {
  network: string;
  phone: string;
  planCode: string;
  planName: string;
  amount: number;
}): Promise<PurchaseResult> {
  return apiFetch('/data', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
