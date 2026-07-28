/**
 * Puppy growth.
 *
 * Weight is the single most useful number in a whelping box. A puppy that
 * stops gaining is in trouble hours before it looks like it, and the whole
 * reason breeders weigh twice a day for the first fortnight is to catch that
 * window.
 *
 * So this module's job is not to draw a pretty curve. It is to answer one
 * question fast, at 3am, on a phone: **is this puppy in trouble?**
 *
 * Pure module. No clock, no I/O.
 */

import { ageInDays, daysBetween, startOfDay } from './dates.js';

export type BreedSize = 'TOY' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'GIANT';

export const BREED_SIZE_LABEL: Record<BreedSize, string> = {
  TOY: 'Toy (under 5 kg adult)',
  SMALL: 'Small (5–11 kg)',
  MEDIUM: 'Medium (11–25 kg)',
  LARGE: 'Large (25–45 kg)',
  GIANT: 'Giant (over 45 kg)',
};

/** Typical birth weight in grams, by adult size. Used only as a sanity check. */
export const TYPICAL_BIRTH_WEIGHT_G: Record<BreedSize, [number, number]> = {
  TOY: [70, 150],
  SMALL: [130, 250],
  MEDIUM: [250, 450],
  LARGE: [400, 650],
  GIANT: [550, 900],
};

/**
 * Expected weight as a multiple of birth weight, by age in days.
 *
 * Relative early growth is remarkably consistent across breeds — a Chihuahua
 * and a Great Dane both roughly double birth weight by day 10 — which is why
 * this is expressed as a multiple rather than absolute grams. Absolute charts
 * would need a curve per breed and would be wrong for every crossbreed.
 *
 * This is a REFERENCE BAND, not a breed standard. It is here to catch a puppy
 * falling off its own trajectory, which is what actually matters.
 */
const GROWTH_MULTIPLE: [day: number, multiple: number][] = [
  [0, 1.0],
  [1, 1.0], // a small loss on day 1 is normal
  [3, 1.2],
  [7, 1.75],
  [10, 2.0], // the classic "double by 10 days"
  [14, 2.5],
  [21, 3.5],
  [28, 4.5],
  [35, 5.8],
  [42, 7.0],
  [49, 8.2],
  [56, 9.5], // eight weeks — go-home age
];

/** Linear interpolation across the reference band. */
export function expectedMultiple(ageDays: number): number {
  if (ageDays <= 0) return 1;
  const last = GROWTH_MULTIPLE[GROWTH_MULTIPLE.length - 1]!;
  if (ageDays >= last[0]) {
    // Past eight weeks, extrapolate gently rather than flat-lining.
    return last[1] + (ageDays - last[0]) * 0.1;
  }
  for (let i = 1; i < GROWTH_MULTIPLE.length; i++) {
    const [d1, m1] = GROWTH_MULTIPLE[i]!;
    const [d0, m0] = GROWTH_MULTIPLE[i - 1]!;
    if (ageDays <= d1) {
      const t = (ageDays - d0) / (d1 - d0);
      return m0 + t * (m1 - m0);
    }
  }
  return 1;
}

export function expectedWeightGrams(birthWeightGrams: number, ageDays: number): number {
  return Math.round(birthWeightGrams * expectedMultiple(ageDays));
}

export interface WeightRecord {
  recordedOn: Date;
  grams: number;
}

export type GrowthFlagKind =
  | 'BELOW_BIRTH_WEIGHT'
  | 'NO_GAIN_24H'
  | 'WEIGHT_LOSS'
  | 'BELOW_EXPECTED'
  | 'SMALLEST_IN_LITTER'
  | 'FAILED_TO_DOUBLE';

export interface GrowthFlag {
  kind: GrowthFlagKind;
  severity: 'WATCH' | 'URGENT';
  message: string;
  observedOn: Date;
}

