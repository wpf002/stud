import { AlertTriangle, Heart, PawPrint } from 'lucide-react';
import { Alert, Badge, Card, CardContent, EmptyState, Stat, formatDate, formatDogAge, titleCase } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { PlacedDogsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * What happened to the puppies.
 *
 * A breeding program only improves if what happened to the dogs it produced
 * comes back to it. Owners share by default and can turn it off for anything;
 * what is here is only what they chose to share.
 */
export default async function PlacedDogsPage() {
  const kennels = await serverApiSafe<{ kennels: { id: string; name: string }[] }>('/kennels');
  const kennelId = kennels?.kennels[0]?.id;
  const data = kennelId
    ? await serverApiSafe<PlacedDogsResponse>(`/kennels/${kennelId}/placed-dogs`)
    : null;

  const dogs = data?.dogs ?? [];
  const summary = data?.summary;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Dogs You Bred"
        description="Where they went, and what their owners have chosen to tell you."
        wide
      >
        {dogs.length === 0 ? (
          <EmptyState
            icon={<PawPrint className="h-5 w-5" />}
            title="No placed dogs yet"
            description="When a puppy goes home its record becomes the owner's, and anything they log — vet visits, a diagnosis, a weight — appears here if they share it."
          />
        ) : (
          <div className="space-y-5">
            {summary && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Dogs placed" value={String(summary.placed)} />
                <Stat
                  label="Owners logging"
                  value={`${summary.withSharedEvents} of ${summary.placed}`}
                  sub="sharing at least one event"
                />
                <Stat
                  label="Guarantee-relevant"
                  value={String(summary.guaranteeRelevant)}
                  tone={summary.guaranteeRelevant > 0 ? 'warning' : 'neutral'}
                />
              </div>
            )}

            {summary && summary.guaranteeRelevant > 0 && (
              <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
                {summary.guaranteeRelevant} event
                {summary.guaranteeRelevant === 1 ? ' has' : 's have'} been flagged as bearing on a
                health guarantee. Worth reading before the owner has to chase you.
              </Alert>
            )}

            <ul className="space-y-3">
              {dogs.map((d) => {
                const owner = d.ownerships[0]?.user;
                return (
                  <li key={d.id}>
                    <Card>
                      <CardContent className="pt-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-lg text-ink-900">{d.callName}</p>
                            <p className="mt-0.5 text-2xs uppercase tracking-widest text-ink-400">
                              {d.sex === 'MALE' ? 'Dog' : 'Bitch'} · {formatDogAge(d.dateOfBirth)}
                              {d.puppyRecord?.litter.letter
                                ? ` · ${d.puppyRecord.litter.letter} litter`
                                : ''}
                            </p>
                          </div>
                          {owner && (
                            <p className="text-2xs text-ink-400">
                              with {owner.name ?? owner.displayName ?? owner.email}
                            </p>
                          )}
                        </div>

                        {d.healthEvents.length === 0 ? (
                          <p className="mt-3 border-t border-bone-200 pt-2 text-2xs text-ink-400">
                            Nothing shared yet. No news is usually good news.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-1.5 border-t border-bone-200 pt-3">
                            {d.healthEvents.map((e) => (
                              <li key={e.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                                <span className="font-mono text-2xs tabular-nums text-ink-400">
                                  {formatDate(e.occurredOn)}
                                </span>
                                <span className="text-ink-800">{e.title}</span>
                                <Badge tone="neutral" size="sm">
                                  {titleCase(e.kind)}
                                </Badge>
                                {e.guaranteeRelevant && (
                                  <Badge tone="warning" size="sm">
                                    <Heart /> Guarantee
                                  </Badge>
                                )}
                                {e.detail && (
                                  <span className="w-full text-xs leading-relaxed text-ink-500">
                                    {e.detail}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>

            <p className="text-2xs leading-relaxed text-ink-400">
              Owners choose what to share — this is what they wanted you to know.
            </p>
          </div>
        )}
      </StudioPage>
    </StudioShell>
  );
}
