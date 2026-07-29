/**
 * The buyer pipeline.
 *
 * An application becomes a reservation becomes a sale. The rules here decide
 * what may happen next, who picks first, and what a deposit is worth when
 * somebody changes their mind.
 *
 * Pure module. No I/O, no clock — every function that needs "now" takes it.
 *
 * ── The ordering invariant ────────────────────────────────────────────────
 * **Money never moves before approval.** A deposit taken from an applicant the
 * breeder has not accepted is a deposit that has to be given back, and the
 * platform holding it in the meantime is the platform's problem. `canAdvance`
 * enforces the order; nothing else needs to remember it.
 */

import { type Cents } from './ledger.js';

export type ApplicationStage =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  /** Approved, in the queue, no puppy chosen yet. */
  | 'APPROVED'
  /** Approved but no puppy available in this litter. */
  | 'WAITLISTED'
  /** Deposit paid, holding a place in the pick order. */
  | 'DEPOSIT_PAID'
  /** A specific puppy is theirs. */
  | 'MATCHED'
  /** Contract signed, balance settled. */
  | 'PAID_IN_FULL'
  /** The dog has gone home. */
  | 'COMPLETED'
  | 'DECLINED'
  | 'WITHDRAWN';

/** Terminal stages. Nothing advances out of these. */
const TERMINAL: ApplicationStage[] = ['COMPLETED', 'DECLINED', 'WITHDRAWN'];

/**
 * What may follow what.
 *
 * Written as data rather than as a switch so the whole pipeline is readable in
 * one place, and so an illegal jump — SUBMITTED straight to DEPOSIT_PAID —
 * cannot be introduced by adding a route that forgot to check.
 */
const ALLOWED: Record<ApplicationStage, ApplicationStage[]> = {
  SUBMITTED: ['IN_REVIEW', 'APPROVED', 'WAITLISTED', 'DECLINED', 'WITHDRAWN'],
  IN_REVIEW: ['APPROVED', 'WAITLISTED', 'DECLINED', 'WITHDRAWN'],
  APPROVED: ['DEPOSIT_PAID', 'WAITLISTED', 'DECLINED', 'WITHDRAWN'],
  WAITLISTED: ['APPROVED', 'DECLINED', 'WITHDRAWN'],
  DEPOSIT_PAID: ['MATCHED', 'WITHDRAWN', 'DECLINED'],
  MATCHED: ['PAID_IN_FULL', 'WITHDRAWN', 'DECLINED'],
  PAID_IN_FULL: ['COMPLETED', 'WITHDRAWN'],
  COMPLETED: [],
  DECLINED: [],
  WITHDRAWN: [],
};

export interface StageTransition {
  allowed: boolean;
  reason: string;
}

export function canAdvance(from: ApplicationStage, to: ApplicationStage): StageTransition {
  if (from === to) return { allowed: false, reason: `Already ${label(from)}.` };
  if (TERMINAL.includes(from)) {
    return {
      allowed: false,
      reason: `This application is ${label(from)} and cannot be changed. Start a new application instead.`,
    };
  }
  if (ALLOWED[from].includes(to)) return { allowed: true, reason: '' };

  // The one worth explaining, because it is the one somebody will try.
  if (to === 'DEPOSIT_PAID' && from !== 'APPROVED') {
    return {
      allowed: false,
      reason:
        'The application needs to be approved before a deposit can be taken.',
    };
  }
  if (to === 'MATCHED' && from !== 'DEPOSIT_PAID') {
    return {
      allowed: false,
      reason: 'A puppy is only matched once the deposit is paid and the buyer holds a place in the pick order.',
    };
  }
  if (to === 'COMPLETED' && from !== 'PAID_IN_FULL') {
    return {
      allowed: false,
      reason: 'The balance has to be settled before the puppy goes home.',
    };
  }
  return { allowed: false, reason: `Cannot go from ${label(from)} to ${label(to)}.` };
}

export function isTerminal(stage: ApplicationStage): boolean {
  return TERMINAL.includes(stage);
}

