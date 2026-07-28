import type { Metadata } from 'next';
import { TooltipProvider } from '@stud/ui';
import { fontVars } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Stud Studio', template: '%s · Stud Studio' },
  description: 'The breeder workspace: heats, breedings, whelping, growth, buyers and contracts.',
  robots: { index: false, follow: false },
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
