/**
 * artifacts/api-server/src/lib/smeapi.ts
 *
 * SME API client
 *
 * SERVER-SIDE ONLY.
 */

import { logger } from './logger.js';

const BASE_URL = String(
  process.env.SME_API_BASE_URL ||
    'https://smeapi.com.ng',
)
  .trim()
  .replace(/\/+$/u, '')
  .replace(/\/api$/u, '');

const TIMEOUT_READ = 15_000;
const TIMEOUT_PURCHASE = 30_000;

const NETWORK_IDS: Record<string, string> = {
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

function normalizeNetwork(network: unknown): string {
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

function buildUrl(path: string): string {
  const cleanPath = String(path)
    .trim()
    .replace(/^\/+/u, '');

  /*
   * SME API endpoints are under /api/.
   * BASE_URL is always normalized to the provider root.
   *
   * Example:
   * SME_API_BASE_URL=https://smeapi.com.ng
   * -> https://smeapi.com.ng/api/dataplans/
   */
  return `${BASE_URL}/api/${cleanPath}`;
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
      let providerMessage =
        response.statusText || 'SME API error';

      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data)
      ) {
        const body = data as Record<string, unknown>;

        const possibleMessage =
          body.message ??
          body.msg ??
          body.error ??
          body.detail ??
          body.error_message ??
          body.errorMessage ??
          body.status;

        if (
          possibleMessage !== undefined &&
          possibleMessage !== null &&
          String(possibleMessage).trim()
        ) {
          providerMessage = String(
            possibleMessage,
          ).trim();
        }
      } else if (
        typeof data === 'string' &&
        data.trim()
      ) {
        providerMessage = data.trim().slice(0, 1000);
      }

      logger.error(
        {
          url,
          status: response.status,
          statusText: response.statusText,
          providerResponse: data,
        },
        'SME API HTTP request failed',
      );

      throw new Error(
        `SME API HTTP ${response.status}: ${providerMessage}`,
      );
    }

    return data as T;
  } catch (err) {
    if (
      err instanceof Error &&
      err.name === 'AbortError'
    ) {
      throw new Error('SME API request timed out');
    }

    throw err instanceof Error
      ? new Error(
          `SME API request failed: ${err.message}`,
        )
      : new Error('SME API request failed');
  } finally {
    clearTimeout(timeout);
  }
}

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

function normalizePlanNetwork(value: unknown): string {
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

function getPlanArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    return [];
  }

  const payload = data as Record<string, unknown>;

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
      const nested = getPlanArray(candidate);

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
      item.networkCode ??
      item.MobileNetwork ??
      item.mobile_network ??
      item.operator ??
      item.provider_network ??
      item.providerNetwork,
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
    item.dataPlan ??
    item.product_id ??
    item.productId ??
    item.product_code ??
    item.productCode
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
    item.dataPlanName ??
    item.product_name ??
    item.productName ??
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
      item.data_type ??
      item.dataType ??
      '',
  ).trim();
}

function getPlanDescription(
  item: Record<string, unknown>,
): string | undefined {
  const value =
    item.description ??
    item.desc ??
    item.details ??
    item.plan_description ??
    item.planDescription;

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const result = String(value).trim();

  return result || undefined;
}

function getPlanPrice(
  item: Record<string, unknown>,
): number | undefined {
  const value =
    item.price ??
    item.user_price ??
    item.userPrice ??
    item.agent_price ??
    item.agentPrice ??
    item.amount ??
    item.selling_price ??
    item.sellingPrice;

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const parsed = Number(
    String(value).replace(/[₦,]/g, '').trim(),
  );

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function getProviderCost(
  item: Record<string, unknown>,
): number | undefined {
  const value =
    item.provider_cost ??
    item.providerCost ??
    item.cost ??
    item.buying_price ??
    item.buyingPrice;

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const parsed = Number(
    String(value).replace(/[₦,]/g, '').trim(),
  );

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

export async function getDataPlans(
  network: string,
): Promise<SMEDataPlan[]> {
  const normalizedNetwork =
    normalizeNetwork(network);

  const networkId =
    getSMENetworkId(normalizedNetwork);

  const data = await request<unknown>(
    'dataplans/',
  );

  const possiblePlans =
    getPlanArray(data);

  const plans: SMEDataPlan[] = [];

  for (const item of possiblePlans) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    const id = getPlanId(record);
    const name = getPlanName(record);

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

    if (
      providerNetwork &&
      providerNetwork !== normalizedNetwork &&
      providerNetwork !== String(networkId)
    ) {
      continue;
    }

    plans.push({
      id: String(id).trim(),
      network: normalizedNetwork,
      name: String(name).trim(),
      category: getPlanCategory(record),
      description:
        getPlanDescription(record),
      price:
        getPlanPrice(record),
      provider_cost:
        getProviderCost(record),
      raw: record,
    });
  }

  return plans;
}

function providerInteger(
  value: string,
  field: string,
): number {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `Invalid SME API ${field}.`,
    );
  }

  return parsed;
}

