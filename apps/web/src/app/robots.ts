import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

/**
 * Rendered per request so the origin is read at runtime. Prerendered, it
 * would freeze whatever the domain was at build time — the drift this file
 * was a victim of. It is a handful of bytes; rendering it per hit costs
 * nothing.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Filtered views are near-duplicates of /puppies and would dilute it.
        // The canonical on each page says the same thing; this saves the crawl
        // budget for pages that are actually distinct.
        // /studio is a breeder's own records behind a login. It carries a
        // noindex of its own; this keeps crawlers from spending the budget
        // finding that out.
        disallow: ['/puppies?', '/api/', '/login', '/signup', '/studio'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
