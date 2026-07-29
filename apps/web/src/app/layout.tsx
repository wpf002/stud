import type { Metadata } from 'next';
import { TooltipProvider } from '@stud/ui';
import { fontVars } from '@/lib/fonts';
import './globals.css';

/**
 * The root shell — html, fonts, providers, nothing else.
 *
 * Chrome lives one level down, because the two halves of the site wear
 * different frames: `(site)` gets the marketing header and footer, `studio`
 * gets the breeder rail. A child layout cannot remove a parent's chrome, so
 * the split has to happen here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Stud — verified breeding, from sire to sold',
    template: '%s · Stud',
  },
  description:
    'The only dog platform where health testing, titles and pedigree are checked against the source — not typed in by the seller. Find a stud, plan a breeding, buy a puppy with receipts.',
  openGraph: {
    type: 'website',
    siteName: 'Stud',
    title: 'Stud — verified breeding, from sire to sold',
    description:
      'Verified health testing, verified titles, real pedigrees. Stud discovery, breeding management and a puppy marketplace in one record.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="min-h-dvh bg-bone-100 antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
