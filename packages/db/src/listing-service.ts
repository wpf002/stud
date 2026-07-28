/**
 * Litter listing search cache.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * A public litter page reads everything live: parent health, titles, COI,
 * pedigree completeness. That is the phase gate and it is not negotiable.
 *
 * But *search* cannot do that. Filtering 5,000 listings by "verified hips on
 * both parents, under $3,500, within 200 miles, COI below 6%" would mean
 * loading 5,000 ancestry graphs. So a handful of values are denormalised onto
 * the listing row purely so the query planner has something to work with.
 *
 * ── The rule that makes it safe ────────────────────────────────────────────
 * These columns are **never authored by a human and never rendered to one**.
 * They are derived, they are recomputed from the record, and the detail page
 * ignores them entirely. If a cached value drifts, a listing is mis-*sorted* —
 * it never displays a wrong health result, because it is not the source of any
 * displayed health result.
 *
 * ── Why it lives in @stud/db ───────────────────────────────────────────────
 * The API recomputes on publish and on any puppy status change; the seed
 * recomputes when it publishes. Two implementations would drift, and the first
 * symptom would be a browse page advertising puppies that are already sold.
 * Same reasoning as `verification-service`.
 */

import { evaluatePairing } from '@stud/pedigree';
import type { PrismaClient } from '@prisma/client';
import { loadAncestryGraph } from './pedigree-loader.js';

/** Statuses that never count towards a public puppy count. */
const NOT_PLACEABLE = ['STILLBORN', 'DECEASED'] as const;

export interface ListingCache {
  cachedBreed: string | null;
  cachedRegion: string | null;
  cachedCountry: string;
  cachedLatitude: number | null;
  cachedLongitude: number | null;
  cachedSireVerified: number;
  cachedDamVerified: number;
  cachedParentDensity: number;
  cachedCoi: number | null;
  cachedAvailablePups: number;
  cachedTotalPups: number;
}

/**
 * Compute the cache for one litter. Does not write.
 *
 * Split from the write so a caller inside a transaction can compute first and
 * write with the rest of its changes.
 */
export async function computeListingCache(
  db: PrismaClient,
  litterId: string,
): Promise<ListingCache | null> {
  const litter = await db.litter.findUnique({
    where: { id: litterId },
    select: {
      sireId: true,
      damId: true,
      sire: { select: { verificationSummary: { select: { verifiedCount: true, density: true } } } },
      dam: {
        select: {
          breed: true,
          verificationSummary: { select: { verifiedCount: true, density: true } },
          kennel: { select: { region: true, country: true, latitude: true, longitude: true } },
        },
      },
      puppies: { select: { status: true, isPublic: true } },
    },
  });
  if (!litter) return null;

  const placeable = litter.puppies.filter(
    (p) => p.isPublic && !NOT_PLACEABLE.includes(p.status as (typeof NOT_PLACEABLE)[number]),
  );

  // The projected COI of this litter, from the parents' ancestry. Six
  // generations: deep enough that line-breeding shows up, shallow enough that
  // a publish does not turn into a table scan.
  let coi: number | null = null;
  try {
    const graph = await loadAncestryGraph(db, [litter.sireId, litter.damId], 6);
    coi = evaluatePairing(graph, litter.sireId, litter.damId, { generations: 6 }).projectedCoi;
  } catch {
    // A malformed pedigree must not block a breeder from publishing a litter.
    // The detail page computes this live and will surface the problem there,
    // where there is room to explain it.
    coi = null;
  }

  const sireDensity = litter.sire.verificationSummary?.density ?? 0;
  const damDensity = litter.dam.verificationSummary?.density ?? 0;

  return {
    cachedBreed: litter.dam.breed,
    cachedRegion: litter.dam.kennel?.region ?? null,
    cachedCountry: litter.dam.kennel?.country ?? 'US',
    cachedLatitude: litter.dam.kennel?.latitude ?? null,
    cachedLongitude: litter.dam.kennel?.longitude ?? null,
    cachedSireVerified: litter.sire.verificationSummary?.verifiedCount ?? 0,
    cachedDamVerified: litter.dam.verificationSummary?.verifiedCount ?? 0,
    cachedParentDensity: (sireDensity + damDensity) / 2,
    cachedCoi: coi,
    cachedAvailablePups: placeable.filter((p) => p.status === 'AVAILABLE').length,
    cachedTotalPups: placeable.length,
  };
}

/**
 * Recompute and write, if this litter has a listing.
 *
 * Safe to call after any change that could move a cached value — a puppy being
 * reserved, a parent's verification refreshing, a pedigree correction. A litter
 * with no listing is a no-op rather than an error, so callers do not need to
 * check first.
 */
export async function refreshListingCache(db: PrismaClient, litterId: string): Promise<void> {
  const listing = await db.litterListing.findUnique({
    where: { litterId },
    select: { id: true },
  });
  if (!listing) return;

  const cache = await computeListingCache(db, litterId);
  if (!cache) return;

  await db.litterListing.update({ where: { id: listing.id }, data: cache });
}

/** The same, keyed by puppy — the common case, since statuses change per puppy. */
export async function refreshListingCacheForPuppy(
  db: PrismaClient,
  puppyId: string,
): Promise<void> {
  const puppy = await db.puppy.findUnique({ where: { id: puppyId }, select: { litterId: true } });
  if (puppy) await refreshListingCache(db, puppy.litterId);
}
