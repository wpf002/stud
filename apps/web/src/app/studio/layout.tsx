import type { Metadata } from 'next';

/**
 * The breeder workspace. Same app, same session, different frame — each page
 * wraps itself in StudioShell, which brings its own rail and header.
 *
 * Kept out of search: these pages are a breeder's own records, and half of
 * them would be meaningless to anyone else anyway.
 */
export const metadata: Metadata = {
  title: { default: 'Studio', template: '%s · Studio · Stud' },
  description: 'Heats, breedings, whelping, growth, buyers and contracts.',
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
