import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';

/**
 * The studio's own 404, so a bad workspace URL keeps the rail instead of
 * dropping the breeder onto the marketing site.
 */
export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function StudioNotFound() {
  return (
    <StudioShell>
      <StudioPage title="This page isn't here" description="The link may be old, or the record may have been merged or removed.">
        <Button asChild>
          <Link href="/studio">
            Back to the Dashboard <ArrowRight />
          </Link>
        </Button>
      </StudioPage>
    </StudioShell>
  );
}
