import type { MetadataRoute } from 'next';
import { GUIDES } from '@/lib/guides';
import { loadPublicIndex } from '@/lib/marketplace';

/**
 * The sitemap.
 *
 * Phase 6's gate is that a litter page ranks, and a page a crawler never finds
 * cannot. Litter pages carry the highest priority because they are the ones
 * with something to say that no other site can say.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  const index = await loadPublicIndex();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/puppies`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/studs`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${site}/breeders`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${site}/learn`, changeFrequency: 'weekly', priority: 0.7 },
    ...GUIDES.map((g) => ({
      url: `${site}/learn/${g.slug}`,
      lastModified: new Date(g.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${site}/verification`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  return [
    ...staticRoutes,
    ...(index?.listings ?? []).map((l) => ({
      url: `${site}/puppies/${l.slug}`,
      lastModified: new Date(l.updatedAt),
      changeFrequency: 'daily' as const,
      // A past litter is still worth indexing — it is the program's record —
      // but it is not what a buyer searching today is looking for.
      priority: l.availability === 'PAST' ? 0.4 : 0.8,
    })),
    ...(index?.kennels ?? []).map((k) => ({
      url: `${site}/breeders/${k.slug}`,
      lastModified: new Date(k.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
