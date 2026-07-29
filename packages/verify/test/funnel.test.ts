import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE,
  bandOf,
  channelMix,
  funnelByBand,
  summariseReviews,
  verificationLift,
  type FunnelEventInput,
  type FunnelStep,
} from '../src/funnel.js';

function events(
  spec: { step: FunnelStep; claims: number; n: number; channel?: string }[],
): FunnelEventInput[] {
  return spec.flatMap(({ step, claims, n, channel }) =>
    Array.from({ length: n }, () => ({
      step,
      verifiedParentClaims: claims,
      parentDensity: claims / 12,
      hadConflict: false,
      channel,
    })),
  );
}

describe('verification bands', () => {
  it('splits on none, partial and full', () => {
    expect(bandOf(0)).toBe('NONE');
    expect(bandOf(1)).toBe('PARTIAL');
    expect(bandOf(9)).toBe('PARTIAL');
    expect(bandOf(10)).toBe('FULL');
    expect(bandOf(24)).toBe('FULL');
  });

  it('treats a negative count as none rather than throwing', () => {
    expect(bandOf(-1)).toBe('NONE');
  });
});

describe('funnel by band', () => {
  it('reports every band even when one is empty', () => {
    const result = funnelByBand(events([{ step: 'LISTING_VIEW', claims: 12, n: 5 }]));
    expect(result.map((b) => b.band)).toEqual(['NONE', 'PARTIAL', 'FULL']);
    expect(result.find((b) => b.band === 'NONE')!.views).toBe(0);
  });

  it('computes step-to-step conversion, not conversion from the top', () => {
    const result = funnelByBand(
      events([
        { step: 'LISTING_IMPRESSION', claims: 12, n: 100 },
        { step: 'LISTING_VIEW', claims: 12, n: 40 },
        { step: 'APPLY_STARTED', claims: 12, n: 10 },
      ]),
    );
    const full = result.find((b) => b.band === 'FULL')!;
    const view = full.steps.find((s) => s.step === 'LISTING_VIEW')!;
    const apply = full.steps.find((s) => s.step === 'APPLY_STARTED')!;
    expect(view.fromPrevious).toBeCloseTo(0.4);
    // 10 of 40 views, not 10 of 100 impressions.
    expect(apply.fromPrevious).toBeCloseTo(0.25);
  });

  it('leaves the first step with no prior conversion to report', () => {
    const full = funnelByBand(events([{ step: 'LISTING_IMPRESSION', claims: 12, n: 10 }])).find(
      (b) => b.band === 'FULL',
    )!;
    expect(full.steps[0]!.fromPrevious).toBeNull();
  });

  it('returns null rather than zero when a denominator is empty', () => {
    const none = funnelByBand([]).find((b) => b.band === 'NONE')!;
    expect(none.viewToApplication).toBeNull();
    expect(none.impressionToApplication).toBeNull();
  });

  it('flags a thin sample as underpowered', () => {
    const full = funnelByBand(events([{ step: 'LISTING_VIEW', claims: 12, n: 5 }])).find(
      (b) => b.band === 'FULL',
    )!;
    expect(full.underpowered).toBe(true);
  });
});

describe('verification lift', () => {
  /** Enough on both sides to clear MIN_SAMPLE. */
  function comparable(fullApps: number, noneApps: number) {
    return events([
      { step: 'LISTING_VIEW', claims: 12, n: 200 },
      { step: 'APPLICATION_SUBMITTED', claims: 12, n: fullApps },
      { step: 'LISTING_VIEW', claims: 0, n: 200 },
      { step: 'APPLICATION_SUBMITTED', claims: 0, n: noneApps },
    ]);
  }

  it('reports a real lift with its sample size', () => {
    const r = verificationLift(comparable(40, 10));
    expect(r.lift).toBeCloseTo(4);
    expect(r.underpowered).toBe(false);
    expect(r.smallestSample).toBe(200);
    expect(r.verdict).toMatch(/4\.0× better/);
  });

  /**
   * The test that matters most. A growth metric that can only move one way is
   * not a measurement, and a company that cannot see a null result will build
   * itself around one.
   */
  it('reports a NEGATIVE result as plainly as a positive one', () => {
    const r = verificationLift(comparable(10, 40));
    expect(r.lift).toBeLessThan(1);
    expect(r.verdict).toMatch(/WORSE/);
    expect(r.verdict).toMatch(/not showing up in this data/i);
  });

  it('refuses to conclude anything from a thin sample', () => {
    const thin = events([
      { step: 'LISTING_VIEW', claims: 12, n: 4 },
      { step: 'APPLICATION_SUBMITTED', claims: 12, n: 4 },
      { step: 'LISTING_VIEW', claims: 0, n: 4 },
      { step: 'APPLICATION_SUBMITTED', claims: 0, n: 1 },
    ]);
    const r = verificationLift(thin);
    // A 4× lift on four views is not a finding.
    expect(r.lift).toBeCloseTo(4);
    expect(r.underpowered).toBe(true);
    expect(r.verdict).toMatch(/not yet evidence/i);
  });

  it('says so when one side has no traffic at all', () => {
    const r = verificationLift(events([{ step: 'LISTING_VIEW', claims: 12, n: 100 }]));
    expect(r.lift).toBeNull();
    expect(r.verdict).toMatch(/not enough traffic/i);
  });

  it('does not divide by a zero baseline', () => {
    const r = verificationLift(
      events([
        { step: 'LISTING_VIEW', claims: 12, n: 100 },
        { step: 'APPLICATION_SUBMITTED', claims: 12, n: 20 },
        { step: 'LISTING_VIEW', claims: 0, n: 100 },
      ]),
    );
    expect(r.lift).toBeNull();
    expect(r.noneRate).toBe(0);
    expect(r.verdict).toMatch(/no baseline/i);
  });

  it('holds MIN_SAMPLE conservative enough to be worth having', () => {
    expect(MIN_SAMPLE).toBeGreaterThanOrEqual(30);
  });
});

