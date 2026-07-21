/**
 * Clubkonnect API client — runs server-side only.
 *
 * Real base URL: https://nellobytesystems.com  (NOT clubkonnect.com/api/v1)
 * All requests are GET with query-string params — Clubkonnect uses no POST endpoints.
 * Credentials are read from environment variables at call time,
 * never bundled into the frontend.
 *
 * Confirmed response keys inside MOBILE_NETWORK (from live API inspection):
 *   MTN → "MTN"  |  Glo → "Glo"  |  9mobile → "m_9mobile"  |  Airtel → "Airtel"
 */

const BASE_URL = 'https://nellobytesystems.com';

/** Clubkonnect network codes sent as MobileNetwork param */
const NETWORK_CODES: Record<string, string> = {
  mtn: '01',
  glo: '02',
  '9mobile': '03',
  airtel: '04',
};

/**
 * Exact key each network uses inside the MOBILE_NETWORK object in Clubkonnect's response.
 * Confirmed by live API inspection — do NOT change without re-verifying against live data.
 */
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
    throw new Error('CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY are required');
  }
  return { userId, apiKey };
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const { userId, apiKey } = creds();
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CKBalance {
  balance: string;    // real field name — e.g. "95.71"
  date?: string;
  id?: string;
  phoneno?: string;
  APIBalance?: string; // kept as fallback
}

export interface CKDataPlan {
  DataPlan: string;      // PRODUCT_CODE — the code to send when purchasing
  DataPlanName: string;  // human label e.g. "1 GB - Monthly (SME)"
  DataPlanType: string;  // e.g. "SME" | "Direct Data" | "Awoof Data"
  Price: string;         // whole-number naira string e.g. "410"
}

/** Raw product shape inside MOBILE_NETWORK[key][0].PRODUCT */
interface CKRawProduct {
  PRODUCT_SNO?: string;
  PRODUCT_CODE?: string;
  PRODUCT_ID?: string;
  PRODUCT_NAME?: string;
  PRODUCT_AMOUNT?: string;
}

export interface CKPurchaseResult {
  status: string;   // "successful" | "pending" | "unsuccessful" | "ORDER_RECEIVED" | …
  ident?: string;
  OrderID?: string;
  Amount?: string;
  DataPlanName?: string;
  Price?: string;
  MobileNumber?: string;
  MobileNetwork?: string;
  [key: string]: unknown;
}

// ── API functions ─────────────────────────────────────────────────────────────

/** Check Clubkonnect wallet balance */
export async function getBalance(): Promise<CKBalance> {
  const url = buildUrl('APIWalletBalanceV1.asp', {});
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Balance check HTTP ${res.status}`);
  return res.json() as Promise<CKBalance>;
}

/**
 * Fetch available data plans for a network.
 *
 * Clubkonnect response shape:
 *   { MOBILE_NETWORK: { <NetworkKey>: [{ ID, PRODUCT: [{ PRODUCT_CODE, PRODUCT_NAME, PRODUCT_AMOUNT }] }] } }
 *
 * Prices from Clubkonnect may have floating-point artifacts (e.g. "97.0000028610229").
 * We round up to the nearest whole naira (Math.ceil) to get clean display values.
 */
export async function getDataPlans(network: string): Promise<CKDataPlan[]> {
  const networkCode = getNetworkCode(network);
  const url = buildUrl('APIDatabundlePlansV1.asp', { MobileNetwork: networkCode });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data plans HTTP ${res.status}`);

  const json = await res.json() as Record<string, unknown>;

  const mobileNetwork = json['MOBILE_NETWORK'] as Record<string, unknown> | undefined;
  if (!mobileNetwork) return [];

  // Use only the exact confirmed response key for this network — no fallback
  const responseKey = NETWORK_RESPONSE_KEY[network.toLowerCase()];
  if (!responseKey) return [];

  const networkEntry = mobileNetwork[responseKey];
  if (!Array.isArray(networkEntry) || networkEntry.length === 0) return [];

  const entry = networkEntry[0] as { PRODUCT?: CKRawProduct[] };
  const rawProducts: CKRawProduct[] = Array.isArray(entry.PRODUCT) ? entry.PRODUCT : [];
  if (rawProducts.length === 0) return [];

  return rawProducts
    .map((p) => {
      const name = p.PRODUCT_NAME ?? '';
      // Extract type label from parentheses e.g. "(SME)" → "SME", "(Direct Data)" → "Direct Data"
      const typeMatch = name.match(/\(([^)]+)\)/);
      const planType = typeMatch ? typeMatch[1] : 'Standard';

      // Clubkonnect prices often carry floating-point noise. Round up to nearest naira.
      const rawPrice = parseFloat(p.PRODUCT_AMOUNT ?? '0');
      const price = isNaN(rawPrice) ? '0' : Math.ceil(rawPrice).toString();

      return {
        DataPlan: p.PRODUCT_CODE ?? p.PRODUCT_ID ?? '',
        DataPlanName: name,
        DataPlanType: planType,
        Price: price,
      };
    })
    .filter((p) => p.DataPlan !== '');
}

/** Purchase airtime — GET request */
export async function purchaseAirtime(params: {
  network: string;
  phone: string;
  amount: number;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const networkCode = getNetworkCode(params.network);
  const url = buildUrl('APIAirtimeV1.asp', {
    MobileNetwork: networkCode,
    Amount: params.amount.toString(),
    MobileNumber: params.phone,
    RequestID: params.requestId,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Airtime purchase HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}

/** Purchase data bundle — GET request */
export async function purchaseData(params: {
  network: string;
  phone: string;
  planCode: string;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const networkCode = getNetworkCode(params.network);
  const url = buildUrl('APIDatabundleV1.asp', {
    MobileNetwork: networkCode,
    DataPlan: params.planCode,
    MobileNumber: params.phone,
    RequestID: params.requestId,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data purchase HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}

/** Query transaction status by order/request ID */
export async function getTransactionStatus(orderId: string): Promise<CKPurchaseResult> {
  const url = buildUrl('APIQueryV1.asp', { OrderID: orderId });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Status check HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}
