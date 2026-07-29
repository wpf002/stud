import { createHash } from 'node:crypto';
import {
  channelMix,
  funnelByBand,
  summariseReviews,
  verificationLift,
  type FunnelEventInput,
} from '@stud/verify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';

const STEPS = [
  'LISTING_IMPRESSION',
  'LISTING_VIEW',
  'APPLY_STARTED',
  'INQUIRY_SENT',
  'APPLICATION_SUBMITTED',
  'APPLICATION_APPROVED',
  'DEPOSIT_PAID',
  'PLACEMENT_COMPLETED',
] as const;

/** Bucketed on the way in. A full referrer URL is never stored. */
const CHANNELS = ['organic', 'direct', 'social', 'referral', 'paid', 'email'] as const;

/**
 * Trust and measurement.
 *
 * ── Reviews ───────────────────────────────────────────────────────────────
 * A review requires a COMPLETED application or a SIGNED stud contract. There
 * is no other way to write one. Every other dog marketplace takes reviews from
 * anyone with an email address, which is precisely why nobody believes them.
 *
 * ── Measurement ───────────────────────────────────────────────────────────
 * First-party only. No cookie, no cross-site identifier, no profile — a
 * platform whose whole argument is "we check things so you do not have to take
 * somebody's word for it" does not ship a page that reports every visitor to
 * an ad network. The verification tier is snapshotted at event time, because
 * the question is whether verification caused the conversion and today's
 * counts cannot answer that.
 */
