/**
 * Does the verified tier actually convert better?
 *
 * That is the Phase 9 gate, and it is a question the platform has to be able
 * to answer honestly — including if the answer is no. Every function here is
 * built so that a null result is reportable rather than embarrassing.
 *
 * ── Three rules ────────────────────────────────────────────────────────────
 *
 * 1. **The tier is the tier at the time of the event.** Comparing today's
 *    verification counts against historic behaviour would credit verification
 *    for conversions that happened before any of it existed. Callers pass
 *    snapshotted events; this module never looks anything up.
 *
 * 2. **A small sample says so.** A 100% conversion rate on two impressions is
 *    not a finding, and reporting it as one is how a company convinces itself
 *    of something untrue. Every rate carries its denominator and a flag.
 *
 * 3. **Nothing is weighted, smoothed or adjusted.** These are counts and
 *    ratios. The moment a growth metric gets a fudge factor it stops being
 *    evidence and becomes an argument.
 *
 * Pure module. No I/O, no clock.
 */

export type FunnelStep =
  | 'LISTING_IMPRESSION'
  | 'LISTING_VIEW'
  | 'APPLY_STARTED'
  | 'INQUIRY_SENT'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_APPROVED'
  | 'DEPOSIT_PAID'
  | 'PLACEMENT_COMPLETED';

/** The order a buyer moves through. Used to compute step-to-step conversion. */
export const FUNNEL_ORDER: FunnelStep[] = [
  'LISTING_IMPRESSION',
  'LISTING_VIEW',
  'APPLY_STARTED',
  'APPLICATION_SUBMITTED',
  'APPLICATION_APPROVED',
  'DEPOSIT_PAID',
  'PLACEMENT_COMPLETED',
];

export interface FunnelEventInput {
  step: FunnelStep;
  /** Verified claims across BOTH parents, at the moment of the event. */
  verifiedParentClaims: number;
  parentDensity: number;
  hadConflict: boolean;
  channel?: string | null;
  litterListingId?: string | null;
}

/**
 * Verification bands.
 *
 * Chosen to mean something to a breeder rather than to a statistician: none at
 * all, a partial panel, and a complete one. Any pair of parents with ten or
 * more verified results between them has had the full expected workup on both
 * sides for most breeds.
 */
export type VerificationBand = 'NONE' | 'PARTIAL' | 'FULL';

export function bandOf(verifiedParentClaims: number): VerificationBand {
  if (verifiedParentClaims <= 0) return 'NONE';
  if (verifiedParentClaims < 10) return 'PARTIAL';
  return 'FULL';
}

export const BAND_LABEL: Record<VerificationBand, string> = {
  NONE: 'No verified results on either parent',
  PARTIAL: 'Some verified results',
  FULL: 'A full verified panel on both parents',
};

/**
 * Below this, a rate is reported but explicitly marked as not yet evidence.
 *
 * Deliberately conservative. The cost of believing a false positive here is
 * building a whole company around a claim that does not hold.
 */
export const MIN_SAMPLE = 30;

export interface StepCount {
  step: FunnelStep;
  count: number;
  /** Conversion from the previous step in FUNNEL_ORDER. Null for the first. */
  fromPrevious: number | null;
}

