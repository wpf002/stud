import {
  CLAUSES,
  CONSENT_TEXT_V1,
  SignatureError,
  TEMPLATES,
  type ClauseInstance,
  type ContractDraft,
  type HealthScheduleEntry,
  createSignature,
  draftFromTemplate,
  getClause,
  isEditable,
  renderContract,
  statusFromSignatures,
  validateDraft,
  verifyIntegrity,
} from '@stud/contracts';
import {
  assessEscrow,
  buildSchedule,
  captureToEscrow,
  createProvider,
  platformFee,
  refundFromEscrow,
  releaseFromEscrow,
  type LedgerEntry,
} from '@stud/payments';
import type { ContractStatus as DbContractStatus, PrismaClient } from '@stud/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const provider = createProvider(env.PAYMENTS_PROVIDER);

/**
 * Contracts, signatures, escrow and repeat-breeding claims.
 *
 * Two rules shape every route here:
 *
 *   1. **A signed contract is frozen.** Clause edits are refused once anyone
 *      has signed; an amendment is a new contract that supersedes the old one.
 *   2. **Money decisions read clause EFFECTS, never prose.** The refund
 *      position comes from `effects.definesNoLitterRemedy`, and when the
 *      contract is silent the platform refuses to decide.
 */
export default async function contractRoutes(app: FastifyInstance) {
  // ── Reference data ──────────────────────────────────────────────────────
  app.get('/contracts/templates', async () => ({
    templates: TEMPLATES,
    clauses: CLAUSES,
    consentText: CONSENT_TEXT_V1,
    // Stated at the API boundary too, so no client can omit it.
    disclaimer:
      'These templates are drafting starting points, not legal advice. Breeding contracts are governed by state law that varies considerably. Have a lawyer in your jurisdiction review anything you intend to rely on.',
    payments: {
      provider: provider.id,
      isLive: provider.isLive,
      note: provider.isLive
        ? null
        : 'Payments are modelled but no money moves. Live animal sales require written processor approval for this vertical — see docs/payments-diligence.md.',
    },
  }));

  // ── List and read ───────────────────────────────────────────────────────
  app.get('/contracts', async (req) => {
    const user = await app.requireUser(req);
    const q = z
      .object({
        status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'VOIDED', 'COMPLETED']).optional(),
      })
      .parse(req.query);

    const contracts = await app.db.contract.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        parties: { some: { userId: user.id } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        parties: { include: { user: { select: { id: true, displayName: true } } } },
        signatures: { select: { userId: true, signedAt: true } },
        sire: { select: { id: true, slug: true, callName: true } },
        dam: { select: { id: true, slug: true, callName: true } },
        schedule: { include: { instalments: true, escrow: true } },
      },
    });
    return { contracts };
  });

  app.get('/contracts/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);

    const draft = toDraft(contract);
    const rendered = renderContract(draft);
    const issues = validateDraft(draft);

    // If the contract is already frozen, the stored text is the truth — the
    // re-render is only for comparison.
    const frozen = Boolean(contract.contentHash);
    const tampered = frozen && !verifyIntegrity(contract.contentHash!, rendered);

    const mySignature = contract.signatures.find((s) => s.userId === user.id) ?? null;
    const myParty = contract.parties.find((p) => p.userId === user.id) ?? null;

    return {
      contract,
      rendered: frozen ? { ...rendered, plainText: contract.renderedText ?? rendered.plainText, contentHash: contract.contentHash! } : rendered,
      issues,
      editable: isEditable(contract.status),
      canSign: Boolean(myParty?.mustSign) && !mySignature && contract.status !== 'DRAFT' && contract.status !== 'VOIDED',
      mySignature,
      consentText: CONSENT_TEXT_V1,
      /**
       * True when the stored text no longer matches the clauses. Should be
       * impossible — clauses are frozen at send — so it is surfaced loudly
       * rather than reconciled quietly.
       */
      integrityWarning: tampered,
    };
  });

  // ── Create ──────────────────────────────────────────────────────────────
  app.post('/contracts', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        templateId: z.enum(['STUD_SERVICE', 'STUD_SERVICE_PICK_OF_LITTER', 'CO_OWNERSHIP', 'REPEAT_BREEDING_ONLY']),
        title: z.string().max(200).optional(),
        kennelId: z.string().optional(),
        breedingId: z.string().optional(),
        sireId: z.string().optional(),
        damId: z.string().optional(),
        /** The other party. They must already have an account. */
        counterpartyEmail: z.string().email(),
        myRole: z.enum(['STUD_OWNER', 'BITCH_OWNER', 'CO_OWNER']),
        values: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      })
      .parse(req.body);

    const counterparty = await app.db.user.findUnique({ where: { email: body.counterpartyEmail } });
    if (!counterparty) {
      throw notFound(
        'No Stud account for that email yet. Both parties need an account so a signature is tied to an authenticated identity rather than a typed name.',
      );
    }
    if (counterparty.id === user.id) throw badRequest('A contract needs two different parties.');

    const draft = draftFromTemplate(
      body.templateId,
      (body.values ?? {}) as Record<string, Record<string, string | number | boolean | null>>,
    );
    if (!draft) throw badRequest('Unknown template.');

    // Attach the health schedule as it stands NOW, so a later verification
    // change cannot rewrite what the parties saw when they signed.
    const healthSchedule = await buildHealthSchedule(app.db, body.sireId, body.damId);

    const counterRole = body.myRole === 'STUD_OWNER' ? 'BITCH_OWNER' : body.myRole === 'BITCH_OWNER' ? 'STUD_OWNER' : 'CO_OWNER';

    const contract = await app.db.contract.create({
      data: {
        kind: body.templateId,
        title: body.title ?? draft.title,
        kennelId: body.kennelId,
        breedingId: body.breedingId,
        sireId: body.sireId,
        damId: body.damId,
        clauses: draft.instances as never,
        healthSchedule: healthSchedule as never,
        createdByUserId: user.id,
        parties: {
          create: [
            {
              userId: user.id,
              role: body.myRole,
              legalName: user.name ?? user.displayName ?? user.email,
              email: user.email,
            },
            {
              userId: counterparty.id,
              role: counterRole,
              legalName: counterparty.name ?? counterparty.displayName ?? counterparty.email,
              email: counterparty.email,
            },
          ],
        },
      },
      include: { parties: true },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.create',
      entityType: 'Contract',
      entityId: contract.id,
      after: { kind: contract.kind, counterparty: counterparty.email },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ contract });
  });

  // ── Edit clauses ────────────────────────────────────────────────────────
  app.patch('/contracts/:id/clauses', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);

    // The freeze. Once anyone has signed, the document is what they signed.
    if (!isEditable(contract.status)) {
      throw conflict(
        'This contract has been signed and can no longer be edited. Create an amendment that supersedes it instead — a signature has to stay attached to the exact text that was agreed.',
      );
    }

    const body = z
      .object({
        title: z.string().max(200).optional(),
        clauses: z.array(
          z.object({
            clauseId: z.string(),
            clauseVersion: z.number().int(),
            order: z.number().int(),
            values: z.record(z.string(), z.unknown()),
          }),
        ),
      })
      .parse(req.body);

    const draft: ContractDraft = {
      title: body.title ?? contract.title,
      instances: body.clauses as ClauseInstance[],
      healthSchedule: (contract.healthSchedule as HealthScheduleEntry[] | null) ?? [],
    };
    const issues = validateDraft(draft);

    const updated = await app.db.contract.update({
      where: { id },
      data: { title: draft.title, clauses: draft.instances as never },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.clauses.update',
      entityType: 'Contract',
      entityId: id,
      ipAddress: req.ip,
    });
    return { contract: updated, issues, rendered: renderContract(draft) };
  });

  // ── Send ────────────────────────────────────────────────────────────────
  /**
   * Freeze and send.
   *
   * This is where the document becomes an artefact: rendered to text, hashed,
   * and stored. Everything after this binds to that hash.
   */
  app.post('/contracts/:id/send', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);
    if (!isEditable(contract.status)) throw conflict('This contract has already been sent and signed.');

    const draft = toDraft(contract);
    const issues = validateDraft(draft);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw badRequest('This contract is not complete enough to send.', { issues: errors });
    }

    const rendered = renderContract(draft);
    const scheduleTerms = extractScheduleTerms(draft);

    const updated = await app.db.$transaction(async (tx) => {
      const c = await tx.contract.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          renderedText: rendered.plainText,
          contentHash: rendered.contentHash,
        },
      });

      // Build the payment schedule from the clause EFFECTS, not the prose.
      if (scheduleTerms) {
        const schedule = buildSchedule({
          totalCents: scheduleTerms.totalCents,
          depositCents: scheduleTerms.depositCents,
          balanceTrigger: scheduleTerms.balanceTrigger,
        });
        const parties = await tx.contractParty.findMany({ where: { contractId: id } });
        const studOwner = parties.find((p) => p.role === 'STUD_OWNER');
        const bitchOwner = parties.find((p) => p.role === 'BITCH_OWNER');

        const created = await tx.paymentSchedule.upsert({
          where: { contractId: id },
          create: {
            contractId: id,
            totalCents: schedule.totalCents,
            depositCents: scheduleTerms.depositCents,
            balanceTrigger: scheduleTerms.balanceTrigger,
            noLitterRemedy: scheduleTerms.noLitterRemedy,
            instalments: {
              create: schedule.instalments.map((i) => ({
                key: i.key,
                label: i.label,
                amountCents: i.amountCents,
                trigger: i.trigger,
              })),
            },
          },
          update: {
            totalCents: schedule.totalCents,
            depositCents: scheduleTerms.depositCents,
            balanceTrigger: scheduleTerms.balanceTrigger,
            noLitterRemedy: scheduleTerms.noLitterRemedy,
          },
        });

        await tx.escrowHold.upsert({
          where: { scheduleId: created.id },
          create: {
            scheduleId: created.id,
            payeeUserId: studOwner?.userId ?? null,
            payerUserId: bitchOwner?.userId ?? null,
          },
          update: {},
        });
      }

      return c;
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.send',
      entityType: 'Contract',
      entityId: id,
      after: { contentHash: rendered.contentHash },
      ipAddress: req.ip,
    });
    return { contract: updated, contentHash: rendered.contentHash };
  });

  // ── Sign ────────────────────────────────────────────────────────────────
  app.post('/contracts/:id/sign', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user, party } = await requireParty(app, req, id);

    if (!contract.contentHash) throw badRequest('This contract has not been sent yet.');
    if (contract.status === 'VOIDED') throw conflict('This contract has been voided.');
    if (!party.mustSign) throw forbidden('You are not a signing party on this contract.');

    const body = z
      .object({
        typedName: z.string().min(1).max(200),
        affirmed: z.boolean(),
        /** Hash the signer was shown. A mismatch means it changed under them. */
        hashShownToSigner: z.string().optional(),
      })
      .parse(req.body);

    const already = contract.signatures.some((s) => s.userId === user.id);

    let record;
    try {
      record = createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: body.typedName, affirmed: body.affirmed },
        context: {
          userId: user.id,
          legalName: party.legalName,
          email: party.email,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          signedAt: new Date(),
        },
        documentHash: contract.contentHash,
        hashShownToSigner: body.hashShownToSigner,
        alreadySigned: already,
      });
    } catch (err) {
      if (err instanceof SignatureError) throw badRequest(err.message, { code: err.code });
      throw err;
    }

    const result = await app.db.$transaction(async (tx) => {
      await tx.contractSignature.create({
        data: {
          contractId: id,
          userId: record.userId,
          legalName: record.legalName,
          email: record.email,
          typedName: record.typedName,
          consentText: record.consentText,
          documentHash: record.documentHash,
          ipAddress: record.ipAddress,
          userAgent: record.userAgent,
          signedAt: record.signedAt,
        },
      });

      const [parties, signatures] = await Promise.all([
        tx.contractParty.findMany({ where: { contractId: id, mustSign: true } }),
        tx.contractSignature.findMany({ where: { contractId: id } }),
      ]);

      // Status is DERIVED from the signatures, never set independently, so it
      // cannot disagree with them.
      const status = statusFromSignatures({
        requiredSignerIds: parties.map((p) => p.userId),
        signedUserIds: signatures.map((s) => s.userId),
        sent: true,
        voided: false,
        completed: false,
      });

      return tx.contract.update({
        where: { id },
        data: {
          status: status as DbContractStatus,
          ...(status === 'SIGNED' ? { signedAt: new Date() } : {}),
        },
      });
    });

    // A fully signed contract makes the deposit due.
    if (result.status === 'SIGNED') await advanceSchedule(app.db, id);

    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.sign',
      entityType: 'Contract',
      entityId: id,
      after: { status: result.status, documentHash: record.documentHash },
      ipAddress: req.ip,
    });
    return { contract: result, signature: record };
  });

  app.post('/contracts/:id/void', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);
    const body = z.object({ reason: z.string().min(3).max(1000) }).parse(req.body);
    if (contract.status === 'COMPLETED') throw conflict('A completed contract cannot be voided.');

    const updated = await app.db.contract.update({
      where: { id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason: body.reason },
    });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.void',
      entityType: 'Contract',
      entityId: id,
      after: { reason: body.reason },
      ipAddress: req.ip,
    });
    return { contract: updated };
  });

  // ── Payments ────────────────────────────────────────────────────────────
  app.get('/contracts/:id/payments', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract } = await requireParty(app, req, id);

    const schedule = await app.db.paymentSchedule.findUnique({
      where: { contractId: id },
      include: { instalments: { orderBy: { createdAt: 'asc' } }, escrow: true },
    });
    if (!schedule) return { schedule: null, ledger: [], assessment: null };

    const [ledger, progress] = await Promise.all([
      app.db.ledgerEntry.findMany({
        where: { referenceType: 'Contract', referenceId: id },
        orderBy: { occurredAt: 'asc' },
      }),
      loadProgress(app.db, contract),
    ]);

    const assessment = schedule.escrow
      ? assessEscrow({
          heldCents: schedule.escrow.heldCents,
          depositCents: schedule.depositCents,
          progress,
          noLitterRemedy: schedule.noLitterRemedy as never,
          breedingFailed: await hasFailedBreeding(app.db, contract),
          disputed: schedule.escrow.status === 'DISPUTED',
          alreadyReleasedCents: schedule.escrow.releasedCents,
        })
      : null;

    return { schedule, ledger, assessment, progress, provider: { id: provider.id, isLive: provider.isLive } };
  });

  /**
   * Pay an instalment.
   *
   * The ledger row is written in the same transaction as the instalment
   * update — never after an external call, and never trusting the provider
   * response as the record.
   */
  app.post('/contracts/:id/pay/:instalmentKey', async (req) => {
    const { id, instalmentKey } = z.object({ id: z.string(), instalmentKey: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);
    if (contract.status !== 'SIGNED' && contract.status !== 'COMPLETED') {
      throw conflict('Both parties must sign before money moves.');
    }

    const schedule = await app.db.paymentSchedule.findUnique({
      where: { contractId: id },
      include: { instalments: true, escrow: true },
    });
    if (!schedule) throw notFound('This contract has no payment schedule.');

    const instalment = schedule.instalments.find((i) => i.key === instalmentKey);
    if (!instalment) throw notFound('No such instalment.');
    if (instalment.status === 'PAID') return { instalment, alreadyPaid: true };
    if (instalment.status !== 'DUE') {
      throw conflict(`The ${instalment.label.toLowerCase()} is not due yet — it falls due ${instalment.trigger.replace(/_/g, ' ').toLowerCase()}.`);
    }

    // Idempotency key is derived, not random, so a retry cannot double-charge.
    const idempotencyKey = `contract_${id}_${instalment.key}`;
    const charge = await provider.charge({
      idempotencyKey,
      amountCents: instalment.amountCents,
      currency: 'USD',
      payerId: user.id,
      description: `${contract.title} — ${instalment.label}`,
      method: 'CARD',
    });

    if (charge.status === 'FAILED') {
      throw badRequest(charge.failureMessage ?? 'The payment was declined.');
    }

    const transactionId = `txn_${idempotencyKey}`;
    const legs = captureToEscrow(
      { transactionId, referenceType: 'Contract', referenceId: id, occurredAt: new Date() },
      { payerId: user.id, amountCents: instalment.amountCents, isDeposit: instalment.key === 'deposit' },
    );

    const updated = await app.db.$transaction(async (tx) => {
      await writeLedger(tx as PrismaClient, legs);
      await tx.escrowHold.update({
        where: { scheduleId: schedule.id },
        data: {
          heldCents: { increment: instalment.amountCents },
          status: 'HOLDING',
        },
      });
      return tx.instalment.update({
        where: { id: instalment.id },
        data: { status: 'PAID', paidAt: new Date(), providerChargeId: charge.providerId },
      });
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.instalment.paid',
      entityType: 'Contract',
      entityId: id,
      after: { instalment: instalment.key, amountCents: instalment.amountCents, provider: provider.id },
      ipAddress: req.ip,
    });
    return { instalment: updated, charge, providerIsLive: provider.isLive };
  });

  /** Release or refund escrow according to the contract's own terms. */
  app.post('/contracts/:id/escrow/settle', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);

    const schedule = await app.db.paymentSchedule.findUnique({
      where: { contractId: id },
      include: { escrow: true, instalments: true },
    });
    if (!schedule?.escrow) throw notFound('No escrow on this contract.');

    const progress = await loadProgress(app.db, contract);
    const assessment = assessEscrow({
      heldCents: schedule.escrow.heldCents,
      depositCents: schedule.depositCents,
      progress,
      noLitterRemedy: schedule.noLitterRemedy as never,
      breedingFailed: await hasFailedBreeding(app.db, contract),
      disputed: schedule.escrow.status === 'DISPUTED',
      alreadyReleasedCents: schedule.escrow.releasedCents,
    });

    if (assessment.requiresHuman) {
      // The platform declining to decide is a legitimate outcome, not an error.
      return { settled: false, assessment };
    }
    if (assessment.decision === 'HOLD') return { settled: false, assessment };

    const now = new Date();
    const transactionId = `txn_settle_${id}_${now.getTime()}`;
    let legs: LedgerEntry[] = [];
    let feeCents = 0;

    if (assessment.decision === 'RELEASE' && assessment.releasableCents > 0) {
      feeCents = platformFee(assessment.releasableCents, env.PLATFORM_FEE_BPS);
      legs = releaseFromEscrow(
        { transactionId, referenceType: 'Contract', referenceId: id, occurredAt: now, memo: assessment.reason },
        {
          sellerId: schedule.escrow.payeeUserId ?? 'unknown',
          amountCents: assessment.releasableCents,
          platformFeeCents: feeCents,
        },
      );
    } else if (assessment.decision === 'REFUND' && assessment.refundableCents > 0) {
      legs = refundFromEscrow(
        { transactionId, referenceType: 'Contract', referenceId: id, occurredAt: now, memo: assessment.reason },
        { payerId: schedule.escrow.payerUserId ?? 'unknown', amountCents: assessment.refundableCents },
      );
    }

    if (legs.length === 0) return { settled: false, assessment };

    await app.db.$transaction(async (tx) => {
      await writeLedger(tx as PrismaClient, legs);
      const released = assessment.decision === 'RELEASE' ? assessment.releasableCents : 0;
      const refunded = assessment.decision === 'REFUND' ? assessment.refundableCents : 0;
      const remaining = schedule.escrow!.heldCents - released - refunded;
      await tx.escrowHold.update({
        where: { id: schedule.escrow!.id },
        data: {
          heldCents: remaining,
          releasedCents: { increment: released },
          refundedCents: { increment: refunded },
          status: remaining > 0 ? 'PARTIALLY_RELEASED' : refunded > 0 ? 'REFUNDED' : 'RELEASED',
        },
      });
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.escrow.settle',
      entityType: 'Contract',
      entityId: id,
      after: { decision: assessment.decision, released: assessment.releasableCents, refunded: assessment.refundableCents, feeCents },
      ipAddress: req.ip,
    });
    return { settled: true, assessment, platformFeeCents: feeCents };
  });

  app.post('/contracts/:id/escrow/dispute', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { user } = await requireParty(app, req, id);
    const body = z.object({ reason: z.string().min(10).max(2000) }).parse(req.body);

    const schedule = await app.db.paymentSchedule.findUnique({ where: { contractId: id }, include: { escrow: true } });
    if (!schedule?.escrow) throw notFound('No escrow on this contract.');

    const escrow = await app.db.escrowHold.update({
      where: { id: schedule.escrow.id },
      data: { status: 'DISPUTED', disputeOpenedAt: new Date(), disputeReason: body.reason },
    });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.escrow.dispute',
      entityType: 'Contract',
      entityId: id,
      after: { reason: body.reason },
      ipAddress: req.ip,
    });
    return { escrow };
  });

  // ── Repeat breeding ─────────────────────────────────────────────────────
  app.post('/contracts/:id/repeat-claims', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { contract, user } = await requireParty(app, req, id);

    // The right comes from the clause effects, not from asking nicely.
    const draft = toDraft(contract);
    const grantsRepeat = draft.instances.some(
      (i) => getClause(i.clauseId, i.clauseVersion)?.effects?.grantsRepeatBreeding,
    );
    if (!grantsRepeat) {
      throw badRequest(
        'This contract does not include a repeat-breeding clause, so there is no right to claim under it.',
      );
    }

    const body = z
      .object({
        reason: z.string().min(10).max(2000),
        vetConfirmed: z.boolean().default(false),
        vetDocumentUrl: z.string().url().optional(),
        failedBreedingId: z.string().optional(),
      })
      .parse(req.body);

    const claim = await app.db.repeatBreedingClaim.create({
      data: { contractId: id, ...body, submittedByUserId: user.id },
    });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'contract.repeat_claim.create',
      entityType: 'RepeatBreedingClaim',
      entityId: claim.id,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ claim });
  });

  app.patch('/repeat-claims/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const claim = await app.db.repeatBreedingClaim.findUnique({
      where: { id },
      include: { contract: { include: { parties: true } } },
    });
    if (!claim) throw notFound('Claim not found');
    if (!claim.contract.parties.some((p) => p.userId === user.id)) {
      throw forbidden('You are not a party to this contract.');
    }

    const body = z
      .object({
        status: z.enum(['UNDER_REVIEW', 'APPROVED', 'DECLINED', 'FULFILLED']),
        reviewNote: z.string().max(2000).optional(),
        repeatBreedingId: z.string().optional(),
      })
      .parse(req.body);

    const updated = await app.db.repeatBreedingClaim.update({
      where: { id },
      data: { ...body, reviewedByUserId: user.id, reviewedAt: new Date() },
    });
    return { claim: updated };
  });

  // ── AI collection records ───────────────────────────────────────────────
  app.post('/breedings/:id/collections', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const breeding = await app.db.breeding.findUnique({ where: { id }, select: { damId: true } });
    if (!breeding) throw notFound('Breeding not found');
    // Same rule as every other mutation on a breeding. A collection record is
    // evidence in a fee dispute, so who may write one is not a detail.
    if (!(await canEditDog(app.db, user.id, user.roles, breeding.damId))) {
      throw forbidden('You do not have access to this breeding.');
    }

    const body = z
      .object({
        collectedOn: z.coerce.date(),
        collectedBy: z.string().max(200).optional(),
        clinic: z.string().max(200).optional(),
        volumeMl: z.number().min(0).max(100).optional(),
        concentrationMkml: z.number().min(0).max(10_000).optional(),
        motilityPercent: z.number().int().min(0).max(100).optional(),
        morphologyPercent: z.number().int().min(0).max(100).optional(),
        totalMotileMillions: z.number().min(0).max(100_000).optional(),
        shippedOn: z.coerce.date().optional(),
        shippingCarrier: z.string().max(120).optional(),
        trackingNumber: z.string().max(120).optional(),
        receivedOn: z.coerce.date().optional(),
        receivedCondition: z.string().max(500).optional(),
        inseminatedOn: z.coerce.date().optional(),
        inseminatedBy: z.string().max(200).optional(),
        method: z.string().max(60).optional(),
        documentUrl: z.string().url().optional(),
        notes: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const record = await app.db.collectionRecord.create({ data: { breedingId: id, ...body } });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'breeding.collection.create',
      entityType: 'CollectionRecord',
      entityId: record.id,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ record });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

type ContractWithRelations = Awaited<ReturnType<typeof loadContract>>;

async function loadContract(db: PrismaClient, id: string) {
  const contract = await db.contract.findUnique({
    where: { id },
    include: {
      parties: { include: { user: { select: { id: true, displayName: true, email: true } } } },
      signatures: true,
      sire: { select: { id: true, slug: true, callName: true, registeredName: true } },
      dam: { select: { id: true, slug: true, callName: true, registeredName: true } },
      schedule: { include: { instalments: true, escrow: true } },
      repeatClaims: { orderBy: { createdAt: 'desc' } },
      breeding: { select: { id: true, status: true, litter: { select: { id: true, whelpedOn: true, liveBorn: true } } } },
    },
  });
  return contract;
}

async function requireParty(app: FastifyInstance, req: FastifyRequest, id: string) {
  const user = await app.requireUser(req);
  const contract = await loadContract(app.db, id);
  if (!contract) throw notFound('Contract not found');
  const party = contract.parties.find((p) => p.userId === user.id);
  if (!party && !user.roles.includes('ADMIN')) {
    throw forbidden('You are not a party to this contract.');
  }
  return { contract, user, party: party ?? contract.parties[0]! };
}

function toDraft(contract: NonNullable<ContractWithRelations>): ContractDraft {
  return {
    title: contract.title,
    instances: (contract.clauses as unknown as ClauseInstance[]) ?? [],
    healthSchedule: (contract.healthSchedule as HealthScheduleEntry[] | null) ?? [],
  };
}

/**
 * Read the payment terms out of the clause EFFECTS.
 *
 * Never from the rendered sentence. A refund decision that depends on parsing
 * English is a refund decision that will eventually be wrong.
 */
function extractScheduleTerms(draft: ContractDraft): {
  totalCents: number;
  depositCents: number;
  balanceTrigger: 'ON_TIE' | 'ON_CONFIRMED_PREGNANCY' | 'ON_WHELP' | 'ON_PICK' | 'ON_PICKUP';
  noLitterRemedy: string | null;
} | null {
  /**
   * Two clauses can carry a fee: the stud service one and the puppy sale one.
   * They use different variable names because they are different agreements,
   * but both produce the same schedule — so this reads whichever is present
   * rather than the send route needing to know what kind of contract it has.
   */
  const studFee = draft.instances.find((i) => i.clauseId === 'fee.deposit_and_balance');
  const puppyFee = draft.instances.find((i) => i.clauseId === 'fee.purchase_price');
  const feeInstance = studFee ?? puppyFee;
  if (!feeInstance) return null;

  const total = Number(feeInstance.values[studFee ? 'feeTotal' : 'priceTotal'] ?? 0);
  const deposit = Number(feeInstance.values.depositAmount ?? 0);
  if (!Number.isInteger(total) || !Number.isInteger(deposit)) return null;

  const trigger = String(
    feeInstance.values.balanceTrigger ?? (studFee ? 'ON_CONFIRMED_PREGNANCY' : 'ON_PICKUP'),
  ) as 'ON_TIE' | 'ON_CONFIRMED_PREGNANCY' | 'ON_WHELP' | 'ON_PICK' | 'ON_PICKUP';

  // The remedy comes from whichever remedy clause is present, via its effects.
  let noLitterRemedy: string | null = null;
  for (const instance of draft.instances) {
    const clause = getClause(instance.clauseId, instance.clauseVersion);
    const effect = clause?.effects?.definesNoLitterRemedy;
    if (effect) {
      // A repeat clause can be configured to refund the balance instead.
      if (effect === 'REPEAT_ONLY' && String(instance.values.feeDisposition ?? '').includes('refundable')) {
        noLitterRemedy = 'REFUND_BALANCE';
      } else {
        noLitterRemedy = effect;
      }
      break;
    }
  }

  return { totalCents: total, depositCents: deposit, balanceTrigger: trigger, noLitterRemedy };
}

async function buildHealthSchedule(
  db: PrismaClient,
  sireId?: string,
  damId?: string,
): Promise<HealthScheduleEntry[]> {
  const entries: HealthScheduleEntry[] = [];
  for (const [animal, dogId] of [['SIRE', sireId], ['DAM', damId]] as const) {
    if (!dogId) continue;
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
    // Reported claims appear too, marked as such. Omitting them would be
    // tidier and less honest.
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

async function loadProgress(db: PrismaClient, contract: NonNullable<ContractWithRelations>) {
  const breeding = contract.breedingId
    ? await db.breeding.findUnique({
        where: { id: contract.breedingId },
        include: { events: { select: { id: true } }, litter: { select: { whelpedOn: true, liveBorn: true } } },
      })
    : null;

  return {
    contractSigned: contract.status === 'SIGNED' || contract.status === 'COMPLETED',
    tieRecorded: (breeding?.events.length ?? 0) > 0,
    pregnancyConfirmed: breeding?.status === 'CONFIRMED_PREGNANT' || breeding?.status === 'WHELPED',
    litterWhelped: Boolean(breeding?.litter?.whelpedOn && (breeding.litter.liveBorn ?? 0) > 0),
  };
}

async function hasFailedBreeding(db: PrismaClient, contract: NonNullable<ContractWithRelations>) {
  if (!contract.breedingId) return false;
  const breeding = await db.breeding.findUnique({
    where: { id: contract.breedingId },
    select: { status: true, litter: { select: { liveBorn: true, whelpedOn: true } } },
  });
  if (!breeding) return false;
  if (breeding.status === 'CONFIRMED_EMPTY' || breeding.status === 'ABANDONED') return true;
  // Whelped but nothing survived.
  return Boolean(breeding.litter?.whelpedOn && (breeding.litter.liveBorn ?? 0) === 0);
}

/** Advance PENDING instalments to DUE where their trigger has fired. */
async function advanceSchedule(db: PrismaClient, contractId: string) {
  const contract = await loadContract(db, contractId);
  if (!contract) return;
  const schedule = await db.paymentSchedule.findUnique({
    where: { contractId },
    include: { instalments: true },
  });
  if (!schedule) return;

  const progress = await loadProgress(db, contract);
  const now = new Date();
  const triggerMet: Record<string, boolean> = {
    ON_SIGNING: progress.contractSigned,
    ON_TIE: progress.tieRecorded,
    ON_CONFIRMED_PREGNANCY: progress.pregnancyConfirmed,
    ON_WHELP: progress.litterWhelped,
  };

  for (const i of schedule.instalments) {
    if (i.status !== 'PENDING') continue;
    if (!triggerMet[i.trigger]) continue;
    await db.instalment.update({ where: { id: i.id }, data: { status: 'DUE', dueSince: now } });
  }
}

/** Write ledger legs. Always all-or-nothing, always inside a transaction. */
async function writeLedger(tx: PrismaClient, legs: readonly LedgerEntry[]) {
  await tx.ledgerEntry.createMany({
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
