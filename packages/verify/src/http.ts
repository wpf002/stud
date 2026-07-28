/**
 * Shared transport for machine adapters.
 *
 * Every outbound request to a third-party public record goes through here, so
 * politeness is structural rather than per-adapter discipline:
 *
 *   · a real, identifying User-Agent with a contact URL
 *   · a hard timeout, so one slow source cannot hold a request open
 *   · per-host rate limiting with a minimum interval between calls
 *   · bounded retries on transport errors only, never on a 404
 *
 * These sources are public records maintained by non-profits and clubs. We are
 * a guest on their infrastructure and the code should read that way.
 */

import { VerifyError } from './types.js';

export interface HttpConfig {
  userAgent: string;
  timeoutMs: number;
  /** Minimum milliseconds between requests to the same host. */
  minIntervalMs: number;
  maxRetries: number;
}

export const DEFAULT_HTTP_CONFIG: HttpConfig = {
  userAgent: 'StudVerify/0.1 (+https://stud.dog/verification)',
  timeoutMs: 8000,
  minIntervalMs: 1200,
  maxRetries: 2,
};

/** Last request time per host, so the limiter survives across adapters. */
const lastRequestAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(host: string, minIntervalMs: number): Promise<void> {
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

export interface FetchTextResult {
  ok: boolean;
  status: number;
  body: string;
  url: string;
}

/**
 * GET a URL as text.
 *
 * Returns `ok: false` for HTTP errors rather than throwing — a 404 from a
 * records site is a legitimate answer ("no such dog"), not an exception.
 * Only transport failures throw, and the caller maps those to UNAVAILABLE.
 */
export async function fetchText(
  url: string,
  opts: { config?: Partial<HttpConfig>; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<FetchTextResult> {
  const config = { ...DEFAULT_HTTP_CONFIG, ...opts.config };
  const host = new URL(url).host;

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    await throttle(host, config.minIntervalMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': config.userAgent,
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          ...opts.headers,
        },
      });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body, url: res.url };
    } catch (err) {
      lastError = err;
      // Exponential backoff, but only for transport failures.
      if (attempt < config.maxRetries) await sleep(400 * Math.pow(2, attempt));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw new VerifyError(
    `Could not reach ${host}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    'TRANSPORT',
  );
}

/** Reset the rate limiter. Tests only. */
export function __resetThrottle(): void {
  lastRequestAt.clear();
}
