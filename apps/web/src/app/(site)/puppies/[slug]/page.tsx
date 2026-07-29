import { AlertTriangle, Dog, MapPin, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ClaimPanel,
  VerificationDensity,
  cn,
  formatCoi,
  formatDate,
  formatDogAge,
  formatMoney,
} from '@stud/ui';
import { RELATIONSHIP_COPY } from '@stud/pedigree';
import { FunnelBeacon } from '@/components/funnel-beacon';
import { InquiryForm } from '@/components/inquiry-form';
import {
  AVAILABILITY_LABEL,
  loadLitterPage,
  type LitterPage,
  type PublicParent,
} from '@/lib/marketplace';

/** Health results a buyer should expect to see on a parent, present or not. */
const EXPECTED_CLAIMS = ['HIP', 'ELBOW', 'EYE_CAER', 'CARDIAC', 'THYROID'];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadLitterPage(slug);
  if (!data) return { title: 'Litter not found', robots: { index: false, follow: false } };

  const { listing, sire, dam, kennel } = data;
  const verified = (sire.verificationSummary?.verifiedCount ?? 0) + (dam.verificationSummary?.verifiedCount ?? 0);
  const where = kennel?.city && kennel.region ? ` in ${kennel.city}, ${kennel.region}` : '';
  const price =
    listing.priceCentsFrom != null
      ? ` ${formatMoney(listing.priceCentsFrom, { compact: true })}${
          listing.priceCentsTo && listing.priceCentsTo !== listing.priceCentsFrom
            ? `–${formatMoney(listing.priceCentsTo, { compact: true })}`
            : ''
        }.`
      : '';

  const title = `${dam.breed} puppies${where} — ${dam.callName} × ${sire.callName}`;
  const description =
    `${AVAILABILITY_LABEL[listing.availability] ?? listing.availability}.${price} ` +
    `${verified} health and title results on the parents, each checked against the issuing source rather than typed in by the seller.`;

  return {
    title,
    description,
    alternates: { canonical: `/puppies/${listing.slug}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/puppies/${listing.slug}`,
      images: listing.photoUrls.length > 0 ? listing.photoUrls.slice(0, 1) : undefined,
    },
    // A sold-out or past litter still deserves to be indexed — it is the
    // program's public record, and the best evidence a breeder has.
    robots: { index: true, follow: true },
  };
}

