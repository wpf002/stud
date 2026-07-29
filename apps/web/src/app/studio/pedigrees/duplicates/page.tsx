import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { MergeCandidate } from '@/lib/types';
import { DuplicatesClient } from './duplicates-client';

export const dynamic = 'force-dynamic';

export default async function DuplicatesPage() {
  const data = await serverApiSafe<{ candidates: MergeCandidate[] }>('/dogs/duplicates?status=OPEN');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage title="Duplicate ancestors" description="Keep the graph clean, keep the COI honest." wide>
        <DuplicatesClient initial={data?.candidates ?? []} />
      </StudioPage>
    </StudioShell>
  );
}
