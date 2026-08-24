/**
 * Stud booking requests: request → accept/decline → deposit.
 *
 * The rule this file exists to hold: a listing's availability is DERIVED from
 * its accepted bookings, never set by hand. Every path that changes a booking
 * ends by recomputing `bookedThrough` and `availability` from the bookings that
 * actually exist, so the public listing cannot drift from the truth. A stud
 * advertised as open when it is committed wastes the one thing a dam owner
 * cannot get back — a season.
 */
import type { Prisma, PrismaClient, StudBookingStatus } from '@prisma/client';
import { bookedThrough, findConflicts, validateWindow, type HeldBooking } from '@stud/breeding';

export class BookingError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_WINDOW'
      | 'CONFLICT'
      | 'NOT_FOUND'
      | 'WRONG_STATE'
      | 'NOT_BOOKABLE',
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Windows that hold a listing: accepted, and not yet finished. */
async function acceptedWindows(db: Db, studListingId: string, excludeId?: string) {
  const rows = await db.studBooking.findMany({
    where: {
      studListingId,
      status: 'ACCEPTED',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, windowStart: true, windowEnd: true },
  });
  return rows.map<HeldBooking>((r) => ({ id: r.id, start: r.windowStart, end: r.windowEnd }));
}

/**
 * Recompute what the public listing says from the bookings that exist.
 *
 * Called after every state change. RETIRED and NOT_LISTED are left alone —
 * those are the owner's own decisions about whether the dog is offered at all,
 * which bookings have no business overriding.
 */
export async function recomputeBookedThrough(
  db: Db,
  studListingId: string,
  now = new Date(),
): Promise<Date | null> {
  const held = await acceptedWindows(db, studListingId);
  const through = bookedThrough(held, now);

  const listing = await db.studListing.findUnique({
    where: { id: studListingId },
    select: { availability: true },
  });
  if (!listing) throw new BookingError('No such stud listing.', 'NOT_FOUND');

  const ownerControlled = listing.availability === 'RETIRED' || listing.availability === 'NOT_LISTED';
  await db.studListing.update({
    where: { id: studListingId },
    data: {
      bookedThrough: through,
      ...(ownerControlled ? {} : { availability: through ? 'BOOKED' : 'AVAILABLE' }),
    },
  });
  return through;
}

export interface RequestBookingArgs {
  studListingId: string;
  damId: string;
  requestedByUserId: string;
  fromKennelId?: string | null;
  windowStart: Date;
  windowEnd: Date;
  method?: Prisma.StudBookingCreateInput['method'];
  message?: string | null;
  inquiryId?: string | null;
  now?: Date;
}

export async function requestBooking(db: PrismaClient, args: RequestBookingArgs) {
  const now = args.now ?? new Date();
  const window = { start: args.windowStart, end: args.windowEnd };

  const issues = validateWindow(window, now);
  if (issues.length > 0) {
    throw new BookingError(issues.map((i) => i.message).join(' '), 'INVALID_WINDOW');
  }

  const listing = await db.studListing.findUnique({
    where: { id: args.studListingId },
    select: { id: true, availability: true, publishedAt: true },
  });
  if (!listing) throw new BookingError('No such stud listing.', 'NOT_FOUND');
  if (!listing.publishedAt || listing.availability === 'RETIRED' || listing.availability === 'NOT_LISTED') {
    throw new BookingError('That stud is not taking bookings.', 'NOT_BOOKABLE');
  }

  // A request that already collides with an accepted booking is refused at the
  // door rather than left for the owner to decline — the dam owner finds out
  // now, while there is still time to ask someone else.
  const conflicts = findConflicts(window, await acceptedWindows(db, args.studListingId));
  if (conflicts.length > 0) {
    throw new BookingError('That stud is already booked across those dates.', 'CONFLICT');
  }

  return db.studBooking.create({
    data: {
      studListingId: args.studListingId,
      damId: args.damId,
      requestedByUserId: args.requestedByUserId,
      fromKennelId: args.fromKennelId ?? null,
      inquiryId: args.inquiryId ?? null,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      method: args.method ?? null,
      message: args.message ?? null,
      status: 'REQUESTED',
    },
  });
}

export interface AcceptBookingArgs {
  bookingId: string;
  depositCents?: number | null;
  /** Charge reference from the payment provider, when a deposit was taken. */
  depositChargeId?: string | null;
  now?: Date;
}

/**
 * Accept a request. Runs in a transaction with the conflict check, so two
 * owners clicking accept on overlapping windows cannot both win.
 */
export async function acceptBooking(db: PrismaClient, args: AcceptBookingArgs) {
  const now = args.now ?? new Date();
  return db.$transaction(async (tx) => {
    const booking = await tx.studBooking.findUnique({ where: { id: args.bookingId } });
    if (!booking) throw new BookingError('No such booking.', 'NOT_FOUND');
    if (booking.status !== 'REQUESTED') {
      throw new BookingError(`This booking is already ${booking.status.toLowerCase()}.`, 'WRONG_STATE');
    }

    const conflicts = findConflicts(
      { start: booking.windowStart, end: booking.windowEnd },
      await acceptedWindows(tx, booking.studListingId, booking.id),
    );
    if (conflicts.length > 0) {
      throw new BookingError('Another booking already covers those dates.', 'CONFLICT');
    }

    const updated = await tx.studBooking.update({
      where: { id: booking.id },
      data: {
        status: 'ACCEPTED',
        respondedAt: now,
        depositCents: args.depositCents ?? booking.depositCents,
        depositChargeId: args.depositChargeId ?? booking.depositChargeId,
        depositPaidAt: args.depositChargeId ? now : booking.depositPaidAt,
      },
    });
    await recomputeBookedThrough(tx, booking.studListingId, now);
    return updated;
  });
}

async function transition(
  db: PrismaClient,
  bookingId: string,
  to: StudBookingStatus,
  from: StudBookingStatus[],
  data: Prisma.StudBookingUpdateInput = {},
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const booking = await tx.studBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new BookingError('No such booking.', 'NOT_FOUND');
    if (!from.includes(booking.status)) {
      throw new BookingError(`This booking is ${booking.status.toLowerCase()}.`, 'WRONG_STATE');
    }
    const updated = await tx.studBooking.update({ where: { id: bookingId }, data: { status: to, ...data } });
    // Even a decline recomputes: it is how a listing returns to open after the
    // only thing holding it is called off.
    await recomputeBookedThrough(tx, booking.studListingId, now);
    return updated;
  });
}

export function declineBooking(db: PrismaClient, bookingId: string, reason?: string, now = new Date()) {
  return transition(db, bookingId, 'DECLINED', ['REQUESTED'], { respondedAt: now, declineReason: reason ?? null }, now);
}

export function withdrawBooking(db: PrismaClient, bookingId: string, now = new Date()) {
  return transition(db, bookingId, 'WITHDRAWN', ['REQUESTED'], { cancelledAt: now }, now);
}

export function cancelBooking(db: PrismaClient, bookingId: string, reason?: string, now = new Date()) {
  return transition(db, bookingId, 'CANCELLED', ['ACCEPTED'], { cancelledAt: now, declineReason: reason ?? null }, now);
}

export function completeBooking(db: PrismaClient, bookingId: string, now = new Date()) {
  return transition(db, bookingId, 'COMPLETED', ['ACCEPTED'], {}, now);
}
