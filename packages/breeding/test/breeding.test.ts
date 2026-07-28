import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageInWeeks,
  assessGrowth,
  compareSiblings,
  daysBetween,
  expectedMultiple,
  expectedWeightGrams,
  forecastWhelp,
  generateCareSchedule,
  gestationMilestones,
  interpretProgesterone,
  litterMilestones,
  predictNextHeat,
  referenceBand,
  toNgMl,
} from '../src/index.js';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ── Dates ───────────────────────────────────────────────────────────────────

describe('date arithmetic', () => {
  it('works in whole calendar days regardless of time of day', () => {
    // A breeder logging a heat at 11pm must not land a day off.
    const late = new Date('2026-03-01T23:45:00Z');
    const early = new Date('2026-03-02T00:15:00Z');
    expect(daysBetween(late, early)).toBe(1);
  });

  it('adds days across a month boundary', () => {
    expect(addDays(d('2026-01-30'), 3).toISOString().slice(0, 10)).toBe('2026-02-02');
  });

  it('counts age in whole weeks', () => {
    expect(ageInWeeks(d('2026-01-01'), d('2026-01-14'))).toBe(1);
    expect(ageInWeeks(d('2026-01-01'), d('2026-01-15'))).toBe(2);
  });
});

// ── Heat prediction ─────────────────────────────────────────────────────────

describe('heat prediction', () => {
  it('refuses to predict from nothing', () => {
    const p = predictNextHeat([], d('2026-07-01'));
    expect(p.predictedStart).toBeNull();
    expect(p.confidence).toBe('NONE');
  });

  it('gives a wide window and low confidence from a single cycle', () => {
    const p = predictNextHeat([{ startedOn: d('2026-01-10') }], d('2026-03-01'));
    expect(p.confidence).toBe('LOW');
    expect(p.averageIntervalDays).toBeNull();
    // Ninety days wide — deliberately, because one cycle is not a pattern.
    expect(daysBetween(p.windowStart!, p.windowEnd!)).toBe(90);
    expect(p.note).toMatch(/breed-typical/i);
  });

  it('uses her own interval once there are two cycles', () => {
    const p = predictNextHeat(
      [{ startedOn: d('2025-01-05') }, { startedOn: d('2025-07-14') }],
      d('2026-01-01'),
    );
    expect(p.averageIntervalDays).toBe(190);
    expect(p.predictedStart!.toISOString().slice(0, 10)).toBe('2026-01-20');
    expect(p.cyclesObserved).toBe(2);
  });

  it('reports high confidence for a regular bitch', () => {
    const p = predictNextHeat(
      [
        { startedOn: d('2024-01-01') },
        { startedOn: d('2024-07-05') },
        { startedOn: d('2025-01-06') },
        { startedOn: d('2025-07-10') },
        { startedOn: d('2026-01-09') },
      ],
      d('2026-06-01'),
    );
    expect(p.confidence).toBe('HIGH');
    expect(p.intervalStdDevDays!).toBeLessThan(5);
  });

  it('drops confidence and widens the window for an irregular bitch', () => {
    const p = predictNextHeat(
      [
        { startedOn: d('2024-01-01') },
        { startedOn: d('2024-05-01') },
        { startedOn: d('2025-02-01') },
        { startedOn: d('2025-05-15') },
      ],
      d('2026-01-01'),
    );
    expect(p.confidence).toBe('LOW');
    expect(p.intervalStdDevDays!).toBeGreaterThan(21);
    expect(p.note).toMatch(/physical signs/i);
  });

  it('never returns a window narrower than a week', () => {
    // Even a perfectly regular bitch does not deserve a three-day promise.
    const p = predictNextHeat(
      [{ startedOn: d('2025-01-01') }, { startedOn: d('2025-07-01') }, { startedOn: d('2025-12-29') }],
      d('2026-01-01'),
    );
    expect(daysBetween(p.windowStart!, p.windowEnd!)).toBeGreaterThanOrEqual(14);
  });

  it('reports overdue as negative days away', () => {
    const p = predictNextHeat(
      [{ startedOn: d('2025-01-01') }, { startedOn: d('2025-07-01') }],
      d('2026-03-01'),
    );
    expect(p.daysAway!).toBeLessThan(0);
  });
});