function label(stage: ApplicationStage): string {
  return stage.replace(/_/g, ' ').toLowerCase();
}

// ── Pick order ─────────────────────────────────────────────────────────────

export interface PickCandidate {
  applicationId: string;
  stage: ApplicationStage;
  /**
   * A position the breeder set by hand. Honoured above everything else — a
   * breeder who promised somebody first pick has already made that promise.
   */
  manualPosition?: number | null;
  /** When the deposit landed. The tiebreak that is actually fair. */
  depositPaidAt?: Date | null;
  applicationSubmittedAt: Date;
  /** Already has a puppy. Keeps its slot but no longer picks. */
  matchedPuppyId?: string | null;
}

export interface PickSlot extends PickCandidate {
  position: number;
  /** True when this is the applicant whose turn it is. */
  isNext: boolean;
  reason: string;
}

/**
 * Rank the buyers waiting to choose.
 *
 * Order: a breeder's explicit position first, then deposit time, then
 * application time. Deposit time rather than application time is the fair
 * default — it is the point at which somebody committed, and it is the only
 * one of the three that both parties can see.
 *
 * Applicants who have not paid a deposit are not in the pick order at all.
 * Neither are terminal ones.
 */
export function buildPickOrder(candidates: readonly PickCandidate[]): PickSlot[] {
  const eligible = candidates.filter(
    (c) => (c.stage === 'DEPOSIT_PAID' || c.stage === 'MATCHED') && !isTerminal(c.stage),
  );

  const sorted = [...eligible].sort((a, b) => {
    const am = a.manualPosition ?? Number.MAX_SAFE_INTEGER;
    const bm = b.manualPosition ?? Number.MAX_SAFE_INTEGER;
    if (am !== bm) return am - bm;

    const ad = a.depositPaidAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = b.depositPaidAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;

    return a.applicationSubmittedAt.getTime() - b.applicationSubmittedAt.getTime();
  });

  let nextAssigned = false;
  return sorted.map((c, i) => {
    const waiting = !c.matchedPuppyId;
    const isNext = waiting && !nextAssigned;
    if (isNext) nextAssigned = true;
    return {
      ...c,
      position: i + 1,
      isNext,
      reason:
        c.manualPosition != null
          ? `Position set by the breeder.`
          : c.depositPaidAt
            ? `Deposit received ${c.depositPaidAt.toISOString().slice(0, 10)}.`
            : `Applied ${c.applicationSubmittedAt.toISOString().slice(0, 10)}.`,
    };
  });
}

// ── Deposit refunds ────────────────────────────────────────────────────────

export type DepositRefundTerm = 'NON_REFUNDABLE' | 'REFUNDABLE_UNTIL_PICK' | 'FULLY_REFUNDABLE';

export interface DepositAssessment {
  refundableCents: Cents;
  forfeitedCents: Cents;
  reason: string;
  requiresHuman: boolean;
}

/**
 * What a deposit is worth when a buyer withdraws.
 *
 * `term` comes from the contract's clause effect, never from its prose — the
 * same rule as Phase 5's escrow. When there is no signed contract yet, the
 * deposit is fully refundable: the platform cannot keep money against terms
 * nobody agreed to.
 */
