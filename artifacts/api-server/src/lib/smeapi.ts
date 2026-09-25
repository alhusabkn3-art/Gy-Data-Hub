/**
 * artifacts/api-server/src/lib/smeapi.ts
 *
 * SME API client
 * SERVER-SIDE ONLY.
 */

import { logger } from './logger.js';

const configuredBaseUrl = String(
  process.env.SME_API_BASE_URL ||
    'https://smeapi.com.ng/api/',
).trim();

const BASE_URL = (() => {
  const clean =
    configuredBaseUrl.replace(
      /\/+$/u,
      '',
    );

  if (/\/api$/iu.test(clean)) {
    return clean;
  }

  return `${clean}/api`;
})();

const TIMEOUT_READ = 15_000;
const TIMEOUT_PURCHASE = 30_000;

const NETWORK_IDS: Record<
  string,
  string
> = {
  mtn: '1',
  glo: '2',
  '9mobile': '3',
  airtel: '4',
};

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

function makeReference(
  prefix = 'GY',
): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

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

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const apiKey =
      getApiKey();

    const response =
      await fetch(
        buildUrl(path),
        {
          ...options,
          signal:
            controller.signal,
          headers: {
            Accept:
              'application/json',
            Authorization:
              `Bearer ${apiKey}`,
            'X-API-Key':
              apiKey,
            ...(options.headers ??
              {}),
          },
        },
      );

    const text =
      await response.text();

    let data: unknown = null;

    if (text.trim()) {
      try {
        data =
          JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        data &&
        typeof data === 'object' &&
        'message' in data
          ? String(
              (
                data as Record<
                  string,
                  unknown
                >
              ).message,
            )
          : `SME API returned ${response.status}`;

      throw new Error(
        message,
      );
    }

    return data as T;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      throw new Error(
        'SME API request timed out.',
      );
    }

    throw error;
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

  /*
   * REAL validity information from provider.
   */
  validityDays?: number;

  validityLabel?: string;

  raw?: unknown;
}

export type SMETransactionStatus =
  | 'success'
  | 'failed'
  | 'pending'
  | 'unknown';

/* ============================================================
 * PLAN HELPERS
 * ========================================================== */

function normalizePlanNetwork(
  value: unknown,
): string {
  const raw =
    String(value ?? '')
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
    payload.products,
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
 * VALIDITY
 * ========================================================== */

function parseValidityDays(
  value: unknown,
): number | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return Math.round(value);
  }

  const text =
    String(value)
      .trim()
      .toUpperCase();

  if (!text) {
    return undefined;
  }

  const numeric =
    Number(text);

  if (
    Number.isFinite(
      numeric,
    ) &&
    numeric > 0
  ) {
    return Math.round(
      numeric,
    );
  }

  const dayMatch =
    text.match(
      /(\d+(?:\.\d+)?)\s*(?:DAY|DAYS|D)/i,
    );

  if (dayMatch) {
    const days =
      Number(
        dayMatch[1],
      );

    return Number.isFinite(
      days,
    )
      ? Math.round(days)
      : undefined;
  }

  const weekMatch =
    text.match(
      /(\d+(?:\.\d+)?)\s*(?:WEEK|WEEKS|WK|WKS)/i,
    );

  if (weekMatch) {
    const weeks =
      Number(
        weekMatch[1],
      );

    return Number.isFinite(
      weeks,
    )
      ? Math.round(
          weeks * 7,
        )
      : undefined;
  }

  const monthMatch =
    text.match(
      /(\d+(?:\.\d+)?)\s*(?:MONTH|MONTHS|MO|MOS)/i,
    );

  if (monthMatch) {
    const months =
      Number(
        monthMatch[1],
      );

    return Number.isFinite(
      months,
    )
      ? Math.round(
          months * 30,
        )
      : undefined;
  }

  const yearMatch =
    text.match(
      /(\d+(?:\.\d+)?)\s*(?:YEAR|YEARS|YR|YRS)/i,
    );

  if (yearMatch) {
    const years =
      Number(
        yearMatch[1],
      );

    return Number.isFinite(
      years,
    )
      ? Math.round(
          years * 365,
        )
      : undefined;
  }

  return undefined;
}

function getPlanValidityDays(
  item: Record<
    string,
    unknown
  >,
  name: string,
): number | undefined {
  const directValues = [
    item.validityDays,
    item.validity_days,
    item.validity,
    item.durationDays,
    item.duration_days,
    item.duration,
    item.validity_period,
    item.validityPeriod,
    item.days,
    item.period,
    item.expiry_days,
    item.expiryDays,
  ];

  for (const value of directValues) {
    const days =
      parseValidityDays(
        value,
      );

    if (
      days !== undefined
    ) {
      return days;
    }
  }

  /*
   * Some SME APIs put validity only
   * inside the plan name.
   */
  return parseValidityDays(
    name,
  );
}

