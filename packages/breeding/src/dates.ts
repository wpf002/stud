/**
 * Date arithmetic for breeding.
 *
 * Every date in this package is treated as a calendar day in UTC, never a
 * timestamp. A whelp date is a day, not an instant, and a breeder in Denton
 * entering a heat start at 11pm must not get a date that is a day off.
 *
 * Pure module. No clock — callers pass `now` explicitly, so every prediction
 * is reproducible and testable.
 */

export const DAY_MS = 86_400_000;

/** Strip a date to its UTC calendar day. */
export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(startOfDay(d).getTime() + days * DAY_MS);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Inclusive range of calendar days. */
export function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const total = daysBetween(from, to);
  for (let i = 0; i <= total; i++) out.push(addDays(from, i));
  return out;
}

export function clampDate(d: Date, min: Date, max: Date): Date {
  if (d < min) return min;
  if (d > max) return max;
  return d;
}

/** Age in days on a given date. */
export function ageInDays(bornOn: Date, on: Date): number {
  return daysBetween(bornOn, on);
}

/** Age in whole weeks. Puppies are discussed in weeks until about four months. */
export function ageInWeeks(bornOn: Date, on: Date): number {
  return Math.floor(ageInDays(bornOn, on) / 7);
}
