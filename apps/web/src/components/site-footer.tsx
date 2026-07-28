import Link from 'next/link';
import { Logo } from './logo';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Find a dog',
    links: [
      { href: '/puppies', label: 'Available puppies' },
      { href: '/breeders', label: 'Breeder programs' },
      { href: '/breeds', label: 'Browse by breed' },
      { href: '/puppies?verified=1', label: 'Verified-health litters' },
    ],
  },
  {
    title: 'Breeding',
    links: [
      { href: '/studs', label: 'Stud directory' },
      { href: '/tools/coi', label: 'COI calculator' },
      { href: '/tools/trial-pairing', label: 'Trial pairing' },
      { href: '/verification', label: 'Verification standard' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/learn/health-testing', label: 'Health testing by breed' },
      { href: '/learn/coi', label: 'Understanding COI' },
      { href: '/learn/questions-to-ask', label: 'What to ask a breeder' },
      { href: '/learn/contracts', label: 'Reading a breeding contract' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/standards', label: 'Our standards' },
      { href: '/trust', label: 'Trust & safety' },
      { href: '/report', label: 'Report a concern' },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/privacy', label: 'Privacy' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-bone-300 bg-bone-200/60">
      <div className="mx-auto max-w-content px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
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
