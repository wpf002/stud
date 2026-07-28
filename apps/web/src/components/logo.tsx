import { cn } from '@stud/ui';

/**
 * The mark. A stylised pedigree fork — two ancestor lines converging into one
 * dog — inside a seal. Reads as a chart at small sizes and as a crest at large.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('h-7 w-7', className)} aria-hidden>
      <circle cx="16" cy="16" r="15" className="stroke-current" strokeWidth="1.5" opacity="0.28" />
      <path
        d="M16 24V17.5C16 15.29 17.79 13.5 20 13.5H23.5"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 20.5V17.5C16 15.29 14.21 13.5 12 13.5H8.5"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="25" r="2.4" className="fill-current" />
      <circle cx="24.2" cy="13.5" r="1.9" className="fill-current" opacity="0.75" />
      <circle cx="7.8" cy="13.5" r="1.9" className="fill-current" opacity="0.75" />
      <path d="M24.2 11V8" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M7.8 11V8" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
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
