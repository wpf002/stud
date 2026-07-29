import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { ContractDetailResponse, PaymentsResponse } from '@/lib/types';
import { ContractClient } from './contract-client';

export const dynamic = 'force-dynamic';

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, payments] = await Promise.all([
    serverApiSafe<ContractDetailResponse>(`/contracts/${id}`),
    serverApiSafe<PaymentsResponse>(`/contracts/${id}/payments`),
  ]);
  if (!data) notFound();

  const parties = data.contract.parties.map((p) => p.legalName).join(' and ');

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={data.contract.title}
        description={parties}
        wide
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/studio/contracts">
              <ArrowLeft /> All Contracts
            </Link>
          </Button>
        }
      >
        <ContractClient initial={data} payments={payments} />
      </StudioPage>
    </StudioShell>
  );
}
