import { CalendarHeart } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, EmptyState, formatDate } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { BreedingDto } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'brand' | 'neutral' | 'warning' | 'danger'> = {
  PLANNED: 'neutral',
  BRED: 'warning',
  CONFIRMED_PREGNANT: 'brand',
  WHELPED: 'brand',
  CONFIRMED_EMPTY: 'danger',
  ABANDONED: 'danger',
};

export default async function BreedingsPage() {
  const data = await serverApiSafe<{ breedings: BreedingDto[] }>('/breedings');
  const breedings = data?.breedings ?? [];

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Breedings"
        description="Planned, bred, and in gestation. Start a heat from the dam's record."
        wide
      >
        {breedings.length === 0 ? (
          <EmptyState
            icon={<CalendarHeart className="h-5 w-5" />}
            title="No breedings on record"
            description="Start a heat on the dam\u2019s page and breeding timing follows her progesterone."
          />
        ) : (
          <div className="space-y-3">
            {breedings.map((b) => (
              <Card key={b.id} interactive>
                <Link href={`/breedings/${b.id}`} className="block p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg leading-tight text-ink-900">
                        {b.dam.callName} × {b.sire.callName}
                      </p>
                      <p className="mt-0.5 text-2xs uppercase tracking-widest text-ink-400">
                        {b.method.replace(/_/g, ' ').toLowerCase()}
                        {b.events.length > 0 &&
                          ` · bred ${formatDate(b.events[b.events.length - 1]!.occurredOn)}`}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[b.status] ?? 'neutral'} size="sm">
                      {b.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </div>

                  {/* The number a breeder is actually looking for. */}
                  <p className="mt-3 border-t border-bone-200 pt-2 text-sm text-ink-600">
                    {b.litter ? (
                      <>
                        Whelped {b.litter.whelpedOn ? formatDate(b.litter.whelpedOn) : ''} —{' '}
                        {b.litter.liveBorn ?? 0} live born
                      </>
                    ) : b.forecast.dueOn ? (
                      <>
                        Due {formatDate(b.forecast.dueOn)}
                        {b.forecast.daysAway !== null && b.forecast.daysAway >= 0
                          ? ` · ${b.forecast.daysAway} days away`
                          : ''}
                        <span className="ml-2 text-2xs text-ink-400">
                          from {b.forecast.basis.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-400">{b.forecast.note}</span>
                    )}
                  </p>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </StudioPage>
    </StudioShell>
  );
}
