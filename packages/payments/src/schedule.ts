/**
 * Payment schedules and escrow release conditions.
 *
 * A stud fee is not one payment. It is a deposit on signing and a balance on
 * some trigger the contract names, with the money held in between and released
 * only when a condition the contract defines is met.
 *
 * The critical property: **release conditions are read from the contract's
 * machine-readable clause effects, never from its prose.** A refund decision
 * that depends on parsing English is a refund decision that will be wrong.
 *
 * Pure module. No I/O, no clock.
 */

import { type Cents } from './ledger.js';

export type ScheduleTrigger =
  | 'ON_SIGNING'
  | 'ON_TIE'
  | 'ON_CONFIRMED_PREGNANCY'
  | 'ON_WHELP'
  | 'MANUAL';

export type InstalmentStatus = 'PENDING' | 'DUE' | 'PAID' | 'WAIVED' | 'REFUNDED';

export interface Instalment {
  key: string;
  label: string;
  amountCents: Cents;
  trigger: ScheduleTrigger;
  status: InstalmentStatus;
  /** Set once the trigger has fired. */
  dueSince?: Date | null;
  paidAt?: Date | null;
}

export interface PaymentSchedule {
  totalCents: Cents;
  instalments: Instalment[];
}

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

/**
 * Build a schedule from contract terms.
 *
 * `balanceTrigger` comes from the clause's `effects.definesBalanceTrigger`,
 * not from reading the rendered sentence.
 */
export function buildSchedule(args: {
  totalCents: Cents;
  depositCents: Cents;
  balanceTrigger: Exclude<ScheduleTrigger, 'ON_SIGNING' | 'MANUAL'>;
}): PaymentSchedule {
  if (!Number.isInteger(args.totalCents) || !Number.isInteger(args.depositCents)) {
    throw new ScheduleError('Amounts must be integer cents.');
  }
  if (args.depositCents < 0 || args.totalCents < 0) {
    throw new ScheduleError('Amounts cannot be negative.');
  }
  if (args.depositCents > args.totalCents) {
    throw new ScheduleError('The deposit cannot exceed the total fee.');
  }

  const balance = args.totalCents - args.depositCents;
  const instalments: Instalment[] = [];

  if (args.depositCents > 0) {
    instalments.push({
      key: 'deposit',
      label: 'Deposit',
      amountCents: args.depositCents,
      trigger: 'ON_SIGNING',
      status: 'PENDING',
    });
  }
  if (balance > 0) {
    instalments.push({
      key: 'balance',
      label: 'Balance',
      amountCents: balance,
      trigger: args.balanceTrigger,
      status: 'PENDING',
    });
  }

  // Guard against a schedule that does not add up to the fee. Invariant 2 is
  // about the type; this is about the arithmetic.
  const sum = instalments.reduce((t, i) => t + i.amountCents, 0);
  if (sum !== args.totalCents) {
    throw new ScheduleError(`Instalments sum to ${sum} but the total is ${args.totalCents}.`);
  }

  return { totalCents: args.totalCents, instalments };
}

/** Events that can fire a trigger. */
export interface BreedingProgress {
  contractSigned: boolean;
  tieRecorded: boolean;
  pregnancyConfirmed: boolean;
  litterWhelped: boolean;
}

export function isTriggerMet(trigger: ScheduleTrigger, progress: BreedingProgress): boolean {
  switch (trigger) {
    case 'ON_SIGNING':
      return progress.contractSigned;
    case 'ON_TIE':
      return progress.tieRecorded;
    case 'ON_CONFIRMED_PREGNANCY':
      return progress.pregnancyConfirmed;
    case 'ON_WHELP':
      return progress.litterWhelped;
    case 'MANUAL':
      return false;
  }
}

/** Advance PENDING instalments to DUE where their trigger has fired. */
export function applyProgress(
  schedule: PaymentSchedule,
  progress: BreedingProgress,
  now: Date,
): PaymentSchedule {
  return {
    ...schedule,
    instalments: schedule.instalments.map((i) =>
      i.status === 'PENDING' && isTriggerMet(i.trigger, progress)
        ? { ...i, status: 'DUE' as const, dueSince: now }
        : i,
    ),
  };
}

export function amountDue(schedule: PaymentSchedule): Cents {
  return schedule.instalments.filter((i) => i.status === 'DUE').reduce((t, i) => t + i.amountCents, 0);
}

export function amountPaid(schedule: PaymentSchedule): Cents {
  return schedule.instalments.filter((i) => i.status === 'PAID').reduce((t, i) => t + i.amountCents, 0);
}

export function amountOutstanding(schedule: PaymentSchedule): Cents {
  return schedule.instalments
    .filter((i) => i.status === 'PENDING' || i.status === 'DUE')
    .reduce((t, i) => t + i.amountCents, 0);
}

// ── Escrow release ──────────────────────────────────────────────────────────

export type EscrowDecision = 'HOLD' | 'RELEASE' | 'REFUND' | 'NEEDS_REVIEW';

export interface EscrowAssessment {
  decision: EscrowDecision;
  releasableCents: Cents;
  refundableCents: Cents;
  reason: string;
  /** True when the outcome turns on a judgement nobody automated. */
  requiresHuman: boolean;
}

/**
 * What happens to money in escrow.
 *
 * `noLitterRemedy` comes from the contract's clause effects. If the contract
 * does not define one, this returns NEEDS_REVIEW rather than guessing — a
 * platform that invents a refund position the contract did not state is
 * making a decision it has no authority to make.
 */