// ── Progesterone ────────────────────────────────────────────────────────────

describe('progesterone interpretation', () => {
  it('converts nmol/L to ng/mL', () => {
    expect(toNgMl(15.9, 'NMOL_L')).toBeCloseTo(5, 1);
    expect(toNgMl(5, 'NG_ML')).toBe(5);
  });

  it('says nothing useful with no readings, and says so', () => {
    const r = interpretProgesterone([], d('2026-03-01'));
    expect(r.phase).toBe('BASELINE');
    expect(r.estimatedOvulationDate).toBeNull();
    expect(r.note).toMatch(/no progesterone readings/i);
  });

  it('keeps a baseline series at baseline and schedules a retest', () => {
    const r = interpretProgesterone(
      [
        { takenOn: d('2026-03-01'), value: 0.4, unit: 'NG_ML' },
        { takenOn: d('2026-03-04'), value: 0.7, unit: 'NG_ML' },
      ],
      d('2026-03-04'),
    );
    expect(r.phase).toBe('BASELINE');
    expect(r.retestOn!.toISOString().slice(0, 10)).toBe('2026-03-07');
  });

  it('identifies the LH surge in the 2–3 band', () => {
    const r = interpretProgesterone(
      [
        { takenOn: d('2026-03-01'), value: 0.5, unit: 'NG_ML' },
        { takenOn: d('2026-03-04'), value: 2.4, unit: 'NG_ML' },
      ],
      d('2026-03-04'),
    );
    expect(r.estimatedLhDate!.toISOString().slice(0, 10)).toBe('2026-03-04');
    // No measured ovulation yet, so derive it from the surge and say so.
    expect(r.ovulationBasis).toBe('DERIVED_FROM_LH');
    expect(r.estimatedOvulationDate!.toISOString().slice(0, 10)).toBe('2026-03-06');
  });

  it('prefers a measured ovulation over one derived from the surge', () => {
    const r = interpretProgesterone(
      [
        { takenOn: d('2026-03-04'), value: 2.4, unit: 'NG_ML' },
        { takenOn: d('2026-03-06'), value: 6.2, unit: 'NG_ML' },
      ],
      d('2026-03-06'),
    );
    expect(r.ovulationBasis).toBe('MEASURED');
    expect(r.note).toMatch(/measured value/i);
  });

  it('interpolates when the series jumps straight past a threshold', () => {
    // Testing every three days means the crossing often happens between tests.
    const r = interpretProgesterone(
      [
        { takenOn: d('2026-03-01'), value: 1.0, unit: 'NG_ML' },
        { takenOn: d('2026-03-05'), value: 9.0, unit: 'NG_ML' },
      ],
      d('2026-03-05'),
    );
    expect(r.ovulationBasis).toBe('MEASURED');
    const ov = r.estimatedOvulationDate!.toISOString().slice(0, 10);
    expect(ov > '2026-03-01' && ov <= '2026-03-05').toBe(true);
  });

  it('errs LATE when the crossing falls between two tests', () => {
    // Progesterone rises exponentially, so linear interpolation would place
    // the crossing too early. And of the two ways to be wrong, early is the
    // expensive one: the frozen window is ovulation +3 to +4, and semen that
    // survives hours does not forgive a day. A day late still catches viable
    // oocytes; a day early misses them.
    const r = interpretProgesterone(
      [
        { takenOn: d('2026-03-04'), value: 2.4, unit: 'NG_ML' },
        { takenOn: d('2026-03-06'), value: 6.2, unit: 'NG_ML' },
      ],
      d('2026-03-06'),
    );
    expect(r.ovulationBasis).toBe('MEASURED');
    expect(r.estimatedOvulationDate!.toISOString().slice(0, 10)).toBe('2026-03-06');
  });

  it('gives frozen semen the tightest and latest window', () => {
    const r = interpretProgesterone(
      [{ takenOn: d('2026-03-06'), value: 6.0, unit: 'NG_ML' }],
      d('2026-03-06'),
    );
    const frozen = r.breedingWindows.FROZEN!;
    const natural = r.breedingWindows.NATURAL!;
    expect(frozen.from.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(frozen.to.toISOString().slice(0, 10)).toBe('2026-03-10');
    // Frozen survives hours, not days — missing this window costs a cycle.
    expect(daysBetween(frozen.from, frozen.to)).toBeLessThan(daysBetween(natural.from, natural.to));
  });

  it('marks the window as past once it has closed', () => {
    const r = interpretProgesterone(
      [{ takenOn: d('2026-03-06'), value: 6.0, unit: 'NG_ML' }],
      d('2026-03-20'),
    );
    expect(r.phase).toBe('PAST_WINDOW');
  });
});

// ── Whelp forecast ──────────────────────────────────────────────────────────

describe('whelp forecast', () => {
  it('is 63 days and high confidence from a confirmed ovulation', () => {
    const f = forecastWhelp({ ovulationDate: d('2026-03-06') }, d('2026-03-20'));
    expect(f.basis).toBe('OVULATION');
    expect(f.confidence).toBe('HIGH');
    expect(f.dueOn!.toISOString().slice(0, 10)).toBe('2026-05-08');
    expect(daysBetween(f.earliest!, f.latest!)).toBe(2);
    expect(f.gestationDay).toBe(14);
  });

  it('is 65 days from the LH surge, with a wider window', () => {
    const f = forecastWhelp({ lhSurgeDate: d('2026-03-04') }, d('2026-03-20'));
    expect(f.basis).toBe('LH_SURGE');
    expect(f.confidence).toBe('MODERATE');
    expect(f.dueOn!.toISOString().slice(0, 10)).toBe('2026-05-08');
    expect(daysBetween(f.earliest!, f.latest!)).toBe(4);
  });

  it('spans ten days from a breeding date and says confidence is low', () => {
    // This is the whole argument for progesterone timing, in one assertion.
    const f = forecastWhelp(
      { breedingDates: [d('2026-03-08'), d('2026-03-10')] },
      d('2026-03-20'),
    );
    expect(f.basis).toBe('BREEDING_DATE');
    expect(f.confidence).toBe('LOW');
    expect(daysBetween(f.earliest!, f.latest!)).toBeGreaterThanOrEqual(10);
    expect(f.note).toMatch(/58–68/);
  });

  it('prefers ovulation over everything else when several are known', () => {
    const f = forecastWhelp(
      {
        ovulationDate: d('2026-03-06'),
        lhSurgeDate: d('2026-03-04'),
        breedingDates: [d('2026-03-09')],
      },
      d('2026-03-20'),
    );
    expect(f.basis).toBe('OVULATION');
  });

  it('reports nothing rather than guessing', () => {
    const f = forecastWhelp({}, d('2026-03-20'));
    expect(f.basis).toBe('NONE');
    expect(f.dueOn).toBeNull();
  });

  it('counts down and then goes negative when overdue', () => {
    expect(forecastWhelp({ ovulationDate: d('2026-03-06') }, d('2026-05-01')).daysAway).toBe(7);
    expect(forecastWhelp({ ovulationDate: d('2026-03-06') }, d('2026-05-11')).daysAway).toBe(-3);
  });
});

describe('gestation milestones', () => {
  const ms = gestationMilestones(d('2026-03-06'), d('2026-04-10'));

  it('puts the ultrasound in the window where it actually works', () => {
    const scan = ms.find((m) => m.label === 'Ultrasound — pregnancy confirmation')!;
    expect(scan.day).toBe(28);
    expect(scan.on.toISOString().slice(0, 10)).toBe('2026-04-03');
    expect(scan.done).toBe(true);
  });

  it('puts the x-ray late enough for skeletons to be countable', () => {
    const xray = ms.find((m) => m.label === 'X-ray — puppy count')!;
    expect(xray.day).toBe(55);
    expect(xray.done).toBe(false);
  });

  it('includes the overdue alert', () => {
    expect(ms.find((m) => m.day === 65)!.kind).toBe('ALERT');
  });
});

// ── Growth ──────────────────────────────────────────────────────────────────

describe('growth reference band', () => {
  it('doubles birth weight by day 10', () => {
    expect(expectedMultiple(10)).toBeCloseTo(2, 2);
    expect(expectedWeightGrams(400, 10)).toBe(800);
  });

  it('starts at birth weight', () => {
    expect(expectedMultiple(0)).toBe(1);
  });

  it('interpolates between reference points', () => {
    const m = expectedMultiple(12);
    expect(m).toBeGreaterThan(expectedMultiple(10));
    expect(m).toBeLessThan(expectedMultiple(14));
  });

  it('produces a ±20% band', () => {
    const band = referenceBand(400, 14);
    expect(band).toHaveLength(15);
    const day10 = band[10]!;
    expect(day10.lowGrams).toBe(Math.round(day10.grams * 0.8));
    expect(day10.highGrams).toBe(Math.round(day10.grams * 1.2));
  });
});

describe('growth assessment', () => {
  it('says nothing when there is nothing', () => {
    const a = assessGrowth([], { bornOn: d('2026-05-08'), now: d('2026-05-10') });
    expect(a.latestGrams).toBeNull();
    expect(a.flags).toEqual([]);
  });

  it('reports a healthy puppy without alarm', () => {
    const a = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-11'), grams: 490 },
        { recordedOn: d('2026-05-15'), grams: 700 },
        { recordedOn: d('2026-05-18'), grams: 810 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-18') },
    );
    expect(a.flags).toEqual([]);
    expect(a.multipleOfBirthWeight).toBeCloseTo(2.03, 2);
    expect(a.summary).toMatch(/tracking the band/);
  });

  it('raises an URGENT flag for weight loss between weigh-ins', () => {
    const a = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-09'), grams: 410 },
        { recordedOn: d('2026-05-10'), grams: 385 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-10') },
    );
    const loss = a.flags.find((f) => f.kind === 'WEIGHT_LOSS')!;
    expect(loss.severity).toBe('URGENT');
    expect(loss.message).toContain('25 g');
  });

  it('raises an URGENT flag for a flat day in the first fortnight', () => {
    const a = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-09'), grams: 420 },
        { recordedOn: d('2026-05-10'), grams: 420 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-10') },
    );
    expect(a.flags.some((f) => f.kind === 'NO_GAIN_24H' && f.severity === 'URGENT')).toBe(true);
  });

  it('flags a puppy still under its birth weight after day 2', () => {
    const a = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-12'), grams: 380 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-12') },
    );
    expect(a.flags.some((f) => f.kind === 'BELOW_BIRTH_WEIGHT' && f.severity === 'URGENT')).toBe(true);
  });

  it('escalates a failure to double from WATCH to URGENT', () => {
    const at10 = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-18'), grams: 700 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-18') },
    );
    expect(at10.flags.find((f) => f.kind === 'FAILED_TO_DOUBLE')!.severity).toBe('WATCH');

    const at14 = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-22'), grams: 700 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-22') },
    );
    expect(at14.flags.find((f) => f.kind === 'FAILED_TO_DOUBLE')!.severity).toBe('URGENT');
  });

  it('puts the most urgent flag in the summary', () => {
    const a = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-20'), grams: 500 },
        { recordedOn: d('2026-05-21'), grams: 470 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-21') },
    );
    expect(a.flags[0]!.severity).toBe('URGENT');
    expect(a.summary).toBe(a.flags[0]!.message);
  });

  it('computes recent daily gain', () => {
    const a = assessGrowth(
      [
        { recordedOn: d('2026-05-08'), grams: 400 },
        { recordedOn: d('2026-05-10'), grams: 460 },
        { recordedOn: d('2026-05-12'), grams: 540 },
      ],
      { bornOn: d('2026-05-08'), now: d('2026-05-12') },
    );
    expect(a.recentDailyGainGrams).toBe(35);
  });
});

