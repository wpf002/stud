import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogSummary } from '@/lib/types';
import { NewDogForm } from './new-dog-form';

export const dynamic = 'force-dynamic';

export default async function NewDogPage() {
  const [dogs, kennels] = await Promise.all([
    serverApiSafe<{ dogs: DogSummary[] }>('/dogs?mine=true&take=100&includeStubs=true'),
    serverApiSafe<{ kennels: { id: string; name: string }[] }>('/kennels/mine'),
  ]);

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Add a Dog"
        description="Identity first. Health results and titles get verified in Phase 2 — they are never typed in here."
      >
        <div className="max-w-3xl">
          <NewDogForm dogs={dogs?.dogs ?? []} kennelId={kennels?.kennels[0]?.id} />
        </div>
      </StudioPage>
    </StudioShell>
  );
}
