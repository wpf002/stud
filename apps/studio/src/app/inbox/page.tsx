import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { LitterInquiryDto, StudInquiryDto } from '@/lib/types';
import { BuyerInquiries } from './buyer-inquiries';
import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, studs, buyers] = await Promise.all([
    searchParams,
    serverApiSafe<{ inquiries: StudInquiryDto[] }>('/studs/inquiries/inbox'),
    serverApiSafe<{ inquiries: LitterInquiryDto[] }>('/litters/inquiries/inbox'),
  ]);

  const studInquiries = studs?.inquiries ?? [];
  const buyerInquiries = buyers?.inquiries ?? [];
  const openStud = studInquiries.filter((i) => i.status === 'NEW').length;
  const openBuyer = buyerInquiries.filter((i) => i.status === 'NEW').length;
  const active = tab === 'buyers' ? 'buyers' : 'studs';

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Inbox"
        description="Stud inquiries arrive with the projected litter COI. Buyer enquiries arrive with the household details you would otherwise have to ask for."
        wide
      >
        {/*
          URL-backed, like the litter tabs. A breeder linking a colleague to
          "the buyer enquiries" should be able to send a URL that opens there.
        */}
        <Tabs value={active}>
          <TabsList>
            <TabsTrigger value="studs" asChild>
              <a href="?tab=studs">Stud Inquiries{openStud > 0 ? ` (${openStud})` : ''}</a>
            </TabsTrigger>
            <TabsTrigger value="buyers" asChild>
              <a href="?tab=buyers">Puppy Enquiries{openBuyer > 0 ? ` (${openBuyer})` : ''}</a>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="studs">
            <InboxClient initial={studInquiries} />
          </TabsContent>
          <TabsContent value="buyers">
            <BuyerInquiries initial={buyerInquiries} />
          </TabsContent>
        </Tabs>
      </StudioPage>
    </StudioShell>
  );
}