describe('sibling comparison', () => {
  const litter = [
    { puppyId: 'a', records: [{ recordedOn: d('2026-05-18'), grams: 900 }] },
    { puppyId: 'b', records: [{ recordedOn: d('2026-05-18'), grams: 820 }] },
    { puppyId: 'c', records: [{ recordedOn: d('2026-05-18'), grams: 640 }] },
    { puppyId: 'd', records: [] },
  ];

  it('ranks heaviest first', () => {
    const r = compareSiblings(litter);
    expect(r.find((x) => x.puppyId === 'a')!.rank).toBe(1);
    expect(r.find((x) => x.puppyId === 'c')!.rank).toBe(3);
  });

  it('reports the gap to the litter median', () => {
    const r = compareSiblings(litter);
    expect(r.find((x) => x.puppyId === 'b')!.vsMedianGrams).toBe(0);
    expect(r.find((x) => x.puppyId === 'c')!.vsMedianGrams).toBe(-180);
  });

  it('handles a puppy with no weights without breaking the ranking', () => {
    const r = compareSiblings(litter);
    const unweighed = r.find((x) => x.puppyId === 'd')!;
    expect(unweighed.rank).toBeNull();
    expect(unweighed.latestGrams).toBeNull();
  });

  it('does not divide by zero on a singleton litter', () => {
    const r = compareSiblings([{ puppyId: 'only', records: [{ recordedOn: d('2026-05-18'), grams: 500 }] }]);
    expect(r[0]!.rankFraction).toBe(1);
    expect(r[0]!.vsMedianGrams).toBe(0);
  });
});

