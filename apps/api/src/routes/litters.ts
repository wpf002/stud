import {
  assessGrowth,
  compareSiblings,
  generateCareSchedule,
  litterMilestones,
  referenceBand,
} from '@stud/breeding';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { refreshListingCache } from '@stud/db/listings';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

/**
 * Litters, puppies, weights and the care schedule.
 *
 * The whelping endpoints are written for one-handed use on a phone at 3am:
 * every write takes the smallest possible payload, nothing is required that
 * could be filled in later, and a puppy can be logged with nothing but a sex.
 */
export default async function litterRoutes(app: FastifyInstance) {
  // ── List ────────────────────────────────────────────────────────────────
  app.get('/litters', async (req) => {
    const user = await app.requireUser(req);
    const q = z
      .object({
        status: z.enum(['EXPECTED', 'WHELPING', 'ON_THE_GROUND', 'WEANED', 'PLACED', 'ARCHIVED']).optional(),
        take: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(req.query);

    const litters = await app.db.litter.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        OR: [
          { dam: { ownerships: { some: { userId: user.id, endedAt: null } } } },
          { dam: { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } } },
        ],
      },
      orderBy: [{ whelpedOn: 'desc' }, { expectedWhelpOn: 'asc' }],
      take: q.take,
      include: {
        sire: { select: { id: true, slug: true, callName: true, registeredName: true } },
        dam: { select: { id: true, slug: true, callName: true, registeredName: true } },
        puppies: { select: { id: true, sex: true, status: true } },
      },
    });

    const now = new Date();
    return {
      litters: litters.map((l) => ({
        ...l,
        milestones: l.whelpedOn ? litterMilestones(l.whelpedOn, now) : null,
      })),
    };
  });

  // ── Detail ──────────────────────────────────────────────────────────────
  app.get('/litters/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const litter = await requireLitterAccess(app, req, id);

    const full = await app.db.litter.findUnique({
      where: { id },
      include: {
        sire: {
          select: {
            id: true, slug: true, callName: true, registeredName: true, breed: true,
            // Phase 6: the listing panel says how many results will appear on
            // the public page, so the breeder sees what they get for free.
            verificationSummary: { select: { verifiedCount: true, density: true } },
          },
        },
        dam: {
          select: {
            id: true, slug: true, callName: true, registeredName: true, breed: true,
            verificationSummary: { select: { verifiedCount: true, density: true } },
          },
        },
        listing: true,
        breeding: { select: { id: true, method: true, ovulationDate: true, xrayPuppyCount: true } },
        puppies: {
          orderBy: [{ birthOrder: 'asc' }, { createdAt: 'asc' }],
          include: { weights: { orderBy: { recordedOn: 'asc' } } },
        },
        whelpingEvents: { orderBy: { occurredAt: 'desc' }, take: 100 },
        careTasks: { orderBy: { dueOn: 'asc' } },
      },
    });
    if (!full) throw notFound('Litter not found');

    const now = new Date();
    const bornOn = full.whelpedOn;

    // Growth is assessed per puppy against its own trajectory, then the litter
    // is compared against itself — same dam, same milk, same day, which is a
    // far better control than any generic curve.
    const growth = bornOn
      ? full.puppies.map((p) => ({
          puppyId: p.id,
          assessment: assessGrowth(
            p.weights.map((w) => ({ recordedOn: w.recordedOn, grams: w.grams })),
            { bornOn, now },
          ),
        }))
      : [];

    const siblings = compareSiblings(
      full.puppies.map((p) => ({
        puppyId: p.id,
        records: p.weights.map((w) => ({ recordedOn: w.recordedOn, grams: w.grams })),
      })),
    );

    // The reference band uses the litter's median birth weight so it is scaled
    // to these puppies rather than to a breed average.
    const birthWeights = full.puppies
      .map((p) => p.birthWeightGrams)
      .filter((g): g is number => g != null)
      .sort((a, b) => a - b);
    const medianBirthWeight = birthWeights.length
      ? birthWeights[Math.floor(birthWeights.length / 2)]!
      : null;

    return {
      litter: full,
      listing: full.listing,
      milestones: bornOn ? litterMilestones(bornOn, now) : null,
      growth,
      siblings,
      referenceBand: medianBirthWeight ? referenceBand(medianBirthWeight, 56) : [],
      medianBirthWeightGrams: medianBirthWeight,
      kennelId: litter.kennelId,
    };
  });

  app.post('/litters', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        breedingId: z.string().optional(),
        sireId: z.string(),
        damId: z.string(),
        kennelId: z.string().optional(),
        name: z.string().max(120).optional(),
        letter: z.string().max(4).optional(),
        expectedWhelpOn: z.coerce.date().optional(),
      })
      .parse(req.body);

    if (!(await canEditDog(app.db, user.id, user.roles, body.damId))) {
      throw forbidden('You need access to the dam to create a litter');
    }

    const litter = await app.db.litter.create({ data: body });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'litter.create',
      entityType: 'Litter',
      entityId: litter.id,
      after: litter,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ litter });
  });

  app.patch('/litters/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireLitterAccess(app, req, id);
    const body = z
      .object({
        name: z.string().max(120).optional(),
        letter: z.string().max(4).optional(),
        status: z.enum(['EXPECTED', 'WHELPING', 'ON_THE_GROUND', 'WEANED', 'PLACED', 'ARCHIVED']).optional(),
        expectedWhelpOn: z.coerce.date().nullable().optional(),
        whelpedOn: z.coerce.date().nullable().optional(),
        totalBorn: z.number().int().min(0).max(30).nullable().optional(),
        liveBorn: z.number().int().min(0).max(30).nullable().optional(),
        stillborn: z.number().int().min(0).max(30).nullable().optional(),
        whelpingNotes: z.string().max(8000).optional(),
        notes: z.string().max(8000).optional(),
      })
      .parse(req.body);

    const litter = await app.db.litter.update({ where: { id }, data: body });

    // Recording a whelp date generates the care schedule. Doing it here rather
    // than making the breeder press a button means the calendar exists before
    // anyone thinks to ask for it.
    if (body.whelpedOn) {
      await regenerateCareSchedule(app, id, body.whelpedOn);
      if (litter.status === 'EXPECTED' || litter.status === 'WHELPING') {
        await app.db.litter.update({ where: { id }, data: { status: 'ON_THE_GROUND' } });
      }
    }

    return { litter };
  });

  // ── Whelping session ────────────────────────────────────────────────────
  /**
   * Log a puppy as it arrives.
   *
   * Sex is the only required field. Everything else — weight, markings, collar
   * colour — can be filled in when there is a free hand.
   */
  app.post('/litters/:id/puppies', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireLitterAccess(app, req, id);
    const body = z
      .object({
        sex: z.enum(['MALE', 'FEMALE']),
        birthOrder: z.number().int().min(1).max(30).optional(),
        name: z.string().max(80).optional(),
        collarColor: z.string().max(40).optional(),
        birthWeightGrams: z.number().int().min(20).max(3000).optional(),
        colorPattern: z.string().max(120).optional(),
        markings: z.string().max(400).optional(),
        bornAt: z.coerce.date().optional(),
        status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD', 'KEPT', 'DECEASED', 'STILLBORN']).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const count = await app.db.puppy.count({ where: { litterId: id } });
    const bornAt = body.bornAt ?? new Date();

    const puppy = await app.db.puppy.create({
      data: {
        litterId: id,
        ...body,
        birthOrder: body.birthOrder ?? count + 1,
        bornAt,
      },
    });

    // The birth weight IS the first weight record. Storing it in both places
    // means the growth chart starts at birth without the breeder weighing twice.
    if (body.birthWeightGrams) {
      await app.db.puppyWeight.create({
        data: { puppyId: puppy.id, recordedOn: bornAt, grams: body.birthWeightGrams },
      });
    }

    await app.db.whelpingEvent.create({
      data: {
        litterId: id,
        kind: 'puppy_born',
        puppyId: puppy.id,
        occurredAt: bornAt,
        note: `#${puppy.birthOrder} · ${body.sex === 'MALE' ? 'male' : 'female'}${body.birthWeightGrams ? ` · ${body.birthWeightGrams} g` : ''}`,
      },
    });

    await refreshLitterCounts(app, id);
    return reply.code(201).send({ puppy });
  });

  app.patch('/puppies/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const puppy = await requirePuppyAccess(app, req, id);
    const body = z
      .object({
        name: z.string().max(80).optional(),
        collarColor: z.string().max(40).optional(),
        sex: z.enum(['MALE', 'FEMALE']).optional(),
        status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD', 'KEPT', 'DECEASED', 'STILLBORN']).optional(),
        colorPattern: z.string().max(120).optional(),
        markings: z.string().max(400).optional(),
        microchip: z.string().max(40).optional(),
        birthWeightGrams: z.number().int().min(20).max(3000).nullable().optional(),
        diedAt: z.coerce.date().nullable().optional(),
        causeOfDeath: z.string().max(400).optional(),
        notes: z.string().max(2000).optional(),
        // Phase 6: the public side of a puppy. `publicNotes` is deliberately
        // separate from `notes` — the latter is the breeder's own working
        // record and is never published.
        priceCents: z.number().int().min(0).max(500_000_00).nullable().optional(),
        publicNotes: z.string().max(2000).nullable().optional(),
        photoUrls: z.array(z.string().url()).max(12).optional(),
        isPublic: z.boolean().optional(),
      })
      .parse(req.body);

    const updated = await app.db.puppy.update({ where: { id }, data: body });
    if (body.status || body.diedAt !== undefined) await refreshLitterCounts(app, puppy.litterId);
    /**
     * Reserving a puppy has to move the marketplace immediately.
     *
     * The listing's availability counts drive the browse page, and a browse
     * page still advertising a puppy that sold last week is the fastest way to
     * lose a buyer's trust — and the breeder's.
     */
    if (body.status || body.isPublic !== undefined) {
      await refreshListingCache(app.db, puppy.litterId);
    }
    return { puppy: updated };
  });

  /** Weigh a puppy. The most-used write in the whole product. */
  app.post('/puppies/:id/weights', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const puppy = await requirePuppyAccess(app, req, id);
    const body = z
      .object({
        grams: z.number().int().min(20).max(5000),
        recordedOn: z.coerce.date().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    const weight = await app.db.puppyWeight.create({
      data: { puppyId: id, grams: body.grams, recordedOn: body.recordedOn ?? new Date(), notes: body.notes },
    });

    // Return the reassessment with the write. The breeder weighing at 3am
    // wants to know immediately whether this puppy is in trouble.
    const [weights, litter] = await Promise.all([
      app.db.puppyWeight.findMany({ where: { puppyId: id }, orderBy: { recordedOn: 'asc' } }),
      app.db.litter.findUnique({ where: { id: puppy.litterId }, select: { whelpedOn: true } }),
    ]);

    const assessment = litter?.whelpedOn
      ? assessGrowth(
          weights.map((w) => ({ recordedOn: w.recordedOn, grams: w.grams })),
          { bornOn: litter.whelpedOn, now: new Date() },
        )
      : null;

    return reply.code(201).send({ weight, assessment });
  });

  app.delete('/weights/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const weight = await app.db.puppyWeight.findUnique({ where: { id }, select: { puppyId: true } });
    if (!weight) throw notFound('Weight not found');
    await requirePuppyAccess(app, req, weight.puppyId);
    await app.db.puppyWeight.delete({ where: { id } });
    return { ok: true };
  });

  /** A free-text entry in the whelping log. */
  app.post('/litters/:id/whelping-events', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireLitterAccess(app, req, id);
    const body = z
      .object({
        kind: z.enum(['contraction', 'puppy_born', 'placenta', 'rest', 'vet_called', 'note']),
        note: z.string().max(2000).optional(),
        occurredAt: z.coerce.date().optional(),
      })
      .parse(req.body);

    const event = await app.db.whelpingEvent.create({
      data: { litterId: id, kind: body.kind, note: body.note, occurredAt: body.occurredAt ?? new Date() },
    });
    return reply.code(201).send({ event });
  });

  // ── Care schedule ───────────────────────────────────────────────────────
  app.post('/litters/:id/care-schedule', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const litter = await requireLitterAccess(app, req, id);
    if (!litter.whelpedOn) {
      throw badRequest('Record the whelp date first — the whole schedule hangs off it.');
    }
    const created = await regenerateCareSchedule(app, id, litter.whelpedOn);
    return { generated: created };
  });

  app.patch('/care-tasks/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const task = await app.db.careTask.findUnique({ where: { id }, select: { id: true, litterId: true } });
    if (!task) throw notFound('Task not found');
    if (task.litterId) await requireLitterAccess(app, req, task.litterId);

    const body = z
      .object({
        status: z.enum(['PENDING', 'DONE', 'SKIPPED']).optional(),
        completedOn: z.coerce.date().nullable().optional(),
        productUsed: z.string().max(200).optional(),
        dose: z.string().max(100).optional(),
        administeredBy: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        dueOn: z.coerce.date().optional(),
      })
      .parse(req.body);

    const updated = await app.db.careTask.update({
      where: { id },
      data: {
        ...body,
        // Marking done without a date means "now" — one tap, not two.
        ...(body.status === 'DONE' && body.completedOn === undefined
          ? { completedOn: new Date(), completedByUserId: user.id }
          : {}),
      },
    });
    return { task: updated };
  });

  /** Everything due across the whole program. Drives the dashboard. */
  app.get('/care-tasks/due', async (req) => {
    const user = await app.requireUser(req);
    const q = z.object({ withinDays: z.coerce.number().min(1).max(90).default(14) }).parse(req.query);
    const horizon = new Date(Date.now() + q.withinDays * 86_400_000);

    const tasks = await app.db.careTask.findMany({
      where: {
        status: 'PENDING',
        dueOn: { lte: horizon },
        OR: [
          { litter: { dam: { ownerships: { some: { userId: user.id, endedAt: null } } } } },
          { litter: { dam: { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } } } },
          { dog: { ownerships: { some: { userId: user.id, endedAt: null } } } },
        ],
      },
      orderBy: { dueOn: 'asc' },
      take: 100,
      include: {
        litter: { select: { id: true, name: true, letter: true, dam: { select: { callName: true } } } },
        puppy: { select: { id: true, name: true, collarColor: true } },
        dog: { select: { id: true, slug: true, callName: true } },
      },
    });
    return { tasks };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Regenerate the care schedule from the protocol.
 *
 * Idempotent via `dedupeKey`, so a regenerate updates the dates of existing
 * tasks rather than duplicating them — a breeder who corrects a whelp date by
 * a day must not end up with two of every vaccination.
 *
 * Completed tasks keep their completion; only the due date and copy refresh.
 */
async function regenerateCareSchedule(app: FastifyInstance, litterId: string, whelpedOn: Date) {
  const tasks = generateCareSchedule(whelpedOn, new Date());
  // The daily weighing task is a habit, not a checklist item — generating
  // fifteen rows for it would bury everything else.
  const persistable = tasks.filter((t) => t.kind !== 'WEIGHING');

  let count = 0;
  for (const t of persistable) {
    await app.db.careTask.upsert({
      where: { dedupeKey: `litter:${litterId}:${t.key}` },
      create: {
        litterId,
        kind: t.kind,
        title: t.title,
        detail: t.detail,
        dueOn: t.dueOn,
        required: t.required,
        generatedKey: t.key,
        dedupeKey: `litter:${litterId}:${t.key}`,
      },
      update: { dueOn: t.dueOn, detail: t.detail, required: t.required },
    });
    count++;
  }
  return count;
}

/** Keep the litter's headline counts in step with its puppies. */
async function refreshLitterCounts(app: FastifyInstance, litterId: string) {
  const puppies = await app.db.puppy.findMany({
    where: { litterId },
    select: { status: true, diedAt: true },
  });
  const stillborn = puppies.filter((p) => p.status === 'STILLBORN').length;
  const deaths = puppies.filter((p) => p.status === 'DECEASED').length;
  await app.db.litter.update({
    where: { id: litterId },
    data: {
      totalBorn: puppies.length,
      liveBorn: puppies.length - stillborn,
      stillborn,
      neonatalDeaths: deaths,
    },
  });
}

async function requireLitterAccess(app: FastifyInstance, req: FastifyRequest, litterId: string) {
  const user = await app.requireUser(req);
  const litter = await app.db.litter.findUnique({ where: { id: litterId } });
  if (!litter) throw notFound('Litter not found');
  if (!(await canEditDog(app.db, user.id, user.roles, litter.damId))) {
    throw forbidden('You do not have access to this litter');
  }
  return litter;
}

async function requirePuppyAccess(app: FastifyInstance, req: FastifyRequest, puppyId: string) {
  const puppy = await app.db.puppy.findUnique({ where: { id: puppyId }, select: { id: true, litterId: true } });
  if (!puppy) throw notFound('Puppy not found');
  await requireLitterAccess(app, req, puppy.litterId);
  return puppy;
}
