import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  FileSignature,
  Heart,
  PawPrint,
  ShieldCheck,
  Syringe,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, ClaimPanel, EmptyState, Stat, VerificationDensity, cn, formatCoi, formatDate, formatDogAge, formatWeight, titleCase } from '@stud/ui';
import { EventLogger } from '@/components/event-logger';
import { ownerGet, type Obligation, type OwnedDogResponse, type ParentSummary } from '@/lib/owner';
import { expectedClaims } from '@stud/verify';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your dog',
  // A private record. It should never be indexed and never be a search result.
  robots: { index: false, follow: false },
};


export default async function OwnedDogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await ownerGet<OwnedDogResponse>(`/my/dogs/${encodeURIComponent(slug)}`);

  if (data === 'UNAUTHORIZED') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <EmptyState
          title="Sign In to See This Dog"
          description="Your dog's record is private to you."
          action={
            <Link href="/login" className="text-sm text-brand-600 underline">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }
  if (!data) notFound();

  const { dog, breeder, contract, handover, obligations, pedigree, growth, isOwner } = data;
  const litter = dog.puppyRecord?.litter ?? null;
  const dated = obligations.filter((o) => o.dueOn && o.active);
  const overdue = obligations.filter((o) => o.overdue);
  const standing = obligations.filter((o) => !o.dueOn && o.active);

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <Link
        href="/my/dogs"
        className="mb-6 inline-flex items-center gap-1.5 text-2xs text-ink-400 hover:text-brand-600"
      >
        <ArrowLeft className="h-3 w-3" /> Your Dogs
      </Link>

      <header>
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
          {dog.breed} · {dog.sex === 'MALE' ? 'Male' : 'Female'}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          {dog.callName}
        </h1>
        {dog.registeredName && dog.registeredName !== dog.callName && (
          <p className="mt-1 text-md text-ink-500">{dog.registeredName}</p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-ink-500">
          <span>{formatDogAge(dog.dateOfBirth)}</span>
          {dog.dateOfBirth && <span>born {formatDate(dog.dateOfBirth)}</span>}
          {dog.colorPattern && <span>{dog.colorPattern}</span>}
        </p>
        {dog.microchip && (
          <p className="mt-1 font-mono text-2xs text-ink-400">chip {dog.microchip}</p>
        )}
      </header>

      {/*
        The whole point of the phase, stated once. This record was not typed in
        by the person reading it.
      */}
      {handover && (
        <div className="mt-6 flex gap-3 rounded-card bg-brand-50 px-4 py-3 ring-1 ring-inset ring-brand-100">
          <PawPrint className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm leading-relaxed text-ink-700">
            <span className="font-semibold text-ink-900">
              Came home {formatDate(handover.collectedOn)}
              {breeder ? ` from ${breeder.name}` : ''}.
            </span>{' '}
            The pedigree, both parents&rsquo; health testing, and the growth chart from the
            whelping box all transferred over with {dog.callName}.
          </p>
        </div>
      )}

      {overdue.length > 0 && (
        <Alert tone="danger" className="mt-4" icon={<AlertTriangle className="h-4 w-4" />}>
          <span className="font-semibold">
            {overdue.length === 1 ? 'One thing is overdue' : `${overdue.length} things are overdue`}
          </span>
          <ul className="mt-1.5 space-y-0.5">
            {overdue.map((o) => (
              <li key={o.kind}>{o.title}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* ── What the contract asks ────────────────────────────── */}
          {obligations.length > 0 && (
            <section>
              <h2 className="font-display text-2xl text-ink-900">What Your Contract Says</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                The important parts of your contract, as actual dates.
              </p>

              <div className="mt-4 space-y-3">
                {[...dated, ...standing].map((o) => (
                  <ObligationCard key={`${o.kind}-${o.clauseId}`} obligation={o} />
                ))}
              </div>
            </section>
          )}

          {/* ── The parents ───────────────────────────────────────── */}
          {(dog.sire || dog.damRel) && (
            <section className="space-y-4">
              <h2 className="font-display text-2xl text-ink-900">
                {dog.callName}&rsquo;s parents
              </h2>
              <p className="text-sm leading-relaxed text-ink-500">
                The same records the breeder holds, checked against the bodies that issued them.
                These do not change hands with the dog — they stay live.
              </p>
              {dog.damRel && <ParentCard dog={dog.damRel} breed={dog.breed} role="Dam" />}
              {dog.sire && <ParentCard dog={dog.sire} breed={dog.breed} role="Sire" />}
            </section>
          )}

          {/* ── The dog's own record ──────────────────────────────── */}
          <section>
            <h2 className="font-display text-2xl text-ink-900">{dog.callName}&rsquo;s own record</h2>
            <Card className="mt-3">
              <CardContent className="pt-5">
                <VerificationDensity summary={dog.verificationSummary} className="mb-4" />
                {dog.verifiedClaims.length === 0 && dog.reportedClaims.length === 0 ? (
                  <p className="text-sm leading-relaxed text-ink-500">
                    Nothing here yet, which is normal for a young dog. When {dog.callName} has
                    hips or elbows done, add the result and we&rsquo;ll confirm it with the
                    registry.
                  </p>
                ) : (
                  <ClaimPanel
                    verified={dog.verifiedClaims}
                    reported={dog.reportedClaims}
                    expected={expectedClaims(dog.breed)}
                  />
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── Health log ────────────────────────────────────────── */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-ink-900">Health Log</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Vet visits, vaccinations, anything worth remembering.
                </p>
              </div>
              {isOwner && <EventLogger slug={dog.slug} dogName={dog.callName} />}
            </div>

            {dog.healthEvents.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-bone-400 px-5 py-8 text-center text-sm text-ink-400">
                Nothing logged yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {dog.healthEvents.map((e) => (
                  <li key={e.id}>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-800">{e.title}</p>
                            <p className="mt-0.5 text-2xs text-ink-400">
                              {formatDate(e.occurredOn)}
                              {e.vetName ? ` · ${e.vetName}` : ''}
                              {e.weightGrams ? ` · ${formatWeight(e.weightGrams, 'lb')}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Badge tone="neutral" size="sm">
                              {titleCase(e.kind)}
                            </Badge>
                            {e.sharedWithBreeder && (
                              <Badge tone="brand" size="sm">
                                Shared
                              </Badge>
                            )}
                          </div>
                        </div>
                        {e.detail && (
                          <p className="mt-2 text-xs leading-relaxed text-ink-600">{e.detail}</p>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}

            {/* Invariant 5, told to the owner in their own words. */}
            <p className="mt-3 text-2xs leading-relaxed text-ink-400">
              Anything you write here is recorded as your account of what happened — it is never
              shown as a verified result. Only a check against the body that issued a test can do
              that, and that is deliberately not something you or your breeder can shortcut.
            </p>
          </section>
        </div>

        {/* ── Rail ───────────────────────────────────────────────── */}
        <aside className="space-y-4">
          {pedigree && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs uppercase tracking-widest text-ink-400">
                  Coefficient of inbreeding
                </p>
                <p className="mt-0.5 font-display text-3xl text-ink-900">
                  {formatCoi(pedigree.coi)}
                </p>
                <Badge
                  tone={
                    pedigree.band === 'LOW' ? 'brand' : pedigree.band === 'MODERATE' ? 'warning' : 'danger'
                  }
                  size="sm"
                >
                  {titleCase(pedigree.band)}
                </Badge>
                <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                  {pedigree.confidenceNote}
                </p>
                {litter && (
                  <Link
                    href={`/puppies`}
                    className="mt-3 block border-t border-bone-200 pt-2 text-2xs text-ink-400 hover:text-brand-600"
                  >
                    Out of {litter.dam.callName} by {litter.sire.callName}
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {growth && dog.puppyRecord && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs uppercase tracking-widest text-ink-400">
                  From the whelping box
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Stat
                    label="Born at"
                    value={
                      dog.puppyRecord.birthWeightGrams
                        ? formatWeight(dog.puppyRecord.birthWeightGrams, 'oz')
                        : '—'
                    }
                  />
                  <Stat
                    label="By eight weeks"
                    value={growth.latestGrams ? formatWeight(growth.latestGrams, 'lb') : '—'}
                  />
                </div>
                <p className="mt-2 text-2xs leading-relaxed text-ink-500">{growth.summary}</p>
                {dog.puppyRecord.collarColor && (
                  <p className="mt-2 border-t border-bone-200 pt-2 text-2xs text-ink-400">
                    {dog.puppyRecord.collarColor} collar
                    {dog.puppyRecord.birthOrder ? `, number ${dog.puppyRecord.birthOrder} born` : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {handover && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs uppercase tracking-widest text-ink-400">
                  What came home with {dog.callName}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {(
                    [
                      ['Microchip registered to you', handover.microchipRegistered],
                      ['Registration paperwork', handover.registrationPapers],
                      ['Health certificate', handover.healthCertificate],
                      ['Vaccination record', handover.vaccinationRecord],
                      ['Worming record', handover.wormingRecord],
                    ] as const
                  ).map(([label, done]) => (
                    <li
                      key={label}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        done ? 'text-ink-700' : 'text-ink-300',
                      )}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5 text-brand-600" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border border-bone-400" />
                      )}
                      {label}
                    </li>
                  ))}
                </ul>
                {handover.itemsProvided && (
                  <p className="mt-3 border-t border-bone-200 pt-2 text-xs leading-relaxed text-ink-600">
                    {handover.itemsProvided}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {contract && (
            <Card>
              <CardContent className="pt-5">
                <p className="flex items-center gap-2 text-2xs uppercase tracking-widest text-ink-400">
                  <FileSignature className="h-3 w-3" /> Your Contract
                </p>
                <p className="mt-1 text-sm text-ink-800">{contract.title}</p>
                {contract.signedAt && (
                  <p className="text-2xs text-ink-400">
                    signed {formatDate(contract.signedAt)} by both of you
                  </p>
                )}
                {contract.contentHash && (
                  <p className="mt-2 font-mono text-2xs text-ink-400">
                    {contract.contentHash.slice(0, 16)}…
                  </p>
                )}
                <p className="mt-2 border-t border-bone-200 pt-2 text-2xs leading-relaxed text-ink-400">
                  This is the exact text you signed. It cannot be edited — a change would break the
                  hash rather than quietly alter what you agreed to.
                </p>
              </CardContent>
            </Card>
          )}

          {breeder && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs uppercase tracking-widest text-ink-400">Your Breeder</p>
                <Link
                  href={`/breeders/${breeder.slug}`}
                  className="mt-1 block font-display text-lg text-ink-900 hover:text-brand-600"
                >
                  {breeder.name}
                </Link>
                {breeder.city && (
                  <p className="text-sm text-ink-500">
                    {breeder.city}, {breeder.region}
                  </p>
                )}
                {data.transferRule.requiresReturnToBreeder && (
                  <p className="mt-3 border-t border-bone-200 pt-2 text-2xs leading-relaxed text-ink-500">
                    If you are ever unable to keep {dog.callName}, contact them first — they have
                    committed to taking the dog back at any age, for any reason.
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

function ObligationCard({ obligation: o }: { obligation: Obligation }) {
  const icon =
    o.kind === 'VET_EXAM' || o.kind === 'ALTERATION' ? (
      <Syringe className="h-4 w-4" />
    ) : o.kind === 'RETURN_TO_BREEDER' ? (
      <Heart className="h-4 w-4" />
    ) : o.kind === 'HEALTH_GUARANTEE' ? (
      <ShieldCheck className="h-4 w-4" />
    ) : (
      <Clock className="h-4 w-4" />
    );

  return (
    <Card className={cn(o.overdue && 'border-danger/40')}>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <span
            className={cn(
              'mt-0.5 shrink-0',
              o.overdue ? 'text-danger' : o.dueOn ? 'text-brand-600' : 'text-ink-300',
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
              {o.title}
              {o.dueOn ? (
                <span
                  className={cn(
                    'font-normal text-2xs',
                    o.overdue ? 'text-danger' : 'text-ink-400',
                  )}
                >
                  {o.overdue ? 'was due ' : 'by '}
                  {formatDate(o.dueOn)}
                </span>
              ) : o.expiresOn ? (
                <span className="font-normal text-2xs text-ink-400">
                  until {formatDate(o.expiresOn)}
                </span>
              ) : null}
              {/* Whose job it is. Half of these are the breeder's. */}
              <Badge tone={o.party === 'BREEDER' ? 'neutral' : 'brand'} size="sm">
                {o.party === 'BOTH' ? 'both of you' : o.party === 'BREEDER' ? 'your breeder' : 'you'}
              </Badge>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{o.detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ParentCard({ dog, role, breed }: { dog: ParentSummary; role: 'Sire' | 'Dam'; breed: string }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-2xs uppercase tracking-widest text-ink-400">{role}</p>
        <CardTitle as="h3">
          <Link href={`/studs/${dog.slug}`} className="hover:text-brand-600">
            {dog.registeredName ?? dog.callName}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <VerificationDensity summary={dog.verificationSummary} className="mb-4" />
        <ClaimPanel
          verified={dog.verifiedClaims}
          reported={dog.reportedClaims}
          expected={expectedClaims(breed)}
        />
      </CardContent>
    </Card>
  );
}
