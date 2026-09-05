const SMEAPI_BASE = '/api/smeapi';
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
  const res = await fetch(`${base}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let json: unknown;

  try {
    json = await res.json();
  } catch {
    throw new Error(`API error ${res.status}`);
  }

  if (!res.ok) {
    const error =
      json &&
      typeof json === 'object' &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `API error ${res.status}`;

    throw new Error(error);
  }

  return json as T;
}

// ── Data Plans ──────────────────────────────────────────────────────────────

export async function fetchDataPlans(
  network: string,
  _phone?: string,
): Promise<DataPlan[]> {
  const normalizedNetwork = network.trim().toLowerCase();

  if (!normalizedNetwork) {
    throw new Error('Network is required to load data plans.');
  }

  const data = await apiFetch<{
    success: boolean;
    network: string;
    plans: DataPlan[];
  }>(
    SMEAPI_BASE,
    `/data-plans?network=${encodeURIComponent(normalizedNetwork)}`,
  );

  return data.plans ?? [];
}

// ── Data Purchase ───────────────────────────────────────────────────────────

export async function buyData(params: {
  network: string;
  phone: string;
  planCode: string;
  planName: string;
  amount: number;
}): Promise<PurchaseResult> {
  const network = params.network.trim();
  const phone = params.phone.trim();
  const planCode = params.planCode.trim();

  if (!network) {
    throw new Error('Network is required.');
  }

  if (!phone) {
    throw new Error('Phone number is required.');
  }

  if (!planCode) {
    throw new Error('Data plan is required.');
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
        planName: params.planName,
        amount: params.amount,
      }),
    },
  );
}
