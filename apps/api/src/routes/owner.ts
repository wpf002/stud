import {
  checkTransfer,
  deriveObligations,
  type ClauseInstance,
} from '@stud/contracts';
import { assessGrowth } from '@stud/breeding';
import { evaluatePairing } from '@stud/pedigree';
import { completeOwnershipTransfer } from '@stud/db/transfers';
import { loadAncestryGraph } from '@stud/db/pedigree-loader';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const EVENT_KINDS = [
  'VET_VISIT',
  'VACCINATION',
  'ILLNESS',
  'INJURY',
  'SURGERY',
  'MEDICATION',
  'ALTERATION',
  'WEIGHT',
  'DEATH',
  'OTHER',
] as const;

/**
 * The owner's side of a dog.
 *
 * ── The gate ──────────────────────────────────────────────────────────────
 * A buyer opens their dog's record on pickup day and it is already complete.
 * `GET /my/dogs/:slug` returns, in one request: the pedigree the breeder
 * built, both parents' verified health, the growth curve from the whelping
 * box, the microchip, the litter it came from, the contract, and every
 * obligation that contract created with real dates on it. The owner has typed
 * nothing.
 *
 * ── Invariant 5, on the owner's side ──────────────────────────────────────
 * Anything an owner logs is a report, not a verification. A `HealthEvent` is
 * their account of what happened; a `ReportedClaim` is their account of a test
 * result. Neither can ever become a verified claim without going through the
 * Phase 2 engine and being checked against the issuing source.
 */
