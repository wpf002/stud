import { describe, expect, it } from 'vitest';
import { buildListingSlug, sortListings, type SortableListing } from '../src/lib/listing-rank.js';

function listing(over: Partial<SortableListing> = {}): SortableListing {
  return {
    priceCentsFrom: 300_000,
    cachedSireVerified: 0,
    cachedDamVerified: 0,
    cachedCoi: 0.02,
    goHomeFrom: new Date('2026-09-01'),
    publishedAt: new Date('2026-07-01'),
    distanceMiles: 100,
    ...over,
  };
}

describe('marketplace ranking', () => {
  it('puts the most verified parents first by default', () => {
    // The product position in one assertion: doing the work of getting dogs
    // verified is what earns the top of the page, not price and not recency.
    const rows = sortListings(
      [
        listing({ cachedSireVerified: 0, cachedDamVerified: 0, priceCentsFrom: 100_000 }),
        listing({ cachedSireVerified: 6, cachedDamVerified: 5, priceCentsFrom: 900_000 }),
        listing({ cachedSireVerified: 2, cachedDamVerified: 1, priceCentsFrom: 400_000 }),
      ],
      'RELEVANCE',
    );
    expect(rows.map((r) => r.cachedSireVerified + r.cachedDamVerified)).toEqual([11, 3, 0]);
  });

  it('breaks a verification tie with the newer listing', () => {
    const older = listing({ cachedSireVerified: 3, publishedAt: new Date('2026-01-01') });
    const newer = listing({ cachedSireVerified: 3, publishedAt: new Date('2026-06-01') });
    expect(sortListings([older, newer], 'RELEVANCE')[0]).toBe(newer);
  });

  it('does not mutate the array it was given', () => {
    const input = [listing({ cachedSireVerified: 1 }), listing({ cachedSireVerified: 9 })];
    const before = [...input];
    sortListings(input, 'RELEVANCE');
    expect(input).toEqual(before);
  });

  it('sorts by price without treating a missing price as free', () => {
    const rows = sortListings(
      [
        listing({ priceCentsFrom: null }),
        listing({ priceCentsFrom: 500_000 }),
        listing({ priceCentsFrom: 200_000 }),
      ],
      'PRICE_ASC',
    );
    expect(rows.map((r) => r.priceCentsFrom)).toEqual([200_000, 500_000, null]);
  });

  it('sorts by price descending without treating a missing price as expensive', () => {
    const rows = sortListings(
      [listing({ priceCentsFrom: null }), listing({ priceCentsFrom: 500_000 })],
      'PRICE_DESC',
    );
    expect(rows.map((r) => r.priceCentsFrom)).toEqual([500_000, null]);
  });

  it('ranks the lowest COI first, and an uncomputed one last', () => {
    const rows = sortListings(
      [listing({ cachedCoi: null }), listing({ cachedCoi: 0.15 }), listing({ cachedCoi: 0.01 })],
      'COI',
    );
    expect(rows.map((r) => r.cachedCoi)).toEqual([0.01, 0.15, null]);
  });

  it('does not treat a litter with no go-home date as the soonest', () => {
    const rows = sortListings(
      [
        listing({ goHomeFrom: null }),
        listing({ goHomeFrom: new Date('2026-12-01') }),
        listing({ goHomeFrom: new Date('2026-08-01') }),
      ],
      'SOONEST',
    );
    expect(rows.map((r) => r.goHomeFrom?.getFullYear() ?? null)).toEqual([2026, 2026, null]);
    expect(rows[0]!.goHomeFrom!.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('puts a listing with no known distance last', () => {
    const rows = sortListings(
      [listing({ distanceMiles: null }), listing({ distanceMiles: 300 }), listing({ distanceMiles: 20 })],
      'DISTANCE',
    );
    expect(rows.map((r) => r.distanceMiles)).toEqual([20, 300, null]);
  });
});

describe('listing slugs', () => {
  const litter = {
    letter: 'A',
    sire: { callName: 'Atlas' },
    dam: { callName: 'Marigold', breed: 'Golden Retriever' },
  };

  it('builds a readable slug from the breed and both parents', () => {
    expect(buildListingSlug(litter, () => false)).toBe('golden-retriever-marigold-x-atlas-a');
  });

  it('disambiguates rather than overwriting an existing slug', () => {
    const used = new Set(['golden-retriever-marigold-x-atlas-a', 'golden-retriever-marigold-x-atlas-a-2']);
    expect(buildListingSlug(litter, (s) => used.has(s))).toBe('golden-retriever-marigold-x-atlas-a-3');
  });

  it('strips accents instead of percent-encoding them', () => {
    const slug = buildListingSlug(
      { letter: null, sire: { callName: 'Bjørn' }, dam: { callName: 'Åsa', breed: 'Norsk Elghund' } },
      () => false,
    );
    expect(slug).toBe('norsk-elghund-asa-x-bjorn');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('never ends in a separator, even when truncation lands on one', () => {
    const slug = buildListingSlug(
      {
        letter: null,
        sire: { callName: 'A'.repeat(40) },
        dam: { callName: 'B'.repeat(40), breed: 'Breed' },
      },
      () => false,
    );
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back rather than minting a one-character URL', () => {
    const slug = buildListingSlug(
      { letter: null, sire: { callName: '☆' }, dam: { callName: '★', breed: '☾' } },
      () => false,
    );
    expect(slug).toBe('litter');
  });
});
