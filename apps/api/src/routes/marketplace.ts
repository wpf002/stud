import { evaluatePairing } from '@stud/pedigree';
import { assessPairingRisk, type GeneticClaimInput } from '@stud/verify';
import type { PrismaClient, VerificationState } from '@stud/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { boundingBox, haversineMiles } from '../lib/geo.js';
import { buildListingSlug, sortListings } from '../lib/listing-rank.js';
import { loadAncestryGraph } from '@stud/db/pedigree-loader';
import { computeListingCache } from '@stud/db/listings';

const AVAILABILITY = [
  'NOT_LISTED',
  'PLANNED',
  'EXPECTING',
  'AVAILABLE',
  'FULLY_RESERVED',
  'PAST',
] as const;

/** What the public can see. NOT_LISTED never appears. */
const PUBLIC_AVAILABILITY = ['PLANNED', 'EXPECTING', 'AVAILABLE', 'FULLY_RESERVED', 'PAST'] as const;

/**
 * The litter and puppy marketplace.
 *
 * ── Zero re-entry ─────────────────────────────────────────────────────────
 * The phase gate is that a public litter page shows verified parent data
 * without the breeder retyping any of it. So this module reads parent health,
 * titles, registrations, COI and pedigree completeness LIVE from the dog
 * records at request time. A listing stores a price, a description and some
 * photos — the things that genuinely are marketing copy — and nothing else.
 *
 * The denormalised `cached*` columns exist only so search can filter and sort
 * without joining five tables per row. They are recomputed on publish and are
 * never authored by a human; the page itself never reads them.
 *
 * ── Honesty ───────────────────────────────────────────────────────────────
 * A litter page shows what is missing as plainly as what is present. A dam
 * with no hip result reads "not tested", not silence. That is the entire
 * competitive argument: a classified board cannot tell you what is absent,
 * because it never knew what was supposed to be there.
 */
