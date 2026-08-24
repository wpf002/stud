import { describe, expect, it } from 'vitest';
import {
  BRUCELLOSIS_WINDOW_DAYS,
  assessBrucellosis,
  breedRequirements,
  coveredBreeds,
  expectedClaims,
} from '../src/index.js';

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe('breed health requirements', () => {
  /** The gate: two breeds must not show the same expectations. */
  it('gives a GSP and a Poodle different expectations', () => {
    const gsp = expectedClaims('German Shorthaired Pointer');
    const poodle = expectedClaims('Poodle');
    expect(gsp).not.toEqual(poodle);
    expect(gsp).toContain('CARDIAC');
    expect(poodle).not.toContain('CARDIAC');
  });

  it('puts the heart first for a Cavalier and the knees for a Yorkie', () => {
    expect(expectedClaims('Cavalier King Charles Spaniel')).toContain('CARDIAC');
    expect(expectedClaims('Yorkshire Terrier')).toContain('PATELLA');
    // The old flat list asked every breed for elbows; a Yorkie is not an elbow breed.
    expect(expectedClaims('Yorkshire Terrier')).not.toContain('ELBOW');
  });

  it('falls back for an unknown breed and says it is not breed-specific', () => {
    const r = breedRequirements('Perro de Presa Canario');
    expect(r.breedSpecific).toBe(false);
    expect(r.required.length).toBeGreaterThan(0);
  });

  it('marks known breeds as breed-specific and links the CHIC page', () => {
    const r = breedRequirements('Golden Retriever');
    expect(r.breedSpecific).toBe(true);
    expect(r.chicUrl).toContain('ofa.org');
  });

  /**
   * Provenance matters more than coverage here. Nothing in this table has been
   * checked against OFA yet, and the UI wording depends on that staying honest.
   */
  it('does not claim any entry has been reviewed against the source', () => {
    expect(coveredBreeds().every((b) => breedRequirements(b).reviewed === false)).toBe(true);
  });

  it('covers every breed in the seeded dataset', () => {
    expect(coveredBreeds().length).toBeGreaterThanOrEqual(30);
  });
});

describe('brucellosis freshness', () => {
  const MATING = d('2026-10-03');

  it('passes a test taken inside the window', () => {
    const a = assessBrucellosis({ testedAt: d('2026-09-20'), outcome: 'NORMAL' }, MATING);
    expect(a.state).toBe('CURRENT');
    expect(a.blocks).toBe(false);
  });

  /** The gate: 45 days old must be flagged. */
  it('blocks a 45-day-old test', () => {
    const a = assessBrucellosis({ testedAt: d('2026-08-19'), outcome: 'NORMAL' }, MATING);
    expect(a.state).toBe('STALE');
    expect(a.blocks).toBe(true);
    expect(a.ageDays).toBe(45);
    expect(a.reason).toMatch(/45 days old/);
  });

  it('blocks when there is no test at all', () => {
    expect(assessBrucellosis(null, MATING).state).toBe('MISSING');
    expect(assessBrucellosis(null, MATING).blocks).toBe(true);
  });

  it('blocks a result that is not negative, whatever its date', () => {
    const a = assessBrucellosis({ testedAt: d('2026-10-02'), outcome: 'ABNORMAL' }, MATING);
    expect(a.state).toBe('POSITIVE');
    expect(a.blocks).toBe(true);
  });

  /**
   * Judged against the mating date, not today. The same certificate is current
   * for a mating next month and stale for one next year.
   */
  it('judges the same test against the date being booked', () => {
    const tested = { testedAt: d('2026-09-20'), outcome: 'NORMAL' as const };
    expect(assessBrucellosis(tested, d('2026-10-03')).blocks).toBe(false);
    expect(assessBrucellosis(tested, d('2027-02-01')).blocks).toBe(true);
  });

  it('holds the window at the 30 days the practice actually uses', () => {
    expect(BRUCELLOSIS_WINDOW_DAYS).toBe(30);
  });
});
