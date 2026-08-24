import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { StudBookingDto } from '@/lib/types';
import { BookingsClient } from './bookings-client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Bookings' };

export default async function BookingsPage() {
  const [inbox, mine] = await Promise.all([
    serverApiSafe<{ bookings: StudBookingDto[] }>('/studs/bookings/inbox'),
    serverApiSafe<{ bookings: StudBookingDto[] }>('/studs/bookings/mine'),
  ]);

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Bookings"
        description="A booking is a window, not a date — the fertile days inside it are found by progesterone. Accepting takes the deposit and marks the stud booked through that window."
        wide
      >
        <BookingsClient incoming={inbox?.bookings ?? []} outgoing={mine?.bookings ?? []} />
      </StudioPage>
    </StudioShell>
  );
}
