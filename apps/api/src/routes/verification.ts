import {
  CLAIM_CATEGORY,
  CLAIM_LABEL,
  type ClaimType,
  VerificationEngine,
  detectLab,
  findingsFromReview,
  suggestFromOcr,
} from '@stud/verify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { canEditDog } from '../lib/dog-access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import {
  markStaleClaims,
  recomputeSummary,
  resolveConflict,
  runVerification,
} from '@stud/db/verification';

const engine = new VerificationEngine({
  liveSources: env.VERIFY_LIVE_SOURCES,
  userAgent: env.VERIFY_USER_AGENT,
  timeoutMs: env.VERIFY_REQUEST_TIMEOUT_MS,
});

const CLAIM_TYPES = Object.keys(CLAIM_CATEGORY) as ClaimType[];

export default async function verificationRoutes(app: FastifyInstance) {
  // ── Reference data ──────────────────────────────────────────────────────
  app.get('/verification/sources', async () => ({
    liveSources: env.VERIFY_LIVE_SOURCES,
    sources: engine.list().map((a) => ({
      id: a.meta.id,
      label: a.meta.label,
      homepage: a.meta.homepage,
      mode: a.meta.mode,
      freshnessDays: a.meta.freshnessDays,
      claimTypes: a.meta.claimTypes,
    })),
    claimTypes: CLAIM_TYPES.map((t) => ({
      type: t,
      label: CLAIM_LABEL[t],
      category: CLAIM_CATEGORY[t],
    })),
  }));

  // ── Read a dog's claims ─────────────────────────────────────────────────
  /**
   * Verified and reported claims are returned as SEPARATE arrays.
   *
   * Not a stylistic choice — merging them here would let a client render a
   * self-attested claim in a verified treatment, which is precisely the
   * failure invariant 5 exists to prevent. The API refuses to make that
   * mistake possible.
   */
  app.get('/dogs/:idOrSlug/verification', async (req) => {
    const { idOrSlug } = z.object({ idOrSlug: z.string() }).parse(req.params);
    const dog = await app.db.dog.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: {
        id: true, slug: true, callName: true, registeredName: true, breed: true,
        registrations: { select: { id: true, body: true, number: true, isPrimary: true } },
      },
    });
    if (!dog) throw notFound('Dog not found');

    const [verified, reported, summary, recentChecks] = await Promise.all([
      app.db.verifiedClaim.findMany({
        where: { dogId: dog.id },
        orderBy: [{ category: 'asc' }, { claimType: 'asc' }],
      }),
      app.db.reportedClaim.findMany({ where: { dogId: dog.id }, orderBy: { claimType: 'asc' } }),
      app.db.dogVerificationSummary.findUnique({ where: { dogId: dog.id } }),
      app.db.verificationCheck.findMany({
        where: { dogId: dog.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, source: true, status: true, findingCount: true,
          durationMs: true, error: true, createdAt: true, identifier: true,
        },
      }),
    ]);

    return { dog, verified, reported, summary, recentChecks };
  });

  /** The full transition history for one claim. The receipts drawer. */
  app.get('/verification/claims/:id/history', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const claim = await app.db.verifiedClaim.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'desc' } },
        checks: { orderBy: { createdAt: 'desc' }, take: 20 },
        dog: { select: { id: true, slug: true, callName: true } },
      },
    });
    if (!claim) throw notFound('Claim not found');
    return { claim };
  });

  // ── Run a verification ──────────────────────────────────────────────────
  /**
   * The Phase 2 gate: paste a registration number, get back real results with
   * source attribution, in under five seconds.
   */
  app.post(
    '/dogs/:id/verify',
    { config: { rateLimit: { max: 30, timeWindow: '5 minutes' } } },
    async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const user = await app.requireUser(req);
      const body = z
        .object({
          /** Override the dog's stored registrations for a one-off check. */
          identifiers: z
            .array(z.object({ number: z.string().min(1).max(60), body: z.string().max(20).optional() }))
            .max(8)
            .optional(),
          claimTypes: z.array(z.string()).max(40).optional(),
        })
        .parse(req.body ?? {});

      if (!(await canEditDog(app.db, user.id, user.roles, id))) {
        throw forbidden('You do not have access to this dog');
      }

      const dog = await app.db.dog.findUnique({
        where: { id },
        select: { id: true, registrations: { select: { number: true, body: true } } },
      });
      if (!dog) throw notFound('Dog not found');

      const identifiers =
        body.identifiers ?? dog.registrations.map((r) => ({ number: r.number, body: r.body }));

      if (identifiers.length === 0) {
        throw badRequest(
          'This dog has no registration number on file. Verification keys on the registration number — without one, nothing can move past "Reported".',
        );
      }

      const outcome = await runVerification(app.db, engine, {
        dogId: id,
        identifiers,
        claimTypes: body.claimTypes as ClaimType[] | undefined,
        actor: { id: user.id, type: user.roles.includes('ADMIN') ? 'admin' : 'user' },
      });

      await audit(app.db, {
        actor: { id: user.id },
        action: 'verification.run',
        entityType: 'Dog',
        entityId: id,
        after: outcome,
        ipAddress: req.ip,
      });

      const [verified, summary] = await Promise.all([
        app.db.verifiedClaim.findMany({ where: { dogId: id }, orderBy: { claimType: 'asc' } }),
        app.db.dogVerificationSummary.findUnique({ where: { dogId: id } }),
      ]);

      return { outcome, verified, summary };
    },
  );

  // ── Reported claims ─────────────────────────────────────────────────────
  /**
   * Record what the owner says.
   *
   * This endpoint can only ever write to `reported_claims`. There is no code
   * path from here into `verified_claims` — the separation is structural, not
   * a convention someone has to remember.
   */
  app.post('/dogs/:id/reported-claims', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    if (!(await canEditDog(app.db, user.id, user.roles, id))) {
      throw forbidden('You do not have access to this dog');
    }

    const body = z
      .object({
        claimType: z.string().min(1).max(60),
        markerName: z.string().max(120).optional(),
        statedResult: z.string().min(1).max(200),
        statedTestedAt: z.coerce.date().optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const category = CLAIM_CATEGORY[body.claimType as ClaimType];
    if (!category) throw badRequest(`Unknown claim type "${body.claimType}".`);

    const claim = await app.db.reportedClaim.upsert({
      where: {
        dogId_claimType_markerName: {
          dogId: id,
          claimType: body.claimType,
          markerName: body.markerName ?? '',
        },
      },
      create: {
        dogId: id,
        claimType: body.claimType,
        category,
        markerName: body.markerName ?? '',
        statedResult: body.statedResult,
        statedTestedAt: body.statedTestedAt ?? null,
        note: body.note ?? null,
        reportedByUserId: user.id,
      },
      update: {
        statedResult: body.statedResult,
        statedTestedAt: body.statedTestedAt ?? null,
        note: body.note ?? null,
        reportedByUserId: user.id,
      },
    });

    await recomputeSummary(app.db, id);
    return reply.code(201).send({ claim });
  });

  app.delete('/reported-claims/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const claim = await app.db.reportedClaim.findUnique({ where: { id }, select: { dogId: true } });
    if (!claim) throw notFound('Claim not found');
    if (!(await canEditDog(app.db, user.id, user.roles, claim.dogId))) {
      throw forbidden('You do not have access to this dog');
    }
    await app.db.reportedClaim.delete({ where: { id } });
    await recomputeSummary(app.db, claim.dogId);
    return { ok: true };
  });

  // ── Document submissions ────────────────────────────────────────────────
  app.post('/dogs/:id/documents', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    if (!(await canEditDog(app.db, user.id, user.roles, id))) {
      throw forbidden('You do not have access to this dog');
    }

    const body = z
      .object({
        documentUrl: z.string().url(),
        fileName: z.string().max(200).optional(),
        mimeType: z.string().max(100).optional(),
        fileSize: z.number().int().positive().optional(),
        /** Extracted client- or worker-side; we only read it. */
        ocrText: z.string().max(200_000).optional(),
      })
      .parse(req.body);

    const { lab, suggestions } = body.ocrText
      ? suggestFromOcr(body.ocrText)
      : { lab: 'OTHER' as const, suggestions: [] };

    const submission = await app.db.documentSubmission.create({
      data: {
        dogId: id,
        lab: body.ocrText ? detectLab(body.ocrText) : lab,
        documentUrl: body.documentUrl,
        fileName: body.fileName ?? null,
        mimeType: body.mimeType ?? null,
        fileSize: body.fileSize ?? null,
        ocrText: body.ocrText ?? null,
        ocrSuggestions: suggestions as never,
        submittedByUserId: user.id,
      },
    });

    return reply.code(201).send({
      submission,
      // Stated explicitly in the response so no client can mistake a
      // pre-fill for a result.
      note: 'Queued for human review. OCR suggestions are a starting point for a reviewer, not a verified result.',
    });
  });

  app.get('/documents/queue', async (req) => {
    await app.requireRole(req, ['ADMIN']);
    const q = z
      .object({ status: z.enum(['QUEUED', 'IN_REVIEW', 'APPROVED', 'REJECTED']).default('QUEUED') })
      .parse(req.query);

    const submissions = await app.db.documentSubmission.findMany({
      where: { status: q.status },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        dog: { select: { id: true, slug: true, callName: true, registeredName: true, breed: true } },
        submittedBy: { select: { id: true, displayName: true } },
      },
    });
    return { submissions };
  });

  /**
   * A reviewer confirms findings. Only this path can create a DOCUMENT-sourced
   * verified claim — OCR never publishes on its own.
   */
  app.post('/documents/:id/review', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireRole(req, ['ADMIN']);
    const body = z
      .object({
        decision: z.enum(['APPROVE', 'REJECT']),
        rejectionReason: z.string().max(1000).optional(),
        findings: z
          .array(
            z.object({
              claimType: z.string().min(1),
              markerName: z.string().max(120).optional(),
              rawResult: z.string().min(1).max(200),
              testedAt: z.coerce.date().optional(),
              detail: z.string().max(500).optional(),
            }),
          )
          .max(80)
          .default([]),
      })
      .parse(req.body);

    const submission = await app.db.documentSubmission.findUnique({ where: { id } });
    if (!submission) throw notFound('Submission not found');

    if (body.decision === 'REJECT') {
      const updated = await app.db.documentSubmission.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          rejectionReason: body.rejectionReason ?? null,
        },
      });
      return { submission: updated };
    }

    if (body.findings.length === 0) {
      throw badRequest('Approving with no findings would verify nothing. Reject it instead.');
    }

    const findings = findingsFromReview(
      body.findings.map((f) => ({
        claimType: f.claimType as ClaimType,
        markerName: f.markerName ?? null,
        rawResult: f.rawResult,
        testedAt: f.testedAt ?? null,
        detail: f.detail ?? null,
      })),
      submission.lab as 'EMBARK',
      submission.documentUrl,
    );

    const now = new Date();
    for (const finding of findings) {
      const category = CLAIM_CATEGORY[finding.claimType];
      const claim = await app.db.verifiedClaim.upsert({
        where: {
          dogId_claimType_markerName_source: {
            dogId: submission.dogId,
            claimType: finding.claimType,
            markerName: finding.markerName ?? '',
            source: 'DOCUMENT',
          },
        },
        create: {
          dogId: submission.dogId,
          claimType: finding.claimType,
          category,
          markerName: finding.markerName ?? '',
          source: 'DOCUMENT',
          state: 'VERIFIED',
          rawResult: finding.rawResult,
          outcome: finding.outcome,
          testedAt: finding.testedAt ?? null,
          detail: finding.detail ?? null,
          sourceUrl: submission.documentUrl,
          lastCheckedAt: now,
          staleAfter: new Date(now.getTime() + 365 * 86_400_000),
        },
        update: {
          state: 'VERIFIED',
          rawResult: finding.rawResult,
          outcome: finding.outcome,
          testedAt: finding.testedAt ?? null,
          detail: finding.detail ?? null,
          lastCheckedAt: now,
          staleAfter: new Date(now.getTime() + 365 * 86_400_000),
        },
      });

      await app.db.verificationEvent.create({
        data: {
          claimId: claim.id,
          fromState: 'PENDING',
          toState: 'VERIFIED',
          trigger: 'SOURCE_CONFIRMED',
          reason: `Reviewed and confirmed from an uploaded ${submission.lab} certificate by an admin.`,
          source: 'DOCUMENT',
          observedRawResult: finding.rawResult,
          actorType: 'admin',
          actorUserId: user.id,
        },
      });
    }

    const updated = await app.db.documentSubmission.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewedFindings: body.findings as never,
      },
    });

    await recomputeSummary(app.db, submission.dogId);
    await audit(app.db, {
      actor: { id: user.id },
      action: 'document.review.approve',
      entityType: 'DocumentSubmission',
      entityId: id,
      after: { findings: body.findings.length },
      ipAddress: req.ip,
    });

    return { submission: updated, claimsVerified: findings.length };
  });

  // ── Conflict queue (admin) ──────────────────────────────────────────────
  app.get('/verification/conflicts', async (req) => {
    await app.requireRole(req, ['ADMIN']);
    const claims = await app.db.verifiedClaim.findMany({
      where: { state: 'CONFLICTED' },
      orderBy: { conflictedAt: 'desc' },
      take: 100,
      include: {
        dog: {
          select: {
            id: true, slug: true, callName: true, registeredName: true, breed: true,
            kennel: { select: { id: true, name: true, slug: true } },
          },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 4 },
      },
    });
    return { claims };
  });

  app.post('/verification/conflicts/:id/resolve', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireRole(req, ['ADMIN']);
    const body = z
      .object({
        action: z.enum(['ACCEPT_SOURCE', 'KEEP_RECORD', 'REVOKE']),
        note: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const { claim, decision } = await resolveConflict(app.db, {
      claimId: id,
      action: body.action,
      actorUserId: user.id,
      note: body.note ?? null,
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'verification.conflict.resolve',
      entityType: 'VerifiedClaim',
      entityId: id,
      after: { action: body.action, to: decision.to },
      ipAddress: req.ip,
    });

    return { claim, decision };
  });

  // ── Reconciliation (admin / worker) ─────────────────────────────────────
  app.post('/verification/reconcile', async (req) => {
    await app.requireRole(req, ['ADMIN']);
    const marked = await markStaleClaims(app.db);
    return {
      staleMarked: marked,
      note: 'Stale claims are re-queried by the ingest worker on its next pass.',
    };
  });
}
