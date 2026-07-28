import { notFound } from 'next/navigation';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { LitterDetailResponse } from '@/lib/types';
import { LitterClient } from './litter-client';

export const dynamic = 'force-dynamic';

export default async function LitterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverApiSafe<LitterDetailResponse>(`/litters/${id}`);
  if (!data) notFound();

  const { litter } = data;
  const title = litter.letter ? `${litter.letter} litter` : (litter.name ?? 'Litter');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={title}
        description={`${litter.dam.callName} × ${litter.sire.callName}`}
        wide
      >
        <LitterClient initial={data} />
      </StudioPage>
    </StudioShell>
  );
}
