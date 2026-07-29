import Link from 'next/link';
import { GUIDES } from '@/lib/guides';
import { Logo } from './logo';

/**
 * Every link here points at a page that exists.
 *
 * The Learn column is built from GUIDES rather than typed out, because the
 * hand-written version drifted: four of its five links used slugs the guides
 * had never had, and a footer is exactly where nobody notices.
 */
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Find a dog',
    links: [
      { href: '/puppies', label: 'Available Puppies' },
      { href: '/puppies?verified=1', label: 'Verified-Health Litters' },
      { href: '/breeders', label: 'Breeder Programs' },
    ],
  },
  {
    title: 'Breeding',
    links: [
      { href: '/studs', label: 'Stud Directory' },
      { href: '/verification', label: 'How Verification Works' },
      { href: '/studio', label: 'Breeder Studio' },
    ],
  },
  {
    title: 'Learn',
    links: [
      ...GUIDES.slice(0, 4).map((g) => ({ href: `/learn/${g.slug}`, label: g.title })),
      { href: '/learn', label: 'All Guides' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-bone-300 bg-bone-200/60">
      <div className="mx-auto max-w-content px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-500">
              Verified breeding records, from stud selection to the day a puppy goes home.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
                {col.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-ink-600 transition-colors hover:text-brand-700"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-bone-300 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Stud. All rights reserved.</p>
          <p className="max-w-md sm:text-right">
            Verification results are reproduced from public registry and health-database records.
            Stud does not warrant the accuracy of third-party sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
