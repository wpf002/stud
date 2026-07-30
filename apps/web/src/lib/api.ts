export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper, for client components only. Cookies are always sent —
 * the API is the session authority, the Next.js layer holds no auth state of
 * its own.
 *
 * Calls a same-origin relative path, proxied to the API by the rewrite in
 * next.config.mjs, rather than API_URL directly. Web and api are separate
 * hosts in production, so a direct cross-origin call would have the session
 * cookie scoped to the API's host only — invisible to every server-rendered
 * page afterward, which is exactly the bug this fixes.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/v1${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data.message as string) ?? res.statusText,
      data.error as string,
      data.details,
    );
  }
  return data as T;
}
