import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { StudInquiryDto } from '@/lib/types';
import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const data = await serverApiSafe<{ inquiries: StudInquiryDto[] }>('/studs/inquiries/inbox');
  const inquiries = data?.inquiries ?? [];
  const open = inquiries.filter((i) => i.status === 'NEW').length;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Stud inquiries"
        description={
          open > 0
            ? `${open} new. Each one arrives with the bitch's verified health and the projected litter COI.`
            : "Each inquiry arrives with the bitch's verified health and the projected litter COI."
        }
        wide
      >
        <InboxClient initial={inquiries} />
      </StudioPage>
    </StudioShell>
  );
}
