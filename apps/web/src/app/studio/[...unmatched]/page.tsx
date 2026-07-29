import { notFound } from 'next/navigation';

/**
 * Anything under /studio that matches no real page.
 *
 * Next only reaches a nested not-found.tsx when a segment calls notFound() —
 * an unmatched URL goes straight to the root one, which would drop a breeder
 * onto the marketing 404. This catch-all sits below every real route (static
 * and dynamic segments both win over it) and hands off to studio/not-found.
 */
export default function StudioUnmatched(): never {
  notFound();
}
