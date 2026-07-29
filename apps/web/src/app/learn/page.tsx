import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@stud/ui';
import { GUIDES } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Learn',
  description:
    'Short, honest guides to health testing, contracts, registration and COI — from the people who built the checking.',
  alternates: { canonical: '/learn' },
};

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink-900">Learn</h1>
        <p className="mt-2 text-md leading-relaxed text-ink-600">
          The stuff you&rsquo;d want a knowledgeable friend to tell you. Short reads, no jargon,
          nothing sponsored.
        </p>
      </header>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Card interactive className="h-full overflow-hidden">
              <Link href={`/learn/${g.slug}`} className="block">
                <div className="relative aspect-[3/2] overflow-hidden">
                  <Image
                    src={g.photo}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-105"
                    sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw"
                  />
                </div>
                <div className="p-5">
                  <p className="font-display text-xl leading-tight text-ink-900">{g.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-500">
                    {g.description}
                  </p>
                  <p className="mt-3 text-2xs text-ink-400">{g.minutes} min read</p>
                </div>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
