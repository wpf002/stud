import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogSummary } from '@/lib/types';
import { StudsClient } from './studs-client';

export const dynamic = 'force-dynamic';

export default async function StudsPage() {
  const data = await serverApiSafe<{ dogs: DogSummary[] }>('/dogs?mine=true&take=100');
  const dams = (data?.dogs ?? []).filter((d) => d.sex === 'FEMALE');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Stud directory"
        description="Filter by what has been verified, not by what has been claimed."
        wide
      >
        <StudsClient dams={dams} />
      </StudioPage>
    </StudioShell>
  );
}
