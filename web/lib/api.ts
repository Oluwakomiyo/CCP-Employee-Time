/**
 * Thin fetch wrapper for the Express API. Requests go to the same origin (/api/v1, rewritten to
 * Express by next.config.ts), so the httpOnly session cookies are sent automatically.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Envelope<T> = { success: true; data: T; meta?: PageMeta } | { success: false; error: { code: string; message: string; details?: unknown } };

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

let refreshing: Promise<boolean> | null = null;

/** One shared refresh at a time, so parallel 401s don't race and revoke each other's tokens. */
const refreshSession = () =>
  (refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    }));

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<{ data: T; meta?: PageMeta }> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });

  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshSession()) return request<T>(path, init, true);
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body || body.success === false) {
    const err = body && body.success === false ? body.error : { code: "NETWORK_ERROR", message: "Could not reach the server." };
    throw new ApiError(res.status, err.code, err.message, "details" in err ? err.details : undefined);
  }
  return { data: body.data, meta: body.meta };
}

const json = (body?: unknown) => (body === undefined ? undefined : JSON.stringify(body));

export const api = {
  get: <T>(path: string) => request<T>(path).then((r) => r.data),
  /** For paginated lists: returns `{ data, meta }`. */
  page: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: json(body) }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: json(body) }).then((r) => r.data),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: json(body) }).then((r) => r.data),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }).then((r) => r.data),
};

/** Human message for any thrown value. */
export const errorMessage = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
