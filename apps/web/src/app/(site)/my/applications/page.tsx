import { Check, Clock, FileSignature, PawPrint } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Alert, Badge, Card, CardContent, EmptyState, cn, formatDate, formatMoney, titleCase } from '@stud/ui';
import { API_URL } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Applications',
  robots: { index: false, follow: false },
};

/**
 * The buyer's view of where they stand.
 *
 * The single most valuable thing on this page is the pick position. A buyer
 * who knows they are third of five stops sending anxious emails, and a buyer
 * who does not know sends one a week. They see their own position and the size
 * of the queue — never who else is in it.
 */
interface MyApplication {
  id: string;
  stage: string;
  submittedAt: string;
  depositPaidAt: string | null;
  matchedAt: string | null;
  contract: { id: string; status: string; title: string } | null;
  matchedPuppy: { id: string; name: string | null; collarColor: string | null; sex: string } | null;
  pickup: { collectedOn: string; vetExamDueBy: string | null } | null;
  pick: { position: number; isNext: boolean; of: number } | null;
  litterListing: {
    slug: string;
    headline: string | null;
    depositCents: number | null;
    priceCentsFrom: number | null;
    goHomeFrom: string | null;
    litter: {
      whelpedOn: string | null;
      sire: { slug: string; callName: string };
      dam: { slug: string; callName: string };
    };
  };
}

/** What each stage means, said to the buyer rather than to the system. */
const STAGE_COPY: Record<string, { label: string; detail: string; tone: 'brand' | 'neutral' | 'warning' | 'danger' }> = {
  SUBMITTED: {
    label: 'With the breeder',
    detail: 'They have it. Most breeders reply within a week, and a good one reads every word.',
    tone: 'warning',
  },
  IN_REVIEW: {
    label: 'Being read',
    detail: 'The breeder has opened your application.',
    tone: 'warning',
  },
  APPROVED: {
    label: 'Approved',
    detail: 'They have accepted you. A deposit comes next, and it holds your place in the pick order.',
    tone: 'brand',
  },
  WAITLISTED: {
    label: 'On the waitlist',
    detail:
      'Approved, but there is no puppy for you in this litter yet. You may be moved up if a place opens, or offered a future litter.',
    tone: 'neutral',
  },
  DEPOSIT_PAID: {
    label: 'In the Pick Order',
    detail: 'Your deposit is held. You choose when it is your turn.',
    tone: 'brand',
  },
  MATCHED: {
    label: 'You have a puppy',
    detail: 'The contract and the balance come next.',
    tone: 'brand',
  },
  PAID_IN_FULL: {
    label: 'Paid in full',
    detail: 'Everything is settled. All that is left is collection day.',
    tone: 'brand',
  },
  COMPLETED: { label: 'Home', detail: 'They are yours.', tone: 'brand' },
  DECLINED: {
    label: 'Not this time',
    detail: 'The breeder did not take this one forward. Any deposit has been returned.',
    tone: 'danger',
  },
  WITHDRAWN: { label: 'Withdrawn', detail: 'You withdrew this application.', tone: 'neutral' },
};

