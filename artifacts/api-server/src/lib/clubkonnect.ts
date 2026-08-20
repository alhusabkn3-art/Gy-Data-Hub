/**
 * ClubKonnect API client — runs server-side only.
 *
 * Real base URL: https://nellobytesystems.com  (NOT clubkonnect.com/api/v1)
 * All requests are GET with query-string params — ClubKonnect uses no POST endpoints.
 * Credentials are read from environment variables at call time,
 * never bundled into the frontend.
 *
 * Confirmed response keys inside MOBILE_NETWORK (from live API inspection):
 *   MTN → "MTN"  |  Glo → "Glo"  |  9mobile → "m_9mobile"  |  Airtel → "Airtel"
 *
 * Timeouts:
 *   - Balance / data-plans / status queries: 15 seconds
 *   - Airtime / data purchases: 30 seconds (longer network-side processing)
 *
 * Status normalization:
 *   - "successful"                → 'success'
 *   - "pending", "order_received", "processing" → 'pending' (do NOT refund)
 *   - anything else               → 'failed'
 */

const BASE_URL = 'https://nellobytesystems.com';

const TIMEOUT_READ     = 15_000; // ms — balance, plans, status queries
const TIMEOUT_PURCHASE = 30_000; // ms — airtime/data purchase calls

const NETWORK_CODES: Record<string, string> = {
  mtn: '01',
  glo: '02',
  '9mobile': '03',
  airtel: '04',
};

const NETWORK_RESPONSE_KEY: Record<string, string> = {
  mtn: 'MTN',
  glo: 'Glo',
  '9mobile': 'm_9mobile',
  airtel: 'Airtel',
};

export function getNetworkCode(network: string): string {
  const code = NETWORK_CODES[network.toLowerCase()];
  if (!code) throw new Error(`Unknown network: ${network}`);
  return code;
}

function creds() {
  const userId = process.env['CLUBKONNECT_USER_ID'];
  const apiKey = process.env['CLUBKONNECT_API_KEY'];

  if (!userId || !apiKey) {
    throw new Error(
      'CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY are required',
    );
  }

  return { userId, apiKey };
}

function buildUrl(
  endpoint: string,
  params: Record<string, string>,
): string {
  const { userId, apiKey } = creds();
  const url = new URL(`${BASE_URL}/${endpoint}`);

  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function fetchTimeout(
  url: string,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fetch(url, {
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

export function normalizeCKStatus(
  status: string | undefined | null,
): 'success' | 'pending' | 'failed' {
  const s = (status ?? '').toLowerCase().trim();

  if (s === 'successful') return 'success';

  if (
    s === 'pending' ||
    s === 'order_received' ||
    s === 'processing' ||
    s.includes('processing')
  ) {
    return 'pending';
  }

  return 'failed';
}

export interface CKBalance {
  balance: string;
  date?: string;
  id?: string;
  phoneno?: string;
  APIBalance?: string;
}

export interface CKDataPlan {
  DataPlan: string;
  DataPlanName: string;
  DataPlanType: string;
  Price: string;
}

interface CKRawProduct {
  PRODUCT_SNO?: string;
  PRODUCT_CODE?: string;
  PRODUCT_ID?: string;
  PRODUCT_NAME?: string;
  PRODUCT_AMOUNT?: string;
}

export interface CKPurchaseResult {
  status: string;
  OrderID?: string;
  ident?: string;
  Amount?: string;
  DataPlanName?: string;
  Price?: string;
  MobileNumber?: string;
  MobileNetwork?: string;
  [key: string]: unknown;
}

export async function getBalance(): Promise<CKBalance> {
  const url = buildUrl('APIWalletBalanceV1.asp', {});
  const res = await fetchTimeout(url, TIMEOUT_READ);

  if (!res.ok) {
    throw new Error(
      `ClubKonnect balance check HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<CKBalance>;
}

export async function getDataPlans(
  network: string,
): Promise<CKDataPlan[]> {
  const networkCode = getNetworkCode(network);

  const url = buildUrl(
    'APIDatabundlePlansV1.asp',
    {
      MobileNetwork: networkCode,
    },
  );

  const res = await fetchTimeout(url, TIMEOUT_READ);

  if (!res.ok) {
    throw new Error(
      `ClubKonnect data plans HTTP ${res.status}`,
    );
  }

  const json =
    await res.json() as Record<string, unknown>;

  const mobileNetwork =
    json['MOBILE_NETWORK'] as
      | Record<string, unknown>
      | undefined;

  if (!mobileNetwork) return [];

  const responseKey =
    NETWORK_RESPONSE_KEY[network.toLowerCase()];

  if (!responseKey) return [];

  const networkEntry =
    mobileNetwork[responseKey];

  if (
    !Array.isArray(networkEntry) ||
    networkEntry.length === 0
  ) {
    return [];
  }

  const entry =
    networkEntry[0] as {
      PRODUCT?: CKRawProduct[];
    };

  const rawProducts: CKRawProduct[] =
    Array.isArray(entry.PRODUCT)
      ? entry.PRODUCT
      : [];

  if (rawProducts.length === 0) return [];

  return rawProducts
    .map((p) => {
      const name = p.PRODUCT_NAME ?? '';

      const typeMatch =
        name.match(/\(([^)]+)\)/);

      const planType =
        typeMatch
          ? typeMatch[1]
          : 'Standard';

      const rawPrice =
        parseFloat(
          p.PRODUCT_AMOUNT ?? '0',
        );

      const price =
        isNaN(rawPrice)
          ? '0'
          : Math.ceil(rawPrice).toString();

      return {
        DataPlan:
          p.PRODUCT_CODE ??
          p.PRODUCT_ID ??
          '',
        DataPlanName: name,
        DataPlanType: planType,
        Price: price,
      };
    })
    .filter(
      (p) => p.DataPlan !== '',
    );
}

export async function purchaseAirtime(params: {
  network: string;
  phone: string;
  amount: number;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(params.network);

  const url = buildUrl(
    'APIAirtimeV1.asp',
    {
      MobileNetwork: networkCode,
      Amount: params.amount.toString(),
      MobileNumber: params.phone,
      RequestID: params.requestId,
    },
  );

  const res = await fetchTimeout(
    url,
    TIMEOUT_PURCHASE,
  );

  if (!res.ok) {
    throw new Error(
      `ClubKonnect airtime purchase HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<CKPurchaseResult>;
}

export async function purchaseData(params: {
  network: string;
  phone: string;
  planCode: string;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(params.network);

  const url = buildUrl(
    'APIDatabundleV1.asp',
    {
      MobileNetwork: networkCode,
      DataPlan: params.planCode,
      MobileNumber: params.phone,
      RequestID: params.requestId,
    },
  );

  const res = await fetchTimeout(
    url,
    TIMEOUT_PURCHASE,
  );

  if (!res.ok) {
    throw new Error(
      `ClubKonnect data purchase HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<CKPurchaseResult>;
}

export async function getTransactionStatus(
  requestId: string,
): Promise<CKPurchaseResult> {
  const url = buildUrl(
    'APIQueryV1.asp',
    {
      OrderID: requestId,
    },
  );

  const res = await fetchTimeout(
    url,
    TIMEOUT_READ,
  );

  if (!res.ok) {
    throw new Error(
      `ClubKonnect status check HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<CKPurchaseResult>;
}
