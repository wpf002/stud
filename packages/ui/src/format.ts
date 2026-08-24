/** Presentation formatters shared by both surfaces. No business logic here. */

export function formatMoney(cents: number, opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.compact && cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(
  d: Date | string | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'numeric', day: 'numeric', year: '2-digit' }
      : style === 'long'
        ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', opts);
}

/**
 * A calendar date with no time in it — a booking window, a whelp date, a go-home
 * date. Rendered in UTC deliberately.
 *
 * Prisma returns a `@db.Date` column as midnight UTC. Formatting that with the
 * viewer's local timezone moves it backwards a day for anyone west of
 * Greenwich, so a stud accepted through the 7th advertised itself as booked
 * through the 6th — and the 7th looked free.
 */
export function formatDateOnly(
  d: Date | string | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'numeric', day: 'numeric', year: '2-digit' }
      : style === 'long'
        ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "3 days ago", "in 2 weeks". */
export function relativeTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

/** Dog age from DOB, in the units a breeder actually speaks: weeks then years. */
export function formatDogAge(dob: Date | string | null | undefined, at: Date = new Date()): string {
  if (!dob) return 'Age unknown';
  const born = typeof dob === 'string' ? new Date(dob) : dob;
  if (Number.isNaN(born.getTime())) return 'Age unknown';
  const days = Math.floor((at.getTime() - born.getTime()) / 86_400_000);
  if (days < 0) return 'Not yet born';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 120) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  if (days < 730) {
    const months = Math.floor(days / 30.44);
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  const years = Math.floor(days / 365.25);
  const rem = Math.floor((days - years * 365.25) / 30.44);
  return rem >= 1 ? `${years} yr ${rem} mo` : `${years} year${years === 1 ? '' : 's'}`;
}

export function formatDistance(miles: number | null | undefined): string {
  if (miles == null) return '—';
  if (miles < 1) return '< 1 mi';
  if (miles < 100) return `${Math.round(miles)} mi`;
  return `${Math.round(miles / 10) * 10} mi`;
}

/** COI is the number breeders squint at. Always one decimal, always a %. */
export function formatCoi(coi: number | null | undefined): string {
  if (coi == null || Number.isNaN(coi)) return '—';
  return `${(coi * 100).toFixed(1)}%`;
}

export function formatWeight(grams: number | null | undefined, unit: 'g' | 'oz' | 'lb' = 'g'): string {
  if (grams == null) return '—';
  if (unit === 'oz') return `${(grams / 28.3495).toFixed(1)} oz`;
  if (unit === 'lb') return `${(grams / 453.592).toFixed(2)} lb`;
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Words that stay lowercase inside a title, but not at either end. */
const MINOR = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'on', 'at', 'to', 'from',
  'by', 'of', 'in', 'with', 'as', 'per', 'into', 'over', 'up', 'off',
]);

/**
 * An enum or phrase as a person would write it: PICK_OF_LITTER → "Pick of
 * Litter". Every status chip in the app renders through this, which is why the
 * minor-word rule lives here rather than at each call site.
 */
export function titleCase(s: string): string {
  const words = s.toLowerCase().split(/[\s_]+/).filter(Boolean);
  return words
    .map((w, i) =>
      i > 0 && i < words.length - 1 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