export default async function LitterPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadLitterPage(slug);
  if (!data) notFound();

  const { listing, litter, sire, dam, kennel, coi, geneticRisk, puppies } = data;
  const available = puppies.filter((p) => p.status === 'AVAILABLE');
  const parentVerified =
    (sire.verificationSummary?.verifiedCount ?? 0) + (dam.verificationSummary?.verifiedCount ?? 0);

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <JsonLd data={data} />
      <FunnelBeacon step="LISTING_VIEW" slug={listing.slug} />

      <nav aria-label="Breadcrumb" className="mb-6 text-2xs text-ink-400">
        <Link href="/puppies" className="hover:text-brand-600">
          Puppies
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          href={`/puppies?breed=${encodeURIComponent(dam.breed)}`}
          className="hover:text-brand-600"
        >
          {dam.breed}
        </Link>
        {kennel && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/breeders/${kennel.slug}`} className="hover:text-brand-600">
              {kennel.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-6">
          <header>
            <p className="flex flex-wrap items-center gap-2 text-2xs font-semibold uppercase tracking-widest text-clay-600">
              {dam.breed}
              <span className="text-ink-300">·</span>
              {AVAILABILITY_LABEL[listing.availability] ?? listing.availability}
            </p>
            <h1 className="mt-2 font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
              {listing.headline ?? `${dam.callName} × ${sire.callName}`}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-500">
              {litter.whelpedOn ? (
                <span>Whelped {formatDate(litter.whelpedOn)}</span>
              ) : litter.expectedWhelpOn ? (
                <span>Due {formatDate(litter.expectedWhelpOn)}</span>
              ) : null}
              {kennel?.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {kennel.city}, {kennel.region}
                </span>
              )}
              {listing.goHomeFrom && <span>Home from {formatDate(listing.goHomeFrom)}</span>}
            </p>
          </header>

          {/* The puppies, before any data. */}
          {listing.photoUrls.length > 0 && (
            <div
              className={`grid gap-2 overflow-hidden rounded-card ${
                listing.photoUrls.length >= 3 ? 'grid-cols-[2fr_1fr]' : 'grid-cols-2'
              }`}
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={listing.photoUrls[0]!}
                  alt={`${dam.breed} puppies`}
                  fill
                  priority
                  className="object-cover"
                  sizes="(min-width: 1024px) 40rem, 100vw"
                />
              </div>
              {listing.photoUrls.length >= 3 ? (
                <div className="grid grid-rows-2 gap-2">
                  {listing.photoUrls.slice(1, 3).map((src, i) => (
                    <div key={i} className="relative">
                      <Image src={src} alt="" fill className="object-cover" sizes="20rem" />
                    </div>
                  ))}
                </div>
              ) : listing.photoUrls[1] ? (
                <div className="relative aspect-[4/3]">
                  <Image src={listing.photoUrls[1]} alt="" fill className="object-cover" sizes="20rem" />
                </div>
              ) : null}
            </div>
          )}

          {/*
            The headline claim, and the one a classified board cannot make.
            It counts results that were checked, not results that were typed.
          */}
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-brand-50 px-4 py-3 ring-1 ring-inset ring-brand-100">
            <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" />
            <p className="text-sm leading-relaxed text-ink-700">
              <span className="font-semibold text-ink-900">
                Mom and dad&rsquo;s health tests are checked with the registry
              </span>{' '}
              — {parentVerified} {parentVerified === 1 ? 'result' : 'results'}, shown below with
              anything still missing.
            </p>
          </div>

          {listing.description && (
            <section>
              <h2 className="sr-only">About this litter</h2>
              <div className="space-y-3 whitespace-pre-line text-md leading-relaxed text-ink-700">
                {listing.description}
              </div>
            </section>
          )}

          {/* ── The parents ────────────────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="font-display text-2xl text-ink-900">Meet the Parents</h2>
            <ParentCard dog={dam} role="Dam" />
            <ParentCard dog={sire} role="Sire" />
          </section>

          {/* ── Genetics ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-ink-900">Health &amp; Genetics</h2>

            {geneticRisk.atRisk.length > 0 ? (
              <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
                <span className="font-semibold">{geneticRisk.summary}</span>
                <ul className="mt-2 space-y-1">
                  {geneticRisk.atRisk.map((m) => (
                    <li key={m.markerName}>{m.message}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert tone={geneticRisk.unknown.length > 0 ? 'warning' : 'success'}>
                {geneticRisk.summary}
              </Alert>
            )}

            {geneticRisk.unknown.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-2xs uppercase tracking-widest text-ink-400">
                    Cannot be ruled in or out
                  </p>
                  <ul className="mt-2 space-y-2">
                    {geneticRisk.unknown.map((m) => (
                      <li key={m.markerName} className="text-sm leading-relaxed text-ink-600">
                        <span className="font-medium text-ink-800">{m.markerName}</span> — {m.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
                    This just means the test hasn&rsquo;t been done. Feel free to ask the breeder
                    about it.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-2xs uppercase tracking-widest text-ink-400">
                      Coefficient of inbreeding
                    </p>
                    <p className="mt-0.5 font-display text-3xl text-ink-900">
                      {formatCoi(coi.coi)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      coi.band === 'LOW' ? 'brand' : coi.band === 'MODERATE' ? 'warning' : 'danger'
                    }
                  >
                    {coi.band.toLowerCase()}
                  </Badge>
                </div>

                {coi.relationship && coi.relationship !== 'UNRELATED' && (
                  <p className="mt-3 text-sm text-ink-700">
                    {/*
                      RELATIONSHIP_COPY, not the raw enum. The classifier works
                      from the relatedness COEFFICIENT, so HALF_SIBLINGS means
                      "as related as half-siblings" — it does not mean the two
                      dogs share a parent. Rendering the enum printed "these two
                      are half siblings" on a public page about two dogs whose
                      parents are four different animals, which is a false
                      statement of fact about somebody's breeding program.
                    */}
                    <span className="font-semibold">
                      {RELATIONSHIP_COPY[coi.relationship as keyof typeof RELATIONSHIP_COPY] ??
                        'Related'}
                    </span>{' '}
                    between the parents, from the shared ancestors below.
                  </p>
                )}

                {/*
                  The confidence note is not fine print. A 0% COI on a
                  two-generation pedigree is a different claim from a 0% on a
                  complete five, and a buyer cannot tell them apart unless we
                  say so.
                */}
                <p className="mt-3 text-xs leading-relaxed text-ink-500">{coi.confidenceNote}</p>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-bone-200 pt-3 text-2xs text-ink-500">
                  <div>
                    <dt className="inline uppercase tracking-widest">Pedigree known </dt>
                    <dd className="inline font-mono text-ink-700">
                      {Math.round(coi.sireCompleteness * 100)}% sire ·{' '}
                      {Math.round(coi.damCompleteness * 100)}% dam
                    </dd>
                  </div>
                  <div>
                    <dt className="inline uppercase tracking-widest">Over </dt>
                    <dd className="inline font-mono text-ink-700">{coi.generations} generations</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </section>

          {/* ── Puppies ────────────────────────────────────────────── */}
          {puppies.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink-900">
                The Puppies{' '}
                <span className="font-sans text-md font-normal text-ink-400">
                  {available.length} of {puppies.length} available
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {puppies.map((p) => {
                  const spoken = p.status !== 'AVAILABLE';
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        'rounded-card border p-4',
                        spoken ? 'border-bone-300 bg-bone-100/60' : 'border-bone-300 bg-bone-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-display text-lg text-ink-900">
                            {p.name ?? p.collarColor ?? `Puppy ${p.birthOrder ?? ''}`}
                          </p>
                          <p className="text-2xs uppercase tracking-widest text-ink-400">
                            {p.sex === 'MALE' ? 'Male' : 'Female'}
                            {p.colorPattern ? ` · ${p.colorPattern}` : ''}
                          </p>
                        </div>
                        <Badge tone={spoken ? 'neutral' : 'brand'} size="sm">
                          {p.status.toLowerCase()}
                        </Badge>
                      </div>
                      {p.priceCents != null && !spoken && (
                        <p className="mt-2 font-mono text-sm tabular-nums text-ink-800">
                          {formatMoney(p.priceCents)}
                        </p>
                      )}
                      {p.publicNotes && (
                        <p className="mt-2 text-xs leading-relaxed text-ink-600">{p.publicNotes}</p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/*
                Honest litter arithmetic. A program that lost a puppy says so
                here rather than quietly listing five where six were born.
              */}
              {(litter.totalBorn ?? 0) > 0 && (
                <p className="text-2xs leading-relaxed text-ink-400">
                  {litter.totalBorn} born, {litter.liveBorn ?? 0} live
                  {litter.neonatalDeaths > 0 ? `, ${litter.neonatalDeaths} lost after birth.` : '.'}
                </p>
              )}
            </section>
          )}

          {listing.includedInPrice && (
            <section>
              <h2 className="font-display text-2xl text-ink-900">What Comes With Your Puppy</h2>
              <p className="mt-2 whitespace-pre-line text-md leading-relaxed text-ink-700">
                {listing.includedInPrice}
              </p>
            </section>
          )}

          {listing.buyerRequirements && (
            <section>
              <h2 className="font-display text-2xl text-ink-900">What the Breeder Asks</h2>
              <p className="mt-2 whitespace-pre-line text-md leading-relaxed text-ink-700">
                {listing.buyerRequirements}
              </p>
            </section>
          )}
        </div>

        {/* ── Rail ─────────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="pt-5">
              {listing.priceCentsFrom != null ? (
                <>
                  <p className="font-display text-3xl text-ink-900">
                    {formatMoney(listing.priceCentsFrom)}
                    {listing.priceCentsTo && listing.priceCentsTo !== listing.priceCentsFrom && (
                      <span className="text-ink-400"> – {formatMoney(listing.priceCentsTo)}</span>
                    )}
                  </p>
                  {listing.depositCents != null && (
                    <p className="mt-1 text-sm text-ink-500">
                      {formatMoney(listing.depositCents)} deposit
                    </p>
                  )}
                </>
              ) : (
                <p className="font-display text-2xl text-ink-500">Price on enquiry</p>
              )}

              {listing.priceNotes && (
                <p className="mt-3 border-t border-bone-200 pt-3 text-xs leading-relaxed text-ink-500">
                  {listing.priceNotes}
                </p>
              )}

              <dl className="mt-4 space-y-2 border-t border-bone-200 pt-4 text-sm">
                <Row label="Available" value={`${available.length} of ${puppies.length}`} />
                {listing.goHomeFrom && (
                  <Row label="Home from" value={formatDate(listing.goHomeFrom)} />
                )}
                <Row label="Projected COI" value={formatCoi(coi.coi)} />
              </dl>
            </CardContent>
          </Card>

          {/* Applying is the primary action; asking a question is the fallback. */}
          {listing.availability !== 'PAST' && (
            <Card className="border-brand-300">
              <CardContent className="pt-5">
                <p className="font-display text-lg text-ink-900">Apply for a Puppy</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  No payment is taken when you apply. Nothing is due until the breeder has read it
                  and accepted you.
                </p>
                <Button block className="mt-3" asChild>
                  <Link href={`/puppies/${listing.slug}/apply`}>Start an Application</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <InquiryForm
            slug={listing.slug}
            puppies={puppies
              .filter((p) => p.status === 'AVAILABLE')
              .map((p) => ({
                id: p.id,
                label: p.name ?? p.collarColor ?? `Puppy ${p.birthOrder ?? ''}`,
                sex: p.sex,
              }))}
          />

          {kennel && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs uppercase tracking-widest text-ink-400">Breeder</p>
                <Link
                  href={`/breeders/${kennel.slug}`}
                  className="mt-1 block font-display text-xl text-ink-900 hover:text-brand-600"
                >
                  {kennel.name}
                </Link>
                {kennel.city && (
                  <p className="text-sm text-ink-500">
                    {kennel.city}, {kennel.region}
                    {kennel.foundedYear ? ` · breeding since ${kennel.foundedYear}` : ''}
                  </p>
                )}
                {kennel.about && (
                  <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-ink-600">
                    {kennel.about}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-mono tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}

/**
 * A parent, as a buyer needs to see one.
 *
 * `ClaimPanel` is given `expected`, so a missing hip result renders as "not
 * tested" rather than as an absence nobody notices. That gap is the whole
 * product: a classified board cannot tell you what is missing, because it
 * never knew what was supposed to be there.
 */
function ParentCard({ dog, role }: { dog: PublicParent; role: 'Sire' | 'Dam' }) {
  const photo = dog.media?.[0]?.url;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {photo && (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
              <Image src={photo} alt={dog.callName} fill className="object-cover" sizes="4rem" />
            </div>
          )}
          <div>
          <p className="text-2xs uppercase tracking-widest text-ink-400">
            {role === 'Dam' ? 'Mom' : 'Dad'}
          </p>
          <CardTitle as="h3">
            <Link href={`/studs/${dog.slug}`} className="hover:text-brand-600">
              {dog.registeredName ?? dog.callName}
            </Link>
          </CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-500">
            <span>{formatDogAge(dog.dateOfBirth)}</span>
            {dog.colorPattern && <span>{dog.colorPattern}</span>}
          </p>
          {dog.registrations.length > 0 && (
            <p className="mt-1 font-mono text-2xs text-ink-400">
              {dog.registrations.map((r) => `${r.body} ${r.number}`).join(' · ')}
            </p>
          )}
          </div>
        </div>
        <Dog className="h-5 w-5 shrink-0 text-ink-300" />
      </CardHeader>
      <CardContent>
        <VerificationDensity summary={dog.verificationSummary} className="mb-4" />
        <ClaimPanel
          verified={dog.verifiedClaims}
          reported={dog.reportedClaims}
          expected={EXPECTED_CLAIMS}
        />
        {(dog.sire || dog.damRel) && (
          <p className="mt-4 border-t border-bone-200 pt-3 text-2xs text-ink-400">
            Out of{' '}
            {dog.damRel && (
              <Link href={`/studs/${dog.damRel.slug}`} className="hover:text-brand-600">
                {dog.damRel.registeredName ?? dog.damRel.callName}
              </Link>
            )}
            {dog.sire && dog.damRel && ' by '}
            {dog.sire && (
              <Link href={`/studs/${dog.sire.slug}`} className="hover:text-brand-600">
                {dog.sire.registeredName ?? dog.sire.callName}
              </Link>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Structured data.
 *
 * `Product` with an `offers` block is what actually earns a rich result for a
 * page like this. The `additionalProperty` entries carry the verified health
 * results — machine-readable, and the reason this page can say something no
 * classified listing can.
 */
function JsonLd({ data }: { data: LitterPage }) {
  const { listing, sire, dam, kennel, puppies, coi } = data;
  const available = puppies.filter((p) => p.status === 'AVAILABLE');
  const site = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

  const healthProps = [sire, dam].flatMap((parent) =>
    parent.verifiedClaims
      .filter((c) => c.state === 'VERIFIED' && c.rawResult)
      .map((c) => ({
        '@type': 'PropertyValue',
        name: `${parent === sire ? 'Sire' : 'Dam'} — ${c.markerName || c.claimType}`,
        value: c.rawResult,
        // The provenance is the point. Anyone can assert a hip score.
        description: `Verified against ${c.source}`,
      })),
  );

  const json = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${site}/puppies/${listing.slug}#product`,
        name: `${dam.breed} puppies — ${dam.callName} × ${sire.callName}`,
        description: listing.description ?? listing.headline ?? undefined,
        category: `${dam.breed} puppy`,
        image: listing.photoUrls.length > 0 ? listing.photoUrls : undefined,
        brand: kennel ? { '@type': 'Organization', name: kennel.name } : undefined,
        additionalProperty: [
          ...healthProps,
          {
            '@type': 'PropertyValue',
            name: 'Coefficient of inbreeding',
            value: `${(coi.coi * 100).toFixed(2)}%`,
            description: `Computed over ${coi.generations} generations`,
          },
        ],
        ...(listing.priceCentsFrom != null && available.length > 0
          ? {
              offers: {
                '@type': 'AggregateOffer',
                priceCurrency: 'USD',
                lowPrice: (listing.priceCentsFrom / 100).toFixed(2),
                highPrice: ((listing.priceCentsTo ?? listing.priceCentsFrom) / 100).toFixed(2),
                offerCount: available.length,
                availability: 'https://schema.org/InStock',
                url: `${site}/puppies/${listing.slug}`,
              },
            }
          : {}),
      },
      kennel && {
        '@type': 'Organization',
        '@id': `${site}/breeders/${kennel.slug}#org`,
        name: kennel.name,
        url: kennel.websiteUrl ?? `${site}/breeders/${kennel.slug}`,
        address:
          kennel.city && kennel.region
            ? {
                '@type': 'PostalAddress',
                addressLocality: kennel.city,
                addressRegion: kennel.region,
                addressCountry: kennel.country,
              }
            : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Litters', item: `${site}/puppies` },
          { '@type': 'ListItem', position: 2, name: dam.breed, item: `${site}/puppies?breed=${encodeURIComponent(dam.breed)}` },
          { '@type': 'ListItem', position: 3, name: `${dam.callName} × ${sire.callName}` },
        ],
      },
    ].filter(Boolean),
  };

  return (
    <script
      type="application/ld+json"
      // Server-rendered from our own data; no user HTML reaches this.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }}
    />
  );
}
