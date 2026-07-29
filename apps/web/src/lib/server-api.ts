import { cookies } from 'next/headers';
import { API_URL } from './api';

/**
 * Server-side API calls forward the session cookie.
 *
 * The Fastify service is the session authority; this layer holds no auth
 * state of its own (decision D6). Every studio page is authed, so nothing
 * here is cached.
 */
export async function serverApi<T>(path: string): Promise<T> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${API_URL}/v1${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Returns null on 4xx instead of throwing — for optional page data. */
export async function serverApiSafe<T>(path: string): Promise<T | null> {
  try {
    return await serverApi<T>(path);
  } catch {
    return null;
  }
}
