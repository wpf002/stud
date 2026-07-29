'use client';

import * as Popover from '@radix-ui/react-popover';
import {
  AlertTriangle,
  BadgeCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  FileText,
  ExternalLink,
} from 'lucide-react';
import * as React from 'react';
import { cn } from './cn';

/**
 * THE VERIFICATION BADGE
 * ══════════════════════
 * The core design object of the entire product. It appears on stud profiles,
 * litter listings, puppy cards and breeder profiles.
 *
 * Three non-negotiable behaviours (roadmap §3):
 *   1. A verified claim is VISUALLY DISTINCT from a reported claim. Two tiers,
 *      never blended. The moment they look alike we are Good Dog.
 *   2. It is tappable and expands into source, result, test date and
 *      verification timestamp. The receipts are the product.
 *   3. Absence is a visible state. "Not verified" renders; it never collapses
 *      into whitespace.
 */

export type VerificationState =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'STALE'
  | 'CONFLICTED'
  /// Self-attested by the owner. Displayed, never dressed up as verified.
  | 'REPORTED';

export interface VerificationEvidence {
  /** Human label for where this came from: "OFA", "AKC", "NAVHDA", "Embark". */
  source: string;
  /** Deep link to the public record, when one exists. */
  sourceUrl?: string | null;
  /** The result as the source states it: "Excellent", "Normal", "MH". */
  result?: string | null;
  /** When the underlying test/title was awarded. */
  testedAt?: Date | string | null;
  /** When our machine last confirmed it against the source. */
  checkedAt?: Date | string | null;
  /** Identifier the lookup keyed on — registration number, chip, etc. */
  identifier?: string | null;
  /** Populated only on CONFLICTED: what the source now says vs. what we held. */
  conflictNote?: string | null;
}

const STATE_META: Record<
  VerificationState,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    chip: string;
    dot: string;
    /** Long-form explanation shown in the expanded panel. */
    meaning: string;
  }
> = {
  VERIFIED: {
    label: 'Verified',
    Icon: BadgeCheck,
    chip: 'bg-verify-verifiedBg text-verify-verified ring-1 ring-inset ring-verify-verified/25',
    dot: 'bg-verify-verified',
    meaning:
      'Confirmed with the registry that issued it. The source and check date are shown below.',
  },
  REPORTED: {
    label: 'Reported',
    Icon: FileText,
    chip: 'bg-verify-reportedBg text-verify-reported ring-1 ring-inset ring-verify-reported/25',
    dot: 'bg-verify-reported',
    meaning:
      'Entered by the owner. We haven\u2019t been able to confirm this one with a registry.',
  },
  PENDING: {
    label: 'Checking',
    Icon: Clock,
    chip: 'bg-verify-pendingBg text-verify-pending ring-1 ring-inset ring-verify-pending/25',
    dot: 'bg-verify-pending animate-pulse',
    meaning: 'We\u2019re checking this with the registry right now.',
  },
  STALE: {
    label: 'Needs recheck',
    Icon: CircleDashed,
    chip: 'bg-verify-staleBg text-verify-stale ring-1 ring-inset ring-verify-stale/25',
    dot: 'bg-verify-stale',
    meaning:
      'Verified previously — it\u2019s been a while, so we\u2019re re-checking it.',
  },
  CONFLICTED: {
    label: 'Conflict',
    Icon: AlertTriangle,
    chip: 'bg-verify-conflictedBg text-verify-conflicted ring-1 ring-inset ring-verify-conflicted/30',
    dot: 'bg-verify-conflicted',
    meaning:
      'The registry now shows something different. Our team is reviewing it, so hold off on relying on this one.',
  },
  UNVERIFIED: {
    label: 'Not verified',
    Icon: CircleSlash,
    chip: 'bg-verify-unverifiedBg text-verify-unverified ring-1 ring-inset ring-verify-unverified/25',
    dot: 'bg-verify-unverified',
    meaning:
      'No result has been submitted for this test yet.',
  },
};

function fmtDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export interface VerificationBadgeProps {
  state: VerificationState;
  /** What is being attested: "Hips", "Elbows", "Master Hunter", "prcd-PRA". */
  claim?: string;
  evidence?: VerificationEvidence | null;
  size?: 'sm' | 'md' | 'lg';
  /** Suppress the popover — use for dense table cells and print exports. */
  static?: boolean;
  className?: string;
}

