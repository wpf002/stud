/**
 * Stud booking requests.
 *
 * The dam owner asks for a window; the stud owner accepts or declines; the
 * deposit is charged on acceptance. Nothing here writes a listing's
 * availability directly — booking-service derives it from the accepted
 * bookings after every change, which is what keeps the public listing honest.
 */
import { createProvider } from '@stud/payments';
import { assessBrucellosis } from '@stud/verify';
import {
  BookingError,
  acceptBooking,
  cancelBooking,
  declineBooking,
  requestBooking,
  withdrawBooking,
} from '@stud/db/bookings';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { canEditDog } from '../lib/dog-access.js';

const provider = createProvider(env.PAYMENTS_PROVIDER);

/** Map the service's own failure modes onto HTTP without losing the reason. */
function rethrow(e: unknown): never {
  if (e instanceof BookingError) {
    if (e.code === 'NOT_FOUND') throw notFound(e.message);
    if (e.code === 'CONFLICT') throw conflict(e.message);
    throw badRequest(e.message);
  }
  throw e;
}

const dateOnly = z.coerce.date();

export default async function bookingRoutes(app: FastifyInstance) {
  /** The stud owner's queue. */
  app.get('/studs/bookings/inbox', async (req) => {
    const user = await app.requireUser(req);
    const bookings = await app.db.studBooking.findMany({
      where: {
        studListing: { dog: { kennel: { memberships: { some: { userId: user.id } } } } },
      },
      orderBy: [{ status: 'asc' }, { windowStart: 'asc' }],
      include: {
        dam: { select: { id: true, slug: true, callName: true, breed: true } },
        requestedBy: { select: { id: true, name: true, displayName: true, email: true } },
        studListing: {
          select: { id: true, studFeeCents: true, dog: { select: { slug: true, callName: true } } },
        },
      },
    });
    return { bookings };
  });

  /** What the dam owner has asked for. */
  app.get('/studs/bookings/mine', async (req) => {
    const user = await app.requireUser(req);
    const bookings = await app.db.studBooking.findMany({
      where: { requestedByUserId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        dam: { select: { slug: true, callName: true } },
        studListing: { select: { dog: { select: { slug: true, callName: true, breed: true } } } },
      },
    });
    return { bookings };
  });

  app.post('/studs/:listingId/bookings', async (req) => {
    const { listingId } = z.object({ listingId: z.string() }).parse(req.params);
    const body = z
      .object({
        damId: z.string(),
        windowStart: dateOnly,
        windowEnd: dateOnly,
        method: z.enum(['NATURAL', 'AI_FRESH', 'AI_CHILLED', 'AI_FROZEN', 'AI_SURGICAL', 'TCI']).optional(),
        message: z.string().max(2000).optional(),
        inquiryId: z.string().optional(),
      })
      .parse(req.body);
    const user = await app.requireUser(req);

    // You can only book a mating for a female you actually have access to.
    if (!(await canEditDog(app.db, user.id, user.roles, body.damId))) {
      throw forbidden('You can only book a stud for a bitch you have access to.');
    }
    const dam = await app.db.dog.findUnique({
      where: { id: body.damId },
      select: { sex: true, kennelId: true },
    });
    if (!dam) throw notFound('That dam is not on file');
    if (dam.sex !== 'FEMALE') throw badRequest('A booking is made for a female.');

    try {
      return {
        booking: await requestBooking(app.db, {
          studListingId: listingId,
          damId: body.damId,
          requestedByUserId: user.id,
          fromKennelId: dam.kennelId,
          windowStart: body.windowStart,
          windowEnd: body.windowEnd,
          method: body.method,
          message: body.message,
          inquiryId: body.inquiryId,
        }),
      };
    } catch (e) {
      rethrow(e);
    }
  });

  /** Only the stud's own side may answer. */
  async function assertStudOwner(req: Parameters<typeof app.requireUser>[0], bookingId: string) {
    const user = await app.requireUser(req);
    const booking = await app.db.studBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, studListing: { select: { dog: { select: { id: true } } } } },
    });
    if (!booking) throw notFound('Booking not found');
    if (!(await canEditDog(app.db, user.id, user.roles, booking.studListing.dog.id))) {
      throw forbidden('That is not your stud.');
    }
    return user;
  }

  app.post('/studs/bookings/:id/accept', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        depositCents: z.coerce.number().int().min(0).optional(),
        /** Accept anyway, with the brucellosis evidence as it stands. */
        overrideBrucellosis: z.coerce.boolean().optional(),
      })
      .parse(req.body ?? {});
    await assertStudOwner(req, id);

    const booking = await app.db.studBooking.findUnique({
      where: { id },
      select: {
        id: true,
        requestedByUserId: true,
        windowStart: true,
        damId: true,
        studListing: {
          select: { studFeeCents: true, dog: { select: { id: true, callName: true } } },
        },
      },
    });
    if (!booking) throw notFound('Booking not found');

    /**
     * Brucellosis has to be current on BOTH sides within about 30 days of the
     * mating. It is checked here rather than at request time because it is
     * judged against the window being booked, and because a test taken between
     * asking and answering should count. Overridable, deliberately: the stud
     * owner may have a certificate we have not seen, and this is a warning
     * about evidence, not a claim about the dog.
     */
    if (!body.overrideBrucellosis) {
      const stale: string[] = [];
      for (const [label, dogId] of [
        ['the dam', booking.damId],
        ['your stud', booking.studListing.dog.id],
      ] as const) {
        const claim = await app.db.verifiedClaim.findFirst({
          where: { dogId, claimType: 'BRUCELLOSIS' },
          orderBy: { testedAt: 'desc' },
          select: { testedAt: true, outcome: true },
        });
        const verdict = assessBrucellosis(claim, booking.windowStart);
        if (verdict.blocks) stale.push(`${label}: ${verdict.reason}`);
      }
      if (stale.length > 0) {
        throw conflict(stale.join(' '), { code: 'BRUCELLOSIS', overridable: true });
      }
    }

    // A deposit is taken on acceptance, not on request — until the owner has
    // agreed there is nothing to pay for.
    const depositCents = body.depositCents ?? booking.studListing.studFeeCents ?? 0;
    let chargeId: string | null = null;
    if (depositCents > 0) {
      const charge = await provider.charge({
        idempotencyKey: `booking-deposit-${booking.id}`,
        amountCents: depositCents,
        currency: 'USD',
        payerId: booking.requestedByUserId,
        description: `Stud booking deposit — ${booking.studListing.dog.callName}`,
        method: 'CARD',
      });
      if (charge.status === 'FAILED') throw badRequest(charge.failureMessage ?? 'The deposit was declined.');
      chargeId = charge.providerId;
    }

    try {
      return { booking: await acceptBooking(app.db, { bookingId: id, depositCents, depositChargeId: chargeId }) };
    } catch (e) {
      rethrow(e);
    }
  });

  app.post('/studs/bookings/:id/decline', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().max(1000).optional() }).parse(req.body ?? {});
    await assertStudOwner(req, id);
    try {
      return { booking: await declineBooking(app.db, id, reason) };
    } catch (e) {
      rethrow(e);
    }
  });

  app.post('/studs/bookings/:id/cancel', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().max(1000).optional() }).parse(req.body ?? {});
    await assertStudOwner(req, id);
    try {
      return { booking: await cancelBooking(app.db, id, reason) };
    } catch (e) {
      rethrow(e);
    }
  });

  /** The dam owner pulling their own request before a decision. */
  app.post('/studs/bookings/:id/withdraw', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const booking = await app.db.studBooking.findUnique({
      where: { id },
      select: { requestedByUserId: true },
    });
    if (!booking) throw notFound('Booking not found');
    if (booking.requestedByUserId !== user.id) throw forbidden('That is not your request.');
    try {
      return { booking: await withdrawBooking(app.db, id) };
    } catch (e) {
      rethrow(e);
    }
  });
}
