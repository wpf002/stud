import { PawPrint } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, EmptyState, formatDate, relativeTime } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogRef, LitterMilestonesDto } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface LitterRow {
  id: string;
  name: string | null;
  letter: string | null;
  status: string;
  expectedWhelpOn: string | null;
  whelpedOn: string | null;
  sire: DogRef;
  dam: DogRef;
  puppies: { id: string; sex: string; status: string }[];
  milestones: LitterMilestonesDto | null;
}

export default async function LittersPage() {
  const data = await serverApiSafe<{ litters: LitterRow[] }>('/litters');
  const litters = data?.litters ?? [];

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage title="Litters" description={`${litters.length} on file`} wide>
        {litters.length === 0 ? (
          <EmptyState
            icon={<PawPrint className="h-5 w-5" />}
            title="No litters yet"
            description="Confirm a pregnancy on a breeding and the litter appears here, with its whelp countdown and care schedule ready."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {litters.map((l) => (
              <Card key={l.id} interactive>
                <Link href={`/litters/${l.id}`} className="block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg leading-tight text-ink-900">
                      {l.letter ? `${l.letter} litter` : (l.name ?? 'Litter')}
                    </p>
                    <Badge tone={l.status === 'ON_THE_GROUND' ? 'brand' : 'neutral'} size="sm">
                      {l.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {l.dam.callName} × {l.sire.callName}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-bone-200 pt-3">
                    <div>
                      <p className="text-2xs uppercase tracking-widest text-ink-400">
                        {l.whelpedOn ? 'Age' : 'Due'}
                      </p>
                      <p className="font-mono text-md tabular-nums text-ink-800">
                        {l.whelpedOn
                          ? `${l.milestones?.ageDays ?? 0}d`
                          : l.expectedWhelpOn
                            ? relativeTime(l.expectedWhelpOn)
                            : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xs uppercase tracking-widest text-ink-400">Puppies</p>
                      <p className="font-mono text-md tabular-nums text-ink-800">
                        {l.puppies.length || '—'}
                      </p>
                    </div>
                  </div>
                  {l.whelpedOn && (
                    <p className="mt-2 text-2xs text-ink-400">Whelped {formatDate(l.whelpedOn)}</p>
                  )}
                </Link>
              </Card>
            ))}
          </div>
        )}
      </StudioPage>
    </StudioShell>
  );
}
