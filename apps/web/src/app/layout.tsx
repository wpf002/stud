import type { Metadata } from 'next';
import { TooltipProvider } from '@stud/ui';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { fontVars } from '@/lib/fonts';
import './globals.css';

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
        <TooltipProvider delayDuration={200}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-bone-50"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </TooltipProvider>
      </body>
    </html>
  );
}
