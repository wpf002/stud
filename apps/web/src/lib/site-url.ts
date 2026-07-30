/**
 * The site's own public origin, for the places that need an absolute URL:
 * canonicals, the sitemap, robots, and JSON-LD.
 *
 * Read in this order, and the order is the whole point:
 *
 *   1. SITE_URL             — explicit override, for a custom domain. NOT
 *                             NEXT_PUBLIC_-prefixed, deliberately: see below.
 *   2. RAILWAY_PUBLIC_DOMAIN — set and maintained by Railway, always pointing
 *                             at whatever domain actually serves the service.
 *   3. NEXT_PUBLIC_WEB_URL   — effectively the local-dev value, from the root
 *                             .env (which never ships to production).
 *   4. localhost             — last resort.
 *
 * Why the first two are not NEXT_PUBLIC_: Next.js replaces every
 * `process.env.NEXT_PUBLIC_*` reference with a literal string at BUILD time —
 * that is what the prefix means, and it applies to server code too, whether
 * or not the variable is listed in next.config's `env` block. A
 * NEXT_PUBLIC_ value therefore cannot be corrected without a rebuild, which
 * is exactly how the old hand-set NEXT_PUBLIC_WEB_URL outlived two generated
 * Railway domains and left robots.txt, every sitemap <loc> and every
 * canonical tag advertising a host that no longer served the site. Because
 * these are only ever used to *emit* URLs and never to fetch anything,
 * nothing failed loudly.
 *
 * The two bare names above are read from the real environment at request
 * time, so a domain change is picked up without rebuilding.
 *
 * Returned without a trailing slash; callers append their own path.
 */
export function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return normalise(explicit);

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return normalise(railway);

  const baked = process.env.NEXT_PUBLIC_WEB_URL?.trim();
  if (baked) return normalise(baked);

  return 'http://localhost:3000';
}

/** Accepts a bare host or a full origin; always returns a full origin. */
function normalise(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}
