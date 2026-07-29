import { MapPin, PawPrint, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  Stat,
  formatCoi,
  formatDate,
  formatDogAge,
  formatMoney,
} from '@stud/ui';
import { API_URL } from '@/lib/api';
import { AVAILABILITY_LABEL, loadKennelPage } from '@/lib/marketplace';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadKennelPage(slug);
  if (!data) return { title: 'Kennel not found', robots: { index: false, follow: false } };

  const { kennel, stats } = data;
  const where = kennel.city && kennel.region ? ` in ${kennel.city}, ${kennel.region}` : '';
  return {
    title: `${kennel.name} — ${stats.breeds.join(', ')} breeder${where}`,
    description:
      `${kennel.name}${where}. ${stats.dogCount} dogs on the platform with ${stats.verifiedClaimCount} health and title results verified against the issuing source.`,
    alternates: { canonical: `/breeders/${kennel.slug}` },
    openGraph: { type: 'profile', title: kennel.name, description: kennel.tagline ?? undefined },
  };
}

interface ReviewRow {
  id: string;
  overall: number;
  communication: number | null;
  healthOfPuppy: number | null;
  honestyAboutMatch: number | null;
  supportAfterward: number | null;
  title: string | null;
  body: string;
  daysAfterPlacement: number | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  author: { displayName: string | null; name: string | null };
}

interface ReviewsPayload {
  reviews: ReviewRow[];
  summary: {
    count: number;
    overall: number | null;
    dimensions: Record<string, number | null>;
    longTermCount: number;
    note: string | null;
  };
}

