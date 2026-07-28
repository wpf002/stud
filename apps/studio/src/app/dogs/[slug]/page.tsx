import { GitBranch, Microchip, PawPrint, Ruler, ShieldCheck, Weight } from 'lucide-react';
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
  EmptyState,
  VerificationBadge,
  claimLabel,
  formatCoi,
  formatDate,
  formatDogAge,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogDetail, DogSummary, VerificationResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, verification] = await Promise.all([
    serverApiSafe<{ dog: DogDetail; offspring: DogSummary[] }>(`/dogs/${slug}`),
    serverApiSafe<VerificationResponse>(`/dogs/${slug}/verification`),
  ]);
  if (!data) notFound();

  const { dog, offspring } = data;
  const stats = dog.pedigreeStats;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={dog.callName}
        description={dog.registeredName ?? dog.breed}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dogs/${slug}/pedigree`}>
                <GitBranch /> Pedigree
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/pedigrees/pairing?sireId=${dog.sex === 'MALE' ? dog.id : ''}&damId=${dog.sex === 'FEMALE' ? dog.id : ''}`}>
                Trial pairing
              </Link>
            </Button>
          </>
        }
      >
        {dog.supersededBy && (
          <Alert tone="warning" className="mb-4">
            This record was merged into{' '}
            <Link href={`/dogs/${dog.supersededBy.slug}`} className="font-semibold underline">
              {dog.supersededBy.callName}
            </Link>
            . It is kept so existing links still resolve, but it is no longer the record.
          </Alert>
        )}

        {dog.isAncestorStub && (
          <Alert tone="info" className="mb-4">
            This is an ancestor record created from a pedigree import. It exists as a name on
            someone else&rsquo;s papers — nothing about it is verified, and nobody is maintaining it.
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ── Identity ─────────────────────────────────────────────── */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Row label="Breed" value={dog.breed} />
                <Row label="Sex" value={dog.sex === 'MALE' ? 'Male' : 'Female'} />
                <Row
                  label="Born"
                  value={
                    dog.dateOfBirth
                      ? `${formatDate(dog.dateOfBirth)} · ${formatDogAge(dog.dateOfBirth)}`
                      : 'Unknown'
                  }
                />
                <Row label="Colour" value={dog.colorPattern ?? '—'} />
                <Row label="Markings" value={dog.markings ?? '—'} />
                <Row
                  label="Microchip"
                  value={dog.microchip ?? '—'}
                  icon={<Microchip className="h-3.5 w-3.5" />}
                  mono
                />
                <Row
                  label="Height"
                  value={dog.heightCm ? `${dog.heightCm} cm` : '—'}
                  icon={<Ruler className="h-3.5 w-3.5" />}
                />
                <Row
                  label="Weight"
                  value={dog.weightKg ? `${dog.weightKg} kg` : '—'}
                  icon={<Weight className="h-3.5 w-3.5" />}
                />
              </dl>

              {dog.registrations.length > 0 && (
                <div className="mt-5 border-t border-bone-200 pt-4">
                  <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
                    Registrations
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dog.registrations.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-bone-300 bg-bone-100 px-2.5 py-1"
                      >
                        <span className="text-xs font-semibold text-ink-700">{r.body}</span>
                        <span className="font-mono text-xs text-ink-500">{r.number}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Self-reported. Never mixed with verified data (invariant 5). */}
              {dog.temperamentNotes && (
                <div className="mt-5 border-t border-bone-200 pt-4">
                  <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-widest text-ink-400">
                    Temperament
                    <VerificationBadge state="REPORTED" size="sm" />
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{dog.temperamentNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Pedigree summary ─────────────────────────────────────── */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle as="h4" className="text-md">
                  Pedigree
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  <ParentRow role="Sire" dog={dog.sire} />
                  <ParentRow role="Dam" dog={dog.damRel} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-bone-200 pt-4">
                  <div>
                    <p className="text-2xs uppercase tracking-widest text-ink-400">COI</p>
                    <p className="font-mono text-xl tabular-nums text-ink-900">
                      {stats ? formatCoi(stats.coi) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs uppercase tracking-widest text-ink-400">Complete</p>
                    <p className="font-mono text-xl tabular-nums text-ink-900">
                      {stats ? `${Math.round(stats.completenessRatio * 100)}%` : '—'}
                    </p>
                  </div>
                </div>

                <Button asChild variant="outline" size="sm" block className="mt-4">
                  <Link href={`/dogs/${slug}/pedigree`}>Open full pedigree</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h4" className="text-md">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-ink-400" /> Verification
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {verification && verification.summary && verification.summary.verifiedCount > 0 ? (
                  <>
                    <p className="font-mono text-2xl tabular-nums text-ink-900">
                      {Math.round(verification.summary.density * 100)}%
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {verification.summary.verifiedCount} claims verified against a source
                      {verification.summary.hasChic ? ' · CHIC' : ''}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {verification.verified.slice(0, 6).map((c) => (
                        <VerificationBadge
                          key={c.id}
                          state={c.state}
                          claim={claimLabel(c.claimType, c.markerName)}
                          size="sm"
                          evidence={{
                            source: c.source,
                            sourceUrl: c.sourceUrl,
                            result: c.rawResult,
                            identifier: c.matchedIdentifier,
                            testedAt: c.testedAt,
                            checkedAt: c.lastCheckedAt,
                            conflictNote: c.conflictNote,
                          }}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-ink-500">
                    Nothing verified yet. Absence of a result is not a passing result — run a
                    verification to check this dog against the sources.
                  </p>
                )}
                <Button asChild variant="outline" size="sm" block className="mt-4">
                  <Link href={`/dogs/${slug}/verification`}>Open verification</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Produce record ──────────────────────────────────────────── */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <PawPrint className="h-4 w-4 text-ink-400" /> Offspring on record
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {offspring.length === 0 ? (
              <EmptyState
                icon={<PawPrint className="h-5 w-5" />}
                title="No offspring recorded"
                description="Anything listing this dog as a sire or dam appears here. Over time this becomes the produce record — a track record rather than a résumé."
              />
            ) : (
              <ul className="divide-y divide-bone-200">
                {offspring.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/dogs/${o.slug}`}
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-brand-700"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-800">
                          {o.callName}
                        </span>
                        {o.registeredName && (
                          <span className="block truncate text-2xs text-ink-400">
                            {o.registeredName}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={o.sex === 'MALE' ? 'brand' : 'clay'} size="sm">
                          {o.sex === 'MALE' ? 'M' : 'F'}
                        </Badge>
                        <span className="text-2xs text-ink-400">
                          {o.dateOfBirth ? formatDate(o.dateOfBirth, 'short') : '—'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </StudioPage>
    </StudioShell>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-2xs uppercase tracking-widest text-ink-400">
        {icon}
        {label}
      </dt>
      <dd className={mono ? 'mt-0.5 font-mono text-sm text-ink-800' : 'mt-0.5 text-sm text-ink-800'}>
        {value}
      </dd>
    </div>
  );
}

function ParentRow({
  role,
  dog,
}: {
  role: string;
  dog: { id: string; callName: string; registeredName: string | null } | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-2xs uppercase tracking-widest text-ink-400">{role}</span>
      {dog ? (
        <span className="min-w-0 truncate text-right text-sm text-ink-800">
          {dog.registeredName ?? dog.callName}
        </span>
      ) : (
        <span className="text-sm text-ink-300">Unknown</span>
      )}
    </div>
  );
}
