import {
  AlertTriangle,
  CalendarHeart,
  Dog as DogIcon,
  PawPrint,
  Plus,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Stat,
  cn,
  formatDate,
  relativeTime,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DashboardResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The breeder dashboard.
 *
 * One question: what needs me today? Everything is ordered by urgency rather
 * than by date, and anything that is merely interesting sits below the fold.
 */
export default async function DashboardPage() {
  const data = await serverApiSafe<DashboardResponse>('/dashboard');
  const kennelName = data?.kennels[0]?.name ?? 'Your kennel';

  if (!data) {
    return (
      <StudioShell>
        <StudioPage title="Today">
          <EmptyState
            title="Sign in to see your program"
            description="The dashboard pulls from your dogs, breedings and litters."
          />
        </StudioPage>
      </StudioShell>
    );
  }

  const { counts, upcomingHeats, activeBreedings, activeLitters, dueTasks } = data;
  const overdue = dueTasks.filter((t) => new Date(t.dueOn) < new Date());
  const empty = counts.dogs === 0;

  return (
    <StudioShell kennelName={kennelName} userName="Jordan Hale">
      <StudioPage
        title="Today"
        description="Everything with a date attached, in one place."
        wide
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/studio/pedigrees/import">
                <Upload /> Import pedigree
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/studio/dogs/new">
                <Plus /> Add a dog
              </Link>
            </Button>
          </>
        }
      >
        {empty ? (
          <EmptyState
            icon={<DogIcon className="h-5 w-5" />}
            title="Nothing on file yet"
            description="Add a dog or paste a pedigree, and heats, breedings, litters and care schedules all start flowing from it."
            action={
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/studio/pedigrees/import">Import a pedigree</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/studio/dogs/new">Add a dog</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {/* ── Anything overdue comes first, always ─────────────── */}
            {overdue.length > 0 && (
              <Card className="mb-4 border-warning/30 bg-warning-bg/40">
                <CardContent className="pt-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-warning-fg">
                    <AlertTriangle className="h-4 w-4" />
                    {overdue.length} task{overdue.length === 1 ? '' : 's'} overdue
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {overdue.slice(0, 5).map((t) => (
                      <li key={t.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium text-ink-800">{t.title}</span>
                          <span className="ml-2 text-2xs text-ink-500">
                            {t.litter
                              ? `${t.litter.letter ? `${t.litter.letter} litter` : (t.litter.name ?? 'litter')} · ${t.litter.dam.callName}`
                              : (t.dog?.callName ?? '')}
                          </span>
                        </span>
                        <span className="shrink-0 text-2xs text-warning-fg">
                          {relativeTime(t.dueOn)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {overdue.length > 5 && (
                    <Link href="/studio/litters" className="mt-3 inline-block text-2xs text-warning-fg underline">
                      + {overdue.length - 5} more
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Dogs" value={counts.dogs} sub={`${counts.females} female`} icon={<DogIcon className="h-4 w-4" />} />
              <Stat
                label="Active breedings"
                value={counts.activeBreedings}
                icon={<CalendarHeart className="h-4 w-4" />}
              />
              <Stat
                label="Puppies on the ground"
                value={counts.puppiesOnTheGround}
                sub={`${counts.littersOnTheGround} litter${counts.littersOnTheGround === 1 ? '' : 's'}`}
                icon={<PawPrint className="h-4 w-4" />}
              />
              <Stat
                label="Verified claims"
                value={counts.verifiedClaims}
                sub={counts.openConflicts > 0 ? `${counts.openConflicts} under review` : 'all agreeing'}
                tone={counts.openConflicts > 0 ? 'danger' : 'brand'}
                icon={<ShieldCheck className="h-4 w-4" />}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {/* ── Litters ──────────────────────────────────────── */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Litters</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeLitters.length === 0 ? (
                    <EmptyState
                      icon={<PawPrint className="h-5 w-5" />}
                      title="No active litters"
                      description="Confirm a pregnancy on a breeding and the litter appears here with its whelp countdown."
                    />
                  ) : (
                    <ul className="divide-y divide-bone-200">
                      {activeLitters.map((l) => (
                        <li key={l.id}>
                          <Link
                            href={`/studio/litters/${l.id}`}
                            className="flex items-center justify-between gap-4 py-3 transition-colors hover:text-brand-700"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink-800">
                                {l.letter ? `${l.letter} litter` : (l.name ?? 'Litter')}
                                <span className="ml-2 font-normal text-ink-500">
                                  {l.dam.callName} × {l.sire.callName}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-2xs text-ink-400">
                                {l.whelpedOn
                                  ? `Whelped ${formatDate(l.whelpedOn)} · ${l.milestones?.ageDays ?? 0} days old`
                                  : l.expectedWhelpOn
                                    ? `Due ${formatDate(l.expectedWhelpOn)} · ${relativeTime(l.expectedWhelpOn)}`
                                    : 'Expected'}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {l.milestones?.inCriticalWindow && (
                                <Badge tone="warning" size="sm">
                                  first fortnight
                                </Badge>
                              )}
                              <Badge tone={l.status === 'ON_THE_GROUND' ? 'brand' : 'neutral'} size="sm">
                                {l.puppies.length > 0 ? `${l.puppies.length} pups` : l.status.replace(/_/g, ' ').toLowerCase()}
                              </Badge>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* ── Upcoming heats ───────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle as="h4" className="text-md">
                    Upcoming heats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingHeats.length === 0 ? (
                    <p className="text-sm leading-relaxed text-ink-500">
                      No predictions yet. Log the first day of two heats for a bitch and we can start
                      forecasting hers.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {upcomingHeats.map(({ dog, prediction }) => (
                        <li key={dog.id}>
                          <Link href={`/studio/dogs/${dog.slug}/heats`} className="block hover:text-brand-700">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium text-ink-800">{dog.callName}</span>
                              <span
                                className={cn(
                                  'font-mono text-xs tabular-nums',
                                  (prediction.daysAway ?? 0) < 0 ? 'text-warning-fg' : 'text-ink-600',
                                )}
                              >
                                {prediction.daysAway !== null
                                  ? prediction.daysAway < 0
                                    ? `${Math.abs(prediction.daysAway)}d overdue`
                                    : `${prediction.daysAway}d`
                                  : '—'}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 text-2xs text-ink-400">
                              {prediction.windowStart && prediction.windowEnd
                                ? `${formatDate(prediction.windowStart, 'short')} – ${formatDate(prediction.windowEnd, 'short')}`
                                : '—'}
                              <ConfidenceDot confidence={prediction.confidence} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
                    The window is the answer, not the date. A bitch with two logged cycles gets a
                    wide one on purpose.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Breedings ──────────────────────────────────────── */}
            {activeBreedings.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Active breedings</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-bone-200">
                    {activeBreedings.map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/studio/breedings/${b.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:text-brand-700"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink-800">
                              {b.dam.callName} × {b.sire.callName}
                            </span>
                            <span className="mt-0.5 block text-2xs text-ink-400">
                              {b.method.replace(/_/g, ' ').toLowerCase()} ·{' '}
                              {b.status.replace(/_/g, ' ').toLowerCase()}
                              {b.forecast.gestationDay !== null && b.forecast.gestationDay >= 0
                                ? ` · day ${b.forecast.gestationDay}`
                                : ''}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            {b.forecast.dueOn && (
                              <span className="text-right">
                                <span className="block font-mono text-sm tabular-nums text-ink-800">
                                  {b.forecast.daysAway !== null && b.forecast.daysAway >= 0
                                    ? `${b.forecast.daysAway}d`
                                    : 'due'}
                                </span>
                                <span className="block text-2xs text-ink-400">
                                  {formatDate(b.forecast.dueOn, 'short')}
                                </span>
                              </span>
                            )}
                            <ConfidenceDot confidence={b.forecast.confidence} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </StudioPage>
    </StudioShell>
  );
}

/**
 * Confidence, rendered as a dot rather than a word.
 *
 * The dashboard is scanned, not read. But it is never omitted — a whelp date
 * timed from a breeding date and one timed from a confirmed ovulation are ten
 * days apart in accuracy, and showing them identically would be a lie to
 * someone about to sit up all night.
 */
function ConfidenceDot({ confidence }: { confidence: string }) {
  const label =
    confidence === 'HIGH'
      ? 'High confidence'
      : confidence === 'MODERATE'
        ? 'Moderate confidence'
        : confidence === 'LOW'
          ? 'Low confidence — treat as a range'
          : 'No basis to predict';
  const tone =
    confidence === 'HIGH'
      ? 'bg-brand-600'
      : confidence === 'MODERATE'
        ? 'bg-brand-300'
        : confidence === 'LOW'
          ? 'bg-warning'
          : 'bg-ink-200';
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone)} title={label} aria-label={label} />;
}
