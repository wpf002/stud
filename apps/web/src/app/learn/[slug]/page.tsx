import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, GUIDES_BY_SLUG } from '@/lib/guides';

/** Static: the guides are code, so the pages can be fully prerendered. */
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDES_BY_SLUG.get(slug);
  if (!guide) return { title: 'Guide not found' };
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/learn/${guide.slug}` },
    openGraph: { type: 'article', title: guide.title, description: guide.description },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = GUIDES_BY_SLUG.get(slug);
  if (!guide) notFound();

  const site = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.description,
            dateModified: guide.updated,
            author: { '@type': 'Organization', name: 'Stud' },
            mainEntityOfPage: `${site}/learn/${guide.slug}`,
          }).replace(/</g, '\\u003c'),
        }}
      />

      <Link
        href="/learn"
        className="mb-6 inline-flex items-center gap-1.5 text-2xs text-ink-400 hover:text-brand-600"
      >
        <ArrowLeft className="h-3 w-3" /> All guides
      </Link>

      <article>
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          {guide.title}
        </h1>
        <p className="mt-3 text-md leading-relaxed text-ink-500">{guide.description}</p>
        <p className="mt-2 text-2xs text-ink-400">
          {guide.minutes} min read · updated {guide.updated}
        </p>

        <div className="prose-stud mt-8 space-y-6">
          {guide.body.map((section, i) => (
            <section key={i}>
              {section.heading && (
                <h2 className="font-display text-2xl text-ink-900">{section.heading}</h2>
              )}
              {section.paragraphs.map((p, j) => (
                <p key={j} className="mt-3 text-md leading-relaxed text-ink-700">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-card bg-brand-50 px-5 py-4 ring-1 ring-inset ring-brand-100">
          <p className="text-sm leading-relaxed text-ink-700">
            <span className="font-semibold text-ink-900">See it with real dogs.</span> Every litter
            on Stud shows both parents&rsquo; verified testing, what is missing, and the projected
            COI — checked at the source, not typed by the seller.
          </p>
          <Link
            href="/puppies"
            className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Browse litters →
          </Link>
        </div>
      </article>
    </div>
  );
}
