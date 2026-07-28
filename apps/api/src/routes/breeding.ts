import {
  forecastWhelp,
  gestationMilestones,
  interpretProgesterone,
  predictNextHeat,
} from '@stud/breeding';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

const METHODS = ['NATURAL', 'AI_FRESH', 'AI_CHILLED', 'AI_FROZEN', 'AI_SURGICAL', 'TCI'] as const;

/**
 * Heat cycles, progesterone timing, and breedings.
 *
 * The route layer's job here is thin: load the records, hand them to the pure
 * functions in @stud/breeding, and return the prediction alongside its
 * confidence and basis. It never computes a date itself.
 */
export default async function breedingRoutes(app: FastifyInstance) {
  // ── Heat cycles ─────────────────────────────────────────────────────────
  app.get('/dogs/:id/heats', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    if (!(await canEditDog(app.db, user.id, user.roles, id))) {
      throw forbidden('You do not have access to this dog');
    }

    const dog = await app.db.dog.findUnique({
      where: { id },
      select: { id: true, callName: true, sex: true },
    });
    if (!dog) throw notFound('Dog not found');

    const cycles = await app.db.heatCycle.findMany({
      where: { dogId: id },
      orderBy: { startedOn: 'desc' },
      include: {
        progesteroneTests: { orderBy: { takenOn: 'asc' } },
        observations: { orderBy: { observedOn: 'asc' } },
        breedings: { select: { id: true, status: true, method: true } },
      },
    });

    const now = new Date();
    const prediction = predictNextHeat(
      cycles.map((c) => ({ startedOn: c.startedOn, endedOn: c.endedOn })),
      now,
    );

    // Interpret the most recent cycle's progesterone series — that is the one
    // a breeder is acting on today.
    const current = cycles[0];
    const interpretation = current
      ? interpretProgesterone(
          current.progesteroneTests.map((t) => ({
            takenOn: t.takenOn,
            value: t.value,
            unit: t.unit,
          })),
          now,
        )
      : null;

    return { dog, cycles, prediction, interpretation };
  });

  app.post('/dogs/:id/heats', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    if (!(await canEditDog(app.db, user.id, user.roles, id))) {
      throw forbidden('You do not have access to this dog');
    }

    const dog = await app.db.dog.findUnique({ where: { id }, select: { sex: true, callName: true } });
    if (!dog) throw notFound('Dog not found');
    if (dog.sex !== 'FEMALE') {
      throw badRequest(`${dog.callName} is recorded as male and cannot have a heat cycle.`);
    }

    const body = z
      .object({
        startedOn: z.coerce.date(),
        endedOn: z.coerce.date().optional(),
        notes: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const cycle = await app.db.heatCycle.create({
      data: { dogId: id, startedOn: body.startedOn, endedOn: body.endedOn, notes: body.notes },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'heat.create',
      entityType: 'HeatCycle',
      entityId: cycle.id,
      after: cycle,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ cycle });
  });

  app.patch('/heats/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const cycle = await requireHeatAccess(app, req, id);
    const body = z
      .object({
        startedOn: z.coerce.date().optional(),
        endedOn: z.coerce.date().nullable().optional(),
        notes: z.string().max(4000).optional(),
      })
      .parse(req.body);
    return { cycle: await app.db.heatCycle.update({ where: { id: cycle.id }, data: body }) };
  });

  // ── Progesterone ────────────────────────────────────────────────────────
  app.post('/heats/:id/progesterone', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireHeatAccess(app, req, id);
    const body = z
      .object({
        takenOn: z.coerce.date(),
        value: z.number().min(0).max(200),
        unit: z.enum(['NG_ML', 'NMOL_L']).default('NG_ML'),
        lab: z.string().max(120).optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const test = await app.db.progesteroneTest.create({ data: { heatCycleId: id, ...body } });

    // Re-interpret the whole series so the client gets the new window straight
    // away — this is the number a breeder is refreshing the page for.
    const all = await app.db.progesteroneTest.findMany({
      where: { heatCycleId: id },
      orderBy: { takenOn: 'asc' },
    });
    const interpretation = interpretProgesterone(
      all.map((t) => ({ takenOn: t.takenOn, value: t.value, unit: t.unit })),
      new Date(),
    );

    return reply.code(201).send({ test, interpretation });
  });

  app.delete('/progesterone/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const test = await app.db.progesteroneTest.findUnique({
      where: { id },
      select: { heatCycleId: true },
    });
    if (!test) throw notFound('Test not found');
    await requireHeatAccess(app, req, test.heatCycleId);
    await app.db.progesteroneTest.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/heats/:id/observations', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireHeatAccess(app, req, id);
    const body = z
      .object({
        observedOn: z.coerce.date(),
        phase: z.string().max(40).optional(),
        dischargeColor: z.string().max(60).optional(),
        swelling: z.string().max(60).optional(),
        receptive: z.boolean().optional(),
        temperatureC: z.number().min(30).max(45).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const observation = await app.db.heatObservation.create({ data: { heatCycleId: id, ...body } });
    return reply.code(201).send({ observation });
  });

  // ── Breedings ───────────────────────────────────────────────────────────
  app.get('/breedings', async (req) => {
    const user = await app.requireUser(req);
    const q = z
      .object({
        kennelId: z.string().optional(),
        status: z.enum(['PLANNED', 'BRED', 'CONFIRMED_PREGNANT', 'CONFIRMED_EMPTY', 'WHELPED', 'ABANDONED']).optional(),
        take: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(req.query);

    const breedings = await app.db.breeding.findMany({
      where: {
        ...(q.kennelId ? { kennelId: q.kennelId } : {}),
        ...(q.status ? { status: q.status } : {}),
        OR: [
          { dam: { ownerships: { some: { userId: user.id, endedAt: null } } } },
          { dam: { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } } },
          { sire: { ownerships: { some: { userId: user.id, endedAt: null } } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: q.take,
      include: {
        sire: { select: { id: true, slug: true, callName: true, registeredName: true } },
        dam: { select: { id: true, slug: true, callName: true, registeredName: true } },
        events: { orderBy: { occurredOn: 'asc' } },
        litter: { select: { id: true, status: true, whelpedOn: true, liveBorn: true } },
      },
    });

    const now = new Date();
    return {
      breedings: breedings.map((b) => ({
        ...b,
        forecast: forecastWhelp(
          {
            ovulationDate: b.ovulationDate,
            lhSurgeDate: b.lhSurgeDate,
            breedingDates: b.events.map((e) => e.occurredOn),
          },
          now,
        ),
      })),
    };
  });

  app.get('/breedings/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);

    const breeding = await app.db.breeding.findUnique({
      where: { id },
      include: {
        sire: { select: { id: true, slug: true, callName: true, registeredName: true, breed: true } },
        dam: { select: { id: true, slug: true, callName: true, registeredName: true, breed: true } },
        events: { orderBy: { occurredOn: 'asc' } },
        heatCycle: { include: { progesteroneTests: { orderBy: { takenOn: 'asc' } } } },
        litter: { include: { puppies: { orderBy: { birthOrder: 'asc' } } } },
      },
    });
    if (!breeding) throw notFound('Breeding not found');
    if (!(await canEditDog(app.db, user.id, user.roles, breeding.damId))) {
      throw forbidden('You do not have access to this breeding');
    }

    const now = new Date();
    const forecast = forecastWhelp(
      {
        ovulationDate: breeding.ovulationDate,
        lhSurgeDate: breeding.lhSurgeDate,
        breedingDates: breeding.events.map((e) => e.occurredOn),
      },
      now,
    );

    // Milestones anchor on ovulation where we have it. A calendar built on a
    // breeding date can be five days out, and an ultrasound five days early
    // shows nothing.
    const anchor = breeding.ovulationDate ?? breeding.events[breeding.events.length - 1]?.occurredOn ?? null;
    const milestones = anchor ? gestationMilestones(anchor, now) : [];

    return { breeding, forecast, milestones, milestoneAnchor: breeding.ovulationDate ? 'OVULATION' : 'BREEDING_DATE' };
  });

  app.post('/breedings', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        sireId: z.string(),
        damId: z.string(),
        heatCycleId: z.string().optional(),
        kennelId: z.string().optional(),
        method: z.enum(METHODS),
        status: z.enum(['PLANNED', 'BRED']).default('PLANNED'),
        ovulationDate: z.coerce.date().optional(),
        lhSurgeDate: z.coerce.date().optional(),
        semenSource: z.string().max(200).optional(),
        notes: z.string().max(4000).optional(),
      })
      .parse(req.body);

    if (!(await canEditDog(app.db, user.id, user.roles, body.damId))) {
      throw forbidden('You need access to the dam to record a breeding');
    }

    const [sire, dam] = await Promise.all([
      app.db.dog.findUnique({ where: { id: body.sireId }, select: { sex: true, callName: true } }),
      app.db.dog.findUnique({ where: { id: body.damId }, select: { sex: true, callName: true } }),
    ]);
    if (!sire) throw notFound('Sire not found');
    if (!dam) throw notFound('Dam not found');
    if (sire.sex !== 'MALE') throw badRequest(`${sire.callName} is not recorded as male.`);
    if (dam.sex !== 'FEMALE') throw badRequest(`${dam.callName} is not recorded as female.`);
    if (body.sireId === body.damId) throw badRequest('A dog cannot be bred to itself.');

    const breeding = await app.db.breeding.create({ data: body });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'breeding.create',
      entityType: 'Breeding',
      entityId: breeding.id,
      after: breeding,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ breeding });
  });

  app.patch('/breedings/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const breeding = await requireBreedingAccess(app, req, id);
    const body = z
      .object({
        status: z.enum(['PLANNED', 'BRED', 'CONFIRMED_PREGNANT', 'CONFIRMED_EMPTY', 'WHELPED', 'ABANDONED']).optional(),
        method: z.enum(METHODS).optional(),
        ovulationDate: z.coerce.date().nullable().optional(),
        lhSurgeDate: z.coerce.date().nullable().optional(),
        ultrasoundOn: z.coerce.date().nullable().optional(),
        ultrasoundResult: z.string().max(200).optional(),
        xrayOn: z.coerce.date().nullable().optional(),
        xrayPuppyCount: z.number().int().min(0).max(30).nullable().optional(),
        collectionDate: z.coerce.date().nullable().optional(),
        semenSource: z.string().max(200).optional(),
        shippingProvider: z.string().max(120).optional(),
        shippingTracking: z.string().max(120).optional(),
        notes: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const updated = await app.db.breeding.update({ where: { id: breeding.id }, data: body });

    // Confirming a pregnancy creates the litter, so the whelping session and
    // the care schedule have somewhere to live before the puppies arrive.
    if (body.status === 'CONFIRMED_PREGNANT') {
      const existing = await app.db.litter.findUnique({ where: { breedingId: breeding.id } });
      if (!existing) {
        const forecast = forecastWhelp(
          {
            ovulationDate: updated.ovulationDate,
            lhSurgeDate: updated.lhSurgeDate,
            breedingDates: (
              await app.db.breedingEvent.findMany({
                where: { breedingId: breeding.id },
                select: { occurredOn: true },
              })
            ).map((e) => e.occurredOn),
          },
          new Date(),
        );
        await app.db.litter.create({
          data: {
            breedingId: breeding.id,
            kennelId: updated.kennelId,
            sireId: updated.sireId,
            damId: updated.damId,
            status: 'EXPECTED',
            expectedWhelpOn: forecast.dueOn,
          },
        });
      }
    }

    return { breeding: updated };
  });

  app.post('/breedings/:id/events', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const breeding = await requireBreedingAccess(app, req, id);
    const body = z
      .object({
        occurredOn: z.coerce.date(),
        method: z.enum(METHODS).optional(),
        tieMinutes: z.number().int().min(0).max(240).optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const event = await app.db.breedingEvent.create({
      data: { breedingId: id, ...body, method: body.method ?? breeding.method },
    });

    // A recorded tie moves a planned breeding to bred, without the breeder
    // having to remember to change a dropdown.
    if (breeding.status === 'PLANNED') {
      await app.db.breeding.update({ where: { id }, data: { status: 'BRED' } });
    }

    return reply.code(201).send({ event });
  });
}

// ── Access helpers ─────────────────────────────────────────────────────────

async function requireHeatAccess(app: FastifyInstance, req: Parameters<FastifyInstance['requireUser']>[0], heatId: string) {
  const user = await app.requireUser(req);
  const cycle = await app.db.heatCycle.findUnique({ where: { id: heatId }, select: { id: true, dogId: true } });
  if (!cycle) throw notFound('Heat cycle not found');
  if (!(await canEditDog(app.db, user.id, user.roles, cycle.dogId))) {
    throw forbidden('You do not have access to this dog');
  }
  return cycle;
}

async function requireBreedingAccess(
  app: FastifyInstance,
  req: Parameters<FastifyInstance['requireUser']>[0],
  breedingId: string,
) {
  const user = await app.requireUser(req);
  const breeding = await app.db.breeding.findUnique({ where: { id: breedingId } });
  if (!breeding) throw notFound('Breeding not found');
  if (!(await canEditDog(app.db, user.id, user.roles, breeding.damId))) {
    throw forbidden('You do not have access to this breeding');
  }
  return breeding;
}
