import { CalendarHeart, Dog, PawPrint, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Stat } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';

/**
 * Phase 0 dashboard: the frame and the empty states. Live data lands in
 * Phase 3 once heats, breedings and litters exist.
 */
export default function DashboardPage() {
  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Today"
        description="Everything with a date attached, in one place."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dogs/new">Add a dog</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/litters/new">Start a litter</Link>
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Dogs" value="0" sub="Add your first dog to begin" icon={<Dog className="h-4 w-4" />} />
          <Stat
            label="Upcoming heats"
            value="—"
            sub="Log two cycles to get predictions"
            icon={<CalendarHeart className="h-4 w-4" />}
          />
          <Stat label="Litters on the ground" value="0" icon={<PawPrint className="h-4 w-4" />} />
          <Stat
            label="Verification"
            value="0/0"
            sub="Nothing submitted yet"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Next up</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<CalendarHeart className="h-5 w-5" />}
                title="Nothing scheduled"
                description="Heats, due dates, vaccination windows and pickup days all land here once you have a dog on file."
                action={
                  <Button asChild size="sm">
                    <Link href="/dogs/new">Add your first dog</Link>
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No applications"
                description="Applications, deposits and waitlist positions show up here."
              />
            </CardContent>
          </Card>
        </div>
      </StudioPage>
    </StudioShell>
  );
}
