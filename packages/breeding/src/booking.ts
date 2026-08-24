/**
 * Stud booking windows.
 *
 * A booking is a date RANGE, not a slot. A mating is tied to the female's
 * season — the fertile days are found by progesterone, not by a calendar — so
 * a dam owner asks for the window her bitch is expected to be in, and the
 * exact day is settled inside it. Modelling this as a single appointment would
 * be modelling the wrong thing, and would guarantee that every real booking
 * needed rescheduling.
 *
 * Pure, like the rest of this package: `now` is always passed in.
 */
import { DAY_MS, startOfDay } from './dates.js';

/** Shortest window worth calling a window. A single day is allowed. */
export const MIN_WINDOW_DAYS = 1;

/**
 * A season runs roughly three weeks, and the receptive part of it is a few
 * days inside that. A request longer than this is not a breeding window — it
 * is someone holding a stud open indefinitely, which is what the booked-through
 * date on the public listing exists to prevent.
 */
export const MAX_WINDOW_DAYS = 21;

export interface BookingWindow {
  start: Date;
  end: Date;
}

export interface WindowIssue {
  code: 'END_BEFORE_START' | 'IN_THE_PAST' | 'TOO_LONG';
  message: string;
}

/** Inclusive day count: a start and end on the same day is one day. */
export function windowDays(window: BookingWindow): number {
  return Math.round((startOfDay(window.end).getTime() - startOfDay(window.start).getTime()) / DAY_MS) + 1;
}

/**
 * What is wrong with a requested window, if anything. Returns every problem
 * rather than the first, so a form can show them together.
 */
export function validateWindow(window: BookingWindow, now: Date): WindowIssue[] {
  const issues: WindowIssue[] = [];
  const start = startOfDay(window.start);
  const end = startOfDay(window.end);

  if (end.getTime() < start.getTime()) {
    issues.push({ code: 'END_BEFORE_START', message: 'The window ends before it starts.' });
    return issues; // every other check would be noise
  }
  if (end.getTime() < startOfDay(now).getTime()) {
    issues.push({ code: 'IN_THE_PAST', message: 'That window has already passed.' });
  }
  const days = windowDays({ start, end });
  if (days > MAX_WINDOW_DAYS) {
    issues.push({
      code: 'TOO_LONG',
      message: `A booking window cannot be longer than ${MAX_WINDOW_DAYS} days.`,
    });
  }
  return issues;
}

/** Inclusive overlap: windows sharing a single day are in conflict. */
export function windowsOverlap(a: BookingWindow, b: BookingWindow): boolean {
  return (
    startOfDay(a.start).getTime() <= startOfDay(b.end).getTime() &&
    startOfDay(b.start).getTime() <= startOfDay(a.end).getTime()
  );
}

export interface HeldBooking extends BookingWindow {
  id: string;
}

/**
 * Accepted bookings a requested window collides with.
 *
 * Acceptance is exclusive for the window. A stud owner who has committed to a
 * dam for those days cannot also be committed to another, and the whole point
 * of publishing a booked-through date is that nobody wastes a request on a dog
 * that is already spoken for.
 */
export function findConflicts(
  requested: BookingWindow,
  accepted: readonly HeldBooking[],
): HeldBooking[] {
  return accepted.filter((held) => windowsOverlap(requested, held));
}

/**
 * The date a listing is booked through, or null if it is open.
 *
 * Derived from the accepted bookings rather than stored as a status somebody
 * remembers to update — a hand-maintained availability flag is one forgotten
 * edit away from advertising a stud that is not available.
 *
 * Past bookings are ignored: a window that has ended no longer blocks anything.
 */
export function bookedThrough(accepted: readonly BookingWindow[], now: Date): Date | null {
  const today = startOfDay(now).getTime();
  const future = accepted
    .map((b) => startOfDay(b.end))
    .filter((end) => end.getTime() >= today);
  if (future.length === 0) return null;
  return new Date(Math.max(...future.map((d) => d.getTime())));
}
