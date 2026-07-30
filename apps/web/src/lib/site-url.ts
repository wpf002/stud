/**
 * The site's own public origin, for the places that need an absolute URL:
 * canonicals, the sitemap, robots, and JSON-LD.
 *
 * Read in this order, and the order encodes where each value is available:
 *
 *   1. RAILWAY_PUBLIC_DOMAIN — injected by Railway at RUNTIME only, and always
 *                              pointing at whatever domain actually serves the
 *                              service. First, so anything rendered per request
 *                              (robots, sitemap, dynamic pages) is self-
 *                              correcting: change the domain, no rebuild needed.
 *   2. SITE_URL              — a literal set on the service, so unlike the
 *                              above it IS present during the build. This is
 *                              what statically prerendered pages bake, and the
 *                              only value a human maintains. A reference like
 *                              `https://${{RAILWAY_PUBLIC_DOMAIN}}` does NOT
 *                              work here: the target is runtime-only, so it
 *                              resolves to nothing at build time and every
 *                              static canonical silently fell through to
 *                              localhost.
 *   3. NEXT_PUBLIC_WEB_URL   — effectively the local-dev value, from the root
 *                              .env (which never ships to production).
 *   4. localhost             — last resort.
 *
 * Neither of the first two is NEXT_PUBLIC_-prefixed, deliberately. Next
 * replaces every `process.env.NEXT_PUBLIC_*` reference with a literal at BUILD
 * time — in server code too, and whether or not the variable appears in
 * next.config's `env` block — so such a value can never be corrected without a
 * rebuild. That is how the old hand-set NEXT_PUBLIC_WEB_URL outlived two
 * generated Railway domains and left robots.txt, every sitemap <loc> and every
 * canonical tag advertising a host that no longer served the site. Nothing
 * failed loudly, because these values are only ever used to *emit* URLs and
 * never to fetch anything.
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
