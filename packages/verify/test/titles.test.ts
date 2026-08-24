import { describe, expect, it } from 'vitest';
import { TITLE_DISCIPLINES, allTitles, titleClaimType, titleSpec } from '../src/titles.js';

describe('title vocabulary', () => {
  it('maps a code to its discipline so it can be filtered', () => {
    expect(titleClaimType('SH')).toBe('TITLE_HUNT_TEST');
    expect(titleClaimType('PT')).toBe('TITLE_HERDING');
    expect(titleClaimType('GCH')).toBe('TITLE_CONFORMATION');
    expect(titleClaimType('RN')).toBe('TITLE_RALLY');
  });

  it('is case- and space-insensitive about the code', () => {
    expect(titleSpec(' gch ')?.code).toBe('GCH');
  });

  /**
   * Unknown codes must not be silently filed under a discipline they did not
   * earn — the catch-all is the honest answer.
   */
  it('leaves an unrecognised code on the catch-all', () => {
    expect(titleClaimType('ZZZ')).toBe('TITLE_AWARD');
    expect(titleSpec('ZZZ')).toBeNull();
  });

  it('gives every discipline in the filter list at least one title', () => {
    for (const d of TITLE_DISCIPLINES) {
      const has = allTitles().some((t) => t.claimType === d.claimType);
      expect(has, `${d.label} has no titles`).toBe(true);
    }
  });

  it('gives every title a discipline that is offered as a filter', () => {
    const filterable = new Set(TITLE_DISCIPLINES.map((d) => d.claimType));
    // NAVHDA_UT shares the NAVHDA filter entry with NAVHDA_NA.
    const exempt = new Set(['NAVHDA_UT']);
    for (const t of allTitles()) {
      if (exempt.has(t.claimType)) continue;
      expect(filterable.has(t.claimType), `${t.code} -> ${t.claimType}`).toBe(true);
    }
  });

  /**
   * There is no universal per-dog service-dog certification, and inventing a
   * badge for one is the thing AKC and disability advocates push back on.
   * Therapy titles are real and stay.
   */
  it('offers no service-dog credential', () => {
    expect(allTitles().some((t) => t.claimType === 'TITLE_SERVICE')).toBe(false);
    expect(allTitles().some((t) => t.claimType === 'TITLE_THERAPY')).toBe(true);
  });
});
