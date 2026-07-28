/**
 * Heat cycles, progesterone timing, and whelp forecasting.
 *
 * This is the domain-heavy part of the workspace and the part where being
 * wrong has real consequences — a mistimed frozen-semen breeding is one lost
 * cycle and several thousand dollars.
 *
 * Two principles run through the whole file:
 *
 *   1. Every prediction carries its confidence and the evidence behind it.
 *      A next-heat date from two cycles is a guess; from six it is a forecast.
 *      The UI must never present them identically.
 *   2. We time from OVULATION where we can, and say so when we cannot.
 *      Gestation is remarkably consistent from ovulation (63 ± 1 days) and
 *      wildly variable from the breeding date (58–68). Software that forecasts
 *      from the breeding date and presents a single confident day is lying.
 *
 * Pure module. No clock, no I/O.
 */

import { addDays, daysBetween, startOfDay } from './dates.js';

// ── Heat cycle prediction ───────────────────────────────────────────────────

export interface HeatCycleInput {
  /** First day of proestrus — the first day of visible discharge. */
  startedOn: Date;
  endedOn?: Date | null;
}

export type PredictionConfidence = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';

export interface HeatPrediction {
  /** Best estimate of the next proestrus onset. Null when we cannot say. */
  predictedStart: Date | null;
  /** Plausible window, widened by the observed variance. */
  windowStart: Date | null;
  windowEnd: Date | null;
  /** Mean days between observed cycles. */
  averageIntervalDays: number | null;
  /** Standard deviation of the intervals. The honesty term. */
  intervalStdDevDays: number | null;
  cyclesObserved: number;
  confidence: PredictionConfidence;
  note: string;
  /** Days from `now` to `predictedStart`. Negative means overdue. */
  daysAway: number | null;
}

/**
 * Typical interval between heats. Used only to widen the window when we have
 * a single cycle, never to invent a prediction from none.
 */
const TYPICAL_INTERVAL_DAYS = 195; // ~6.5 months
const SINGLE_CYCLE_WINDOW_DAYS = 45;

