import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import { ConflictQueue, type ConflictClaim } from '../dogs/[slug]/verification/verify-client';

export const dynamic = 'force-dynamic';

export default async function ConflictQueuePage() {
  const data = await serverApiSafe<{ claims: ConflictClaim[] }>('/verification/conflicts');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Verification Conflicts"
        description="A source changed its mind. Someone has to decide which record stands."
        wide
      >
        {data === null ? (
          <p className="rounded-card border border-dashed border-bone-400 bg-bone-100/60 px-6 py-10 text-center text-sm text-ink-500">
            The conflict queue is admin-only. Sign in as admin@stud.dev to review it.
          </p>
        ) : (
          <ConflictQueue initial={data.claims} />
        )}
      </StudioPage>
    </StudioShell>
  );
}
