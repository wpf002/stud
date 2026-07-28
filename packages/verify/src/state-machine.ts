/**
 * The verification state machine.
 *
 * Invariant 3: verification is a state machine, never a boolean. Every
 * transition is explicit, every transition is logged, and illegal transitions
 * are refused rather than silently coerced.
 *
 * This module is PURE. It decides what the next state should be; it does not
 * write anything. The caller persists the decision and the audit row together,
 * which is what makes the log trustworthy.
 */

import { type ClaimOutcome, type SourceId, type VerificationState } from './types.js';

export type TransitionTrigger =
  /** Owner submitted an identifier; a lookup is starting. */
  | 'SUBMIT'
  /** A source returned findings that match what we hold (or first findings). */
  | 'SOURCE_CONFIRMED'
  /** A source answered and had no record for this identifier. */
  | 'SOURCE_EMPTY'
  /** The source could not be reached. NOT a negative result. */
  | 'SOURCE_UNAVAILABLE'
  /** A source returned a result that differs from what we recorded. */
  | 'SOURCE_DIVERGED'
  /** The freshness window elapsed. */
  | 'AGED_OUT'
  /** An admin resolved a conflict in favour of the source. */
  | 'ADMIN_ACCEPTED_SOURCE'
  /** An admin resolved a conflict in favour of the held record. */
  | 'ADMIN_KEPT_RECORD'
  /** An admin invalidated the claim entirely. */
  | 'ADMIN_REVOKED';

export interface TransitionInput {
  from: VerificationState;
  trigger: TransitionTrigger;
  /** Which source drove this, when one did. */
  source?: SourceId | null;
  /** Who acted. `system` for the reconciliation worker. */
  actor: { id: string | null; type: 'user' | 'admin' | 'system' };
  at: Date;
  /** What the source returned, for the log. */
  observed?: { rawResult?: string | null; outcome?: ClaimOutcome | null } | null;
  /** What we held before, for the log. */
  previous?: { rawResult?: string | null; outcome?: ClaimOutcome | null } | null;
  note?: string | null;
}

export interface TransitionResult {
  to: VerificationState;
  /** False when the trigger is a no-op from this state. */
  changed: boolean;
  /** Human-readable reason, written to the audit log verbatim. */
  reason: string;
  /** True when the claim now needs a human. */
  requiresReview: boolean;
}

export class IllegalTransitionError extends Error {
  constructor(
    public from: VerificationState,
    public trigger: TransitionTrigger,
  ) {
    super(`Cannot apply ${trigger} to a claim in state ${from}.`);
    this.name = 'IllegalTransitionError';
  }
}

/**
 * Legal transitions, exhaustively.
 *
 * Written as data rather than nested conditionals so the whole machine can be
 * read at a glance and tested by enumeration. An empty target means the
 * trigger is a legal no-op from that state.
 */
const TRANSITIONS: Record<
  VerificationState,
  Partial<Record<TransitionTrigger, VerificationState>>
> = {
  UNVERIFIED: {
    SUBMIT: 'PENDING',
    // A reconciliation sweep can find records for a claim nobody submitted —
    // e.g. OFA publishes results for a registration we already hold.
    SOURCE_CONFIRMED: 'VERIFIED',
    SOURCE_EMPTY: 'UNVERIFIED',
    SOURCE_UNAVAILABLE: 'UNVERIFIED',
  },
  PENDING: {
    SOURCE_CONFIRMED: 'VERIFIED',
    // The source answered and had nothing. Back to unverified — which is the
    // honest state, and is NOT the same as "failed".
    SOURCE_EMPTY: 'UNVERIFIED',
    // We could not ask. Stay pending and retry; never demote on a network blip.
    SOURCE_UNAVAILABLE: 'PENDING',
    ADMIN_REVOKED: 'UNVERIFIED',
  },
  VERIFIED: {
    SOURCE_CONFIRMED: 'VERIFIED',
    AGED_OUT: 'STALE',
    SOURCE_DIVERGED: 'CONFLICTED',
    // The source no longer lists a record it previously had. That is a
    // conflict, not an absence — something changed at the source and a human
    // needs to look.
    SOURCE_EMPTY: 'CONFLICTED',
    SOURCE_UNAVAILABLE: 'VERIFIED',
    ADMIN_REVOKED: 'UNVERIFIED',
  },
  STALE: {
    SOURCE_CONFIRMED: 'VERIFIED',
    SOURCE_DIVERGED: 'CONFLICTED',
    SOURCE_EMPTY: 'CONFLICTED',
    SOURCE_UNAVAILABLE: 'STALE',
    AGED_OUT: 'STALE',
    ADMIN_REVOKED: 'UNVERIFIED',
  },
  CONFLICTED: {
    // A conflict does NOT clear itself just because a later check agrees.
    // Only a human closes it — otherwise a flapping source silently
    // launders a discrepancy nobody ever saw.
    SOURCE_CONFIRMED: 'CONFLICTED',
    SOURCE_DIVERGED: 'CONFLICTED',
    SOURCE_EMPTY: 'CONFLICTED',
    SOURCE_UNAVAILABLE: 'CONFLICTED',
    AGED_OUT: 'CONFLICTED',
    ADMIN_ACCEPTED_SOURCE: 'VERIFIED',
    ADMIN_KEPT_RECORD: 'VERIFIED',
    ADMIN_REVOKED: 'UNVERIFIED',
  },
};