export function predictNextHeat(cycles: readonly HeatCycleInput[], now: Date): HeatPrediction {
  const sorted = [...cycles]
    .map((c) => startOfDay(c.startedOn))
    .sort((a, b) => a.getTime() - b.getTime());

  if (sorted.length === 0) {
    return {
      predictedStart: null,
      windowStart: null,
      windowEnd: null,
      averageIntervalDays: null,
      intervalStdDevDays: null,
      cyclesObserved: 0,
      confidence: 'NONE',
      note: 'No cycles logged yet. Log the first day of two heats and we can start forecasting.',
      daysAway: null,
    };
  }

  const last = sorted[sorted.length - 1]!;

  if (sorted.length === 1) {
    // One cycle gives a starting point, not a forecast. The window is
    // deliberately wide — six weeks either side of a breed-typical interval —
    // because presenting a single day here would be false precision.
    const predicted = addDays(last, TYPICAL_INTERVAL_DAYS);
    return {
      predictedStart: predicted,
      windowStart: addDays(predicted, -SINGLE_CYCLE_WINDOW_DAYS),
      windowEnd: addDays(predicted, SINGLE_CYCLE_WINDOW_DAYS),
      averageIntervalDays: null,
      intervalStdDevDays: null,
      cyclesObserved: 1,
      confidence: 'LOW',
      note: 'Only one cycle on record, so this is a breed-typical interval rather than her own. Log her next heat and the forecast becomes hers.',
      daysAway: daysBetween(now, predicted),
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) intervals.push(daysBetween(sorted[i - 1]!, sorted[i]!));

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  const predicted = addDays(last, Math.round(mean));
  // Two standard deviations, floored at a week — no bitch is so regular that a
  // three-day window is honest.
  const spread = Math.max(7, Math.round(stdDev * 2));

  const confidence: PredictionConfidence =
    intervals.length >= 4 && stdDev <= 14
      ? 'HIGH'
      : intervals.length >= 2 && stdDev <= 21
        ? 'MODERATE'
        : 'LOW';

  const note =
    confidence === 'HIGH'
      ? `Based on ${intervals.length} intervals averaging ${Math.round(mean)} days, varying by about ${Math.round(stdDev)}.`
      : confidence === 'MODERATE'
        ? `Based on ${intervals.length} interval${intervals.length === 1 ? '' : 's'}. Her cycles vary by about ${Math.round(stdDev)} days, so treat the window as the answer, not the date.`
        : `Her intervals vary by about ${Math.round(stdDev)} days — that is a lot. Use the window, and watch for the physical signs rather than the calendar.`;

  return {
    predictedStart: predicted,
    windowStart: addDays(predicted, -spread),
    windowEnd: addDays(predicted, spread),
    averageIntervalDays: Math.round(mean * 10) / 10,
    intervalStdDevDays: Math.round(stdDev * 10) / 10,
    cyclesObserved: sorted.length,
    confidence,
    note,
    daysAway: daysBetween(now, predicted),
  };
}

// ── Progesterone ────────────────────────────────────────────────────────────

export type ProgesteroneUnit = 'NG_ML' | 'NMOL_L';

/** 1 ng/mL ≈ 3.18 nmol/L. */
export function toNgMl(value: number, unit: ProgesteroneUnit): number {
  return unit === 'NG_ML' ? value : value / 3.18;
}

export interface ProgesteroneReading {
  takenOn: Date;
  value: number;
  unit: ProgesteroneUnit;
}

export type CyclePhase =
  | 'BASELINE'
  | 'RISING'
  | 'LH_SURGE'
  | 'OVULATION'
  | 'POST_OVULATION'
  | 'PAST_WINDOW';

/**
 * Reference thresholds in ng/mL.
 *
 * These are the widely-used clinical landmarks. They are landmarks, not laws:
 * assays differ between labs and individual bitches ovulate at different
 * absolute values, which is why `interpretProgesterone` reports a phase and a
 * window rather than a verdict.
 */
export const PROGESTERONE = {
  /** Below this, she has not started. */
  BASELINE_MAX: 1.0,
  /** LH surge typically occurs in this band. */
  LH_SURGE_MIN: 2.0,
  LH_SURGE_MAX: 3.0,
  /** Ovulation. */
  OVULATION_MIN: 4.0,
  OVULATION_MAX: 10.0,
} as const;

export interface ProgesteroneInterpretation {
  phase: CyclePhase;
  latest: { takenOn: Date; ngMl: number } | null;
  /** Estimated LH surge day, when the series crossed 2–3 ng/mL. */
  estimatedLhDate: Date | null;
  /** Estimated ovulation day — LH + 2, or the day the series crossed 5 ng/mL. */
  estimatedOvulationDate: Date | null;
  /** How the ovulation date was arrived at. Shown next to it, always. */
  ovulationBasis: 'MEASURED' | 'DERIVED_FROM_LH' | 'NONE';
  /** Recommended breeding window, which depends on the semen type. */
  breedingWindows: Record<SemenType, { from: Date; to: Date } | null>;
  /** When to test again, when we are not there yet. */
  retestOn: Date | null;
  note: string;
}

export type SemenType = 'NATURAL' | 'FRESH' | 'CHILLED' | 'FROZEN';

/**
 * Days after ovulation to breed, by semen type.
 *
 * Oocytes need ~2 days to mature after ovulation and remain viable ~2 days
 * after that. Fresh semen survives days in the tract; frozen survives hours.
 * So the frozen window is narrow and late, and missing it costs a cycle.
 */
const BREEDING_WINDOW_AFTER_OVULATION: Record<SemenType, [number, number]> = {
  NATURAL: [2, 5],
  FRESH: [2, 5],
  CHILLED: [2, 4],
  // Deliberately the tightest. Erring wide here is how frozen breedings fail.
  FROZEN: [3, 4],
};

/**
 * Estimate the day a rising series crossed `threshold`.
 *
 * Two deliberate choices:
 *
 *   1. **Log-linear, not linear.** Progesterone rises roughly exponentially
 *      through this phase — often doubling every couple of days. Linear
 *      interpolation between two tests therefore places the crossing
 *      systematically EARLIER than it happened.
 *
 *   2. **Round up, not to nearest.** Of the two ways to be wrong, estimating
 *      ovulation too early is far more expensive: the frozen-semen window is
 *      ovulation + 3 to + 4 days, and semen that survives hours rather than
 *      days does not forgive a day of error. Breeding a day late still catches
 *      viable oocytes; breeding a day early misses them entirely.
 *
 * So when the crossing falls between two tests, we say the later day.
 */
function interpolateCrossing(
  prev: { takenOn: Date; ngMl: number },
  next: { takenOn: Date; ngMl: number },
  threshold: number,
): Date {
  const span = daysBetween(prev.takenOn, next.takenOn);
  if (span <= 0) return next.takenOn;

  const low = Math.max(0.01, prev.ngMl);
  const high = Math.max(low + 0.01, next.ngMl);
  const fraction = Math.log(threshold / low) / Math.log(high / low);
  const offset = Math.min(span, Math.max(0, Math.ceil(span * fraction)));
  return addDays(prev.takenOn, offset);
}

export function interpretProgesterone(
  readings: readonly ProgesteroneReading[],
  now: Date,
): ProgesteroneInterpretation {
  const series = [...readings]
    .map((r) => ({ takenOn: startOfDay(r.takenOn), ngMl: toNgMl(r.value, r.unit) }))
    .sort((a, b) => a.takenOn.getTime() - b.takenOn.getTime());

  const empty: ProgesteroneInterpretation = {
    phase: 'BASELINE',
    latest: null,
    estimatedLhDate: null,
    estimatedOvulationDate: null,
    ovulationBasis: 'NONE',
    breedingWindows: { NATURAL: null, FRESH: null, CHILLED: null, FROZEN: null },
    retestOn: null,
    note: 'No progesterone readings yet. Testing usually starts around day 5–7 of proestrus, then every 2–3 days.',
  };

  if (series.length === 0) return empty;

  const latest = series[series.length - 1]!;

  // ── LH surge: first reading in the 2–3 band, or interpolated across it ──
  let estimatedLhDate: Date | null = null;
  for (let i = 0; i < series.length; i++) {
    const r = series[i]!;
    if (r.ngMl >= PROGESTERONE.LH_SURGE_MIN && r.ngMl <= PROGESTERONE.LH_SURGE_MAX) {
      estimatedLhDate = r.takenOn;
      break;
    }
    // The series can jump straight past the band between tests. Interpolate.
    const prev = series[i - 1];
    if (prev && prev.ngMl < PROGESTERONE.LH_SURGE_MIN && r.ngMl > PROGESTERONE.LH_SURGE_MAX) {
      estimatedLhDate = interpolateCrossing(prev, r, PROGESTERONE.LH_SURGE_MIN);
      break;
    }
  }

  // ── Ovulation: first reading at or above 5, else LH + 2 ──
  let estimatedOvulationDate: Date | null = null;
  let ovulationBasis: ProgesteroneInterpretation['ovulationBasis'] = 'NONE';
  for (let i = 0; i < series.length; i++) {
    const r = series[i]!;
    if (r.ngMl >= PROGESTERONE.OVULATION_MIN) {
      const prev = series[i - 1];
      estimatedOvulationDate =
        prev && prev.ngMl < PROGESTERONE.OVULATION_MIN
          ? interpolateCrossing(prev, r, PROGESTERONE.OVULATION_MIN)
          : r.takenOn;
      ovulationBasis = 'MEASURED';
      break;
    }
  }
  if (!estimatedOvulationDate && estimatedLhDate) {
    estimatedOvulationDate = addDays(estimatedLhDate, 2);
    ovulationBasis = 'DERIVED_FROM_LH';
  }

  // ── Phase ──
  let phase: CyclePhase = 'BASELINE';
  if (estimatedOvulationDate) {
    const sinceOvulation = daysBetween(estimatedOvulationDate, now);
    phase = sinceOvulation > 6 ? 'PAST_WINDOW' : sinceOvulation >= 1 ? 'POST_OVULATION' : 'OVULATION';
  } else if (latest.ngMl >= PROGESTERONE.LH_SURGE_MIN) {
    phase = 'LH_SURGE';
  } else if (latest.ngMl > PROGESTERONE.BASELINE_MAX) {
    phase = 'RISING';
  }

  // ── Breeding windows ──
  const breedingWindows: ProgesteroneInterpretation['breedingWindows'] = {
    NATURAL: null, FRESH: null, CHILLED: null, FROZEN: null,
  };
  if (estimatedOvulationDate) {
    for (const [type, [from, to]] of Object.entries(BREEDING_WINDOW_AFTER_OVULATION)) {
      breedingWindows[type as SemenType] = {
        from: addDays(estimatedOvulationDate, from),
        to: addDays(estimatedOvulationDate, to),
      };
    }
  }

  // ── Retest cadence ──
  // Testing is cheap relative to missing the window. As values climb, test
  // more often — the interval between 2 and 5 ng/mL is where cycles are lost.
  let retestOn: Date | null = null;
  if (!estimatedOvulationDate) {
    const gap = latest.ngMl < PROGESTERONE.BASELINE_MAX ? 3 : latest.ngMl < PROGESTERONE.LH_SURGE_MIN ? 2 : 1;
    retestOn = addDays(latest.takenOn, gap);
  }

  const note =
    ovulationBasis === 'MEASURED'
      ? `Ovulation estimated from a measured value of ${latest.ngMl.toFixed(1)} ng/mL or above.`
      : ovulationBasis === 'DERIVED_FROM_LH'
        ? 'Ovulation derived from the LH surge (surge + 2 days). A confirming test at or above 5 ng/mL would firm this up.'
        : phase === 'BASELINE'
          ? 'Still at baseline. Keep testing every 2–3 days.'
          : 'Values are rising but have not reached the ovulation threshold. Test again soon — this is the stretch where cycles get missed.';

  return {
    phase,
    latest,
    estimatedLhDate,
    estimatedOvulationDate,
    ovulationBasis,
    breedingWindows,
    retestOn,
    note,
  };
}

// ── Whelp forecast ──────────────────────────────────────────────────────────

/**
 * Gestation is 63 days from OVULATION, almost regardless of breed or litter
 * size, and 58–68 days from the breeding date. That ten-day spread is the
 * whole reason progesterone timing matters, and the whole reason this function
 * reports its basis.
 */
export const GESTATION_FROM_OVULATION_DAYS = 63;
export const GESTATION_FROM_LH_DAYS = 65;
export const GESTATION_FROM_BREEDING_MIN = 58;
export const GESTATION_FROM_BREEDING_MAX = 68;
export const GESTATION_FROM_BREEDING_TYPICAL = 63;

export type WhelpBasis = 'OVULATION' | 'LH_SURGE' | 'BREEDING_DATE' | 'NONE';

export interface WhelpForecast {
  dueOn: Date | null;
  /** Earliest and latest plausible whelp day. */
  earliest: Date | null;
  latest: Date | null;
  basis: WhelpBasis;
  /** Days from `now` until `dueOn`. Negative means overdue. */
  daysAway: number | null;
  /** Day of gestation as of `now`. */
  gestationDay: number | null;
  confidence: PredictionConfidence;
  note: string;
}

export function forecastWhelp(
  input: {
    ovulationDate?: Date | null;
    lhSurgeDate?: Date | null;
    /** Every tie or insemination in the breeding. */
    breedingDates?: readonly Date[];
  },
  now: Date,
): WhelpForecast {
  const none: WhelpForecast = {
    dueOn: null, earliest: null, latest: null, basis: 'NONE',
    daysAway: null, gestationDay: null, confidence: 'NONE',
    note: 'No ovulation date or breeding date on record yet.',
  };

  if (input.ovulationDate) {
    const from = startOfDay(input.ovulationDate);
    const due = addDays(from, GESTATION_FROM_OVULATION_DAYS);
    return {
      dueOn: due,
      earliest: addDays(due, -1),
      latest: addDays(due, 1),
      basis: 'OVULATION',
      daysAway: daysBetween(now, due),
      gestationDay: daysBetween(from, now),
      confidence: 'HIGH',
      note: 'Timed from ovulation, which is accurate to about a day either side.',
    };
  }

  if (input.lhSurgeDate) {
    const from = startOfDay(input.lhSurgeDate);
    const due = addDays(from, GESTATION_FROM_LH_DAYS);
    return {
      dueOn: due,
      earliest: addDays(due, -2),
      latest: addDays(due, 2),
      basis: 'LH_SURGE',
      daysAway: daysBetween(now, due),
      gestationDay: daysBetween(addDays(from, 2), now),
      confidence: 'MODERATE',
      note: 'Timed from the LH surge. A confirmed ovulation date would tighten this by a day or two.',
    };
  }

  const dates = [...(input.breedingDates ?? [])].map(startOfDay).sort((a, b) => a.getTime() - b.getTime());
  if (dates.length > 0) {
    const first = dates[0]!;
    const lastDate = dates[dates.length - 1]!;
    // Typical from the LAST breeding; the plausible range spans first-to-last.
    const due = addDays(lastDate, GESTATION_FROM_BREEDING_TYPICAL);
    return {
      dueOn: due,
      earliest: addDays(first, GESTATION_FROM_BREEDING_MIN),
      latest: addDays(lastDate, GESTATION_FROM_BREEDING_MAX),
      basis: 'BREEDING_DATE',
      daysAway: daysBetween(now, due),
      gestationDay: daysBetween(lastDate, now),
      confidence: 'LOW',
      note: 'Timed from the breeding date, which spans 58–68 days. Progesterone timing would narrow this to about two days.',
    };
  }

  return none;
}

// ── Gestation milestones ────────────────────────────────────────────────────

export interface GestationMilestone {
  day: number;
  on: Date;
  label: string;
  detail: string;
  kind: 'CHECK' | 'CARE' | 'PREP' | 'ALERT';
  done: boolean;
}

/**
 * The gestation calendar a breeder actually works to.
 *
 * Anchored to the day of ovulation where known, which is why `forecastWhelp`
 * reports its basis — a milestone calendar built on a breeding date can be
 * five days out, and an ultrasound five days early shows nothing.
 */
export function gestationMilestones(conceptionDay: Date, now: Date): GestationMilestone[] {
  const anchor = startOfDay(conceptionDay);
  const spec: Omit<GestationMilestone, 'on' | 'done'>[] = [
    {
      day: 21,
      label: 'Earliest ultrasound',
      detail: 'Heartbeats become visible around day 21–25. Earlier than this and a negative means nothing.',
      kind: 'CHECK',
    },
    {
      day: 28,
      label: 'Ultrasound — pregnancy confirmation',
      detail: 'The reliable window. Counts are unreliable on ultrasound; that is what the x-ray is for.',
      kind: 'CHECK',
    },
    {
      day: 35,
      label: 'Increase feed',
      detail: 'Begin raising intake gradually — roughly 10% per week from here.',
      kind: 'CARE',
    },
    {
      day: 45,
      label: 'Whelping box',
      detail: 'Introduce the box now so she settles into it before she needs it.',
      kind: 'PREP',
    },
    {
      day: 55,
      label: 'X-ray — puppy count',
      detail: 'Skeletons are mineralised enough to count. Knowing the count is how you know when she is finished.',
      kind: 'CHECK',
    },
    {
      day: 58,
      label: 'Begin temperature checks',
      detail: 'Twice daily. A drop below about 99°F (37.2°C) usually precedes whelping within 24 hours.',
      kind: 'ALERT',
    },
    {
      day: 63,
      label: 'Due',
      detail: 'Sixty-three days from ovulation. Whelping within a day either side is normal.',
      kind: 'ALERT',
    },
    {
      day: 65,
      label: 'Overdue — call the vet',
      detail: 'Past 65 days from a confirmed ovulation warrants a call, not a wait.',
      kind: 'ALERT',
    },
  ];

  return spec.map((m) => {
    const on = addDays(anchor, m.day);
    return { ...m, on, done: daysBetween(on, now) >= 0 };
  });
}
