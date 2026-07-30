/**
 * The site's own public origin, for the places that need an absolute URL:
 * canonicals, the sitemap, robots, and JSON-LD.
 *
 * Read in this order:
 *
 *   1. RAILWAY_PUBLIC_DOMAIN — set by Railway and always pointing at whatever
 *                              domain actually serves the service. Available
 *                              during the build AND at runtime (verified by
 *                              echoing it from the build command), so nothing
 *                              here needs a human to keep it in sync.
 *   2. SITE_URL              — explicit override, for a custom domain that
 *                              Railway's own value would not know about.
 *   3. NEXT_PUBLIC_WEB_URL   — effectively the local-dev value, from the root
 *                              .env (which never ships to production).
 *   4. localhost             — last resort.
 *
 * Neither of the first two is NEXT_PUBLIC_-prefixed, deliberately. Next
 * replaces every `process.env.NEXT_PUBLIC_*` reference with a literal at build
 * time — in server code too, and whether or not the variable appears in
 * next.config's `env` block — so such a value can never be corrected without a
 * rebuild. That is how the old hand-set NEXT_PUBLIC_WEB_URL outlived two
 * generated Railway domains and left robots.txt, every sitemap <loc> and every
 * canonical tag advertising a host that no longer served the site. Nothing
 * failed loudly, because these values are only ever used to *emit* URLs and
 * never to fetch anything.
 *
 * One trap worth knowing: Railway bind-mounts a build cache at
 * apps/web/.next/cache, and Next will restore prerendered pages from it. A
 * changed environment variable does not invalidate that cache, so statically
 * prerendered pages kept serving a stale canonical long after this resolution
 * was correct — while dynamic pages, rendered per request, were already right.
 * build:web clears that cache so a prerender always reflects current values.
 *
 * Returned without a trailing slash; callers append their own path.
 */
export function siteUrl(): string {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return normalise(railway);

  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return normalise(explicit);

  const baked = process.env.NEXT_PUBLIC_WEB_URL?.trim();
  if (baked) return normalise(baked);

  return 'http://localhost:3000';
}

/** Accepts a bare host or a full origin; always returns a full origin. */
function normalise(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}
