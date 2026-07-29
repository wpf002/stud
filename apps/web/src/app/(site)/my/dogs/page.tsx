import { PawPrint, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, EmptyState, formatDate, formatDogAge } from '@stud/ui';
import { ownerGet, type MyDogRow } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your dogs',
  robots: { index: false, follow: false },
};

export default async function MyDogsPage() {
  const data = await ownerGet<{ dogs: MyDogRow[] }>('/my/dogs');

  if (data === 'UNAUTHORIZED') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <EmptyState
          title="Sign In to See Your Dogs"
          description="Every dog you have bought through Stud, with its pedigree, its parents' health testing and everything your contract asks of either side."
          action={
            <Link href="/login" className="text-sm text-brand-600 underline">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const dogs = data?.dogs ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink-900">Your Dogs</h1>

      {dogs.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<PawPrint className="h-5 w-5" />}
          title="No dogs yet"
          description="When you collect a puppy bought through Stud, its record appears here — already complete."
          action={
            <Link href="/puppies" className="text-sm text-brand-600 underline">
              Browse litters
            </Link>
          }
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {dogs.map((d) => (
            <li key={d.id}>
              <Card interactive>
                <Link href={`/my/dogs/${d.slug}`} className="block p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-2xl leading-tight text-ink-900">
                        {d.callName}
                      </p>
                      {d.registeredName && d.registeredName !== d.callName && (
                        <p className="text-sm text-ink-500">{d.registeredName}</p>
                      )}
                      <p className="mt-1 text-2xs uppercase tracking-widest text-ink-400">
                        {d.breed} · {d.sex === 'MALE' ? 'Dog' : 'Bitch'} ·{' '}
                        {formatDogAge(d.dateOfBirth)}
                      </p>
                    </div>
                    {d.puppyRecord?.litter.dam.kennel && (
                      <p className="text-2xs text-ink-400">
                        from {d.puppyRecord.litter.dam.kennel.name}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-bone-200 pt-2">
                    {d.sire && d.damRel && (
                      <span className="text-2xs text-ink-400">
                        {d.damRel.callName} × {d.sire.callName}
                      </span>
                    )}
                    {d.verificationSummary && d.verificationSummary.verifiedCount > 0 && (
                      <Badge tone="brand" size="sm">
                        <ShieldCheck /> {d.verificationSummary.verifiedCount} verified
                      </Badge>
                    )}
                    {d.healthEvents[0] && (
                      <span className="text-2xs text-ink-400">
                        last logged {formatDate(d.healthEvents[0].occurredOn)}
                      </span>
                    )}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