function describe(input: TransitionInput, to: VerificationState): string {
  const src = input.source ?? 'unknown source';
  switch (input.trigger) {
    case 'SUBMIT':
      return `Lookup requested against ${src}.`;
    case 'SOURCE_CONFIRMED':
      return `${src} confirmed "${input.observed?.rawResult ?? '—'}".`;
    case 'SOURCE_EMPTY':
      return to === 'CONFLICTED'
        ? `${src} no longer lists a record for this identifier, but we previously held "${input.previous?.rawResult ?? '—'}". Under review.`
        : `${src} has no record for this identifier.`;
    case 'SOURCE_UNAVAILABLE':
      return `${src} could not be reached (${input.note ?? 'no detail'}). State unchanged — this is not a negative result.`;
    case 'SOURCE_DIVERGED':
      return `${src} now returns "${input.observed?.rawResult ?? '—'}" where we recorded "${input.previous?.rawResult ?? '—'}".`;
    case 'AGED_OUT':
      return `Last successful check is older than the freshness window for ${src}.`;
    case 'ADMIN_ACCEPTED_SOURCE':
      return `Admin accepted the source value "${input.observed?.rawResult ?? '—'}".`;
    case 'ADMIN_KEPT_RECORD':
      return `Admin kept the recorded value "${input.previous?.rawResult ?? '—'}".`;
    case 'ADMIN_REVOKED':
      return `Admin revoked this claim${input.note ? `: ${input.note}` : '.'}`;
  }
}

/**
 * Decide the next state.
 *
 * Throws `IllegalTransitionError` rather than falling through to a default —
 * an unexpected trigger is a bug, and silently keeping the current state would
 * hide it behind a badge that still says "Verified".
 */
export function transition(input: TransitionInput): TransitionResult {
  const to = TRANSITIONS[input.from][input.trigger];
  if (to === undefined) throw new IllegalTransitionError(input.from, input.trigger);

  return {
    to,
    changed: to !== input.from,
    reason: describe(input, to),
    requiresReview: to === 'CONFLICTED',
  };
}

/** Every trigger legal from a given state. Used by the admin UI. */
export function allowedTriggers(from: VerificationState): TransitionTrigger[] {
  return Object.keys(TRANSITIONS[from]) as TransitionTrigger[];
}

/**
 * Did the source return something materially different from what we hold?
 *
 * Compares the NORMALISED outcome first, then the verbatim string. Deliberately
 * case- and whitespace-insensitive on the verbatim comparison: OFA rendering
 * "Excellent" as "EXCELLENT" is not a conflict, and crying wolf on formatting
 * changes would train admins to dismiss the queue without reading it.
 */
export function hasDiverged(
  previous: { rawResult?: string | null; outcome?: ClaimOutcome | null } | null | undefined,
  observed: { rawResult?: string | null; outcome?: ClaimOutcome | null },
): boolean {
  if (!previous) return false;
  if (previous.outcome && observed.outcome && previous.outcome !== observed.outcome) return true;

  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const before = norm(previous.rawResult);
  const after = norm(observed.rawResult);
  if (!before || !after) return false;
  return before !== after;
}

/** Has a successful check aged past its source's freshness window? */
export function isStale(lastCheckedAt: Date | null | undefined, freshnessDays: number, now: Date): boolean {
  if (!lastCheckedAt) return true;
  const ageMs = now.getTime() - lastCheckedAt.getTime();
  return ageMs > freshnessDays * 86_400_000;
}

/**
 * Choose the trigger a lookup result implies.
 *
 * Centralised so every caller — the on-demand route and the reconciliation
 * worker — reaches the same conclusion from the same facts.
 */
export function triggerForLookup(args: {
  status: 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE' | 'DISABLED' | 'UNSUPPORTED_IDENTIFIER';
  previous?: { rawResult?: string | null; outcome?: ClaimOutcome | null } | null;
  observed?: { rawResult?: string | null; outcome?: ClaimOutcome | null } | null;
}): TransitionTrigger {
  switch (args.status) {
    case 'FOUND':
      return args.observed && hasDiverged(args.previous, args.observed)
        ? 'SOURCE_DIVERGED'
        : 'SOURCE_CONFIRMED';
    case 'NOT_FOUND':
      return 'SOURCE_EMPTY';
    default:
      // DISABLED and UNSUPPORTED_IDENTIFIER are both "we did not get an
      // answer". Treating either as a negative would be a lie.
      return 'SOURCE_UNAVAILABLE';
  }
}
