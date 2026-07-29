import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { VerificationResponse } from '@/lib/types';
import { VerifyClient } from './verify-client';

export const dynamic = 'force-dynamic';

export default async function DogVerificationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await serverApiSafe<VerificationResponse>(`/dogs/${slug}/verification`);
  if (!data) notFound();

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={`${data.dog.callName} — verification`}
        description="Every claim, its source, and when we last checked it."
        wide
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/studio/dogs/${slug}`}>
              <ArrowLeft /> Back to dog
            </Link>
          </Button>
        }
      >
        <VerifyClient initial={data} dogId={data.dog.id} />
      </StudioPage>
    </StudioShell>
  );
}
