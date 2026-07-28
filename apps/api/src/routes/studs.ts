import { evaluatePairing } from '@stud/pedigree';
import { assessPairingRisk, type GeneticClaimInput } from '@stud/verify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { boundingBox, estimatedDriveHours, haversineMiles } from '../lib/geo.js';
import { loadAncestryGraph } from '@stud/db/pedigree-loader';

const SEMEN_TYPES = ['NATURAL', 'FRESH', 'CHILLED', 'FROZEN'] as const;
const AVAILABILITY = ['AVAILABLE', 'LIMITED', 'BOOKED', 'RETIRED', 'NOT_LISTED'] as const;

/**
 * Stud directory, trial pairing, inquiries and shortlists.
 *
 * The search here is what separates this from a classified board: you cannot
 * filter a listings site by "verified normal hips", because a listings site
 * has no idea whether the hips are normal. Every health and title filter below
 * reads from the verified claim tables, never from anything a seller typed.
 */
export default async function studRoutes(app: FastifyInstance) {
  // ── Search ──────────────────────────────────────────────────────────────
  app.get('/studs', async (req) => {
    const q = z
      .object({
        breed: z.string().max(120).optional(),
        search: z.string().max(120).optional(),
        availability: z.enum(AVAILABILITY).optional(),
        semenType: z.enum(SEMEN_TYPES).optional(),
        shipsSemen: z.coerce.boolean().optional(),
        maxFeeCents: z.coerce.number().int().min(0).optional(),
        minFeeCents: z.coerce.number().int().min(0).optional(),
        /** Verified NORMAL results required for these claim types. */
        verifiedNormal: z.string().max(300).optional(),
        requireChic: z.coerce.boolean().optional(),
        /** Verified titles required — any one of these claim types. */
        hasTitle: z.string().max(300).optional(),
        /** Distance search. All three are needed together. */
        lat: z.coerce.number().min(-90).max(90).optional(),
        lon: z.coerce.number().min(-180).max(180).optional(),
        withinMiles: z.coerce.number().min(1).max(3000).optional(),
        /** Rank by projected COI against this bitch. */
        damId: z.string().optional(),
        maxCoi: z.coerce.number().min(0).max(1).optional(),
        sort: z.enum(['RELEVANCE', 'FEE_ASC', 'FEE_DESC', 'VERIFIED', 'DISTANCE', 'COI']).default('RELEVANCE'),
        take: z.coerce.number().min(1).max(60).default(24),
        skip: z.coerce.number().min(0).default(0),
      })
      .parse(req.query);

    const normalClaims = q.verifiedNormal?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
    const titleClaims = q.hasTitle?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

    // Health filters are AND — a breeder asking for verified hips AND elbows
    // means both, and quietly turning that into OR would be the kind of
    // helpfulness that returns the wrong dog.
    const claimFilters = [
      ...normalClaims.map((claimType) => ({
        verifiedClaims: {
          some: { claimType, outcome: 'NORMAL' as const, state: { in: ['VERIFIED', 'STALE'] as ('VERIFIED'|'STALE')[] } },
        },
      })),
      ...(q.requireChic
        ? [{ verifiedClaims: { some: { claimType: 'CHIC', state: { in: ['VERIFIED', 'STALE'] as ('VERIFIED'|'STALE')[] } } } }]
        : []),
      ...(titleClaims.length
        ? [{ verifiedClaims: { some: { claimType: { in: titleClaims }, state: { in: ['VERIFIED', 'STALE'] as ('VERIFIED'|'STALE')[] } } } }]
        : []),
    ];

    // Bounding box prefilter before the exact haversine pass — trig in a WHERE
    // clause does not survive contact with a real dataset.
    const box =
      q.lat != null && q.lon != null && q.withinMiles
        ? boundingBox(q.lat, q.lon, q.withinMiles)
        : null;

    const listings = await app.db.studListing.findMany({
      where: {
        availability: q.availability ?? { not: 'NOT_LISTED' },
        publishedAt: { not: null },
        ...(q.semenType ? { semenTypes: { has: q.semenType } } : {}),
        ...(q.shipsSemen !== undefined ? { shipsSemen: q.shipsSemen } : {}),
        ...(q.maxFeeCents != null ? { studFeeCents: { lte: q.maxFeeCents } } : {}),
        ...(q.minFeeCents != null ? { studFeeCents: { gte: q.minFeeCents } } : {}),
        dog: {
          sex: 'MALE',
          supersededByDogId: null,
          isPublished: true,
          ...(q.breed ? { breed: q.breed } : {}),
          ...(q.search
            ? {
                OR: [
                  { callName: { contains: q.search, mode: 'insensitive' as const } },
                  { registeredName: { contains: q.search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
          ...(claimFilters.length ? { AND: claimFilters } : {}),
          ...(box
            ? {
                kennel: {
                  latitude: { gte: box.minLat, lte: box.maxLat },
                  longitude: { gte: box.minLon, lte: box.maxLon },
                },
              }
            : {}),
        },
      },
      include: {
        dog: {
          select: {
            id: true, slug: true, callName: true, registeredName: true, breed: true,
            dateOfBirth: true, colorPattern: true,
            media: { where: { isPrimary: true }, take: 1 },
            registrations: { where: { isPrimary: true }, take: 1 },
            pedigreeStats: true,
            verificationSummary: true,
            kennel: {
              select: { id: true, slug: true, name: true, city: true, region: true, latitude: true, longitude: true },
            },
            verifiedClaims: {
              where: { state: { in: ['VERIFIED', 'STALE'] } },
              select: { claimType: true, markerName: true, outcome: true, rawResult: true, state: true, source: true },
            },
          },
        },
      },
      take: 200,
    });

    // ── Distance, exact ──
    let rows = listings.map((l) => {
      const k = l.dog.kennel;
      const distanceMiles =
        q.lat != null && q.lon != null && k?.latitude != null && k?.longitude != null
          ? haversineMiles({ latitude: q.lat, longitude: q.lon }, { latitude: k.latitude, longitude: k.longitude })
          : null;
      return {
        ...l,
        distanceMiles,
        driveHours: distanceMiles != null ? estimatedDriveHours(distanceMiles) : null,
        projectedCoi: null as number | null,
        geneticRisk: null as { atRisk: number; unknown: number; worst: string } | null,
      };
    });

    if (q.withinMiles != null && q.lat != null) {
      rows = rows.filter((r) => r.distanceMiles == null || r.distanceMiles <= q.withinMiles!);
    }

    // ── Project a COI against the breeder's bitch ──
    //
    // This is the search nobody else can do: filtering studs by what a litter
    // WITH THIS PARTICULAR BITCH would look like, rather than by the stud's
    // own numbers.
    if (q.damId) {
      const dam = await app.db.dog.findUnique({
        where: { id: q.damId },
        select: {
          id: true, sex: true, callName: true,
          verifiedClaims: {
            where: { claimType: { in: ['DNA_MARKER', 'DNA_PANEL'] }, state: { in: ['VERIFIED', 'STALE'] } },
            select: { claimType: true, markerName: true, outcome: true, state: true },
          },
        },
      });
      if (!dam) throw notFound('That bitch is not on file');
      if (dam.sex !== 'FEMALE') throw badRequest(`${dam.callName} is not recorded as female.`);

      const graph = await loadAncestryGraph(app.db, [dam.id, ...rows.map((r) => r.dogId)], 8);
      const damGenetics = dam.verifiedClaims as GeneticClaimInput[];

      rows = rows.map((r) => {
        const pairing = evaluatePairing(graph, r.dogId, dam.id, { generations: 6 });
        const sireGenetics = r.dog.verifiedClaims.filter(
          (c) => c.claimType === 'DNA_MARKER' || c.claimType === 'DNA_PANEL',
        ) as GeneticClaimInput[];
        const risk = assessPairingRisk(sireGenetics, damGenetics);
        return {
          ...r,
          projectedCoi: pairing.projectedCoi,
          geneticRisk: { atRisk: risk.atRisk.length, unknown: risk.unknown.length, worst: risk.worst },
        };
      });

      if (q.maxCoi != null) {
        rows = rows.filter((r) => r.projectedCoi != null && r.projectedCoi <= q.maxCoi!);
      }
    }

    // ── Sort ──
    const sorters: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      FEE_ASC: (a, b) => (a.studFeeCents ?? Infinity) - (b.studFeeCents ?? Infinity),
      FEE_DESC: (a, b) => (b.studFeeCents ?? -1) - (a.studFeeCents ?? -1),
      VERIFIED: (a, b) => (b.cachedDensity ?? 0) - (a.cachedDensity ?? 0),
      DISTANCE: (a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity),
      COI: (a, b) => (a.projectedCoi ?? Infinity) - (b.projectedCoi ?? Infinity),
      // Relevance leads with verification density. On a platform whose whole
      // argument is that verification matters, the default sort has to agree.
      RELEVANCE: (a, b) =>
        (b.dog.verificationSummary?.density ?? 0) - (a.dog.verificationSummary?.density ?? 0),
    };
    rows.sort(sorters[q.sort] ?? sorters.RELEVANCE!);

    const total = rows.length;
    return {
      studs: rows.slice(q.skip, q.skip + q.take),
      total,
      take: q.take,
      skip: q.skip,
      filtersApplied: {
        verifiedNormal: normalClaims,
        hasTitle: titleClaims,
        requireChic: Boolean(q.requireChic),
        withinMiles: q.withinMiles ?? null,
        damId: q.damId ?? null,
      },
    };
  });

  // ── Profile ─────────────────────────────────────────────────────────────
  app.get('/studs/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const dog = await app.db.dog.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      include: {
        studListing: true,
        media: { orderBy: { position: 'asc' } },
        registrations: { orderBy: { isPrimary: 'desc' } },
        kennel: {
          select: {
            id: true, slug: true, name: true, prefix: true, about: true,
            city: true, region: true, country: true, latitude: true, longitude: true,
          },
        },
        verifiedClaims: {
          where: { state: { in: ['VERIFIED', 'STALE', 'CONFLICTED'] } },
          orderBy: [{ category: 'asc' }, { claimType: 'asc' }],
        },
        reportedClaims: true,
        verificationSummary: true,
        pedigreeStats: true,
        sire: { select: { id: true, slug: true, callName: true, registeredName: true } },
        damRel: { select: { id: true, slug: true, callName: true, registeredName: true } },
      },
    });
    if (!dog) throw notFound('Stud not found');

    // The produce record. Over time this is what a competitor cannot
    // replicate — a stud's profile stops being a résumé and becomes a track
    // record.
    const [offspring, litters] = await Promise.all([
      app.db.dog.findMany({
        where: { sireId: dog.id, supersededByDogId: null },
        select: {
          id: true, slug: true, callName: true, registeredName: true, sex: true, dateOfBirth: true,
          verificationSummary: { select: { verifiedCount: true, healthNormalCount: true } },
        },
        orderBy: { dateOfBirth: 'desc' },
        take: 50,
      }),
      app.db.litter.findMany({
        where: { sireId: dog.id },
        select: {
          id: true, letter: true, whelpedOn: true, liveBorn: true,
          dam: { select: { id: true, slug: true, callName: true, registeredName: true } },
        },
        orderBy: { whelpedOn: 'desc' },
        take: 20,
      }),
    ]);

    return { dog, listing: dog.studListing, offspring, litters };
  });

  // ── Manage a listing ────────────────────────────────────────────────────
  app.put('/dogs/:id/stud-listing', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    if (!(await canEditDog(app.db, user.id, user.roles, id))) {
      throw forbidden('You do not have access to this dog');
    }

    const dog = await app.db.dog.findUnique({
      where: { id },
      select: { id: true, sex: true, callName: true, verificationSummary: true, pedigreeStats: true },
    });
    if (!dog) throw notFound('Dog not found');
    if (dog.sex !== 'MALE') throw badRequest(`${dog.callName} is recorded as female and cannot be listed at stud.`);

    const body = z
      .object({
        availability: z.enum(AVAILABILITY),
        studFeeCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
        pickOfLitter: z.boolean().optional(),
        feeNotes: z.string().max(500).optional(),
        semenTypes: z.array(z.enum(SEMEN_TYPES)).max(4).default([]),
        shipsSemen: z.boolean().optional(),
        travelRadiusMiles: z.number().int().min(0).max(5000).nullable().optional(),
        willTravel: z.boolean().optional(),
        temperamentNotes: z.string().max(4000).optional(),
        producedNotes: z.string().max(4000).optional(),
        requirements: z.string().max(4000).optional(),
        requiresHealthTesting: z.boolean().optional(),
        requiresContract: z.boolean().optional(),
        requiresBrucellosis: z.boolean().optional(),
        publish: z.boolean().optional(),
      })
      .parse(req.body);

    const { publish, ...rest } = body;
    const cached = {
      cachedVerifiedCount: dog.verificationSummary?.verifiedCount ?? 0,
      cachedDensity: dog.verificationSummary?.density ?? 0,
      cachedCoi: dog.pedigreeStats?.coi ?? null,
    };

    const listing = await app.db.studListing.upsert({
      where: { dogId: id },
      create: {
        dogId: id,
        ...rest,
        ...cached,
        publishedAt: publish ? new Date() : null,
      },
      update: {
        ...rest,
        ...cached,
        ...(publish !== undefined ? { publishedAt: publish ? new Date() : null } : {}),
      },
    });

    // A listed stud has to be publicly visible, or the listing points at a
    // 404. Publishing the listing publishes the dog.
    if (publish) await app.db.dog.update({ where: { id }, data: { isPublished: true } });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'stud.listing.update',
      entityType: 'StudListing',
      entityId: listing.id,
      after: listing,
      ipAddress: req.ip,
    });
    return { listing };
  });

  // ── Trial pairing, with genetic risk ────────────────────────────────────
  /**
   * The Phase 4 gate. Everything the platform knows about two dogs, applied to
   * a litter that does not exist.
   */
  app.get('/pairings/evaluate', async (req) => {
    const q = z
      .object({
        sireId: z.string(),
        damId: z.string(),
        generations: z.coerce.number().min(2).max(10).default(6),
      })
      .parse(req.query);

    // Loaded through a helper rather than a shared `select` object, so
    // TypeScript keeps the relation types instead of widening to the base row.
    const loadPairingDog = (id: string) =>
      app.db.dog.findUnique({
        where: { id },
        select: {
          id: true, slug: true, callName: true, registeredName: true, sex: true, breed: true,
          verificationSummary: true,
          verifiedClaims: {
            where: { state: { in: ['VERIFIED', 'STALE'] } },
            select: {
              claimType: true, markerName: true, outcome: true,
              rawResult: true, state: true, source: true,
            },
          },
          kennel: { select: { id: true, slug: true, name: true, city: true, region: true } },
        },
      });

    const [sire, dam] = await Promise.all([loadPairingDog(q.sireId), loadPairingDog(q.damId)]);
    if (!sire) throw notFound('Sire not found');
    if (!dam) throw notFound('Dam not found');
    if (sire.sex !== 'MALE') throw badRequest(`${sire.callName} is not recorded as male.`);
    if (dam.sex !== 'FEMALE') throw badRequest(`${dam.callName} is not recorded as female.`);

    const graph = await loadAncestryGraph(app.db, [sire.id, dam.id], q.generations + 2);
    const pairing = evaluatePairing(graph, sire.id, dam.id, { generations: q.generations });

    const genetic = (d: NonNullable<typeof sire>) =>
      d.verifiedClaims.filter(
        (c) => c.claimType === 'DNA_MARKER' || c.claimType === 'DNA_PANEL',
      ) as GeneticClaimInput[];
    const risk = assessPairingRisk(genetic(sire), genetic(dam));

    // Name the shared ancestors so the chart can highlight them.
    const ancestorIds = pairing.contributions.map((c) => c.id);
    const ancestors = ancestorIds.length
      ? await app.db.dog.findMany({
          where: { id: { in: ancestorIds } },
          select: { id: true, slug: true, callName: true, registeredName: true, dateOfBirth: true },
        })
      : [];
    const byId = new Map(ancestors.map((a) => [a.id, a]));

    // Health claims both dogs hold, side by side. A pairing where the sire is
    // fully panelled and the dam is not is a real finding, not a gap to hide.
    const healthComparison = compareHealth(sire.verifiedClaims, dam.verifiedClaims);

    return {
      sire,
      dam,
      crossBreed: sire.breed !== dam.breed ? { sire: sire.breed, dam: dam.breed } : null,
      pairing: {
        ...pairing,
        contributions: pairing.contributions.map((c) => ({ ...c, dog: byId.get(c.id) ?? null })),
      },
      geneticRisk: risk,
      healthComparison,
    };
  });

  // ── Shortlists ──────────────────────────────────────────────────────────
  app.get('/pairings/saved', async (req) => {
    const user = await app.requireUser(req);
    const saved = await app.db.savedPairing.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        sire: {
          select: {
            id: true, slug: true, callName: true, registeredName: true,
            verificationSummary: { select: { density: true, verifiedCount: true } },
            studListing: { select: { studFeeCents: true, availability: true } },
          },
        },
        dam: { select: { id: true, slug: true, callName: true, registeredName: true } },
      },
    });
    return { saved };
  });

  app.post('/pairings/saved', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        sireId: z.string(),
        damId: z.string(),
        label: z.string().max(120).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body);

    if (!(await canEditDog(app.db, user.id, user.roles, body.damId))) {
      throw forbidden('You can only shortlist a stud against a bitch you have access to.');
    }

    // Snapshot the numbers at save time so a shortlist can be compared without
    // recomputing, and so a breeder can see what moved since they saved it.
    const graph = await loadAncestryGraph(app.db, [body.sireId, body.damId], 8);
    const pairing = evaluatePairing(graph, body.sireId, body.damId, { generations: 6 });

    const [sireClaims, damClaims] = await Promise.all([
      app.db.verifiedClaim.findMany({
        where: { dogId: body.sireId, claimType: { in: ['DNA_MARKER', 'DNA_PANEL'] } },
        select: { claimType: true, markerName: true, outcome: true, state: true },
      }),
      app.db.verifiedClaim.findMany({
        where: { dogId: body.damId, claimType: { in: ['DNA_MARKER', 'DNA_PANEL'] } },
        select: { claimType: true, markerName: true, outcome: true, state: true },
      }),
    ]);
    const risk = assessPairingRisk(sireClaims as GeneticClaimInput[], damClaims as GeneticClaimInput[]);

    const data = {
      projectedCoi: pairing.projectedCoi,
      coiGenerations: pairing.generations,
      coiBand: pairing.coiBand,
      coiConfidence: pairing.confidence,
      atRiskMarkerCount: risk.atRisk.length,
      sharedAncestors: pairing.contributions.length,
      computedAt: new Date(),
      label: body.label,
      notes: body.notes,
    };

    const saved = await app.db.savedPairing.upsert({
      where: { userId_sireId_damId: { userId: user.id, sireId: body.sireId, damId: body.damId } },
      create: { userId: user.id, sireId: body.sireId, damId: body.damId, ...data },
      update: data,
    });
    return reply.code(201).send({ saved });
  });

  app.delete('/pairings/saved/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const saved = await app.db.savedPairing.findUnique({ where: { id }, select: { userId: true } });
    if (!saved) throw notFound('Not found');
    if (saved.userId !== user.id) throw forbidden('That is not your shortlist');
    await app.db.savedPairing.delete({ where: { id } });
    return { ok: true };
  });

  // ── Inquiries ───────────────────────────────────────────────────────────
  /**
   * Ask about a stud.
   *
   * The inquiry carries the pairing's numbers and the bitch's verification
   * density, because the whole point is that a stud owner triages on evidence
   * rather than on how well someone writes an email.
   */
  app.post('/studs/:listingId/inquiries', async (req, reply) => {
    const { listingId } = z.object({ listingId: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const body = z
      .object({
        damId: z.string().optional(),
        message: z.string().min(10).max(4000),
        proposedSeason: z.string().max(60).optional(),
        proposedMethod: z.string().max(60).optional(),
        fromKennelId: z.string().optional(),
      })
      .parse(req.body);

    const listing = await app.db.studListing.findUnique({
      where: { id: listingId },
      include: { dog: { select: { id: true, callName: true } } },
    });
    if (!listing) throw notFound('That stud is not listed');

    let projectedCoi: number | null = null;
    let coiGenerations: number | null = null;
    let geneticRiskSummary: string | null = null;
    let atRiskMarkerCount = 0;
    let damVerifiedCount = 0;

    if (body.damId) {
      if (!(await canEditDog(app.db, user.id, user.roles, body.damId))) {
        throw forbidden('You can only enquire on behalf of a bitch you have access to.');
      }
      const dam = await app.db.dog.findUnique({
        where: { id: body.damId },
        select: {
          id: true, sex: true, callName: true,
          verificationSummary: { select: { verifiedCount: true } },
          verifiedClaims: {
            where: { claimType: { in: ['DNA_MARKER', 'DNA_PANEL'] }, state: { in: ['VERIFIED', 'STALE'] } },
            select: { claimType: true, markerName: true, outcome: true, state: true },
          },
        },
      });
      if (!dam) throw notFound('That bitch is not on file');
      if (dam.sex !== 'FEMALE') throw badRequest(`${dam.callName} is not recorded as female.`);

      const graph = await loadAncestryGraph(app.db, [listing.dogId, dam.id], 8);
      const pairing = evaluatePairing(graph, listing.dogId, dam.id, { generations: 6 });
      projectedCoi = pairing.projectedCoi;
      coiGenerations = pairing.generations;
      damVerifiedCount = dam.verificationSummary?.verifiedCount ?? 0;

      const sireClaims = await app.db.verifiedClaim.findMany({
        where: { dogId: listing.dogId, claimType: { in: ['DNA_MARKER', 'DNA_PANEL'] } },
        select: { claimType: true, markerName: true, outcome: true, state: true },
      });
      const risk = assessPairingRisk(
        sireClaims as GeneticClaimInput[],
        dam.verifiedClaims as GeneticClaimInput[],
      );
      geneticRiskSummary = risk.summary;
      atRiskMarkerCount = risk.atRisk.length;
    }

    const inquiry = await app.db.studInquiry.create({
      data: {
        studListingId: listingId,
        damId: body.damId ?? null,
        fromUserId: user.id,
        fromKennelId: body.fromKennelId ?? null,
        message: body.message,
        proposedSeason: body.proposedSeason,
        proposedMethod: body.proposedMethod,
        projectedCoi,
        coiGenerations,
        geneticRiskSummary,
        atRiskMarkerCount,
        damVerifiedCount,
      },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'stud.inquiry.create',
      entityType: 'StudInquiry',
      entityId: inquiry.id,
      after: { listingId, damId: body.damId, projectedCoi, atRiskMarkerCount },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ inquiry });
  });

  /** The stud owner's inbox. */
  app.get('/studs/inquiries/inbox', async (req) => {
    const user = await app.requireUser(req);
    const q = z.object({ status: z.enum(['NEW', 'READ', 'REPLIED', 'ACCEPTED', 'DECLINED']).optional() }).parse(req.query);

    const inquiries = await app.db.studInquiry.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        studListing: {
          dog: {
            OR: [
              { ownerships: { some: { userId: user.id, endedAt: null } } },
              { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } },
            ],
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        studListing: { include: { dog: { select: { id: true, slug: true, callName: true } } } },
        dam: {
          select: {
            id: true, slug: true, callName: true, registeredName: true, breed: true, dateOfBirth: true,
            verificationSummary: true,
            pedigreeStats: true,
            kennel: { select: { id: true, slug: true, name: true, city: true, region: true } },
            verifiedClaims: {
              where: { state: { in: ['VERIFIED', 'STALE'] } },
              select: { claimType: true, outcome: true, rawResult: true, markerName: true },
            },
          },
        },
        fromUser: { select: { id: true, displayName: true, city: true, region: true, avatarUrl: true } },
      },
    });
    return { inquiries };
  });

  app.patch('/studs/inquiries/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const inquiry = await app.db.studInquiry.findUnique({
      where: { id },
      include: { studListing: { select: { dogId: true } } },
    });
    if (!inquiry) throw notFound('Inquiry not found');
    if (!(await canEditDog(app.db, user.id, user.roles, inquiry.studListing.dogId))) {
      throw forbidden('That inquiry is not yours to answer');
    }

    const body = z
      .object({
        status: z.enum(['READ', 'REPLIED', 'ACCEPTED', 'DECLINED']).optional(),
        replyMessage: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const updated = await app.db.studInquiry.update({
      where: { id },
      data: {
        ...body,
        ...(body.status === 'READ' && !inquiry.readAt ? { readAt: new Date() } : {}),
        ...(body.replyMessage ? { repliedAt: new Date(), status: body.status ?? 'REPLIED' } : {}),
      },
    });
    return { inquiry: updated };
  });

  /** Inquiries the current user has sent. */
  app.get('/studs/inquiries/sent', async (req) => {
    const user = await app.requireUser(req);
    const inquiries = await app.db.studInquiry.findMany({
      where: { fromUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        studListing: {
          include: {
            dog: { select: { id: true, slug: true, callName: true, registeredName: true } },
          },
        },
        dam: { select: { id: true, slug: true, callName: true } },
      },
    });
    return { inquiries };
  });
}

/**
 * Side-by-side health comparison.
 *
 * Deliberately shows what each dog is MISSING as well as what it has. A
 * pairing where the sire is fully panelled and the bitch is not is a real
 * finding, and hiding it would flatter whichever dog is being sold.
 */
function compareHealth(
  sireClaims: readonly { claimType: string; outcome: string | null; rawResult: string | null; state: string }[],
  damClaims: readonly { claimType: string; outcome: string | null; rawResult: string | null; state: string }[],
) {
  const CORE = ['HIP', 'ELBOW', 'EYE_CAER', 'CARDIAC', 'THYROID', 'PATELLA'];
  const find = (claims: typeof sireClaims, t: string) => claims.find((c) => c.claimType === t) ?? null;

  return CORE.map((claimType) => {
    const sire = find(sireClaims, claimType);
    const dam = find(damClaims, claimType);
    return {
      claimType,
      sire: sire ? { result: sire.rawResult, outcome: sire.outcome, state: sire.state } : null,
      dam: dam ? { result: dam.rawResult, outcome: dam.outcome, state: dam.state } : null,
      bothVerified: Boolean(sire && dam),
      gap: !sire && !dam ? 'BOTH' : !sire ? 'SIRE' : !dam ? 'DAM' : null,
    };
  });
}
