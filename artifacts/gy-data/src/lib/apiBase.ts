/**
 * GY DATA API BASE
 *
 * WEB:
 *   Uses same-origin /api requests.
 *
 * ANDROID / CAPACITOR:
 *   Uses the configured Render API.
 *
 * Important:
 * VITE_API_URL is intentionally ignored on normal Web builds.
 * This prevents setting VITE_API_URL on Render from causing
 * the Web application to rewrite its own /api requests.
 */

import { Capacitor } from "@capacitor/core";

const PRODUCTION_API_URL =
  "https://gy-data-hub-1.onrender.com";

const envApiUrl = String(
  import.meta.env.VITE_API_URL ?? "",
).trim();

const isNativeApp =
  Capacitor.isNativePlatform();

/**
 * Only Android/iOS/Capacitor builds may use VITE_API_URL.
 *
 * Web always remains same-origin.
 *
 * If the Android build does not receive VITE_API_URL,
 * the production Render API is used as a safe fallback.
 */
export const API_BASE_URL =
  isNativeApp
    ? (
        envApiUrl ||
        PRODUCTION_API_URL
      ).replace(/\/+$/, "")
    : "";

function isApiPath(
  pathname: string,
): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function getInputUrl(
  input: RequestInfo | URL,
): string {
  if (typeof input === "string") {
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
  const rawUrl =
    getInputUrl(input);

  let parsed: URL;

  try {
    parsed = new URL(
      rawUrl,
      window.location.origin,
    );
  } catch {
    return null;
  }

  /**
   * Never modify:
   * - external URLs
   * - image URLs
   * - payment provider URLs
   * - other non-/api requests
   */
  if (!isApiPath(parsed.pathname)) {
    return null;
  }

  /**
   * WEB:
   * Keep /api requests same-origin.
   *
   * This is important because the Render frontend
   * and backend are served from the same origin.
   */
  if (!API_BASE_URL) {
    return null;
  }

  const target =
    new URL(API_BASE_URL);

  target.pathname =
    parsed.pathname;

  target.search =
    parsed.search;

  target.hash =
    parsed.hash;

  return target.toString();
}

/**
 * Keep the original browser fetch.
 */
const originalFetch =
  globalThis.fetch.bind(
    globalThis,
  );

/**
 * Prevent installing the wrapper more than once.
 */
const FETCH_PATCH_KEY =
  "__GY_DATA_FETCH_PATCHED__";

type GyDataGlobal =
  typeof globalThis & {
    __GY_DATA_FETCH_PATCHED__?: boolean;
  };

const globalObject =
  globalThis as GyDataGlobal;

if (
  !globalObject[FETCH_PATCH_KEY]
) {
  globalObject[FETCH_PATCH_KEY] =
    true;

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const apiUrl =
      makeApiUrl(input);

    /**
     * Non-API request:
     * behave exactly like normal fetch.
     */
    if (!apiUrl) {
      return originalFetch(
        input,
        init,
      );
    }

    /**
     * Always include session cookies
     * for GY DATA API requests.
     *
     * Explicit credentials supplied by
     * the caller are preserved.
     */
    const finalInit: RequestInit = {
      ...init,
      credentials:
        init?.credentials ??
        "include",
    };

    /**
     * Request object.
     */
    if (
      input instanceof Request
    ) {
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

    /**
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
 *
 * Web:
 *   /api/...
 *
 * Android:
 *   https://gy-data-hub-1.onrender.com/api/...
 */
export function apiUrl(
  path: string,
): string {
  const cleanPath =
    path.startsWith("/")
      ? path
      : `/${path}`;

  if (!API_BASE_URL) {
    return cleanPath;
  }

  return `${API_BASE_URL}${cleanPath}`;
}
