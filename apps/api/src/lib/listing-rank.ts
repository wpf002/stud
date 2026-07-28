/**
 * Marketplace ranking and slugs.
 *
 * Pure — no I/O, no clock — so the one thing that decides which litters a
 * buyer sees first is testable rather than buried in a route handler.
 *
 * The default order is a product position, not a heuristic: litters where the
 * breeder did the work of getting their dogs verified rank first. Any ordering
 * that put price or recency at the top would reward the opposite behaviour,
 * and the marketplace would become the thing it exists to replace.
 */

export type ListingSort =
  | 'RELEVANCE'
  | 'PRICE_ASC'
  | 'PRICE_DESC'
  | 'VERIFIED'
  | 'SOONEST'
  | 'DISTANCE'
  | 'COI';

export interface SortableListing {
  priceCentsFrom: number | null;
  cachedSireVerified: number;
  cachedDamVerified: number;
  cachedCoi: number | null;
  goHomeFrom: Date | null;
  publishedAt: Date | null;
  distanceMiles: number | null;
}

function verifiedTotal(l: SortableListing): number {
  return l.cachedSireVerified + l.cachedDamVerified;
}

/**
 * Order a page of listings. Never mutates the input.
 *
 * Missing values always sort last rather than first — a listing with no price
 * is not the cheapest, and a litter with no go-home date is not the soonest.
 */
export function sortListings<T extends SortableListing>(listings: readonly T[], sort: ListingSort): T[] {
  const rows = [...listings];
  switch (sort) {
    case 'PRICE_ASC':
      return rows.sort((a, b) => (a.priceCentsFrom ?? Infinity) - (b.priceCentsFrom ?? Infinity));
    case 'PRICE_DESC':
      return rows.sort((a, b) => (b.priceCentsFrom ?? -Infinity) - (a.priceCentsFrom ?? -Infinity));
    case 'VERIFIED':
      return rows.sort((a, b) => verifiedTotal(b) - verifiedTotal(a));
    case 'COI':
      return rows.sort((a, b) => (a.cachedCoi ?? Infinity) - (b.cachedCoi ?? Infinity));
    case 'SOONEST':
      return rows.sort(
        (a, b) => (a.goHomeFrom?.getTime() ?? Infinity) - (b.goHomeFrom?.getTime() ?? Infinity),
      );
    case 'DISTANCE':
      return rows.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
    case 'RELEVANCE':
    default:
      return rows.sort(
        (a, b) =>
          verifiedTotal(b) - verifiedTotal(a) ||
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
  }
}

/**
 * A stable, readable slug for a litter listing.
 *
 * Built once and never regenerated. A changed URL is a lost search ranking,
 * and the whole point of these pages is that they rank — so `taken` exists to
 * disambiguate at creation time rather than to renumber later.
 */
export function buildListingSlug(
  litter: { letter: string | null; sire: { callName: string }; dam: { callName: string; breed: string } },
  taken: (slug: string) => boolean,
): string {
  const raw = [litter.dam.breed, `${litter.dam.callName}-x-${litter.sire.callName}`, litter.letter]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    // NFKD splits "å" into "a" + a combining ring, which the class below then
    // drops. It does NOT touch ø, đ, ł or ß — those are distinct letters, not
    // accented ones — so they are transliterated first. Nordic and Central
    // European kennel names are common enough that "bj-rn" is a real outcome.
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  /**
   * Guard against a slug that survived only because of the literal "x"
   * separator — a dog named entirely in a non-Latin script would otherwise
   * produce the URL `/puppies/x`. Anything this short is not a useful URL.
   */
  const base = raw.replace(/-/g, '').length < 3 ? 'litter' : raw;

  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}