function normalizeProviderStatus(
  response: Record<string, unknown>,
): SMETransactionStatus {
  const candidates = [
    response.status,
    response.transaction_status,
    response.transactionStatus,
    response.state,
    response.result,
  ];

  for (const candidate of candidates) {
    if (
      candidate === undefined ||
      candidate === null
    ) {
      continue;
    }

    const value = String(candidate)
      .trim()
      .toLowerCase();

    if (
      [
        'success',
        'successful',
        'completed',
        'complete',
        'delivered',
        'true',
        'ok',
      ].includes(value)
    ) {
      return 'success';
    }

    if (
      [
        'failed',
        'failure',
        'fail',
        'cancelled',
        'canceled',
        'false',
      ].includes(value)
    ) {
      return 'failed';
    }

    if (
      [
        'pending',
        'processing',
        'queued',
        'in_progress',
        'in-progress',
      ].includes(value)
    ) {
      return 'pending';
    }
  }

  if (
    response.success === true ||
    response.success === 'true'
  ) {
    return 'success';
  }

  if (
    response.success === false ||
    response.success === 'false'
  ) {
    return 'failed';
  }

  return 'unknown';
}

function purchaseErrorStatus(
  error: unknown,
): SMETransactionStatus {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : '';

  if (
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'pending';
  }

  return 'unknown';
}

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    dataPlan: string;
    reference?: string;
  },
): Promise<SMEResult> {
  const networkId =
    getSMENetworkId(params.network);

  const providerNetwork =
    providerInteger(
      networkId,
      'network',
    );

  const providerDataPlan =
    String(params.dataPlan || '').trim();

  if (!providerDataPlan) {
    throw new Error(
      'Data plan is required.',
    );
  }

  const phone =
    String(params.phone || '').trim();

  if (!phone) {
    throw new Error(
      'Phone number is required.',
    );
  }

  const reference =
    params.reference ||
    makeReference('DATA');

  const payload = {
    network: providerNetwork,
    mobile_number: phone,
    phone,
    data_plan: providerDataPlan,
    ref: reference,
  };

  try {
    const result =
      await request<unknown>(
        'data/',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        TIMEOUT_PURCHASE,
      );

    const response =
      result &&
      typeof result === 'object' &&
      !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};

    const status =
      normalizeProviderStatus(response);

    const message =
      response.message ??
      response.msg ??
      response.error ??
      response.detail;

    const providerReference =
      response.reference ??
      response.ref ??
      response.transaction_id ??
      response.transactionId ??
      response.transaction_reference ??
      response.transactionReference ??
      reference;

    return {
      success: status === 'success',
      status,
      message:
        message !== undefined &&
        message !== null
          ? String(message)
          : undefined,
      reference: String(providerReference),
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
        network: providerNetwork,
        phone,
        data_plan: providerDataPlan,
        reference,
        error: message,
      },
      'SME API data purchase failed',
    );

    return {
      success: false,
      status: purchaseErrorStatus(err),
      message,
      reference,
    };
  }
}

