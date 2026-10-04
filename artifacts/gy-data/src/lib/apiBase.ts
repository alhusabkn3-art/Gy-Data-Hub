// artifacts/gy-data/src/lib/apiBase.ts

import { Capacitor } from '@capacitor/core';

const PRODUCTION_API_URL =
  'https://gy-data-hub-1.onrender.com';

const envApiUrl =
  String(
    import.meta.env.VITE_API_URL ?? '',
  ).trim();

const isNativeApp =
  Capacitor.isNativePlatform();

export const API_BASE_URL =
  isNativeApp
    ? (
        envApiUrl ||
        PRODUCTION_API_URL
      ).replace(/\/+$/, '')
    : '';

function isApiPath(
  pathname: string,
): boolean {
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
  const raw =
    getInputUrl(input);

  let parsed: URL;

  try {
    parsed = new URL(
      raw,
      window.location.origin,
    );
  } catch {
    return null;
  }

  if (
    !isApiPath(
      parsed.pathname,
    )
  ) {
    return null;
  }

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

const originalFetch =
  globalThis.fetch.bind(
    globalThis,
  );

const PATCH_KEY =
  '__GY_DATA_FETCH_PATCHED__';

type GyGlobal =
  typeof globalThis & {
    __GY_DATA_FETCHED__?: boolean;
    __GY_DATA_FETCH_PATCHED__?: boolean;
  };

const globalObject =
  globalThis as GyGlobal;

if (
  !globalObject[PATCH_KEY]
) {
  globalObject[PATCH_KEY] =
    true;

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const apiUrl =
      makeApiUrl(input);

    if (!apiUrl) {
      return originalFetch(
        input,
        init,
      );
    }

    const finalInit: RequestInit = {
      ...init,
      credentials:
        init?.credentials ??
        'include',
    };

    if (
      input instanceof Request
    ) {
      const request =
        new Request(
          apiUrl,
          input,
        );

      return originalFetch(
        request,
        finalInit,
      );
    }

    return originalFetch(
      apiUrl,
      finalInit,
    );
  };
}

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
