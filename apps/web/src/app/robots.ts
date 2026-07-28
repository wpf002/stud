import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Filtered views are near-duplicates of /puppies and would dilute it.
        // The canonical on each page says the same thing; this saves the crawl
        // budget for pages that are actually distinct.
        disallow: ['/puppies?', '/api/', '/login', '/signup'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