export default async function ownerRoutes(app: FastifyInstance) {
  // ── The owner's dogs ────────────────────────────────────────────────────
  app.get('/my/dogs', async (req) => {
    const user = await app.requireUser(req);
    const dogs = await app.db.dog.findMany({
      where: { ownerships: { some: { userId: user.id, endedAt: null } }, supersededByDogId: null },
      select: {
        id: true, slug: true, callName: true, registeredName: true, breed: true, sex: true,
        dateOfBirth: true, colorPattern: true, microchip: true,
        verificationSummary: { select: { verifiedCount: true, reportedCount: true, density: true } },
        sire: { select: { slug: true, callName: true, registeredName: true } },
        damRel: { select: { slug: true, callName: true, registeredName: true } },
        puppyRecord: {
          select: {
            id: true,
            litter: {
              select: {
                id: true,
                letter: true,
                dam: { select: { kennel: { select: { slug: true, name: true } } } },
              },
            },
          },
        },
        healthEvents: { orderBy: { occurredOn: 'desc' }, take: 1 },
      },
      orderBy: { dateOfBirth: 'desc' },
    });
    return { dogs };
  });

  /**
   * One dog, everything about it.
   *
   * A single round trip on purpose. This is the page a new owner opens on the
   * drive home, on a phone, on a bad connection.
   */
  app.get('/my/dogs/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const { dog, user, isOwner } = await loadOwnedDog(app, req, slug);

    const [ancestry, application, careTasks] = await Promise.all([
      dog.sireId && dog.damId ? loadAncestryGraph(app.db, [dog.sireId, dog.damId], 6) : null,
      // The sale it came from, which carries the contract and the handover.
      dog.puppyRecord
        ? app.db.puppyApplication.findFirst({
            where: { matchedPuppyId: dog.puppyRecord.id },
            include: {
              contract: { include: { signatures: true, parties: true } },
              pickup: true,
              litterListing: {
                select: {
                  slug: true,
                  litter: { select: { dam: { select: { kennel: true } } } },
                },
              },
            },
          })
        : null,
      dog.puppyRecord
        ? app.db.careTask.findMany({
            where: { puppyId: dog.puppyRecord.id },
            orderBy: { dueOn: 'asc' },
          })
        : [],
    ]);

    const clauses = (application?.contract?.clauses as unknown as ClauseInstance[] | undefined) ?? [];
    const collectedOn = application?.pickup?.collectedOn ?? null;

    /**
     * The contract as a list of dated things, not a document.
     *
     * A puppy contract is read once and filed. Six months later nobody
     * remembers the spay deadline or that the vet-exam window was 72 hours.
     */
    const obligations =
      dog.dateOfBirth && clauses.length > 0
        ? deriveObligations({
            instances: clauses,
            dateOfBirth: dog.dateOfBirth,
            collectedOn,
            now: new Date(),
            alterationConfirmed: dog.healthEvents.some((e) => e.kind === 'ALTERATION'),
            vetExamRecorded: dog.healthEvents.some(
              (e) =>
                (e.kind === 'VET_VISIT' || e.kind === 'VACCINATION') &&
                collectedOn != null &&
                e.occurredOn.getTime() >= collectedOn.getTime(),
            ),
            registrationReceived: application?.pickup?.registrationPapers ?? false,
          })
        : [];

    // The COI the dog actually carries, computed rather than stored, so a
    // pedigree correction upstream moves it.
    const pedigree =
      ancestry && dog.sireId && dog.damId
        ? evaluatePairing(ancestry, dog.sireId, dog.damId, { generations: 6 })
        : null;

    // The growth curve from the whelping box, read through the puppy row
    // rather than copied — one source of truth for those eight weeks.
    const growth = dog.puppyRecord?.weights?.length
      ? assessGrowth(
          dog.puppyRecord.weights.map((w) => ({ recordedOn: w.recordedOn, grams: w.grams })),
          { bornOn: dog.dateOfBirth ?? new Date(), now: new Date() },
        )
      : null;

    return {
      dog,
      isOwner,
      breeder: application?.litterListing.litter.dam.kennel ?? null,
      litter: dog.puppyRecord?.litter ?? null,
      contract: application?.contract
        ? {
            id: application.contract.id,
            title: application.contract.title,
            status: application.contract.status,
            signedAt: application.contract.signedAt,
            contentHash: application.contract.contentHash,
            renderedText: application.contract.renderedText,
          }
        : null,
      handover: application?.pickup ?? null,
      obligations: obligations.map((o) => ({ ...o, dueOn: o.dueOn, expiresOn: o.expiresOn })),
      pedigree: pedigree
        ? {
            coi: pedigree.projectedCoi,
            band: pedigree.coiBand,
            confidence: pedigree.confidence,
            confidenceNote: pedigree.confidenceNote,
            generations: pedigree.generations,
          }
        : null,
      growth,
      /** Early care from the breeder's schedule — vaccinations, worming. */
      earlyCare: careTasks,
      // Whether a rehome would be against the contract. Read here so the
      // portal can say it at the moment somebody is deciding.
      transferRule: checkTransfer({ instances: clauses, kind: 'REHOME' }),
      user: { id: user.id },
    };
  });

  // ── Logging what happened ───────────────────────────────────────────────
  app.post('/my/dogs/:slug/events', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const { dog, user } = await loadOwnedDog(app, req, slug, { requireOwner: true });

    const body = z
      .object({
        kind: z.enum(EVENT_KINDS),
        occurredOn: z.coerce.date(),
        title: z.string().min(1).max(200),
        detail: z.string().max(4000).optional(),
        diagnosis: z.string().max(300).optional(),
        vetName: z.string().max(200).optional(),
        vetPhone: z.string().max(40).optional(),
        weightGrams: z.number().int().min(100).max(150_000).optional(),
        sharedWithBreeder: z.boolean().default(true),
        guaranteeRelevant: z.boolean().default(false),
      })
      .parse(req.body);

    if (body.occurredOn.getTime() > Date.now() + 86_400_000) {
      throw badRequest('That date is in the future. Log what happened, not what is planned.');
    }

    const event = await app.db.healthEvent.create({
      data: { dogId: dog.id, reportedByUserId: user.id, ...body },
    });
    return reply.code(201).send({ event });
  });

  app.delete('/my/dogs/:slug/events/:eventId', async (req) => {
    const { slug, eventId } = z.object({ slug: z.string(), eventId: z.string() }).parse(req.params);
    const { dog } = await loadOwnedDog(app, req, slug, { requireOwner: true });
    const event = await app.db.healthEvent.findUnique({ where: { id: eventId } });
    if (!event || event.dogId !== dog.id) throw notFound('Event not found');
    await app.db.healthEvent.delete({ where: { id: eventId } });
    return { deleted: true };
  });

  /**
   * An owner stating a test result.
   *
   * Goes in as a REPORTED claim and can never be anything else from here.
   * Turning it into a verified one requires the Phase 2 engine checking it
   * against the body that issued it — which is the entire product.
   */
  app.post('/my/dogs/:slug/reported-claims', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const { dog, user } = await loadOwnedDog(app, req, slug, { requireOwner: true });

    const body = z
      .object({
        claimType: z.string().min(1).max(60),
        markerName: z.string().max(120).default(''),
        category: z.enum(['HEALTH', 'GENETIC', 'TITLE', 'REGISTRATION', 'PERFORMANCE']),
        statedResult: z.string().min(1).max(300),
        statedTestedAt: z.coerce.date().optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const claim = await app.db.reportedClaim.upsert({
      where: {
        dogId_claimType_markerName: {
          dogId: dog.id,
          claimType: body.claimType,
          markerName: body.markerName,
        },
      },
      create: { dogId: dog.id, reportedByUserId: user.id, ...body },
      update: { ...body, reportedByUserId: user.id },
    });
    return reply.code(201).send({
      claim,
      note: 'Recorded as reported. It will show as unverified until we can check it against the body that issued it.',
    });
  });

  // ── Rehoming ────────────────────────────────────────────────────────────
  /**
   * Propose a transfer to a new owner.
   *
   * Stud does not block a transfer that the contract says should have gone
   * back to the breeder. It cannot enforce a private agreement, and refusing
   * would push the whole thing off-platform where nobody can see it. What it
   * does is say so at the moment of deciding, notify the breeder, and record
   * that both happened.
   */
  app.post('/my/dogs/:slug/transfers', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const { dog, user } = await loadOwnedDog(app, req, slug, { requireOwner: true });

    const body = z
      .object({
        kind: z.enum(['REHOME', 'RETURN_TO_BREEDER', 'CO_OWNERSHIP_CHANGE']),
        toEmail: z.string().email(),
        toName: z.string().max(160).optional(),
        reason: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const open = await app.db.ownershipTransfer.findFirst({
      where: { dogId: dog.id, status: 'PENDING' },
      select: { id: true, toEmail: true },
    });
    if (open) {
      throw conflict(`There is already a transfer of this dog waiting on ${open.toEmail}.`);
    }

    const application = dog.puppyRecord
      ? await app.db.puppyApplication.findFirst({
          where: { matchedPuppyId: dog.puppyRecord.id },
          select: { contractId: true },
        })
      : null;
    const clauses = application?.contractId
      ? (((
          await app.db.contract.findUnique({
            where: { id: application.contractId },
            select: { clauses: true },
          })
        )?.clauses as unknown as ClauseInstance[]) ?? [])
      : [];
    const rule = checkTransfer({ instances: clauses, kind: body.kind });

    const recipient = await app.db.user.findUnique({ where: { email: body.toEmail } });

    const transfer = await app.db.ownershipTransfer.create({
      data: {
        dogId: dog.id,
        kind: body.kind,
        fromUserId: user.id,
        toUserId: recipient?.id ?? null,
        toEmail: body.toEmail,
        toName: body.toName,
        reason: body.reason,
        contractId: application?.contractId ?? null,
        contractRequiresReturn: rule.requiresReturnToBreeder,
        // Notified now, not on acceptance. A breeder who finds out a week
        // after the dog left has lost the chance to take it back.
        breederNotifiedAt: rule.requiresReturnToBreeder ? new Date() : null,
      },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'dog.transfer.propose',
      entityType: 'OwnershipTransfer',
      entityId: transfer.id,
      after: { kind: body.kind, requiresReturn: rule.requiresReturnToBreeder },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ transfer, rule });
  });

  /** Transfers waiting on the signed-in user to accept. */
  app.get('/my/transfers', async (req) => {
    const user = await app.requireUser(req);
    const incoming = await app.db.ownershipTransfer.findMany({
      where: {
        status: 'PENDING',
        OR: [{ toUserId: user.id }, { toEmail: user.email }],
      },
      include: {
        dog: {
          select: {
            slug: true, callName: true, registeredName: true, breed: true, dateOfBirth: true,
          },
        },
        fromUser: { select: { displayName: true, name: true } },
      },
      orderBy: { proposedAt: 'desc' },
    });
    return { transfers: incoming };
  });

  app.post('/transfers/:id/respond', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ accept: z.boolean() }).parse(req.body);
    const user = await app.requireUser(req);

    const transfer = await app.db.ownershipTransfer.findUnique({ where: { id } });
    if (!transfer) throw notFound('Transfer not found');
    if (transfer.toUserId !== user.id && transfer.toEmail !== user.email) {
      throw forbidden('This transfer was not offered to you.');
    }
    if (transfer.status !== 'PENDING') {
      throw conflict(`This transfer has already been ${transfer.status.toLowerCase()}.`);
    }

    if (!body.accept) {
      const declined = await app.db.ownershipTransfer.update({
        where: { id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
      return { transfer: declined };
    }

    await completeOwnershipTransfer(app.db, {
      dogId: transfer.dogId,
      fromUserId: transfer.fromUserId,
      toUserId: user.id,
      reason: transfer.kind === 'RETURN_TO_BREEDER' ? 'return_to_breeder' : 'transfer',
    });

    const accepted = await app.db.ownershipTransfer.update({
      where: { id },
      data: { status: 'ACCEPTED', toUserId: user.id, respondedAt: new Date() },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'dog.transfer.accept',
      entityType: 'OwnershipTransfer',
      entityId: id,
      ipAddress: req.ip,
    });
    return { transfer: accepted };
  });

  // ── The breeder's side ──────────────────────────────────────────────────
  /**
   * What happened to the puppies.
   *
   * A breeding program only improves if what happened to the dogs comes back.
   * Owners share by default and can turn it off — this is their dog and their
   * vet bills — and what a breeder sees is only what was shared.
   */
  app.get('/kennels/:kennelId/placed-dogs', async (req) => {
    const { kennelId } = z.object({ kennelId: z.string() }).parse(req.params);
    const { user } = await app.requireKennelAccess(req, kennelId);

    const dogs = await app.db.dog.findMany({
      where: {
        puppyRecord: { litter: { OR: [{ kennelId }, { dam: { kennelId } }] } },
      },
      select: {
        id: true, slug: true, callName: true, breed: true, sex: true, dateOfBirth: true,
        ownerships: {
          where: { endedAt: null },
          select: { user: { select: { displayName: true, name: true, email: true } } },
        },
        healthEvents: {
          where: { sharedWithBreeder: true },
          orderBy: { occurredOn: 'desc' },
          take: 20,
        },
        puppyRecord: { select: { litter: { select: { id: true, letter: true } } } },
      },
      orderBy: { dateOfBirth: 'desc' },
    });

    const shared = dogs.flatMap((d) => d.healthEvents);
    return {
      dogs,
      summary: {
        placed: dogs.length,
        withSharedEvents: dogs.filter((d) => d.healthEvents.length > 0).length,
        guaranteeRelevant: shared.filter((e) => e.guaranteeRelevant).length,
      },
      viewerId: user.id,
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ownedDogInclude = {
  registrations: { orderBy: { isPrimary: 'desc' as const } },
  verifiedClaims: {
    where: { state: { in: ['VERIFIED', 'STALE', 'CONFLICTED'] as never } },
    orderBy: [{ category: 'asc' as const }, { claimType: 'asc' as const }],
  },
  reportedClaims: true,
  verificationSummary: true,
  healthEvents: { orderBy: { occurredOn: 'desc' as const } },
  sire: {
    select: {
      id: true, slug: true, callName: true, registeredName: true,
      verifiedClaims: {
        where: { state: { in: ['VERIFIED', 'STALE'] as never } },
        orderBy: [{ category: 'asc' as const }],
      },
      reportedClaims: true,
      verificationSummary: true,
    },
  },
  damRel: {
    select: {
      id: true, slug: true, callName: true, registeredName: true,
      verifiedClaims: {
        where: { state: { in: ['VERIFIED', 'STALE'] as never } },
        orderBy: [{ category: 'asc' as const }],
      },
      reportedClaims: true,
      verificationSummary: true,
    },
  },
  puppyRecord: {
    select: {
      id: true,
      collarColor: true,
      birthOrder: true,
      birthWeightGrams: true,
      weights: { orderBy: { recordedOn: 'asc' as const } },
      litter: {
        select: {
          id: true, letter: true, whelpedOn: true, liveBorn: true,
          dam: { select: { slug: true, callName: true, kennel: { select: { slug: true, name: true } } } },
          sire: { select: { slug: true, callName: true } },
        },
      },
    },
  },
  ownerships: {
    where: { endedAt: null },
    select: { userId: true, sharePercent: true, startedAt: true, reason: true },
  },
};

async function loadOwnedDog(
  app: FastifyInstance,
  req: FastifyRequest,
  slug: string,
  opts: { requireOwner?: boolean } = {},
) {
  const user = await app.requireUser(req);
  const dog = await app.db.dog.findUnique({ where: { slug }, include: ownedDogInclude });
  if (!dog) throw notFound('Dog not found');

  const isOwner = dog.ownerships.some((o) => o.userId === user.id);
  if (!isOwner) {
    // A breeder can read a dog they bred — the health guarantee and the
    // take-back both depend on it — but only an owner may write.
    const bred = dog.puppyRecord
      ? await app.db.litter.findFirst({
          where: {
            id: dog.puppyRecord.litter.id,
            dam: {
              OR: [
                { ownerships: { some: { userId: user.id, endedAt: null } } },
                { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } },
              ],
            },
          },
          select: { id: true },
        })
      : null;
    if (!bred || opts.requireOwner) {
      throw forbidden(
        opts.requireOwner
          ? 'Only the owner can add to this dog’s record.'
          : 'You do not have access to this dog.',
      );
    }
  }
  return { dog, user, isOwner };
}
