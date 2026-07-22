/**
 * Monnify API client — server-side only.
 *
 * Sandbox base URL: https://sandbox.monnify.com
 * Production base URL: https://api.monnify.com (set MONNIFY_BASE_URL in prod)
 *
 * Credentials are read from environment variables at call time — never bundled
 * into frontend code or logged.
 */
import crypto from 'node:crypto';

const BASE_URL = process.env['MONNIFY_BASE_URL'] ?? 'https://sandbox.monnify.com';

// ── Token cache ───────────────────────────────────────────────────────────────
// Monnify tokens expire in 3600 seconds. We re-fetch 60s before expiry.
interface TokenCache {
  accessToken: string;
  expiresAt:   number; // ms timestamp
}
let tokenCache: TokenCache | null = null;

function creds() {
  const apiKey       = process.env['MONNIFY_API_KEY'];
  const secretKey    = process.env['MONNIFY_SECRET_KEY'];
  const contractCode = process.env['MONNIFY_CONTRACT_CODE'];
  if (!apiKey || !secretKey || !contractCode) {
    throw new Error('MONNIFY_API_KEY, MONNIFY_SECRET_KEY, and MONNIFY_CONTRACT_CODE must be set.');
  }
  return { apiKey, secretKey, contractCode };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const { apiKey, secretKey } = creds();
  const credential = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credential}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Monnify auth failed [${res.status}]: ${body}`);
  }

  const data = await res.json() as {
    requestSuccessful: boolean;
    responseBody: { accessToken: string; expiresIn: number };
  };

  if (!data.requestSuccessful) {
    throw new Error('Monnify auth returned requestSuccessful=false');
  }

  tokenCache = {
    accessToken: data.responseBody.accessToken,
    expiresAt:   Date.now() + data.responseBody.expiresIn * 1_000,
  };

  return tokenCache.accessToken;
}

// ── Initialize transaction ────────────────────────────────────────────────────

export interface InitTransactionParams {
  amount:             number;
  customerName:       string;
  customerEmail:      string;
  paymentReference:   string; // OUR unique reference
  paymentDescription: string;
  redirectUrl:        string;
}

export interface InitTransactionResult {
  /** Monnify's own reference — store this for server-side verification. */
  transactionReference: string;
  /** URL to open for the user to complete payment. */
  checkoutUrl: string;
}

export async function initializeTransaction(
  params: InitTransactionParams,
): Promise<InitTransactionResult> {
  const { contractCode } = creds();
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/api/v1/merchant/transactions/init-transaction`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount:             params.amount,
      currencyCode:       'NGN',
      customerName:       params.customerName,
      customerEmail:      params.customerEmail,
      paymentReference:   params.paymentReference,
      paymentDescription: params.paymentDescription,
      contractCode,
      redirectUrl:        params.redirectUrl,
      paymentMethods:     ['CARD', 'ACCOUNT_TRANSFER'],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Monnify init-transaction failed [${res.status}]: ${body}`);
  }

  const data = await res.json() as {
    requestSuccessful: boolean;
    responseBody: {
      transactionReference: string;
      checkoutUrl?:         string;
      paymentUrl?:          string; // Monnify uses both names across versions
    };
  };

  if (!data.requestSuccessful) {
    throw new Error('Monnify init-transaction returned requestSuccessful=false');
  }

  const url = data.responseBody.checkoutUrl ?? data.responseBody.paymentUrl ?? '';
  if (!url) throw new Error('Monnify returned no checkout URL in responseBody');

  return {
    transactionReference: data.responseBody.transactionReference,
    checkoutUrl:          url,
  };
}

// ── Verify transaction ────────────────────────────────────────────────────────

export interface VerifyTransactionResult {
  paymentStatus:        string; // 'PAID' | 'PENDING' | 'FAILED' | 'OVERPAID' | 'EXPIRED' | ...
  amountPaid:           number;
  totalPayable:         number;
  paymentReference:     string; // OUR reference
  transactionReference: string; // Monnify's reference
}

/**
 * Verify a transaction using Monnify's transactionReference (their ref, not ours).
 * Store the Monnify transactionReference in metadata at initialization time so
 * you can call this later without needing to query by our payment reference.
 */
export async function verifyTransaction(
  monnifyTransactionReference: string,
): Promise<VerifyTransactionResult> {
  const token   = await getAccessToken();
  const encoded = encodeURIComponent(monnifyTransactionReference);

  const res = await fetch(`${BASE_URL}/api/v2/transactions/${encoded}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Monnify verify failed [${res.status}]: ${body}`);
  }

  const data = await res.json() as {
    requestSuccessful: boolean;
    responseBody:      VerifyTransactionResult;
  };

  if (!data.requestSuccessful) {
    throw new Error('Monnify verify returned requestSuccessful=false');
  }

  return data.responseBody;
}

// ── Webhook signature ─────────────────────────────────────────────────────────

/**
 * Verify the HMAC-SHA512 signature Monnify sends in the `monnify-signature` header.
 * rawBody must be the exact bytes of the request body before any parsing.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  try {
    const { secretKey } = creds();
    const expected = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');
    // Use constant-time comparison to prevent timing side-channel attacks
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature,  'hex'),
    );
  } catch {
    return false;
  }
}