export interface BandFunnel {
  band: VerificationBand;
  label: string;
  steps: StepCount[];
  /** Impression → application. The headline number. */
  impressionToApplication: number | null;
  /** View → application. Fairer when impressions are not comparably logged. */
  viewToApplication: number | null;
  impressions: number;
  views: number;
  applications: number;
  /** True when there is not enough here to conclude anything. */
  underpowered: boolean;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Count events per step for one band, with step-to-step conversion. */
function stepsFor(events: readonly FunnelEventInput[]): StepCount[] {
  const counts = new Map<FunnelStep, number>();
  for (const e of events) counts.set(e.step, (counts.get(e.step) ?? 0) + 1);

  return FUNNEL_ORDER.map((step, i) => {
    const count = counts.get(step) ?? 0;
    const prev = i === 0 ? null : (counts.get(FUNNEL_ORDER[i - 1]!) ?? 0);
    return { step, count, fromPrevious: prev == null ? null : rate(count, prev) };
  });
}

export function funnelByBand(events: readonly FunnelEventInput[]): BandFunnel[] {
  const bands: VerificationBand[] = ['NONE', 'PARTIAL', 'FULL'];

  return bands.map((band) => {
    const mine = events.filter((e) => bandOf(e.verifiedParentClaims) === band);
    const steps = stepsFor(mine);
    const impressions = steps.find((s) => s.step === 'LISTING_IMPRESSION')?.count ?? 0;
    const views = steps.find((s) => s.step === 'LISTING_VIEW')?.count ?? 0;
    const applications = steps.find((s) => s.step === 'APPLICATION_SUBMITTED')?.count ?? 0;

    return {
      band,
      label: BAND_LABEL[band],
      steps,
      impressionToApplication: rate(applications, impressions),
      viewToApplication: rate(applications, views),
      impressions,
      views,
      applications,
      underpowered: views < MIN_SAMPLE,
    };
  });
}

export interface VerificationLift {
  /** Multiplier on view→application for FULL versus NONE. Null if either is empty. */
  lift: number | null;
  fullRate: number | null;
  noneRate: number | null;
  /** The smaller of the two denominators — what the claim really rests on. */
  smallestSample: number;
  /** True when the numbers are too thin to draw a conclusion from. */
  underpowered: boolean;
  /**
   * What can honestly be said, in one sentence. Written here rather than in
   * the UI so that every surface reporting this says the same thing, including
   * when the honest sentence is "we do not know yet".
   */
  verdict: string;
}

/**
 * The headline: does a full verified panel convert better than none?
 *
 * Returns a null lift and says so when the data cannot support an answer. This
 * is the one number most likely to be quoted in a pitch, which is exactly why
 * it refuses to round a shrug up into a result.
 */
export function verificationLift(events: readonly FunnelEventInput[]): VerificationLift {
  const byBand = funnelByBand(events);
  const full = byBand.find((b) => b.band === 'FULL')!;
  const none = byBand.find((b) => b.band === 'NONE')!;

  const fullRate = full.viewToApplication;
  const noneRate = none.viewToApplication;
  const smallestSample = Math.min(full.views, none.views);
  const underpowered = smallestSample < MIN_SAMPLE;

  if (fullRate == null || noneRate == null) {
    return {
      lift: null,
      fullRate,
      noneRate,
      smallestSample,
      underpowered: true,
      verdict:
        'Not enough traffic on one side of the comparison to say anything yet. This is a measurement, not a claim.',
    };
  }

  if (noneRate === 0) {
    return {
      lift: null,
      fullRate,
      noneRate,
      smallestSample,
      underpowered,
      verdict:
        'No unverified listing has converted at all, so there is no baseline to divide by. Reported as a count rather than a multiple.',
    };
  }

  const lift = fullRate / noneRate;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  if (underpowered) {
    return {
      lift,
      fullRate,
      noneRate,
      smallestSample,
      underpowered: true,
      verdict: `Fully verified listings convert at ${pct(fullRate)} against ${pct(noneRate)}, but on only ${smallestSample} views in the smaller group. Directionally interesting; not yet evidence.`,
    };
  }

  if (lift < 1) {
    // Reported as plainly as a win would be. A growth metric that can only
    // move one way is not a measurement.
    return {
      lift,
      fullRate,
      noneRate,
      smallestSample,
      underpowered: false,
      verdict: `Fully verified listings convert at ${pct(fullRate)} against ${pct(noneRate)} for unverified ones — ${((1 - lift) * 100).toFixed(0)}% WORSE. The verification thesis is not showing up in this data.`,
    };
  }

  return {
    lift,
    fullRate,
    noneRate,
    smallestSample,
    underpowered: false,
    verdict: `Fully verified listings convert at ${pct(fullRate)} against ${pct(noneRate)} for unverified ones — ${lift.toFixed(1)}× better, on ${smallestSample} views in the smaller group.`,
  };
}

// ── Channel mix ────────────────────────────────────────────────────────────

export interface ChannelShare {
  channel: string;
  views: number;
  share: number;
  applications: number;
  conversion: number | null;
}

/**
 * Where the traffic comes from.
 *
 * The other half of the gate is that organic is the *primary* channel. A
 * marketplace that has to buy every visitor has not built a moat, it has
 * rented one.
 */
export function channelMix(events: readonly FunnelEventInput[]): {
  channels: ChannelShare[];
  organicShare: number | null;
  primaryChannel: string | null;
  meetsOrganicGoal: boolean;
} {
  const views = events.filter((e) => e.step === 'LISTING_VIEW');
  const applications = events.filter((e) => e.step === 'APPLICATION_SUBMITTED');
  const total = views.length;

  const names = [...new Set(views.map((e) => e.channel ?? 'direct'))];
  const channels: ChannelShare[] = names
    .map((channel) => {
      const v = views.filter((e) => (e.channel ?? 'direct') === channel).length;
      const a = applications.filter((e) => (e.channel ?? 'direct') === channel).length;
      return {
        channel,
        views: v,
        share: total > 0 ? v / total : 0,
        applications: a,
        conversion: rate(a, v),
      };
    })
    .sort((a, b) => b.views - a.views);

  const organic = channels.find((c) => c.channel === 'organic');
  const organicShare = total > 0 ? (organic?.views ?? 0) / total : null;

  return {
    channels,
    organicShare,
    primaryChannel: channels[0]?.channel ?? null,
    // Primary means the largest single channel, not a majority — a healthy mix
    // rarely gives anything more than half.
    meetsOrganicGoal: channels[0]?.channel === 'organic' && (organic?.views ?? 0) > 0,
  };
}

// ── Review scoring ─────────────────────────────────────────────────────────

export interface ReviewInput {
  overall: number;
  communication?: number | null;
  healthOfPuppy?: number | null;
  honestyAboutMatch?: number | null;
  supportAfterward?: number | null;
  daysAfterPlacement?: number | null;
}

export interface ReviewSummary {
  count: number;
  /** The mean of authored overall scores. Not derived from the dimensions. */
  overall: number | null;
  dimensions: {
    communication: number | null;
    healthOfPuppy: number | null;
    honestyAboutMatch: number | null;
    supportAfterward: number | null;
  };
  /** Reviews written a year or more after collection. */
  longTermCount: number;
  /** Said out loud rather than hidden behind a star average. */
  note: string | null;
}

const YEAR_DAYS = 365;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Summarise reviews without flattering anybody.
 *
 * The overall score is the mean of what people actually wrote as their
 * overall, never the average of the four dimensions — a buyer's summary
 * judgement is not the mean of its parts, and computing it that way would
 * quietly overwrite what they said.
 *
 * A rating built on three reviews is labelled as such. Every marketplace shows
 * "4.7 ★" over two reviews and it is the single most misleading number in the
 * category.
 */
export function summariseReviews(reviews: readonly ReviewInput[]): ReviewSummary {
  const count = reviews.length;
  const pick = (key: keyof ReviewInput) =>
    mean(reviews.map((r) => r[key]).filter((n): n is number => typeof n === 'number'));

  const longTermCount = reviews.filter(
    (r) => (r.daysAfterPlacement ?? 0) >= YEAR_DAYS,
  ).length;

  let note: string | null = null;
  if (count === 0) {
    note = 'No reviews yet. Only somebody who completed a purchase through Stud can leave one.';
  } else if (count < 5) {
    note = `Based on ${count} review${count === 1 ? '' : 's'} — too few to average meaningfully. Read them rather than the number.`;
  } else if (longTermCount === 0) {
    note =
      'Every review here was written within a year of collection. A review left on pickup day measures excitement; one left at three years measures the breeder.';
  }

  return {
    count,
    overall: pick('overall'),
    dimensions: {
      communication: pick('communication'),
      healthOfPuppy: pick('healthOfPuppy'),
      honestyAboutMatch: pick('honestyAboutMatch'),
      supportAfterward: pick('supportAfterward'),
    },
    longTermCount,
    note,
  };
}
