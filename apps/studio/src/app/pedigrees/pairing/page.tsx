import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogSummary } from '@/lib/types';
import { PairingClient } from './pairing-client';

export const dynamic = 'force-dynamic';

export default async function PairingPage({
  searchParams,
}: {
  searchParams: Promise<{ sireId?: string; damId?: string }>;
}) {
  const { sireId, damId } = await searchParams;
  const data = await serverApiSafe<{ dogs: DogSummary[] }>('/dogs?mine=true&take=100');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Trial pairing"
        description="Model a litter before you commit to it. No breeding, no contract, no dog required."
        wide
      >
        <PairingClient
          dogs={data?.dogs ?? []}
          initialSireId={sireId || undefined}
          initialDamId={damId || undefined}
        />
      </StudioPage>
    </StudioShell>
  );
}
