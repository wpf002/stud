import { AlertTriangle, MapPin, ShieldCheck, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, EmptyState } from '@stud/ui';
import { API_URL } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Breeders who show their work',
  description:
    'A directory of breeding programs ranked by verified evidence — health testing and titles checked against the issuing bodies, reviews only from people who actually bought a dog.',
  alternates: { canonical: '/breeders' },
};

interface DirectoryRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  region: string | null;
  breeds: string[];
  foundedYear: number | null;
  stats: {
    dogCount: number;
    verifiedClaimCount: number;
    averageDensity: number;
    openConflicts: number;
  };
  reviewSummary: {
    count: number;
    overall: number | null;
    longTermCount: number;
    note: string | null;
  };
}

async function loadDirectory(query: string) {
  const res = await fetch(`${API_URL}/v1/breeders/directory${query ? `?${query}` : ''}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as { breeders: DirectoryRow[]; total: number };
}

export default async function BreedersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const key of ['breed', 'region', 'search'] as const) {
    const v = sp[key];
    if (typeof v === 'string' && v) qs.set(key, v);
  }
  const data = await loadDirectory(qs.toString());
  const breeders = data?.breeders ?? [];

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          Breeders who show their work
        </h1>
        <p className="mt-3 text-md leading-relaxed text-ink-600">
          Ranked by verified evidence — health results and titles checked against the bodies that
          issued them. There is no way to buy a higher place on this page, because the ranking does
          not read anything money can change.
        </p>
      </header>

      {breeders.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No published programs match"
          description="Breeders appear here once their program page is published and their dogs are on the platform."
        />
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {breeders.map((b) => (
            <li key={b.id}>
              <Card interactive className="h-full">
                <Link href={`/breeders/${b.slug}`} className="block p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
                        {b.breeds.join(' · ') || 'Breeder'}
                      </p>
                      <p className="mt-1 font-display text-2xl leading-tight text-ink-900">
                        {b.name}
                      </p>
                      {b.tagline && (
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-500">
                          {b.tagline}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 flex flex-wrap items-center gap-x-3 text-2xs text-ink-400">
                    {b.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {b.city}, {b.region}
                      </span>
                    )}
                    {b.foundedYear && <span>since {b.foundedYear}</span>}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bone-200 pt-3">
                    <Badge tone={b.stats.verifiedClaimCount > 0 ? 'brand' : 'neutral'} size="sm">
                      <ShieldCheck /> {b.stats.verifiedClaimCount} verified across{' '}
                      {b.stats.dogCount} {b.stats.dogCount === 1 ? 'dog' : 'dogs'}
                    </Badge>

                    {/* Shown, not hidden. A directory that only surfaces the
                        flattering number is one nobody should trust. */}
                    {b.stats.openConflicts > 0 && (
                      <Badge tone="warning" size="sm">
                        <AlertTriangle /> {b.stats.openConflicts} open{' '}
                        {b.stats.openConflicts === 1 ? 'conflict' : 'conflicts'}
                      </Badge>
                    )}

                    {b.reviewSummary.count > 0 ? (
                      <span className="flex items-center gap-1 text-2xs text-ink-500">
                        <Star className="h-3 w-3 fill-clay-500 text-clay-500" />
                        {b.reviewSummary.overall?.toFixed(1)} ·{' '}
                        {b.reviewSummary.count} verified{' '}
                        {b.reviewSummary.count === 1 ? 'review' : 'reviews'}
                      </span>
                    ) : (
                      <span className="text-2xs text-ink-400">no reviews yet</span>
                    )}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 max-w-2xl text-2xs leading-relaxed text-ink-400">
        Reviews on Stud can only be written by somebody who completed a purchase or a signed
        breeding through the platform — which is why there are fewer of them here than elsewhere,
        and why they are worth reading.
      </p>
    </div>
  );
}
