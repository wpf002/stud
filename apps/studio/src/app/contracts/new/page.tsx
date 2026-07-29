import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { TemplatesResponse } from '@/lib/types';
import { NewContractClient } from './new-contract-client';

export const dynamic = 'force-dynamic';

interface DogRow {
  id: string;
  callName: string;
  sex: 'MALE' | 'FEMALE';
  registrations?: { registry: string; number: string }[];
}

export default async function NewContractPage() {
  const [templates, dogs] = await Promise.all([
    serverApiSafe<TemplatesResponse>('/contracts/templates'),
    serverApiSafe<{ dogs: DogRow[] }>('/dogs?limit=100'),
  ]);
  if (!templates) notFound();

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="New Contract"
        description="Draft it here, freeze it on send, and both parties sign the same text."
        wide
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contracts">
              <ArrowLeft /> Cancel
            </Link>
          </Button>
        }
      >
        <NewContractClient
          templates={templates}
          dogs={(dogs?.dogs ?? []).map((d) => ({
            id: d.id,
            callName: d.callName,
            sex: d.sex,
            registrations: d.registrations ?? [],
          }))}
        />
      </StudioPage>
    </StudioShell>
  );
}
