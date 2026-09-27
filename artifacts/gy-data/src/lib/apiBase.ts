const configuredApiUrl = String(
  import.meta.env.VITE_API_URL ?? '',
).trim();

export const API_BASE_URL = configuredApiUrl.replace(
  /\/+$/,
  '',
);

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/')
    ? path
    : `/${path}`;

  // When VITE_API_URL is not configured,
  // keep same-origin behavior for the Render web app.
  if (!API_BASE_URL) {
    return cleanPath;
  }

  return `${API_BASE_URL}${cleanPath}`;
}
