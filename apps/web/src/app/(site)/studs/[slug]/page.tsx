import { MapPin, PawPrint, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, ClaimPanel, VerificationDensity, formatCoi, formatDate, formatDateOnly, formatDogAge, formatMoney, titleCase } from '@stud/ui';
import { expectedClaims } from '@stud/verify';
import { API_URL } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface StudProfile {
  dog: {
    id: string; slug: string; callName: string; registeredName: string | null; breed: string;
    dateOfBirth: string | null; colorPattern: string | null; temperamentNotes: string | null;
    registrations: { id: string; body: string; number: string }[];
    kennel: { id: string; slug: string; name: string; city: string | null; region: string | null; about: string | null } | null;
    verifiedClaims: Parameters<typeof ClaimPanel>[0]['verified'];
    reportedClaims: Parameters<typeof ClaimPanel>[0]['reported'];
    verificationSummary: Parameters<typeof VerificationDensity>[0]['summary'];
    pedigreeStats: { coi: number; generations: number; completenessRatio: number } | null;
    sire: { slug: string; callName: string; registeredName: string | null } | null;
    damRel: { slug: string; callName: string; registeredName: string | null } | null;
  };
  listing: {
    studFeeCents: number | null; availability: string; bookedThrough: string | null; semenTypes: string[]; shipsSemen: boolean;
    pickOfLitter: boolean; feeNotes: string | null; requirements: string | null;
    travelRadiusMiles: number | null; requiresHealthTesting: boolean;
    requiresContract: boolean; requiresBrucellosis: boolean;
  } | null;
  offspring: { id: string; slug: string; callName: string; registeredName: string | null; sex: string; dateOfBirth: string | null; verificationSummary: { verifiedCount: number; healthNormalCount: number } | null }[];
  litters: { id: string; letter: string | null; whelpedOn: string | null; liveBorn: number | null; dam: { slug: string; callName: string; registeredName: string | null } }[];
}

