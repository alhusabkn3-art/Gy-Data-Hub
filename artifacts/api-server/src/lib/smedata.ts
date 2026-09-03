/**
 * SMEDATA.NG DATA PROVIDER
 *
 * Data plans are maintained manually.
 * SMEDATA is called ONLY when a customer actually purchases data.
 *
 * Supported:
 *   - MTN
 *   - GLO
 *   - Airtel
 *
 * NEVER put SMEDATA_API_TOKEN in frontend code.
 */

import { logger } from './logger.js';

const BASE_URL =
  process.env['SMEDATA_API_BASE_URL'] ??
  'https://smedata.ng/wp-json/api/v1';

const READ_TIMEOUT = 10_000;
const PURCHASE_TIMEOUT = 30_000;

export type SmeNetwork =
  | 'mtn'
  | 'glo'
  | 'airtel';

export interface SmeDataPlan {
  DataPlan: string;
  DataPlanName: string;
  DataPlanType: string;
  Price: string;
}

export interface SmePurchaseResult {
  code: string;
  message: string;
  data?: {
    network?: string;
    data_plan?: string;
    phone?: string;
    amount?: string;
    order_id?: string | number;
    product?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * ============================================================
 * MANUAL PLAN CATALOG
 * ============================================================
 *
 * DataPlan MUST match the SMEDATA `size` value exactly.
 *
 * Your pricing_rules.plan_id should use these same values.
 */
const MANUAL_PLANS: Record<
  SmeNetwork,
  SmeDataPlan[]
> = {
  mtn: [
    {
      DataPlan: '1GB',
      DataPlanName:
        'MTN Data Share 1GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '2GB',
      DataPlanName:
        'MTN Data Share 2GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '3GB',
      DataPlanName:
        'MTN Data Share 3GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '5GB',
      DataPlanName:
        'MTN Data Share 5GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '230mb1d',
      DataPlanName:
        'MTN Direct Data 230MB Daily',
      DataPlanType: 'Daily',
      Price: '0',
    },
    {
      DataPlan: '1gb1d',
      DataPlanName:
        'MTN Direct Data 1GB + 1.5Mins Daily',
      DataPlanType: 'Daily',
      Price: '0',
    },
    {
      DataPlan: '1gb1w',
      DataPlanName:
        'MTN Direct Data 1GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '1.5gb2d',
      DataPlanName:
        'MTN Direct Data 1.5GB (2 Days)',
      DataPlanType: '2 Days',
      Price: '0',
    },
    {
      DataPlan: '1.5gb1w',
      DataPlanName:
        'MTN Direct Data 1.5GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '2.5gb1d',
      DataPlanName:
        'MTN Direct Data 2.5GB Daily',
      DataPlanType: 'Daily',
      Price: '0',
    },
    {
      DataPlan: '2.5gb2d',
      DataPlanName:
        'MTN Direct Data 2.5GB (2 Days)',
      DataPlanType: '2 Days',
      Price: '0',
    },
    {
      DataPlan: '2gb1m',
      DataPlanName:
        'MTN Direct Data 2GB + 2Mins (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '2.7gb1m',
      DataPlanName:
        'MTN Direct Data 2.7GB + 5Mins (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '6gb1w',
      DataPlanName:
        'MTN Direct Data 6GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '3.5gb1m',
      DataPlanName:
        'MTN Direct Data 3.5GB + 5Mins (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '7gb1m',
      DataPlanName:
        'MTN Direct Data 7GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '10gb1m',
      DataPlanName:
        'MTN Direct Data 10GB + 10Mins (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '12.5gb1m',
      DataPlanName:
        'MTN Direct Data 12.5GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '16.5gb1m',
      DataPlanName:
        'MTN Direct Data 16.5GB + 10Mins (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '20gb1m',
      DataPlanName:
        'MTN Direct Data 20GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '25gb1m',
      DataPlanName:
        'MTN Direct Data 25GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
  ],

  glo: [
    {
      DataPlan: '500MB',
      DataPlanName:
        'GLO CG 500MB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '1GB',
      DataPlanName:
        'GLO CG 1GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '2GB',
      DataPlanName:
        'GLO CG 2GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '3GB',
      DataPlanName:
        'GLO CG 3GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '5GB',
      DataPlanName:
        'GLO CG 5GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '10GB',
      DataPlanName:
        'GLO CG 10GB (30 Days)',
      DataPlanType: '30 Days',
      Price: '0',
    },
  ],

  airtel: [
    {
      DataPlan: '300mb2d',
      DataPlanName:
        'Airtel CG 300MB (2 Days)',
      DataPlanType: '2 Days',
      Price: '0',
    },
    {
      DataPlan: '500mb1w',
      DataPlanName:
        'Airtel CG 500MB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '1gb1w',
      DataPlanName:
        'Airtel CG 1GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '2gb2d',
      DataPlanName:
        'Airtel CG 2GB (2 Days)',
      DataPlanType: '2 Days',
      Price: '0',
    },
    {
      DataPlan: '1.5gb1w',
      DataPlanName:
        'Airtel CG 1.5GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '4gb1w',
      DataPlanName:
        'Airtel CG 4GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '8gb1w',
      DataPlanName:
        'Airtel CG 8GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '10gb1w',
      DataPlanName:
        'Airtel CG 10GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '15gb1w',
      DataPlanName:
        'Airtel CG 15GB Weekly',
      DataPlanType: 'Weekly',
      Price: '0',
    },
    {
      DataPlan: '2gb1m',
      DataPlanName:
        'Airtel CG 2GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '3gb1m',
      DataPlanName:
        'Airtel CG 3GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '4gb1m',
      DataPlanName:
        'Airtel CG 4GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '8gb1m',
      DataPlanName:
        'Airtel CG 8GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '10gb1m',
      DataPlanName:
        'Airtel CG 10GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '13gb1m',
      DataPlanName:
        'Airtel CG 13GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '18gb1m',
      DataPlanName:
        'Airtel CG 18GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '25gb1m',
      DataPlanName:
        'Airtel CG 25GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
    {
      DataPlan: '35gb1m',
      DataPlanName:
        'Airtel CG 35GB Monthly',
      DataPlanType: '30 Days',
      Price: '0',
    },
  ],
};

function getToken(): string {
  const token =
    process.env['SMEDATA_API_TOKEN']?.trim();

  if (!token) {
    throw new Error(
      'SMEDATA_API_TOKEN is not configured.',
    );
  }

  return token;
}

function normalizeNetwork(
  value: string,
): SmeNetwork {
  const network =
    String(value ?? '')
      .trim()
      .toLowerCase();

  if (
    network === 'mtn' ||
    network === 'glo' ||
    network === 'airtel'
  ) {
    return network;
  }

  throw new Error(
    `SMEDATA does not support data network "${value}".`,
  );
}

function normalizePhone(
  value: string,
): string {
  let phone =
    String(value ?? '')
      .trim()
      .replace(/\D/g, '');

  if (phone.startsWith('234')) {
    phone =
      `0${phone.slice(3)}`;
  }

  if (!/^0\d{10}$/.test(phone)) {
    throw new Error(
      `Invalid Nigerian phone number: ${
        value || '[empty]'
      }`,
    );
  }

  return phone;
}

async function getJson(
  url: string,
  timeoutMs: number,
): Promise<SmePurchaseResult> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
          headers: {
            Accept:
              'application/json',
          },
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `SMEDATA HTTP ${
          response.status
        }: ${text.slice(0, 300)}`,
      );
    }

    if (!text.trim()) {
      throw new Error(
        'SMEDATA returned an empty response.',
      );
    }

    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        'SMEDATA returned invalid JSON.',
      );
    }

    if (
      !json ||
      typeof json !== 'object' ||
      Array.isArray(json)
    ) {
      throw new Error(
        'SMEDATA returned an invalid response format.',
      );
    }

    return json as SmePurchaseResult;
  } finally {
    clearTimeout(timer);
  }
}

