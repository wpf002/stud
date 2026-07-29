import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, formatDate } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { ApplicationDetailResponse } from '@/lib/types';
import { ApplicationClient } from './application-client';

export const dynamic = 'force-dynamic';

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverApiSafe<ApplicationDetailResponse>(`/applications/${id}`);
  if (!data) notFound();

  const { application } = data;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={application.name}
        description={`Applied ${formatDate(application.submittedAt)} for ${application.litterListing.litter.dam.callName} × ${application.litterListing.litter.sire.callName}`}
        wide
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/studio/buyers">
              <ArrowLeft /> All Buyers
            </Link>
          </Button>
        }
      >
        <ApplicationClient initial={data} />
      </StudioPage>
    </StudioShell>
  );
}
