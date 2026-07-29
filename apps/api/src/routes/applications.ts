import {
  checkTransfer,
  draftFromTemplate,
  getClause,
  renderContract,
  type ClauseInstance,
  type HealthScheduleEntry,
} from '@stud/contracts';
import {
  assessDepositRefund,
  assessPickupReadiness,
  buildPickOrder,
  canAdvance,
  captureToEscrow,
  createProvider,
  refundFromEscrow,
  type ApplicationStage,
  type DepositRefundTerm,
  type LedgerEntry,
} from '@stud/payments';
import { transferPuppyToOwner } from '@stud/db/transfers';
import type { PrismaClient } from '@stud/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const provider = createProvider(env.PAYMENTS_PROVIDER);

const STAGES = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'WAITLISTED',
  'DEPOSIT_PAID',
  'MATCHED',
  'PAID_IN_FULL',
  'COMPLETED',
  'DECLINED',
  'WITHDRAWN',
] as const;

/**
 * The buyer pipeline: application → approval → deposit → balance → pickup.
 *
 * Three rules shape every route here.
 *
 *   1. **Money never moves before approval.** `canAdvance` owns the ordering
 *      and every stage change goes through it, so no route can forget.
 *   2. **Refunds read clause effects, never prose.** Same rule as Phase 5's
 *      escrow. With no signed contract, a deposit is fully refundable — the
 *      platform will not keep a buyer's money against terms nobody agreed to.
 *   3. **Every stage change is an append-only event.** A buyer declined after
 *      paying deserves a reconstructible history, and so does the breeder.
 */
