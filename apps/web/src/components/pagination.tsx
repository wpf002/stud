import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@stud/ui';

/**
 * Previous / next paging for the browse pages.
 *
 * Plain links, so this stays a server component and paginated results are in
 * the HTML a crawler receives rather than behind a click handler.
 *
 * Both browse APIs have always accepted take/skip and returned a total; the
 * pages just never sent them. With two seeded litters that was invisible.
 * Against the real dataset it meant 24 of 88 litters were reachable and the
 * other 64 were not addressable at all.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  /** Current filter params, without `page` — carried onto every page link. */
  params: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams(params);
    // Page 1 is the bare URL, so it never competes with itself in search.
    if (p <= 1) q.delete('page');
    else q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const linkClass =
    'inline-flex min-h-tap items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors';
  const enabled = 'text-ink-700 ring-1 ring-inset ring-bone-300 hover:bg-bone-200 hover:text-ink-900';
  const disabled = 'cursor-not-allowed text-ink-300 ring-1 ring-inset ring-bone-200';

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-between gap-4 border-t border-bone-300 pt-6"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={cn(linkClass, enabled)}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Link>
      ) : (
        <span aria-disabled className={cn(linkClass, disabled)}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </span>
      )}

      <p className="text-sm text-ink-500">
        Page {page} of {totalPages}
      </p>

      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" className={cn(linkClass, enabled)}>
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-disabled className={cn(linkClass, disabled)}>
          Next <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}

/** Clamp a `page` query param to a sane 1-based integer. */
export function pageFrom(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
