export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<{ data: T; etag: string | null }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.method && init.method !== "GET") {
    const cookie = document.cookie.split("; ").find((value) => value.startsWith("chinavr-csrf=") || value.startsWith("chinavr-preview-csrf="));
    if (cookie) headers.set("X-CSRF-Token", decodeURIComponent(cookie.slice(cookie.startsWith("chinavr-preview-csrf=") ? "chinavr-preview-csrf=".length : "chinavr-csrf=".length)));
  }
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store", signal: init.signal ?? AbortSignal.timeout(15000) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new ApiError(response.status, data.code ?? "REQUEST_FAILED", data.message ?? "请求失败，请重试");
  return { data: data as T, etag: response.headers.get("ETag") };
}