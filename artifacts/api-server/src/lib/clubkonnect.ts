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

// ── Network codes ─────────────────────────────────────────────────────────────

/** Clubkonnect MobileNetwork param codes */
const NETWORK_CODES: Record<string, string> = {
  mtn:     '01',
  glo:     '02',
  '9mobile': '03',
  airtel:  '04',
};

/**
 * Exact key each network uses inside the MOBILE_NETWORK object in ClubKonnect's response.
 * Confirmed by live API inspection — do NOT change without re-verifying against live data.
 */
const NETWORK_RESPONSE_KEY: Record<string, string> = {
  mtn:     'MTN',
  glo:     'Glo',
  '9mobile': 'm_9mobile',
  airtel:  'Airtel',
};

export function getNetworkCode(network: string): string {
  const code = NETWORK_CODES[network.toLowerCase()];
  if (!code) throw new Error(`Unknown network: ${network}`);
  return code;
}

// ── Credentials + URL builder ─────────────────────────────────────────────────

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

function fetchTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Status normalization ──────────────────────────────────────────────────────

/**
 * Normalise the vendor status string to one of three states:
 *
 * 'success'  — delivery confirmed, mark transaction success, no wallet change needed.
 * 'pending'  — vendor is still processing. DO NOT refund. Poll again later.
 * 'failed'   — delivery confirmed failed. Refund wallet, mark transaction failed.
 *
 * ClubKonnect known status values (case-insensitive):
 *   "successful"    → success
 *   "pending"       → pending
 *   "order_received"→ pending  (vendor acknowledged, not yet delivered)
 *   "processing"    → pending
 *   "unsuccessful"  → failed
 *   ""  / null      → failed   (no response or empty status)
 */
export function normalizeCKStatus(status: string | undefined | null): 'success' | 'pending' | 'failed' {
  const s = (status ?? '').toLowerCase().trim();
  if (s === 'successful') return 'success';
  if (s === 'pending' || s === 'order_received' || s === 'processing' || s.includes('processing')) {
    return 'pending';
  }
  return 'failed';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CKBalance {
  balance:     string;   // e.g. "95.71"
  date?:       string;
  id?:         string;
  phoneno?:    string;
  APIBalance?: string;   // fallback field name in some responses
}

export interface CKDataPlan {
  DataPlan:     string; // PRODUCT_CODE — the code to send when purchasing
  DataPlanName: string; // human label e.g. "1 GB - Monthly (SME)"
  DataPlanType: string; // e.g. "SME" | "Direct Data" | "Awoof Data"
  Price:        string; // whole-number naira string e.g. "410"
}

interface CKRawProduct {
  PRODUCT_SNO?:    string;
  PRODUCT_CODE?:   string;
  PRODUCT_ID?:     string;
  PRODUCT_NAME?:   string;
  PRODUCT_AMOUNT?: string;
}

export interface CKPurchaseResult {
  /** Vendor status string — pass to normalizeCKStatus() before acting on it */
  status:         string;
  /** Vendor's internal order reference — store as provider_reference */
  OrderID?:       string;
  /** Alternative vendor reference field */
  ident?:         string;
  Amount?:        string;
  DataPlanName?:  string;
  Price?:         string;
  MobileNumber?:  string;
  MobileNetwork?: string;
  [key: string]:  unknown;
}

// ── API functions ─────────────────────────────────────────────────────────────

/** Check ClubKonnect wallet balance */
export async function getBalance(): Promise<CKBalance> {
  const url = buildUrl('APIWalletBalanceV1.asp', {});
  const res = await fetchTimeout(url, TIMEOUT_READ);
  if (!res.ok) throw new Error(`ClubKonnect balance check HTTP ${res.status}`);
  return res.json() as Promise<CKBalance>;
}

/**
 * Fetch available data plans for a network.
 *
 * Clubkonnect response shape:
 *   { MOBILE_NETWORK: { <NetworkKey>: [{ ID, PRODUCT: [{ PRODUCT_CODE, PRODUCT_NAME, PRODUCT_AMOUNT }] }] } }
 *
 * Prices from ClubKonnect may have floating-point artifacts (e.g. "97.0000028610229").
 * We round up to the nearest whole naira (Math.ceil) to get clean display values.
 */
export async function getDataPlans(network: string): Promise<CKDataPlan[]> {
  const networkCode = getNetworkCode(network);
  const url = buildUrl('APIDatabundlePlansV1.asp', { MobileNetwork: networkCode });
  const res = await fetchTimeout(url, TIMEOUT_READ);
  if (!res.ok) throw new Error(`ClubKonnect data plans HTTP ${res.status}`);

  const json = await res.json() as Record<string, unknown>;
  const mobileNetwork = json['MOBILE_NETWORK'] as Record<string, unknown> | undefined;
  if (!mobileNetwork) return [];

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
      const typeMatch = name.match(/\(([^)]+)\)/);
      const planType  = typeMatch ? typeMatch[1] : 'Standard';
      const rawPrice  = parseFloat(p.PRODUCT_AMOUNT ?? '0');
      const price     = isNaN(rawPrice) ? '0' : Math.ceil(rawPrice).toString();
      return {
        DataPlan:     p.PRODUCT_CODE ?? p.PRODUCT_ID ?? '',
        DataPlanName: name,
        DataPlanType: planType,
        Price:        price,
      };
    })
    .filter((p) => p.DataPlan !== '');
}

/**
 * Purchase airtime.
 *
 * Important: ClubKonnect may return status "pending" or "ORDER_RECEIVED" for
 * successful orders that are still being processed. Caller MUST use
 * normalizeCKStatus() and NOT treat "pending" as a failure.
 */
export async function purchaseAirtime(params: {
  network:   string;
  phone:     string;
  amount:    number;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const networkCode = getNetworkCode(params.network);
  const url = buildUrl('APIAirtimeV1.asp', {
    MobileNetwork: networkCode,
    Amount:        params.amount.toString(),
    MobileNumber:  params.phone,
    RequestID:     params.requestId,
  });
  const res = await fetchTimeout(url, TIMEOUT_PURCHASE);
  if (!res.ok) throw new Error(`ClubKonnect airtime purchase HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}

/**
 * Purchase data bundle.
 *
 * Same note as purchaseAirtime — "pending" is a valid intermediate status.
 */
export async function purchaseData(params: {
  network:   string;
  phone:     string;
  planCode:  string;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const networkCode = getNetworkCode(params.network);
  const url = buildUrl('APIDatabundleV1.asp', {
    MobileNetwork: networkCode,
    DataPlan:      params.planCode,
    MobileNumber:  params.phone,
    RequestID:     params.requestId,
  });
  const res = await fetchTimeout(url, TIMEOUT_PURCHASE);
  if (!res.ok) throw new Error(`ClubKonnect data purchase HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}

/**
 * Query transaction status by the RequestID we originally sent.
 * Used by the stuck-transaction recovery job to check if "pending" transactions
 * were actually delivered before deciding whether to refund the wallet.
 */
export async function getTransactionStatus(requestId: string): Promise<CKPurchaseResult> {
  const url = buildUrl('APIQueryV1.asp', { OrderID: requestId });
  const res = await fetchTimeout(url, TIMEOUT_READ);
  if (!res.ok) throw new Error(`ClubKonnect status check HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}