export function VerificationBadge({
  state,
  claim,
  evidence,
  size = 'md',
  static: isStatic = false,
  className,
}: VerificationBadgeProps) {
  const meta = STATE_META[state];
  const { Icon } = meta;

  const sizing = {
    sm: 'h-5 gap-1 px-1.5 text-2xs',
    md: 'h-6 gap-1.5 px-2 text-xs',
    lg: 'h-8 gap-2 px-3 text-sm',
  }[size];

  const iconSize = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5', lg: 'h-4 w-4' }[size];

  const chip = (
    <span
      className={cn(
        'inline-flex items-center rounded-pill font-medium tracking-tight',
        'transition-colors duration-150',
        sizing,
        meta.chip,
        !isStatic && 'cursor-pointer hover:brightness-[0.97] focus-visible:shadow-focus',
        className,
      )}
    >
      <Icon className={cn(iconSize, 'shrink-0')} aria-hidden />
      {claim ? (
        <>
          <span className="font-semibold">{claim}</span>
          {evidence?.result ? (
            <span className="opacity-80">· {evidence.result}</span>
          ) : (
            <span className="opacity-70">· {meta.label}</span>
          )}
        </>
      ) : (
        <span className="font-semibold">{meta.label}</span>
      )}
    </span>
  );

  if (isStatic) return chip;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${claim ? `${claim}: ` : ''}${meta.label} — show evidence`}
          className="rounded-pill outline-none focus-visible:shadow-focus"
        >
          {chip}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-bone-300',
            'bg-bone-50 p-4 shadow-lg outline-none',
            'data-[state=open]:animate-fade-up',
          )}
        >
          <VerificationEvidencePanel state={state} claim={claim} evidence={evidence} />
          <Popover.Arrow className="fill-bone-50" width={12} height={6} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The expanded receipts. Also used standalone inside health panels. */
export function VerificationEvidencePanel({
  state,
  claim,
  evidence,
}: {
  state: VerificationState;
  claim?: string;
  evidence?: VerificationEvidence | null;
}) {
  const meta = STATE_META[state];
  const { Icon } = meta;
  const tested = fmtDate(evidence?.testedAt);
  const checked = fmtDate(evidence?.checkedAt);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span
          className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.chip)}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          {claim && <p className="font-display text-md leading-tight text-ink-900">{claim}</p>}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{meta.label}</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-ink-600">{meta.meaning}</p>

      {evidence?.conflictNote && (
        <p className="rounded-md bg-verify-conflictedBg px-3 py-2 text-sm text-verify-conflicted">
          {evidence.conflictNote}
        </p>
      )}

      {evidence && (state === 'VERIFIED' || state === 'STALE' || state === 'CONFLICTED') && (
        <dl className="divide-y divide-bone-200 rounded-md border border-bone-200 bg-bone-100 text-sm">
          <Row label="Source" value={evidence.source} href={evidence.sourceUrl ?? undefined} />
          {evidence.result && <Row label="Result" value={evidence.result} mono />}
          {evidence.identifier && <Row label="Matched on" value={evidence.identifier} mono />}
          {tested && <Row label="Test date" value={tested} />}
          {checked && <Row label="Last checked" value={checked} />}
        </dl>
      )}

      {state === 'REPORTED' && (
        <p className="text-2xs uppercase tracking-wide text-ink-400">
          Owner-entered · not confirmed by Stud
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={cn('truncate text-right text-ink-800', mono && 'font-mono text-xs')}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            {value}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/**
 * Aggregate trust signal for a whole dog or kennel. Density, not a boolean:
 * "6 of 8 verified" is more honest than a single green tick.
 */
export function VerificationSummary({
  verified,
  total,
  size = 'md',
  className,
}: {
  verified: number;
  total: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((verified / total) * 100);
  const tone =
    total === 0
      ? 'text-ink-400'
      : pct >= 80
        ? 'text-verify-verified'
        : pct >= 40
          ? 'text-verify-stale'
          : 'text-verify-reported';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-16 overflow-hidden rounded-pill bg-bone-300"
        role="img"
        aria-label={`${verified} of ${total} claims verified`}
      >
        <div
          className={cn(
            'h-full rounded-pill transition-[width] duration-500 ease-editorial',
            total === 0 ? 'bg-ink-300' : pct >= 80 ? 'bg-verify-verified' : pct >= 40 ? 'bg-verify-stale' : 'bg-verify-reported',
          )}
          style={{ width: `${Math.max(pct, total === 0 ? 0 : 4)}%` }}
        />
      </div>
      <span className={cn('font-mono tabular-nums', size === 'sm' ? 'text-2xs' : 'text-xs', tone)}>
        {total === 0 ? 'No claims' : `${verified}/${total} verified`}
      </span>
    </div>
  );
}
