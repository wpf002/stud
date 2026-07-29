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
        // /studio is a breeder's own records behind a login. It carries a
        // noindex of its own; this keeps crawlers from spending the budget
        // finding that out.
        disallow: ['/puppies?', '/api/', '/login', '/signup', '/studio'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
