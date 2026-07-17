/**
 * Clubkonnect API client — runs server-side only.
 * Credentials are read from environment variables at call time,
 * never bundled into the frontend.
 */

const BASE_URL = 'https://www.clubkonnect.com/api/v1';

/** Clubkonnect network codes */
const NETWORK_CODES: Record<string, string> = {
  mtn: '01',
  glo: '02',
  '9mobile': '03',
  airtel: '04',
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

/** Check Clubkonnect wallet balance */
export async function getBalance(): Promise<{ APIBalance: string }> {
  const { userId, apiKey } = creds();
  const url = new URL(`${BASE_URL}/balance/`);
  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Balance check HTTP ${res.status}`);
  return res.json() as Promise<{ APIBalance: string }>;
}

export interface CKDataPlan {
  DataPlan: string;       // plan code to use when purchasing
  DataPlanName: string;   // human label e.g. "1GB for 30 Days"
  DataPlanType: string;   // e.g. "SME" | "Direct"
  Price: string;          // naira e.g. "270.00"
}

/** Fetch available data plans for a network */
export async function getDataPlans(network: string): Promise<CKDataPlan[]> {
  const { userId, apiKey } = creds();
  const networkCode = getNetworkCode(network);

  const url = new URL(`${BASE_URL}/data-plans/`);
  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);
  url.searchParams.set('MobileNetwork', networkCode);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Data plans HTTP ${res.status}`);
  const json = await res.json() as unknown;

  // Clubkonnect returns the array directly or wrapped — normalise
  return (Array.isArray(json) ? json : []) as CKDataPlan[];
}

export interface CKPurchaseResult {
  status: string;   // "successful" | "pending" | "unsuccessful" | ...
  ident?: string;
  Amount?: string;
  DataPlanName?: string;
  Price?: string;
  MobileNumber?: string;
  MobileNetwork?: string;
  [key: string]: unknown;
}

/** Purchase airtime */
export async function purchaseAirtime(params: {
  network: string;
  phone: string;
  amount: number;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const { userId, apiKey } = creds();
  const networkCode = getNetworkCode(params.network);

  const body = new URLSearchParams({
    UserID: userId,
    APIKey: apiKey,
    MobileNetwork: networkCode,
    Amount: params.amount.toString(),
    MobileNumber: params.phone,
    RequestID: params.requestId,
  });

  const res = await fetch(`${BASE_URL}/airtime/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Airtime purchase HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}

/** Purchase data */
export async function purchaseData(params: {
  network: string;
  phone: string;
  planCode: string;
  requestId: string;
}): Promise<CKPurchaseResult> {
  const { userId, apiKey } = creds();
  const networkCode = getNetworkCode(params.network);

  const body = new URLSearchParams({
    UserID: userId,
    APIKey: apiKey,
    MobileNetwork: networkCode,
    DataPlan: params.planCode,
    MobileNumber: params.phone,
    RequestID: params.requestId,
  });

  const res = await fetch(`${BASE_URL}/data/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Data purchase HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}

/** Query transaction status by request ID */
export async function getTransactionStatus(requestId: string): Promise<CKPurchaseResult> {
  const { userId, apiKey } = creds();
  const url = new URL(`${BASE_URL}/requery/`);
  url.searchParams.set('RequestID', requestId);
  url.searchParams.set('UserID', userId);
  url.searchParams.set('APIKey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Status check HTTP ${res.status}`);
  return res.json() as Promise<CKPurchaseResult>;
}
