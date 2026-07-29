import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import { ImportClient } from './import-client';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const kennels = await serverApiSafe<{ kennels: { id: string; name: string }[] }>('/kennels/mine');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Import a pedigree"
        description="Paste it off a registry page or drop in a spreadsheet. Nothing is written until you commit."
        wide
      >
        <ImportClient kennelId={kennels?.kennels[0]?.id} />
      </StudioPage>
    </StudioShell>
  );
}
