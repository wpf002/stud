import { Dog } from 'lucide-react';
import { cn } from '@stud/ui';

/**
 * The mark: the classic dog profile in a brand chip. An app-icon shape that
 * reads "dog" at any size, with no face to get uncanny about.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-bone-50 shadow-sm',
        className,
      )}
      aria-hidden
    >
      <Dog className="h-5 w-5" strokeWidth={2.2} />
    </span>
  );
}

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {wordmark && (
        <span className="font-display text-xl font-semibold tracking-tight text-ink-900">Stud</span>
      )}
    </span>
  );
}
