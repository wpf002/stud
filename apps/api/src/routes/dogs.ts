import {
  buildChart,
  completeness,
  evaluatePairing,
  inbreedingCoefficient,
  pathContributions,
} from '@stud/pedigree';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { canEditDog } from '../lib/dog-access.js';
import { loadAncestryGraph, wouldCreateCycle } from '@stud/db/pedigree-loader';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

const dogInput = z.object({
  callName: z.string().min(1).max(80),
  registeredName: z.string().max(200).optional(),
  breed: z.string().min(1).max(120),
  secondaryBreed: z.string().max(120).optional(),
  sex: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: z.coerce.date().optional(),
  dateOfDeath: z.coerce.date().optional(),
  colorPattern: z.string().max(120).optional(),
  markings: z.string().max(400).optional(),
  coatType: z.string().max(80).optional(),
  heightCm: z.number().min(5).max(120).optional(),
  weightKg: z.number().min(0.05).max(120).optional(),
  microchip: z.string().max(40).optional(),
  microchipIssuer: z.string().max(80).optional(),
  dnaProfileId: z.string().max(80).optional(),
  temperamentNotes: z.string().max(4000).optional(),
  ownerNotes: z.string().max(4000).optional(),
  kennelId: z.string().optional(),
  isPublished: z.boolean().optional(),
  isRetired: z.boolean().optional(),
  isDeceased: z.boolean().optional(),
  sireId: z.string().nullable().optional(),
  damId: z.string().nullable().optional(),
  registrations: z
    .array(
      z.object({
        body: z.enum([
          'AKC', 'UKC', 'CKC', 'FCI', 'KC', 'NAVHDA', 'AFTCA', 'ABCA', 'JRTCA', 'CONTINENTAL', 'OTHER',
        ]),
        number: z.string().min(1).max(60),
        nameOnRecord: z.string().max(200).optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .max(8)
    .optional(),
});

async function assertCanEditDog(app: FastifyInstance, req: FastifyRequest, dogId: string) {
  const user = await app.requireUser(req);
  const dog = await app.db.dog.findUnique({ where: { id: dogId }, select: { id: true } });
  if (!dog) throw notFound('Dog not found');
  if (!(await canEditDog(app.db, user.id, user.roles, dogId))) {
    throw forbidden('You do not have access to this dog');
  }
  return user;
}

export default async function dogRoutes(app: FastifyInstance) {
  // ── List ────────────────────────────────────────────────────────────────
  app.get('/dogs', async (req) => {
    const q = z
      .object({
        kennelId: z.string().optional(),
        breed: z.string().optional(),
        sex: z.enum(['MALE', 'FEMALE']).optional(),
        search: z.string().max(120).optional(),
        mine: z.coerce.boolean().optional(),
        includeStubs: z.coerce.boolean().default(false),
        take: z.coerce.number().min(1).max(100).default(50),
        skip: z.coerce.number().min(0).default(0),
      })
      .parse(req.query);

    const user = req.user;
    const where: Record<string, unknown> = {
      // Superseded records never appear in lists — their links still resolve,
      // but they are not the record any more.
      supersededByDogId: null,
      ...(q.includeStubs ? {} : { isAncestorStub: false }),
      ...(q.kennelId ? { kennelId: q.kennelId } : {}),
      ...(q.breed ? { breed: q.breed } : {}),
      ...(q.sex ? { sex: q.sex } : {}),
      ...(q.search
        ? {
            OR: [
              { callName: { contains: q.search, mode: 'insensitive' } },
              { registeredName: { contains: q.search, mode: 'insensitive' } },
              { registrations: { some: { number: { contains: q.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    if (q.mine) {
      if (!user) throw forbidden('Sign in to see your dogs');
      where.OR = [
        { ownerships: { some: { userId: user.id, endedAt: null } } },
        { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } },
      ];
    } else if (!user) {
      where.isPublished = true;
    }

    const [dogs, total] = await Promise.all([
      app.db.dog.findMany({
        where,
        take: q.take,
        skip: q.skip,
        orderBy: [{ callName: 'asc' }],
        include: {
          registrations: { where: { isPrimary: true }, take: 1 },
          media: { where: { isPrimary: true }, take: 1 },
          pedigreeStats: true,
          sire: { select: { id: true, callName: true, registeredName: true } },
          damRel: { select: { id: true, callName: true, registeredName: true } },
        },
      }),
      app.db.dog.count({ where }),
    ]);

    return { dogs, total, take: q.take, skip: q.skip };
  });

  // ── Read ────────────────────────────────────────────────────────────────
  app.get('/dogs/:idOrSlug', async (req) => {
    const { idOrSlug } = z.object({ idOrSlug: z.string() }).parse(req.params);
    const dog = await app.db.dog.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        registrations: { orderBy: { isPrimary: 'desc' } },
        media: { orderBy: { position: 'asc' } },
        kennel: { select: { id: true, slug: true, name: true, prefix: true, city: true, region: true } },
        ownerships: {
          where: { endedAt: null },
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        sire: { select: { id: true, slug: true, callName: true, registeredName: true } },
        damRel: { select: { id: true, slug: true, callName: true, registeredName: true } },
        pedigreeStats: true,
        supersededBy: { select: { id: true, slug: true, callName: true } },
      },
    });
    if (!dog) throw notFound('Dog not found');

    // Offspring: what this dog has actually produced. The seed of the
    // "produce record" that becomes the moat in Phase 8.
    const offspring = await app.db.dog.findMany({
      where: { OR: [{ sireId: dog.id }, { damId: dog.id }], supersededByDogId: null },
      select: {
        id: true, slug: true, callName: true, registeredName: true, sex: true,
        dateOfBirth: true, breed: true,
      },
      orderBy: { dateOfBirth: 'desc' },
      take: 100,
    });

    return { dog, offspring };
  });

  // ── Create ──────────────────────────────────────────────────────────────
  app.post('/dogs', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = dogInput.parse(req.body);

    if (body.kennelId) await app.requireKennelAccess(req, body.kennelId, 'HANDLER');

    const { registrations, sireId, damId, ...rest } = body;
    const base = slugify(body.registeredName || body.callName) || 'dog';
    let slug = base;
    if (await app.db.dog.findUnique({ where: { slug } })) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const dog = await app.db.dog.create({
      data: {
        ...rest,
        slug,
        sireId: sireId ?? null,
        damId: damId ?? null,
        registrations: registrations?.length
          ? { create: registrations.map((r, i) => ({ ...r, isPrimary: r.isPrimary ?? i === 0 })) }
          : undefined,
        ownerships: { create: { userId: user.id, reason: 'initial', sharePercent: 100 } },
      },
      include: { registrations: true },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'dog.create',
      entityType: 'Dog',
      entityId: dog.id,
      after: dog,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ dog });
  });

  // ── Update ──────────────────────────────────────────────────────────────
  app.patch('/dogs/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await assertCanEditDog(app, req, id);
    const body = dogInput.partial().parse(req.body);
    const { registrations, sireId, damId, ...rest } = body;

    const before = await app.db.dog.findUnique({ where: { id } });
    if (!before) throw notFound('Dog not found');

    // Parent changes get the cycle check before anything is written.
    for (const [field, value] of [
      ['sire', sireId],
      ['dam', damId],
    ] as const) {
      if (value && (await wouldCreateCycle(app.db, id, value))) {
        throw badRequest(
          `That ${field} is already a descendant of this dog. A dog cannot be its own ancestor.`,
        );
      }
    }

    const dog = await app.db.dog.update({
      where: { id },
      data: {
        ...rest,
        ...(sireId !== undefined ? { sireId } : {}),
        ...(damId !== undefined ? { damId } : {}),
      },
      include: { registrations: true },
    });

    if (registrations) {
      await app.db.registration.deleteMany({ where: { dogId: id } });
      for (const [i, r] of registrations.entries()) {
        await app.db.registration.create({
          data: { ...r, dogId: id, isPrimary: r.isPrimary ?? i === 0 },
        });
      }
    }

    // Any ancestry edit invalidates cached stats for this dog and everything
    // below it. Dropping the row is safer than recomputing inline.
    if (sireId !== undefined || damId !== undefined) {
      await app.db.dogPedigreeStats.deleteMany({ where: { dogId: id } });
    }

    await audit(app.db, {
      actor: { id: user.id },
      action: 'dog.update',
      entityType: 'Dog',
      entityId: id,
      before,
      after: dog,
      ipAddress: req.ip,
    });
    return { dog };
  });

  // ── Set parents ─────────────────────────────────────────────────────────
  app.put('/dogs/:id/parents', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await assertCanEditDog(app, req, id);
    const body = z
      .object({ sireId: z.string().nullable(), damId: z.string().nullable() })
      .parse(req.body);

    for (const [role, parentId, expectedSex] of [
      ['sire', body.sireId, 'MALE'],
      ['dam', body.damId, 'FEMALE'],
    ] as const) {
      if (!parentId) continue;
      const parent = await app.db.dog.findUnique({
        where: { id: parentId },
        select: { id: true, sex: true, callName: true },
      });
      if (!parent) throw notFound(`No dog found for the ${role}`);
      if (parent.sex !== expectedSex) {
        throw badRequest(`${parent.callName} is recorded as ${parent.sex.toLowerCase()} and cannot be the ${role}.`);
      }
      if (await wouldCreateCycle(app.db, id, parentId)) {
        throw badRequest(`${parent.callName} is already a descendant of this dog.`);
      }
    }

    const before = await app.db.dog.findUnique({
      where: { id },
      select: { sireId: true, damId: true },
    });
    const dog = await app.db.dog.update({
      where: { id },
      data: { sireId: body.sireId, damId: body.damId },
      include: {
        sire: { select: { id: true, callName: true, registeredName: true } },
        damRel: { select: { id: true, callName: true, registeredName: true } },
      },
    });

    await app.db.dogPedigreeStats.deleteMany({ where: { dogId: id } });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'dog.parents.set',
      entityType: 'Dog',
      entityId: id,
      before,
      after: { sireId: dog.sireId, damId: dog.damId },
      ipAddress: req.ip,
    });
    return { dog };
  });

  // ── Pedigree chart + COI ────────────────────────────────────────────────
  app.get('/dogs/:id/pedigree', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = z
      .object({ generations: z.coerce.number().min(1).max(10).default(5) })
      .parse(req.query);

    const dog = await app.db.dog.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, callName: true, registeredName: true },
    });
    if (!dog) throw notFound('Dog not found');

    const graph = await loadAncestryGraph(app.db, [dog.id], q.generations + 2);
    const coi = inbreedingCoefficient(graph, dog.id);
    const stats = completeness(graph, dog.id, q.generations);

    // Attribute the COI so the renderer can highlight the ancestors driving it.
    const node = graph.nodes.get(dog.id);
    const contributions =
      node?.sireId && node?.damId
        ? pathContributions(graph, node.sireId, node.damId, { maxGenerations: q.generations + 2 })
        : { contributions: [], total: 0, truncated: false };

    const chart = buildChart(graph, dog.id, {
      generations: q.generations,
      contributions: contributions.contributions,
    });

    // Refresh the cache on read. Cheap, and it keeps list views honest.
    await app.db.dogPedigreeStats
      .upsert({
        where: { dogId: dog.id },
        create: {
          dogId: dog.id,
          coi,
          generations: q.generations,
          generationEquivalent: stats.generationEquivalent,
          completenessRatio: stats.ratio,
          distinctAncestors: stats.distinctAncestors,
          knownSlots: stats.totalSlots,
          deepestGeneration: stats.deepestGeneration,
        },
        update: {
          coi,
          generations: q.generations,
          generationEquivalent: stats.generationEquivalent,
          completenessRatio: stats.ratio,
          distinctAncestors: stats.distinctAncestors,
          knownSlots: stats.totalSlots,
          deepestGeneration: stats.deepestGeneration,
          computedAt: new Date(),
        },
      })
      .catch(() => undefined);

    return {
      dog,
      chart,
      coi,
      completeness: stats,
      contributions: contributions.contributions,
      contributionsTruncated: contributions.truncated,
    };
  });

  // ── Trial pairing ───────────────────────────────────────────────────────
  app.get('/pairings/trial', async (req) => {
    const q = z
      .object({
        sireId: z.string(),
        damId: z.string(),
        generations: z.coerce.number().min(2).max(10).default(6),
      })
      .parse(req.query);

    const [sire, dam] = await Promise.all([
      app.db.dog.findUnique({
        where: { id: q.sireId },
        select: { id: true, slug: true, callName: true, registeredName: true, sex: true, breed: true },
      }),
      app.db.dog.findUnique({
        where: { id: q.damId },
        select: { id: true, slug: true, callName: true, registeredName: true, sex: true, breed: true },
      }),
    ]);
    if (!sire) throw notFound('Sire not found');
    if (!dam) throw notFound('Dam not found');
    if (sire.sex !== 'MALE') throw badRequest(`${sire.callName} is not recorded as male.`);
    if (dam.sex !== 'FEMALE') throw badRequest(`${dam.callName} is not recorded as female.`);

    const graph = await loadAncestryGraph(app.db, [sire.id, dam.id], q.generations + 2);
    const pairing = evaluatePairing(graph, sire.id, dam.id, { generations: q.generations });

    // Attach names so the client does not need a second round trip.
    const ancestorIds = pairing.contributions.map((c) => c.id);
    const ancestorRows = ancestorIds.length
      ? await app.db.dog.findMany({
          where: { id: { in: ancestorIds } },
          select: { id: true, slug: true, callName: true, registeredName: true, dateOfBirth: true },
        })
      : [];
    const byId = new Map(ancestorRows.map((a) => [a.id, a]));

    return {
      sire,
      dam,
      pairing: {
        ...pairing,
        contributions: pairing.contributions.map((c) => ({ ...c, dog: byId.get(c.id) ?? null })),
      },
      crossBreed: sire.breed !== dam.breed ? { sire: sire.breed, dam: dam.breed } : null,
    };
  });
}
