import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@stud/ui';
import { GUIDES } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Learn — buying and breeding with the receipts',
  description:
    'Plain-language guides to health testing, contracts, registration and COI — written by the people who built the verification.',
  alternates: { canonical: '/learn' },
};

export default function LearnPage() {
  const buyers = GUIDES.filter((g) => g.audience === 'BUYER');
  const breeders = GUIDES.filter((g) => g.audience === 'BREEDER');

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          Learn
        </h1>
        <p className="mt-3 text-md leading-relaxed text-ink-600">
          The questions people actually type into a search bar at eleven at night, answered
          plainly. No affiliate links, nothing sponsored — the product this funds is the one that
          checks the claims these guides teach you to ask about.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
          For buyers
        </h2>
        <ul className="mt-3 grid gap-4 md:grid-cols-2">
          {buyers.map((g) => (
            <li key={g.slug}>
              <Card interactive className="h-full">
                <Link href={`/learn/${g.slug}`} className="block p-5">
                  <BookOpen className="h-4 w-4 text-clay-500" />
                  <p className="mt-2 font-display text-xl leading-tight text-ink-900">{g.title}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">
                    {g.description}
                  </p>
                  <p className="mt-3 text-2xs text-ink-400">{g.minutes} min read</p>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {breeders.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            For breeders
          </h2>
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {breeders.map((g) => (
              <li key={g.slug}>
                <Card interactive className="h-full">
                  <Link href={`/learn/${g.slug}`} className="block p-5">
                    <BookOpen className="h-4 w-4 text-clay-500" />
                    <p className="mt-2 font-display text-xl leading-tight text-ink-900">
                      {g.title}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">
                      {g.description}
                    </p>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