async function load(slug: string): Promise<StudProfile | null> {
  const res = await fetch(`${API_URL}/v1/studs/${slug}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as StudProfile;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: 'Stud not found' };
  const { dog } = data;
  const verified = dog.verificationSummary?.verifiedCount ?? 0;
  return {
    title: `${dog.registeredName ?? dog.callName} — ${dog.breed} at stud`,
    description: `${dog.registeredName ?? dog.callName}, a ${dog.breed} at stud. ${verified} claims verified against the issuing source.`,
  };
}

export default async function StudProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();

  const { dog, listing, offspring, litters } = data;
  const name = dog.registeredName ?? dog.callName;

  return (
    <div className="mx-auto max-w-content px-5 py-12 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
              {dog.breed} · at stud
            </p>
            <h1 className="mt-2 font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
              {name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-ink-500">
              <span>{formatDogAge(dog.dateOfBirth)}</span>
              {dog.colorPattern && <span>{dog.colorPattern}</span>}
              {dog.kennel?.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {dog.kennel.city}, {dog.kennel.region}
                </span>
              )}
            </p>
            {dog.registrations.length > 0 && (
              <p className="mt-2 font-mono text-xs text-ink-400">
                {dog.registrations.map((r) => `${r.body} ${r.number}`).join(' · ')}
              </p>
            )}
          </div>

          {/* The résumé. Health and titles come from the verified record. */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-600" /> Health &amp; Titles
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimPanel
                verified={dog.verifiedClaims}
                reported={dog.reportedClaims}
                expected={expectedClaims(dog.breed)}
              />
            </CardContent>
          </Card>

          {/* The produce record — what he has actually thrown. */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <PawPrint className="h-4 w-4 text-ink-400" /> What He Has Produced
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {litters.length === 0 && offspring.length === 0 ? (
                <p className="text-sm leading-relaxed text-ink-500">
                  No litters recorded on this platform yet. Over time this section becomes the
                  thing a résumé cannot fake — a track record of what he actually throws, reported
                  by the people who own his puppies.
                </p>
              ) : (
                <>
                  {litters.length > 0 && (
                    <ul className="divide-y divide-bone-200">
                      {litters.map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                          <span className="text-ink-700">
                            {l.letter ? `${l.letter} litter` : 'Litter'} out of{' '}
                            {l.dam.registeredName ?? l.dam.callName}
                          </span>
                          <span className="shrink-0 text-2xs text-ink-400">
                            {l.whelpedOn ? formatDate(l.whelpedOn) : 'expected'}
                            {l.liveBorn != null ? ` · ${l.liveBorn} live` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {offspring.length > 0 && (
                    <p className="mt-4 border-t border-bone-200 pt-3 text-2xs text-ink-400">
                      {offspring.length} offspring on record ·{' '}
                      {offspring.filter((o) => (o.verificationSummary?.verifiedCount ?? 0) > 0).length}{' '}
                      with verified results of their own
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {dog.temperamentNotes && (
            <Card>
              <CardHeader>
                <CardTitle as="h3" className="text-lg">
                  Temperament
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-ink-600">{dog.temperamentNotes}</p>
                <p className="mt-3 text-2xs text-ink-400">
                  Owner-stated. Not independently verified.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Terms rail ────────────────────────────────────────────── */}
        <div className="space-y-4">
          {listing && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
                  Stud Fee
                </p>
                <p className="mt-1 font-display text-3xl text-ink-900">
                  {listing.studFeeCents != null ? formatMoney(listing.studFeeCents, { compact: true }) : 'On enquiry'}
                </p>
                {listing.pickOfLitter && (
                  <p className="mt-1 text-xs text-ink-500">or pick of litter</p>
                )}
                {listing.feeNotes && <p className="mt-2 text-xs text-ink-500">{listing.feeNotes}</p>}

                <dl className="mt-4 space-y-2 border-t border-bone-200 pt-3 text-sm">
                  <Row
                    label="Availability"
                    value={
                      listing.availability === 'BOOKED' && listing.bookedThrough
                        ? `Booked through ${formatDateOnly(listing.bookedThrough)}`
                        : titleCase(listing.availability)
                    }
                  />
                  <Row
                    label="Semen"
                    value={listing.semenTypes.length ? listing.semenTypes.map(titleCase).join(", ") : 'Natural'}
                  />
                  <Row label="Ships" value={listing.shipsSemen ? 'Yes' : 'No'} />
                  {listing.travelRadiusMiles != null && (
                    <Row label="Travel" value={`${listing.travelRadiusMiles} mi`} />
                  )}
                </dl>

                <div className="mt-4 border-t border-bone-200 pt-3">
                  <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
                    What the owner requires
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-ink-600">
                    {listing.requiresHealthTesting && <li>· Health testing on the dam</li>}
                    {listing.requiresBrucellosis && <li>· Current brucellosis test</li>}
                    {listing.requiresContract && <li>· Signed stud contract</li>}
                  </ul>
                  {listing.requirements && (
                    <p className="mt-2 text-xs leading-relaxed text-ink-500">{listing.requirements}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <VerificationDensity summary={dog.verificationSummary} />

          <Card>
            <CardContent className="pt-5">
              <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Pedigree</p>
              <dl className="mt-2 space-y-2 text-sm">
                <Row label="Sire" value={dog.sire ? (dog.sire.registeredName ?? dog.sire.callName) : 'Unknown'} />
                <Row label="Dam" value={dog.damRel ? (dog.damRel.registeredName ?? dog.damRel.callName) : 'Unknown'} />
                <Row
                  label="His COI"
                  value={dog.pedigreeStats ? formatCoi(dog.pedigreeStats.coi) : '—'}
                />
                <Row
                  label="Pedigree complete"
                  value={dog.pedigreeStats ? `${Math.round(dog.pedigreeStats.completenessRatio * 100)}%` : '—'}
                />
              </dl>
              <p className="mt-3 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
                A COI for a litter with your own dam — not just his — is in the breeder workspace.
              </p>
            </CardContent>
          </Card>

          {dog.kennel && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Kennel</p>
                <Link
                  href={`/breeders/${dog.kennel.slug}`}
                  className="mt-1 block font-display text-lg text-ink-900 hover:text-brand-700"
                >
                  {dog.kennel.name}
                </Link>
                {dog.kennel.about && (
                  <p className="mt-2 text-xs leading-relaxed text-ink-500">{dog.kennel.about}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right text-ink-800">{value}</dd>
    </div>
  );
}