export interface GrowthAssessment {
  latestGrams: number | null;
  latestOn: Date | null;
  birthWeightGrams: number | null;
  ageDays: number | null;
  /** Latest ÷ birth weight. */
  multipleOfBirthWeight: number | null;
  expectedGrams: number | null;
  /** Latest ÷ expected. 1.0 is exactly on the reference band. */
  ratioToExpected: number | null;
  /** Mean grams per day over the last three records. */
  recentDailyGainGrams: number | null;
  flags: GrowthFlag[];
  /** The one line to show at the top of a card. */
  summary: string;
}

/**
 * Assess one puppy.
 *
 * Flags are ordered by urgency and phrased as observations, not diagnoses.
 * Software should tell a breeder *what it sees*; the breeder and their vet
 * decide what it means.
 */
export function assessGrowth(
  records: readonly WeightRecord[],
  opts: { bornOn: Date; now: Date },
): GrowthAssessment {
  const series = [...records]
    .map((r) => ({ recordedOn: startOfDay(r.recordedOn), grams: r.grams }))
    .sort((a, b) => a.recordedOn.getTime() - b.recordedOn.getTime());

  if (series.length === 0) {
    return {
      latestGrams: null, latestOn: null, birthWeightGrams: null, ageDays: null,
      multipleOfBirthWeight: null, expectedGrams: null, ratioToExpected: null,
      recentDailyGainGrams: null, flags: [],
      summary: 'No weights recorded yet.',
    };
  }

  const birth = series[0]!;
  const latest = series[series.length - 1]!;
  const ageDays = ageInDays(opts.bornOn, latest.recordedOn);
  const expected = expectedWeightGrams(birth.grams, ageDays);
  const multiple = latest.grams / birth.grams;
  const ratio = expected === 0 ? null : latest.grams / expected;

  // Mean daily gain over the last few records, which is what a breeder is
  // actually watching between weigh-ins.
  const window = series.slice(-3);
  let recentDailyGain: number | null = null;
  if (window.length >= 2) {
    const first = window[0]!;
    const span = Math.max(1, daysBetween(first.recordedOn, latest.recordedOn));
    recentDailyGain = Math.round((latest.grams - first.grams) / span);
  }

  const flags: GrowthFlag[] = [];

  // ── Urgent ──
  if (ageDays >= 2 && latest.grams < birth.grams) {
    flags.push({
      kind: 'BELOW_BIRTH_WEIGHT',
      severity: 'URGENT',
      message: `Still below birth weight at day ${ageDays}. A puppy should be back above it by day 2.`,
      observedOn: latest.recordedOn,
    });
  }

  if (series.length >= 2) {
    const prev = series[series.length - 2]!;
    const gap = daysBetween(prev.recordedOn, latest.recordedOn);
    if (gap <= 2 && latest.grams < prev.grams) {
      flags.push({
        kind: 'WEIGHT_LOSS',
        severity: 'URGENT',
        message: `Lost ${prev.grams - latest.grams} g since the last weigh-in.`,
        observedOn: latest.recordedOn,
      });
    } else if (ageDays <= 14 && gap >= 1 && latest.grams === prev.grams) {
      flags.push({
        kind: 'NO_GAIN_24H',
        severity: 'URGENT',
        message: 'No gain since the last weigh-in. In the first two weeks a flat day is a warning.',
        observedOn: latest.recordedOn,
      });
    }
  }

  if (ageDays >= 10 && multiple < 2) {
    flags.push({
      kind: 'FAILED_TO_DOUBLE',
      severity: ageDays >= 14 ? 'URGENT' : 'WATCH',
      message: `Has not doubled birth weight by day ${ageDays} — currently ${multiple.toFixed(2)}×. Most puppies double by day 10.`,
      observedOn: latest.recordedOn,
    });
  }

  // ── Watch ──
  if (ratio !== null && ratio < 0.8 && ageDays >= 5) {
    flags.push({
      kind: 'BELOW_EXPECTED',
      severity: 'WATCH',
      message: `About ${Math.round((1 - ratio) * 100)}% below the reference band for day ${ageDays}. Small can be normal — a falling trend is not.`,
      observedOn: latest.recordedOn,
    });
  }

  flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'URGENT' ? -1 : 1));

  const summary =
    flags.length === 0
      ? `${latest.grams} g at day ${ageDays} — ${multiple.toFixed(2)}× birth weight, tracking the band.`
      : flags[0]!.message;

  return {
    latestGrams: latest.grams,
    latestOn: latest.recordedOn,
    birthWeightGrams: birth.grams,
    ageDays,
    multipleOfBirthWeight: Math.round(multiple * 100) / 100,
    expectedGrams: expected,
    ratioToExpected: ratio === null ? null : Math.round(ratio * 1000) / 1000,
    recentDailyGainGrams: recentDailyGain,
    flags,
    summary,
  };
}

