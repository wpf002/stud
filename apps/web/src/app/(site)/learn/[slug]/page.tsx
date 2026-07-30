import { ArrowLeft, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, GUIDES_BY_SLUG } from '@/lib/guides';
import { siteUrl } from '@/lib/site-url';

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
    openGraph: {
      type: 'article',
      title: guide.title,
      description: guide.description,
      images: [guide.photo],
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = GUIDES_BY_SLUG.get(slug);
  if (!guide) notFound();

  const site = siteUrl();

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
            image: guide.photo,
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
        <ArrowLeft className="h-3 w-3" /> All Guides
      </Link>

      <article>
        <h1 className="font-display text-4xl leading-[1.08] tracking-tight text-ink-900">
          {guide.title}
        </h1>
        <p className="mt-3 text-md leading-relaxed text-ink-500">{guide.description}</p>
        <p className="mt-2 text-2xs text-ink-400">{guide.minutes} min read</p>

        <div className="relative mt-6 aspect-[2/1] overflow-hidden rounded-card">
          <Image
            src={guide.photo}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 42rem, 100vw"
          />
        </div>

        <div className="mt-8 space-y-7">
          {guide.body.map((section, i) => (
            <section key={i}>
              {section.heading && (
                <h2 className="font-display text-2xl text-ink-900">{section.heading}</h2>
              )}
              {section.paragraphs?.map((p, j) => (
                <p key={j} className="mt-3 text-md leading-relaxed text-ink-700">
                  {p}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 space-y-2.5">
                  {section.list.map((item, j) => (
                    <li key={j} className="flex gap-2.5 text-md leading-relaxed text-ink-700">
                      <Check className="mt-1.5 h-4 w-4 shrink-0 text-clay-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-card bg-brand-50 px-5 py-4 ring-1 ring-inset ring-brand-100">
          <p className="text-sm leading-relaxed text-ink-700">
            <span className="font-semibold text-ink-900">See it with real dogs.</span> Every litter
            on Stud shows both parents&rsquo; checked health tests, what&rsquo;s missing, and the
            COI.
          </p>
          <Link
            href="/puppies"
            className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Browse Litters →
          </Link>
        </div>
      </article>
    </div>
  );
}
