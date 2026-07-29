import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLitterPage } from '@/lib/marketplace';
import { FunnelBeacon } from '@/components/funnel-beacon';
import { ApplyClient } from './apply-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadLitterPage(slug);
  return {
    title: data ? `Apply — ${data.dam.callName} × ${data.sire.callName}` : 'Apply',
    // An application form has nothing to rank for and should not compete with
    // the litter page it belongs to.
    robots: { index: false, follow: true },
  };
}

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadLitterPage(slug);
  if (!data) notFound();

  const { listing, sire, dam, kennel } = data;
  const litterName = listing.headline ?? `${dam.callName} × ${sire.callName}`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <FunnelBeacon step="APPLY_STARTED" slug={listing.slug} />
      <Link
        href={`/puppies/${listing.slug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-2xs text-ink-400 hover:text-brand-600"
      >
        <ArrowLeft className="h-3 w-3" /> Back to the Litter
      </Link>

      <header className="mb-6">
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
          {kennel?.name ?? 'Application'}
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight text-ink-900">
          Apply for a puppy from {litterName}
        </h1>
        <p className="mt-2 text-md leading-relaxed text-ink-600">
          This goes straight to the breeder. They are placing a dog for the next fifteen years, so
          the questions are longer than a contact form — answering them properly is most of what
          separates an application that gets read from one that does not.
        </p>
      </header>

      <ApplyClient
        slug={listing.slug}
        litterName={litterName}
        depositCents={listing.depositCents}
        signedInEmail={null}
      />
    </div>
  );
}
