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
  DataPlan: string;      // Clubkonnect plan code — pass this back when purchasing
  DataPlanName: string;  // e.g. "1GB for 30 Days"
  DataPlanType: string;  // e.g. "SME" | "Direct"
  Price: string;         // Naira string e.g. "270.00"
}

export interface PurchaseResult {
  success: boolean;
  requestId: string;
  status?: string;
  ident?: string;
  // airtime
  amount?: string;
  network?: string;
  phone?: string;
  // data
  planName?: string;
  price?: string;
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  const json = await res.json() as T & { error?: string };

  if (!res.ok) {
    // Surface the backend error message clearly
    throw new Error((json as { error?: string }).error ?? `API error ${res.status}`);
  }

  return json;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check the Clubkonnect wallet balance (admin/health use).
 */
export async function checkBalance(): Promise<{ success: boolean; balance: string }> {
  return apiFetch('/balance');
}

/**
 * Fetch available data plans for the given network.
 * Returns an empty array if none found or API is unconfigured.
 */
export async function fetchDataPlans(network: string): Promise<DataPlan[]> {
  const data = await apiFetch<{ success: boolean; plans: DataPlan[] }>(
    `/data-plans?network=${encodeURIComponent(network)}`,
  );
  return data.plans ?? [];
}

/**
 * Purchase airtime.
 * Throws if the request fails or the purchase is unsuccessful.
 */
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

/**
 * Purchase data bundle.
 * Throws if the request fails or the purchase is unsuccessful.
 */
export async function buyData(params: {
  network: string;
  phone: string;
  planCode: string;
  planName: string;
  planPrice: string;
}): Promise<PurchaseResult> {
  return apiFetch('/data', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Query the status of a previous transaction by its requestId.
 */
export async function getTransactionStatus(
  requestId: string,
): Promise<{ success: boolean; requestId: string; result: Record<string, unknown> }> {
  return apiFetch(`/status?requestId=${encodeURIComponent(requestId)}`);
}