export function formatValidityLabel(
  days: number | undefined,
): string {
  if (
    days === undefined ||
    !Number.isFinite(days) ||
    days <= 0
  ) {
    return 'Validity not specified';
  }

  if (days === 1) {
    return '1 Day';
  }

  if (days === 7) {
    return '7 Days';
  }

  if (
    days % 7 === 0 &&
    days < 30
  ) {
    return `${days / 7} Weeks`;
  }

  if (
    days === 30
  ) {
    return '30 Days';
  }

  if (
    days === 60
  ) {
    return '60 Days';
  }

  if (
    days === 90
  ) {
    return '90 Days';
  }

  if (
    days === 120
  ) {
    return '120 Days';
  }

  if (
    days === 180
  ) {
    return '180 Days';
  }

  if (
    days === 365
  ) {
    return '365 Days';
  }

  return `${days} Days`;
}

/* ============================================================
 * DATA PLANS
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
      'dataplans/',
    );

  const possiblePlans =
    getPlanArray(data);

  const plans:
    SMEDataPlan[] = [];

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
      getPlanNetwork(
        record,
      );

    if (
      providerNetwork &&
      providerNetwork !==
        normalizedNetwork &&
      providerNetwork !==
        String(networkId)
    ) {
      continue;
    }

    const planName =
      String(name).trim();

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
      String(rawPrice).trim() !== ''
        ? Number(rawPrice)
        : undefined;

    const parsedCost =
      rawCost !==
        undefined &&
      rawCost !== null &&
      String(rawCost).trim() !== ''
        ? Number(rawCost)
        : undefined;

    const validityDays =
      getPlanValidityDays(
        record,
        planName,
      );

    plans.push({
      id: String(id).trim(),

      network:
        normalizedNetwork,

      name:
        planName,

      category:
        getPlanCategory(
          record,
        ),

      description:
        record.description !==
          undefined &&
        record.description !==
          null
          ? String(
              record.description,
            )
          : undefined,

      price:
        parsedPrice !==
          undefined &&
        Number.isFinite(
          parsedPrice,
        )
          ? parsedPrice
          : undefined,

      provider_cost:
        parsedCost !==
          undefined &&
        Number.isFinite(
          parsedCost,
        )
          ? parsedCost
          : undefined,

      validityDays,

      validityLabel:
        formatValidityLabel(
          validityDays,
        ),

      raw: item,
    });
  }

  logger.info(
    {
      network:
        normalizedNetwork,

      providerPlanCount:
        possiblePlans.length,

      matchedPlanCount:
        plans.length,

      samplePlanIds:
        plans
          .slice(0, 10)
          .map(
            plan =>
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
    response.Status,
    response.transaction_status,
    response.transactionStatus,
    response.state,
  ];

  for (
    const value of statusValues
  ) {
    const status =
      String(
        value ?? '',
      )
        .trim()
        .toLowerCase();

    if (
      status === 'success' ||
      status === 'successful' ||
      status === 'completed' ||
      status === 'complete'
    ) {
      return 'success';
    }

    if (
      status === 'failed' ||
      status === 'failure' ||
      status === 'declined'
    ) {
      return 'failed';
    }

    if (
      status === 'pending' ||
      status === 'processing' ||
      status === 'queued'
    ) {
      return 'pending';
    }
  }

  return 'unknown';
}

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    planId: string;
    reference?: string;
  },
): Promise<SMEResult> {
  const reference =
    params.reference ??
    makeReference('GYDATA');

  const network =
    getSMENetworkId(
      params.network,
    );

  const response =
    await request<
      Record<
        string,
        unknown
      >
    >(
      'data/',
      {
        method: 'POST',
        body: JSON.stringify({
          network,
          phone:
            params.phone,
          plan_id:
            params.planId,
          reference,
        }),
        headers: {
          'Content-Type':
            'application/json',
        },
      },
      TIMEOUT_PURCHASE,
    );

  return {
    success:
      normalizeProviderStatus(
        response,
      ) === 'success',
    status:
      normalizeProviderStatus(
        response,
      ),
    message:
      response.message
        ? String(
            response.message,
          )
        : undefined,
    reference,
    transaction:
      response.transaction,
    raw: response,
  };
}
