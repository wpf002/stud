import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@stud/ui';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

/**
 * The 404.
 *
 * Lives at the app root rather than inside `(site)`, because Next resolves an
 * unmatched URL against the root boundary — so this one brings its own header
 * and footer instead of inheriting them.
 */
export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

const ELSEWHERE = [
  { href: '/puppies', label: 'Available puppies', hint: 'Litters with their health testing shown' },
  { href: '/studs', label: 'Stud dogs', hint: 'Search by breed, testing and location' },
  { href: '/breeders', label: 'Breeder programs', hint: 'Who they are and what they test for' },
  { href: '/learn', label: 'Guides', hint: 'Short, practical, written for buyers' },
];

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-content px-5 py-20 lg:px-8 lg:py-28">
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">404</p>
        <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight text-ink-900 sm:text-5xl">
          This page isn&rsquo;t here
        </h1>
        <p className="mt-4 max-w-lg text-md leading-relaxed text-ink-600">
          The link may be old, or a listing that has since come down. Nothing you did.
        </p>

        <Button asChild size="lg" className="mt-7">
          <Link href="/">
            Back to the Homepage <ArrowRight />
          </Link>
        </Button>

        <div className="mt-16 border-t border-bone-300 pt-8">
          <h2 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Or Start Here
          </h2>
          <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {ELSEWHERE.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="group block">
                  <span className="font-display text-lg text-ink-900 group-hover:text-brand-700">
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-500">{l.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