export default async function trustRoutes(app: FastifyInstance) {
  // ── Reviews ─────────────────────────────────────────────────────────────
  app.post('/kennels/:kennelId/reviews', async (req, reply) => {
    const { kennelId } = z.object({ kennelId: z.string() }).parse(req.params);
    const user = await app.requireUser(req);

    const body = z
      .object({
        overall: z.number().int().min(1).max(5),
        communication: z.number().int().min(1).max(5).optional(),
        healthOfPuppy: z.number().int().min(1).max(5).optional(),
        honestyAboutMatch: z.number().int().min(1).max(5).optional(),
        supportAfterward: z.number().int().min(1).max(5).optional(),
        title: z.string().max(160).optional(),
        body: z.string().min(30).max(6000),
      })
      .parse(req.body);

    /**
     * The gate. Find the transaction that entitles this person to an opinion.
     *
     * A completed placement from this kennel, or a signed stud contract they
     * were a party to. Nothing else counts, and there is no override.
     */
    const application = await app.db.puppyApplication.findFirst({
      where: {
        stage: 'COMPLETED',
        applicantUserId: user.id,
        review: null,
        litterListing: { litter: { OR: [{ kennelId }, { dam: { kennelId } }] } },
      },
      include: { pickup: { select: { collectedOn: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const contract = application
      ? null
      : await app.db.contract.findFirst({
          where: {
            status: { in: ['SIGNED', 'COMPLETED'] },
            review: null,
            /**
             * A puppy sale NEVER grants a review through its contract — the
             * entitlement lives on the application, which is the same
             * transaction. Filtering on `application: null` was not enough: an
             * application deleted (or never linked) leaves an orphaned sale
             * contract that would quietly re-open the door, and the first
             * exploit found in testing walked straight through it. Kind is the
             * property that cannot be orphaned away.
             */
            kind: { not: 'PUPPY_SALE' },
            parties: { some: { userId: user.id } },
            OR: [{ kennelId }, { sire: { kennelId } }, { dam: { kennelId } }],
          },
          orderBy: { signedAt: 'desc' },
        });

    if (!application && !contract) {
      throw forbidden(
        'Reviews can only be left by people who completed a purchase or a signed breeding with this breeder.',
      );
    }

    const collectedOn = application?.pickup?.collectedOn ?? null;
    const daysAfterPlacement = collectedOn
      ? Math.max(0, Math.floor((Date.now() - collectedOn.getTime()) / 86_400_000))
      : null;

    const review = await app.db.breederReview.create({
      data: {
        kennelId,
        applicationId: application?.id ?? null,
        contractId: contract?.id ?? null,
        authorUserId: user.id,
        daysAfterPlacement,
        ...body,
      },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'review.create',
      entityType: 'BreederReview',
      entityId: review.id,
      after: { kennelId, overall: body.overall },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ review });
  });

  app.get('/kennels/:kennelId/reviews', async (req) => {
    const { kennelId } = z.object({ kennelId: z.string() }).parse(req.params);
    const reviews = await app.db.breederReview.findMany({
      where: { kennelId, status: 'PUBLISHED' },
      include: { author: { select: { displayName: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { reviews, summary: summariseReviews(reviews) };
  });

  /**
   * The breeder's reply. Exactly one, and they cannot remove the review.
   *
   * A marketplace where the reviewed party can delete a review has no reviews,
   * it has testimonials.
   */
  app.post('/reviews/:id/response', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ response: z.string().min(1).max(4000) }).parse(req.body);

    const review = await app.db.breederReview.findUnique({ where: { id } });
    if (!review) throw notFound('Review not found');
    await app.requireKennelAccess(req, review.kennelId, 'MANAGER');
    if (review.response) throw conflict('You have already replied to this review.');

    const updated = await app.db.breederReview.update({
      where: { id },
      data: { response: body.response, respondedAt: new Date() },
    });
    return { review: updated };
  });

  /** Report a review. Moderation is a state change, never a delete. */
  app.post('/reviews/:id/flag', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const body = z.object({ reason: z.string().min(10).max(1000) }).parse(req.body);

    const review = await app.db.breederReview.findUnique({ where: { id } });
    if (!review) throw notFound('Review not found');

    const updated = await app.db.breederReview.update({
      where: { id },
      data: { flaggedReason: body.reason, flaggedAt: new Date(), status: 'UNDER_REVIEW' },
    });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'review.flag',
      entityType: 'BreederReview',
      entityId: id,
      after: { reason: body.reason },
      ipAddress: req.ip,
    });
    return { review: { id: updated.id, status: updated.status } };
  });

  /** What the signed-in user is entitled to review, and has not yet. */
  app.get('/my/reviewable', async (req) => {
    const user = await app.requireUser(req);
    const applications = await app.db.puppyApplication.findMany({
      where: { stage: 'COMPLETED', applicantUserId: user.id, review: null },
      include: {
        pickup: { select: { collectedOn: true } },
        litterListing: {
          select: {
            litter: {
              select: {
                kennelId: true,
                dam: { select: { kennel: { select: { id: true, slug: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    return {
      reviewable: applications
        .map((a) => ({
          applicationId: a.id,
          kennel: a.litterListing.litter.dam.kennel,
          collectedOn: a.pickup?.collectedOn ?? null,
        }))
        .filter((r) => r.kennel),
    };
  });

  // ── Funnel ──────────────────────────────────────────────────────────────
  /**
   * Record a step.
   *
   * Unauthenticated by design — most of the funnel happens before anybody
   * signs in. Rate limited, and it stores no identifier that outlives the day.
   */
  app.post(
    '/funnel',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = z
        .object({
          step: z.enum(STEPS),
          slug: z.string().max(120).optional(),
          channel: z.enum(CHANNELS).optional(),
        })
        .parse(req.body);

      const listing = body.slug
        ? await app.db.litterListing.findUnique({
            where: { slug: body.slug },
            select: {
              id: true,
              cachedSireVerified: true,
              cachedDamVerified: true,
              cachedParentDensity: true,
              litter: {
                select: {
                  kennelId: true,
                  sire: { select: { verifiedClaims: { where: { state: 'CONFLICTED' }, select: { id: true } } } },
                  dam: { select: { verifiedClaims: { where: { state: 'CONFLICTED' }, select: { id: true } } } },
                },
              },
            },
          })
        : null;

      await app.db.funnelEvent.create({
        data: {
          step: body.step,
          litterListingId: listing?.id ?? null,
          kennelId: listing?.litter.kennelId ?? null,
          // Frozen here. See the note on the model.
          verifiedParentClaims: (listing?.cachedSireVerified ?? 0) + (listing?.cachedDamVerified ?? 0),
          parentDensity: listing?.cachedParentDensity ?? 0,
          hadConflict:
            (listing?.litter.sire.verifiedClaims.length ?? 0) > 0 ||
            (listing?.litter.dam.verifiedClaims.length ?? 0) > 0,
          sessionHash: dailySessionHash(req),
          channel: body.channel ?? 'direct',
        },
      });

      // Nothing to say back. A tracking endpoint that returns a body is a
      // tracking endpoint somebody will start reading state out of.
      return reply.code(204).send();
    },
  );

  /**
   * The Phase 9 gate, as a number.
   *
   * Admin-only: this is the company's own scoreboard, and a breeder seeing
   * conversion rates by verification tier would learn how to game the ranking
   * rather than how to test their dogs.
   */
  app.get('/admin/funnel', async (req) => {
    const user = await app.requireRole(req, ['ADMIN']);
    const q = z.object({ days: z.coerce.number().min(1).max(365).default(90) }).parse(req.query);

    const since = new Date(Date.now() - q.days * 86_400_000);
    const rows = await app.db.funnelEvent.findMany({
      where: { occurredAt: { gte: since } },
      select: {
        step: true,
        verifiedParentClaims: true,
        parentDensity: true,
        hadConflict: true,
        channel: true,
      },
      take: 200_000,
    });

    const events = rows as unknown as FunnelEventInput[];
    return {
      days: q.days,
      totalEvents: rows.length,
      byBand: funnelByBand(events),
      lift: verificationLift(events),
      channels: channelMix(events),
      viewerId: user.id,
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * A session identifier that expires with the day.
 *
 * Salted with the auth secret and the date, so it cannot be correlated across
 * days, cannot be reversed to an IP, and disappears on its own. Enough to stop
 * one refresh counting as ten views; not enough to follow anybody anywhere.
 */
function dailySessionHash(req: FastifyRequest): string {
  const day = new Date().toISOString().slice(0, 10);
  const agent = req.headers['user-agent'] ?? '';
  return createHash('sha256')
    .update(`${req.ip}|${agent}|${day}|${env.AUTH_SECRET}`)
    .digest('hex')
    .slice(0, 32);
}
