/**
 * Money is integer cents. Everywhere. Always. (Invariant 2.)
 *
 * These helpers exist so nobody is ever tempted to write `price / 100` inline
 * and land a float in a contract total.
 */

export type Cents = number;

export function dollarsToCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

export function formatCents(
  cents: Cents,
  opts: { currency?: string; locale?: string; compact?: boolean } = {},
): string {
  const { currency = 'USD', locale = 'en-US', compact = false } = opts;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: compact && cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Split `cents` into `n` parts without losing or inventing a penny.
 * Remainder is distributed one cent at a time from the front.
 */
export function splitCents(cents: Cents, n: number): Cents[] {
  if (n <= 0) throw new Error('splitCents: n must be positive');
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Percentage of an amount, rounded half-up, in cents. */
export function percentOfCents(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}
