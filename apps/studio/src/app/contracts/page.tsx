import { FileSignature, Plus } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, EmptyState, formatDateTime, formatMoney } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { ContractRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const data = await serverApiSafe<{ contracts: ContractRow[] }>('/contracts');
  const contracts = data?.contracts ?? [];

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Contracts"
        description="Stud service, co-ownership and repeat-breeding agreements."
        wide
        actions={
          <Button size="sm" asChild>
            <Link href="/contracts/new">
              <Plus /> New contract
            </Link>
          </Button>
        }
      >
        {contracts.length === 0 ? (
          <EmptyState
            icon={<FileSignature className="h-5 w-5" />}
            title="No contracts yet"
            description="Start one from an accepted stud inquiry, or from a breeding. The health schedule attaches itself from the verified record — nobody re-types a test result."
            action={
              <Button asChild>
                <Link href="/contracts/new">
                  <Plus /> New contract
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {contracts.map((c) => {
              const signed = c.signatures.length;
              const needed = c.parties.filter((p) => p.mustSign).length;
              return (
                <Card key={c.id} interactive>
                  <Link href={`/contracts/${c.id}`} className="block p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg leading-tight text-ink-900">{c.title}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {c.parties.map((p) => p.legalName).join(' and ')}
                        </p>
                        {c.sire && c.dam && (
                          <p className="mt-0.5 text-2xs text-ink-400">
                            {c.dam.callName} × {c.sire.callName}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {c.schedule && (
                          <p className="font-display text-lg text-ink-900">
                            {formatMoney(c.schedule.totalCents, { compact: true })}
                          </p>
                        )}
                        <Badge
                          tone={c.status === 'SIGNED' || c.status === 'COMPLETED' ? 'brand' : 'neutral'}
                          size="sm"
                        >
                          {c.status.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-3 border-t border-bone-200 pt-2 text-2xs text-ink-400">
                      {signed} of {needed} signatures · updated {formatDateTime(c.updatedAt)}
                    </p>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </StudioPage>
    </StudioShell>
  );
}