export function assessDepositRefund(args: {
  depositCents: Cents;
  term: DepositRefundTerm | null;
  /** Has the buyer selected a puppy? */
  hasPicked: boolean;
  /** Did the BREEDER end it? Then the deposit always goes back. */
  breederWithdrew: boolean;
  /** No puppy in the litter suited them, through nobody's fault. */
  noSuitablePuppy?: boolean;
}): DepositAssessment {
  const { depositCents } = args;
  if (depositCents <= 0) {
    return { refundableCents: 0, forfeitedCents: 0, reason: 'No deposit was taken.', requiresHuman: false };
  }

  /**
   * The breeder ending it always refunds in full, whatever the contract says.
   *
   * A "non-refundable" deposit is consideration for the buyer's commitment. It
   * cannot also be a fee for the breeder changing their mind — a term that let
   * a breeder keep it would be both unconscionable and, in most states,
   * unenforceable.
   */
  if (args.breederWithdrew) {
    return {
      refundableCents: depositCents,
      forfeitedCents: 0,
      reason:
        'The breeder ended this, so the deposit is refunded in full regardless of the contract terms.',
      requiresHuman: false,
    };
  }

  if (args.noSuitablePuppy) {
    return {
      refundableCents: depositCents,
      forfeitedCents: 0,
      reason:
        'No suitable puppy was available in this litter. The deposit is refunded in full, or may be carried to a future litter if both parties agree.',
      requiresHuman: false,
    };
  }

  if (term(args.term) === null) {
    return {
      refundableCents: depositCents,
      forfeitedCents: 0,
      reason:
        'No signed contract sets a deposit term, so the deposit is refundable in full. Stud will not keep a buyer’s money against terms nobody agreed to.',
      requiresHuman: false,
    };
  }

  switch (args.term) {
    case 'FULLY_REFUNDABLE':
      return {
        refundableCents: depositCents,
        forfeitedCents: 0,
        reason: 'The contract makes the deposit fully refundable before collection.',
        requiresHuman: false,
      };
    case 'REFUNDABLE_UNTIL_PICK':
      return args.hasPicked
        ? {
            refundableCents: 0,
            forfeitedCents: depositCents,
            reason:
              'The contract makes the deposit refundable until a puppy is selected. This buyer has selected one, so it is forfeited.',
            requiresHuman: false,
          }
        : {
            refundableCents: depositCents,
            forfeitedCents: 0,
            reason:
              'The contract makes the deposit refundable until a puppy is selected, and none has been.',
            requiresHuman: false,
          };
    case 'NON_REFUNDABLE':
      return {
        refundableCents: 0,
        forfeitedCents: depositCents,
        reason: 'The contract states the deposit is not refundable if the buyer withdraws.',
        requiresHuman: false,
      };
    default:
      return {
        refundableCents: 0,
        forfeitedCents: 0,
        reason: 'The deposit term on this contract could not be read. A human needs to resolve it.',
        requiresHuman: true,
      };
  }
}

function term(t: DepositRefundTerm | null): DepositRefundTerm | null {
  return t ?? null;
}

// ── Readiness to go home ───────────────────────────────────────────────────

export interface PickupReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

/**
 * May this puppy go home?
 *
 * Blockers stop the handover; warnings do not. The age floor is a blocker,
 * because eight weeks is a statutory minimum in most states and a welfare one
 * everywhere — the same rule the listing enforces, applied at the door.
 */
export function assessPickupReadiness(args: {
  bornOn: Date;
  pickupOn: Date;
  balanceOutstandingCents: Cents;
  contractSigned: boolean;
  microchipped: boolean;
  vaccinationRecorded: boolean;
  vetCheckRecorded: boolean;
}): PickupReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const ageDays = Math.floor((args.pickupOn.getTime() - args.bornOn.getTime()) / 86_400_000);
  if (ageDays < 56) {
    blockers.push(
      `This puppy would be ${ageDays} days old. Puppies should not leave the litter before eight weeks — a legal minimum in most states and a welfare one everywhere.`,
    );
  }

  if (args.balanceOutstandingCents > 0) {
    blockers.push(
      `${formatCents(args.balanceOutstandingCents)} of the purchase price is still outstanding.`,
    );
  }
  if (!args.contractSigned) {
    blockers.push('The sale contract has not been signed by both parties.');
  }

  // Not blockers. A breeder who has genuinely done these and not logged them
  // should not be stopped at the door by their own paperwork — but they should
  // be told, because these are the records the buyer will need on day one.
  if (!args.microchipped) warnings.push('No microchip number is recorded for this puppy.');
  if (!args.vaccinationRecorded) warnings.push('No vaccination is recorded.');
  if (!args.vetCheckRecorded) warnings.push('No veterinary examination is recorded.');

  return { ready: blockers.length === 0, blockers, warnings };
}

function formatCents(cents: Cents): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