export function getManualDataPlans(
  network: string,
): SmeDataPlan[] {
  const normalized =
    normalizeNetwork(network);

  return MANUAL_PLANS[
    normalized
  ].map((plan) => ({
    ...plan,
  }));
}

export function isSmeDataNetwork(
  network: string,
): boolean {
  try {
    normalizeNetwork(network);
    return true;
  } catch {
    return false;
  }
}

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    planCode: string;
    requestId: string;
  },
): Promise<SmePurchaseResult> {
  const network =
    normalizeNetwork(
      params.network,
    );

  const phone =
    normalizePhone(
      params.phone,
    );

  const size =
    String(
      params.planCode ?? '',
    ).trim();

  const requestId =
    String(
      params.requestId ?? '',
    ).trim();

  if (!size) {
    throw new Error(
      'SMEDATA data purchase requires a plan size/code.',
    );
  }

  if (!requestId) {
    throw new Error(
      'SMEDATA data purchase requires a request ID.',
    );
  }

  const configuredPlan =
    MANUAL_PLANS[network].find(
      (plan) =>
        plan.DataPlan.toLowerCase() ===
        size.toLowerCase(),
    );

  if (!configuredPlan) {
    throw new Error(
      `SMEDATA plan "${size}" is not in the manual catalog for ${network}.`,
    );
  }

  const url =
    new URL(
      `${BASE_URL.replace(
        /\/+$/,
        '',
      )}/data`,
    );

  url.searchParams.set(
    'token',
    getToken(),
  );

  url.searchParams.set(
    'network',
    network,
  );

  url.searchParams.set(
    'phone',
    phone,
  );

  url.searchParams.set(
    'size',
    configuredPlan.DataPlan,
  );

  logger.info(
    {
      network,
      phone,
      size:
        configuredPlan.DataPlan,
      requestId,
    },
    'SMEDATA data purchase request',
  );

  const result =
    await getJson(
      url.toString(),
      PURCHASE_TIMEOUT,
    );

  logger.info(
    {
      network,
      phone,
      size:
        configuredPlan.DataPlan,
      requestId,
      vendorCode:
        result.code,
      vendorOrderId:
        result.data?.order_id ??
        null,
      vendorMessage:
        result.message,
    },
    'SMEDATA data purchase response',
  );

  return result;
}

export async function requery(
  orderId: string,
): Promise<SmePurchaseResult> {
  const cleanOrderId =
    String(orderId ?? '')
      .trim();

  if (!cleanOrderId) {
    throw new Error(
      'SMEDATA requery requires an order ID.',
    );
  }

  const url =
    new URL(
      `${BASE_URL.replace(
        /\/+$/,
        '',
      )}/requery`,
    );

  url.searchParams.set(
    'token',
    getToken(),
  );

  url.searchParams.set(
    'orderid',
    cleanOrderId,
  );

  return getJson(
    url.toString(),
    READ_TIMEOUT,
  );
}

export function normalizeSMEStatus(
  code:
    | string
    | undefined
    | null,
): 'success' | 'pending' | 'failed' {
  const normalized =
    String(code ?? '')
      .trim()
      .toLowerCase();

  if (
    normalized ===
      'success' ||
    normalized ===
      'successful'
  ) {
    return 'success';
  }

  if (
    normalized ===
      'processing' ||
    normalized ===
      'pending'
  ) {
    return 'pending';
  }

  return 'failed';
}

export function getSMEProviderRef(
  result: SmePurchaseResult,
): string | null {
  const value =
    result.data?.order_id;

  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return null;
  }

  return String(value).trim();
}
