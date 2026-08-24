export const sessionTokenKey = "mbapo-session-token";

export function apiFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = sessionStorage.getItem(sessionTokenKey);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export function formatApiError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
