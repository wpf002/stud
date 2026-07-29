import { Users } from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  cn,
  formatMoney,
  relativeTime,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { ApplicationDto, PipelineResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The pipeline, as columns.
 *
 * Ordered left to right the way the process actually runs, so a breeder can
 * see where everything is at a glance and what is waiting on them. Declined
 * and withdrawn get their own column at the end rather than disappearing —
 * a buyer you said no to is still someone who might come back for the next
 * litter, and the reason you gave is worth keeping.
 */
const COLUMNS: { stages: ApplicationDto['stage'][]; title: string; hint: string }[] = [
  { stages: ['SUBMITTED', 'IN_REVIEW'], title: 'To review', hint: 'Waiting on you.' },
  { stages: ['APPROVED', 'WAITLISTED'], title: 'Approved', hint: 'Cleared, no deposit yet.' },
  { stages: ['DEPOSIT_PAID'], title: 'In the pick order', hint: 'Deposit down, choosing soon.' },
  { stages: ['MATCHED', 'PAID_IN_FULL'], title: 'Matched', hint: 'Has a puppy.' },
  { stages: ['COMPLETED'], title: 'Home', hint: 'Collected.' },
  { stages: ['DECLINED', 'WITHDRAWN'], title: 'Closed', hint: 'Kept for the record.' },
];

export default async function BuyersPage() {
  const data = await serverApiSafe<PipelineResponse>('/applications');
  const applications = data?.applications ?? [];
  const needsYou = applications.filter(
    (a) => a.stage === 'SUBMITTED' || a.stage === 'IN_REVIEW',
  ).length;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Buyers"
        description={
          needsYou > 0
            ? `${needsYou} application${needsYou === 1 ? '' : 's'} waiting on you. Every one arrives with the household answers already filled in.`
            : 'Applications from first contact to the day the dog goes home.'
        }
        wide
      >
        {applications.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No applications yet"
            description="Publish a litter and applications land here. Each one carries the household details, the vet, and what they want the dog for — so the first thing you do is decide, not ask."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {COLUMNS.map((col) => {
              const rows = applications.filter((a) => col.stages.includes(a.stage));
              return (
                <section key={col.title} className="min-w-0">
                  <header className="mb-2">
                    <h2 className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink-800">
                      {col.title}
                      <span className="font-mono text-2xs tabular-nums text-ink-400">
                        {rows.length}
                      </span>
                    </h2>
                    <p className="text-2xs text-ink-400">{col.hint}</p>
                  </header>

                  <ul className="space-y-2">
                    {rows.map((a) => (
                      <li key={a.id}>
                        <ApplicationCard application={a} />
                      </li>
                    ))}
                    {rows.length === 0 && (
                      <li className="rounded-md border border-dashed border-bone-300 px-3 py-4 text-center text-2xs text-ink-300">
                        Nothing here
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </StudioPage>
    </StudioShell>
  );
}

function ApplicationCard({ application: a }: { application: ApplicationDto }) {
  const closed = a.stage === 'DECLINED' || a.stage === 'WITHDRAWN';

  return (
    <Card interactive className={cn(closed && 'opacity-70')}>
      <Link href={`/buyers/${a.id}`} className="block p-3">
        <p className="font-display text-md leading-tight text-ink-900">{a.name}</p>
        <p className="mt-0.5 text-2xs text-ink-400">
          {[a.city, a.region].filter(Boolean).join(', ') || a.email}
        </p>

        {/* The one number a breeder wants without opening anything. */}
        {a.pick && (
          <p className="mt-2">
            <Badge tone={a.pick.isNext ? 'brand' : 'neutral'} size="sm">
              pick #{a.pick.position}
              {a.pick.isNext ? ' · next' : ''}
            </Badge>
          </p>
        )}

        {a.matchedPuppy && (
          <p className="mt-2 text-2xs text-ink-600">
            {a.matchedPuppy.name ?? a.matchedPuppy.collarColor} ·{' '}
            {a.matchedPuppy.sex.toLowerCase()}
          </p>
        )}

        <p className="mt-2 border-t border-bone-200 pt-1.5 text-2xs text-ink-400">
          {a.litterListing.litter.dam.callName} × {a.litterListing.litter.sire.callName}
        </p>
        <p className="text-2xs text-ink-400">
          {a.depositPaidAt && a.litterListing.depositCents
            ? `${formatMoney(a.litterListing.depositCents, { compact: true })} down · `
            : ''}
          {relativeTime(a.submittedAt)}
        </p>
      </Link>
    </Card>
  );
}
