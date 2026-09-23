export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const API_PREFIX = "/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const CSRF_COOKIE_NAMES = ["chinavr-csrf", "chinavr-preview-csrf"] as const;

export async function api<T>(path: string, init: RequestInit = {}): Promise<{ data: T; etag: string | null }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const method = init.method?.toUpperCase();
  if (method && method !== "GET") {
    const csrfToken = readCsrfToken(document.cookie);
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store", signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new ApiError(response.status, data.code ?? "REQUEST_FAILED", data.message ?? "请求失败，请重试");
  return { data: data as T, etag: response.headers.get("ETag") };
}

function readCsrfToken(cookieHeader: string): string | null {
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => CSRF_COOKIE_NAMES.some((name) => part.startsWith(`${name}=`)));
  if (!cookie) return null;
  const separator = cookie.indexOf("=");
  if (separator < 0) return null;
  try {
    return decodeURIComponent(cookie.slice(separator + 1));
  } catch {
    return null;
  }
}
