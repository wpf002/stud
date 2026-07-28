import { PawPrint, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  formatCoi,
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
          Puppies, with the receipts attached
        </h1>
        <p className="mt-3 text-md leading-relaxed text-ink-600">
          Every health result on these pages was checked against the body that issued it. Where a
          test is missing, the page says so — which is the part no classified board can do, because
          it never knew what was supposed to be there.
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
              description="Stud only lists litters where the parents' records are on the platform, so this directory is smaller than a classified board with the same number of breeders. That is the trade — fewer results, and you can check every one of them."
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

  return (
    <Card interactive>
      <Link href={`/puppies/${l.slug}`} className="block p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
              {l.cachedBreed} · {AVAILABILITY_LABEL[l.availability] ?? l.availability}
            </p>
            <p className="mt-1 font-display text-2xl leading-tight text-ink-900">
              {l.headline ?? `${l.litter.dam.callName} × ${l.litter.sire.callName}`}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              {kennel ? `${kennel.name}` : 'Independent breeder'}
              {kennel?.city ? ` · ${kennel.city}, ${kennel.region}` : ''}
              {l.distanceMiles != null ? ` · ${l.distanceMiles} mi` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {l.priceCentsFrom != null && (
              <p className="font-display text-xl text-ink-900">
                {formatMoney(l.priceCentsFrom, { compact: true })}
                {l.priceCentsTo && l.priceCentsTo !== l.priceCentsFrom && (
                  <span className="text-ink-400">–{formatMoney(l.priceCentsTo, { compact: true })}</span>
                )}
              </p>
            )}
            <p className="mt-0.5 text-2xs text-ink-400">
              {l.cachedAvailablePups} of {l.cachedTotalPups} available
            </p>
          </div>
        </div>

        {/* The two numbers that decide whether this litter is worth a click. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bone-200 pt-3">
          <Badge tone={verified > 0 ? 'brand' : 'neutral'} size="sm">
            <ShieldCheck /> {verified} verified {verified === 1 ? 'result' : 'results'} on the parents
          </Badge>
          {l.cachedCoi != null && (
            <Badge tone={l.cachedCoi <= 0.0625 ? 'brand' : l.cachedCoi <= 0.125 ? 'warning' : 'danger'} size="sm">
              {formatCoi(l.cachedCoi)} COI
            </Badge>
          )}
          {l.goHomeFrom && (
            <span className="text-2xs text-ink-400">home from {formatDate(l.goHomeFrom)}</span>
          )}
        </div>
      </Link>
    </Card>
  );
}
