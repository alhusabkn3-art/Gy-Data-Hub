/**
 * GY DATA API BASE
 *
 * This file solves the Web vs Capacitor Android API problem.
 *
 * Web:
 *   /api/...
 *
 * Android APK:
 *   https://YOUR-RENDER-API.onrender.com/api/...
 *
 * The wrapper also makes API requests use credentials: include
 * so Express session cookies are sent from the Capacitor WebView.
 */

const configuredApiUrl = String(
  import.meta.env.VITE_API_URL ?? '',
).trim();

export const API_BASE_URL =
  configuredApiUrl.replace(/\/+$/, '');

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/')
  );
}

function getInputUrl(
  input: RequestInfo | URL,
): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function makeApiUrl(
  input: RequestInfo | URL,
): string | null {
  if (!API_BASE_URL) {
    return null;
  }

  const rawUrl = getInputUrl(input);

  let parsed: URL;

  try {
    parsed = new URL(
      rawUrl,
      window.location.origin,
    );
  } catch {
    return null;
  }

  /*
   * Only rewrite relative /api/... requests.
   *
   * External URLs such as:
   * https://monnify.com/...
   * are left untouched.
   */
  if (!isApiPath(parsed.pathname)) {
    return null;
  }

  const target = new URL(API_BASE_URL);

  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = parsed.hash;

  return target.toString();
}

/*
 * Keep the original browser fetch.
 */
const originalFetch =
  globalThis.fetch.bind(globalThis);

/*
 * Prevent installing the wrapper more than once.
 */
const FETCH_PATCH_KEY =
  '__GY_DATA_FETCH_PATCHED__';

const globalObject =
  globalThis as typeof globalThis & {
    [FETCH_PATCH_KEY]?: boolean;
  };

if (!globalObject[FETCH_PATCH_KEY]) {
  globalObject[FETCH_PATCH_KEY] = true;

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const apiUrl = makeApiUrl(input);

    /*
     * If this is not an /api request, behave exactly like
     * normal browser fetch.
     */
    if (!apiUrl) {
      return originalFetch(input, init);
    }

    /*
     * Always send the session cookie for our API.
     *
     * If the caller explicitly supplied another credentials
     * value, keep that value.
     */
    const finalInit: RequestInit = {
      ...init,
      credentials:
        init?.credentials ?? 'include',
    };

    /*
     * Request object.
     */
    if (input instanceof Request) {
      const redirectedRequest =
        new Request(
          apiUrl,
          input,
        );

      return originalFetch(
        redirectedRequest,
        finalInit,
      );
    }

    /*
     * String / URL request.
     */
    return originalFetch(
      apiUrl,
      finalInit,
    );
  };
}

/**
 * Build an API URL manually when needed.
 */
export function apiUrl(
  path: string,
): string {
  const cleanPath =
    path.startsWith('/')
      ? path
      : `/${path}`;

  if (!API_BASE_URL) {
    return cleanPath;
  }

  return `${API_BASE_URL}${cleanPath}`;
}