export async function purchaseAirtime(
  params: {
    network: string;
    phone: string;
    amount: number;
    reference?: string;
  },
): Promise<SMEResult> {
  const networkId =
    getSMENetworkId(params.network);

  const providerNetwork =
    providerInteger(
      networkId,
      'network',
    );

  const amount = Number(params.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Invalid airtime amount.',
    );
  }

  const phone =
    String(params.phone || '').trim();

  if (!phone) {
    throw new Error(
      'Phone number is required.',
    );
  }

  const reference =
    params.reference ||
    makeReference('AIRTIME');

  const payload = {
    network: providerNetwork,
    phone,
    amount,
    ref: reference,
    ported_number: 'false',
  };

  try {
    const result =
      await request<unknown>(
        'airtime/',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        TIMEOUT_PURCHASE,
      );

    const response =
      result &&
      typeof result === 'object' &&
      !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};

    const status =
      normalizeProviderStatus(response);

    const message =
      response.message ??
      response.msg ??
      response.error ??
      response.detail;

    const providerReference =
      response.reference ??
      response.ref ??
      response.transaction_id ??
      response.transactionId ??
      response.transaction_reference ??
      response.transactionReference ??
      reference;

    return {
      success: status === 'success',
      status,
      message:
        message !== undefined &&
        message !== null
          ? String(message)
          : undefined,
      reference: String(providerReference),
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
        network: providerNetwork,
        phone,
        amount,
        reference,
        error: message,
      },
      'SME API airtime purchase failed',
    );

    return {
      success: false,
      status: purchaseErrorStatus(err),
      message,
      reference,
    };
  }
}

export interface SMEStatusResult
  extends SMEResult {
  reference: string;
}

function extractProviderReference(
  response: Record<string, unknown>,
  fallback: string,
): string {
  const candidates = [
    response.reference,
    response.ref,
    response.transaction_id,
    response.transactionId,
    response.transaction_reference,
    response.transactionReference,
  ];

  for (const value of candidates) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }

  return fallback;
}

function extractProviderMessage(
  response: Record<string, unknown>,
): string | undefined {
  const value =
    response.message ??
    response.msg ??
    response.error ??
    response.detail ??
    response.description;

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const message = String(value).trim();

  return message || undefined;
}

export async function requeryTransactionByRef(
  reference: string,
): Promise<SMEStatusResult> {
  const ref =
    String(reference || '').trim();

  if (!ref) {
    throw new Error(
      'Transaction reference is required.',
    );
  }

  try {
    const result =
      await request<unknown>(
        'status/',
        {
          method: 'POST',
          body: JSON.stringify({ ref }),
        },
        TIMEOUT_READ,
      );

    const response =
      result &&
      typeof result === 'object' &&
      !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};

    const status =
      normalizeProviderStatus(response);

    const providerReference =
      extractProviderReference(
        response,
        ref,
      );

    const message =
      extractProviderMessage(response);

    return {
      success: status === 'success',
      status,
      message,
      reference: providerReference,
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
        : 'SME API status request failed';

    logger.error(
      {
        reference: ref,
        error: message,
      },
      'SME API transaction status requery failed',
    );

    return {
      success: false,
      status: purchaseErrorStatus(err),
      message,
      reference: ref,
    };
  }
}

export const requeryTransactionStatus =
  requeryTransactionByRef;

export interface SMEBalanceResult {
  success: boolean;
  balance: number;
  message?: string;
  raw?: unknown;
}

function findBalance(
  value: unknown,
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned =
      value
        .replace(/[₦,]/g, '')
        .trim();

    const parsed = Number(cleaned);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  if (
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  const object =
    value as Record<string, unknown>;

  const keys = [
    'balance',
    'wallet_balance',
    'walletBalance',
    'available_balance',
    'availableBalance',
    'credit',
  ];

  for (const key of keys) {
    const parsed =
      findBalance(object[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  for (const key of [
    'data',
    'user',
    'wallet',
    'result',
  ]) {
    const parsed =
      findBalance(object[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

export async function getWalletBalance(): Promise<SMEBalanceResult> {
  try {
    const result =
      await request<unknown>('user/');

    const balance =
      findBalance(result);

    if (balance === null) {
      throw new Error(
        'SME API wallet balance was not found in the /user/ response.',
      );
    }

    return {
      success: true,
      balance,
      raw: result,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'SME API wallet balance request failed';

    logger.error(
      { error: message },
      'SME API wallet balance request failed',
    );

    return {
      success: false,
      balance: 0,
      message,
    };
  }
}

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