export default async function applicationRoutes(app: FastifyInstance) {
  // ── Apply ───────────────────────────────────────────────────────────────
  app.post('/litters/public/:slug/applications', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const listing = await app.db.litterListing.findUnique({
      where: { slug },
      select: { id: true, publishedAt: true, availability: true },
    });
    if (!listing || !listing.publishedAt || listing.availability === 'NOT_LISTED') {
      throw notFound('Litter not found');
    }
    if (listing.availability === 'PAST') {
      throw badRequest('This litter has been placed. Ask the breeder about future litters instead.');
    }

    const body = z
      .object({
        name: z.string().min(1).max(160),
        email: z.string().email(),
        phone: z.string().max(40).optional(),
        city: z.string().max(120).optional(),
        region: z.string().max(80).optional(),
        intendedHome: z.string().max(120).optional(),
        homeType: z.string().max(80).optional(),
        hasFencedYard: z.boolean().optional(),
        hoursAloneDaily: z.number().int().min(0).max(24).optional(),
        hasChildren: z.boolean().optional(),
        childrenAges: z.string().max(120).optional(),
        hasOtherPets: z.boolean().optional(),
        otherPetsDetail: z.string().max(500).optional(),
        previousDogs: z.string().max(4000).optional(),
        vetName: z.string().max(200).optional(),
        vetPhone: z.string().max(40).optional(),
        activityPlans: z.string().max(4000).optional(),
        preferredSex: z.enum(['MALE', 'FEMALE', 'EITHER']).optional(),
        preferredColor: z.string().max(120).optional(),
        message: z.string().max(4000).optional(),
        /** Links this to the enquiry it grew out of. */
        inquiryId: z.string().optional(),
      })
      .parse(req.body);

    // One live application per person per litter. A second one is almost
    // always a buyer who thought the first did not send, and two half-answered
    // forms is worse for the breeder than one.
    const existing = await app.db.puppyApplication.findFirst({
      where: {
        litterListingId: listing.id,
        email: body.email,
        stage: { notIn: ['DECLINED', 'WITHDRAWN', 'COMPLETED'] },
      },
      select: { id: true, stage: true },
    });
    if (existing) {
      throw conflict(
        'You already have an application open on this litter. The breeder can see it — adding a second one will not move it along any faster.',
      );
    }

    const application = await app.db.$transaction(async (tx) => {
      const created = await tx.puppyApplication.create({
        data: {
          litterListingId: listing.id,
          applicantUserId: req.user?.id ?? null,
          inquiryId: body.inquiryId,
          ...body,
        },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: created.id,
          toStage: 'SUBMITTED',
          actorUserId: req.user?.id ?? null,
          note: 'Application submitted.',
        },
      });
      return created;
    });

    await recordFunnel(app.db, 'APPLICATION_SUBMITTED', listing.id);
    return reply.code(201).send({
      application: { id: application.id, stage: application.stage, submittedAt: application.submittedAt },
    });
  });

  // ── Breeder pipeline ────────────────────────────────────────────────────
  app.get('/applications', async (req) => {
    const user = await app.requireUser(req);
    const q = z
      .object({
        stage: z.enum(STAGES).optional(),
        litterId: z.string().optional(),
      })
      .parse(req.query);

    const applications = await app.db.puppyApplication.findMany({
      where: {
        ...(q.stage ? { stage: q.stage } : {}),
        litterListing: {
          ...(q.litterId ? { litterId: q.litterId } : {}),
          litter: { dam: damAccessFilter(user.id) },
        },
      },
      include: applicationInclude,
      orderBy: [{ stage: 'asc' }, { submittedAt: 'asc' }],
      take: 200,
    });

    // The pick order is computed per litter, not across the whole pipeline —
    // two litters running at once have two independent queues.
    const byListing = new Map<string, typeof applications>();
    for (const a of applications) {
      const list = byListing.get(a.litterListingId) ?? [];
      list.push(a);
      byListing.set(a.litterListingId, list);
    }
    const pickPositions = new Map<string, { position: number; isNext: boolean; reason: string }>();
    for (const list of byListing.values()) {
      for (const slot of buildPickOrder(list.map(toPickCandidate))) {
        pickPositions.set(slot.applicationId, {
          position: slot.position,
          isNext: slot.isNext,
          reason: slot.reason,
        });
      }
    }

    return {
      applications: applications.map((a) => ({ ...a, pick: pickPositions.get(a.id) ?? null })),
      counts: countByStage(applications),
    };
  });

  app.get('/applications/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { application, isBreeder } = await loadForViewer(app, req, id);

    const siblings = await app.db.puppyApplication.findMany({
      where: { litterListingId: application.litterListingId },
      select: {
        id: true,
        stage: true,
        manualPickPosition: true,
        depositPaidAt: true,
        submittedAt: true,
        matchedPuppyId: true,
      },
    });
    const order = buildPickOrder(siblings.map(toPickCandidate));
    const mine = order.find((s) => s.applicationId === id) ?? null;

    const readiness = await computeReadiness(app.db, application);

    return {
      application,
      /**
       * A buyer sees their own position and the size of the queue, and
       * nothing about who else is in it. Knowing you are third of five is the
       * information that stops the anxious emails; knowing who the other four
       * are is nobody's business.
       */
      pick: mine
        ? { position: mine.position, isNext: mine.isNext, reason: mine.reason, of: order.length }
        : null,
      readiness,
      isBreeder,
    };
  });

  // ── Stage changes ───────────────────────────────────────────────────────
  app.post('/applications/:id/stage', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        stage: z.enum(STAGES),
        note: z.string().max(4000).optional(),
        declineReason: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const { application, isBreeder, user } = await loadForViewer(app, req, id);

    // A buyer may withdraw. Everything else is the breeder's to decide.
    if (!isBreeder && body.stage !== 'WITHDRAWN') {
      throw forbidden('Only the breeder can move an application through the pipeline.');
    }

    const transition = canAdvance(application.stage as ApplicationStage, body.stage);
    if (!transition.allowed) throw badRequest(transition.reason);

    // Declining or withdrawing after a deposit has to say what happens to the
    // money, rather than leaving it sitting in escrow silently.
    let refund: ReturnType<typeof assessDepositRefund> | null = null;
    if ((body.stage === 'DECLINED' || body.stage === 'WITHDRAWN') && application.depositPaidAt) {
      refund = await refundDeposit(app, application, {
        breederWithdrew: body.stage === 'DECLINED',
        actorId: user.id,
      });
    }

    const updated = await app.db.$transaction(async (tx) => {
      const next = await tx.puppyApplication.update({
        where: { id },
        data: {
          stage: body.stage,
          ...(body.declineReason ? { declineReason: body.declineReason } : {}),
          ...(isBreeder ? { reviewedByUserId: user.id, reviewedAt: new Date() } : {}),
          ...(body.note ? { reviewNote: body.note } : {}),
        },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          fromStage: application.stage,
          toStage: body.stage,
          note: body.note ?? body.declineReason ?? null,
          actorUserId: user.id,
        },
      });
      // A puppy held by a withdrawn buyer goes back on the market.
      if (
        (body.stage === 'DECLINED' || body.stage === 'WITHDRAWN') &&
        application.matchedPuppyId
      ) {
        await tx.puppy.update({
          where: { id: application.matchedPuppyId },
          data: { status: 'AVAILABLE' },
        });
        await tx.puppyApplication.update({
          where: { id },
          data: { matchedPuppyId: null, matchedAt: null },
        });
      }
      return next;
    });

    if (application.matchedPuppyId) await refreshListing(app.db, application.litterListingId);

    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.stage',
      entityType: 'PuppyApplication',
      entityId: id,
      before: { stage: application.stage },
      after: { stage: body.stage },
      ipAddress: req.ip,
    });
    if (body.stage === 'APPROVED') {
      await recordFunnel(app.db, 'APPLICATION_APPROVED', application.litterListingId);
    }
    return { application: updated, refund };
  });

  /** Set or clear a hand-placed position in the pick order. */
  app.patch('/applications/:id/pick-position', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ position: z.number().int().min(1).max(999).nullable() }).parse(req.body);
    const { isBreeder, user } = await loadForViewer(app, req, id);
    if (!isBreeder) throw forbidden('Only the breeder can set the pick order.');

    const updated = await app.db.puppyApplication.update({
      where: { id },
      data: { manualPickPosition: body.position },
    });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.pick_position',
      entityType: 'PuppyApplication',
      entityId: id,
      after: { position: body.position },
      ipAddress: req.ip,
    });
    return { application: updated };
  });

  // ── Deposit ─────────────────────────────────────────────────────────────
  /**
   * Take the deposit.
   *
   * Refuses unless the application is APPROVED — the ordering invariant, and
   * the one somebody will try to route around.
   */
  app.post('/applications/:id/deposit', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { application, user } = await loadForViewer(app, req, id);

    const transition = canAdvance(application.stage as ApplicationStage, 'DEPOSIT_PAID');
    if (!transition.allowed) throw badRequest(transition.reason);

    const listing = application.litterListing;
    const depositCents = listing.depositCents;
    if (!depositCents || depositCents <= 0) {
      throw badRequest('This litter has no deposit set, so there is nothing to take.');
    }

    // Derived, so a retry after a timeout cannot take the money twice.
    const idempotencyKey = `application_${id}_deposit`;
    const charge = await provider.charge({
      idempotencyKey,
      amountCents: depositCents,
      currency: 'USD',
      payerId: application.applicantUserId ?? application.email,
      description: `Deposit — ${listing.headline ?? listing.slug}`,
      method: 'CARD',
    });
    if (charge.status === 'FAILED') {
      throw badRequest(charge.failureMessage ?? 'The payment was declined.');
    }

    const now = new Date();
    await app.db.$transaction(async (tx) => {
      const legs = captureToEscrow(
        {
          transactionId: `txn_${idempotencyKey}`,
          referenceType: 'PuppyApplication',
          referenceId: id,
          occurredAt: now,
          memo: 'Puppy deposit',
        },
        {
          payerId: application.applicantUserId ?? application.email,
          amountCents: depositCents,
          isDeposit: true,
        },
      );
      await writeLedger(tx as PrismaClient, legs);
      await tx.puppyApplication.update({
        where: { id },
        data: { stage: 'DEPOSIT_PAID', depositPaidAt: now },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          fromStage: application.stage,
          toStage: 'DEPOSIT_PAID',
          note: 'Deposit received.',
          automatic: true,
        },
      });
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.deposit',
      entityType: 'PuppyApplication',
      entityId: id,
      after: { amountCents: depositCents, provider: provider.id },
      ipAddress: req.ip,
    });
    await recordFunnel(app.db, 'DEPOSIT_PAID', application.litterListingId);
    return { charge, providerIsLive: provider.isLive, depositCents };
  });

  // ── Match a puppy ───────────────────────────────────────────────────────
  app.post('/applications/:id/match', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ puppyId: z.string() }).parse(req.body);
    const { application, isBreeder, user } = await loadForViewer(app, req, id);
    if (!isBreeder) throw forbidden('Only the breeder can match a puppy.');

    const transition = canAdvance(application.stage as ApplicationStage, 'MATCHED');
    if (!transition.allowed) throw badRequest(transition.reason);

    const puppy = await app.db.puppy.findUnique({
      where: { id: body.puppyId },
      include: { matchedApplication: { select: { id: true, name: true } } },
    });
    if (!puppy || puppy.litterId !== application.litterListing.litterId) {
      throw badRequest('That puppy is not in this litter.');
    }
    if (puppy.matchedApplication && puppy.matchedApplication.id !== id) {
      throw conflict(`${puppy.name ?? puppy.collarColor ?? 'That puppy'} is already matched to another buyer.`);
    }
    if (puppy.status === 'SOLD' || puppy.status === 'KEPT') {
      throw conflict(`That puppy is marked ${puppy.status.toLowerCase()}.`);
    }

    /**
     * Out-of-turn matching is allowed, but it is recorded.
     *
     * A breeder may have a good reason — the buyer ahead wanted a female and
     * this is the only male. Blocking it would be wrong. Doing it silently
     * would be worse, because the buyer who was skipped has a right to know
     * it happened.
     */
    const siblings = await app.db.puppyApplication.findMany({
      where: { litterListingId: application.litterListingId },
      select: {
        id: true, stage: true, manualPickPosition: true,
        depositPaidAt: true, submittedAt: true, matchedPuppyId: true,
      },
    });
    const order = buildPickOrder(siblings.map(toPickCandidate));
    const nextUp = order.find((s) => s.isNext);
    const outOfTurn = Boolean(nextUp && nextUp.applicationId !== id);

    await app.db.$transaction(async (tx) => {
      await tx.puppyApplication.update({
        where: { id },
        data: { stage: 'MATCHED', matchedPuppyId: body.puppyId, matchedAt: new Date() },
      });
      await tx.puppy.update({ where: { id: body.puppyId }, data: { status: 'RESERVED' } });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          fromStage: application.stage,
          toStage: 'MATCHED',
          actorUserId: user.id,
          note: outOfTurn
            ? `Matched to ${puppy.name ?? puppy.collarColor ?? 'a puppy'}, out of pick order.`
            : `Matched to ${puppy.name ?? puppy.collarColor ?? 'a puppy'}.`,
        },
      });
    });

    await refreshListing(app.db, application.litterListingId);
    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.match',
      entityType: 'PuppyApplication',
      entityId: id,
      after: { puppyId: body.puppyId, outOfTurn },
      ipAddress: req.ip,
    });
    return { matched: true, outOfTurn };
  });

  // ── Balance ─────────────────────────────────────────────────────────────
  app.post('/applications/:id/balance', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { application, user } = await loadForViewer(app, req, id);

    const transition = canAdvance(application.stage as ApplicationStage, 'PAID_IN_FULL');
    if (!transition.allowed) throw badRequest(transition.reason);
    if (!application.contractId) {
      throw badRequest('The sale contract has to be signed before the balance is taken.');
    }

    const contract = await app.db.contract.findUnique({
      where: { id: application.contractId },
      include: { schedule: { include: { instalments: true, escrow: true } } },
    });
    if (contract?.status !== 'SIGNED') {
      throw badRequest('The sale contract has not been signed by both parties.');
    }
    const balance = contract.schedule?.instalments.find((i) => i.key === 'balance');
    if (!balance) throw badRequest('This contract has no balance instalment.');
    if (balance.status === 'PAID') return { alreadyPaid: true, instalment: balance };

    /**
     * Reconcile the deposit instalment before charging the balance.
     *
     * The deposit arrived against the application, before this contract
     * existed. Leaving its instalment PENDING would leave the contract's own
     * schedule disagreeing with the ledger about money that is demonstrably in
     * escrow.
     */
    const depositInstalment = contract.schedule?.instalments.find((i) => i.key === 'deposit');
    if (depositInstalment && depositInstalment.status !== 'PAID' && application.depositPaidAt) {
      await app.db.instalment.update({
        where: { id: depositInstalment.id },
        data: { status: 'PAID', paidAt: application.depositPaidAt },
      });
    }

    const idempotencyKey = `application_${id}_balance`;
    const charge = await provider.charge({
      idempotencyKey,
      amountCents: balance.amountCents,
      currency: 'USD',
      payerId: application.applicantUserId ?? application.email,
      description: 'Puppy balance',
      method: 'CARD',
    });
    if (charge.status === 'FAILED') {
      throw badRequest(charge.failureMessage ?? 'The payment was declined.');
    }

    const now = new Date();
    await app.db.$transaction(async (tx) => {
      const legs = captureToEscrow(
        {
          transactionId: `txn_${idempotencyKey}`,
          referenceType: 'PuppyApplication',
          referenceId: id,
          occurredAt: now,
          memo: 'Puppy balance',
        },
        {
          payerId: application.applicantUserId ?? application.email,
          amountCents: balance.amountCents,
          isDeposit: false,
        },
      );
      await writeLedger(tx as PrismaClient, legs);
      await tx.instalment.update({
        where: { id: balance.id },
        data: { status: 'PAID', paidAt: now, providerChargeId: charge.providerId },
      });
      await tx.puppyApplication.update({ where: { id }, data: { stage: 'PAID_IN_FULL' } });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          fromStage: application.stage,
          toStage: 'PAID_IN_FULL',
          note: 'Balance received.',
          automatic: true,
        },
      });
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.balance',
      entityType: 'PuppyApplication',
      entityId: id,
      after: { amountCents: balance.amountCents },
      ipAddress: req.ip,
    });
    return { charge, providerIsLive: provider.isLive };
  });

  // ── The sale contract ───────────────────────────────────────────────────
  /**
   * Draw the PUPPY_SALE contract from the application.
   *
   * Every fact in it is read from the record — the puppy, both parents, the
   * price, the health schedule. The breeder edits terms, not data.
   */
  app.post('/applications/:id/contract', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { application, isBreeder, user } = await loadForViewer(app, req, id);
    if (!isBreeder) throw forbidden('Only the breeder can draw up the contract.');
    if (application.contractId) throw conflict('This application already has a contract.');
    if (!application.matchedPuppyId) {
      throw badRequest('Match a puppy first — the contract has to say which dog it is about.');
    }
    if (!application.applicantUserId) {
      throw badRequest(
        'The buyer needs a Stud account before a contract can be signed. A signature has to be tied to an authenticated identity rather than a typed name.',
      );
    }

    const body = z
      .object({
        priceCents: z.number().int().min(0).max(500_000_00),
        depositCents: z.number().int().min(0).max(500_000_00),
        values: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      })
      .parse(req.body);
    if (body.depositCents > body.priceCents) {
      throw badRequest('The deposit cannot exceed the purchase price.');
    }

    const puppy = await app.db.puppy.findUnique({
      where: { id: application.matchedPuppyId },
      include: {
        litter: {
          include: {
            sire: { select: { id: true, callName: true, registeredName: true } },
            dam: { select: { id: true, callName: true, registeredName: true, kennel: { select: { name: true } } } },
          },
        },
      },
    });
    if (!puppy) throw notFound('Matched puppy not found');

    const breeder = await app.db.user.findUnique({ where: { id: user.id } });
    const buyer = await app.db.user.findUnique({ where: { id: application.applicantUserId } });
    if (!buyer) throw notFound('Buyer account not found');

    const describe = [
      puppy.sex === 'MALE' ? 'a male' : 'a female',
      puppy.litter.dam.callName ? `${puppy.colorPattern ?? ''}`.trim() : '',
      'puppy',
      puppy.name ? `named ${puppy.name}` : puppy.collarColor ? `, ${puppy.collarColor.toLowerCase()} collar` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+,/g, ',')
      .replace(/\s+/g, ' ');

    const draft = draftFromTemplate('PUPPY_SALE', {
      'parties.puppy_sale': {
        agreementDate: new Date().toISOString().slice(0, 10),
        breederName: breeder?.name ?? breeder?.displayName ?? breeder?.email ?? 'Breeder',
        buyerName: buyer.name ?? buyer.displayName ?? buyer.email,
        puppyDescription: describe,
        dateOfBirth: (puppy.bornAt ?? puppy.litter.whelpedOn ?? new Date()).toISOString().slice(0, 10),
        damName: puppy.litter.dam.registeredName ?? puppy.litter.dam.callName,
        sireName: puppy.litter.sire.registeredName ?? puppy.litter.sire.callName,
      },
      'fee.purchase_price': {
        priceTotal: body.priceCents,
        depositAmount: body.depositCents,
        balanceAmount: body.priceCents - body.depositCents,
      },
      ...((body.values ?? {}) as Record<string, Record<string, string | number | boolean | null>>),
    });
    if (!draft) throw badRequest('Could not build the contract.');

    // The parents' health as it stands now, frozen with the document — the
    // same rule as the stud contract in Phase 5.
    const healthSchedule = await buildHealthSchedule(app.db, puppy.litter.sireId, puppy.litter.damId);

    const contract = await app.db.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          kind: 'PUPPY_SALE',
          title: `Puppy sale agreement — ${puppy.name ?? puppy.collarColor ?? 'puppy'} to ${buyer.name ?? buyer.email}`,
          sireId: puppy.litter.sireId,
          damId: puppy.litter.damId,
          litterId: puppy.litterId,
          clauses: draft.instances as never,
          healthSchedule: healthSchedule as never,
          createdByUserId: user.id,
          parties: {
            create: [
              {
                userId: user.id,
                role: 'SELLER',
                legalName: breeder?.name ?? breeder?.displayName ?? breeder?.email ?? 'Breeder',
                email: breeder?.email ?? '',
              },
              {
                userId: buyer.id,
                role: 'BUYER',
                legalName: buyer.name ?? buyer.displayName ?? buyer.email,
                email: buyer.email,
              },
            ],
          },
        },
      });
      await tx.puppyApplication.update({ where: { id }, data: { contractId: created.id } });
      return created;
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.contract.create',
      entityType: 'Contract',
      entityId: contract.id,
      ipAddress: req.ip,
    });
    return { contract, rendered: renderContract({ ...draft, healthSchedule }) };
  });

  // ── Pickup ──────────────────────────────────────────────────────────────
  app.post('/applications/:id/handover', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { application, isBreeder, user } = await loadForViewer(app, req, id);
    if (!isBreeder) throw forbidden('Only the breeder can record a handover.');
    if (!application.matchedPuppyId) throw badRequest('No puppy is matched to this application.');

    const transition = canAdvance(application.stage as ApplicationStage, 'COMPLETED');
    if (!transition.allowed) throw badRequest(transition.reason);

    const body = z
      .object({
        collectedOn: z.coerce.date(),
        collectedBy: z.string().max(200).optional(),
        microchipRegistered: z.boolean().default(false),
        registrationPapers: z.boolean().default(false),
        healthCertificate: z.boolean().default(false),
        vaccinationRecord: z.boolean().default(false),
        wormingRecord: z.boolean().default(false),
        microchipNumber: z.string().max(40).optional(),
        foodProvided: z.string().max(200).optional(),
        itemsProvided: z.string().max(2000).optional(),
        notes: z.string().max(4000).optional(),
        /** Set to override a blocker. Recorded, never silent. */
        overrideReason: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const readiness = await computeReadiness(app.db, application, body.collectedOn);
    if (!readiness.ready && !body.overrideReason) {
      throw badRequest('This puppy is not ready to go home.', { blockers: readiness.blockers });
    }

    // The vet-exam window from the health guarantee starts at collection.
    const examDays = examWindowDays(application.contractId ? await loadClauses(app.db, application.contractId) : []);

    const handover = await app.db.$transaction(async (tx) => {
      const created = await tx.puppyHandover.create({
        data: {
          applicationId: id,
          puppyId: application.matchedPuppyId!,
          collectedOn: body.collectedOn,
          collectedBy: body.collectedBy,
          microchipRegistered: body.microchipRegistered,
          registrationPapers: body.registrationPapers,
          healthCertificate: body.healthCertificate,
          vaccinationRecord: body.vaccinationRecord,
          wormingRecord: body.wormingRecord,
          microchipNumber: body.microchipNumber,
          foodProvided: body.foodProvided,
          itemsProvided: body.itemsProvided,
          notes: body.notes,
          vetExamDueBy: examDays
            ? new Date(body.collectedOn.getTime() + examDays * 86_400_000)
            : null,
        },
      });
      await tx.puppy.update({
        where: { id: application.matchedPuppyId! },
        data: {
          status: 'SOLD',
          ...(body.microchipNumber ? { microchip: body.microchipNumber } : {}),
        },
      });
      await tx.puppyApplication.update({ where: { id }, data: { stage: 'COMPLETED' } });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          fromStage: application.stage,
          toStage: 'COMPLETED',
          actorUserId: user.id,
          note: body.overrideReason
            ? `Collected. Handover recorded over ${readiness.blockers.length} blocker(s): ${body.overrideReason}`
            : 'Collected.',
        },
      });
      return created;
    });

    /**
     * The puppy becomes a dog, owned by the buyer.
     *
     * Done here rather than as a separate step a breeder has to remember,
     * because the phase gate is that the record is already complete when the
     * buyer opens it — not complete once somebody presses another button.
     *
     * Deliberately outside the transaction above: a failure to mint the dog
     * record must not roll back a handover that physically happened. It is
     * idempotent, so it can be retried.
     */
    let transfer: Awaited<ReturnType<typeof transferPuppyToOwner>> | null = null;
    try {
      transfer = await transferPuppyToOwner(app.db, {
        puppyId: application.matchedPuppyId!,
        ownerUserId: application.applicantUserId,
        reason: 'purchase',
      });
      await app.db.ownershipTransfer.create({
        data: {
          dogId: transfer.dogId,
          kind: 'PLACEMENT',
          status: 'ACCEPTED',
          fromUserId: user.id,
          toUserId: application.applicantUserId,
          toEmail: application.email,
          toName: application.name,
          applicationId: id,
          handoverId: handover.id,
          contractId: application.contractId,
          contractRequiresReturn: requiresReturn(
            application.contractId ? await loadClauses(app.db, application.contractId) : [],
          ),
          respondedAt: new Date(),
        },
      });
    } catch (err) {
      app.log.error({ err, applicationId: id }, 'handover recorded but the dog record was not created');
    }

    await refreshListing(app.db, application.litterListingId);
    await audit(app.db, {
      actor: { id: user.id },
      action: 'application.handover',
      entityType: 'PuppyHandover',
      entityId: handover.id,
      after: { overrode: Boolean(body.overrideReason), blockers: readiness.blockers },
      ipAddress: req.ip,
    });

    /**
     * Report the warnings as they stand AFTER the handover, not before it.
     *
     * The form itself supplies the microchip number and confirms the records
     * went with the dog, so returning the pre-handover assessment tells a
     * breeder there is no microchip on file moments after they typed one in.
     */
    await recordFunnel(app.db, 'PLACEMENT_COMPLETED', application.litterListingId);

    const remaining = readiness.warnings.filter((w) => {
      if (/microchip/i.test(w)) return !body.microchipNumber && !body.microchipRegistered;
      if (/vaccination/i.test(w)) return !body.vaccinationRecord;
      if (/veterinary examination/i.test(w)) return !body.healthCertificate;
      return true;
    });

    return { handover, readiness: { ...readiness, warnings: remaining }, transfer };
  });

  // ── The buyer's own view ────────────────────────────────────────────────
  app.get('/my/applications', async (req) => {
    const user = await app.requireUser(req);
    const applications = await app.db.puppyApplication.findMany({
      where: { OR: [{ applicantUserId: user.id }, { email: user.email }] },
      include: applicationInclude,
      orderBy: { submittedAt: 'desc' },
    });

    // Each buyer sees their own position and the size of the queue. Nothing
    // about who else is in it.
    const withPick = await Promise.all(
      applications.map(async (a) => {
        const siblings = await app.db.puppyApplication.findMany({
          where: { litterListingId: a.litterListingId },
          select: {
            id: true, stage: true, manualPickPosition: true,
            depositPaidAt: true, submittedAt: true, matchedPuppyId: true,
          },
        });
        const order = buildPickOrder(siblings.map(toPickCandidate));
        const mine = order.find((s) => s.applicationId === a.id);
        return {
          ...a,
          pick: mine ? { position: mine.position, isNext: mine.isNext, of: order.length } : null,
        };
      }),
    );
    return { applications: withPick };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const applicationInclude = {
  litterListing: {
    select: {
      id: true, slug: true, headline: true, litterId: true,
      priceCentsFrom: true, priceCentsTo: true, depositCents: true, goHomeFrom: true,
      litter: {
        select: {
          id: true, whelpedOn: true, letter: true,
          sire: { select: { slug: true, callName: true } },
          dam: { select: { slug: true, callName: true, kennelId: true } },
          puppies: {
            where: { isPublic: true },
            select: { id: true, name: true, collarColor: true, sex: true, status: true, colorPattern: true },
            orderBy: { birthOrder: 'asc' as const },
          },
        },
      },
    },
  },
  matchedPuppy: { select: { id: true, name: true, collarColor: true, sex: true, status: true, microchip: true } },
  contract: { select: { id: true, status: true, title: true, contentHash: true } },
  events: { orderBy: { occurredAt: 'desc' as const }, take: 50 },
  pickup: true,
};

function damAccessFilter(userId: string) {
  return {
    OR: [
      { ownerships: { some: { userId, endedAt: null } } },
      { kennel: { memberships: { some: { userId, acceptedAt: { not: null } } } } },
    ],
  };
}

type LoadedApplication = Awaited<ReturnType<typeof loadApplication>>;

async function loadApplication(db: PrismaClient, id: string) {
  return db.puppyApplication.findUnique({ where: { id }, include: applicationInclude });
}

/**
 * Load an application for whoever is asking.
 *
 * The breeder of the litter, or the buyer who submitted it. Nobody else — an
 * application contains a family's address, their vet and their children's ages.
 */
async function loadForViewer(app: FastifyInstance, req: FastifyRequest, id: string) {
  const user = await app.requireUser(req);
  const application = await loadApplication(app.db, id);
  if (!application) throw notFound('Application not found');

  const isBreeder = await canEditDog(
    app.db,
    user.id,
    user.roles,
    (await app.db.litter.findUnique({
      where: { id: application.litterListing.litterId },
      select: { damId: true },
    }))!.damId,
  );
  const isApplicant =
    application.applicantUserId === user.id || application.email === user.email;

  if (!isBreeder && !isApplicant) throw forbidden('You do not have access to this application.');
  return { application: application as NonNullable<LoadedApplication>, isBreeder, isApplicant, user };
}

function toPickCandidate(a: {
  id: string;
  stage: string;
  manualPickPosition: number | null;
  depositPaidAt: Date | null;
  submittedAt: Date;
  matchedPuppyId: string | null;
}) {
  return {
    applicationId: a.id,
    stage: a.stage as ApplicationStage,
    manualPosition: a.manualPickPosition,
    depositPaidAt: a.depositPaidAt,
    applicationSubmittedAt: a.submittedAt,
    matchedPuppyId: a.matchedPuppyId,
  };
}

function countByStage(applications: { stage: string }[]) {
  const counts: Record<string, number> = {};
  for (const s of STAGES) counts[s] = 0;
  for (const a of applications) counts[a.stage] = (counts[a.stage] ?? 0) + 1;
  return counts;
}

async function computeReadiness(
  db: PrismaClient,
  application: NonNullable<LoadedApplication>,
  pickupOn = new Date(),
) {
  const bornOn = application.litterListing.litter.whelpedOn;
  if (!bornOn || !application.matchedPuppyId) {
    return { ready: false, blockers: ['No puppy is matched to this application yet.'], warnings: [] };
  }

  const [puppy, contract, captured] = await Promise.all([
    db.puppy.findUnique({
      where: { id: application.matchedPuppyId },
      select: { microchip: true, litterId: true },
    }),
    application.contractId
      ? db.contract.findUnique({
          where: { id: application.contractId },
          include: { schedule: { include: { instalments: true } } },
        })
      : null,
    /**
     * What has actually arrived, from the ledger.
     *
     * Not from instalment rows. The deposit is taken against the APPLICATION
     * before any contract exists — that ordering is deliberate — so the
     * contract's own deposit instalment is still PENDING when the money is
     * long since in escrow. Summing instalment statuses would block a buyer at
     * the door for a deposit they paid weeks ago.
     *
     * Phase 5's rule, applied here: the ledger is the record.
     */
    db.ledgerEntry.aggregate({
      where: {
        referenceType: 'PuppyApplication',
        referenceId: application.id,
        accountKind: 'ESCROW',
      },
      _sum: { amountCents: true },
    }),
  ]);

  const price = contract?.schedule?.totalCents ?? 0;
  const capturedCents = captured._sum.amountCents ?? 0;
  const outstanding = Math.max(0, price - capturedCents);

  const careTasks = await db.careTask.findMany({
    where: { puppyId: application.matchedPuppyId, status: 'DONE' },
    select: { kind: true },
  });
  const done = new Set(careTasks.map((t) => t.kind));

  return assessPickupReadiness({
    bornOn,
    pickupOn,
    balanceOutstandingCents: outstanding,
    contractSigned: contract?.status === 'SIGNED',
    microchipped: Boolean(puppy?.microchip),
    vaccinationRecorded: done.has('VACCINATION'),
    vetCheckRecorded: done.has('VET_CHECK'),
  });
}

/** The health-guarantee exam window, in days, read from the clause. */
function examWindowDays(instances: ClauseInstance[]): number | null {
  const guarantee = instances.find((i) => i.clauseId === 'health.puppy_guarantee');
  if (!guarantee) return null;
  const raw = String(guarantee.values.initialExamWindow ?? '');
  const hours = /(\d+)\s*hour/i.exec(raw);
  if (hours) return Math.ceil(Number(hours[1]) / 24);
  const days = /(\d+)\s*day/i.exec(raw);
  if (days) return Number(days[1]);
  return null;
}

/** Does this contract oblige the dog to come back rather than be rehomed? */
function requiresReturn(instances: ClauseInstance[]): boolean {
  return checkTransfer({ instances, kind: 'REHOME' }).requiresReturnToBreeder;
}

async function loadClauses(db: PrismaClient, contractId: string): Promise<ClauseInstance[]> {
  const contract = await db.contract.findUnique({ where: { id: contractId }, select: { clauses: true } });
  return (contract?.clauses as unknown as ClauseInstance[]) ?? [];
}

/** The deposit term, from the clause EFFECT. Never from the prose. */
function depositTermOf(instances: ClauseInstance[]): DepositRefundTerm | null {
  for (const instance of instances) {
    const clause = getClause(instance.clauseId, instance.clauseVersion);
    if (!clause?.effects?.definesDepositRefund) continue;
    // The chosen option overrides the clause's default effect.
    const chosen = String(instance.values.depositTerms ?? '');
    if (chosen === 'NON_REFUNDABLE' || chosen === 'REFUNDABLE_UNTIL_PICK' || chosen === 'FULLY_REFUNDABLE') {
      return chosen;
    }
    return clause.effects.definesDepositRefund;
  }
  return null;
}

async function refundDeposit(
  app: FastifyInstance,
  application: NonNullable<LoadedApplication>,
  opts: { breederWithdrew: boolean; actorId: string },
) {
  const depositCents = application.litterListing.depositCents ?? 0;
  const instances = application.contractId ? await loadClauses(app.db, application.contractId) : [];

  const assessment = assessDepositRefund({
    depositCents,
    term: depositTermOf(instances),
    hasPicked: Boolean(application.matchedPuppyId),
    breederWithdrew: opts.breederWithdrew,
  });

  if (assessment.refundableCents > 0) {
    const now = new Date();
    const legs = refundFromEscrow(
      {
        transactionId: `txn_application_${application.id}_refund`,
        referenceType: 'PuppyApplication',
        referenceId: application.id,
        occurredAt: now,
        memo: assessment.reason,
      },
      {
        payerId: application.applicantUserId ?? application.email,
        amountCents: assessment.refundableCents,
      },
    );
    await writeLedger(app.db, legs);
    await provider.refund({
      idempotencyKey: `application_${application.id}_refund`,
      providerChargeId: `application_${application.id}_deposit`,
      amountCents: assessment.refundableCents,
      reason: assessment.reason,
    });
  }
  return assessment;
}

async function writeLedger(db: PrismaClient, legs: LedgerEntry[]) {
  await db.ledgerEntry.createMany({
    data: legs.map((l) => ({
      transactionId: l.transactionId,
      accountKind: l.account.kind,
      accountOwnerId: l.account.ownerId ?? null,
      amountCents: l.amountCents,
      reason: l.reason,
      referenceType: l.referenceType,
      referenceId: l.referenceId,
      memo: l.memo ?? null,
      reversesTransactionId: l.reversesTransactionId ?? null,
      occurredAt: l.occurredAt,
    })),
  });
}

/**
 * Record a server-side funnel step, with the verification tier frozen at this
 * moment. Server-side because these transitions happen here — a client beacon
 * for DEPOSIT_PAID would miss every deposit taken while a tab was closed.
 * Fire-and-forget: measurement must never fail a payment.
 */
async function recordFunnel(
  db: PrismaClient,
  step: 'APPLICATION_SUBMITTED' | 'APPLICATION_APPROVED' | 'DEPOSIT_PAID' | 'PLACEMENT_COMPLETED',
  litterListingId: string,
) {
  try {
    const listing = await db.litterListing.findUnique({
      where: { id: litterListingId },
      select: {
        cachedSireVerified: true,
        cachedDamVerified: true,
        cachedParentDensity: true,
        litter: { select: { kennelId: true } },
      },
    });
    await db.funnelEvent.create({
      data: {
        step,
        litterListingId,
        kennelId: listing?.litter.kennelId ?? null,
        verifiedParentClaims: (listing?.cachedSireVerified ?? 0) + (listing?.cachedDamVerified ?? 0),
        parentDensity: listing?.cachedParentDensity ?? 0,
      },
    });
  } catch {
    // Nothing. See above.
  }
}

async function refreshListing(db: PrismaClient, litterListingId: string) {
  const listing = await db.litterListing.findUnique({
    where: { id: litterListingId },
    select: { litterId: true },
  });
  if (!listing) return;
  const { refreshListingCache } = await import('@stud/db/listings');
  await refreshListingCache(db, listing.litterId);
}

async function buildHealthSchedule(
  db: PrismaClient,
  sireId: string,
  damId: string,
): Promise<HealthScheduleEntry[]> {
  const entries: HealthScheduleEntry[] = [];
  for (const [animal, dogId] of [['SIRE', sireId], ['DAM', damId]] as const) {
    const [verified, reported] = await Promise.all([
      db.verifiedClaim.findMany({
        where: { dogId, state: { in: ['VERIFIED', 'STALE'] } },
        select: { claimType: true, markerName: true, rawResult: true, source: true, testedAt: true },
      }),
      db.reportedClaim.findMany({
        where: { dogId },
        select: { claimType: true, markerName: true, statedResult: true, statedTestedAt: true },
      }),
    ]);
    for (const c of verified) {
      entries.push({
        animal,
        claimLabel: c.markerName || c.claimType,
        result: c.rawResult ?? '—',
        tier: 'VERIFIED',
        source: c.source,
        testedOn: c.testedAt?.toISOString().slice(0, 10) ?? null,
      });
    }
    for (const c of reported) {
      entries.push({
        animal,
        claimLabel: c.markerName || c.claimType,
        result: c.statedResult,
        tier: 'REPORTED',
        testedOn: c.statedTestedAt?.toISOString().slice(0, 10) ?? null,
      });
    }
  }
  return entries;
}
