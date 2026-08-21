/**
 * ClubKonnect API client — server-side only.
 */

const BASE_URL = 'https://nellobytesystems.com';

const TIMEOUT_READ = 15_000;
const TIMEOUT_PURCHASE = 30_000;

const NETWORK_CODES: Record<string, string> = {
  mtn: '01',
  glo: '02',
  '9mobile': '03',
  airtel: '04',
};

export function getNetworkCode(network: string): string {
  const code = NETWORK_CODES[network.trim().toLowerCase()];

  if (!code) {
    throw new Error(`Unknown network: ${network}`);
  }

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
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function fetchTimeout(
  url: string,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    ms,
  );

  try {
    return await fetch(url, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeCKStatus(
  status: string | undefined | null,
): 'success' | 'pending' | 'failed' {
  const s = (status ?? '').toLowerCase().trim();

  if (
    s === 'successful' ||
    s === 'success' ||
    s === 'completed' ||
    s === 'complete'
  ) {
    return 'success';
  }

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
  [key: string]: unknown;
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
  const url = buildUrl(
    'APIWalletBalanceV1.asp',
    {},
  );

  const res = await fetchTimeout(
    url,
    TIMEOUT_READ,
  );

  if (!res.ok) {
    throw new Error(
      `ClubKonnect balance check HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<CKBalance>;
}

/**
 * Fetch data plans.
 *
 * ClubKonnect requires MobileNumber for this endpoint.
 */
export async function getDataPlans(
  network: string,
  phone: string,
): Promise<CKDataPlan[]> {
  const normalizedNetwork =
    network.trim().toLowerCase();

  const normalizedPhone =
    phone.trim();

  if (!normalizedPhone) {
    throw new Error(
      'Mobile phone number is required to fetch data plans.',
    );
  }

  const networkCode =
    getNetworkCode(normalizedNetwork);

  const url = buildUrl(
    'APIDatabundlePlansV1.asp',
    {
      MobileNetwork: networkCode,
      MobileNumber: normalizedPhone,
    },
  );

  const res = await fetchTimeout(
    url,
    TIMEOUT_READ,
  );

  const responseText =
    await res.text();

  if (!res.ok) {
    throw new Error(
      `ClubKonnect data plans HTTP ${res.status}`,
    );
  }

  let json: unknown;

  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(
      'ClubKonnect returned an invalid data-plans response.',
    );
  }

  const root =
    json as Record<string, unknown>;

  /*
   * ClubKonnect can return:
   *
   * {
   *   MOBILE_NETWORK: {
   *     Glo: [
   *       {
   *         PRODUCT: [...]
   *       }
   *     ]
   *   }
   * }
   *
   * It can also return an error such as:
   *
   * {
   *   status: "MISSING_PHONE_NUMBER"
   * }
   */

  const status =
    typeof root.status === 'string'
      ? root.status
      : '';

  if (status) {
    if (
      status.toLowerCase() !==
      'success'
    ) {
      throw new Error(
        `ClubKonnect: ${status}`,
      );
    }
  }

  const mobileNetwork =
    root['MOBILE_NETWORK'] as
      | Record<string, unknown>
      | undefined;

  if (!mobileNetwork) {
    return [];
  }

  const responseKeys: Record<
    string,
    string[]
  > = {
    mtn: ['MTN', 'mtn', 'Mtn'],
    glo: ['Glo', 'GLO', 'glo'],
    airtel: ['Airtel', 'AIRTEL', 'airtel'],
    '9mobile': [
      'm_9mobile',
      '9mobile',
      '9MOBILE',
      '9Mobile',
      'M_9MOBILE',
    ],
  };

  const possibleKeys =
    responseKeys[normalizedNetwork] ?? [];

  let networkEntry: unknown;

  for (const key of possibleKeys) {
    if (
      mobileNetwork[key] !==
      undefined
    ) {
      networkEntry =
        mobileNetwork[key];
      break;
    }
  }

  if (!networkEntry) {
    return [];
  }

  const entries = Array.isArray(
    networkEntry,
  )
    ? networkEntry
    : [networkEntry];

  const rawProducts: CKRawProduct[] =
    [];

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== 'object'
    ) {
      continue;
    }

    const product =
      (entry as {
        PRODUCT?: unknown;
      }).PRODUCT;

    if (Array.isArray(product)) {
      for (const item of product) {
        if (
          item &&
          typeof item === 'object'
        ) {
          rawProducts.push(
            item as CKRawProduct,
          );
        }
      }
    }
  }

  return rawProducts
    .map((p) => {
      const name =
        p.PRODUCT_NAME ?? '';

      const typeMatch =
        name.match(
          /\(([^)]+)\)/,
        );

      const planType =
        typeMatch?.[1] ??
        'Standard';

      const rawPrice =
        Number.parseFloat(
          p.PRODUCT_AMOUNT ?? '0',
        );

      const price =
        Number.isFinite(rawPrice)
          ? Math.ceil(
              rawPrice,
            ).toString()
          : '0';

      return {
        DataPlan:
          p.PRODUCT_CODE ??
          p.PRODUCT_ID ??
          '',

        DataPlanName:
          name,

        DataPlanType:
          planType,

        Price:
          price,
      };
    })
    .filter(
      (p) => p.DataPlan !== '',
    );
}

export async function purchaseAirtime(
  params: {
    network: string;
    phone: string;
    amount: number;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(
      params.network,
    );

  const url = buildUrl(
    'APIAirtimeV1.asp',
    {
      MobileNetwork:
        networkCode,

      Amount:
        params.amount.toString(),

      MobileNumber:
        params.phone,

      RequestID:
        params.requestId,
    },
  );

  const res =
    await fetchTimeout(
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

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    planCode: string;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode =
    getNetworkCode(
      params.network,
    );

  const url = buildUrl(
    'APIDatabundleV1.asp',
    {
      MobileNetwork:
        networkCode,

      DataPlan:
        params.planCode,

      MobileNumber:
        params.phone,

      RequestID:
        params.requestId,
    },
  );

  const res =
    await fetchTimeout(
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

  const res =
    await fetchTimeout(
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
