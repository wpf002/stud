/**
 * Brucellosis freshness.
 *
 * Unlike every other test on a dog, this one is about the day of the mating,
 * not the dog's lifetime. Brucellosis is a venereal infection that causes
 * abortion and sterility and passes between dogs at the point of breeding, so
 * a clear result from last spring says nothing about today. The standard ask
 * is a negative test within about thirty days of the mating, from both sides.
 *
 * That makes it the one claim with an expiry measured against an event rather
 * than a date on a certificate — which is why it needs its own rule instead of
 * riding on the generic staleness check. A hip score does not go out of date;
 * this does.
 *
 * Pure: `on` is always passed in.
 */
/** One day, in ms. Local to keep this module free of other imports. */
const DAY_MS = 86_400_000;

/** The window the result has to fall inside, counted back from the mating. */
export const BRUCELLOSIS_WINDOW_DAYS = 30;

export type BrucellosisState = 'CURRENT' | 'STALE' | 'MISSING' | 'POSITIVE';

export interface BrucellosisInput {
  /** When the blood was drawn. */
  testedAt?: Date | null;
  /** The result as recorded. Anything not clearly negative is treated as not clear. */
  outcome?: 'NORMAL' | 'CARRIER' | 'AT_RISK' | 'ABNORMAL' | 'INCONCLUSIVE' | 'INFORMATIONAL' | null;
}

export interface BrucellosisAssessment {
  state: BrucellosisState;
  /** Days between the test and the mating date. Null when never tested. */
  ageDays: number | null;
  /** True when a mating on this date should not go ahead on this evidence. */
  blocks: boolean;
  reason: string;
}

/**
 * Assess one dog's brucellosis evidence against the date it would be bred.
 *
 * `matingOn` is the date being booked, not today: a test taken now is current
 * for a mating in three weeks and stale for one in three months, and judging it
 * against the wrong date is how a booking gets accepted on evidence that will
 * have expired by the time it is used.
 */
export function assessBrucellosis(
  input: BrucellosisInput | null | undefined,
  matingOn: Date,
): BrucellosisAssessment {
  if (!input?.testedAt) {
    return {
      state: 'MISSING',
      ageDays: null,
      blocks: true,
      reason: 'No brucellosis test on file. One is expected within 30 days of the mating.',
    };
  }

  if (input.outcome && input.outcome !== 'NORMAL') {
    return {
      state: 'POSITIVE',
      ageDays: null,
      blocks: true,
      reason: 'The brucellosis result on file is not negative. Do not breed on this.',
    };
  }

  const ageDays = Math.floor((matingOn.getTime() - input.testedAt.getTime()) / DAY_MS);
  if (ageDays > BRUCELLOSIS_WINDOW_DAYS) {
    return {
      state: 'STALE',
      ageDays,
      blocks: true,
      reason: `The brucellosis test would be ${ageDays} days old by then. It needs to be within ${BRUCELLOSIS_WINDOW_DAYS} days of the mating.`,
    };
  }

  // A test dated after the mating is not a problem — a booking weeks out is
  // routinely made before the bloods are drawn, and a future date just means
  // it has not happened yet as far as today is concerned.
  return {
    state: 'CURRENT',
    ageDays,
    blocks: false,
    reason:
      ageDays < 0
        ? 'Brucellosis test is dated after this window.'
        : `Brucellosis test is ${ageDays} days old at the start of the window.`,
  };
}
