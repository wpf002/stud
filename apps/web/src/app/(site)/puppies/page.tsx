import { PawPrint, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  formatDate,
  formatMoney,
} from '@stud/ui';
import { LitterFilters } from '@/components/litter-filters';
import { AVAILABILITY_LABEL, browseLitters, type BrowseRow } from '@/lib/marketplace';

export const metadata: Metadata = {
  title: 'Puppies from verified breeders',
  description:
    'Browse litters where the parents’ health testing, titles and pedigree have been checked against the issuing source — not typed in by the seller. Filter by verified hips, elbows, eyes and heart.',
  alternates: { canonical: '/puppies' },
};

/** Filters the API understands, passed straight through. */
const PASSTHROUGH = [
  'breed', 'search', 'availability', 'region', 'maxPriceCents', 'minPriceCents',
  'verifiedNormal', 'requireNoConflicts', 'maxCoi', 'goHomeBefore', 'sort',
] as const;

export default async function LittersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const key of PASSTHROUGH) {
    const v = sp[key];
    if (typeof v === 'string' && v !== '') qs.set(key, v);
  }

  const data = await browseLitters(qs.toString());
  const listings = data?.listings ?? [];

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          Find Your Puppy
        </h1>
        <p className="mt-2 text-md leading-relaxed text-ink-600">
          From breeders who health-test their dogs — every result checked with the registry.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <LitterFilters />

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink-500">
              {listings.length} of {data?.total ?? 0} published {(data?.total ?? 0) === 1 ? 'litter' : 'litters'}
            </p>
          </div>

          {data?.note && (
            <p className="mt-3 rounded-md bg-bone-200/60 px-3 py-2 text-xs leading-relaxed text-ink-600">
              {data.note}
            </p>
          )}

          {listings.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<PawPrint className="h-5 w-5" />}
              title="Nothing matches that yet"
              description="Try fewer filters — only litters with checkable records are listed here."
            />
          ) : (
            <ul className="mt-5 space-y-4">
              {listings.map((l) => (
                <li key={l.id}>
                  <LitterCard listing={l} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function LitterCard({ listing: l }: { listing: BrowseRow }) {
  const verified = l.cachedSireVerified + l.cachedDamVerified;
  const kennel = l.litter.dam.kennel;
  const photos = l.photoUrls.slice(0, 2);

  return (
    <Card interactive className="overflow-hidden">
      <Link href={`/puppies/${l.slug}`} className="block">
        {/* Photos first. The card IS the photos. */}
        {photos.length > 0 && (
          <div className={`grid gap-1 p-1.5 pb-0 ${photos.length > 1 ? 'grid-cols-2' : ''}`}>
            {photos.map((src, i) => (
              <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-lg">
                <Image
                  src={src}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(min-width: 1024px) 24rem, 50vw"
                />
              </div>
            ))}
          </div>
        )}

        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight text-ink-900">
                {l.headline ?? `${l.cachedBreed} puppies`}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {kennel ? `Raised by ${kennel.name}` : 'Independent breeder'}
                {kennel?.city ? ` · ${kennel.city}, ${kennel.region}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {l.priceCentsFrom != null && (
                <p className="font-display text-xl text-ink-900">
                  {formatMoney(l.priceCentsFrom, { compact: true })}
                  {l.priceCentsTo && l.priceCentsTo !== l.priceCentsFrom && (
                    <span className="text-ink-400">+</span>
                  )}
                </p>
              )}
              <p className="mt-0.5 text-2xs text-ink-400">
                {l.cachedAvailablePups} of {l.cachedTotalPups} left
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {verified > 0 && (
              <Badge tone="brand" size="sm">
                <ShieldCheck /> Health Checked
              </Badge>
            )}
            <span className="text-2xs text-ink-400">
              {AVAILABILITY_LABEL[l.availability] ?? l.availability}
              {l.goHomeFrom ? ` · Home from ${formatDate(l.goHomeFrom)}` : ''}
            </span>
            {l.cachedCoi != null && l.cachedCoi > 0.125 && (
              <Badge tone="danger" size="sm">
                Closely Related Parents
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}
