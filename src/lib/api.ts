export const sessionTokenKey = "mbapo-session-token";
const sessionKey = "mbapo-session";
const refreshWindowMs = 5 * 60 * 1000;
let refreshPromise: Promise<string | null> | null = null;

function tokenExpiration(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
    );
    const expiration = JSON.parse(json).exp;
    return typeof expiration === "number" ? expiration : null;
  } catch {
    return null;
  }
}

function storeSessionToken(token: string) {
  sessionStorage.setItem(sessionTokenKey, token);
  try {
    const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    if (session)
      sessionStorage.setItem(sessionKey, JSON.stringify({ ...session, token }));
  } catch {
    /* The token key remains the source of truth if an old session is malformed. */
  }
}

async function refreshToken(token: string) {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { token?: string };
  if (!data.token) return null;
  storeSessionToken(data.token);
  return data.token;
}

async function activeToken() {
  const token = sessionStorage.getItem(sessionTokenKey);
  const expiration = token ? tokenExpiration(token) : null;
  if (!token || !expiration || expiration - Date.now() > refreshWindowMs)
    return token;
  refreshPromise ||= refreshToken(token).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = await activeToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export function formatApiError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