export default async function marketplaceRoutes(app: FastifyInstance) {
  // ── Public search ───────────────────────────────────────────────────────
  app.get('/litters/browse', async (req) => {
    const q = z
      .object({
        breed: z.string().max(120).optional(),
        search: z.string().max(120).optional(),
        availability: z.enum(PUBLIC_AVAILABILITY).optional(),
        region: z.string().max(80).optional(),
        maxPriceCents: z.coerce.number().int().min(0).optional(),
        minPriceCents: z.coerce.number().int().min(0).optional(),
        /** Verified NORMAL results required on BOTH parents. */
        verifiedNormal: z.string().max(300).optional(),
        /** Only litters where neither parent has an unresolved conflict. */
        requireNoConflicts: z.coerce.boolean().optional(),
        maxCoi: z.coerce.number().min(0).max(1).optional(),
        /** Ready to go home on or before this date. */
        goHomeBefore: z.coerce.date().optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lon: z.coerce.number().min(-180).max(180).optional(),
        withinMiles: z.coerce.number().min(1).max(3000).optional(),
        sort: z
          .enum(['RELEVANCE', 'PRICE_ASC', 'PRICE_DESC', 'VERIFIED', 'SOONEST', 'DISTANCE', 'COI'])
          .default('RELEVANCE'),
        take: z.coerce.number().min(1).max(60).default(24),
        skip: z.coerce.number().min(0).default(0),
      })
      .parse(req.query);

    const normalClaims = q.verifiedNormal?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

    // A health filter on a LITTER means both parents, not either. A buyer
    // asking for verified hips is asking about the puppy they take home, and
    // one clear parent does not make a clear puppy.
    const parentClaimFilter = (dogField: 'sire' | 'dam') =>
      normalClaims.map((claimType) => ({
        litter: {
          [dogField]: {
            verifiedClaims: {
              some: { claimType, outcome: 'NORMAL', state: { in: ['VERIFIED', 'STALE'] } },
            },
          },
        },
      }));

    const box =
      q.lat !== undefined && q.lon !== undefined && q.withinMiles !== undefined
        ? boundingBox(q.lat, q.lon, q.withinMiles)
        : null;

    const listings = await app.db.litterListing.findMany({
      where: {
        publishedAt: { not: null },
        availability: q.availability ? q.availability : { in: [...PUBLIC_AVAILABILITY] },
        ...(q.breed ? { cachedBreed: { equals: q.breed, mode: 'insensitive' } } : {}),
        ...(q.region ? { cachedRegion: { equals: q.region, mode: 'insensitive' } } : {}),
        ...(q.minPriceCents !== undefined ? { priceCentsTo: { gte: q.minPriceCents } } : {}),
        ...(q.maxPriceCents !== undefined ? { priceCentsFrom: { lte: q.maxPriceCents } } : {}),
        ...(q.maxCoi !== undefined ? { cachedCoi: { lte: q.maxCoi } } : {}),
        ...(q.goHomeBefore ? { goHomeFrom: { lte: q.goHomeBefore } } : {}),
        ...(box
          ? {
              cachedLatitude: { gte: box.minLat, lte: box.maxLat },
              cachedLongitude: { gte: box.minLon, lte: box.maxLon },
            }
          : {}),
        ...(q.search
          ? {
              OR: [
                { headline: { contains: q.search, mode: 'insensitive' } },
                { description: { contains: q.search, mode: 'insensitive' } },
                { cachedBreed: { contains: q.search, mode: 'insensitive' } },
                { litter: { sire: { callName: { contains: q.search, mode: 'insensitive' } } } },
                { litter: { dam: { callName: { contains: q.search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
        AND: [...parentClaimFilter('sire'), ...parentClaimFilter('dam')],
        ...(q.requireNoConflicts
          ? {
              litter: {
                sire: { verifiedClaims: { none: { state: 'CONFLICTED' } } },
                dam: { verifiedClaims: { none: { state: 'CONFLICTED' } } },
              },
            }
          : {}),
      },
      include: {
        litter: {
          select: {
            id: true,
            letter: true,
            name: true,
            status: true,
            whelpedOn: true,
            expectedWhelpOn: true,
            liveBorn: true,
            sire: {
              select: {
                id: true, slug: true, callName: true, registeredName: true, breed: true,
                verificationSummary: { select: { verifiedCount: true, healthNormalCount: true, density: true } },
              },
            },
            dam: {
              select: {
                id: true, slug: true, callName: true, registeredName: true, breed: true,
                kennel: { select: { slug: true, name: true, city: true, region: true } },
                verificationSummary: { select: { verifiedCount: true, healthNormalCount: true, density: true } },
              },
            },
            puppies: {
              where: { isPublic: true, status: { notIn: ['STILLBORN', 'DECEASED'] } },
              select: { id: true, status: true, sex: true },
            },
          },
        },
      },
      take: q.take,
      skip: q.skip,
    });

    const withDistance = listings.map((l) => ({
      ...l,
      distanceMiles:
        q.lat !== undefined && q.lon !== undefined && l.cachedLatitude != null && l.cachedLongitude != null
          ? Math.round(
              haversineMiles(
                { latitude: q.lat, longitude: q.lon },
                { latitude: l.cachedLatitude, longitude: l.cachedLongitude },
              ),
            )
          : null,
    }));

    const sorted = sortListings(withDistance, q.sort);
    const total = await app.db.litterListing.count({
      where: { publishedAt: { not: null }, availability: { in: [...PUBLIC_AVAILABILITY] } },
    });

    return {
      listings: sorted,
      total,
      /**
       * Said out loud rather than hidden. A directory of only-verified litters
       * is smaller than a classified board with the same number of breeders,
       * and pretending otherwise would be the first dishonest thing here.
       */
      note:
        normalClaims.length > 0
          ? 'Health filters require a verified result on BOTH parents. A litter where only one parent is tested does not match.'
          : null,
    };
  });

  // ── Public litter page ──────────────────────────────────────────────────
  /**
   * Everything the page renders, in one request.
   *
   * Deliberately one round trip: this is the page that has to rank and load
   * fast, and a waterfall of six calls is how a page stops doing either.
   */
  app.get('/litters/public/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);

    const listing = await app.db.litterListing.findUnique({
      where: { slug },
      include: {
        litter: {
          include: {
            sire: { include: parentInclude },
            dam: { include: parentInclude },
            puppies: {
              where: { isPublic: true },
              orderBy: [{ birthOrder: 'asc' }, { createdAt: 'asc' }],
              include: { weights: { orderBy: { recordedOn: 'desc' }, take: 1 } },
            },
            breeding: { select: { id: true, method: true, ovulationDate: true } },
          },
        },
      },
    });

    // Both conditions: it has been published at least once, and it is not
    // currently hidden. `publishedAt` alone no longer implies visible.
    if (!listing || !listing.publishedAt || listing.availability === 'NOT_LISTED') {
      throw notFound('Litter not found');
    }

    const { sire, dam } = listing.litter;

    // Live, not cached. The gate is zero re-entry — the breeder published a
    // price and a paragraph, and everything below is read from the record.
    const [coi, risk] = await Promise.all([
      projectedCoi(app.db, sire.id, dam.id),
      Promise.resolve(
        assessPairingRisk(
          toGeneticClaims(sire.verifiedClaims),
          toGeneticClaims(dam.verifiedClaims),
        ),
      ),
    ]);

    const kennel = dam.kennel ?? sire.kennel;

    return {
      listing: stripCache(listing),
      litter: listing.litter,
      sire: publicParent(sire),
      dam: publicParent(dam),
      kennel,
      coi,
      /**
       * Shown on a public page, in plain language, whether or not it is good
       * news. A buyer has more right to this number than anyone.
       */
      geneticRisk: {
        summary: risk.summary,
        worst: risk.worst,
        atRisk: risk.atRisk,
        safe: risk.safe,
        unknown: risk.unknown,
      },
      puppies: listing.litter.puppies.map((p) => ({
        id: p.id,
        birthOrder: p.birthOrder,
        name: p.name,
        collarColor: p.collarColor,
        sex: p.sex,
        status: p.status,
        colorPattern: p.colorPattern,
        markings: p.markings,
        priceCents: p.priceCents ?? listing.priceCentsFrom,
        publicNotes: p.publicNotes,
        photoUrls: p.photoUrls,
        latestWeightGrams: p.weights[0]?.grams ?? null,
      })),
    };
  });

  /** Slugs for the sitemap. Cheap on purpose — it is polled by crawlers. */
  app.get('/litters/public-index', async () => {
    const listings = await app.db.litterListing.findMany({
      where: { publishedAt: { not: null }, availability: { in: [...PUBLIC_AVAILABILITY] } },
      select: { slug: true, updatedAt: true, availability: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    const kennels = await app.db.kennel.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      take: 5000,
    });
    return { listings, kennels };
  });

  // ── Public kennel profile ───────────────────────────────────────────────
  app.get('/kennels/public/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const kennel = await app.db.kennel.findUnique({ where: { slug } });
    if (!kennel || !kennel.isPublished) throw notFound('Kennel not found');

    const [dogs, listings] = await Promise.all([
      app.db.dog.findMany({
        where: { kennelId: kennel.id, isPublished: true, supersededByDogId: null },
        select: {
          id: true, slug: true, callName: true, registeredName: true, breed: true,
          sex: true, dateOfBirth: true, colorPattern: true,
          verificationSummary: true,
          pedigreeStats: { select: { coi: true, generations: true } },
          studListing: { select: { availability: true, studFeeCents: true } },
        },
        orderBy: { dateOfBirth: 'asc' },
      }),
      app.db.litterListing.findMany({
        where: {
          publishedAt: { not: null },
          availability: { in: [...PUBLIC_AVAILABILITY] },
          litter: { OR: [{ kennelId: kennel.id }, { dam: { kennelId: kennel.id } }] },
        },
        include: {
          litter: {
            select: {
              whelpedOn: true, expectedWhelpOn: true, liveBorn: true, letter: true,
              sire: { select: { slug: true, callName: true } },
              dam: { select: { slug: true, callName: true } },
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      }),
    ]);

    // The program's record, computed rather than claimed. A kennel cannot
    // type "we health test everything" here and have it mean anything.
    const totalClaims = dogs.reduce((t, d) => t + (d.verificationSummary?.verifiedCount ?? 0), 0);
    const densities = dogs.map((d) => d.verificationSummary?.density ?? 0).filter((n) => n > 0);

    return {
      kennel,
      dogs,
      listings,
      stats: {
        dogCount: dogs.length,
        verifiedClaimCount: totalClaims,
        averageDensity: densities.length
          ? densities.reduce((a, b) => a + b, 0) / densities.length
          : 0,
        litterCount: listings.length,
        breeds: [...new Set(dogs.map((d) => d.breed))],
      },
    };
  });

  // ── Publish and manage a listing ────────────────────────────────────────
  app.put('/litters/:id/listing', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);

    const litter = await app.db.litter.findUnique({
      where: { id },
      include: {
        listing: true,
        sire: { select: { id: true, callName: true, breed: true, verificationSummary: true } },
        dam: {
          select: {
            id: true, callName: true, breed: true, verificationSummary: true,
            kennel: { select: { region: true, country: true, latitude: true, longitude: true } },
          },
        },
        puppies: { select: { id: true, status: true, isPublic: true } },
      },
    });
    if (!litter) throw notFound('Litter not found');
    // The dam's record governs, same rule as every other litter mutation.
    if (!(await canEditDog(app.db, user.id, user.roles, litter.damId))) {
      throw forbidden('You do not have access to this litter.');
    }

    const body = z
      .object({
        availability: z.enum(AVAILABILITY),
        priceCentsFrom: z.number().int().min(0).max(500_000_00).nullable().optional(),
        priceCentsTo: z.number().int().min(0).max(500_000_00).nullable().optional(),
        depositCents: z.number().int().min(0).max(500_000_00).nullable().optional(),
        priceNotes: z.string().max(1000).nullable().optional(),
        headline: z.string().max(160).nullable().optional(),
        description: z.string().max(8000).nullable().optional(),
        includedInPrice: z.string().max(4000).nullable().optional(),
        buyerRequirements: z.string().max(4000).nullable().optional(),
        goHomeFrom: z.coerce.date().nullable().optional(),
        photoUrls: z.array(z.string().url()).max(24).optional(),
      })
      .parse(req.body);

    if (
      body.priceCentsFrom != null &&
      body.priceCentsTo != null &&
      body.priceCentsTo < body.priceCentsFrom
    ) {
      throw badRequest('The top of the price range cannot be below the bottom of it.');
    }
    if (
      body.depositCents != null &&
      body.priceCentsFrom != null &&
      body.depositCents > body.priceCentsFrom
    ) {
      throw badRequest('The deposit cannot exceed the lowest price in the range.');
    }

    /**
     * Eight weeks is a hard floor.
     *
     * Most states set it in statute and every welfare body agrees on it. This
     * refuses rather than warns, because a go-home date is the one field on
     * this page where being agreeable would do real harm to an animal.
     */
    if (body.goHomeFrom && litter.whelpedOn) {
      const ageDays = Math.floor(
        (body.goHomeFrom.getTime() - litter.whelpedOn.getTime()) / 86_400_000,
      );
      if (ageDays < 56) {
        throw badRequest(
          `That go-home date is ${ageDays} days after whelping. Puppies should not leave the litter before eight weeks — it is a legal minimum in most states and a welfare one everywhere.`,
        );
      }
    }

    const publishing = body.availability !== 'NOT_LISTED';

    // Derived, never authored. Same function the seed and the puppy-status
    // path use, so a browse page cannot advertise puppies that are sold.
    const cached = await computeListingCache(app.db, id);
    if (!cached) throw notFound('Litter not found');

    const slug =
      litter.listing?.slug ??
      (await (async () => {
        // Resolve collisions against the table, with the pure builder deciding
        // the shape. One query per candidate, and only on first publish.
        const taken = new Set<string>();
        for (;;) {
          const candidate = buildListingSlug(litter, (c) => taken.has(c));
          const clash = await app.db.litterListing.findUnique({
            where: { slug: candidate },
            select: { id: true },
          });
          if (!clash) return candidate;
          taken.add(candidate);
        }
      })());

    const listing = await app.db.litterListing.upsert({
      where: { litterId: id },
      create: {
        litterId: id,
        slug,
        ...body,
        ...cached,
        publishedAt: publishing ? new Date() : null,
      },
      update: {
        ...body,
        ...cached,
        /**
         * `publishedAt` is the FIRST publication date and is never cleared.
         *
         * Visibility is `availability`, not this. Nulling it on unpublish
         * would mean a breeder who hides a litter for a week and puts it back
         * loses its age — and a page that has been up for two years is a
         * genuinely different thing from one posted this morning, to a
         * search engine and to a buyer.
         */
        publishedAt: litter.listing?.publishedAt ?? (publishing ? new Date() : null),
      },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'litter.listing.update',
      entityType: 'LitterListing',
      entityId: listing.id,
      after: { availability: listing.availability, slug: listing.slug },
      ipAddress: req.ip,
    });
    return { listing };
  });

  app.get('/litters/:id/listing', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const litter = await app.db.litter.findUnique({ where: { id }, select: { damId: true } });
    if (!litter) throw notFound('Litter not found');
    if (!(await canEditDog(app.db, user.id, user.roles, litter.damId))) {
      throw forbidden('You do not have access to this litter.');
    }
    const listing = await app.db.litterListing.findUnique({ where: { litterId: id } });
    return { listing };
  });

  // ── Enquiries ───────────────────────────────────────────────────────────
  app.post('/litters/public/:slug/inquiries', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const listing = await app.db.litterListing.findUnique({
      where: { slug },
      select: { id: true, publishedAt: true, availability: true, litterId: true },
    });
    if (!listing || !listing.publishedAt || listing.availability === 'NOT_LISTED') {
      throw notFound('Litter not found');
    }

    const body = z
      .object({
        name: z.string().min(1).max(160),
        email: z.string().email(),
        phone: z.string().max(40).optional(),
        message: z.string().min(10).max(4000),
        puppyId: z.string().optional(),
        householdNotes: z.string().max(2000).optional(),
        hasOtherDogs: z.boolean().optional(),
        hasChildren: z.boolean().optional(),
        homeType: z.string().max(80).optional(),
      })
      .parse(req.body);

    if (body.puppyId) {
      const puppy = await app.db.puppy.findUnique({
        where: { id: body.puppyId },
        select: { litterId: true },
      });
      if (!puppy || puppy.litterId !== listing.litterId) {
        throw badRequest('That puppy is not in this litter.');
      }
    }

    // Signed in is better — it links the enquiry to an identity — but it is
    // not required. Forcing a signup before a first question is how a
    // marketplace loses the buyer who was only half sure. The auth plugin
    // populates `req.user` on every request without failing anonymous ones.
    const inquiry = await app.db.litterInquiry.create({
      data: { litterListingId: listing.id, fromUserId: req.user?.id ?? null, ...body },
    });
    return reply.code(201).send({ inquiry: { id: inquiry.id, createdAt: inquiry.createdAt } });
  });

  app.get('/litters/inquiries/inbox', async (req) => {
    const user = await app.requireUser(req);
    const inquiries = await app.db.litterInquiry.findMany({
      where: {
        litterListing: {
          litter: {
            dam: {
              OR: [
                { ownerships: { some: { userId: user.id, endedAt: null } } },
                { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } },
              ],
            },
          },
        },
      },
      include: {
        litterListing: { select: { slug: true, headline: true, litterId: true } },
        puppy: { select: { id: true, name: true, collarColor: true, sex: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { inquiries };
  });

  app.patch('/litter-inquiries/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const inquiry = await app.db.litterInquiry.findUnique({
      where: { id },
      include: { litterListing: { include: { litter: { select: { damId: true } } } } },
    });
    if (!inquiry) throw notFound('Inquiry not found');
    if (!(await canEditDog(app.db, user.id, user.roles, inquiry.litterListing.litter.damId))) {
      throw forbidden('You do not have access to this inquiry.');
    }

    const body = z
      .object({
        status: z.enum(['NEW', 'READ', 'REPLIED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']).optional(),
        replyMessage: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const updated = await app.db.litterInquiry.update({
      where: { id },
      data: {
        ...body,
        ...(body.replyMessage ? { repliedAt: new Date(), status: 'REPLIED' as const } : {}),
        readAt: inquiry.readAt ?? new Date(),
      },
    });
    return { inquiry: updated };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const parentInclude = {
  registrations: { orderBy: { isPrimary: 'desc' as const } },
  verifiedClaims: {
    where: { state: { in: ['VERIFIED', 'STALE', 'CONFLICTED'] as VerificationState[] } },
    orderBy: [{ category: 'asc' as const }, { claimType: 'asc' as const }],
  },
  reportedClaims: true,
  verificationSummary: true,
  pedigreeStats: true,
  kennel: {
    select: {
      id: true, slug: true, name: true, prefix: true, about: true, websiteUrl: true,
      city: true, region: true, country: true, latitude: true, longitude: true, foundedYear: true,
    },
  },
  sire: { select: { slug: true, callName: true, registeredName: true } },
  damRel: { select: { slug: true, callName: true, registeredName: true } },
};

type ParentDog = {
  verifiedClaims: { claimType: string; markerName: string | null; outcome: string | null; state: string }[];
};

/** Only VERIFIED and STALE count as genetic evidence. (D24, Phase 4.) */
function toGeneticClaims(claims: ParentDog['verifiedClaims']): GeneticClaimInput[] {
  return claims
    .filter((c) => c.state === 'VERIFIED' || c.state === 'STALE')
    .map((c) => ({
      claimType: c.claimType,
      markerName: c.markerName ?? '',
      outcome: c.outcome as GeneticClaimInput['outcome'],
      state: c.state,
    }));
}

/**
 * The COI the puppies in this litter actually carry.
 *
 * Computed from the parents' ancestry, not stored on the litter — a pedigree
 * correction upstream has to move this number, and a cached one would not.
 */
async function projectedCoi(db: PrismaClient, sireId: string, damId: string) {
  const graph = await loadAncestryGraph(db, [sireId, damId], 6);
  const pairing = evaluatePairing(graph, sireId, damId, { generations: 6 });
  return {
    coi: pairing.projectedCoi,
    band: pairing.coiBand,
    relationship: pairing.relationship,
    sireCoi: pairing.sireCoi,
    damCoi: pairing.damCoi,
    generations: pairing.generations,
    // Shown next to the number, always. A 0% COI on a two-generation pedigree
    // is not the same claim as a 0% COI on a complete five.
    confidence: pairing.confidence,
    confidenceNote: pairing.confidenceNote,
    sireCompleteness: pairing.sireCompleteness.ratio,
    damCompleteness: pairing.damCompleteness.ratio,
  };
}

/** The public shape of a parent. Nothing private, everything verifiable. */
function publicParent<T extends Record<string, unknown>>(dog: T) {
  const { notes, ...rest } = dog as T & { notes?: unknown };
  void notes;
  return rest;
}

/**
 * The `cached*` columns are search plumbing and not part of the API.
 *
 * `litter` comes back on its own key, so it is dropped here too rather than
 * serialised twice into the same response.
 */
function stripCache<T extends Record<string, unknown>>(listing: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(listing)) {
    if (!k.startsWith('cached') && k !== 'litter') out[k] = v;
  }
  return out as Omit<T, `cached${string}` | 'litter'>;
}