export interface SiblingComparison {
  puppyId: string;
  latestGrams: number | null;
  /** 0–1 within the litter on the same day. */
  rankFraction: number | null;
  rank: number | null;
  ofTotal: number;
  /** Grams below the litter median. Positive means above. */
  vsMedianGrams: number | null;
}

/**
 * Compare littermates on the most recent shared day.
 *
 * The litter is its own best control group: same dam, same milk, same day.
 * A puppy 30% below its siblings matters far more than one 30% below a
 * generic curve.
 */
export function compareSiblings(
  litter: readonly { puppyId: string; records: readonly WeightRecord[] }[],
): SiblingComparison[] {
  const latestByPuppy = litter.map((p) => {
    const sorted = [...p.records].sort(
      (a, b) => startOfDay(a.recordedOn).getTime() - startOfDay(b.recordedOn).getTime(),
    );
    const last = sorted[sorted.length - 1];
    return { puppyId: p.puppyId, latestGrams: last?.grams ?? null };
  });

  const weights = latestByPuppy
    .map((p) => p.latestGrams)
    .filter((g): g is number => g !== null)
    .sort((a, b) => a - b);

  if (weights.length === 0) {
    return latestByPuppy.map((p) => ({
      puppyId: p.puppyId, latestGrams: null, rankFraction: null,
      rank: null, ofTotal: litter.length, vsMedianGrams: null,
    }));
  }

  const median =
    weights.length % 2 === 1
      ? weights[(weights.length - 1) / 2]!
      : (weights[weights.length / 2 - 1]! + weights[weights.length / 2]!) / 2;

  // Heaviest ranks 1 — breeders read the list top-down looking for the runt.
  const descending = [...latestByPuppy]
    .filter((p) => p.latestGrams !== null)
    .sort((a, b) => b.latestGrams! - a.latestGrams!);

  return latestByPuppy.map((p) => {
    if (p.latestGrams === null) {
      return {
        puppyId: p.puppyId, latestGrams: null, rankFraction: null,
        rank: null, ofTotal: litter.length, vsMedianGrams: null,
      };
    }
    const rank = descending.findIndex((d) => d.puppyId === p.puppyId) + 1;
    return {
      puppyId: p.puppyId,
      latestGrams: p.latestGrams,
      rank,
      ofTotal: descending.length,
      rankFraction: descending.length <= 1 ? 1 : 1 - (rank - 1) / (descending.length - 1),
      vsMedianGrams: Math.round(p.latestGrams - median),
    };
  });
}

/** Points for the reference band on a chart, from birth to `throughDay`. */
export function referenceBand(
  birthWeightGrams: number,
  throughDay: number,
): { day: number; grams: number; lowGrams: number; highGrams: number }[] {
  const out = [];
  for (let day = 0; day <= throughDay; day++) {
    const grams = expectedWeightGrams(birthWeightGrams, day);
    out.push({
      day,
      grams,
      // ±20% — the band inside which nobody should be alarmed.
      lowGrams: Math.round(grams * 0.8),
      highGrams: Math.round(grams * 1.2),
    });
  }
  return out;
}