// ── Care schedule ───────────────────────────────────────────────────────────

describe('care schedule', () => {
  const whelp = d('2026-05-08');
  const tasks = generateCareSchedule(whelp, d('2026-05-25'));

  it('starts deworming at two weeks and repeats fortnightly to eight', () => {
    const worming = tasks.filter((t) => t.kind === 'DEWORMING');
    expect(worming.map((t) => t.ageDays)).toEqual([14, 28, 42, 56]);
  });

  it('bounds the daily weighing task rather than generating forever', () => {
    const weighing = tasks.filter((t) => t.kind === 'WEIGHING');
    expect(weighing).toHaveLength(15);
    expect(weighing[weighing.length - 1]!.ageDays).toBe(14);
  });

  it('puts go-home at eight weeks and marks it required', () => {
    const goHome = tasks.find((t) => t.kind === 'PLACEMENT')!;
    expect(goHome.ageDays).toBe(56);
    expect(goHome.required).toBe(true);
    expect(goHome.detail).toMatch(/legal minimum/i);
  });

  it('classifies status against today', () => {
    const overdue = tasks.filter((t) => t.status === 'OVERDUE');
    const future = tasks.filter((t) => t.status === 'FUTURE');
    expect(overdue.length).toBeGreaterThan(0);
    expect(future.length).toBeGreaterThan(0);
    for (const t of overdue) expect(t.daysUntilDue).toBeLessThan(0);
  });

  it('returns tasks in date order', () => {
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i]!.dueOn.getTime()).toBeGreaterThanOrEqual(tasks[i - 1]!.dueOn.getTime());
    }
  });

  it('hedges rabies timing rather than inventing a date', () => {
    const rabies = tasks.find((t) => t.title.startsWith('Rabies'))!;
    expect(rabies.detail).toMatch(/vary by state/i);
  });
});

describe('litter milestones', () => {
  it('flags the fragile first fortnight', () => {
    expect(litterMilestones(d('2026-05-08'), d('2026-05-15')).inCriticalWindow).toBe(true);
    expect(litterMilestones(d('2026-05-08'), d('2026-06-15')).inCriticalWindow).toBe(false);
  });

  it('computes go-home from the whelp date', () => {
    const m = litterMilestones(d('2026-05-08'), d('2026-05-15'));
    expect(m.goHomeFrom.toISOString().slice(0, 10)).toBe('2026-07-03');
    expect(m.ageWeeks).toBe(1);
  });
});