describe('channel mix', () => {
  it('ranks channels by views and identifies the primary one', () => {
    const mix = channelMix(
      events([
        { step: 'LISTING_VIEW', claims: 12, n: 60, channel: 'organic' },
        { step: 'LISTING_VIEW', claims: 12, n: 30, channel: 'direct' },
        { step: 'LISTING_VIEW', claims: 12, n: 10, channel: 'social' },
      ]),
    );
    expect(mix.primaryChannel).toBe('organic');
    expect(mix.organicShare).toBeCloseTo(0.6);
    expect(mix.meetsOrganicGoal).toBe(true);
    expect(mix.channels.map((c) => c.channel)).toEqual(['organic', 'direct', 'social']);
  });

  it('does not claim the organic goal when paid leads', () => {
    const mix = channelMix(
      events([
        { step: 'LISTING_VIEW', claims: 12, n: 70, channel: 'paid' },
        { step: 'LISTING_VIEW', claims: 12, n: 30, channel: 'organic' },
      ]),
    );
    expect(mix.primaryChannel).toBe('paid');
    expect(mix.meetsOrganicGoal).toBe(false);
  });

  it('buckets an unlabelled visit as direct rather than dropping it', () => {
    const mix = channelMix(events([{ step: 'LISTING_VIEW', claims: 0, n: 5 }]));
    expect(mix.channels[0]!.channel).toBe('direct');
    expect(mix.channels[0]!.views).toBe(5);
  });

  it('handles no traffic without dividing by zero', () => {
    const mix = channelMix([]);
    expect(mix.organicShare).toBeNull();
    expect(mix.primaryChannel).toBeNull();
    expect(mix.meetsOrganicGoal).toBe(false);
  });
});

describe('review summaries', () => {
  const review = (over: Partial<Parameters<typeof summariseReviews>[0][number]> = {}) => ({
    overall: 5,
    communication: 4,
    healthOfPuppy: 5,
    honestyAboutMatch: 5,
    supportAfterward: 3,
    daysAfterPlacement: 30,
    ...over,
  });

  /**
   * The overall score is what people wrote as their overall — never the mean
   * of the dimensions. Computing it that way would quietly overwrite the
   * summary judgement they actually gave.
   */
  it('averages authored overalls, not the dimensions', () => {
    const s = summariseReviews([review({ overall: 5 }), review({ overall: 3 })]);
    expect(s.overall).toBe(4);
    // The dimension mean here would be 4.25 — deliberately not the overall.
    expect(s.dimensions.supportAfterward).toBe(3);
  });

  it('says when there are too few to average', () => {
    const s = summariseReviews([review(), review()]);
    expect(s.note).toMatch(/too few to average/i);
  });

  it('points out when nothing has been written after a year', () => {
    const s = summariseReviews(Array.from({ length: 6 }, () => review({ daysAfterPlacement: 20 })));
    expect(s.longTermCount).toBe(0);
    expect(s.note).toMatch(/measures excitement/i);
  });

  it('stops warning once long-term reviews exist', () => {
    const s = summariseReviews([
      ...Array.from({ length: 5 }, () => review({ daysAfterPlacement: 20 })),
      review({ daysAfterPlacement: 400 }),
    ]);
    expect(s.longTermCount).toBe(1);
    expect(s.note).toBeNull();
  });

  it('explains an empty state instead of showing zero stars', () => {
    const s = summariseReviews([]);
    expect(s.overall).toBeNull();
    expect(s.note).toMatch(/completed a purchase/i);
  });

  it('ignores a missing dimension rather than counting it as zero', () => {
    const s = summariseReviews([
      review({ communication: 5 }),
      review({ communication: null }),
    ]);
    expect(s.dimensions.communication).toBe(5);
  });
});