async function loadReviews(kennelId: string): Promise<ReviewsPayload | null> {
  const res = await fetch(`${API_URL}/v1/kennels/${kennelId}/reviews`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as ReviewsPayload;
}

export default async function KennelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadKennelPage(slug);
  if (!data) notFound();

  const { kennel, dogs, listings, stats } = data;
  const reviewData = await loadReviews(kennel.id);
  const site = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: kennel.name,
            url: `${site}/breeders/${kennel.slug}`,
            sameAs: kennel.websiteUrl ? [kennel.websiteUrl] : undefined,
            foundingDate: kennel.foundedYear ? String(kennel.foundedYear) : undefined,
            address:
              kennel.city && kennel.region
                ? {
                    '@type': 'PostalAddress',
                    addressLocality: kennel.city,
                    addressRegion: kennel.region,
                    addressCountry: kennel.country,
                  }
                : undefined,
          }).replace(/</g, '\\u003c'),
        }}
      />

      {kennel.coverUrl && (
        <div className="relative mb-8 aspect-[3/1] overflow-hidden rounded-card">
          <Image
            src={kennel.coverUrl}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 70rem, 100vw"
          />
        </div>
      )}

      <header className="max-w-3xl">
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
          {stats.breeds.join(' · ')}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          {kennel.name}
        </h1>
        {kennel.tagline && <p className="mt-2 text-md text-ink-600">{kennel.tagline}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-ink-500">
          {kennel.city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {kennel.city}, {kennel.region}
            </span>
          )}
          {kennel.foundedYear && <span>Breeding since {kennel.foundedYear}</span>}
        </p>
      </header>

      {/*
        Computed, not claimed. A kennel cannot type "we health test everything"
        into this section and have it mean anything — these three numbers come
        from the verification tables.
      */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Dogs on record" value={String(stats.dogCount)} />
        <Stat
          label="Verified results"
          value={String(stats.verifiedClaimCount)}
          sub="checked against the issuing source"
        />
        <Stat
          label="Average completeness"
          value={`${Math.round(stats.averageDensity * 100)}%`}
          sub="of the testing expected for these breeds"
        />
      </div>

      {kennel.about && (
        <section className="mt-8 max-w-3xl">
          <h2 className="font-display text-2xl text-ink-900">About the program</h2>
          <p className="mt-2 whitespace-pre-line text-md leading-relaxed text-ink-700">
            {kennel.about}
          </p>
        </section>
      )}

      {listings.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl text-ink-900">Litters</h2>
          <ul className="mt-4 space-y-3">
            {listings.map((l) => (
              <li key={l.id}>
                <Card interactive>
                  <Link
                    href={`/puppies/${l.slug}`}
                    className="flex flex-wrap items-start justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-display text-lg text-ink-900">
                        {l.headline ?? `${l.litter.dam.callName} × ${l.litter.sire.callName}`}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {l.litter.whelpedOn
                          ? `Whelped ${formatDate(l.litter.whelpedOn)}`
                          : l.litter.expectedWhelpOn
                            ? `Due ${formatDate(l.litter.expectedWhelpOn)}`
                            : ''}
                        {l.litter.liveBorn ? ` · ${l.litter.liveBorn} live born` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      {l.priceCentsFrom != null && (
                        <p className="font-display text-lg text-ink-900">
                          {formatMoney(l.priceCentsFrom, { compact: true })}
                        </p>
                      )}
                      <Badge tone={l.availability === 'AVAILABLE' ? 'brand' : 'neutral'} size="sm">
                        {AVAILABILITY_LABEL[l.availability] ?? l.availability}
                      </Badge>
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl text-ink-900">The dogs</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {dogs.map((d) => (
            <li key={d.id}>
              <Card interactive>
                <Link href={`/studs/${d.slug}`} className="block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-lg leading-tight text-ink-900">
                        {d.registeredName ?? d.callName}
                      </p>
                      <p className="mt-0.5 text-2xs uppercase tracking-widest text-ink-400">
                        {d.sex === 'MALE' ? 'Dog' : 'Bitch'} · {formatDogAge(d.dateOfBirth)}
                      </p>
                    </div>
                    <PawPrint className="h-4 w-4 shrink-0 text-ink-300" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-bone-200 pt-2">
                    <Badge
                      tone={(d.verificationSummary?.verifiedCount ?? 0) > 0 ? 'brand' : 'neutral'}
                      size="sm"
                    >
                      <ShieldCheck /> {d.verificationSummary?.verifiedCount ?? 0} verified
                    </Badge>
                    {d.pedigreeStats && (
                      <span className="text-2xs text-ink-400">
                        {formatCoi(d.pedigreeStats.coi)} COI
                      </span>
                    )}
                    {d.studListing?.availability === 'AVAILABLE' && d.studListing.studFeeCents && (
                      <span className="text-2xs text-ink-400">
                        at stud · {formatMoney(d.studListing.studFeeCents, { compact: true })}
                      </span>
                    )}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Reviews ─────────────────────────────────────────────────── */}
      <section className="mt-10 max-w-3xl">
        <h2 className="font-display text-2xl text-ink-900">
          Reviews{' '}
          {reviewData && reviewData.summary.count > 0 && (
            <span className="font-sans text-md font-normal text-ink-400">
              {reviewData.summary.overall?.toFixed(1)} · {reviewData.summary.count} verified{' '}
              {reviewData.summary.count === 1 ? 'purchase' : 'purchases'}
            </span>
          )}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">
          From verified purchases only.
        </p>

        {/* The honesty note from the scorer, shown verbatim. */}
        {reviewData?.summary.note && (
          <p className="mt-3 rounded-md bg-bone-200/60 px-3 py-2 text-xs leading-relaxed text-ink-600">
            {reviewData.summary.note}
          </p>
        )}

        {reviewData && reviewData.reviews.length > 0 && (
          <ul className="mt-4 space-y-4">
            {reviewData.reviews.map((r) => (
              <li key={r.id} className="rounded-card border border-bone-300 bg-bone-50 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-lg text-ink-900">
                    {r.title ?? `${r.overall} out of 5`}
                  </p>
                  <p className="text-2xs text-ink-400">
                    {r.author.name ?? r.author.displayName ?? 'Verified buyer'}
                    {r.daysAfterPlacement != null &&
                      ` · ${
                        r.daysAfterPlacement >= 365
                          ? `${Math.floor(r.daysAfterPlacement / 365)} year${
                              r.daysAfterPlacement >= 730 ? 's' : ''
                            } after pickup`
                          : `${r.daysAfterPlacement} days after pickup`
                      }`}
                  </p>
                </div>
                <p className="mt-1 text-sm text-clay-600" aria-label={`${r.overall} out of 5`}>
                  {'★'.repeat(r.overall)}
                  <span className="text-bone-400">{'★'.repeat(5 - r.overall)}</span>
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {r.body}
                </p>

                {(r.communication ?? r.healthOfPuppy ?? r.honestyAboutMatch ?? r.supportAfterward) !=
                  null && (
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-bone-200 pt-2 text-2xs text-ink-500">
                    {(
                      [
                        ['Communication', r.communication],
                        ['Health of puppy', r.healthOfPuppy],
                        ['Honesty about the match', r.honestyAboutMatch],
                        ['Support afterward', r.supportAfterward],
                      ] as const
                    ).map(([label, v]) =>
                      v != null ? (
                        <div key={label}>
                          <dt className="inline">{label} </dt>
                          <dd className="inline font-mono text-ink-700">{v}/5</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                )}

                {r.response && (
                  <div className="mt-3 border-l-2 border-brand-300 pl-3">
                    <p className="text-2xs uppercase tracking-widest text-ink-400">
                      {kennel.name} replied
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                      {r.response}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
