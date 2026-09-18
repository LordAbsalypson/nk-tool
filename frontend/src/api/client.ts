import type { ApiResponse } from "../types";

const BASE = "/api/v1";
const TOKEN_STORAGE_KEY = "nk-tool-auth-token";

/** sessionStorage statt localStorage: Token verfällt beim Schließen des Tabs/
 * Fensters — bei der nächsten Session ist erneutes Einloggen nötig, passend
 * zum "Login pro Datenbank"-Modell (ohnehin per Server 12h gültig). */
let authToken: string | null = sessionStorage.getItem(TOKEN_STORAGE_KEY);
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function getAuthToken(): string | null {
  return authToken;
}

/** App.tsx registriert hier, um bei einer 401-Antwort (z. B. abgelaufenes
 * Token) sofort wieder den Login-Dialog zu zeigen, egal welcher Request es war. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setAuthToken(null);
    onUnauthorized?.();
  }

  const json: ApiResponse<T> = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }

  return json.data;
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (res.status === 401) {
    setAuthToken(null);
    onUnauthorized?.();
  }
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => uploadFile<T>(path, file),
};
