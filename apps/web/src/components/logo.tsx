import { cn } from '@stud/ui';

/**
 * The mark: a friendly dog head, front on — floppy ears, happy face.
 * It should read "dog" instantly at 24px, nothing more clever than that.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('h-8 w-8', className)} aria-hidden>
      {/* ears */}
      <path
        d="M8.5 7C5.5 7.5 4 11 4.6 15.2c.4 2.8 1.8 4.6 3.4 5.1 1.1.3 2.1-.2 2.6-1.1L8.5 7Z"
        className="fill-clay-500"
      />
      <path
        d="M23.5 7c3 .5 4.5 4 3.9 8.2-.4 2.8-1.8 4.6-3.4 5.1-1.1.3-2.1-.2-2.6-1.1L23.5 7Z"
        className="fill-clay-500"
      />
      {/* head */}
      <path
        d="M16 5.5c-4.9 0-8 3.6-8 8.6 0 5.8 3.3 9.9 8 9.9s8-4.1 8-9.9c0-5-3.1-8.6-8-8.6Z"
        className="fill-current"
      />
      {/* eyes */}
      <circle cx="12.7" cy="14.2" r="1.3" className="fill-bone-50" />
      <circle cx="19.3" cy="14.2" r="1.3" className="fill-bone-50" />
      {/* snout */}
      <ellipse cx="16" cy="19.6" rx="3.4" ry="2.7" className="fill-bone-50" />
      <path
        d="M16 17.6c-.9 0-1.6.6-1.6 1.3 0 .8.7 1.3 1.6 1.3s1.6-.5 1.6-1.3c0-.7-.7-1.3-1.6-1.3Z"
        className="fill-ink-900"
      />
    </svg>
  );
}

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-brand-700', className)}>
      <LogoMark />
      {wordmark && (
        <span className="font-display text-xl font-semibold tracking-tight text-ink-900">Stud</span>
      )}
    </span>
  );
}