export function assessEscrow(args: {
  heldCents: Cents;
  depositCents: Cents;
  progress: BreedingProgress;
  /** From clause effects. Null when the contract is silent. */
  noLitterRemedy: 'REPEAT_ONLY' | 'REFUND_BALANCE' | 'REFUND_ALL' | 'NO_REMEDY' | null;
  /** The breeding is over and produced nothing. */
  breedingFailed: boolean;
  /** A dispute is open. Nothing moves. */
  disputed?: boolean;
  /**
   * How much has already gone out to the seller on an earlier settlement.
   *
   * Without this, a second settlement re-reads "the deposit is releasable" and
   * releases the deposit AGAIN out of the balance that is supposed to stay held
   * until the litter is whelped. Every assessment is a statement about the
   * whole agreement, not about the current escrow balance in isolation.
   */
  alreadyReleasedCents?: Cents;
}): EscrowAssessment {
  const { heldCents, depositCents, progress, breedingFailed } = args;
  const alreadyReleased = args.alreadyReleasedCents ?? 0;
  /** What the stud owner is still owed out of the deposit tranche. */
  const depositOutstanding = Math.max(0, depositCents - alreadyReleased);

  if (args.disputed) {
    return {
      decision: 'NEEDS_REVIEW',
      releasableCents: 0,
      refundableCents: 0,
      reason: 'A dispute is open on this contract. Nothing is released or refunded until it is resolved.',
      requiresHuman: true,
    };
  }

  if (heldCents === 0) {
    return {
      decision: 'HOLD',
      releasableCents: 0,
      refundableCents: 0,
      reason: 'Nothing is held in escrow.',
      requiresHuman: false,
    };
  }

  if (!breedingFailed) {
    // The service happened and produced a litter — the stud owner has earned it.
    if (progress.litterWhelped) {
      return {
        decision: 'RELEASE',
        releasableCents: heldCents,
        refundableCents: 0,
        reason: 'A live litter was whelped. The full held amount is releasable to the stud owner.',
        requiresHuman: false,
      };
    }
    // Pregnancy confirmed releases the deposit; the balance waits for the whelp,
    // which is what actually protects the bitch owner.
    if (progress.pregnancyConfirmed) {
      const releasable = Math.min(depositOutstanding, heldCents);
      if (releasable === 0) {
        return {
          decision: 'HOLD',
          releasableCents: 0,
          refundableCents: 0,
          reason:
            'The deposit has already been released. The balance stays in escrow until the litter is whelped.',
          requiresHuman: false,
        };
      }
      return {
        decision: 'RELEASE',
        releasableCents: releasable,
        refundableCents: 0,
        reason:
          'Pregnancy is confirmed. The deposit is releasable; the balance stays in escrow until the litter is whelped.',
        requiresHuman: false,
      };
    }
    return {
      decision: 'HOLD',
      releasableCents: 0,
      refundableCents: 0,
      reason: progress.tieRecorded
        ? 'The service has taken place but pregnancy is not yet confirmed. Funds stay held.'
        : 'The service has not yet taken place. Funds stay held.',
      requiresHuman: false,
    };
  }

  // ── The breeding failed. What the contract says goes. ──
  switch (args.noLitterRemedy) {
    case 'REPEAT_ONLY':
      return {
        decision: 'RELEASE',
        releasableCents: heldCents,
        refundableCents: 0,
        reason:
          'The contract provides a repeat service as the sole remedy and states the fee is not refundable. Funds are releasable; the repeat-breeding right is recorded separately.',
        requiresHuman: false,
      };
    case 'REFUND_BALANCE': {
      // The stud owner keeps the deposit in total, not the deposit again on
      // top of whatever was already released to them.
      const refundable = Math.max(0, heldCents - depositOutstanding);
      return {
        decision: refundable > 0 ? 'REFUND' : 'RELEASE',
        releasableCents: heldCents - refundable,
        refundableCents: refundable,
        reason:
          'The contract provides a refund of the balance if no litter results. The deposit is releasable to the stud owner.',
        requiresHuman: false,
      };
    }
    case 'REFUND_ALL':
      return {
        decision: 'REFUND',
        releasableCents: 0,
        refundableCents: heldCents,
        reason: 'The contract provides a full refund if no litter results.',
        requiresHuman: false,
      };
    case 'NO_REMEDY':
      return {
        decision: 'RELEASE',
        releasableCents: heldCents,
        refundableCents: 0,
        reason: 'The contract provides no remedy if no litter results. Funds are releasable.',
        requiresHuman: false,
      };
    case null:
    default:
      // Refusing to guess is the whole point.
      return {
        decision: 'NEEDS_REVIEW',
        releasableCents: 0,
        refundableCents: 0,
        reason:
          'This breeding produced no litter and the contract does not state what happens to the fee. Stud cannot decide that on the parties’ behalf — the parties or an admin must resolve it.',
        requiresHuman: true,
      };
  }
}

/**
 * Platform fee on a released amount.
 *
 * Basis points, rounded half-up, and never more than the amount itself.
 */
export function platformFee(amountCents: Cents, basisPoints: number): Cents {
  if (!Number.isInteger(amountCents)) {
    throw new ScheduleError('Amounts must be integer cents.');
  }
  if (basisPoints < 0 || basisPoints > 10_000) {
    throw new ScheduleError('Basis points must be between 0 and 10000.');
  }
  return Math.min(amountCents, Math.round((amountCents * basisPoints) / 10_000));
}
