import { ArrowLeft, CalendarHeart, Check, FileSignature, PawPrint } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Stat,
  cn,
  formatDate,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { BreedingDetailResponse } from '@/lib/types';
import { CollectionsClient } from './collections-client';

export const dynamic = 'force-dynamic';

export default async function BreedingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverApiSafe<BreedingDetailResponse>(`/breedings/${id}`);
  if (!data) notFound();

  const { breeding, forecast, milestones, milestoneAnchor } = data;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={`${breeding.dam.callName} × ${breeding.sire.callName}`}
        description={`${breeding.method.replace(/_/g, ' ').toLowerCase()} · ${breeding.status
          .replace(/_/g, ' ')
          .toLowerCase()}`}
        wide
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/breedings">
              <ArrowLeft /> All breedings
            </Link>
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            {/* ── Forecast ─────────────────────────────────────────── */}
            <Card>
              <CardContent className="pt-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="Due"
                    value={forecast.dueOn ? formatDate(forecast.dueOn) : '—'}
                    sub={
                      forecast.earliest && forecast.latest
                        ? `${formatDate(forecast.earliest)} – ${formatDate(forecast.latest)}`
                        : undefined
                    }
                  />
                  <Stat
                    label="Gestation day"
                    value={forecast.gestationDay !== null ? String(forecast.gestationDay) : '—'}
                    sub={
                      forecast.daysAway !== null && forecast.daysAway >= 0
                        ? `${forecast.daysAway} days to go`
                        : undefined
                    }
                  />
                  <Stat
                    label="Basis"
                    value={forecast.basis.replace(/_/g, ' ').toLowerCase()}
                    sub={forecast.confidence.toLowerCase() + ' confidence'}
                  />
                </div>
                {/*
                  The note is where the honesty lives — a date derived from a
                  breeding date carries a five-day error the breeder needs to
                  see, not a false precision.
                */}
                <p className="mt-4 border-t border-bone-200 pt-3 text-xs leading-relaxed text-ink-500">
                  {forecast.note}
                </p>
              </CardContent>
            </Card>

            {/* ── Gestation calendar ───────────────────────────────── */}
            {milestones.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <h3 className="flex items-center gap-2 font-display text-md text-ink-900">
                    <CalendarHeart className="h-4 w-4 text-ink-400" /> Gestation calendar
                  </h3>
                  <p className="mt-1 text-2xs text-ink-400">
                    Anchored on {milestoneAnchor === 'OVULATION' ? 'ovulation' : 'the breeding date'}
                    {milestoneAnchor === 'BREEDING_DATE'
                      ? ' — a calendar built on a breeding date can be five days out, and an ultrasound five days early shows nothing.'
                      : '.'}
                  </p>
                  <ul className="mt-3 space-y-0">
                    {milestones.map((m) => (
                      <li
                        key={m.day}
                        className={cn(
                          'flex gap-3 border-l-2 py-2.5 pl-3',
                          m.done ? 'border-brand-400' : 'border-bone-300',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 w-10 shrink-0 font-mono text-2xs tabular-nums',
                            m.done ? 'text-brand-600' : 'text-ink-400',
                          )}
                        >
                          d{m.day}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'flex items-center gap-1.5 text-sm font-medium',
                              m.done ? 'text-ink-500' : 'text-ink-800',
                            )}
                          >
                            {m.done && <Check className="h-3.5 w-3.5 text-brand-600" />}
                            {m.label}
                            <span className="font-normal text-2xs text-ink-400">
                              {formatDate(m.on)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{m.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <CollectionsClient breedingId={breeding.id} collections={breeding.collections} />
          </div>

          {/* ── Rail ───────────────────────────────────────────────── */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-2xs uppercase tracking-widest text-ink-400">Pairing</p>
                <div className="mt-2 space-y-2">
                  {[
                    { label: 'Dam', dog: breeding.dam },
                    { label: 'Sire', dog: breeding.sire },
                  ].map(({ label, dog }) => (
                    <Link
                      key={label}
                      href={`/dogs/${dog.slug}`}
                      className="block rounded-md px-2 py-1.5 hover:bg-bone-100"
                    >
                      <p className="text-2xs uppercase tracking-widest text-ink-400">{label}</p>
                      <p className="text-sm font-medium text-ink-800">{dog.callName}</p>
                      {dog.registeredName && (
                        <p className="text-2xs text-ink-400">{dog.registeredName}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {breeding.events.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-2xs uppercase tracking-widest text-ink-400">Breeding dates</p>
                  <ul className="mt-2 space-y-1.5">
                    {breeding.events.map((e) => (
                      <li key={e.id} className="text-sm text-ink-700">
                        {formatDate(e.occurredOn)}
                        <span className="ml-2 text-2xs text-ink-400">
                          {e.method.replace(/_/g, ' ').toLowerCase()}
                          {e.tieMinutes !== null ? ` · ${e.tieMinutes} min tie` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* The gate's last link: contract → breeding → litter. */}
            {breeding.contracts.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-2xs uppercase tracking-widest text-ink-400">Contracts</p>
                  <ul className="mt-2 space-y-2">
                    {breeding.contracts.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/contracts/${c.id}`}
                          className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-bone-100"
                        >
                          <FileSignature className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                          <span className="min-w-0">
                            <span className="block text-sm text-ink-800">{c.title}</span>
                            <Badge
                              tone={c.status === 'SIGNED' || c.status === 'COMPLETED' ? 'brand' : 'neutral'}
                              size="sm"
                            >
                              {c.status.replace(/_/g, ' ').toLowerCase()}
                            </Badge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {breeding.litter ? (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-2xs uppercase tracking-widest text-ink-400">Litter</p>
                  <Link
                    href={`/litters/${breeding.litter.id}`}
                    className="mt-1 flex items-center gap-2 font-display text-lg text-ink-900 hover:text-brand-600"
                  >
                    <PawPrint className="h-4 w-4" />
                    {breeding.litter.liveBorn ?? 0} live born
                  </Link>
                  {breeding.litter.whelpedOn && (
                    <p className="text-2xs text-ink-400">
                      whelped {formatDate(breeding.litter.whelpedOn)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : breeding.status === 'CONFIRMED_EMPTY' ? (
              <Alert tone="warning">
                Confirmed empty. If the contract grants a repeat service, claim it from the contract
                page — the right comes from the clause, not from a conversation.
              </Alert>
            ) : null}
          </div>
        </div>
      </StudioPage>
    </StudioShell>
  );
}
