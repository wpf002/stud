import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogDetail, HeatsResponse } from '@/lib/types';
import { HeatsClient } from './heats-client';

export const dynamic = 'force-dynamic';

export default async function HeatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dogRes = await serverApiSafe<{ dog: DogDetail }>(`/dogs/${slug}`);
  if (!dogRes) notFound();

  const data = await serverApiSafe<HeatsResponse>(`/dogs/${dogRes.dog.id}/heats`);
  if (!data) notFound();

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={`${data.dog.callName} — heats`}
        description="Cycles, progesterone timing, and when to breed."
        wide
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dogs/${slug}`}>
              <ArrowLeft /> Back to dog
            </Link>
          </Button>
        }
      >
        <HeatsClient initial={data} dogId={dogRes.dog.id} />
      </StudioPage>
    </StudioShell>
  );
}