export default async function MyApplicationsPage() {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/v1/my/applications`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (res.status === 401) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <EmptyState
          title="Sign In to See Your Applications"
          description="Your applications, your place in each breeder's pick order, and your contracts all live here."
          action={
            <Link
              href="/login"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm text-bone-50 hover:bg-brand-700"
            >
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const data = res.ok ? ((await res.json()) as { applications: MyApplication[] }) : null;
  const applications = data?.applications ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink-900">
        Your Applications
      </h1>

      {applications.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<PawPrint className="h-5 w-5" />}
          title="Nothing yet"
          description="When you apply for a puppy it appears here, with where you are in the breeder's pick order."
          action={
            <Link href="/puppies" className="text-sm text-brand-600 underline">
              Browse litters
            </Link>
          }
        />
      ) : (
        <ul className="mt-6 space-y-4">
          {applications.map((a) => {
            const copy = STAGE_COPY[a.stage] ?? {
              label: titleCase(a.stage),
              detail: '',
              tone: 'neutral' as const,
            };
            const l = a.litterListing;
            return (
              <li key={a.id}>
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/puppies/${l.slug}`}
                          className="font-display text-xl leading-tight text-ink-900 hover:text-brand-600"
                        >
                          {l.headline ?? `${l.litter.dam.callName} × ${l.litter.sire.callName}`}
                        </Link>
                        <p className="mt-0.5 text-2xs text-ink-400">
                          Applied {formatDate(a.submittedAt)}
                        </p>
                      </div>
                      <Badge tone={copy.tone}>{copy.label}</Badge>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-ink-600">{copy.detail}</p>

                    {/* The number that stops the anxious emails. */}
                    {a.pick && a.stage === 'DEPOSIT_PAID' && (
                      <div className="mt-4 rounded-md bg-brand-50 px-4 py-3 ring-1 ring-inset ring-brand-100">
                        <p className="font-display text-2xl text-ink-900">
                          {a.pick.isNext ? 'Your turn to choose' : `Pick ${a.pick.position}`}
                          <span className="ml-2 font-sans text-sm font-normal text-ink-500">
                            of {a.pick.of} waiting
                          </span>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-600">
                          {a.pick.isNext
                            ? 'The breeder will be in touch to walk you through the puppies.'
                            : 'Order is set by when each deposit was received, unless the breeder has promised somebody a place.'}
                        </p>
                      </div>
                    )}

                    {a.matchedPuppy && (
                      <p className="mt-3 flex items-center gap-2 text-sm text-ink-800">
                        <PawPrint className="h-4 w-4 text-brand-600" />
                        <span className="font-medium">
                          {a.matchedPuppy.name ?? a.matchedPuppy.collarColor}
                        </span>
                        <span className="text-ink-400">
                          {titleCase(a.matchedPuppy.sex)}
                          {a.matchedAt ? ` · matched ${formatDate(a.matchedAt)}` : ''}
                        </span>
                      </p>
                    )}

                    {/* Progress, as the buyer experiences it. */}
                    <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-bone-200 pt-3 text-2xs">
                      {[
                        ['Applied', true],
                        ['Approved', Boolean(a.depositPaidAt) || ['APPROVED', 'DEPOSIT_PAID', 'MATCHED', 'PAID_IN_FULL', 'COMPLETED'].includes(a.stage)],
                        ['Deposit', Boolean(a.depositPaidAt)],
                        ['Puppy chosen', Boolean(a.matchedAt)],
                        ['Paid in full', ['PAID_IN_FULL', 'COMPLETED'].includes(a.stage)],
                        ['Home', a.stage === 'COMPLETED'],
                      ].map(([label, done]) => (
                        <li
                          key={String(label)}
                          className={cn(
                            'flex items-center gap-1',
                            done ? 'text-brand-700' : 'text-ink-300',
                          )}
                        >
                          {done ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {label}
                        </li>
                      ))}
                    </ol>

                    {a.contract && (
                      <p className="mt-3 flex items-center gap-2 text-sm">
                        <FileSignature className="h-4 w-4 text-ink-400" />
                        {a.contract.status === 'SIGNED' ? (
                          <span className="text-ink-600">Contract signed by both of you.</span>
                        ) : (
                          <span className="text-ink-800">
                            Your contract is waiting for a signature.
                          </span>
                        )}
                      </p>
                    )}

                    {a.pickup && (
                      <Alert tone="success" className="mt-3">
                        Collected {formatDate(a.pickup.collectedOn)}.
                        {a.pickup.vetExamDueBy && (
                          <>
                            {' '}
                            Your own vet check is due by {formatDate(a.pickup.vetExamDueBy)} — that
                            is the window your contract's health guarantee sets, and missing it can
                            cost you the guarantee.
                          </>
                        )}
                      </Alert>
                    )}

                    {a.stage === 'APPROVED' && l.depositCents && (
                      <p className="mt-3 text-2xs text-ink-400">
                        Deposit {formatMoney(l.depositCents)}
                        {l.priceCentsFrom ? ` of ${formatMoney(l.priceCentsFrom)}` : ''}
                        {l.goHomeFrom ? ` · home from ${formatDate(l.goHomeFrom)}` : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
