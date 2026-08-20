/**
 * Monnify API client — server-side only.
 *
 * Sandbox base URL: https://sandbox.monnify.com
 * Production base URL: https://api.monnify.com (set MONNIFY_BASE_URL in prod)
 *
 * Security model:
 *   - All credentials read from env vars at call time, never bundled or logged.
 *   - Token cache deduplicates concurrent refresh requests via a mutex Promise.
 *   - All fetch calls use AbortController timeouts (15 s for auth, 30 s for others).
 *   - Webhook signatures verified with HMAC-SHA512 + constant-time comparison.
 */
import crypto from 'node:crypto';
import { logger } from './logger.js';

const BASE_URL = process.env['MONNIFY_BASE_URL'] ?? 'https://sandbox.monnify.com';
const TIMEOUT_AUTH = 15_000;
const TIMEOUT_API = 30_000;

function creds() {
  const apiKey = process.env['MONNIFY_API_KEY'];
  const secretKey = process.env['MONNIFY_SECRET_KEY'];
  const contractCode = process.env['MONNIFY_CONTRACT_CODE'];

  if (!apiKey || !secretKey || !contractCode) {
    throw new Error(
      'MONNIFY_API_KEY, MONNIFY_SECRET_KEY, and MONNIFY_CONTRACT_CODE must be set.',
    );
  }

  return { apiKey, secretKey, contractCode };
}

function fetchTimeout(
  url: string,
  options: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, ms);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let tokenRefreshInFlight: Promise<string> | null = null;

async function doTokenFetch(): Promise<string> {
  const { apiKey, secretKey } = creds();

  const credential = Buffer.from(
    `${apiKey}:${secretKey}`,
  ).toString('base64');

  const res = await fetchTimeout(
    `${BASE_URL}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credential}`,
        'Content-Type': 'application/json',
      },
    },
    TIMEOUT_AUTH,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Monnify auth failed [${res.status}]: ${body}`,
    );
  }

  const data = await res.json() as {
    requestSuccessful: boolean;
    responseBody: {
      accessToken: string;
      expiresIn: number;
    };
  };

  if (!data.requestSuccessful) {
    throw new Error(
      'Monnify auth returned requestSuccessful=false',
    );
  }

  tokenCache = {
    accessToken: data.responseBody.accessToken,
    expiresAt:
      Date.now() +
      data.responseBody.expiresIn * 1_000,
  };

  logger.debug('Monnify access token refreshed');

  return tokenCache.accessToken;
}

export async function getAccessToken(): Promise<string> {
  if (
    tokenCache &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.accessToken;
  }

  if (tokenRefreshInFlight) {
    logger.debug(
      'Monnify token refresh already in flight — waiting for existing request',
    );

    return tokenRefreshInFlight;
  }

  tokenRefreshInFlight = doTokenFetch().finally(() => {
    tokenRefreshInFlight = null;
  });

  return tokenRefreshInFlight;
}

export interface InitTransactionParams {
  amount: number;
  customerName: string;
  customerEmail: string;
  paymentReference: string;
  paymentDescription: string;
  redirectUrl: string;
}

export interface InitTransactionResult {
  transactionReference: string;
  checkoutUrl: string;
}

export async function initializeTransaction(
  params: InitTransactionParams,
): Promise<InitTransactionResult> {
  const { contractCode } = creds();
  const token = await getAccessToken();

  const res = await fetchTimeout(
    `${BASE_URL}/api/v1/merchant/transactions/init-transaction`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amount,
        currencyCode: 'NGN',
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        paymentReference: params.paymentReference,
        paymentDescription: params.paymentDescription,
        contractCode,
        redirectUrl: params.redirectUrl,
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
      }),
    },
    TIMEOUT_API,
  );

  if (!res.ok) {
    const body = await res.text();

    throw new Error(
      `Monnify init-transaction failed [${res.status}]: ${body}`,
    );
  }

  const data = await res.json() as {
    requestSuccessful: boolean;
    responseBody: {
      transactionReference: string;
      checkoutUrl?: string;
      paymentUrl?: string;
    };
  };

  if (!data.requestSuccessful) {
    throw new Error(
      'Monnify init-transaction returned requestSuccessful=false',
    );
  }

  const url =
    data.responseBody.checkoutUrl ??
    data.responseBody.paymentUrl ??
    '';

  if (!url) {
    throw new Error(
      'Monnify returned no checkout URL in responseBody',
    );
  }

  return {
    transactionReference:
      data.responseBody.transactionReference,
    checkoutUrl: url,
  };
}

export interface VerifyTransactionResult {
  paymentStatus: string;
  amountPaid: number;
  totalPayable: number;
  paymentReference: string;
  transactionReference: string;
  completedOn?: string;
  channelType?: string;
}

export async function verifyTransaction(
  monnifyTransactionReference: string,
): Promise<VerifyTransactionResult> {
  const token = await getAccessToken();

  const encoded = encodeURIComponent(
    monnifyTransactionReference,
  );

  const res = await fetchTimeout(
    `${BASE_URL}/api/v2/transactions/${encoded}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    TIMEOUT_API,
  );

  if (!res.ok) {
    const body = await res.text();

    throw new Error(
      `Monnify verify failed [${res.status}]: ${body}`,
    );
  }

  const data = await res.json() as {
    requestSuccessful: boolean;
    responseBody: VerifyTransactionResult;
  };

  if (!data.requestSuccessful) {
    throw new Error(
      'Monnify verify returned requestSuccessful=false',
    );
  }

  return data.responseBody;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  try {
    const { secretKey } = creds();

    const expected = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');

    if (expected.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}
