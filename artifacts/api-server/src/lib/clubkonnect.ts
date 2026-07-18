/**
 * Clubkonnect API client — runs server-side only.
 *
 * Real base URL: https://nellobytesystems.com  (NOT clubkonnect.com/api/v1)
 * All requests are GET with query-string params — Clubkonnect uses no POST endpoints.
 * Credentials are read from environment variables at call time,
 * never bundled into the frontend.
 */

const BASE_URL = 'https://nellobytesystems.com';

/** Clubkonnect network codes */
const NETWORK_CODES: Record<string, string> = {
  mtn: '01',
  glo: '02',
  '9mobile': '03',
  airtel: '04',
};

/** Map from network slug → response key Clubkonnect uses in MOBILE_NETWORK */
const NETWORK_RESPONSE_KEYS: Record<string, string[]> = {
  mtn: ['MTN'],
  glo: ['GLO', 'Glo'],
  '9mobile': ['9MOBILE', 'ETISALAT', 'Etisalat', '9Mobile'],
  airtel: ['AIRTEL', 'Airtel'],
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
  balance: string;   // e.g. "95.71"  — real field name from Clubkonnect
  date?: string;
  id?: string;
  phoneno?: string;
  APIBalance?: string;  // kept as fallback if field name varies
}

export interface CKDataPlan {
  DataPlan: string;       // PRODUCT_CODE — the code to pass when purchasing
  DataPlanName: string;   // PRODUCT_NAME — human label e.g. "1GB - Monthly (SME)"
  DataPlanType: string;   // e.g. "SME" | "Direct" — extracted from name
  Price: string;          // PRODUCT_AMOUNT — naira e.g. "307"
}

/** Raw product shape returned inside MOBILE_NETWORK[key][0].PRODUCT */
interface CKRawProduct {
  PRODUCT_SNO?: string;
  PRODUCT_CODE?: string;
  PRODUCT_ID?: string;
  PRODUCT_NAME?: string;
  PRODUCT_AMOUNT?: string;
}

export interface CKPurchaseResult {
  status: string;   // "successful" | "pending" | "unsuccessful" | "ORDER_RECEIVED" | ...
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
 *   { MOBILE_NETWORK: { MTN: [{ ID: "01", PRODUCT: [{ PRODUCT_CODE, PRODUCT_NAME, PRODUCT_AMOUNT, ... }] }] } }
 *
 * We normalise to CKDataPlan[] so the frontend doesn't need to know the raw shape.
 */
export async function getDataPlans(network: string): Promise<CKDataPlan[]> {
  const networkCode = getNetworkCode(network);
  const url = buildUrl('APIDatabundlePlansV1.asp', { MobileNetwork: networkCode });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data plans HTTP ${res.status}`);

  const json = await res.json() as Record<string, unknown>;

  // Dig into MOBILE_NETWORK, try all possible key names for the requested network
  const mobileNetwork = json['MOBILE_NETWORK'] as Record<string, unknown> | undefined;
  if (!mobileNetwork) return [];

  const netKey = network.toLowerCase();
  const candidateKeys = NETWORK_RESPONSE_KEYS[netKey] ?? [network.toUpperCase()];

  // Log all keys Clubkonnect uses so we can identify unknown networks
  const allResponseKeys = Object.keys(mobileNetwork);
  if (allResponseKeys.length > 0 && !candidateKeys.some(k => allResponseKeys.includes(k))) {
    console.log(`[data-plans] Unknown key for network "${network}". Response keys: ${allResponseKeys.join(', ')}`);
  }

  let rawProducts: CKRawProduct[] = [];
  for (const key of candidateKeys) {
    const networkEntry = mobileNetwork[key];
    if (Array.isArray(networkEntry) && networkEntry.length > 0) {
      const entry = networkEntry[0] as { PRODUCT?: CKRawProduct[]; ID?: string };
      if (Array.isArray(entry.PRODUCT) && entry.PRODUCT.length > 0) {
        rawProducts = entry.PRODUCT;
        break;
      }
    }
  }

  if (rawProducts.length === 0) return [];

  return rawProducts.map((p) => {
    const name = p.PRODUCT_NAME ?? '';
    // Extract type hint from name e.g. "(SME)" → "SME"
    const typeMatch = name.match(/\(([^)]+)\)/);
    const planType = typeMatch ? typeMatch[1] : 'Standard';

    // Round floating-point prices from Clubkonnect to 2 decimal places
    const rawPrice = parseFloat(p.PRODUCT_AMOUNT ?? '0');
    const price = isNaN(rawPrice) ? '0.00' : Math.ceil(rawPrice).toString();

    return {
      DataPlan: p.PRODUCT_CODE ?? p.PRODUCT_ID ?? '',
      DataPlanName: name,
      DataPlanType: planType,
      Price: price,
    };
  }).filter(p => p.DataPlan !== '');
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
